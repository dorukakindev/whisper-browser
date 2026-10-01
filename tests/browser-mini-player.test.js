'use strict';
/**
 * browser-mini-player birim testleri (R139).
 * BrowserWindow/ipcMain sahte nesnelerle — Electron gerekmez.
 */
const assert = require('assert');
const { createBrowserMiniPlayer } = require('../src/browser-mini-player');

function harness() {
  const calls = { command: [], restore: 0, windows: [] };
  const ipcHandlers = {};
  const ipcMain = { handle: (ch, fn) => { ipcHandlers[ch] = fn; } };
  function makeTab(id, destroyed = false) {
    return {
      id,
      closing: false,
      lifecycle: 'background',
      view: {
        bounds: null,
        visible: false,
        webContents: { isDestroyed: () => destroyed },
        setBounds(b) { this.bounds = b; },
        setVisible(v) { this.visible = v; },
      },
    };
  }
  const main = {
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    contentView: { removed: [], addChildView(v) { this.added = v; }, removeChildView(v) { this.removed.push(v); } },
  };
  function BrowserWindow() {
    const listeners = {};
    const w = {
      listeners,
      destroyed: false,
      focused: 0,
      closed: false,
      webContents: {
        id: 'mini', mainFrame: 'frame',
        openHandler: null, guardListeners: 0,
        setWindowOpenHandler(fn) { this.openHandler = fn; },
        on() { this.guardListeners += 1; },
        removeListener() {},
      },
      contentView: { added: null, addChildView(v) { this.added = v; }, removeChildView() {} },
      getContentSize: () => [800, 500],
      isDestroyed() { return this.destroyed || this.closed; },
      focus() { this.focused += 1; },
      on(ev, fn) { listeners[ev] = fn; },
      loadFile() {},
      close() { this.closed = true; if (listeners.close) listeners.close(); },
    };
    calls.windows.push(w);
    return w;
  }
  const player = createBrowserMiniPlayer({
    BrowserWindow,
    ipcMain,
    owner: () => (main.destroyed ? null : main),
    restore: () => { calls.restore += 1; },
    command: (tab, action, arg) => { calls.command.push({ tab: tab.id, action, arg }); return { ok: true }; },
  });
  return { calls, ipcHandlers, makeTab, main, player };
}

// open: hedef view yok → ok:false
{
  const h = harness();
  const r = h.player.open(null);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /video sayfası/);
}
// open: yok edilmiş view → ok:false
{
  const h = harness();
  const tab = h.makeTab('t1', true);
  assert.strictEqual(h.player.open(tab).ok, false);
}
// open: ana pencere yok → ok:false
{
  const h = harness();
  h.main.destroyed = true;
  assert.strictEqual(h.player.open(h.makeTab('t1')).ok, false);
}
// open: başarılı → view taşınır, layout uygulanır, aynı hedef tekrar open → focus
{
  const h = harness();
  const tab = h.makeTab('t1');
  const r = h.player.open(tab);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(h.calls.windows.length, 1);
  assert.deepStrictEqual(h.main.contentView.removed, [tab.view]);
  assert.strictEqual(h.calls.windows[0].contentView.added, tab.view);
  // layout: 800×500 → view 800×452 (48px alt çubuk)
  assert.deepStrictEqual(tab.view.bounds, { x: 0, y: 0, width: 800, height: 452 });
  assert.strictEqual(tab.view.visible, true);
  // aynı tab tekrar open → yeni pencere yerine focus
  assert.strictEqual(h.player.open(tab).ok, true);
  assert.strictEqual(h.calls.windows.length, 1);
  assert.strictEqual(h.calls.windows[0].focused, 1);
  // R265: yerel pencere navigasyon kilitleri bağlanır (pencere-açma deny +
  // will-navigate/will-redirect preventDefault + subframe şema reddi)
  const wc = h.calls.windows[0].webContents;
  assert.strictEqual(typeof wc.openHandler, 'function');
  assert.deepStrictEqual(wc.openHandler({ url: 'https://evil.test/' }), { action: 'deny' });
  assert.strictEqual(wc.guardListeners, 3); // will-navigate, will-redirect, will-frame-navigate
}
// owns: yalnız açık hedef için true; pencere kapandıktan sonra false
{
  const h = harness();
  const tab = h.makeTab('t1');
  const other = h.makeTab('t2');
  h.player.open(tab);
  assert.strictEqual(h.player.owns(tab), true);
  assert.strictEqual(h.player.owns(other), false);
  // kapanma → view geri taşınır + restore çağrılır
  h.calls.windows[0].close();
  assert.strictEqual(h.player.owns(tab), false);
  assert.strictEqual(h.calls.restore, 1);
}
// mini:command handler — yanlış sender → ok:false; geçersiz action → ok:false
async function commandSuite() {
  const h = harness();
  const handler = h.ipcHandlers['browser:mini:command'];
  const tab = h.makeTab('t1');
  h.player.open(tab);
  const win = h.calls.windows[0];
  // sender eşleşmiyor
  const bad = await handler({ sender: { x: 1 }, senderFrame: 'frame' }, 'play-pause');
  assert.deepStrictEqual(bad, { ok: false });
  // geçersiz action
  const badAction = await handler({ sender: win.webContents, senderFrame: 'frame' }, 'hack');
  assert.deepStrictEqual(badAction, { ok: false });
  // action eşleme: back→seek-relative(-10), forward→+10, play-pause→olduğu gibi
  await handler({ sender: win.webContents, senderFrame: 'frame' }, 'back');
  await handler({ sender: win.webContents, senderFrame: 'frame' }, 'forward');
  await handler({ sender: win.webContents, senderFrame: 'frame' }, 'play-pause');
  assert.deepStrictEqual(h.calls.command, [
    { tab: 't1', action: 'seek-relative', arg: -10 },
    { tab: 't1', action: 'seek-relative', arg: 10 },
    { tab: 't1', action: 'play-pause', arg: undefined },
  ]);
}
// R308: sekme kapanırken/boşaltılırken geri bağlama atlanır
{
  const h = harness();
  const tab = h.makeTab('t1');
  h.player.open(tab);
  // destroyBrowserTab yolu: closing → görünüm geri bağlanmaz, restore çalışmaz
  tab.closing = true;
  const win1 = h.calls.windows[0];
  win1.close();
  assert.strictEqual(h.calls.restore, 0, 'closing sekmede restore çağrılmamalı');
  assert.strictEqual(h.main.contentView.added, undefined, 'closing görünümü ana pencereye bağlanmamalı');
  // unloadBrowserTab yolu: lifecycle 'unloading' → aynı atlama
  const h2 = harness();
  const tab2 = h2.makeTab('t2');
  h2.player.open(tab2);
  tab2.lifecycle = 'unloading';
  h2.calls.windows[0].close();
  assert.strictEqual(h2.calls.restore, 0, 'unloading sekmede restore çağrılmamalı');
  assert.strictEqual(h2.main.contentView.added, undefined, 'unloading görünümü ana pencereye bağlanmamalı');
}
// close/layout: pencere yokken sessiz no-op
{
  const h = harness();
  h.player.close();
  h.player.layout();
}
commandSuite().then(() => {
  console.log('browser-mini-player: 10 senaryo geçti (open guardları, layout, owns, closing/unloading kapanışı, command eşleme)');
}).catch((e) => { console.error(e); process.exit(1); });
