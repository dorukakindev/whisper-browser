'use strict';

// R334 ölü-bölge kilidi — yakalama/ekran-görüntüsü yüzeyleri (src/main.js):
// noteBrowserResponsiveness, browserDiagnosticsExportSnapshot,
// captureBrowserFullPage, captureBrowserVideoFrame, saveBrowserPageCapture,
// saveBrowserPageArchive — sıfır test referanslı. Sözleşmeler:
//   - responsiveness: closing/no-change no-op; tanı + 2 olay yayınlanır
//   - exportSnapshot: counts≥0 int, recent≤100, redact uygulanır, cue metni
//     sızmaz (son katman sanitize)
//   - captureFullPage: debugger yalnız bizim takıyorsak sökülür;
//     >120M px reddedilir; cssContentSize kelepçesi 30000
//   - videoFrame: candidates rank, iç-çerçeve → hata, zoom kelepçe, rect mat
//   - savePageCapture: boş görüntü hatası, copy/save=false dalları, .png
//     normalizasyonu + atomik yazma
//   - savePageArchive: savePage yok → hata; uzantı .mhtml/.mht normalizasyonu

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function j(x) { return JSON.stringify(x); }

function makeCtx(over = {}) {
  const calls = { events: [], written: [], clip: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, WeakMap, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    path,
    activeBrowserTab: () => ctx.__activeTab ?? null,
    browserDiagnostics: null,
    freshBrowserDiagnostics: (url, tab) => ({ pageUrl: url, counts: {} }),
    sendBrowserEvent: (t, p) => calls.events.push(p),
    browserAdblockController: null,
    redactCaptureUrl: (u) => `R(${u})`,
    redactBrowserDiagnosticsText: (t) => t == null ? '' : `r(${t})`,
    sanitizeManifestPreview: (p) => p,
    sanitizeDiagnosticsSecrets: (s) => s,
    sanitizeDiagnosticsAgainstCueText: (s) => s,
    browserTrackBuffers: new Map(),
    browserDebuggerAttachPromise: null,
    browserDebuggerReady: false,
    browserDebuggerAttachAttempts: new WeakMap(),
    nativeImage: { createFromBuffer: (b) => ({ empty: !b.length, isEmpty: () => !b.length, toPNG: () => b, __buf: b }) },
    browserFrames: () => ctx.__frames || [],
    buildBrowserMediaProbeScript: () => 'probe()',
    rankBrowserMediaCandidates: (c) => c.filter((x) => x.media).sort((a, b) => (b.media.bounds?.width || 0) - (a.media.bounds?.width || 0)),
    withTimeout: (p) => p,
    dt: (tr, en) => tr,
    clipboard: { writeImage: (img) => { calls.clipboard = img; } },
    dialog: { showSaveDialog: async () => ctx.__saveDialog ?? { canceled: true } },
    mainWindow: { isDestroyed: () => false },
    app: { getPath: (k) => `/tmp/${k}`, getVersion: () => '0.0.0-test', getLocale: () => 'en-US' },
    browserGpuDiagnostics: null,
    browserExportTitle: (t) => 'sayfa',
    writeBufferAtomic: (p, b) => calls.written.push([p, b.length]),
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext(
    section('function noteBrowserResponsiveness(', 'function normalizeBrowserUrl(')
    + '\n'
    + section('async function captureBrowserFullPage(', 'function startBrowserTranslation('),
    ctx);
}

function makeWc(over = {}) {
  return Object.assign({
    isDestroyed: () => false,
    debugger: {
      attached: false,
      attach() { this.attached = true; },
      detach() { this.attached = false; },
      isAttached() { return this.attached; },
      sendCommand: async (cmd, args) => over.__commands ? over.__commands(cmd, args) : null,
    },
    capturePage: async (rect) => { over.__capRect = rect; return over.__pageImage ?? { isEmpty: () => true }; },
    executeJavaScript: async () => null,
    getZoomFactor: () => over.__zoom ?? 1,
    savePage: async (p, fmt) => { over.__saved = [p, fmt]; },
    mainFrame: { id: 'mf' },
  }, over);
}

function t_responsiveness() {
  const { ctx, calls } = makeCtx();
  evalAll(ctx);
  // closing → no-op
  vm.runInContext('noteBrowserResponsiveness({closing:true}, false)', ctx);
  assert.strictEqual(calls.events.length, 0);
  // aynı durum → no-op
  const tab = { pageResponsive: true };
  ctx.__tab = tab;
  vm.runInContext('noteBrowserResponsiveness(__tab, true)', ctx);
  assert.strictEqual(calls.events.length, 0);
  // unresponsive → tanı + 2 olay
  vm.runInContext('noteBrowserResponsiveness(__tab, false)', ctx);
  assert.strictEqual(tab.pageResponsive, false);
  assert.strictEqual(calls.events.length, 2);
  assert.strictEqual(calls.events[0].type, 'capture-status');
  assert.strictEqual(calls.events[1].type, 'page-responsiveness');
  assert.strictEqual(calls.events[1].responsive, false);
  // geri dönüş
  vm.runInContext('noteBrowserResponsiveness(__tab, true)', ctx);
  assert.strictEqual(calls.events.at(-1).responsive, true);
}

function t_export_snapshot() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  ctx.browserDiagnostics = {
    operationId: 'op'.repeat(100),
    pageUrl: 'https://x/secret',
    counts: { captions: 3.7, bad: -5 },
    activity: { lastCapture: { at: 12, message: 'm' }, lastTranslation: null },
    responsiveness: { status: 'weird', at: 1, message: 'x' },
    translation: { sourceCues: -2, status: 's'.repeat(60) },
    manifest: { kind: 'k'.repeat(30), bytes: 9.9, preview: 'p' },
    coverage: Array.from({ length: 100 }, (_, i) => i),
    recent: Array.from({ length: 150 }, (_, i) => ({ at: i, url: `u${i}`, detail: 'd' })),
  };
  ctx.browserAdblockController = { getState: () => ({ enabled: true, state: 's'.repeat(50), blocked: 2.9, recentBlocked: Array.from({ length: 30 }, () => ({ url: 'u', type: 't', rule: 'r' })), recentAllowed: [{ url: 'a', type: 't', decision: 'd'.repeat(80) }] }) };
  const s = vm.runInContext('browserDiagnosticsExportSnapshot()', ctx);
  assert.strictEqual(s.version, 1);
  assert.strictEqual(s.counts.captions, 3, 'counts trunc');
  assert.strictEqual(s.counts.bad, 0, 'negatif sayı 0 kelepçesi');
  assert.strictEqual(s.operationId.length, 160);
  assert.strictEqual(s.pageUrl, 'R(https://x/secret)');
  assert.strictEqual(s.responsiveness.status, 'responsive', 'bilinmeyen status → responsive');
  assert.strictEqual(s.translation.sourceCues, 0);
  assert.strictEqual(s.translation.status.length, 40);
  assert.strictEqual(s.manifest.kind.length, 20);
  assert.strictEqual(s.coverage.length, 64);
  assert.strictEqual(s.recent.length, 100, 'recent 100 ile sınırlı');
  assert.strictEqual(s.adblock.blocked, 2);
  assert.strictEqual(s.adblock.recentBlocked.length, 20);
  assert.strictEqual(s.adblock.recentBlocked[0].url, 'R(u)');
  assert.strictEqual(s.adblock.recentAllowed[0].decision.length, 60);
}

async function t_fullpage_debugger() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const wc = makeWc();
  wc.debugger.sendCommand = async (cmd) => {
    if (cmd === 'Page.getLayoutMetrics') return { cssContentSize: { width: 800, height: 600 } };
    if (cmd === 'Page.captureScreenshot') return { data: Buffer.from('png-bytes').toString('base64') };
    return null;
  };
  ctx.__wc = wc;
  const img = await vm.runInContext('captureBrowserFullPage(__wc)', ctx);
  assert.strictEqual(wc.debugger.isAttached(), false, 'bizim attach temizlenmedi');
  assert.ok(img.__buf.equals(Buffer.from('png-bytes')));
  // önceden takılı debugger sökülmez (yakalama kurulumu bizim değil)
  wc.debugger.attached = true;
  await vm.runInContext('captureBrowserFullPage(__wc)', ctx);
  assert.strictEqual(wc.debugger.isAttached(), true, 'başkasının debugger\'ı söküldü');
  // >120M px → hata
  wc.debugger.attached = false;
  wc.debugger.sendCommand = async (cmd) =>
    cmd === 'Page.getLayoutMetrics' ? { cssContentSize: { width: 30000, height: 30000 } } : null;
  await assert.rejects(vm.runInContext('captureBrowserFullPage(__wc)', ctx), /piksel sınırını aşıyor/);
  // capture kurulumu bekleyen (WeakMap) varsa detach edilmez
  wc.debugger.attached = false;
  wc.debugger.sendCommand = async (cmd) =>
    cmd === 'Page.getLayoutMetrics' ? { cssContentSize: { width: 100, height: 100 } }
      : { data: Buffer.from('x').toString('base64') };
  ctx.browserDebuggerAttachAttempts.set(wc, true);
  await vm.runInContext('captureBrowserFullPage(__wc)', ctx);
  assert.strictEqual(wc.debugger.isAttached(), true, 'bekleyen attach girişimi varken söküldü');
}

async function t_video_frame() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const wc = makeWc({ __zoom: 2 });
  const mainFrame = wc.mainFrame;
  mainFrame.executeJavaScript = async () => null;
  ctx.__frames = [mainFrame];
  ctx.__tab = {
    view: {
      webContents: wc,
      getBounds: () => ({ width: 1000, height: 500 }),
    },
  };
  // executeJavaScript probe → media bounds döndür
  mainFrame.executeJavaScript = async (script) => {
    if (String(script).includes('__whisperCaptureHidden')) return 0;
    if (String(script).includes('visibility')) return 1;
    return { bounds: { x: 10, y: 20, width: 400, height: 200 } };
  };
  wc.capturePage = async (rect) => { wc.__capRect = rect; return { ok: true }; };
  await vm.runInContext('captureBrowserVideoFrame(__tab, false)', ctx);
  assert.strictEqual(j(wc.__capRect), j({ x: 20, y: 40, width: 800, height: 400 }),
    'zoom=2 ile rect ölçeklenmedi');
  // iç çerçeve → hata
  const otherFrame = { executeJavaScript: async () => ({ bounds: { x: 0, y: 0, width: 900, height: 900 } }) };
  ctx.__frames = [mainFrame, otherFrame];
  await assert.rejects(
    vm.runInContext('captureBrowserVideoFrame(__tab, false)', ctx), /iç içe bir çerçevede/);
  // medya yok → hata
  ctx.__frames = [];
  await assert.rejects(
    vm.runInContext('captureBrowserVideoFrame(__tab, false)', ctx), /görünür video bulunamadı/);
}

async function t_save_capture() {
  const { ctx, calls } = makeCtx();
  evalAll(ctx);
  const wc = makeWc();
  wc.capturePage = async () => ({ isEmpty: () => false, toPNG: () => Buffer.from('png') });
  const tab = { view: { webContents: wc, getBounds: () => ({}) } };
  ctx.__tab = tab;
  // boş görüntü → hata
  wc.capturePage = async () => ({ isEmpty: () => true });
  let r = await vm.runInContext("saveBrowserPageCapture(__tab,'t',{mode:'viewport'})", ctx);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /boş döndü/);
  // save:false + copy:true → clipboard, diyalog yok
  wc.capturePage = async () => ({ isEmpty: () => false, toPNG: () => Buffer.from('png') });
  r = await vm.runInContext("saveBrowserPageCapture(__tab,'t',{mode:'viewport',copy:true,save:false})", ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.copied, true);
  assert.ok(calls.clipboard, 'clipboard yazılmadı');
  // save → .png uzantısı normalleştirilir + atomik yazma
  ctx.__saveDialog = { canceled: false, filePath: '/tmp/pictures/resim' };
  r = await vm.runInContext("saveBrowserPageCapture(__tab,'t',{mode:'viewport'})", ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.path, '/tmp/pictures/resim.png');
  assert.deepStrictEqual(calls.written, [['/tmp/pictures/resim.png', 3]]);
  // iptal
  ctx.__saveDialog = { canceled: true };
  r = await vm.runInContext("saveBrowserPageCapture(__tab,'t',{mode:'viewport'})", ctx);
  assert.strictEqual(r.canceled, true);
  // görünüm yok → hata
  r = await vm.runInContext("saveBrowserPageCapture({view:null},'t',{})", ctx);
  assert.strictEqual(r.ok, false);
}

async function t_save_archive() {
  const { ctx } = makeCtx();
  evalAll(ctx);
  const wc = makeWc();
  const tab = { view: { webContents: wc } };
  ctx.__tab = tab;
  // savePage yok → hata
  delete wc.savePage;
  let r = await vm.runInContext('saveBrowserPageArchive(__tab)', ctx);
  assert.strictEqual(r.ok, false);
  // uzantı normalizasyonu
  wc.savePage = async (p, fmt) => { wc.__saved = [p, fmt]; };
  ctx.__saveDialog = { canceled: false, filePath: '/tmp/downloads/sayfa' };
  r = await vm.runInContext('saveBrowserPageArchive(__tab)', ctx);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(wc.__saved, ['/tmp/downloads/sayfa.mhtml', 'MHTML']);
  // .mht korunur
  ctx.__saveDialog = { canceled: false, filePath: '/tmp/downloads/sayfa.mht' };
  r = await vm.runInContext('saveBrowserPageArchive(__tab)', ctx);
  assert.strictEqual(wc.__saved[0], '/tmp/downloads/sayfa.mht');
  // savePage hatası → ok:false
  wc.savePage = async () => { throw new Error('disk dolu'); };
  r = await vm.runInContext('saveBrowserPageArchive(__tab)', ctx);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /disk dolu/);
}

async function main() {
  t_responsiveness();
  t_export_snapshot();
  await t_fullpage_debugger();
  await t_video_frame();
  await t_save_capture();
  await t_save_archive();
  console.log('capture-export-deadzone: 6 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
