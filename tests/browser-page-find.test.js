const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserPageFind } = require('../src/browser-page-find');

class Contents extends EventEmitter {
  id = 0; calls = []; stopped = 0;
  sent = [];
  isDestroyed() { return false; }
  send(channel, payload) { this.sent.push({ channel, payload }); }
  stopFindInPage(action) { assert.equal(action, 'clearSelection'); this.stopped++; }
  findInPage(text, options) { this.calls.push({ text, options }); return ++this.id; }
}
const wc = new Contents(), events = [];
let active = true;
const find = createBrowserPageFind(wc, e => events.push(e), () => active);
assert.equal(find.find({ text: 'İstanbul', token: 1 }).ok, true);
// Electron 43 quirk: yeni oturumda açık findNext:false sonucu düşürür — atlanmalı.
assert.equal('findNext' in wc.calls[0].options, false, 'ilk istekte findNext hiç gönderilmemeli');
assert.equal(wc.calls[0].options.forward, true);
find.find({ text: 'İstanbul', token: 2, next: true, forward: false });
assert.deepEqual(wc.calls[1].options, { forward: false, findNext: true });
wc.emit('found-in-page', {}, { requestId: 1, matches: 9, activeMatchOrdinal: 1 });
assert.equal(events.length, 0, 'eski istek sonucu yayımlandı');
wc.emit('found-in-page', {}, { requestId: 2, matches: 3, activeMatchOrdinal: 2, finalUpdate: true });
assert.deepEqual(events.pop(), { type: 'find-result', token: 2, matches: 3, activeMatch: 2, final: true });
assert.equal(wc.sent.at(-1).channel, 'browser:find-state');
assert.equal(wc.sent.at(-1).payload.active, true);
assert.equal(find.refresh().refreshed, true, 'dinamik sayfa yenilemesi aramayi tazelemiyor');
assert.equal(wc.calls.at(-1).text, 'İstanbul');
find.find({ text: 'Ankara', token: 3, next: true });
assert.equal('findNext' in wc.calls.at(-1).options, false, 'yeni metin mevcut arama oturumunu taşımamalı');
assert.equal(find.find({ text: '', token: 4 }).empty, true);
assert.equal(wc.sent.at(-1).payload.active, false, 'arama kapaninca gozlemci durmuyor');
wc.emit('found-in-page', {}, { requestId: 3, matches: 3 });
assert.equal(events.length, 0);
for (const value of [null, {}, { text: 'x'.repeat(2001), token: 1 }, { text: 'x', token: NaN }]) {
  assert.equal(find.find(value).ok, false);
}
let prevented = 0;
const key = { type: 'keyDown', control: true, key: 'f' };
wc.emit('before-input-event', { preventDefault() { prevented++; } }, key);
assert.equal(prevented, 1);
assert.equal(events.pop().type, 'find-open');
for (const ignored of [{ ...key, type: 'keyUp' }, { ...key, isComposing: true }, { ...key, alt: true }]) {
  wc.emit('before-input-event', { preventDefault() { prevented++; } }, ignored);
}
active = false;
wc.emit('before-input-event', { preventDefault() { prevented++; } }, key);
assert.equal(prevented, 1);
wc.emit('did-start-navigation', { isMainFrame: false });
assert.equal(events.length, 0);
wc.emit('did-start-navigation', { isMainFrame: true });
assert.equal(events.pop().type, 'find-reset');

// Renderer'ın gerçek arama akışı: geciken IPC, tab değişimi, input ve Enter/Esc.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = renderer.indexOf('const browserPageFind =');
const end = renderer.indexOf('\nfunction browserCommand(', start);
const nodes = Object.fromEntries(['Bar', 'Input', 'Count', 'Next', 'Previous', 'Close'].map(suffix => [
  'browserFind' + suffix, { value: '', textContent: '', listeners: {}, classList: { add() {}, remove() {} },
    focus() {}, select() {}, addEventListener(name, handler) { this.listeners[name] = handler; } },
]));
const calls = [], player = { workspaceMode: 'browser', browserActiveTabId: 'one' };
const ctx = { player, $: id => nodes[id], setTimeout, clearTimeout, scheduleBrowserBounds() {},
  window: { api: { browserCommand: async (...args) => { calls.push(args); return { ok: true }; } } },
  browserCommand: async (...args) => { calls.push(args); return { ok: true }; } };
vm.createContext(ctx);
vm.runInContext(renderer.slice(start, end) + '\nglobalThis.findState = browserPageFind;', ctx);
nodes.browserFindInput.value = 'metin';
ctx.openBrowserFind();
assert.equal(calls.at(-1)[0], 'find');
const token = ctx.findState.token;
ctx.receiveBrowserFindEvent({ tabId: 'other', type: 'find-result', token, matches: 5 });
assert.equal(nodes.browserFindCount.textContent, 'Aranıyor…');
ctx.receiveBrowserFindEvent({ tabId: 'one', type: 'find-result', token, matches: 5, activeMatch: 2 });
assert.equal(nodes.browserFindCount.textContent, '2 / 5');
nodes.browserFindInput.listeners.input({ isComposing: true });
ctx.receiveBrowserFindEvent({ tabId: 'one', type: 'find-result', token, matches: 9 });
assert.equal(nodes.browserFindCount.textContent, '2 / 5', 'eski sonuç input sonrası kabul edildi');
nodes.browserFindBar.listeners.keydown({ key: 'Enter', target: nodes.browserFindInput, shiftKey: true, preventDefault() {}, stopPropagation() {} });
assert.equal(calls.at(-1)[1].forward, false);
const beforeButton = calls.length;
nodes.browserFindBar.listeners.keydown({ key: 'Enter', target: nodes.browserFindPrevious, preventDefault() { throw Error('Düğmenin Enter eylemi engellendi'); } });
assert.equal(calls.length, beforeButton);
nodes.browserFindBar.listeners.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
assert.equal(ctx.findState.tabId, '');
assert(calls.some(c => c[0] === 'one' && c[1] === 'find-stop'));
console.log('Sayfada bul: native istek kimliği, IME, klavye, gezinme ve renderer durum testleri geçti.');
