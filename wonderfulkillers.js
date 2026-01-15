const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const fetch = require('node-fetch');
const extract = require('extract-zip');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STORE_DIR = path.join(app.getPath('userData'), 'wk');
const AUTH_PATH = path.join(STORE_DIR, 'auth.json');
const USERS_PATH = path.join(STORE_DIR, 'users.json');

let mainWindow = null;
let config = null;

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(p, data) {
  ensureStore();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    config = null;
    dialog.showErrorBox('Config Hatası', 'config.json okunamadı: ' + e.message);
  }
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  try { dialog.showErrorBox('Uygulama Hatası', String(err?.stack || err)); } catch {}
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  try { dialog.showErrorBox('Uygulama Hatası', String(reason)); } catch {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: '#0b0f17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => (mainWindow = null));
}

function sendToRenderer(channel, payload) {
  const w = getWin();
  if (w) w.webContents.send(channel, payload);
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;

  try {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
  } catch {}

  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => sendToRenderer('update:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendToRenderer('update:status', { state: 'available', info }));
  autoUpdater.on('update-not-available', (info) => sendToRenderer('update:status', { state: 'not-available', info }));
  autoUpdater.on('download-progress', (p) => sendToRenderer('update:download-progress', p));
  autoUpdater.on('update-downloaded', (info) => sendToRenderer('update:status', { state: 'downloaded', info }));
  autoUpdater.on('error', (err) => sendToRenderer('update:status', { state: 'error', error: String(err?.message || err) }));

  // Uygulama açılır açılmaz kontrol
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      sendToRenderer('update:status', { state: 'error', error: String(e?.message || e) });
    });
  }, 1500);

  // Arka planda periyodik kontrol
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getWin() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const all = BrowserWindow.getAllWindows();
  return all[0] || null;
}

// ---- Window controls (macOS tarzı butonlar için)
ipcMain.handle('win:minimize', () => { const w = getWin(); if (w) w.minimize(); });
ipcMain.handle('win:close', () => { const w = getWin(); if (w) w.close(); });
ipcMain.handle('win:toggleMaximize', () => {
  const w = getWin(); if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});

// ---- App update (electron-updater)
ipcMain.handle('update:checkNow', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
  await autoUpdater.checkForUpdates();
  return { ok: true };
});

ipcMain.handle('update:quitAndInstall', () => {
  if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

// ---- Auth storage
ipcMain.handle('auth:get', () => readJsonSafe(AUTH_PATH, null));

ipcMain.handle('auth:logout', () => {
  try { if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH); } catch {}
  return { ok: true };
});

function upsertRecentUser(user) {
  const list = readJsonSafe(USERS_PATH, []);
  const filtered = list.filter(u => u.id !== user.id);
  filtered.unshift({
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    lastLoginAt: Date.now()
  });
  writeJsonSafe(USERS_PATH, filtered.slice(0, 50));
}

ipcMain.handle('users:recent', () => readJsonSafe(USERS_PATH, []));

// ---- Discord OAuth (PKCE, client_secret yok)
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}
function randomVerifier() {
  // 43-128 chars
  return base64url(crypto.randomBytes(32));
}

let oauthServer = null;

ipcMain.handle('discord:login', async () => {
  if (!config) throw new Error('config.json yüklenemedi.');
  const d = config.discord || {};
  if (!d.client_id) throw new Error('discord.client_id eksik.');
  if (!d.redirect_uri) throw new Error('discord.redirect_uri eksik.');

  const redirectUri = d.redirect_uri;
  const redirectUrlObj = new URL(redirectUri);
  const port = Number(redirectUrlObj.port || d.redirect_port || 12345);
  const callbackPath = redirectUrlObj.pathname || '/callback';

  const scopes = (d.scopes || ['identify']).join(' ');
  const state = base64url(crypto.randomBytes(16));

  const usePkce = d.use_pkce !== false;
  const code_verifier = usePkce ? randomVerifier() : null;
  const code_challenge = usePkce ? base64url(sha256(code_verifier)) : null;

  if (oauthServer) { try { oauthServer.close(); } catch {} oauthServer = null; }

  const authUrl = new URL('https://discord.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', d.client_id);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  if (usePkce) {
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }

  oauthServer = http.createServer(async (req, res) => {
    try {
      const base = `${redirectUrlObj.protocol}//${redirectUrlObj.hostname}${redirectUrlObj.port ? `:${redirectUrlObj.port}` : ''}`;
      const u = new URL(req.url, base);

      if (u.pathname !== callbackPath) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OK');
        return;
      }

      const code = u.searchParams.get('code');
      const returnedState = u.searchParams.get('state');

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth doğrulama başarısız.');
        return;
      }

      const body = new URLSearchParams();
      body.set('client_id', d.client_id);
      body.set('grant_type', 'authorization_code');
      body.set('code', code);
      body.set('redirect_uri', redirectUri);
      if (usePkce) body.set('code_verifier', code_verifier);

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Token alınamadı: ' + JSON.stringify(tokenData));
        return;
      }

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userRes.json();

      writeJsonSafe(AUTH_PATH, {
        token: tokenData,
        user: userData,
        obtained_at: Date.now()
      });
      upsertRecentUser(userData);

      const w = getWin();
      if (w) w.webContents.send('discord:loggedIn', userData);

      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end("Giriş başarılı. Uygulamaya dönebilirsiniz.");
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Hata: ' + String(e?.stack || e));
    } finally {
      try { oauthServer.close(); } catch {}
      oauthServer = null;
    }
  });

  await new Promise((resolve, reject) => {
    oauthServer.listen(port, () => resolve());
    oauthServer.on('error', reject);
  });

  shell.openExternal(authUrl.toString());
  return { ok: true };
});

// ---- GitHub news / announcements (raw json)
function githubRawUrl(owner, repo, filePath) {
  // main varsayıldı; isterseniz config'e branch eklenir
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
}

ipcMain.handle('content:news', async () => {
  if (!config) throw new Error('config.json yüklenemedi.');
  const { owner, repo, news_path } = config.github || {};
  if (!owner || !repo || !news_path) return { items: [] };

  const url = githubRawUrl(owner, repo, news_path);
  const r = await fetch(url, { headers: { 'User-Agent': 'wk-launcher' } });
  if (!r.ok) return { items: [], error: `News HTTP ${r.status}` };
  const json = await r.json();
  return json;
});

ipcMain.handle('content:downloads', async () => {
  if (!config) throw new Error('config.json yüklenemedi.');
  const { owner, repo, downloads_path } = config.github || {};
  if (!owner || !repo || !downloads_path) return { items: [] };

  const url = githubRawUrl(owner, repo, downloads_path);
  const r = await fetch(url, { headers: { 'User-Agent': 'wk-launcher' } });
  if (!r.ok) return { items: [], error: `Downloads HTTP ${r.status}` };
  const json = await r.json();
  return json;
});

// ---- Download manager (zip indir + extract, progress)
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? require('https') : require('http');

    protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(() => {});
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(() => {});
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`İndirme başarısız. HTTP ${res.statusCode}`));
      }

      const total = Number(res.headers['content-length'] || 0);
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) {
          if (total > 0) onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
          else onProgress(-1); // bilinmiyor
        }
      });

      res.pipe(file);
      file.on('finish', () => file.close(() => { if (onProgress) onProgress(100); resolve(); }));
    }).on('error', (err) => {
      try { file.close(() => {}); } catch {}
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

ipcMain.handle('download:run', async (event, item) => {
  // item: { id, url, extract: true/false, targetDir, fileName }
  if (!item || !item.url || !item.id) throw new Error('Geçersiz indirme isteği.');

  const targetDir = item.targetDir
    ? path.resolve(STORE_DIR, 'downloads', item.targetDir)
    : path.resolve(STORE_DIR, 'downloads', item.id);

  const fileName = item.fileName || path.basename(new URL(item.url).pathname) || 'download.bin';
  const dest = path.join(targetDir, fileName);

  await downloadFile(item.url, dest, (p) => {
    event.sender.send('download:progress', { id: item.id, progress: p });
  });

  if (item.extract && fileName.toLowerCase().endsWith('.zip')) {
    await extract(dest, { dir: targetDir });
  }

  return { ok: true, path: dest, dir: targetDir };
});
