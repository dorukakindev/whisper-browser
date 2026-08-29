const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Sürüklenen File nesnesinden gerçek disk yolu (Electron 32+'da file.path kaldırıldı)
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return file && file.path; }
  },
  selectVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  selectFolders: () => ipcRenderer.invoke('dialog:openFolders'),
  scanMediaPaths: (paths) => ipcRenderer.invoke('paths:scanMedia', paths),
  selectFile: (kind) => ipcRenderer.invoke('dialog:openFile', kind),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  openLogFolder: () => ipcRenderer.invoke('logs:openFolder'),
  probeYoutube: (url) => ipcRenderer.invoke('media:probe', url),
  downloadYoutube: (opts) => ipcRenderer.invoke('media:download', opts),
  cancelYoutubeDownload: () => ipcRenderer.invoke('media:cancelDownload'),
  readSubtitle: (p) => ipcRenderer.invoke('media:readSubtitle', p),
  onMediaEvent: (cb) => ipcRenderer.on('media:event', (_e, data) => cb(data)),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getEnvInfo: () => ipcRenderer.invoke('app:getEnvInfo'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  startTranscribe: (opts) => ipcRenderer.invoke('transcribe:start', opts),
  cancelTranscribe: () => ipcRenderer.invoke('transcribe:cancel'),
  updateYtdlp: () => ipcRenderer.invoke('maintenance:updateYtdlp'),
  shiftSubs: (filePath, offsetSec) => ipcRenderer.invoke('subs:shift', filePath, offsetSec),
  probeTracks: (filePath) => ipcRenderer.invoke('media:probeTracks', filePath),
  burnInStart: (videoPath, subPath) => ipcRenderer.invoke('burnin:start', videoPath, subPath),
  burnInCancel: () => ipcRenderer.invoke('burnin:cancel'),
  onEvent: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('transcribe:event', listener);
    return () => ipcRenderer.removeListener('transcribe:event', listener);
  },
  onBurnInEvent: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('burnin:event', listener);
    return () => ipcRenderer.removeListener('burnin:event', listener);
  },
});
