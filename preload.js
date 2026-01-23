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
  getRealtimeUrl: () => ipcRenderer.invoke('get-realtime-url'),
  startUpdate: () => ipcRenderer.send('start-update'),
  skipUpdate: () => ipcRenderer.send('skip-update'),
  quitAndInstall: (updatePath) => ipcRenderer.invoke('quit-and-install', updatePath),
  
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
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, data) => callback(data));
  },
  
  // Logout
  logout: () => ipcRenderer.send('logout'),
  
  // TruckersMP
  truckersmpVtc: () => ipcRenderer.invoke('truckersmp-vtc'),
  truckersmpPlayer: (id) => ipcRenderer.invoke('truckersmp-player', id),
  truckersmpServers: () => ipcRenderer.invoke('truckersmp-servers'),
  truckersmpPlayerOnline: (id) => ipcRenderer.invoke('truckersmp-player-online', id),
  saveTruckersmpId: (id) => ipcRenderer.invoke('save-truckersmp-id', id),
  getTruckersmpId: () => ipcRenderer.invoke('get-truckersmp-id'),
  
  // Discord Rich Presence
  updateDiscordPresence: (gameData) => ipcRenderer.invoke('update-discord-presence', gameData),
  getDriverLicenseConfig: () => ipcRenderer.invoke('get-driver-license-config'),
  launchTruckersmp: () => ipcRenderer.invoke('launch-truckersmp'),
  getTruckersmpLauncherPath: () => ipcRenderer.invoke('get-truckersmp-launcher-path'),
  selectTruckersmpLauncher: () => ipcRenderer.invoke('select-truckersmp-launcher'),
  
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
