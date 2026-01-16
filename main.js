const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');
const http = require('http');

let mainWindow;
let splashWindow;
let loginWindow;
let updateWindow;
let callbackServer;

// Discord OAuth2 yapılandırması
// Config dosyası varsa onu kullan, yoksa varsayılan değerleri kullan
let DISCORD_CONFIG;
try {
  const config = require('./config.js');
  DISCORD_CONFIG = {
    clientId: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    redirectUri: config.discord.redirectUri || 'http://localhost:3000/auth/callback',
    scopes: ['identify', 'email']
  };
} catch (error) {
  // Config dosyası yoksa varsayılan değerler
  DISCORD_CONFIG = {
    clientId: 'YOUR_DISCORD_CLIENT_ID', // main.js içinde veya config.js dosyasında ayarlayın
    clientSecret: 'YOUR_DISCORD_CLIENT_SECRET', // main.js içinde veya config.js dosyasında ayarlayın
    redirectUri: 'http://localhost:3000/auth/callback',
    scopes: ['identify', 'email']
  };
  console.warn('⚠️  config.js dosyası bulunamadı. Lütfen config.example.js dosyasını config.js olarak kopyalayıp Discord bilgilerinizi girin.');
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
    
    // Versiyon karşılaştırması
    const needsUpdate = compareVersions(latestVersion, currentVersion) > 0;
    
    if (needsUpdate) {
      console.log('Yeni sürüm bulundu:', latestVersion, 'Mevcut:', currentVersion);
      return { 
        update: true, 
        version: latestVersion,
        currentVersion: currentVersion,
        releaseNotes: response.data.body || '',
        downloadUrl: response.data.assets?.[0]?.browser_download_url || null
      };
    }
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

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
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
    // Hata durumunda da login ekranına geç (opsiyonel: hata durumunda engelleyebilirsiniz)
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
      }
      createLoginWindow();
    }, 3000);
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
    backgroundColor: '#1a1a2e',
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
      if (updateInfo.downloadUrl) {
        // GitHub'dan direkt indirme
        shell.openExternal(updateInfo.downloadUrl);
        // Kullanıcıya bilgi ver
        dialog.showMessageBox(updateWindow, {
          type: 'info',
          title: 'Güncelleme İndiriliyor',
          message: 'Güncelleme dosyası tarayıcınızda açıldı. İndirme tamamlandıktan sonra kurulumu yapın ve launcher\'ı yeniden başlatın.',
          buttons: ['Tamam']
        });
      } else {
        // Auto updater kullan
        await autoUpdater.checkForUpdatesAndNotify();
      }
    } catch (error) {
      console.error('Güncelleme indirme hatası:', error);
      dialog.showErrorBox('Güncelleme Hatası', 'Güncelleme indirilemedi: ' + error.message);
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
    backgroundColor: '#1a1a2e',
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
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        if (url.pathname === '/auth/callback') {
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
              if (oauthReject) oauthReject(error);
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

    // Port 3000'de dinle
    const port = 3000;
    server.listen(port, 'localhost', () => {
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
    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar 
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
      email: user.email,
      accessToken: accessToken
    };
  } catch (error) {
    console.error('Kullanıcı bilgisi hatası:', error.response?.data || error.message);
    throw new Error('Kullanıcı bilgileri alınamadı');
  }
}

function createMainWindow(userData) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    backgroundColor: '#0f0f1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Kullanıcı verilerini ana pencereye gönder
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('user-data', userData);
  });

  // İndirme linklerini varsayılan tarayıcıda aç
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
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
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (updateWindow) {
      updateWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Güncelleme indirildi');
    if (updateWindow) {
      updateWindow.webContents.send('update-downloaded', info);
    }
  });
  
  // Splash ekranını göster (güncelleme kontrolü içinde yapılacak)
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

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('discord-login', async () => {
  try {
    const userData = await handleDiscordOAuth();
    return { success: true, userData };
  } catch (error) {
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
