'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  action: (action, text, meta = {}) => ipcRenderer.send('assistant:action', { action, text, sourceToken: meta.sourceToken, requestId: meta.requestId }),
  subscribe: listener => {
    if (typeof listener !== 'function') throw new TypeError('Snapshot listener must be a function.');
    const wrapped = (_event, value) => listener(value);
    ipcRenderer.on('assistant:snapshot', wrapped);
    return () => ipcRenderer.removeListener('assistant:snapshot', wrapped);
  },
});
