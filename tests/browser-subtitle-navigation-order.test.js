'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
for (const kind of ['did-navigate', 'did-navigate-in-page']) {
  const handlers = {}, events = [];
  let visibleTracks = [], rendererUrl = 'https://video.test/old';
  const tab = { id: 'tab', mediaId: 'old', generation: 1, view: {}, playbackDiagnostics: { reset() {} } };
  const ctx = { restoreBrowserMediaSubtitlePreference() {}, tab, browserActiveTabId: 'tab',
    wc: { on: (name, fn) => { handlers[name] = fn; }, getURL: () => 'https://video.test/new', getTitle: () => 'Yeni video' },
    ADAPTER_REGISTRY: { mediaIdentity: () => ({ key: 'new', service: 'web', contentId: 'new' }) },
    syncBrowserTabCompatibilityForUrl() {}, applyStoredBrowserZoom() {}, rememberBrowserVisit() {}, scheduleBrowserSessionSave() {},
    stopBrowserManga() {}, stopBrowserPageTranslation() {}, publishBrowserPlaybackDiagnostics() {},
    resetBrowserPageCaptureState() {}, reportBrowserDrmSupport() {},
    browserNavigationStateForTab: () => ({ url: tab.restoredUrl, mediaId: tab.mediaId }),
    sendBrowserEvent(_tab, event) {
      events.push(event.type);
      if (event.type === 'navigation' && event.url !== rendererUrl) { visibleTracks = []; rendererUrl = event.url; }
      if (event.type === 'subtitle-found') visibleTracks.push(event.track);
    },
    resetBrowserCaptureState() {
      ctx.sendBrowserEvent(tab, { type: 'subtitle-found', track: 'en' });
      ctx.sendBrowserEvent(tab, { type: 'subtitle-found', track: 'tr' });
    },
  };
  const start = source.indexOf(`wc.on('${kind}',`);
  const end = source.indexOf("  wc.on('", start + 10);
  assert(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), ctx);
  handlers[kind]({}, 'https://video.test/new', true);
  assert.deepEqual(visibleTracks, ['en', 'tr'], `${kind}: kayıtlı altyazıları sonraki gezinme olayı silmemeli`);
  assert(events.indexOf('navigation') < events.indexOf('subtitle-found'));
}
console.log('Belge ve SPA gezinmesinde kayıtlı altyazı yayın sırası geçti.');
{
  const tab = { captureEnabled: false, overlay: { mode: 'both', offset: .2 }, diagnostics: { saved: true } };
  const ctx = { activeBrowserTab: () => tab, browserView: null, browserCaptureEnabled: true,
    browserOverlay: { mode: 'translation', offset: 0 }, browserDiagnostics: null };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function persistActiveBrowserTabState('), source.indexOf('function detachBrowserDebugger(')), ctx);
  ctx.persistActiveBrowserTabState();
  assert.equal(tab.overlay.mode, 'both', 'Yüklenmemiş sekmenin kayıtlı dil modu başlangıç varsayılanıyla ezilmemeli');
  assert.equal(tab.captureEnabled, false);
  tab.view = {}; ctx.browserView = {};
  ctx.persistActiveBrowserTabState();
  assert.equal(tab.overlay.mode, 'both', 'Başka görünümün durumu sekmeye yazılmamalı');
  ctx.browserView = tab.view;
  ctx.persistActiveBrowserTabState();
  assert.equal(tab.overlay, ctx.browserOverlay, 'Bağlı görünümde güncel tercihler kaydedilmeli');
}
console.log('İlk açılışta altyazı ve yakalama tercihleri korunuyor.');
