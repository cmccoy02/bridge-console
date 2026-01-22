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

  // OAuth
  getOAuthRedirectUri: () => ipcRenderer.invoke('get-oauth-redirect-uri'),
  onOAuthCallback: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('oauth-callback', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('oauth-callback', handler);
  },
  onOAuthError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('oauth-error', handler);
    return () => ipcRenderer.removeListener('oauth-error', handler);
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});
