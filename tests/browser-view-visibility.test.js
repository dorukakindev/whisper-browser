'use strict';

// R246: gizli WebContentsView, sınırı yerel yuvanın üstünde kalınca Windows'ta
// HWND'i bölgedeki işaretçi olaylarını yutabiliyor — yeni-sekme sayfasında
// (#browserEmpty) tıklama ve imleç ölüyor, klavye çalışıyordu. Gizlenen
// görünümün sınırı ekran dışına taşınmalı; gösterilende sınır yeniden
// uygulanmalı.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SLOT = { x: 10, y: 20, width: 800, height: 600 };
const makeView = () => ({
  bounds: { ...SLOT },
  visible: true,
  webContents: { isDestroyed: () => false },
  setBounds(b) { this.bounds = { ...b }; },
  getBounds() { return this.bounds; },
  setVisible(v) { this.visible = v; },
});

function makeContext() {
  const state = { visible: true, active: null, secondary: null };
  const context = {
    browserExtras: { mini: { owns: () => false, layout: () => false } },
    browserBounds: { ...SLOT },
    browserSplitRatio: 0.5,
    splitBrowserBounds: () => ({ primary: { ...SLOT }, secondary: { ...SLOT, x: 410 } }),
    browserFullscreenBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
    secondaryBrowserTab: () => state.secondary,
    activeBrowserTab: () => state.active,
    browserTabShouldBeVisible: () => state.visible,
    browserTabs: new Map(),
    browserActiveTabId: '',
    browserSplitSecondaryTabId: '',
    __state: state,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('function applyBrowserViewBounds(');
  const end = source.indexOf('function cancelBrowserPermissionRequestsForTab(');
  assert.ok(start > 0 && end > start, 'görünüm düzeni kaynağı bulunamadı');
  vm.runInContext(source.slice(start, end), context);
  return { context, state };
}

test('gizlenen görünüm sınırı ekran dışına taşınır (HWND girdisi ölür)', () => {
  const { context } = makeContext();
  assert.equal(typeof context.hideBrowserViewOffscreen, 'function');
  const view = makeView();
  context.hideBrowserViewOffscreen(view);
  assert.equal(view.visible, false);
  assert.equal(view.bounds.x, -10000);
  assert.equal(view.bounds.y, -10000);
  assert.equal(view.bounds.width, 800);
  assert.equal(view.bounds.height, 600);
});

test('gösterilen görünümde sınır yeniden uygulanır', () => {
  const { context } = makeContext();
  const view = makeView();
  view.bounds = { x: -10000, y: -10000, width: 800, height: 600 };
  view.visible = false;
  context.setBrowserViewShown({ id: 't1' }, view, true);
  assert.deepEqual(view.bounds, SLOT);
  assert.equal(view.visible, true);
});

test('yerleşim: boş sekme gizlenince ekran dışına iner, sayfalı sekme yuvada kalır', () => {
  const { context, state } = makeContext();
  const active = { id: 'a', view: makeView() };
  const idle = { id: 'b', view: makeView() };
  state.active = active;
  context.browserActiveTabId = 'a';
  context.browserTabs.set('a', active);
  context.browserTabs.set('b', idle);

  // Boş yeni-sekme: görünmemeli — her iki görünüm de yuvayı terk etmeli.
  state.visible = false;
  context.applyBrowserViewsLayout();
  assert.equal(active.view.bounds.x, -10000, 'boş sekmenin görünümü sınırda kalmamalı');
  assert.equal(idle.view.bounds.x, -10000, 'arka plan görünümü sınırda kalmamalı');
  assert.equal(active.view.visible, false);

  // Sayfa yüklenince: aktif görünüm yuvaya döner, arka plan ekran dışında kalır.
  state.visible = true;
  context.applyBrowserViewsLayout();
  assert.deepEqual(active.view.bounds, SLOT);
  assert.equal(active.view.visible, true);
  assert.equal(idle.view.bounds.x, -10000);
  assert.equal(idle.view.visible, false);
});

test('bozulmuş webContents dokunulmaz', () => {
  const { context } = makeContext();
  const dead = makeView();
  dead.webContents = { isDestroyed: () => true };
  context.hideBrowserViewOffscreen(dead);
  assert.equal(dead.visible, true, 'bozulmuş görünüme yazılmaz');
});
