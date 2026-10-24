'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  action: (action, text) => ipcRenderer.send('assistant:action', { action, text }),
  subscribe: listener => { ipcRenderer.on('assistant:snapshot', (_event, value) => listener(value)); },
});
