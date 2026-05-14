const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('docmapDesktop', {
  onBackendExit(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('docmap:backend-exit', listener);
    return () => ipcRenderer.removeListener('docmap:backend-exit', listener);
  }
});
