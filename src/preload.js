const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Sürüklenen File nesnesinden gerçek disk yolu (Electron 32+'da file.path kaldırıldı)
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return file && file.path; }
  },
  selectVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  selectFolders: () => ipcRenderer.invoke('dialog:openFolders'),
  scanMediaPaths: (paths) => ipcRenderer.invoke('paths:scanMedia', paths),
  listMediaFolder: (filePath) => ipcRenderer.invoke('media:listFolder', filePath),
  selectFile: (kind) => ipcRenderer.invoke('dialog:openFile', kind),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  listHistory: () => ipcRenderer.invoke('history:list'),
  removeHistory: (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  listWatchLibrary: () => ipcRenderer.invoke('library:list'),
  updateWatchItem: (item) => ipcRenderer.invoke('library:upsert', item),
  removeWatchItem: (key) => ipcRenderer.invoke('library:remove', key),
  searchWatchLibrary: (query) => ipcRenderer.invoke('library:search', query),
  openLogFolder: () => ipcRenderer.invoke('logs:openFolder'),
  probeYoutube: (url, cookieBrowser) => ipcRenderer.invoke('media:probe', { url, cookieBrowser }),
  downloadYoutube: (opts) => ipcRenderer.invoke('media:download', opts),
  downloadYoutubeSubs: (opts) => ipcRenderer.invoke('media:downloadSubs', opts),
  findSiblingSubs: (videoPath) => ipcRenderer.invoke('media:findSiblingSubs', videoPath),
  cancelYoutubeDownload: () => ipcRenderer.invoke('media:cancelDownload'),
  readSubtitle: (p) => ipcRenderer.invoke('media:readSubtitle', p),
  writeSubtitle: (path, text) => ipcRenderer.invoke('media:writeSubtitle', { path, text }),
  saveSubtitleCopy: (sourcePath, text) => ipcRenderer.invoke('media:saveSubtitleCopy', { sourcePath, text }),
  getWaveform: (path) => ipcRenderer.invoke('media:waveform', path),
  startWatchFolder: (dir, options) => ipcRenderer.invoke('watch:start', dir, options),
  stopWatchFolder: () => ipcRenderer.invoke('watch:stop'),
  onWatchFiles: (cb) => ipcRenderer.on('watch:newFiles', (_e, files) => cb(files)),
  onMediaEvent: (cb) => ipcRenderer.on('media:event', (_e, data) => cb(data)),
  showBrowser: (bounds) => ipcRenderer.invoke('browser:show', bounds),
  hideBrowser: () => ipcRenderer.invoke('browser:hide'),
  setBrowserBounds: (bounds) => ipcRenderer.invoke('browser:setBounds', bounds),
  navigateBrowser: (url) => ipcRenderer.invoke('browser:navigate', url),
  browserCommand: (command, value) => ipcRenderer.invoke('browser:command', command, value),
  getBrowserState: () => ipcRenderer.invoke('browser:getState'),
  listBrowserPlaces: () => ipcRenderer.invoke('browser:places:list'),
  toggleBrowserBookmark: (entry) => ipcRenderer.invoke('browser:places:toggleBookmark', entry),
  removeBrowserPlace: (kind, url) => ipcRenderer.invoke('browser:places:remove', kind, url),
  clearBrowserHistory: () => ipcRenderer.invoke('browser:places:clearHistory'),
  clearBrowserSiteCookies: (url) => ipcRenderer.invoke('browser:cookies:clearSite', url),
  clearBrowserCookies: () => ipcRenderer.invoke('browser:cookies:clearAll'),
  resetBrowserSession: () => ipcRenderer.invoke('browser:session:reset'),
  setBrowserOverlay: (payload) => ipcRenderer.invoke('browser:setOverlay', payload),
  exportBrowserSubtitle: (payload) => ipcRenderer.invoke('browser:subtitle:export', payload),
  onBrowserEvent: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('browser:event', listener);
    return () => ipcRenderer.removeListener('browser:event', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  getEnvInfo: () => ipcRenderer.invoke('app:getEnvInfo'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  saveImage: (payload) => ipcRenderer.invoke('media:saveImage', payload),
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
