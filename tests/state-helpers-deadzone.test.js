'use strict';

// R334 ölü-bölge kilidi — küçük saf yardımcı kümesi (src/main.js):
// uniqueStrings, subtitleSeconds, nextBrowserTabId, safeBrowserBounds,
// browserZoomForUrl, rememberBrowserZoom, loadWindowState, saveWindowState,
// titleBarOverlayForTheme, processIsAlive — sıfır test referanslı.

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

function makeCtx(userData, over = {}) {
  const calls = { atomic: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    path, fs,
    app: { getPath: (k) => k === 'userData' ? userData : `/tmp/${k}` },
    browserTabSequence: 0,
    browserTabs: new Map(),
    readBrowserPlaces: () => ctx.__places,
    withBrowserSiteProfileField: (profiles, url, field, value) => {
      const next = { ...(profiles || {}) };
      const origin = ctx.browserSiteOrigin(url);
      if (value == null) delete next[origin]?.[field];
      else next[origin] = { ...(next[origin] || {}), [field]: value };
      return { ok: true, profiles: next };
    },
    browserSiteOrigin: (u) => { try { return new URL(u).origin; } catch (_) { return null; } },
    setBrowserPlaces: (p) => { ctx.__places = p; return ctx.__writeOk !== false; },
    windowStateForDisk: (b, max) => ({ width: b.width, height: b.height, maximized: !!max }),
    writeJsonAtomic: (t, o) => { calls.atomic.push(t); fs.writeFileSync(t, JSON.stringify(o)); },
    mainWindow: null,
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalAll(ctx) {
  vm.runInContext([
    section('function uniqueStrings(', 'function upsertWatchItem('),
    section('function subtitleSeconds(', 'function subtitleSearchBlocks('),
    section('function windowStatePath(', '// ===== YouTube akışı'),
    section('function nextBrowserTabId(', 'function createBrowserTabRecord('),
    section('function browserZoomForUrl(', 'function readBrowserPlaces('),
    section('function safeBrowserBounds(', 'function browserFullscreenBounds('),
    section('function titleBarOverlayForTheme(', '// Paket/kurulum bütünlüğü'),
    section('function processIsAlive(', 'function processNameForPid('),
  ].join('\n'), ctx);
}

function t_unique_strings() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const u = (v) => { ctx.__v = v; return Array.from(vm.runInContext('uniqueStrings(__v)', ctx)); };
  assert.deepStrictEqual(u([' a ', 'a', 'b', '', '  ', 5, null, 'b']), ['a', 'b']);
  assert.deepStrictEqual(u('not-array'), []);
  assert.deepStrictEqual(u(null), []);
}

function t_subtitle_seconds() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const s = (b) => { ctx.__b = b; return vm.runInContext('subtitleSeconds(__b)', ctx); };
  // SRT HH:MM:SS,mmm
  assert.strictEqual(s('1\n00:01:02,500 --> 00:01:03,000\nx'), 62.5);
  // VTT MM:SS.mmm (saat atlanmış)
  assert.strictEqual(s('WEBVTT\n\n02:30.250 --> 02:31.000\nx'), 150.25);
  // tek haneli dakika toleransı
  assert.strictEqual(s('5:07.5 --> 5:08.0\nx'), 307.5);
  // milisaniye padEnd: .7 → 700ms değil 7ms
  assert.strictEqual(s('00:00:01.7 --> x'), 1.7);
  // ASS Dialogue: H:MM:SS.cc (centiseconds)
  assert.strictEqual(s('Dialogue: 0,1:02:03.45,Default,,0,0,0,,text'), 3723.45);
  assert.strictEqual(s('Dialogue: 0,0:00:05.5,Default,,0,0,0,,t'), 5.5);
  // eşleşme yok → 0
  assert.strictEqual(s('metin yok'), 0);
}

function t_tab_id() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const a = vm.runInContext('nextBrowserTabId()', ctx);
  const b = vm.runInContext('nextBrowserTabId()', ctx);
  assert.match(a, /^tab-[a-z0-9]+-[a-z0-9]+$/);
  assert.notStrictEqual(a, b, 'sekme kimliği tekrar üretti');
  assert.ok(ctx.browserTabSequence === 2);
}

function t_safe_bounds() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  // pencere yok → null
  assert.strictEqual(vm.runInContext('safeBrowserBounds({x:0,y:0,width:100,height:100})', ctx), null);
  ctx.mainWindow = {
    isDestroyed: () => false,
    getContentBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
  };
  const sb = (r) => { ctx.__r = r; return vm.runInContext('safeBrowserBounds(__r)', ctx); };
  // taşma kelepçe
  let r = sb({ x: 700, y: 500, width: 200, height: 200 });
  assert.deepStrictEqual([r.x, r.y, r.width, r.height], [700, 500, 100, 100]);
  // tamamen dışarı → null
  assert.strictEqual(sb({ x: 900, y: 0, width: 50, height: 50 }), null);
  assert.strictEqual(sb({ x: 0, y: 700, width: 50, height: 50 }), null);
  // negatif → 0 kelepçe
  r = sb({ x: -50, y: -10, width: 100, height: 100 });
  assert.strictEqual(r.x, 0); assert.strictEqual(r.y, 0);
  // destroyed → null
  ctx.mainWindow.isDestroyed = () => true;
  assert.strictEqual(sb({ x: 0, y: 0, width: 10, height: 10 }), null);
}

function t_zoom() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  ctx.__places = { siteProfiles: { 'https://a.b': { zoom: 1.5 } } };
  const z = (u) => { ctx.__u = u; return vm.runInContext('browserZoomForUrl(__u)', ctx); };
  assert.strictEqual(z('https://a.b/sayfa'), 1.5);
  assert.strictEqual(z('https://c.d/'), 1, 'kayıtsız origin → 1');
  // aralık dışı kayıt → 1
  ctx.__places.siteProfiles['https://e.f'] = { zoom: 9 };
  assert.strictEqual(z('https://e.f/'), 1);
  // remember: geçersiz reddedilir
  const rem = (u, zv) => { ctx.__u = u; ctx.__zv = zv; return vm.runInContext('rememberBrowserZoom(__u, __zv)', ctx); };
  assert.strictEqual(JSON.stringify(rem('https://a.b/', 'abc')), JSON.stringify({ ok: false, reason: 'invalid' }));
  assert.strictEqual(JSON.stringify(rem('https://a.b/', 5)), JSON.stringify({ ok: false, reason: 'invalid' }));
  // ≈1 → profil silinir (null yazımı)
  ctx.__places.siteProfiles = { 'https://a.b': { zoom: 1.5 } };
  assert.strictEqual(rem('https://a.b/', 1.0005).ok, true);
  assert.strictEqual(ctx.__places.siteProfiles['https://a.b'].zoom, undefined, 'zoom≈1 silinmedi');
  // geçerli → yazılır
  assert.strictEqual(rem('https://a.b/', 2).ok, true);
  assert.strictEqual(ctx.__places.siteProfiles['https://a.b'].zoom, 2);
  // yazım hatası → write
  ctx.__writeOk = false;
  assert.strictEqual(JSON.stringify(rem('https://a.b/', 2)), JSON.stringify({ ok: false, reason: 'write' }));
}

function t_window_state() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winstate-'));
  const { ctx, calls } = makeCtx(dir);
  evalAll(ctx);
  const p = path.join(dir, 'window-state.json');
  // dosya yok → null
  assert.strictEqual(vm.runInContext('loadWindowState()', ctx), null);
  // bozuk JSON → null
  fs.writeFileSync(p, '{{{');
  assert.strictEqual(vm.runInContext('loadWindowState()', ctx), null);
  // geçerli → parse
  fs.writeFileSync(p, JSON.stringify({ width: 900, height: 700, maximized: false }));
  const st = vm.runInContext('loadWindowState()', ctx);
  assert.strictEqual(st.width, 900);
  // save: pencere yok → yazılmaz
  vm.runInContext('saveWindowState()', ctx);
  assert.strictEqual(calls.atomic.length, 0);
  // maximized → normal bounds saklanır
  ctx.mainWindow = {
    isDestroyed: () => false,
    getNormalBounds: () => ({ x: 1, y: 2, width: 1024, height: 768 }),
    getBounds: () => ({ x: 0, y: 0, width: 9999, height: 9999 }),
    isMaximized: () => true,
  };
  vm.runInContext('saveWindowState()', ctx);
  const saved = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.strictEqual(saved.width, 1024, 'maximized iken tam-boyut saklandı');
  assert.strictEqual(saved.maximized, true);
}

function t_titlebar_and_alive() {
  const { ctx } = makeCtx('/tmp/x');
  evalAll(ctx);
  const t = (th) => { ctx.__th = th; return vm.runInContext('titleBarOverlayForTheme(__th)', ctx); };
  assert.strictEqual(t('light').color, '#f1ede5');
  assert.strictEqual(t('light').symbolColor, '#514a43');
  assert.strictEqual(t('dark').color, '#0a0d11');
  assert.strictEqual(t('x').height, 38, 'bilinmeyen tema koyu dala düşmeli');
  const alive = vm.runInContext(`processIsAlive(${process.pid})`, ctx);
  assert.strictEqual(alive, true);
  assert.strictEqual(vm.runInContext('processIsAlive(-1)', ctx), false);
  assert.strictEqual(vm.runInContext("processIsAlive('abc')", ctx), false);
}

function main() {
  t_unique_strings();
  t_subtitle_seconds();
  t_tab_id();
  t_safe_bounds();
  t_zoom();
  t_window_state();
  t_titlebar_and_alive();
  console.log('state-helpers-deadzone: 7 senaryo geçti');
}

main();
