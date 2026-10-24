'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  action: (action, text, meta = {}) => ipcRenderer.send('assistant:action', { action, text, sourceToken: meta.sourceToken, requestId: meta.requestId }),
  subscribe: listener => { ipcRenderer.on('assistant:snapshot', (_event, value) => listener(value)); },
});
