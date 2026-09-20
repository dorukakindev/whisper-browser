const { contextBridge, ipcRenderer, webUtils } = require('electron');
// Sandboxed preload yerel CommonJS dosyalarını yükleyemez. Burayı bağımsız
// tut; ana süreçteki sınırla eşitlik preload-sandbox.test.js ile doğrulanır.
const MAX_SESSION_TABS = 24;
const RESOURCE_SOAK_MODE = typeof process !== 'undefined'
  && process.env && process.env.WHISPER_RESOURCE_SOAK === '1';

contextBridge.exposeInMainWorld('api', {
  resourceSoakMode: RESOURCE_SOAK_MODE,
  browserLimits: Object.freeze({ maxTabs: MAX_SESSION_TABS }),
  // Sürüklenen File nesnesinden gerçek disk yolu (Electron 32+'da file.path kaldırıldı)
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return file && file.path; }
  },
  selectVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  selectFolders: () => ipcRenderer.invoke('dialog:openFolders'),
  scanDroppedFiles: (files) => {
    const paths = Array.from(files || []).map((file) => {
      try { return webUtils.getPathForFile(file); } catch (_) { return ''; }
    }).filter(Boolean);
    return ipcRenderer.invoke('paths:scanMedia', paths);
  },
  listMediaFolder: (filePath) => ipcRenderer.invoke('media:listFolder', filePath),
  selectFile: (kind) => ipcRenderer.invoke('dialog:openFile', kind),
  selectInputFolder: () => ipcRenderer.invoke('dialog:openInputFolder'),
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  listHistory: () => ipcRenderer.invoke('history:list'),
  removeHistory: (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  listWatchLibrary: () => ipcRenderer.invoke('library:list'),
  mediaCatalog: (request) => ipcRenderer.invoke('media-catalog:request', request),
  updateWatchItem: (item) => ipcRenderer.invoke('library:upsert', item),
  removeWatchItem: (key) => ipcRenderer.invoke('library:remove', key),
  saveWatchItemBeforeClose: (item) => ipcRenderer.sendSync('library:upsert-before-close', item),
  onWatchFlushBeforeClose: (callback) => {
    const listener = (_event, token) => callback(token);
    ipcRenderer.on('library:flush-before-close', listener);
    return () => ipcRenderer.removeListener('library:flush-before-close', listener);
  },
  finishWatchFlushBeforeClose: (token) => ipcRenderer.send('library:flush-before-close-complete', token),
  searchWatchLibrary: (query) => ipcRenderer.invoke('library:search', query),
  cancelWatchLibrarySearch: () => ipcRenderer.send('library:search-cancel'),
  searchUnifiedLibrary: (query, scope = 'all', limit = 160) => ipcRenderer.invoke('library:searchUnified', { query, scope, limit }),
  listLibraryCollections: () => ipcRenderer.invoke('library:collections:list'),
  renameLibraryCollection: (from, to) => ipcRenderer.invoke('library:collections:rename', { from, to }),
  removeLibraryCollection: (name) => ipcRenderer.invoke('library:collections:remove', name),
  setLibraryCollectionMembership: (keys, name, member = true) => ipcRenderer.invoke('library:collections:membership', { keys, name, member }),
  reorderLibraryCollection: (name, keys) => ipcRenderer.invoke('library:collections:reorder', { name, keys }),
  listLearningAnnotations: (mediaId) => ipcRenderer.invoke('library:annotations:list', mediaId),
  toggleLearningAnnotation: (annotation, saved) => ipcRenderer.invoke('library:annotations:toggle', { annotation, saved }),
  restoreLearningAnnotationAnchor: (tabId, annotationId) => ipcRenderer.invoke('library:annotations:restoreAnchor', { tabId, annotationId }),
  listResearchAnnotations: (filters = {}, limit = 500) => ipcRenderer.invoke('browser:research:list', { filters, limit }),
  upsertResearchAnnotation: (annotation) => ipcRenderer.invoke('browser:research:upsert', annotation),
  reviewResearchAnnotation: (id, rating) => ipcRenderer.invoke('browser:research:review', { id, rating }),
  exportResearchAnnotations: (filters = {}, title = '') => ipcRenderer.invoke('browser:research:export', { filters, title }),
  exportResearchAnnotationsAnki: (filters = {}, deckName = '') => ipcRenderer.invoke('browser:research:exportAnki', { filters, deckName }),
  openLogFolder: () => ipcRenderer.invoke('logs:openFolder'),
  probeYoutube: (url, cookieBrowser) => ipcRenderer.invoke('media:probe', { url, cookieBrowser }),
  downloadYoutube: (opts) => ipcRenderer.invoke('media:download', opts),
  downloadYoutubeSubs: (opts) => ipcRenderer.invoke('media:downloadSubs', opts),
  findSiblingSubs: (videoPath) => ipcRenderer.invoke('media:findSiblingSubs', videoPath),
  authorizeHistoryFiles: (recordId) => ipcRenderer.invoke('history:authorizeFiles', recordId),
  cancelYoutubeDownload: () => ipcRenderer.invoke('media:cancelDownload'),
  // Invidious API (reklamsız/gizli YouTube — SmartTube/Piped arkasındaki altyapı)
  probeInvidious: (url, opts) => ipcRenderer.invoke('invidious:probe', url, opts || {}),
  downloadInvidiousSubs: (url, opts) => ipcRenderer.invoke('invidious:subs', url, opts || {}),
  downloadInvidiousStream: (opts) => ipcRenderer.invoke('invidious:downloadStream', opts || {}),
  cancelInvidious: () => ipcRenderer.invoke('invidious:cancel'),
  onInvidiousEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('invidious:event', wrapped);
    return () => ipcRenderer.removeListener('invidious:event', wrapped);
  },
  // Invidious ana sayfa + auth (SmartTube tarzı)
  invidiousFeed: (kind, opts) => ipcRenderer.invoke('invidious:feed', kind, opts || {}),
  invidiousSearch: (query, opts) => ipcRenderer.invoke('invidious:search', query, opts || {}),
  invidiousChannel: (channelId, opts) => ipcRenderer.invoke('invidious:channel', channelId, opts || {}),
  invidiousComments: (url, opts) => ipcRenderer.invoke('invidious:comments', url, opts || {}),
  invidiousPlaylist: (playlistId, opts) => ipcRenderer.invoke('invidious:playlist', playlistId, opts || {}),
  invidiousLogin: (username, password, instance) => ipcRenderer.invoke('invidious:login', { username, password, instance }),
  invidiousLogout: () => ipcRenderer.invoke('invidious:logout'),
  invidiousSession: () => ipcRenderer.invoke('invidious:session'),
  // YouTube OAuth — SmartTube'un gerçek cihaz-kodu akışı (google.com/device)
  youtubeSession: () => ipcRenderer.invoke('youtube:session'),
  youtubeSetClient: (clientId, clientSecret) => ipcRenderer.invoke('youtube:setClient', { clientId, clientSecret }),
  youtubeDeviceCode: () => ipcRenderer.invoke('youtube:deviceCode'),
  youtubePoll: () => ipcRenderer.invoke('youtube:poll'),
  youtubeBrowse: (browseId, opts) => ipcRenderer.invoke('youtube:browse', browseId, opts || {}),
  youtubeLogout: () => ipcRenderer.invoke('youtube:logout'),
  youtubeCancel: () => ipcRenderer.invoke('youtube:cancel'),
  onYoutubeEvent: (listener) => {
    ipcRenderer.on('youtube:event', listener);
    return () => ipcRenderer.removeListener('youtube:event', listener);
  },
  readSubtitle: (p) => ipcRenderer.invoke('media:readSubtitle', p),
  writeSubtitle: (path, text, change, expect) => ipcRenderer.invoke('media:writeSubtitle', { path, text, change, expect }),
  saveSubtitleCopy: (sourcePath, text) => ipcRenderer.invoke('media:saveSubtitleCopy', { sourcePath, text }),
  getWaveform: (path) => ipcRenderer.invoke('media:waveform', path),
  startWatchFolder: (dir, options) => ipcRenderer.invoke('watch:start', dir, options),
  stopWatchFolder: () => ipcRenderer.invoke('watch:stop'),
  reportWatchFile: (filePath, status) => ipcRenderer.invoke('watch:report', filePath, status),
  onWatchFiles: (cb) => {
    const listener = (_event, files) => cb(files);
    ipcRenderer.on('watch:newFiles', listener);
    return () => ipcRenderer.removeListener('watch:newFiles', listener);
  },
  onMediaEvent: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('media:event', listener);
    return () => ipcRenderer.removeListener('media:event', listener);
  },
  authorizeWatchItem: (key) => ipcRenderer.invoke('library:authorizeItem', key),
  showBrowser: (tabId, bounds) => ipcRenderer.invoke('browser:show', { tabId, bounds }),
  getBrowserGpuDiagnostics: () => ipcRenderer.invoke('browser:gpuDiagnostics'),
  hideBrowser: () => ipcRenderer.invoke('browser:hide'),
  setBrowserOccluded: (occluded) => ipcRenderer.invoke('browser:setOccluded', !!occluded),
  setBrowserBounds: (tabId, bounds) => ipcRenderer.invoke('browser:setBounds', { tabId, bounds }),
  navigateBrowser: (tabId, url) => ipcRenderer.invoke('browser:navigate', { tabId, url }),
  browserCommand: (tabId, command, value) => ipcRenderer.invoke('browser:command', { tabId, command, value }),
  browserExtras: (payload) => ipcRenderer.invoke('browser:extras', payload),
  getBrowserSponsorSegments: (tabId, url, categories, duration) => ipcRenderer.invoke('browser:sponsorBlock:get', { tabId, url, categories, duration }),
  getBrowserAdblockState: () => ipcRenderer.invoke('browser:adblock:getState'),
  setBrowserAdblockEnabled: (enabled) => ipcRenderer.invoke('browser:adblock:setEnabled', { enabled: enabled !== false }),
  getBrowserPlayerAdPruneState: () => ipcRenderer.invoke('browser:playerAdPrune:getState'),
  setBrowserPlayerAdPruneEnabled: (enabled) => ipcRenderer.invoke('browser:playerAdPrune:setEnabled', { enabled: enabled === true }),
  browserDownloads: (command = 'list', id) => ipcRenderer.invoke('browser:downloads', { command, id }),
  setBrowserReader: (tabId, action = 'toggle', preferences = {}) => ipcRenderer.invoke('browser:reader', { tabId, action, preferences }),
  getBrowserPermissions: (tabId, origin = '') => ipcRenderer.invoke('browser:permissions:get', { tabId, origin }),
  updateBrowserPermission: (tabId, origin, permission, decision) => ipcRenderer.invoke('browser:permissions:update', { tabId, origin, permission, decision }),
  respondBrowserPermission: (requestId, decision) => ipcRenderer.invoke('browser:permissions:respond', { requestId, decision }),
  getBrowserResources: () => ipcRenderer.invoke('browser:resources:snapshot'),
  setBrowserCaptureEnabled: (tabId, enabled) => ipcRenderer.invoke('browser:capture:setEnabled', { tabId, enabled }),
  setBrowserCompatibilityMode: (tabId, enabled) => ipcRenderer.invoke('browser:compatibility:setEnabled', { tabId, enabled }),
  createBrowserTab: () => ipcRenderer.invoke('browser:tab:create'),
  activateBrowserTab: (tabId) => ipcRenderer.invoke('browser:tab:activate', tabId),
  unloadBrowserTab: (tabId) => ipcRenderer.invoke('browser:tab:unload', tabId),
  closeBrowserTab: (tabId, force = false) => ipcRenderer.invoke('browser:tab:close', { tabId, force: !!force }),
  reopenBrowserTab: () => ipcRenderer.invoke('browser:tab:reopen'),
  setBrowserTabPinned: (tabId, pinned) => ipcRenderer.invoke('browser:tab:setPinned', tabId, !!pinned),
  reorderBrowserTabs: (tabIds) => ipcRenderer.invoke('browser:tab:reorder', tabIds),
  setBrowserTabGroup: (tabId, group) => ipcRenderer.invoke('browser:tab:setGroup', { tabId, group }),
  setBrowserSplit: (secondaryTabId = '', ratio = .5, enabled = true) => ipcRenderer.invoke('browser:split:set', { secondaryTabId, ratio, enabled }),
  getBrowserState: () => ipcRenderer.invoke('browser:getState'),
  listBrowserJobs: () => ipcRenderer.invoke('browser:jobs:list'),
  setBrowserSessionRestore: (enabled) => ipcRenderer.invoke('browser:session:setRestore', enabled),
  updateBrowserSessionTab: (tab) => ipcRenderer.invoke('browser:session:updateTab', tab),
  browserSubtitlePreference: (request) => ipcRenderer.invoke('browser:subtitle-preference', request),
  listBrowserPlaces: () => ipcRenderer.invoke('browser:places:list'),
  updateBrowserSiteProfile: (request) => ipcRenderer.invoke('browser:profile:update', request),
  toggleBrowserBookmark: (entry) => ipcRenderer.invoke('browser:places:toggleBookmark', entry),
  removeBrowserPlace: (kind, url) => ipcRenderer.invoke('browser:places:remove', kind, url),
  clearBrowserHistory: (scope = {}) => ipcRenderer.invoke('browser:places:clearHistory', scope && typeof scope === 'object' ? { site: scope.site || scope.url || '', before: Number(scope.before) || 0 } : {}),
  muteBrowserTab: (tabId) => ipcRenderer.invoke('browser:tab:mute', tabId),
  setBrowserBookmarkFolder: (url, folder) => ipcRenderer.invoke('browser:places:folder', url, folder),
  saveBrowserWorkspace: (name) => ipcRenderer.invoke('browser:workspace:save', name),
  openBrowserWorkspace: (name) => ipcRenderer.invoke('browser:workspace:open', name),
  removeBrowserWorkspace: (name) => ipcRenderer.invoke('browser:workspace:remove', name),
  clearBrowserSiteCookies: (url) => ipcRenderer.invoke('browser:cookies:clearSite', url),
  clearBrowserCookies: () => ipcRenderer.invoke('browser:cookies:clearAll'),
  resetBrowserSession: () => ipcRenderer.invoke('browser:session:reset'),
  exportBrowserSession: () => ipcRenderer.invoke('browser:session:export'),
  importBrowserSession: () => ipcRenderer.invoke('browser:session:import'),
  dismissBrowserRecovery: (tabId, recoveryId) => ipcRenderer.invoke('browser:session:dismissRecovery', { tabId, recoveryId }),
  setBrowserOverlay: (tabId, payload) => ipcRenderer.invoke('browser:setOverlay', { tabId, payload }),
  startBrowserManga: (tabId, payload) => ipcRenderer.invoke('browser:manga:start', { ...payload, tabId }),
  toggleBrowserManga: (tabId, visible) => ipcRenderer.invoke('browser:manga:toggle', { tabId, visible }),
  clearBrowserManga: (tabId) => ipcRenderer.invoke('browser:manga:clear', { tabId }),
  retrySelectedBrowserManga: (tabId) => ipcRenderer.invoke('browser:manga:retrySelected', { tabId }),
  retryFailedBrowserManga: (tabId) => ipcRenderer.invoke('browser:manga:retryFailed', { tabId }),
  exportBrowserManga: (tabId, format) => ipcRenderer.invoke('browser:manga:export', { tabId, format }),
  startBrowserPageTranslation: (tabId, payload) => ipcRenderer.invoke('browser:page:start', { ...payload, tabId }),
  getBrowserPageContext: (tabId) => ipcRenderer.invoke('browser:page:context', { tabId }),
  revealBrowserPageContext: (tabId, sourceId) => ipcRenderer.invoke('browser:page:reveal', { tabId, sourceId }),
  toggleBrowserPageTranslation: (tabId, visible) => ipcRenderer.invoke('browser:page:toggle', { tabId, visible }),
  setBrowserPageView: (tabId, view) => ipcRenderer.invoke('browser:page:view', { tabId, view }),
  setBrowserPageAutoContinue: (tabId, enabled) => ipcRenderer.invoke('browser:page:autoContinue', { tabId, enabled }),
  setBrowserPagePaused: (tabId, paused) => ipcRenderer.invoke('browser:page:pause', { tabId, paused }),
  previewBrowserPageTranslation: (tabId, payload) => ipcRenderer.invoke('browser:page:preview', { ...payload, tabId }),
  retryBrowserPageSection: (tabId, section) => ipcRenderer.invoke('browser:page:retrySection', { tabId, section }),
  setBrowserPageExclusions: (tabId, sections) => ipcRenderer.invoke('browser:page:exclusions', { tabId, sections }),
  getBrowserPageHistory: (tabId) => ipcRenderer.invoke('browser:page:history', { tabId }),
  clearBrowserPageTranslation: (tabId, clearMemory = false) => ipcRenderer.invoke('browser:page:clear', { tabId, clearMemory: clearMemory === true }),
  retryBrowserPageTranslation: (tabId) => ipcRenderer.invoke('browser:page:retryFailed', { tabId }),
  exportBrowserPageTranslation: (tabId, format) => ipcRenderer.invoke('browser:page:export', { tabId, format }),
  openPdf: (filePath = '') => ipcRenderer.invoke('pdf:open', { filePath }),
  getPdfState: (pdfHash, targetLanguage, model) => ipcRenderer.invoke('pdf:state', { pdfHash, targetLanguage, model }),
  translatePdfPages: (payload) => ipcRenderer.invoke('pdf:translatePages', payload),
  cancelPdfTranslation: (pdfHash) => ipcRenderer.invoke('pdf:cancel', { pdfHash }),
  exportPdfTranslation: (pdfHash, format, targetLanguage, model) => ipcRenderer.invoke('pdf:export', { pdfHash, format, targetLanguage, model }),
  captureBrowserPage: (tabId, options = {}) => ipcRenderer.invoke('browser:capturePage', { tabId, options }),
  archiveBrowserPage: (tabId) => ipcRenderer.invoke('browser:archivePage', { tabId }),
  exportBrowserPagePdf: (tabId) => ipcRenderer.invoke('browser:exportPagePdf', { tabId }),
  addBrowserReadingList: (tabId) => ipcRenderer.invoke('browser:readingList:add', { tabId }),
  listBrowserReadingList: () => ipcRenderer.invoke('browser:readingList:list', {}),
  removeBrowserReadingList: (id) => ipcRenderer.invoke('browser:readingList:remove', { id }),
  refreshBrowserReadingList: (tabId, id) => ipcRenderer.invoke('browser:readingList:refresh', { tabId, id }),
  openBrowserReadingList: (tabId, id) => ipcRenderer.invoke('browser:readingList:open', { tabId, id }),
  setBrowserPageIndexEnabled: (enabled) => ipcRenderer.invoke('browser:pageIndex:setEnabled', { enabled: enabled === true }),
  clearBrowserPageIndex: () => ipcRenderer.invoke('browser:pageIndex:clear'),
  startBrowserTranslation: (tabId, payload) => ipcRenderer.invoke('browser:translation:start', { ...payload, tabId }),
  reportBrowserTranslationDisplayed: (tabId, trackId, cueIds) =>
    ipcRenderer.invoke('browser:translation:displayed', { tabId, trackId, cueIds }),
  getBrowserTranslationSnapshot: (tabId) => ipcRenderer.invoke('browser:translation:snapshot', { tabId }),
  stopBrowserTranslation: (tabId) => ipcRenderer.invoke('browser:translation:stop', { tabId }),
  completeBrowserTranslation: (tabId) => ipcRenderer.invoke('browser:translation:completeAll', { tabId }),
  retryFailedBrowserTranslation: (tabId) => ipcRenderer.invoke('browser:translation:retryFailed', { tabId }),
  setBrowserNetworkOnline: (online) => ipcRenderer.invoke('browser:network:setOnline', online !== false),
  startBrowserLiveAsr: (tabId, options) => ipcRenderer.invoke('browser:liveAsr:start', { ...options, tabId }),
  sendBrowserLiveAsrChunk: (tabId, payload) => ipcRenderer.invoke('browser:liveAsr:chunk', { ...payload, tabId }),
  stopBrowserLiveAsr: () => ipcRenderer.invoke('browser:liveAsr:stop'),
  openBrowserAdapterFolder: () => ipcRenderer.invoke('browser:adapters:openFolder'),
  exportBrowserSubtitle: (payload) => ipcRenderer.invoke('browser:subtitle:export', payload),
  captureFullBrowserSubtitle: (tabId, action = 'start') =>
    ipcRenderer.invoke('browser:subtitle:captureFull', { tabId, action }),
  exportBrowserDiagnostics: () => ipcRenderer.invoke('browser:diagnostics:export'),
  exportBrowserClip: (payload) => ipcRenderer.invoke('browser:clip:export', payload),
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
  getModelStatus: () => ipcRenderer.invoke('models:status'),
  benchmarkModel: (options) => ipcRenderer.invoke('models:benchmark', options),
  cancelModelBenchmark: () => ipcRenderer.invoke('models:benchmark:cancel'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  testTranslationProvider: (payload) => ipcRenderer.invoke('translation:probe', payload),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  saveSettingsSync: (s) => ipcRenderer.sendSync('settings:saveSync', s),
  loadQueueState: () => ipcRenderer.invoke('queue:load'),
  saveQueueState: (snapshot) => ipcRenderer.invoke('queue:save', snapshot),
  saveQueueStateSync: (snapshot) => ipcRenderer.sendSync('queue:saveSync', snapshot),
  saveImage: (payload) => ipcRenderer.invoke('media:saveImage', payload),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  startTranscribe: (opts) => ipcRenderer.invoke('transcribe:start', opts),
  cancelTranscribe: () => ipcRenderer.invoke('transcribe:cancel'),
  updateYtdlp: () => ipcRenderer.invoke('maintenance:updateYtdlp'),
  shiftSubs: (filePath, offsetSec) => ipcRenderer.invoke('subs:shift', filePath, offsetSec),
  probeTracks: (filePath) => ipcRenderer.invoke('media:probeTracks', filePath),
  extractSubtitleTrack: (filePath, track) => ipcRenderer.invoke('media:extractSubtitleTrack', { filePath, track }),
  burnInStart: (videoPath, subPath, recoveryId = '') => ipcRenderer.invoke('burnin:start', videoPath, subPath, recoveryId),
  burnInCancel: () => ipcRenderer.invoke('burnin:cancel'),
  getBurnInRecovery: () => ipcRenderer.invoke('burnin:recovery:get'),
  recoverBurnIn: (id) => ipcRenderer.invoke('burnin:recovery:recover', id),
  discardBurnInRecovery: (id) => ipcRenderer.invoke('burnin:recovery:discard', id),
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
