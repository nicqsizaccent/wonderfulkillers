const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

let mainWindow;
let splashWindow;
let loginWindow;
let updateWindow;
let callbackServer;
let discordRpcClient = null;

const ASSETS = path.join(__dirname, 'assets');
const ICON_PATH = fs.existsSync(path.join(ASSETS, 'logo.ico')) ? path.join(ASSETS, 'logo.ico') : path.join(ASSETS, 'logo.png');

// Discord OAuth2 ve gerçek zamanlı yapılandırma
// Config dosyası varsa onu kullan, yoksa varsayılan değerleri kullan
let DISCORD_CONFIG;
let REALTIME_CONFIG;
try {
  const config = require('./config.js');
  const guildScopes = (config.discord?.guildId && config.discord?.roleIdToName) ? ['identify', 'email', 'guilds.members.read'] : ['identify', 'email'];
  DISCORD_CONFIG = {
    clientId: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    redirectUri: config.discord.redirectUri || 'http://localhost:3000/auth/callback',
    scopes: guildScopes
  };
  REALTIME_CONFIG = {
    wsUrl: (config.realtime && config.realtime.wsUrl) || process.env.REALTIME_WS_URL || 'ws://localhost:4000'
  };
} catch (error) {
  // Config dosyası yoksa varsayılan değerler
  DISCORD_CONFIG = {
    clientId: 'YOUR_DISCORD_CLIENT_ID',
    clientSecret: 'YOUR_DISCORD_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/auth/callback',
    scopes: ['identify', 'email']
  };
  REALTIME_CONFIG = {
    wsUrl: process.env.REALTIME_WS_URL || 'ws://localhost:4000'
  };
  console.warn('⚠️  config.js dosyası bulunamadı. Lütfen config.example.js dosyasını config.js olarak kopyalayıp Discord ve gerçek zamanlı sunucu bilgilerinizi girin.');
}

let realtimeServerStarted = false;
function startRealtimeServerIfNeeded() {
  try {
    const wsUrl = REALTIME_CONFIG.wsUrl;
    const parsed = new URL(wsUrl);
    const host = parsed.hostname;
    const port = parsed.port || '4000';
    if ((host === 'localhost' || host === '127.0.0.1') && !realtimeServerStarted) {
      process.env.PORT = port;
      require('./realtime-server.js');
      realtimeServerStarted = true;
    }
  } catch (e) {
    console.error('Gerçek zamanlı sunucu başlatılamadı:', e);
  }
}

// GitHub repository bilgileri
const GITHUB_REPO = {
  owner: 'nicqsizaccent',
  repo: 'wonderfulkillers'
};

// Auto updater yapılandırması
autoUpdater.setFeedURL({
  provider: 'github',
  owner: GITHUB_REPO.owner,
  repo: GITHUB_REPO.repo
});

// Güncelleme kontrolü - GitHub API ile
async function checkForUpdates() {
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const latestVersion = response.data.tag_name.replace('v', '').replace('V', '');
    const currentVersion = app.getVersion();
    
    console.log('GitHub\'dan alınan versiyon:', latestVersion);
    console.log('Mevcut versiyon:', currentVersion);
    
    // Versiyon karşılaştırması
    const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;
    
    if (needsUpdate) {
      console.log('✅ Yeni sürüm bulundu:', latestVersion, 'Mevcut:', currentVersion);
      return { 
        update: true, 
        version: latestVersion,
        currentVersion: currentVersion,
        releaseNotes: response.data.body || '',
        downloadUrl: response.data.assets?.[0]?.browser_download_url || null
      };
    }
    console.log('✅ Güncel sürüm kullanılıyor');
    return { update: false, currentVersion: currentVersion };
  } catch (error) {
    console.error('Güncelleme kontrolü hatası:', error);
    // Hata durumunda da güncelleme zorunluluğunu kontrol et
    return { update: false, error: error.message, currentVersion: app.getVersion() };
  }
}

// Versiyon karşılaştırma fonksiyonu
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  const maxLength = Math.max(v1parts.length, v2parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  return 0;
}

// GitHub'dan direkt indirme fonksiyonu
async function downloadUpdateFromGitHub(updateInfo) {
  if (!updateInfo.downloadUrl) {
    throw new Error('Güncelleme URL\'si bulunamadı');
  }

  const updatesDir = path.join(app.getPath('userData'), 'updates');
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }

  const downloadPath = path.join(updatesDir, `launcher-update-${updateInfo.version}.exe`);
  
  console.log('Güncelleme dosyası hedefi:', downloadPath);

  if (fs.existsSync(downloadPath)) {
    console.log('Güncelleme dosyası zaten mevcut, tekrar indirilmeyecek.');
    
    if (updateWindow) {
      updateWindow.webContents.send('download-progress', {
        percent: 100,
        transferred: 1,
        total: 1
      });

      updateWindow.webContents.send('update-downloaded', {
        version: updateInfo.version,
        path: downloadPath
      });
    }

    return downloadPath;
  }

  console.log('GitHub\'dan indiriliyor:', updateInfo.downloadUrl);
  console.log('İndirme yolu:', downloadPath);

  const response = await axios({
    method: 'GET',
    url: updateInfo.downloadUrl,
    responseType: 'stream',
    headers: {
      'Accept': 'application/octet-stream'
    }
  });

  const writer = fs.createWriteStream(downloadPath);
  const totalSize = parseInt(response.headers['content-length'] || '0', 10) || 0;
  let downloadedSize = 0;

  response.data.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
    
    if (updateWindow) {
      updateWindow.webContents.send('download-progress', {
        percent: percent,
        transferred: downloadedSize,
        total: totalSize
      });
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log('İndirme tamamlandı:', downloadPath);
      
      if (updateWindow) {
        updateWindow.webContents.send('update-downloaded', {
          version: updateInfo.version,
          path: downloadPath
        });
      }
      
      resolve(downloadPath);
    });

    writer.on('error', (error) => {
      console.error('İndirme hatası:', error);
      reject(error);
    });
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  splashWindow.loadFile('splash.html');
  
  // Güncelleme kontrolü yap
  checkForUpdates().then(updateInfo => {
    if (updateInfo.update) {
      // Güncelleme var - güncelleme ekranını göster
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.close();
        }
        createUpdateWindow(updateInfo);
      }, 2000);
    } else {
      // Güncelleme yok - login ekranına geç
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.close();
        }
        createLoginWindow();
      }, 3000);
    }
  }).catch(error => {
    console.error('Güncelleme kontrolü hatası:', error);
    // Hata durumunda bile güncelleme kontrolü yapmaya devam et
    // Ama kullanıcıya bilgi ver ve login ekranına geç (geliştirme için)
    // Production'da hata durumunda da güncelleme ekranı gösterilebilir
    dialog.showMessageBox(splashWindow || BrowserWindow.getFocusedWindow(), {
      type: 'warning',
      title: 'Güncelleme Kontrolü Hatası',
      message: 'Güncelleme kontrol edilemedi. İnternet bağlantınızı kontrol edin.\n\nDevam etmek için Tamam\'a tıklayın.',
      buttons: ['Tamam']
    }).then(() => {
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.close();
        }
        createLoginWindow();
      }, 1000);
    });
  });
}

// Güncelleme penceresi oluştur
function createUpdateWindow(updateInfo) {
  updateWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    transparent: false,
    resizable: false,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#4A2C00',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  updateWindow.loadFile('update.html');
  
  // Güncelleme bilgilerini gönder
  updateWindow.webContents.once('did-finish-load', () => {
    updateWindow.webContents.send('update-info', updateInfo);
  });

  // Güncelleme indirme başlat
  ipcMain.once('start-update', async () => {
    try {
      console.log('Güncelleme indirme başlatılıyor (GitHub API)...');
      await downloadUpdateFromGitHub(updateInfo);
    } catch (error) {
      console.error('Güncelleme indirme hatası:', error);
      let message = 'Güncelleme indirilemedi: ' + error.message;

      if (error.message && (error.message.includes('EPROTO') || error.message.toLowerCase().includes('ssl'))) {
        message +=
          '\n\nBu hata genellikle bilgisayarın SSL/TLS ayarlarından, antivirüs / güvenlik duvarından veya yanlış tarih/saat ayarından kaynaklanır.' +
          '\nLütfen sistem tarih/saatini ve antivirüs / proxy ayarlarını kontrol edin.';
      }

      const url = updateInfo.downloadUrl || 'GitHub Releases';
      message += '\n\nLütfen manuel olarak GitHub\'dan indirin:\n' + url;

      dialog.showErrorBox('Güncelleme Hatası', message);

      if (updateInfo.downloadUrl) {
        try {
          shell.openExternal(updateInfo.downloadUrl);
        } catch (openError) {
          console.error('Güncelleme linki tarayıcıda açılamadı:', openError);
        }
      }
    }
  });

  // Güncelleme atlandı - kullanıcı giriş yapamaz
  ipcMain.once('skip-update', () => {
    dialog.showMessageBox(updateWindow, {
      type: 'warning',
      title: 'Güncelleme Zorunlu',
      message: 'Launcher\'ı kullanmak için en son sürüme güncellemeniz gerekmektedir.',
      buttons: ['Tamam']
    });
  });
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 500,
    height: 700,
    frame: false,
    transparent: false,
    resizable: false,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#4A2C00',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  loginWindow.loadFile('login.html');
  
  // Login başarılı olduğunda ana pencereyi aç
  ipcMain.once('login-success', (event, userData) => {
    if (loginWindow) loginWindow.close();
    createMainWindow(userData);
  });
}

// Çıkış yap
ipcMain.on('logout', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  createLoginWindow();
});

// OAuth callback için global değişkenler
let oauthResolve;
let oauthReject;
let oauthTimeout;

async function handleDiscordOAuth() {
  return new Promise(async (resolve, reject) => {
    oauthResolve = resolve;
    oauthReject = reject;

    try {
      // Callback server'ı başlat
      await createCallbackServer();

      // OAuth URL'ini oluştur
      const authUrl = `https://discord.com/api/oauth2/authorize?` +
        `client_id=${DISCORD_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(DISCORD_CONFIG.redirectUri)}&` +
        `response_type=code&` +
        `scope=${DISCORD_CONFIG.scopes.join('%20')}`;

      // Varsayılan tarayıcıda aç
      shell.openExternal(authUrl);

      // Timeout (5 dakika)
      oauthTimeout = setTimeout(() => {
        if (callbackServer) {
          callbackServer.close();
        }
        oauthReject(new Error('Giriş zaman aşımına uğradı. Lütfen tekrar deneyin.'));
      }, 300000); // 5 dakika
    } catch (error) {
      oauthReject(error);
    }
  });
}

// Local HTTP server oluştur (callback için)
function createCallbackServer() {
  return new Promise((resolve, reject) => {
    let callbackUrl;
    try {
      callbackUrl = new URL(DISCORD_CONFIG.redirectUri);
    } catch (e) {
      return reject(new Error('Geçersiz Discord redirect URI yapılandırması'));
    }

    const callbackPath = callbackUrl.pathname || '/auth/callback';
    const port =
      callbackUrl.port
        ? parseInt(callbackUrl.port, 10)
        : callbackUrl.protocol === 'https:'
          ? 443
          : 3000;

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        if (url.pathname === callbackPath) {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          // Başarılı sayfası göster
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Giriş Başarılı</title>
              <style>
                body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16213e 100%);
                  color: white;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                }
                .container {
                  text-align: center;
                  padding: 40px;
                  background: rgba(26, 26, 46, 0.9);
                  border-radius: 20px;
                  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                }
                .success-icon {
                  font-size: 4rem;
                  margin-bottom: 20px;
                }
                h1 {
                  color: #667eea;
                  margin-bottom: 10px;
                }
                p {
                  color: #a0a0a0;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="success-icon">✅</div>
                <h1>Giriş Başarılı!</h1>
                <p>Bu pencereyi kapatabilirsiniz. Launcher'a dönebilirsiniz.</p>
              </div>
            </body>
            </html>
          `);

          // Server'ı kapat
          server.close();
          if (oauthTimeout) clearTimeout(oauthTimeout);

          if (error) {
            if (oauthReject) oauthReject(new Error(`Discord hatası: ${error}`));
            return;
          }

          if (code) {
            try {
              // Authorization code'u token ile değiştir
              const tokenData = await exchangeCodeForToken(code);
              const userData = await getUserData(tokenData.access_token);
              if (oauthResolve) oauthResolve(userData);
            } catch (error) {
              // Rol kontrolü hatası özel olarak işlenir
              if (error.message === 'REQUIRED_ROLE_MISSING') {
                if (oauthReject) oauthReject(new Error('REQUIRED_ROLE_MISSING'));
              } else {
                // Diğer hatalar için genel mesaj
                const errorMsg = error.message || 'Kullanıcı bilgileri alınamadı';
                if (oauthReject) oauthReject(new Error(errorMsg));
              }
            }
          } else {
            if (oauthReject) oauthReject(new Error('Authorization code alınamadı'));
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Internal Server Error');
        server.close();
        if (oauthTimeout) clearTimeout(oauthTimeout);
        if (oauthReject) oauthReject(error);
      }
    });

    server.listen(port, () => {
      console.log(`Callback server ${port} portunda dinliyor`);
      callbackServer = server;
      resolve();
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} zaten kullanımda. Lütfen başka bir port kullanın veya mevcut servisi durdurun.`);
        reject(new Error(`Port ${port} zaten kullanımda`));
      } else {
        reject(error);
      }
    });
  });
}

// Authorization code'u access token ile değiştir
async function exchangeCodeForToken(code) {
  try {
    const response = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: DISCORD_CONFIG.clientId,
        client_secret: DISCORD_CONFIG.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_CONFIG.redirectUri
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Token exchange hatası:', error.response?.data || error.message);
    throw new Error('Token alınamadı: ' + (error.response?.data?.error_description || error.message));
  }
}

// Discord API'den kullanıcı bilgilerini al
async function getUserData(accessToken) {
  try {
    const response = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const user = response.data;
    const displayName = user.global_name || user.username || user.username + (user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : '');

    // Guild üye bilgisi ve roller (guilds.members.read scope gerekir)
    let roles = [];
    let displayRoles = [];
    let isModerator = false;
    let hasRequiredRole = false;
    try {
      const cfg = require('./config.js');
      if (cfg.discord?.guildId) {
        const guildRes = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${cfg.discord.guildId}/member`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const memberRoles = guildRes.data.roles || [];
        roles = memberRoles;
        isModerator = (cfg.discord.moderatorRoleIds || []).some(rid => memberRoles.includes(rid));
        
        // Zorunlu rol kontrolü
        if (cfg.discord.requiredRoleId) {
          hasRequiredRole = memberRoles.includes(cfg.discord.requiredRoleId);
          if (!hasRequiredRole) {
            throw new Error('REQUIRED_ROLE_MISSING');
          }
        }
        
        if (cfg.discord.roleIdToName) {
          displayRoles = memberRoles
            .filter(rid => cfg.discord.roleIdToName[rid])
            .map(rid => cfg.discord.roleIdToName[rid]);
        }
      }
    } catch (e) {
      if (e.message === 'REQUIRED_ROLE_MISSING') {
        throw e; // Zorunlu rol hatası yukarı fırlatılacak
      }
      console.log('Guild/rol bilgisi alınamadı (opsiyonel):', e.message);
    }

    return {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      discriminator: user.discriminator,
      displayName,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
      email: user.email,
      accessToken: accessToken,
      roles,
      displayRoles,
      isModerator
    };
  } catch (error) {
    // Rol kontrolü hatası özel olarak işlenir
    if (error.message === 'REQUIRED_ROLE_MISSING') {
      throw error; // Rol hatası olduğu gibi fırlatılacak
    }
    console.error('Kullanıcı bilgisi hatası:', error.response?.data || error.message);
    throw new Error('Kullanıcı bilgileri alınamadı');
  }
}

function setDiscordPresence(gameData = null) {
  if (!DISCORD_CONFIG?.clientId || DISCORD_CONFIG.clientId === 'YOUR_DISCORD_CLIENT_ID') return;
  try {
    const RPC = require('discord-rpc');
    // Eğer zaten bir client varsa, onu kullan
    if (discordRpcClient) {
      let activity = {
        details: gameData?.details || 'WonderfulKillers ile oynuyor',
        state: gameData?.state || 'Launcher',
        largeImageKey: 'wk_logo',
        largeImageText: 'RePublic OF WonderfulKillers',
        smallImageKey: 'ets2',
        smallImageText: 'Euro Truck Simulator 2',
        buttons: [
          { label: 'WK\'ya Katıl', url: 'https://discord.gg/ZpbeDwD' },
          { label: 'WonderfulKillers VTC', url: 'https://truckersmp.com/vtc/53624' }
        ]
      };
      
      if (gameData) {
        if (gameData.country) activity.state = `${gameData.country} • ${gameData.truck || 'ETS2'}`;
        if (gameData.truck) activity.details = `${gameData.truck} ile sürüyor`;
      }
      
      discordRpcClient.setActivity(activity);
      return;
    }
    
    const client = new RPC.Client({ transport: 'ipc' });
    client.login({ clientId: DISCORD_CONFIG.clientId }).then(() => {
      let activity = {
        details: gameData?.details || 'WonderfulKillers ile oynuyor',
        state: gameData?.state || 'Launcher',
        largeImageKey: 'wk_logo',
        largeImageText: 'RePublic OF WonderfulKillers',
        smallImageKey: 'ets2',
        smallImageText: 'Euro Truck Simulator 2',
        buttons: [
          { label: 'WK\'ya Katıl', url: 'https://discord.gg/ZpbeDwD' },
          { label: 'WonderfulKillers VTC', url: 'https://truckersmp.com/vtc/53624' }
        ]
      };
      
      if (gameData) {
        if (gameData.country) activity.state = `${gameData.country} • ${gameData.truck || 'ETS2'}`;
        if (gameData.truck) activity.details = `${gameData.truck} ile sürüyor`;
      }
      
      client.setActivity(activity);
      discordRpcClient = client;
    }).catch(err => console.warn('Discord Rich Presence bağlantı:', err.message));
  } catch (e) {
    console.warn('Discord RPC modülü yüklenemedi:', e.message);
  }
}

// Oyun durumunu güncelle
ipcMain.handle('update-discord-presence', (_, gameData) => {
  setDiscordPresence(gameData);
});

function clearDiscordPresence() {
  if (discordRpcClient) {
    try { 
      discordRpcClient.clearActivity();
      discordRpcClient.destroy(); 
    } catch (e) {
      console.warn('Discord RPC temizleme hatası:', e.message);
    }
    discordRpcClient = null;
  }
}

function createMainWindow(userData) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#4A2C00',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('user-data', userData);
    setDiscordPresence(); // Başlangıçta basit presence
  });

  mainWindow.on('close', (event) => {
    // Discord Rich Presence'i temizle
    clearDiscordPresence();
    // Arka planda çalışmaması için tamamen kapat
    mainWindow = null;
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  // Uygulama adını ayarla (Görev Yöneticisi için)
  app.setName('RePublic OF WonderfulKillers');
  
  // Auto updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Güncelleme kontrol ediliyor...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Güncelleme mevcut:', info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Güncelleme yok');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto updater hatası:', err);
    // Hata durumunda da güncelleme ekranını göster (güncelleme zorunlu)
    if (updateWindow) {
      updateWindow.webContents.send('update-error', err.message);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log('İndirme ilerlemesi:', Math.round(progressObj.percent) + '%');
    if (updateWindow) {
      updateWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Güncelleme indirildi:', info.version);
    if (updateWindow) {
      updateWindow.webContents.send('update-downloaded', info);
    }
  });
  
  // Auto updater ayarları
  autoUpdater.autoDownload = false; // Manuel indirme başlatacağız
  autoUpdater.autoInstallOnAppQuit = true; // Uygulama kapanırken otomatik kur
  
  // Splash ekranını göster (güncelleme kontrolü içinde yapılacak)
  startRealtimeServerIfNeeded();
  createSplashWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  }
});

// IPC handlers
ipcMain.handle('check-updates', async () => {
  return await checkForUpdates();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-realtime-url', () => {
  return REALTIME_CONFIG.wsUrl;
});

// TruckersMP API ve Launcher
function getTruckersMpConfig() {
  try {
    const c = require('./config.js');
    return {
      vtcId: c.truckersmp?.vtcId ?? 53624,
      apiBase: c.truckersmp?.apiBase ?? 'https://api.truckersmp.com/v2',
      launcherPath: c.truckersmp?.launcherPath || ''
    };
  } catch (_) { return { vtcId: 53624, apiBase: 'https://api.truckersmp.com/v2', launcherPath: '' }; }
}

function findTruckersMpLauncher() {
  // Önce localStorage'dan kaydedilmiş yolu kontrol et
  const userDataPath = app.getPath('userData');
  const savedPathFile = path.join(userDataPath, 'truckersmp-launcher-path.txt');
  if (fs.existsSync(savedPathFile)) {
    try {
      const saved = fs.readFileSync(savedPathFile, 'utf8').trim();
      if (saved && fs.existsSync(saved)) return saved;
    } catch (e) {}
  }
  
  // Config'den kontrol et
  const { launcherPath } = getTruckersMpConfig();
  if (launcherPath && fs.existsSync(launcherPath)) return launcherPath;
  
  // Varsayılan konumları kontrol et (kullanıcının belirttiği konum öncelikli)
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'TruckersMP', 'Launcher.exe'),
    path.join(localAppData, 'TruckersMP', 'TruckersMP Launcher.exe'),
    path.join(localAppData, 'TruckersMP', 'TruckersMP.exe'),
    path.join(localAppData, 'TruckersMP', 'truckersmp-launcher.exe'),
    path.join(process.env.APPDATA || '', 'TruckersMP', 'Launcher.exe'),
    path.join(process.env.APPDATA || '', 'TruckersMP', 'TruckersMP Launcher.exe')
  ];
  for (const p of candidates) { 
    if (p && fs.existsSync(p)) {
      // Bulunan yolu kaydet
      try {
        fs.writeFileSync(savedPathFile, p, 'utf8');
      } catch (e) {}
      return p;
    }
  }
  return null;
}

ipcMain.handle('select-truckersmp-launcher', async () => {
  const result = await dialog.showOpenDialog(mainWindow || BrowserWindow.getFocusedWindow(), {
    title: 'TruckersMP Launcher Seç',
    filters: [
      { name: 'Executable', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }
  
  const selectedPath = result.filePaths[0];
  if (!fs.existsSync(selectedPath)) {
    return { ok: false, error: 'Dosya bulunamadı' };
  }
  
  // Yolu kaydet
  try {
    const userDataPath = app.getPath('userData');
    const savedPathFile = path.join(userDataPath, 'truckersmp-launcher-path.txt');
    fs.writeFileSync(savedPathFile, selectedPath, 'utf8');
  } catch (e) {
    console.error('Yol kaydedilemedi:', e);
  }
  
  return { ok: true, path: selectedPath };
});

ipcMain.handle('launch-truckersmp', async () => {
  // Direkt ETS2'yi başlat (TruckersMP üzerinden)
  try {
    // Steam üzerinden ETS2'yi başlat
    const steamProtocol = 'steam://run/227300//-nointro -homedir "%USERPROFILE%\\Documents\\Euro Truck Simulator 2"';
    const err = await shell.openExternal(steamProtocol);
    if (err) {
      // Steam yoksa, ETS2 exe'sini direkt başlatmayı dene
      const programFiles = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)';
      const ets2Paths = [
        path.join(programFiles, 'Steam', 'steamapps', 'common', 'Euro Truck Simulator 2', 'bin', 'win_x64', 'eurotrucks2.exe'),
        path.join(programFiles, 'Steam', 'steamapps', 'common', 'Euro Truck Simulator 2', 'bin', 'win_x86', 'eurotrucks2.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Euro Truck Simulator 2', 'bin', 'win_x64', 'eurotrucks2.exe')
      ];
      
      for (const ets2Path of ets2Paths) {
        if (fs.existsSync(ets2Path)) {
          const err2 = await shell.openPath(ets2Path);
          return { ok: !err2, error: err2 || undefined };
        }
      }
      
      return { ok: false, error: 'ETS2_NOT_FOUND' };
    }
    return { ok: true };
  } catch (e) { 
    return { ok: false, error: e.message }; 
  }
});

ipcMain.handle('get-truckersmp-launcher-path', () => findTruckersMpLauncher());

ipcMain.handle('truckersmp-vtc', async () => {
  const { vtcId, apiBase } = getTruckersMpConfig();
  try {
    const { data } = await axios.get(`${apiBase}/vtc/${vtcId}`, { timeout: 10000 });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message, data: null }; }
});

ipcMain.handle('truckersmp-player', async (_, playerId) => {
  if (!playerId) return { ok: false, error: 'Player ID gerekli', data: null };
  const { apiBase } = getTruckersMpConfig();
  try {
    const { data } = await axios.get(`${apiBase}/player/${playerId}`, { timeout: 10000 });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message, data: null }; }
});

// TruckersMP ID'yi kalıcı olarak kaydet
ipcMain.handle('save-truckersmp-id', (_, playerId) => {
  try {
    const userDataPath = app.getPath('userData');
    const savedIdFile = path.join(userDataPath, 'truckersmp-id.txt');
    if (playerId) {
      fs.writeFileSync(savedIdFile, String(playerId), 'utf8');
    } else {
      if (fs.existsSync(savedIdFile)) fs.unlinkSync(savedIdFile);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// TruckersMP ID'yi kalıcı olarak oku
ipcMain.handle('get-truckersmp-id', () => {
  try {
    const userDataPath = app.getPath('userData');
    const savedIdFile = path.join(userDataPath, 'truckersmp-id.txt');
    if (fs.existsSync(savedIdFile)) {
      const id = fs.readFileSync(savedIdFile, 'utf8').trim();
      return { ok: true, id: id || null };
    }
    return { ok: true, id: null };
  } catch (e) {
    return { ok: false, error: e.message, id: null };
  }
});

ipcMain.handle('truckersmp-servers', async () => {
  const { apiBase } = getTruckersMpConfig();
  try {
    const { data } = await axios.get(`${apiBase}/servers`, { timeout: 10000 });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message, data: null }; }
});

ipcMain.handle('truckersmp-player-online', async (_, playerId) => {
  if (!playerId) return { ok: false, error: 'Player ID gerekli', data: null };
  const { apiBase } = getTruckersMpConfig();
  try {
    // TruckersMP API'den oyuncu bilgilerini al (online durumu dahil)
    const { data } = await axios.get(`${apiBase}/player/${playerId}`, { timeout: 10000 });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message, data: null }; }
});

ipcMain.handle('get-driver-license-config', () => {
  try {
    const c = require('./config.js');
    return { tiers: c.driverLicenseTiers || [], roleIds: c.driverLicenseRoleIds || {} };
  } catch (_) { return { tiers: [], roleIds: {} }; }
});

ipcMain.handle('quit-and-install', async (event, updatePath) => {
  try {
    if (updatePath && fs.existsSync(updatePath)) {
      // GitHub'dan indirilen dosyayı çalıştır
      console.log('Güncelleme kurulumu başlatılıyor:', updatePath);
      
      // Tüm pencereleri kapat
      BrowserWindow.getAllWindows().forEach(window => {
        window.close();
      });
      
      // Kısa bir bekleme süresi (dosyaların serbest bırakılması için)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Windows'ta installer'ı çalıştır
      if (process.platform === 'win32') {
        try {
          console.log('Installer açılıyor (shell.openPath):', updatePath);
          const result = await shell.openPath(updatePath);
          if (result) {
            console.error('Installer açılamadı:', result);
            dialog.showErrorBox(
              'Kurulum Hatası',
              'Installer açılamadı: ' + result + '\n\nLütfen dosyayı manuel olarak çalıştırın:\n' + updatePath
            );
            return;
          }
        } catch (shellError) {
          console.error('Installer başlatma hatası:', shellError);
          dialog.showErrorBox(
            'Kurulum Hatası',
            'Installer başlatılamadı: ' + shellError.message + '\n\nLütfen dosyayı manuel olarak çalıştırın:\n' + updatePath
          );
          return;
        }

        dialog.showMessageBox({
          type: 'info',
          title: 'Güncelleme Başlatıldı',
          message: 'Güncelleme kurulumu başlatıldı.\nKurulum sihirbazını tamamladıktan sonra launcher\'ı tekrar açabilirsiniz.'
        });
      } else {
        // Diğer platformlar için
        try {
          const result = await shell.openPath(updatePath);
          if (result) {
            console.error('Installer açılamadı:', result);
            dialog.showErrorBox(
              'Kurulum Hatası',
              'Installer açılamadı: ' + result + '\n\nLütfen dosyayı manuel olarak çalıştırın:\n' + updatePath
            );
            return;
          }
        } catch (shellError) {
          console.error('Installer başlatma hatası:', shellError);
          dialog.showErrorBox(
            'Kurulum Hatası',
            'Installer başlatılamadı: ' + shellError.message + '\n\nLütfen dosyayı manuel olarak çalıştırın:\n' + updatePath
          );
          return;
        }

        dialog.showMessageBox({
          type: 'info',
          title: 'Güncelleme Başlatıldı',
          message: 'Güncelleme kurulumu başlatıldı.\nKurulum sihirbazını tamamladıktan sonra launcher\'ı tekrar açabilirsiniz.'
        });
      }
    } else {
      // electron-updater kullan (en güvenilir yöntem)
      // Bu otomatik olarak launcher'ı kapatır ve kurulumu başlatır
      autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
    }
  } catch (error) {
    console.error('Kurulum hatası:', error);
    dialog.showErrorBox('Kurulum Hatası', 'Güncelleme kurulamadı: ' + error.message + '\n\nLütfen launcher\'ı kapatıp installer\'ı manuel olarak çalıştırın.');
  }
});

ipcMain.handle('discord-login', async () => {
  try {
    const userData = await handleDiscordOAuth();
    return { success: true, userData };
  } catch (error) {
    // Rol kontrolü hatası özel olarak işlenir
    if (error.message === 'REQUIRED_ROLE_MISSING') {
      return { success: false, error: 'REQUIRED_ROLE_MISSING' };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('minimize-window', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.minimize();
});

ipcMain.handle('maximize-window', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.close();
});
