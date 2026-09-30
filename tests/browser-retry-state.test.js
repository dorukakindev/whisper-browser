'use strict';
// R306: Hata diyaloğu yeniden-deneme durum temizliği.
// - loadRetryAttempt yeni gezinmeye sızmasın (kullanıcı geçişi sıfırlar,
//   zamanlayıcı reload'u korur), çökme sonrası görünüm sıfırlasın.
// - manga-state 'idle' olayları retryable:0 taşısın (renderer bayat sayıyı
//   'Başarısızları yeniden dene (N)' düğmesinde göstermesin).
// R307: Bellekten boşaltılan sekme yeniden-deneme/çökme bütçesini sıfırlar;
// dirilen sekme ilk hatasında taze bütçeyle yeniden denenir.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { randomUUID } = require('crypto');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const { navigationRetryPolicy } = require('../src/browser-lifecycle-policy.js');

function extractListener(name) {
  const start = main.indexOf(`wc.on('${name}'`);
  assert.ok(start >= 0, `${name} dinleyicisi bulunamadı`);
  const end = main.indexOf('\n  });', start);
  assert.ok(end > start, `${name} dinleyicisi sınırı bulunamadı`);
  return main.slice(start, end + 6);
}

// Sözleşme kilidi: sıfırlama noktaları yerinde duruyor.
assert.match(extractListener('did-start-navigation'), /loadRetryPendingNav\) tab\.loadRetryPendingNav = false;\s*else tab\.loadRetryAttempt = 0;/);
assert.match(extractListener('did-fail-load'), /loadRetryPendingNav = false;[\s\S]{0,120}navigationRetryPolicy\(\{ code, attempt: tab\.loadRetryAttempt/);
assert.match(extractListener('did-fail-load'), /loadRetryPendingNav = true;\s*wc\.reload\(\);/);
assert.match(extractListener('did-stop-loading'), /loadRetryAttempt = 0;\s*tab\.loadRetryPendingNav = false;/);
assert.match(extractListener('render-process-gone'), /loadRetryAttempt = 0;\s*tab\.loadRetryPendingNav = false;/);
assert.match(main, /loadRetryTimer: null,\s*loadRetryAttempt: 0,\s*loadRetryPendingNav: false,/);

// Manga idle olaylarının üçü de retryable:0 gönderir; renderer alanı yoklukta
// dokunmadığı için eski sayımın silinmesi bu alana bağlıdır.
const idleEvents = main.match(/type: 'manga-state', state: 'idle'[^}]*/g) || [];
assert.strictEqual(idleEvents.length, 3, 'manga idle olayı sayısı değişti');
for (const line of idleEvents) assert.ok(line.includes('retryable: 0'), `retryable eksik: ${line}`);
assert.match(renderer, /event\.retryable !== undefined[\s\S]{0,160}browserMangaRetryable/);

// --- Davranış simülasyonu: gerçek dinleyici gövdeleri vm'de çalışır. ---
const sent = [];
const context = {
  randomUUID,
  console,
  setTimeout: (fn) => { context._timers.push(fn); return fn; },
  clearTimeout: (fn) => { const i = context._timers.indexOf(fn); if (i >= 0) context._timers.splice(i, 1); },
  _timers: [],
  sendBrowserEvent: (tab, event) => sent.push(event),
  browserNavigationStateForTab: () => ({}),
  browserTabById: (id) => (id === 't1' ? context.tab : null),
  isMainDocumentNavigation: () => true,
  stopBrowserManga() {}, stopBrowserPageTranslation() {}, invalidateBrowserTabSubtitles() {},
  suspendBrowserInstrumentationForNavigation() {}, setBrowserViewShown() {},
  publishBrowserPlaybackDiagnostics() {}, resetBrowserCaptureState() {},
  scheduleBrowserSessionSave() {}, scheduleBrowserPageIndex() {},
  rememberBrowserVisit() {}, restoreBrowserMediaSubtitlePreference() {},
  syncBrowserTabCompatibilityForUrl() {}, applyStoredBrowserZoom() {},
  ADAPTER_REGISTRY: { mediaIdentity: () => ({ key: '', service: '', contentId: '' }) },
  recordBrowserPlaybackEvidence: () => ({}),
  browserLoadError: (code) => ({ message: `hata ${code}`, messageKey: 'generic' }),
  navigationRetryPolicy,
  redactDiagnosticText: (url) => url,
  hideBrowserViewOffscreen() {},
  applyBrowserOverlay: async () => {},
  reportBrowserDrmSupport: async () => {},
  scheduleBrowserDiscoveryProbe() {},
  scheduleArchivedBrowserPageTranslationRestore() {},
  prepareBrowserPageInstrumentation: async () => ({ stale: true, active: true }),
  browserActiveTabId: 't1',
  browserVisible: true,
  browserModalOccluded: false,
  browserOverlay: { mode: 'translation', offset: 0 },
  browserDebuggerReady: false,
  browserPendingResponses: new Map(),
  browserRequestRanges: new Map(),
  browserLiveAsr: null,
  stopBrowserPolling() {},
  detachBrowserDebugger() {},
  cancelBrowserPermissionRequestsForTab() {},
  clearBrowserCloudflareTimer() {},
  crashRecoveryPolicy: () => ({ action: 'manual-reload', message: '', messageKey: 'x', params: {} }),
  mainWindowClosing: false,
  applyBrowserViewsLayout() {},
  resumeRestoredBrowserPage() {},
};
context.tab = {
  id: 't1', loadRetryTimer: null, loadRetryAttempt: 0, loadRetryPendingNav: false,
  crashRecoveryAttempt: 0, crashRecoveryTimer: null, generation: 1, loading: false,
  loadError: null, mangaTranslated: 0, mangaVisible: false, readerActive: false,
  bridgeToken: '', playbackDiagnostics: { reset() {} }, discoveryProbeTimer: null,
  cloudflareChallengeActive: false, pageFind: null, mangaJob: null, mangaPages: new Map(),
  mangaAttempted: new Set(), mangaFailures: [], browserInstrumentationPending: true,
  restoredUrl: 'https://a.test/', restoredTitle: '', mainHttpStatus: 0, mediaId: '', service: '',
  subtitleSelection: null, mangaPosition: null, mangaRestoreAttemptedGeneration: -1,
  overlay: { mode: 'translation', offset: 0 }, closing: false, htmlFullscreen: false,
};
const wc = {
  listeners: {},
  on(name, fn) { this.listeners[name] = fn; return this; },
  reloads: 0,
  reload() {
    this.reloads += 1;
    // Electron reload için did-start-navigation yayar — aynı zinciri koştur.
    this.listeners['did-start-navigation']({ isMainFrame: true, isSameDocument: false }, 'https://a.test/', false, true);
  },
  isDestroyed: () => false,
  getURL: () => context.tab.restoredUrl,
  getTitle: () => '',
  setVisible() {},
  close() {},
};
context.wc = wc;
context.view = { webContents: wc, setVisible() {} };
context.tab.view = context.view;

for (const name of ['did-start-navigation', 'did-stop-loading', 'did-fail-load']) {
  vm.runInNewContext(extractListener(name), context);
}
const tab = context.tab;
const fireFail = (url) => wc.listeners['did-fail-load'](null, -105, 'ERR_NAME_NOT_RESOLVED', url, true);
const fireNav = () => wc.listeners['did-start-navigation']({ isMainFrame: true, isSameDocument: false }, '', false, true);
const fireTimer = () => { const t = context._timers.shift(); assert.ok(t, 'zamanlayıcı yok'); t(); };

// A adresi üç kez hata verip bütçeyi tüketir.
fireFail('https://a.test/');
assert.strictEqual(tab.loadRetryAttempt, 1); assert.ok(tab.loadRetryTimer);
fireTimer(); // zamanlayıcı → pendingNav + reload → nav olayı bayrağı tüketir
assert.strictEqual(tab.loadRetryPendingNav, false, 'reload nav olayı bayrağı tüketmeli');
assert.strictEqual(wc.reloads, 1);
fireFail('https://a.test/');
assert.strictEqual(tab.loadRetryAttempt, 2);
fireTimer();
fireFail('https://a.test/');
assert.strictEqual(tab.loadRetryAttempt, 3);
fireTimer(); // 3. denemenin kendisi
fireFail('https://a.test/');
assert.strictEqual(tab.loadRetryAttempt, 3);
assert.strictEqual(tab.loadRetryTimer, null, 'bütçe tükendi, zamanlayıcı kurulmamalı');
assert.ok(tab.loadError.retry.action === 'terminal', '3 sonrası terminal olmalı');

// Kullanıcı başka adrese gider — B ilk hatasında taze bütçe almalı (bug: 3'tü).
fireNav();
assert.strictEqual(tab.loadRetryAttempt, 0, 'yeni gezinme bütçeyi sıfırlamalı');
fireFail('https://b.test/');
assert.strictEqual(tab.loadError.retry.action, 'retry', 'B ilk hatasında yeniden denenmeli');
assert.strictEqual(tab.loadRetryAttempt, 1);

// Zamanlayıcı reload'u bütçeyi sıfırlamadan ikinci denemeye geçer.
fireTimer();
assert.strictEqual(tab.loadRetryAttempt, 1, 'yeniden-deneme reload sonrası hak korunmalı');
fireFail('https://b.test/');
assert.strictEqual(tab.loadError.retry.action, 'retry');
assert.strictEqual(tab.loadRetryAttempt, 2);

// Çökme: yeni görünüm için sayaç ve bayrak sıfırlanır.
vm.runInNewContext(extractListener('render-process-gone'), context);
tab.loadRetryAttempt = 3; tab.loadRetryPendingNav = true;
wc.listeners['render-process-gone'](null, { reason: 'crashed' });
assert.strictEqual(tab.loadRetryAttempt, 0, 'çökme sonrası sayaç sıfırlanır');
assert.strictEqual(tab.loadRetryPendingNav, false, 'çökme sonrası bayrak sıfırlanır');

// Başarılı yükleme (loadError yok) sayacı sıfırlar.
tab.loadRetryAttempt = 2; tab.loadRetryPendingNav = true; tab.loadError = null;
wc.listeners['did-stop-loading']();
assert.strictEqual(tab.loadRetryAttempt, 0);
assert.strictEqual(tab.loadRetryPendingNav, false);

// --- R307: unloadBrowserTab diriliş bütçesini sıfırlar ---
const unloadStart = main.indexOf('async function unloadBrowserTab');
assert.ok(unloadStart >= 0, 'unloadBrowserTab bulunamadı');
const unloadEnd = main.indexOf("\nipcMain.handle('browser:command'", unloadStart);
assert.ok(unloadEnd > unloadStart, 'unloadBrowserTab sınırı bulunamadı');
const unloadBody = main.slice(unloadStart, unloadEnd);
assert.match(unloadBody, /loadRetryAttempt = 0; tab\.loadRetryPendingNav = false;\s*tab\.crashRecoveryAttempt = 0;/);
assert.match(unloadBody, /clearBrowserCloudflareTimer\(tab\)/);
// R308: mini oynatıcıya taşınmış sekmenin boşaltımı pencereyi kapatır —
// yoksa mini pencere ölü kareyle açık kalır.
assert.match(unloadBody, /browserExtras\?\.mini\.owns\(tab\)[^;]*browserExtras\.mini\.close\(\)/,
  'boşaltım mini pencereyi kapatmıyor');

Object.assign(context, {
  browserSplitSecondaryTabId: '',
  browserTabUnloadDecision: () => ({ allowed: true }),
  browserTabRuntimeState: async () => ({ stateKnown: true }),
  browserTabCapturePending: async () => ({ pending: 0 }),
  executeBrowserViewFrames: async () => [],
  browserCaptureHookScript: () => '',
  safeBrowserPlaceUrl: (u) => u,
  browserTabsSnapshot: () => [],
  browserTabSnapshot: (item) => ({ id: item.id }),
  mainWindow: { contentView: { removeChildView() {} } },
  persistBrowserSessionNow: () => ({ ok: true }),
  miniClosed: false,
  browserExtras: {
    cancel() {},
    mini: {
      owns: (item) => item === tab,
      close() { context.miniClosed = true; },
    },
  },
});
tab.pageFind = { stop() {} };
tab.translationScheduler = { cancelAll() {} };
tab.restoringPage = false;
// render-process-gone simülasyonu görünümü null'ladı — boşaltma için geri bağla.
tab.view = context.view;
vm.runInNewContext(unloadBody, context);

// Bütçe tükenmiş + bayrak sarkan sekme boşaltılır: diriliş sonrası ilk hata
// taze bütçeyle yeniden denenmeli (bug: attempt=3 kalıyordu → terminal).
tab.loadRetryAttempt = 3; tab.loadRetryPendingNav = true; tab.crashRecoveryAttempt = 1;
Promise.resolve(context.unloadBrowserTab('t1')).then((result) => {
  assert.ok(result?.ok, `boşaltma başarısız: ${result?.error}`);
  assert.strictEqual(tab.lifecycle, 'unloaded');
  assert.strictEqual(tab.loadRetryAttempt, 0, 'bütçe dirilen sekmeye sızdı');
  assert.strictEqual(tab.loadRetryPendingNav, false);
  assert.strictEqual(tab.crashRecoveryAttempt, 0, 'çökme hakkı dirilen sekmeye sızdı');
  // R308: görünümü mini'ye taşınmış sekmenin boşaltımı mini pencereyi kapatır.
  assert.strictEqual(context.miniClosed, true, 'mini pencere boşaltımda kapanmadı');

  // Diriliş: gerçek etkinleştirme 'restoring' yapar; gerçek gezinme gelir.
  tab.lifecycle = 'restoring'; tab.view = context.view;
  fireNav();
  fireFail('https://a.test/');
  assert.strictEqual(tab.loadError.retry.action, 'retry',
    'dirilen sekme ilk hatasında yeniden denenmeli');
  assert.strictEqual(tab.loadRetryAttempt, 1);
  console.log('browser-retry-state: OK');
});
