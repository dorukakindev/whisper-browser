'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { normalizeCues, assembleCueSentences } = require('../src/browser-translation-scheduler');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main.js'), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function harness() {
  const wc = new EventEmitter();
  wc.getURL = () => 'https://video.test/new'; wc.getTitle = () => 'Yeni';
  const tab = { id: 'background', generation: 1, mediaId: 'old', view: { webContents: wc },
    overlay: { source: ['old'], translation: ['old'], mode: 'both', offset: .2 },
    playbackDiagnostics: { reset() {} } };
  const calls = { events: [], saved: 0, cancelled: 0 };
  class Scheduler {
    constructor(options) { this.options = options; }
    setSentences() {} updatePlayhead() {} completeAll() { return 1; }
    cancelAll() { calls.cancelled++; }
    snapshot() { return { results: [{ cues: [{ id: '1', start: 0, end: 1, text: 'Eski çeviri' }] }] }; }
  }
  const context = vm.createContext({ tab, wc, view: tab.view, Map, createHash,
    browserExtras: null,
    terminologyPrompt: require('../src/browser-terminology').terminologyPrompt,
    browserActiveTabId: 'foreground', browserOverlay: { source: ['foreground'] },
    browserNetworkOnline: true, browserLiveAsr: null, browserVisible: true, browserModalOccluded: false,
    normalizeCues, assembleCueSentences, BrowserTranslationScheduler: Scheduler,
    browserTranslationConfig: () => ({ targetLanguage: 'tr', model: 'test', endpoint: 'https://provider.test', glossary: {} }),
    browserWatchMediaId: item => item.mediaId, safeTranslationEndpoint: value => value,
    browserTranslationCache: () => null, requestBrowserSentenceTranslation() {},
    updateBrowserTranslationDiagnostics() {}, noteBrowserDiagnosticActivity() {},
    persistCompletedBrowserTranslation() { calls.saved++; },
    sendBrowserEvent: (_tab, event) => calls.events.push(event),
    isMainDocumentNavigation: details => details.isMainFrame && !details.isInPlace,
    suspendBrowserInstrumentationForNavigation() {}, randomUUID: () => 'new-token',
    stopBrowserManga() {}, stopBrowserPageTranslation() {}, stopBrowserLiveAsr() {},
    publishBrowserPlaybackDiagnostics() {}, browserNavigationStateForTab: () => ({}),
    ADAPTER_REGISTRY: { mediaIdentity: () => ({ key: 'new' }) },
    rememberBrowserVisit() {}, syncBrowserTabCompatibilityForUrl() {},
    restoreBrowserMediaSubtitlePreference() {}, applyStoredBrowserZoom() {}, scheduleBrowserSessionSave() {},
    resetBrowserCaptureState() {}, resetBrowserPageCaptureState: async () => {}, reportBrowserDrmSupport() {},
  });
  if (source.includes('function invalidateBrowserTabSubtitles(')) {
    vm.runInContext(slice('function invalidateBrowserTabSubtitles(', 'function resetBrowserCaptureState('), context);
  }
  vm.runInContext(slice('function startBrowserTranslation(', 'function persistCompletedBrowserTranslation('), context);
  for (const event of ['did-start-navigation', 'did-navigate-in-page']) {
    const start = source.indexOf(`wc.on('${event}',`);
    vm.runInContext(source.slice(start, source.indexOf("  wc.on('", start + 10)), context);
  }
  context.startBrowserTranslation(tab, [{ id: '1', start: 0, end: 1, text: 'Old sentence.' }], { trackId: 'source' });
  const scheduler = tab.translationScheduler;
  const deliver = () => {
    scheduler.options.onResult({ cues: [{ cueId: '1', text: 'Eski çeviri' }] }, {});
    scheduler.options.onState({ total: 1, completed: 1, pending: 0, queued: 0, failed: 0 });
  };
  return { tab, wc, calls, context, deliver, scheduler };
}
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message); }
}
for (const type of ['document', 'spa']) check(type + ': arka plan gezinmesi eski işi ve katmanı bırakır', () => {
  const h = harness();
  if (type === 'document') h.wc.emit('did-start-navigation', { isMainFrame: true });
  else h.wc.emit('did-navigate-in-page', {}, '', true);
  h.deliver();
  assert.equal(h.calls.cancelled, 1);
  assert.equal(h.calls.saved, 0);
  assert.equal(h.calls.events.some(event => event.type === 'translation-result'), false);
  assert.equal(h.tab.overlay.source.length + h.tab.overlay.translation.length, 0);
  assert.equal(h.tab.overlay.mode, 'both');
  assert.equal(h.context.browserOverlay.source[0], 'foreground');
});
for (const change of ['generation', 'mediaId', 'closing']) check(change + ': geç kalan sağlayıcı sonucu reddedilir', () => {
  const h = harness();
  if (change === 'generation') h.tab.generation++;
  else if (change === 'mediaId') h.tab.mediaId = 'new';
  else h.tab.closing = true;
  h.deliver(); assert.equal(h.calls.saved, 0);
  assert.equal(h.calls.events.some(event => event.type === 'translation-result'), false);
});
check('aynı videodaki arka plan çevirisi devam eder', () => {
  const h = harness(); h.deliver(); assert.equal(h.calls.saved, 1);
  assert.equal(h.calls.events.some(event => event.type === 'translation-result'), true);
});
check('iframe ve aynı medya SPA gezinmesi çeviriyi iptal etmez', () => {
  const h = harness(); h.context.ADAPTER_REGISTRY.mediaIdentity = () => ({ key: 'old' });
  h.wc.emit('did-start-navigation', { isMainFrame: false });
  h.wc.emit('did-navigate-in-page', {}, '', true); h.deliver();
  assert.equal(h.calls.cancelled, 0); assert.equal(h.calls.saved, 1);
});
if (failures) process.exitCode = 1;
