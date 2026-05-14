const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('docmapDesktop', {
  isDesktop: true,
  onBackendExit(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('docmap:backend-exit', listener);
    return () => ipcRenderer.removeListener('docmap:backend-exit', listener);
  },
  getCredentialStorageInfo() {
    return ipcRenderer.invoke('docmap:credentials:storage-info');
  },
  getCredentialSettings() {
    return ipcRenderer.invoke('docmap:credentials:get');
  },
  saveCredentialSettings(settings) {
    return ipcRenderer.invoke('docmap:credentials:save', settings);
  },
  clearCredentialSettings() {
    return ipcRenderer.invoke('docmap:credentials:clear');
  }
});
