const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  // Login
  onLoginSuccess: (callback) => {
    ipcRenderer.on('login-success', (event, data) => callback(data));
  },
  sendLoginSuccess: (data) => ipcRenderer.send('login-success', data),
  
  // Discord OAuth
  discordLogin: () => ipcRenderer.invoke('discord-login'),
  
  // User data
  onUserData: (callback) => {
    ipcRenderer.on('user-data', (event, data) => callback(data));
  },
  
  // Updates
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  startUpdate: () => ipcRenderer.send('start-update'),
  skipUpdate: () => ipcRenderer.send('skip-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  
  // Update events
  onUpdateInfo: (callback) => {
    ipcRenderer.on('update-info', (event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, data) => callback(data));
  },
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
