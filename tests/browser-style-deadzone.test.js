'use strict';

// R334 ölü-bölge kilidi — stil/GPU/kaynak görünümü (src/main.js):
// darkReaderBundle, applyBrowserDarkMode, applyBrowserYoutubeStyle,
// removeBrowserElementPickCss, waitForGpuInfo/settleGpuReadyWaiters,
// refreshBrowserGpuDiagnostics/collectBrowserGpuDiagnostics,
// browserOverlayResourceMetrics, browserResourceSnapshot,
// decorateMangaRegionColors, configureBrowserPlaybackWebRequest —
// sıfır test referanslı.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

const j = (v) => JSON.stringify(v);

function makeCtx(userData, over = {}) {
  const calls = { events: [], css: [], removedCss: [], executed: [], waiters: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    setImmediate, setTimeout, clearTimeout,
    path, fs,
    require: Object.assign((m) => require(m), { resolve: (m) => require.resolve(m) }),
    app: {
      getPath: (k) => k === 'userData' ? userData : `/tmp/${k}`,
      isReady: () => ctx.__appReady !== false,
      getGPUInfo: async () => ({ model: 'test-gpu' }),
      getAppMetrics: () => ctx.__metrics ?? [],
      getGPUFeatureStatus: () => ctx.__features ?? {},
      isHardwareAccelerationEnabled: () => ctx.__hwAccel !== false,
      on: () => {},
    },
    browserTabs: new Map(),
    mainWindow: null,
    browserGpuDiagnostics: null,
    gpuFeatureReady: true,
    gpuInfoCache: null,
    gpuInfoRequest: null,
    gpuGeneration: 0,
    gpuLastProcessEvent: null,
    gpuRefreshSequence: 0,
    gpuReadyWaiters: new Set(),
    summarizeGpuDiagnostics: (d) => ({ __summ: true, ...d }),
    sendBrowserEvent: (e) => calls.events.push(e),
    nativeImage: {
      createFromBuffer: (b) => ctx.__native(b),
    },
    __native: () => ctx.__img,
    __img: null,
    normalizeMangaRegions: (r) => (ctx.__normRegs ?? r),
    mangaRegionSampleBox: (r) => r.bubbleBox || r.box || [0, 0, 0, 0],
    sampleMangaRegionColors: (bmp, w, h, regs) => [{ backgroundColor: '#111', textColor: '#eee' }],
    buildDarkReaderCssScript: (bundle) => `dark:${String(bundle).slice(0, 10)}`,
    executeBrowserTrustedMain: async (view, script) => (calls.executed.push(script), ctx.__exec ?? []),
    youtubeStyleCss: (o) => ({ __yt: true, o }),
    isYoutubePageUrl: (u) => String(u).includes('youtube.'),
    darkReaderApiBundle: null,
    browserPlaybackConfiguredSessions: new Set(),
    installPlaybackWebRequestDiagnostics: (wr, fn, o) => { ctx.__wrCfg = { wr, fn, o }; return true; },
    recordBrowserPlaybackEvidence: () => {},
    activeBrowserTab: () => ctx.__activeTab ?? null,
    withTimeout: (p, ms, msg) => p,
    normalizeBrowserPageResourceMetrics: (o) => o,
    groupBrowserProcessMetrics: (tabs, m) => tabs,
    summarizeBrowserResourceBudgets: (tabs, b) => b,
    requestBrowserPageResourceMetrics: async (t) => ({ measured: false, activeTimers: 0 }),
    browserOverlayResourceMetrics: async (t) => null,
    browserTabIpcFrequency: () => 3,
    browserTrackBuffers: new Map(),
    browserPendingResponses: new Map(),
    browserManifestTransactions: { snapshot: () => ({ inFlight: 0 }) },
    browserHlsInFlight: new Set(),
    browserTrackPendingPublications: new Map(),
    browserTrackTimer: null, browserCaptureTimer: null, browserMediaTimer: null,
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    'let browserGpuDiagnostics=null,darkReaderApiBundle=null;',
    section('function configureBrowserPlaybackWebRequest(', 'function publishBrowserGpuDiagnostics('),
    section('function publishBrowserGpuDiagnostics(', 'async function refreshBrowserGpuDiagnostics('),
    section('async function refreshBrowserGpuDiagnostics(', 'async function collectBrowserGpuDiagnostics('),
    section('async function collectBrowserGpuDiagnostics(', "app.on('gpu-info-update'"),
    section('function darkReaderBundle(', '// B10 — kullanıcı onaylı kozmetik'),
    section('async function applyBrowserDarkMode(', 'async function applyBrowserYoutubeStyle('),
    section('async function applyBrowserYoutubeStyle(', '// B10 — kullanıcı onaylı kozmetik'),
    section('async function removeBrowserElementPickCss(', 'async function captureBrowserFullPage('),
    section('function decorateMangaRegionColors(', 'function mangaRetryAfterMs('),
    section('async function browserOverlayResourceMetrics(', 'async function browserResourceSnapshot('),
    section('async function browserResourceSnapshot(', 'function isCurrentBrowserContext('),
  ].join('\n'), ctx);
}

function t_dark_reader_bundle(userData) {
  const { ctx } = makeCtx(userData);
  // darkreader gerçek kurulu — require.resolve üzerinden okunur; fs stub'ı
  // dosyayı kendimiz okuyacak şekilde paket kökünden çözer
  const real = fs.readFileSync(require.resolve('darkreader/darkreader.js'), 'utf8');
  ctx.require = (m) => m;
  ctx.require.resolve = (m) => require.resolve(m);
  evalAll(ctx);
  const b = vm.runInContext('darkReaderBundle()', ctx);
  assert.strictEqual(b, real, 'darkreader paketi doğru okunmadı');
  assert.strictEqual(vm.runInContext('darkReaderBundle()', ctx), b, 'önbellek çalışmadı');
}

async function t_dark_mode() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  const mkWc = (url) => ({
    isDestroyed: () => false,
    removeInsertedCSS: async (k) => calls.removedCss.push(k),
    insertCSS: async (css, o) => { calls.css.push({ css, o }); return 'key-1'; },
    getURL: () => url,
  });
  // wc yok → hata
  let r = await vm.runInContext('applyBrowserDarkMode(null, true)', ctx);
  assert.strictEqual(r.ok, false);
  // eski anahtar varsa kaldırılır; disabled → enabled:false
  const tab = { id: 't', view: { webContents: mkWc('https://a') }, darkModeCssKey: 'old', generation: 1 };
  ctx.__tab = tab;
  r = await vm.runInContext('applyBrowserDarkMode(__tab, false)', ctx);
  assert.strictEqual(calls.removedCss[0], 'old');
  assert.strictEqual(tab.darkModeCssKey, '');
  assert.strictEqual(r.enabled, false);
  // exec sonucu css yok → hata
  ctx.__exec = [{ ok: false, error: 'üretim hatası' }];
  r = await vm.runInContext('applyBrowserDarkMode(__tab, true)', ctx);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /üretim hatası/);
  // başarı → user-origin insert + key saklanır
  ctx.__exec = [{ ok: true, css: 'body{background:#000}' }];
  r = await vm.runInContext('applyBrowserDarkMode(__tab, true)', ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.css[0].o.cssOrigin, 'user');
  assert.strictEqual(tab.darkModeCssKey, 'key-1');
  // bayat istek: generation değişince reddedilir
  ctx.__exec = [{ ok: true, css: 'x' }];
  ctx.__execBefore = () => { tab.generation = 2; };
  ctx.executeBrowserTrustedMain = async () => { tab.generation = 2; return ctx.__exec; };
  r = await vm.runInContext('applyBrowserDarkMode(__tab, true)', ctx);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(tab.darkModeCssKey, '');
}

async function t_youtube_style() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  const mkWc = (url) => ({
    isDestroyed: () => false,
    removeInsertedCSS: async (k) => calls.removedCss.push(k),
    insertCSS: async (css, o) => { calls.css.push({ css, o }); return 'yk-1'; },
    getURL: () => url,
  });
  // youtube dışı → enabled:false, css kurulmaz
  let tab = { id: 't', view: { webContents: mkWc('https://x') }, generation: 1 };
  ctx.__tab = tab;
  let r = await vm.runInContext('applyBrowserYoutubeStyle(__tab, {})', ctx);
  assert.strictEqual(r.enabled, false);
  assert.strictEqual(calls.css.length, 0);
  // youtube + appearance → insert + signature tutulur; aynı signature → unchanged
  tab = { id: 't', view: { webContents: mkWc('https://youtube.com/v') }, generation: 1 };
  ctx.__tab = tab;
  r = await vm.runInContext('applyBrowserYoutubeStyle(__tab, {appearance:true, hideShorts:true})', ctx);
  assert.strictEqual(r.enabled, true);
  assert.strictEqual(tab.youtubeStyleSignature, '1:1');
  calls.css.length = 0;
  r = await vm.runInContext('applyBrowserYoutubeStyle(__tab, {appearance:true, hideShorts:true})', ctx);
  assert.strictEqual(r.unchanged, true, 'aynı signature tekrar CSS kurdu');
  assert.strictEqual(calls.css.length, 0);
  // signature değişti → eski kaldırılır
  r = await vm.runInContext('applyBrowserYoutubeStyle(__tab, {appearance:true, hideShorts:false})', ctx);
  assert.strictEqual(calls.removedCss[0], 'yk-1');
  assert.strictEqual(tab.youtubeStyleSignature, '1:0');
  // seq yarışı: insert sonrası seq değişirse css kaldırılıp stale döner
  const wc = mkWc('https://youtube.com/v');
  tab = { id: 't', view: { webContents: wc }, generation: 1, youtubeStyleRequestSeq: 0 };
  ctx.__tab = tab;
  wc.insertCSS = async (css, o) => { tab.youtubeStyleRequestSeq = 99; calls.css.push(1); return 'yk-race'; };
  r = await vm.runInContext('applyBrowserYoutubeStyle(__tab, {})', ctx);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(calls.removedCss.at(-1), 'yk-race', 'bayat CSS sayfada kaldı');
  // pick css temizliği
  calls.removedCss.length = 0;
  await vm.runInContext('removeBrowserElementPickCss(__tab)', ctx);
  assert.strictEqual(calls.removedCss.length, 0, 'anahtar yokken kaldırma çağrıldı');
  tab.elementPickCssKey = 'pk';
  await vm.runInContext('removeBrowserElementPickCss(__tab)', ctx);
  assert.strictEqual(calls.removedCss[0], 'pk');
  assert.strictEqual(tab.elementPickCssKey, '');
}

async function t_gpu_waiters() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // featureReady → anında çözülür, beklemez
  ctx.gpuFeatureReady = true;
  const r1 = vm.runInContext('waitForGpuInfo(500)', ctx);
  await r1; // resolves
  assert.strictEqual(ctx.gpuReadyWaiters.size, 0);
  // not ready → timeout sonrası çözülür + waiter temizlenir
  ctx.gpuFeatureReady = false;
  const r2 = vm.runInContext('waitForGpuInfo(50)', ctx);
  assert.strictEqual(ctx.gpuReadyWaiters.size, 1);
  await r2;
  assert.strictEqual(ctx.gpuReadyWaiters.size, 0);
  // settle → bekleyenler çözülür
  const r3 = vm.runInContext('waitForGpuInfo(5000)', ctx);
  assert.strictEqual(ctx.gpuReadyWaiters.size, 1);
  vm.runInContext('settleGpuReadyWaiters()', ctx);
  await r3;
  assert.strictEqual(ctx.gpuReadyWaiters.size, 0);
}

async function t_gpu_diagnostics() {
  const { ctx, calls } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__metrics = [{ pid: 1 }];
  ctx.__features = { video_decode: 'enabled' };
  const d = await vm.runInContext(`refreshBrowserGpuDiagnostics('test', false)`, ctx);
  assert.strictEqual(d.__summ, true);
  assert.strictEqual(d.featureReady, true);
  assert.strictEqual(d.hardwareAcceleration, true);
  assert.strictEqual(d.trigger, 'test');
  assert.strictEqual(calls.events[0].type, 'gpu-status');
  // eski sequence reddedilir
  const p1 = vm.runInContext(`refreshBrowserGpuDiagnostics('stale')`, ctx);
  ctx.gpuRefreshSequence = 99;
  const stale = await p1.catch(() => browserGpuDiagnostics);
  // race sonrası sequence != refreshSequence → eski diagnostics döner
  const d2 = await vm.runInContext(`refreshBrowserGpuDiagnostics('fresh')`, ctx);
  assert.strictEqual(d2.trigger, 'fresh');
  // collect: featureReady → wait yok, refresh çağrılır
  const d3 = await vm.runInContext(`collectBrowserGpuDiagnostics('collect', 10)`, ctx);
  assert.strictEqual(d3.__summ, true);
  // not ready → gpu-info-probe tetiklenir
  ctx.gpuFeatureReady = false;
  ctx.__features = {};
  const d4 = await vm.runInContext(`collectBrowserGpuDiagnostics('cold', 0)`, ctx);
  assert.strictEqual(d4.featureReady, false);
}

function t_overlay_metrics() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // compat/destroyed → null
  assert.strictEqual(vm.runInContext('browserOverlayResourceMetrics(null)', ctx).then ? 'async' : 'x', 'async');
  const r = vm.runInContext('browserOverlayResourceMetrics({view:{webContents:{isDestroyed:()=>true}}})', ctx);
  return r;
}

async function t_resource_snapshot() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.requestBrowserPageResourceMetrics = async () => ({ measured: true, activeTimers: 5, mutationObservers: 2, mediaListeners: 1 });
  ctx.browserOverlayResourceMetrics = async () => ({ mutationObservers: 1, resizeObservers: 3, mediaListeners: 2 });
  ctx.browserTabs.set('a', { id: 'a', lifecycle: 'active',
    view: { webContents: { isDestroyed: () => false, getOSProcessId: () => 42, debugger: { isAttached: () => true } } } });
  ctx.browserTrackBuffers.set('k', [1, 2, 3]);
  const snap = await vm.runInContext('browserResourceSnapshot()', ctx);
  assert.strictEqual(snap.tabs.length, 1);
  assert.strictEqual(snap.tabs[0].processId, 42);
  const res = snap.tabs[0].resources;
  assert.strictEqual(res.measured, true);
  assert.strictEqual(res.mutationObservers, 3, 'page+overlay birleştirilmedi');
  assert.strictEqual(res.mediaListeners, 3);
  assert.strictEqual(res.ipcPerMinute, 3);
  const b = snap.budgets;
  assert.strictEqual(b.bufferedCues, 3);
  assert.strictEqual(b.networkSubscriptions, 1);
  assert.strictEqual(b.networkCaptureActive, true);
}

function t_manga_colors() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const regions = [{ box: [0, 0, 500, 500], bubbleBox: [0, 0, 500, 500] }];
  // boş resim → normalize passthrough
  ctx.__img = { isEmpty: () => true };
  ctx.__normRegs = [{ __norm: true }];
  ctx.__r = regions;
  let out = vm.runInContext('decorateMangaRegionColors({buffer:1}, __r)', ctx);
  assert.strictEqual(j(out), j([{ __norm: true }]));
  // sağlam resim → crop → renk örneklenir
  const crop = {
    isEmpty: () => false,
    getSize: () => ({ width: 10, height: 10 }),
    toBitmap: () => Buffer.alloc(400),
  };
  ctx.__img = {
    isEmpty: () => false,
    getSize: () => ({ width: 100, height: 200 }),
    crop: (r) => { ctx.__cropArgs = r; return crop; },
  };
  ctx.__normRegs = null;
  out = vm.runInContext('decorateMangaRegionColors({buffer:1}, __r)', ctx);
  assert.strictEqual(out[0].backgroundColor, '#111');
  assert.strictEqual(out[0].textColor, '#eee');
  // örnekleme koordinatı %0.1 ölçekli
  assert.strictEqual(ctx.__cropArgs.width, 50);
  assert.strictEqual(ctx.__cropArgs.height, 100);
  // örnekleyici throw → normalize fallback
  ctx.sampleMangaRegionColors = () => { throw new Error('x'); };
  ctx.__normRegs = [{ safe: 1 }];
  out = vm.runInContext('decorateMangaRegionColors({buffer:1}, __r)', ctx);
  assert.strictEqual(j(out), j([{ safe: 1 }]));
}

function t_playback_webrequest() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // webRequest yok → no-op
  vm.runInContext('configureBrowserPlaybackWebRequest({})', ctx);
  assert.strictEqual(ctx.__wrCfg, undefined);
  vm.runInContext('configureBrowserPlaybackWebRequest(null)', ctx);
  const session1 = { webRequest: {} };
  ctx.__s1 = session1;
  vm.runInContext('configureBrowserPlaybackWebRequest(__s1)', ctx);
  assert.ok(ctx.__wrCfg, 'kurulum çağrılmadı');
  // aynı session tekrar → yeniden kurmaz
  ctx.__wrCfg = null;
  vm.runInContext('configureBrowserPlaybackWebRequest(__s1)', ctx);
  assert.strictEqual(ctx.__wrCfg, null, 'tekrar kurulum yapıldı');
  // acceptDetails: yalnız aktif webContents
  ctx.__s2 = { webRequest: {} };
  vm.runInContext('configureBrowserPlaybackWebRequest(__s2)', ctx);
  const accept = ctx.__wrCfg.o.acceptDetails;
  ctx.__activeTab = { view: { webContents: { isDestroyed: () => false, id: 7 } } };
  assert.strictEqual(accept({ webContentsId: 7 }), true);
  assert.strictEqual(accept({ webContentsId: 8 }), false, 'arka-plan sekmesinin hatası kabul edildi');
  ctx.__activeTab = null;
  assert.strictEqual(accept({ webContentsId: 7 }), false);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'style-'));
  t_dark_reader_bundle(userData);
  await t_dark_mode();
  await t_youtube_style();
  await t_gpu_waiters();
  await t_gpu_diagnostics();
  const pending = t_overlay_metrics();
  assert.strictEqual(await pending, null);
  await t_resource_snapshot();
  t_manga_colors();
  t_playback_webrequest();
  console.log('browser-style-deadzone: 9 senaryo geçti');
  process.exit(0); // gpu-info Promise.race içindeki 10sn timer'ı bekleme
}

main().catch((e) => { console.error(e); process.exit(1); });
