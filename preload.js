const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Called when 0+0= is triggered — starts Stock servers on demand
  startStockServers: () => ipcRenderer.invoke('start-stock-servers'),
  serversReady: () => ipcRenderer.invoke('servers-ready'),
  // Check if a server is reachable via Node.js (reliable unlike browser fetch)
  checkServer: (url) => ipcRenderer.invoke('check-server', url),

  // Data encryption/decryption
  encryptData: (data) => ipcRenderer.invoke('encrypt-data', data),
  decryptData: (encryptedData) => ipcRenderer.invoke('decrypt-data', encryptedData),

  // Update notifications
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // Platform detection
  platform: process.platform,
  isElectron: true,

  generateSecureId: () => {
    return require('crypto').randomBytes(16).toString('hex');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const scripts = document.querySelectorAll('script[src]');
  scripts.forEach(script => {
    if (script.src && !script.src.startsWith('http://localhost') &&
        !script.src.startsWith('file://')) {
      script.remove();
    }
  });
});