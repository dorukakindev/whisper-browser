'use strict';

// R334 ölü-bölge kilidi — kapanış yakalama boşaltma zinciri (src/main.js):
// drainBrowserCaptureBeforeClose, browserCaptureCloseNeedsWarning,
// browserTabCapturePending, backgroundBrowserCapturePending,
// confirmBrowserCaptureDiscard, flushBrowserSession — hepsi sıfır test
// referanslı. Sözleşmeler:
//   - görünüm yok/destroyed/compatMode → {pending:0,inFlight:0}
//   - pause → flush → statusScript toplamı, pending=0 olana dek ≤4 pass
//   - warning: pending>0 veya (includeUnverified && unverified)
//   - tab pending: destroyed/compat → 0, hata → unverified:true
//   - background: dışlanan sekme atlanır, toplam pending
//   - confirm: pending=0&&!unverified → true; dialog response 1 → true
//   - flushSession: aktif mutation beklenir, persist ok!==false

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

function makeCtx(over = {}) {
  const calls = { poll: 0, pause: 0, flush: 0, status: 0 };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise,
    Math, Object, Date, console, process,
    BROWSER_SCRIPT_TIMEOUT: 5000,
    browserView: { webContents: { isDestroyed: () => false } },
    activeBrowserTab: () => ({ compatibilityMode: false }),
    browserCaptureFlushPromise: null,
    stopBrowserPolling: () => { calls.poll++; },
    withTimeout: (p) => p,
    executeBrowserFrames: async (script) => {
      if (String(script).includes('pause')) { calls.pause++; return []; }
      calls.status++;
      return ctx.__statusFrames || [];
    },
    executeBrowserViewFrames: async (view, script) => {
      if (String(script).includes('pause')) return [];
      return ctx.__statusFrames || [];
    },
    flushBrowserCaptureQueue: async () => { calls.flush++; },
    browserCapturePauseScript: () => 'pause()',
    browserCaptureStatusScript: () => 'status()',
    browserTabs: new Map(),
    dialog: { showMessageBox: async () => ({ response: ctx.__dialogResponse ?? 0 }) },
    mainWindow: { isDestroyed: () => false },
    dt: (tr, en) => tr,
    browserSessionMutationPromise: null,
    persistBrowserSessionNow: () => ctx.__persistResult ?? { ok: true },
    browserOrderlyShutdown: false,
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function j(x) { return JSON.stringify(x); }

function evalFns(ctx) {
  vm.runInContext(
    section('async function drainBrowserCaptureBeforeClose(', 'async function shutdownPersistentBrowserSession('),
    ctx);
}

async function t_early_returns() {
  // görünüm yok
  let { ctx } = makeCtx({ browserView: null });
  evalFns(ctx);
  let r = await vm.runInContext('drainBrowserCaptureBeforeClose()', ctx);
  assert.strictEqual(j(r), j({ pending: 0, inFlight: 0 }));
  // destroyed
  ({ ctx } = makeCtx({ browserView: { webContents: { isDestroyed: () => true } } }));
  evalFns(ctx);
  r = await vm.runInContext('drainBrowserCaptureBeforeClose()', ctx);
  assert.strictEqual(j(r), j({ pending: 0, inFlight: 0 }));
  // compatMode
  ({ ctx } = makeCtx({ activeBrowserTab: () => ({ compatibilityMode: true }) }));
  evalFns(ctx);
  r = await vm.runInContext('drainBrowserCaptureBeforeClose()', ctx);
  assert.strictEqual(j(r), j({ pending: 0, inFlight: 0 }));
}

async function t_drain_loop_and_sum() {
  const { ctx, calls } = makeCtx();
  evalFns(ctx);
  // 1. pass: pending 2 → 2. pass: 0
  let pass = 0;
  ctx.__statusFrames = null;
  const origExec = ctx.executeBrowserFrames;
  ctx.executeBrowserFrames = async (script) => {
    if (String(script).includes('pause')) return [];
    pass++;
    return pass === 1 ? [{ pending: 2, inFlight: 1 }] : [{ pending: 0, inFlight: 0 }];
  };
  const r = await vm.runInContext('drainBrowserCaptureBeforeClose()', ctx);
  assert.strictEqual(calls.poll, 1, 'stopBrowserPolling çağrılmadı');
  assert.strictEqual(pass, 2, 'pending sıfırlanana dek döngü sürmedi');
  assert.strictEqual(calls.flush, 2);
  assert.strictEqual(j(r), j({ pending: 0, inFlight: 0 }));
  // persist pending → 4 pass sınırı
  ctx.executeBrowserFrames = async () => [{ pending: 9, inFlight: 3 }];
  calls.flush = 0;
  const r2 = await vm.runInContext('drainBrowserCaptureBeforeClose()', ctx);
  assert.strictEqual(calls.flush, 4, '4-pass sınırı aşıldı');
  assert.strictEqual(j(r2), j({ pending: 9, inFlight: 3 }));
}

function t_warning() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  const w = (s, i) => vm.runInContext(
    `browserCaptureCloseNeedsWarning(${JSON.stringify(s)}, ${!!i})`, ctx);
  assert.strictEqual(w({ pending: 0, unverified: false }), false);
  assert.strictEqual(w({ pending: 3, unverified: false }), true);
  assert.strictEqual(w({ pending: 0, unverified: true }), false, 'unverified tek başına uyarmamalı');
  assert.strictEqual(w({ pending: 0, unverified: true }, true), true);
  assert.strictEqual(w(null), false);
}

async function t_tab_pending() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  // destroyed → sıfır, verify yok
  let r = await vm.runInContext(
    "browserTabCapturePending({ view: { webContents: { isDestroyed: () => true } } })", ctx);
  assert.strictEqual(j(r), j({ pending: 0, unverified: false }));
  // compatMode → sıfır
  r = await vm.runInContext(
    "browserTabCapturePending({ compatibilityMode: true, view: { webContents: { isDestroyed: () => false } } })", ctx);
  assert.strictEqual(j(r), j({ pending: 0, unverified: false }));
  // normal: toplam pending
  ctx.__statusFrames = [{ pending: 2 }, { pending: 5 }];
  r = await vm.runInContext(
    "browserTabCapturePending({ view: { webContents: { isDestroyed: () => false } } })", ctx);
  assert.strictEqual(j(r), j({ pending: 7, unverified: false }));
  // hata → unverified
  ctx.executeBrowserViewFrames = async () => { throw new Error('kare ölü'); };
  r = await vm.runInContext(
    "browserTabCapturePending({ view: { webContents: { isDestroyed: () => false } } })", ctx);
  assert.strictEqual(r.unverified, true);
  assert.match(r.error, /kare ölü/);
}

async function t_background_excludes() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  ctx.browserTabs = new Map([
    ['a', { id: 'a', view: { webContents: { isDestroyed: () => false } } }],
    ['b', { id: 'b', view: { webContents: { isDestroyed: () => false } } }],
  ]);
  const tabA = ctx.browserTabs.get('a');
  const tabB = ctx.browserTabs.get('b');
  tabA.view.__pend = 4;
  tabB.view.__pend = 7;
  ctx.executeBrowserViewFrames = async (view, script) => {
    if (String(script).includes('pause')) return [];
    return [{ pending: view.__pend || 0 }];
  };
  const r = await vm.runInContext("backgroundBrowserCapturePending('a')", ctx);
  assert.strictEqual(r, 7, 'dışlanan sekme sayıldı');
  const all = await vm.runInContext("backgroundBrowserCapturePending('')", ctx);
  assert.strictEqual(all, 11);
}

async function t_confirm_and_flush() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  // pending=0, unverified=false → diyalogsuz true
  let r = await vm.runInContext("confirmBrowserCaptureDiscard(0)", ctx);
  assert.strictEqual(r, true);
  // pending>0 → dialog response 0 → false
  ctx.__dialogResponse = 0;
  r = await vm.runInContext("confirmBrowserCaptureDiscard(3)", ctx);
  assert.strictEqual(r, false);
  ctx.__dialogResponse = 1;
  r = await vm.runInContext("confirmBrowserCaptureDiscard(3)", ctx);
  assert.strictEqual(r, true);
  // unverified → yine de kapat diyaloğu
  ctx.__dialogResponse = 1;
  r = await vm.runInContext("confirmBrowserCaptureDiscard(0, 'sekme', true)", ctx);
  assert.strictEqual(r, true);
  // flushSession: mutation beklenir + persist
  let waited = false;
  ctx.browserSessionMutationPromise = Promise.resolve().then(() => { waited = true; });
  r = await vm.runInContext('flushBrowserSession()', ctx);
  assert.strictEqual(waited, true, 'aktif mutation beklenmedi');
  assert.strictEqual(r, true);
  ctx.__persistResult = { ok: false };
  r = await vm.runInContext('flushBrowserSession()', ctx);
  assert.strictEqual(r, false);
  ctx.__persistResult = null;
  ctx.persistBrowserSessionNow = () => { throw new Error('patladı'); };
  r = await vm.runInContext('flushBrowserSession()', ctx);
  assert.strictEqual(r, false);
}

async function main() {
  await t_early_returns();
  await t_drain_loop_and_sum();
  t_warning();
  await t_tab_pending();
  await t_background_excludes();
  await t_confirm_and_flush();
  console.log('capture-drain-deadzone: 6 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
