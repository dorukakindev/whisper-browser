'use strict';

// R334 ölü-bölge kilidi — openYoutubeTvWindow (src/main.js): sıfır test
// referanslı YouTube TV pencere açılışı. Güvenlik sözleşmeleri:
//   - webPreferences: sandbox+contextIsolation+!nodeIntegration+!webviewTag
//   - setWindowOpenHandler: tamamı reddedilir → openExternalByPolicy
//   - will-navigate/will-redirect: TV dışı URL preventDefault + dışa aç
//   - alt-kare şema bekçisi http/https/about dışını reddeder
//   - did-fail-load yalnız ana kare & code!==-3 hata yayınlar
//   - closed → youtubeTvWindow sıfırlanır + state sıfırlanır
//   - açık pencere: UA değişimi → reconfigure + reload; aynı UA → yalnız show

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function makeCtx() {
  const state = { sent: [], externals: [], navGuard: null, subframeWc: null,
    winCtor: null, sessions: [] };
  class FakeWin extends EventEmitter {
    constructor(opts) { super(); state.winCtor = opts;
      this.webContents = new EventEmitter();
      this.webContents.setUserAgent = (ua) => { this.ua = ua; };
      this.webContents.setWindowOpenHandler = (h) => { this.openHandler = h; };
      this.webContents.isDestroyed = () => false;
      this.loaded = [];
      this.shown = false;
    }
    setMenuBarVisibility() {}
    loadURL(u) { this.loaded.push(u); return Promise.resolve(); }
    show() { this.shown = true; }
    focus() {}
    isDestroyed() { return false; }
    isFullScreen() { return false; }
    setFullScreen() {}
  }
  const tvSession = new EventEmitter();
  tvSession.setPermissionCheckHandler = (h) => { tvSession.permCheck = h; };
  const ctx = vm.createContext({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise,
    Math, Object, Date, console, process, EventEmitter,
    BrowserWindow: FakeWin,
    session: { fromPartition: (p) => { state.sessions.push(p); return tvSession; } },
    youtubeTvWindow: null,
    youtubeTvState: { userAgent: '', open: false },
    youtubeTvMode: {
      TV_PARTITION: 'persist:tv', TV_START_URL: 'https://www.youtube.com/tv',
      tvUserAgent: (id) => ({ id: id || 'default', value: `UA/${id || 'default'}` }),
      isAllowedTvNavigation: (u) => /^https:\/\/(?:www\.)?youtube\.com\//i.test(u),
      isTvAppUrl: (u) => /^https:\/\/(?:www\.)?youtube\.com\/tv/i.test(u),
      videoIdFromTvUrl: () => '',
    },
    configureYoutubeTvSession: () => {},
    sendYoutubeTvState: (patch) => {
      Object.assign(ctx.youtubeTvState, patch); state.sent.push(patch);
    },
    openExternalByPolicy: async (u) => { state.externals.push(u); },
    attachSubframeSchemeGuard: (wc, opts) => { state.subframeWc = { wc, opts }; },
    browserLoadError: (c, d) => ({ message: `err:${c}:${d}` }),
    mainWindow: null,
    mainWindowClosing: false,
    browserSessionMutationPromise: null,
    __state: state,
  });
  return { ctx, state, FakeWin };
}

function evalTv(ctx) {
  vm.runInContext(
    section('function openYoutubeTvWindow(', 'ipcMain.handle('),
    ctx);
}

function t_security_prefs() {
  const { ctx, state } = makeCtx();
  evalTv(ctx);
  const r = vm.runInContext("openYoutubeTvWindow('chr')", ctx);
  assert.strictEqual(r.ok, true);
  const wp = state.winCtor.webPreferences;
  assert.strictEqual(wp.sandbox, true);
  assert.strictEqual(wp.contextIsolation, true);
  assert.strictEqual(wp.nodeIntegration, false);
  assert.strictEqual(wp.webviewTag, false);
  assert.strictEqual(state.winCtor.autoHideMenuBar, true);
  assert.strictEqual(state.winCtor.show, false);
}

async function t_nav_guards() {
  const { ctx, state } = makeCtx();
  evalTv(ctx);
  vm.runInContext("openYoutubeTvWindow('x')", ctx);
  const win = ctx.youtubeTvWindow;
  const wc = win.webContents;
  // will-navigate: TV dışı URL engellenir + dışa açılır
  const navH = wc.listeners('will-navigate')[0];
  const ev1 = { prevented: false, preventDefault() { this.prevented = true; } };
  navH(ev1, 'https://evil.example/x');
  assert.strictEqual(ev1.prevented, true, 'TV dışı navigasyon engellenmedi');
  await Promise.resolve();
  assert.deepStrictEqual(state.externals, ['https://evil.example/x']);
  // TV URL serbest
  const ev2 = { prevented: false, preventDefault() { this.prevented = true; } };
  navH(ev2, 'https://www.youtube.com/tv');
  assert.strictEqual(ev2.prevented, false);
  // window.open: hep reddedilir
  const open = win.openHandler({ url: 'https://evil.example/pop' });
  assert.strictEqual(open.action, 'deny');
  await Promise.resolve();
  assert.ok(state.externals.includes('https://evil.example/pop'));
  // alt-kare şema bekçisi kuruldu
  assert.ok(state.subframeWc, 'subframe guard takılmadı');
  assert.deepStrictEqual(Array.from(state.subframeWc.opts.allowSchemes),
    ['http:', 'https:', 'about:']);
}

function t_fail_load_and_closed() {
  const { ctx, state } = makeCtx();
  evalTv(ctx);
  vm.runInContext("openYoutubeTvWindow('x')", ctx);
  const win = ctx.youtubeTvWindow;
  const wc = win.webContents;
  // did-fail-load: -3 (abort) yoksayılır; ana-kare dışı yoksayılır
  wc.emit('did-fail-load', null, -3, 'aborted', 'u', true);
  wc.emit('did-fail-load', null, -105, 'dns', 'u', false);
  assert.strictEqual(state.sent.filter((p) => p.error).length, 0);
  wc.emit('did-fail-load', null, -105, 'dns hatası', 'u', true);
  const errs = state.sent.filter((p) => p.error);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0].error, /err:-105/);
  // closed → pencere sıfırlanır + state kapanır
  win.emit('closed');
  assert.strictEqual(ctx.youtubeTvWindow, null);
  const last = state.sent.at(-1);
  assert.strictEqual(last.open, false);
}

function t_reopen_same_and_new_ua() {
  const { ctx, state } = makeCtx();
  evalTv(ctx);
  vm.runInContext("openYoutubeTvWindow('a')", ctx);
  const win1 = ctx.youtubeTvWindow;
  win1.loaded = [];
  // aynı UA → yeni pencere yaratılmaz, reload yapılmaz
  vm.runInContext("openYoutubeTvWindow('a')", ctx);
  assert.strictEqual(ctx.youtubeTvWindow, win1);
  assert.strictEqual(win1.loaded.length, 0);
  assert.strictEqual(win1.shown, true);
  // farklı UA → aynı pencerede UA değişimi + reload
  vm.runInContext("openYoutubeTvWindow('b')", ctx);
  assert.strictEqual(ctx.youtubeTvWindow, win1);
  assert.strictEqual(win1.ua, 'UA/b');
  assert.deepStrictEqual(win1.loaded, ['https://www.youtube.com/tv']);
}

async function main() {
  t_security_prefs();
  await t_nav_guards();
  t_fail_load_and_closed();
  t_reopen_same_and_new_ua();
  console.log('tv-window-deadzone: 4 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
