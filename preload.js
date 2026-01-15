const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wk', {
  // window
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winToggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),

  // auth
  discordLogin: () => ipcRenderer.invoke('discord:login'),
  onDiscordLoggedIn: (cb) => ipcRenderer.on('discord:loggedIn', (_, user) => cb(user)),
  authGet: () => ipcRenderer.invoke('auth:get'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  // users
  usersRecent: () => ipcRenderer.invoke('users:recent'),

  // content
  newsGet: () => ipcRenderer.invoke('content:news'),
  downloadsGet: () => ipcRenderer.invoke('content:downloads'),

  // downloads
  downloadRun: (item) => ipcRenderer.invoke('download:run', item),
  onDownloadProgress: (cb) => ipcRenderer.on('download:progress', (_, data) => cb(data)),

  // updates
  updateCheckNow: () => ipcRenderer.invoke('update:checkNow'),
  updateQuitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_, data) => cb(data)),
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update:download-progress', (_, data) => cb(data))
});
