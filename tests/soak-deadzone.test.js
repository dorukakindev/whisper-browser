// R334 devamı — resource-soak ailesi + CEA tam-yakalama + yield yardımcıları
// için sözleşme kilitleri. Bu fonksiyonlar sadece soak harness'ı
// (tools/) altında çalışıyordu; section-extract + vm deseniyle davranışları
// gerçek kod üzerinden sabitlenir.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const a = SRC.indexOf(start);
  const b = end ? SRC.indexOf(end, a + start.length) : SRC.length;
  if (a < 0 || b < 0) throw new Error(`section bulunamadı: ${start} .. ${end}`);
  return SRC.slice(a, b);
}
function evalSections(ctx, parts) { vm.runInContext(parts.join('\n'), ctx); }
function makeCtx(extra = {}) {
  const ctx = vm.createContext({
    console, require, process, Buffer,
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, Promise,
    URL, URLSearchParams, crypto: { randomUUID: (() => { let n = 0; return () => 'uuid-' + (++n); })() },
    randomUUID: (() => { let n = 0; return () => 'uuid-' + (++n); })(),
    fs, path, os, Date, Math, JSON, Map, Set, WeakMap, WeakSet, Symbol,
    Number, String, Boolean, Object, Array, RegExp, Error, TypeError,
    Intl, TextEncoder, TextDecoder, AbortController,
    ...extra,
  });
  return ctx;
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, 'PASS']); }
  catch (e) { results.push([name, `FAIL ${e.message}`]); console.log('FAIL', name, e); }
}

// --- yield + sayaç yardımcıları ---
async function t_yield_and_counters() {
  const ctx = makeCtx();
  evalSections(ctx, [
    "const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));",
    section('function resourceEmitterListenerCount(', 'async function resourceCdpHeap('),
  ]);
  // yieldToEventLoop: setImmediate üzerinden çözülen Promise
  const r = await vm.runInContext('yieldToEventLoop()', ctx);
  assert.strictEqual(r, undefined);
  // resourceEmitterListenerCount: kapıları + gerçek emitter
  assert.strictEqual(vm.runInContext('resourceEmitterListenerCount(null)', ctx), 0);
  assert.strictEqual(vm.runInContext('resourceEmitterListenerCount({})', ctx), 0);
  assert.strictEqual(vm.runInContext('resourceEmitterListenerCount({eventNames:()=>{throw 1},listenerCount:()=>0})', ctx), 0);
  const { EventEmitter } = require('events');
  const em = new EventEmitter();
  em.on('a', () => {}); em.on('a', () => {}); em.on('b', () => {});
  ctx.__em = em;
  assert.strictEqual(vm.runInContext('resourceEmitterListenerCount(__em)', ctx), 3);
}

// --- resourceCdpHeap ---
async function t_cdp_heap() {
  const ctx = makeCtx();
  evalSections(ctx, [section('async function resourceCdpHeap(', 'function resourceDirectoryUsage(')]);
  // destroyed → sıfır
  ctx.__wc = { isDestroyed: () => true };
  let r = await vm.runInContext('resourceCdpHeap(__wc)', ctx);
  assert.strictEqual(r.heapUsedBytes, 0);
  // debugger takma yolu: attach → collectGarbage → getHeapUsage → detach
  const calls = [];
  ctx.__wc = {
    isDestroyed: () => false,
    debugger: {
      isAttached: () => false,
      attach: (v) => calls.push(['attach', v]),
      detach: () => calls.push(['detach']),
      sendCommand: async (cmd) => {
        calls.push(['cmd', cmd]);
        return cmd === 'Runtime.getHeapUsage' ? { usedSize: 150, totalSize: 300 } : {};
      },
    },
  };
  r = await vm.runInContext('resourceCdpHeap(__wc)', ctx);
  assert.strictEqual(r.heapUsedBytes, 150);
  assert.strictEqual(r.heapTotalBytes, 300);
  assert.strictEqual(calls[0][0], 'attach');
  assert.strictEqual(calls[calls.length - 1][0], 'detach', 'attach burada yapıldıysa detach zorunlu');
  // zaten takılı → attach/detach YOK
  calls.length = 0;
  ctx.__wc.debugger.isAttached = () => true;
  await vm.runInContext('resourceCdpHeap(__wc)', ctx);
  assert.strictEqual(calls.some(c => c[0] === 'attach'), false);
  assert.strictEqual(calls.some(c => c[0] === 'detach'), false);
  // debugger hata → executeJavaScript geri dönüşü (performance.memory)
  ctx.__wc = {
    isDestroyed: () => false,
    debugger: { isAttached: () => false, attach: () => { throw new Error('x'); }, detach: () => {}, sendCommand: async () => ({}) },
    executeJavaScript: async () => ({ heapUsedBytes: 7, heapTotalBytes: 9 }),
  };
  r = await vm.runInContext('resourceCdpHeap(__wc)', ctx);
  assert.strictEqual(r.heapUsedBytes, 7);
  // executeJavaScript da çökerse sıfır
  ctx.__wc.executeJavaScript = async () => { throw new Error('x'); };
  r = await vm.runInContext('resourceCdpHeap(__wc)', ctx);
  assert.strictEqual(r.heapUsedBytes, 0);
}

// --- resourceDirectoryUsage ---
function t_dir_usage() {
  const ctx = makeCtx();
  evalSections(ctx, [section('function resourceDirectoryUsage(', 'async function collectResourceSoakSnapshot(')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-soak-'));
  fs.writeFileSync(path.join(dir, 'a.srt'), 'xxxxx');
  fs.writeFileSync(path.join(dir, 'b.srt'), 'yyy');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'zzzzzzzz');
  fs.mkdirSync(path.join(dir, 'subdir'));
  ctx.__dir = dir;
  let r = vm.runInContext('resourceDirectoryUsage(__dir)', ctx);
  assert.strictEqual(r.count, 3);
  assert.strictEqual(r.bytes, 16);
  r = vm.runInContext('resourceDirectoryUsage(__dir, ".srt")', ctx);
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.bytes, 8, 'uzantı süzgeci + klasör atlanır');
  r = vm.runInContext('resourceDirectoryUsage(__dir+"/yok")', ctx);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.bytes, 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- collectResourceSoakSnapshot ---
async function t_soak_snapshot() {
  const seen = { overlay: 0 };
  const ctx = makeCtx({
    browserView: null,
    mainWindow: {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getOSProcessId: () => 4242,
        executeJavaScript: async (code) => ({ listeners: 11, timeouts: 2, intervals: 1, totalTimers: 3, listenerBreakdown: { x: 1 } }),
      },
    },
    app: {
      getAppMetrics: () => [
        { pid: 1, type: 'Tab', memory: { workingSetSize: 1024, peakWorkingSetSize: 2048 } },
        { pid: 2, type: 'GPU', memory: { workingSetSize: 512, peakWorkingSetSize: 512 } },
      ],
      getPath: (k) => k === 'userData' ? '/nonexistent-userdata' : '/tmp',
    },
    browserOverlayResourceMetrics: async () => ({ renderCount: 5, renderTotalMs: 50, renderAverageMs: 10, renderMaxMs: 20, boundaryCallbacks: 3 }),
    activeBrowserTab: () => null,
    resourceSoakTracker: { snapshot: () => ({ timers: { active: 4, projectActive: 1, internalActive: 3, owners: {} }, io: { readOps: 2, readBytes: 100, writeOps: 1, writeBytes: 50, byFile: {} } }) },
    browserPendingResponses: new Map([['a', 1]]),
    browserTrackBuffers: new Map([['x', 1], ['y', 2]]),
    browserTrackPublications: new Map(),
    browserManifestTransactions: { snapshot: () => ({ successful: 7, inFlight: 1 }) },
    browserHlsFetchedSegments: new Map([['s', 1]]),
    browserHlsInFlight: new Set(['i']),
    subtitleSearchCache: new Map([['k', 1]]),
    safeWatchLibraryEntryCount: () => 42,
  });
  evalSections(ctx, [
    section('function resourceEmitterListenerCount(', 'function resourceDirectoryUsage('),
    section('function resourceDirectoryUsage(', 'async function collectResourceSoakSnapshot('),
    section('async function collectResourceSoakSnapshot(', 'function resourceSoakSleep('),
  ]);
  const snap = await vm.runInContext('collectResourceSoakSnapshot("lbl", 9)', ctx);
  assert.strictEqual(snap.label, 'lbl');
  assert.strictEqual(snap.cycle, 9);
  assert.strictEqual(snap.renderer.pid, 4242);
  assert.strictEqual(snap.gpu.processCount, 1);
  assert.strictEqual(snap.gpu.workingSetBytes, 512 * 1024, 'workingSet KiB→byte');
  assert.strictEqual(snap.listeners.renderer, 11);
  assert.strictEqual(snap.timers.renderer.total, 3);
  assert.strictEqual(snap.state.pendingResponses, 1);
  assert.strictEqual(snap.state.trackBuffers, 2);
  assert.strictEqual(snap.state.seenManifests, 7);
  assert.strictEqual(snap.state.subtitleSearchCache, 1);
  assert.strictEqual(snap.state.watchLibraryEntries, 42);
  assert.strictEqual(snap.performance.overlay.renderCount, 5);
  assert.strictEqual(snap.io.readOps, 2);
  assert.strictEqual(snap.disk.browserSubtitleFiles, 0, 'userData/bz-subtitles yok → 0');
  assert.ok(snap.main.rssBytes > 0);
  assert.ok(snap.at > 0);
  // tracker yok → varsayılan boş tracker
  ctx.resourceSoakTracker = null;
  const snap2 = await vm.runInContext('collectResourceSoakSnapshot("x", 0)', ctx);
  assert.strictEqual(snap2.timers.main.active, 0);
  assert.strictEqual(snap2.io.readOps, 0);
}

// --- resourceSoakSleep ---
async function t_soak_sleep() {
  const ctx = makeCtx();
  evalSections(ctx, [section('function resourceSoakSleep(', '// Her döngü sonunda')]);
  const start = Date.now();
  await vm.runInContext('resourceSoakSleep(15)', ctx);
  assert.ok(Date.now() - start >= 10, 'en az ms kadar bekler');
}

// --- collectResourceSoakHeapPoint ---
async function t_heap_point() {
  const ctx = makeCtx({
    browserView: { webContents: { isDestroyed: () => false, debugger: { isAttached: () => false, attach() {}, detach() {}, sendCommand: async (c) => c === 'Runtime.getHeapUsage' ? { usedSize: 55, totalSize: 60 } : {} } } },
    mainWindow: { isDestroyed: () => false, webContents: { isDestroyed: () => false, debugger: { isAttached: () => true, attach() {}, detach() {}, sendCommand: async (c) => c === 'Runtime.getHeapUsage' ? { usedSize: 77, totalSize: 80 } : {} } } },
  });
  evalSections(ctx, [
    section('async function resourceCdpHeap(', 'function resourceDirectoryUsage('),
    section('async function collectResourceSoakHeapPoint(', 'async function resourceSoakCycle('),
  ]);
  const p = await vm.runInContext('collectResourceSoakHeapPoint(3, "video")', ctx);
  assert.strictEqual(p.cycle, 3);
  assert.strictEqual(p.kind, 'video');
  assert.strictEqual(p.browserHeapBytes, 55);
  assert.strictEqual(p.rendererHeapBytes, 77);
  assert.ok(p.mainHeapBytes > 0);
}

// --- resourceSoakCycle ---
async function t_soak_cycle() {
  const pub = { n: 0 };
  const flush = [];
  const ctx = makeCtx({
    activeBrowserTab: () => ({ id: 't1' }),
    ensureBrowserView: (tab) => ({
      webContents: {
        loadURL: async (u) => { ctx.__lastUrl = u; },
        session: { enableNetworkEmulation: async () => {} },
        executeJavaScript: async () => true,
      },
      setVisible: () => {},
    }),
    browserVisible: false,
    browserTrackTimer: null, browserCaptureTimer: null, browserMediaTimer: null,
    startBrowserPolling: () => { ctx.__polled = true; },
    prepareBrowserPageInstrumentation: async () => ({ stale: false, active: false }),
    ensureBrowserDebugger: async () => {},
    executeBrowserFrames: async () => {},
    browserCaptureHookScript: () => 'hook()',
    flushBrowserCaptureQueue: async () => { pub.n += 1; ctx.resourceSoakPublicationCount = pub.n; return { ok: true }; },
    flushBrowserTrackPublications: () => flush.push(1),
    resourceSoakPublicationCount: 0,
    resourceSoakToggleProbes: [],
    upsertWatchItem: (it) => { ctx.__watch = it; },
    browserDiagnostics: { counts: {}, recent: [] },
    mainWindow: { isDestroyed: () => false, webContents: { executeJavaScript: async () => null } },
  });
  evalSections(ctx, [
    section('function resourceSoakSleep(', '// Her döngü sonunda'),
    section('async function collectResourceSoakHeapPoint(', 'async function resourceSoakWaitForTab('),
  ]);
  // cycle=1 (tek sayı → sayfa döngüsü), fixture url'i ile yüklenir
  ctx.__fixture = 'http://127.0.0.1:9999';
  const r = await vm.runInContext('resourceSoakCycle(1, __fixture)', ctx);
  assert.strictEqual(r, true, 'yayın sayısı arttı → true');
  assert.strictEqual(ctx.__lastUrl, 'http://127.0.0.1:9999/page?cycle=1');
  assert.strictEqual(ctx.__polled, true, 'timer yoksa startBrowserPolling');
  assert.strictEqual(ctx.__watch.type, 'browser');
  // görünüm yok → throw
  ctx.ensureBrowserView = () => null;
  let threw = false;
  try { await vm.runInContext('resourceSoakCycle(2, __fixture)', ctx); } catch (_) { threw = true; }
  assert.strictEqual(threw, true);
}

// --- resourceSoakWaitForTab ---
async function t_wait_for_tab() {
  const ctx = makeCtx();
  evalSections(ctx, [
    section('function resourceSoakSleep(', '// Her döngü sonunda'),
    section('async function resourceSoakWaitForTab(', 'async function resourceSoakHibernationSession('),
  ]);
  // hazır wc → hemen true
  ctx.__tab = { view: { webContents: { isDestroyed: () => false, isLoading: () => false, getURL: () => 'http://x' } } };
  assert.strictEqual(await vm.runInContext('resourceSoakWaitForTab(__tab)', ctx), true);
  // about:blank → sayılmaz; 500ms min-deadline sonunda false
  ctx.__tab = { view: { webContents: { isDestroyed: () => false, isLoading: () => false, getURL: () => 'about:blank' } } };
  const t0 = Date.now();
  assert.strictEqual(await vm.runInContext('resourceSoakWaitForTab(__tab, 10)', ctx), false);
  assert.ok(Date.now() - t0 >= 490, 'min 500ms bekleme kelepçesi');
  // view yok → false
  ctx.__tab = {};
  assert.strictEqual(await vm.runInContext('resourceSoakWaitForTab(__tab, 10)', ctx), false);
}

// --- runResourceSoakSession: fixture kapısı ---
async function t_soak_session_gate() {
  const ctx = makeCtx({
    process, app: { getPath: (k) => '/tmp', exit: () => { ctx.__exited = true; } },
  });
  evalSections(ctx, [section('async function runResourceSoakSession()', 'function titleBarOverlayForTheme(')]);
  // fixture 127.0.0.1 değil → erken throw (UI'a dokunmadan)
  process.env.WHISPER_RESOURCE_SOAK_FIXTURE_URL = 'http://example.com';
  let threw = null;
  try { await vm.runInContext('runResourceSoakSession()', ctx); } catch (e) { threw = e; }
  assert.ok(threw && /127\.0\.0\.1/.test(threw.message), 'uzak fixture reddedilir');
  delete process.env.WHISPER_RESOURCE_SOAK_FIXTURE_URL;
}

// --- startBrowserHlsCeaFullCapture ---
async function t_cea_full_start() {
  const sent = [];
  const ctx = makeCtx({
    browserActiveTabId: 'tab1',
    browserHlsCeaFullCaptureJob: null,
    browserHlsCeaActive: null,
    browserStateGeneration: 5,
    browserEventContext: (t) => ({ tabId: t.id }),
    ceaCheckpointId: () => 'chk1',
    browserWatchMediaId: () => 'm1',
    loadCeaCheckpoint: () => null,
    browserCeaCheckpointRoot: () => '/tmp/cea',
    normalizeCeaCaptureSegments: (s) => s,
    retainCeaExpectedDuration: (d) => d,
    clearBrowserHlsCeaFullCaptureState: () => {},
    storeBrowserTrack: () => {},
    sendBrowserHlsCeaFullProgress: (job, state, msg) => sent.push({ state, msg }),
    runBrowserHlsCeaFullCapture: () => {},
    browserTrackStreamKey: () => 'sk',
  });
  evalSections(ctx, [section('function startBrowserHlsCeaFullCapture(', 'async function prepareBrowserHlsCeaCapture(')]);
  // sekme yok/aktif değil → hata
  let r = vm.runInContext('startBrowserHlsCeaFullCapture(null)', ctx);
  assert.strictEqual(r.ok, false);
  r = vm.runInContext('startBrowserHlsCeaFullCapture({id:"baska"})', ctx);
  assert.strictEqual(r.ok, false);
  // çalışan iş → reddedilir
  vm.runInContext('browserHlsCeaFullCaptureJob = { state: "running" }', ctx);
  r = vm.runInContext('startBrowserHlsCeaFullCapture({id:"tab1"})', ctx);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('zaten'));
  // active yok/boş → hata
  vm.runInContext('browserHlsCeaFullCaptureJob = null; browserHlsCeaActive = null', ctx);
  r = vm.runInContext('startBrowserHlsCeaFullCapture({id:"tab1"})', ctx);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('bulunamadı'));
  // mutlu yol: segments+tracks var → job kurulur, running eventi, {ok,jobId,total}
  vm.runInContext(`browserHlsCeaActive = {
    sourceUrl: 'http://x/master.m3u8', playlistUrl: 'http://x/v.m3u8',
    variant: { bandwidth: 100 }, tracks: [{ instreamId: 'cc1', language: 'en', name: 'CC', standard: 'cea-608' }],
    segments: [{ url: 's1' }, { url: 's2' }], playlistComplete: true, expectedDuration: 60 };`, ctx);
  r = vm.runInContext('startBrowserHlsCeaFullCapture({id:"tab1", contentDuration: 60})', ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.total, 2);
  assert.ok(r.jobId);
  assert.strictEqual(sent[0].state, 'running');
  assert.ok(sent[0].msg.includes('2 segment'));
  const job = vm.runInContext('browserHlsCeaFullCaptureJob', ctx);
  assert.strictEqual(job.state, 'running');
  assert.strictEqual(job.resume, false);
  // resume: önceki iş aynı tab NESNESİ + url ve partial → devam işareti
  ctx.__tab = { id: 'tab1', contentDuration: 60 };
  vm.runInContext(`browserHlsCeaFullCaptureJob = { tab: __tab, sourceUrl: 'http://x/master.m3u8', playlistUrl: 'p', variant: {}, tracks: [], segments: [{url:'s1'}], playlistComplete: false, expectedDuration: 0, completed: new Set(), state: 'partial' }`, ctx);
  sent.length = 0;
  r = vm.runInContext('startBrowserHlsCeaFullCapture(__tab)', ctx);
  assert.strictEqual(r.ok, true);
  assert.ok(sent[0].msg.includes('devam'), 'resume mesajı');
}

// --- prepareBrowserHlsCeaCapture ---
async function t_cea_prepare() {
  const fetched = [];
  const registered = [];
  const capturedSegs = [];
  const ctx = makeCtx({
    parseHlsVariantStreams: (body, url) => ([
      { url: url + 'hi.m3u8', bandwidth: 9000 },
      { url: url + 'lo.m3u8', bandwidth: 100 },
      { url: url + 'nocea.m3u8', averageBandwidth: 50 },
    ]),
    hlsCeaTracksForVariant: (tracks, v) => (v.url || '').includes('nocea') ? [] : [{ instreamId: 'cc1' }],
    parseHlsSegments: () => [],
    fetchBrowserTextWithRetry: async (url) => { fetched.push(url); return '#EXTM3U segs'; },
    noteBrowserCapture: () => {},
    buildHlsCeaSegmentMatchers: (body, vurl, tracks, master) => ([
      { url: vurl + '/s0.ts', start: 0, duration: 4 },
      { url: vurl + '/s1.ts', start: 4, duration: 4 },
      { url: vurl + '/s2.ts', start: 8, duration: 4 },
    ]),
    registerBrowserHlsCeaMatchers: (m) => { registered.push(...m); return m.length; },
    browserHlsCeaActive: { sourceUrl: 'http://x/master.m3u8' },
    isCurrentBrowserContext: () => true,
    normalizeCeaCaptureSegments: (s) => s,
    browserTabById: () => ({ position: 5 }),
    activeBrowserTab: () => ({ position: 5 }),
    hlsCeaSegmentFetchKey: (s) => s.url,
    browserHlsCeaFetchedSegments: new Set(),
    fetchBrowserBufferWithRetry: async (url) => { capturedSegs.push(url); return Buffer.from('x'); },
    BROWSER_CAPTURE_BODY_LIMIT: 999,
    captureBrowserHlsCeaSegment: async () => true,
  });
  evalSections(ctx, [section('async function prepareBrowserHlsCeaCapture(', 'async function fetchAndStoreBrowserSubtitle(')]);
  // iki cea'lı varyant (nocea elenir), düşük bant önce sıralanır
  const r = await vm.runInContext(
    'prepareBrowserHlsCeaCapture("masterbody", "http://x/master.m3u8", [{instreamId:"cc1"}], {tabId:"t1"}, () => true)', ctx);
  assert.strictEqual(fetched[0], 'http://x/master.m3u8lo.m3u8', 'en düşük bant önce');
  assert.strictEqual(fetched.length, 2);
  assert.strictEqual(r.matcherCount, 6, 'iki varyant × 3 matcher');
  assert.strictEqual(r.recovered, true, 'playhead(5s) çevresi parçalar geri alındı');
  // playhead=5 → s1 içinde; slice(index-1, index+3) → s0,s1,s2 hepsi
  assert.deepStrictEqual(capturedSegs.sort(), ['http://x/master.m3u8lo.m3u8/s0.ts', 'http://x/master.m3u8lo.m3u8/s1.ts', 'http://x/master.m3u8lo.m3u8/s2.ts']);
  // active güncellendi
  assert.strictEqual(ctx.browserHlsCeaActive.playlistComplete, false, 'bodyde ENDLIST yok');
  // isActive false → erken çıkış (fetchler yapıldı ama matcher yok)
  capturedSegs.length = 0; registered.length = 0;
  const r2 = await vm.runInContext(
    'prepareBrowserHlsCeaCapture("masterbody", "http://x/master.m3u8", [{instreamId:"cc1"}], {tabId:"t1"}, () => false)', ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r2)), { matcherCount: 0, recovered: false });
  // gap parçası indirme denenmez
  ctx.buildHlsCeaSegmentMatchers = () => ([{ url: 'g.ts', start: 0, duration: 4, gap: true }]);
  const r3 = await vm.runInContext(
    'prepareBrowserHlsCeaCapture("masterbody", "http://x/master.m3u8", [{instreamId:"cc1"}], {tabId:"t1"}, () => true)', ctx);
  assert.strictEqual(r3.recovered, false, 'EXT-X-GAP atlanır');
}

// --- nested/unlockable envanteri: raporda belge ---
// distance, stripTag, loadSprite, onClick, onMove, onTvNavigate, openInNewTab,
// seekHandler, timestamps, sameOrigin, selectorFor, supportedKind, safeTransform,
// translateIdOf, outputEntriesFor, contextRows, exclusionStale, filterForDuration,
// dropRetainedChunks, inspectResponse, definitiveTranslationError,
// prepareNavigationCompatibility, recoverInterruptedOutputs, xhrOpenWrapper,
// xhrSendWrapper, acceptTerminalEvent, forwardAbort, ownsAttempt,
// requestIsCurrent, requireActiveTransaction, transactionCurrent, startSoak,
// onTvNavigate → tamamı üst-seviye olmayan iç kapanışlar (section çıkarmaya
// uygun değil): sıfır-referans envanterinde 'nested — kilitlenemez' olarak
// belgelenir; davranışları kapsayan üst fonksiyonlar diğer dosyalarda kilitli.

async function main() {
  await t('t_yield_and_counters', t_yield_and_counters);
  await t('t_cdp_heap', t_cdp_heap);
  await t('t_dir_usage', t_dir_usage);
  await t('t_soak_snapshot', t_soak_snapshot);
  await t('t_soak_sleep', t_soak_sleep);
  await t('t_heap_point', t_heap_point);
  await t('t_soak_cycle', t_soak_cycle);
  await t('t_wait_for_tab', t_wait_for_tab);
  await t('t_soak_session_gate', t_soak_session_gate);
  await t('t_cea_full_start', t_cea_full_start);
  await t('t_cea_prepare', t_cea_prepare);
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`soak-deadzone: ${results.length - failed.length} senaryo geçti`);
  if (failed.length) process.exit(1);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
