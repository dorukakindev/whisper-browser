// R316 — dokunmatik/HDPI kenar durumları:
// - Sürükleme tutamaçları pointer olaylarını kullanır (mousedown/move/up = dokunmatikte ölü)
// - pointercancel yolunda sürükleme durumu temizlenir (sistem jesti iptali)
// - Tutamaçlarda touch-action: none (aksi halde ilk hareket pan jestine düşer)
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (e) { console.error(`  FAIL  ${name}: ${e.stack || e.message}`); process.exitCode = 1; }
}

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');

const slice = (start, end) => {
  const a = SRC.indexOf(start); const b = SRC.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `dilim bulunamadı: ${start}`);
  return SRC.slice(a, b);
};

function fakeEl(extra = {}) {
  const listeners = {};
  return {
    listeners,
    classList: { added: [], removed: [], add(c) { this.added.push(c); }, remove(c) { this.removed.push(c); }, contains(c) { return this.added.includes(c) && !this.removed.includes(c); } },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch(t, e = {}) { (listeners[t] || []).forEach((f) => f(e)); },
    setPointerCapture() {}, releasePointerCapture() {},
    setAttribute() {}, getBoundingClientRect: () => ({ left: 0, right: 800, width: 800 }),
    style: {}, value: '50',
    ...extra,
  };
}

test('split divider: pointercancel sürüklemeyi bitirir ve oranı işler', () => {
  const divider = fakeEl();
  const ratio = fakeEl({ value: '60' });
  const els = { browserSplitDivider: divider, browserSplitRatio: ratio, browserSplitRatioValue: fakeEl(), browserViewSlot: fakeEl(), browserSplitSecondary: fakeEl(), browserSplitClose: fakeEl() };
  const calls = [];
  const ctx = {
    $: (id) => els[id] ?? null,
    player: { browserSplit: { secondaryTabId: 't2', active: true } },
    setBrowserSplit: (tab, v) => calls.push([tab, v]),
    document: { hidden: true }, window: {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(slice("if ($('browserSplitDivider')) {", 'async function runBrowserMangaLookahead'), ctx);
  divider.dispatch('pointerdown', { pointerId: 7, clientX: 480 });
  divider.dispatch('pointermove', { clientX: 480 });
  // sistem jesti sürüklemeyi iptal eder
  divider.dispatch('pointercancel', { pointerId: 7 });
  assert.ok(divider.classList.removed.includes('is-dragging'), 'is-dragging temizlenmeli');
  assert.deepStrictEqual(calls, [['t2', '60']], 'iptalde sürüklenen oran işlenmeli');
  // iptalden sonra hareket sürüklemeyi sürdürmez
  divider.dispatch('pointermove', { clientX: 100 });
  assert.strictEqual(ratio.value, '60');
});

test('sideResizer: pointer olaylarıyla sürüklenir; pointercancel ile kapanır', () => {
  const rz = fakeEl();
  const body = fakeEl();
  const winListeners = {};
  const ctx = {
    $: (id) => ({ sideResizer: rz, playerLayer: fakeEl() })[id] ?? null,
    document: { querySelector: () => body },
    window: { addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); } },
    setSideWidth: (w) => { ctx.__width = w; },
    highlightCueRow: () => { ctx.__highlight = (ctx.__highlight || 0) + 1; },
    makeSubtitleDraggable: () => {}, loadSubtitlePos: () => {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(slice("if ($('sideResizer')) {", '// Ayar cekmecesi'), ctx);
  assert.ok(rz.listeners.pointerdown, 'pointerdown bağlı');
  assert.ok(winListeners.pointermove && winListeners.pointerup && winListeners.pointercancel,
    'window üzerinde pointermove/up/cancel bağlı');
  rz.dispatch('pointerdown', { button: 0, pointerId: 3, preventDefault() {} });
  winListeners.pointermove.forEach((f) => f({ clientX: 300 }));
  assert.strictEqual(ctx.__width, 500, 'sağ kenar 800 - 300 = 500');
  winListeners.pointercancel.forEach((f) => f({}));
  assert.ok(rz.classList.removed.includes('dragging'), 'dragging temizlenmeli');
  assert.strictEqual(ctx.__highlight, 1, 'cue satırı vurgusu yenilenmeli');
  // sağ tık sürükleme başlatmaz
  rz.dispatch('pointerdown', { button: 2, preventDefault() {} });
  ctx.__width = undefined;
  winListeners.pointermove.forEach((f) => f({ clientX: 100 }));
  assert.strictEqual(ctx.__width, undefined);
});

test('kaynak ratchet: tutamaçlarda touch-action:none + mouse-olayı yok', () => {
  const resizerBlock = slice("if ($('sideResizer')) {", '// Ayar cekmecesi');
  assert.ok(!/mouse(down|move|up)/.test(resizerBlock), 'sideResizer mouse olayı kullanmamalı');
  const dividerBlock = slice("if ($('browserSplitDivider')) {", 'async function runBrowserMangaLookahead');
  assert.ok(dividerBlock.includes('pointercancel'), 'divider pointercancel dinlemeli');
  const resizerCss = CSS.match(/\.side-resizer\s*\{[^}]*\}/g).find((b) => b.includes('col-resize'));
  assert.ok(resizerCss && resizerCss.includes('touch-action: none'), 'side-resizer touch-action:none');
  assert.ok(/\.browser-split-divider\s*\{[^}]*touch-action:\s*none/.test(CSS), 'split-divider touch-action:none');
});

console.log(`touch-hdpi: ${passed} kontrol geçti`);
