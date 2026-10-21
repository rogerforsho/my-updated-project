const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFileToFolder: (folderPath, fileName, fileData) => ipcRenderer.invoke('save-file', { folderPath, fileName, fileData }),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  toggleMiniWidget: (enable) => ipcRenderer.send('toggle-mini-widget', enable),
  retryConnection: () => ipcRenderer.send('retry-connection'),
  onPortalConnectionState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('portal-connection-state', listener);
    return () => ipcRenderer.removeListener('portal-connection-state', listener);
  },
});
