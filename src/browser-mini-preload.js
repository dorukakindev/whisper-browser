const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mini', { command: action => ipcRenderer.invoke('browser:mini:command', action) });
