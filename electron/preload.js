const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('bridge', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getPaths: () => ipcRenderer.invoke('get-app-paths'),

  // External actions
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),

  // Dialogs
  showError: (title, message) => ipcRenderer.invoke('show-error-dialog', title, message),

  // Platform info
  platform: process.platform,
  isElectron: true,
});
