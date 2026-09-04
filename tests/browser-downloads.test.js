const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserDownloads } = require('../src/browser-downloads');

class Item extends EventEmitter {
  saved = ''; received = 0; total = 0; resumable = false;
  getFilename() { return '<img onerror=alert(1)>.zip'; }
  getSavePath() { return this.saved; }
  getReceivedBytes() { return this.received; }
  getTotalBytes() { return this.total; }
  canResume() { return this.resumable; }
  setSaveDialogOptions(options) { this.dialog = options; }
  setSavePath() { throw Error('Native save/overwrite consent must remain enabled'); }
  getURL() { throw Error('Private URL must not be read'); }
  cancel() { this.emit('done', {}, 'cancelled'); }
  resume() { this.resumed = true; this.emit('updated', {}, 'progressing'); }
}

(async () => {
  const ses = new EventEmitter(), events = [], revealed = [];
  let allowed = true, fileExists = true;
  const manager = createBrowserDownloads({ publish: value => events.push(value), canStart: () => allowed,
    exists: () => fileExists, reveal: p => revealed.push(p), delay: 5, maxActive: 2, maxRecords: 3 });
  manager.attach(ses); manager.attach(ses);
  assert.equal(ses.listenerCount('will-download'), 1, 'session listener duplicated per tab');
  const launch = item => { let prevented = false; ses.emit('will-download', { preventDefault() { prevented = true; } }, item); return prevented; };
  const one = new Item(); assert.equal(launch(one), false);
  const id = manager.snapshot().items[0].id;
  assert.equal(one.dialog.buttonLabel, 'Kaydet');
  assert.equal(manager.activeCount(), 1);
  one.total = 100; one.received = 20;
  for (let i = 0; i < 100; i++) one.emit('updated', {}, 'progressing');
  assert.equal(events.length, 1, 'progress event flood');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(events.length, 2);
  assert.equal(events.at(-1).items[0].received, 20);
  one.resumable = true; one.emit('updated', {}, 'interrupted');
  assert.equal(manager.snapshot().items[0].active, true, 'interrupted update is not terminal');
  assert.equal(manager.action(id, 'resume').ok, true);
  assert.equal(one.resumed, true);
  assert.equal(manager.action(id, 'reveal').ok, false);
  const two = new Item(); launch(two);
  assert.equal(launch(new Item()), true, 'active limit was ignored');
  assert.equal(manager.action('invented-path.exe', 'reveal').ok, false);
  assert.equal(manager.action(id, 'open').ok, false, 'no automatic/executable open API');
  const twoId = manager.snapshot().items[0].id;
  manager.action(twoId, 'cancel');
  assert.equal(manager.snapshot().items[0].state, 'cancelled');
  assert.equal(two.listenerCount('updated'), 0);
  one.saved = path.join('example', 'renamed.zip'); one.received = 100;
  one.emit('done', {}, 'completed');
  assert.equal(events.at(-1).items.find(r => r.id === id).filename, 'renamed.zip');
  assert.equal(manager.activeCount(), 0);
  assert.equal(one.listenerCount('done'), 0);
  assert.equal(one.listenerCount('updated'), 0);
  fileExists = false;
  assert.match(manager.action(id, 'reveal').error, /taşınmış veya silinmiş/);
  fileExists = true; assert.equal(manager.action(id, 'reveal').ok, true);
  assert.deepEqual(revealed, [one.saved]);
  assert.equal(manager.action(id, 'cancel').ok, false);
  // Native object can now be destroyed: list/actions use metadata only.
  one.getSavePath = () => { throw Error('destroyed'); };
  manager.snapshot(); manager.action(id, 'reveal');
  for (let i = 0; i < 5; i++) { const item = new Item(); launch(item); item.emit('done', {}, 'interrupted'); }
  assert.equal(manager.snapshot().items.length, 3);
  assert.equal(manager.snapshot().items[0].active, false);
  allowed = false; assert.equal(launch(new Item()), true);
  allowed = true;
  launch(new Item()); launch(new Item()); manager.cancelAll();
  assert.equal(manager.activeCount(), 0);

  // Execute real main IPC handler: web pages/subframes cannot control downloads.
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = main.indexOf("ipcMain.handle('browser:downloads'");
  const end = main.indexOf("ipcMain.handle('browser:command'", start);
  let handler;
  vm.runInNewContext(main.slice(start, end), { ipcMain: { handle: (_name, fn) => { handler = fn; } },
    authorizedBrowserSender: e => e?.trusted === true, browserDownloads: manager });
  assert.equal(handler({}, { command: 'list' }).ok, false);
  assert.equal(handler({ trusted: true }, { command: 'list' }).ok, true);
  assert.equal(handler({ trusted: true }, { command: 'reveal', id: 'arbitrary.exe' }).ok, false);

  // Execute real renderer functions, including revision protection and stable DOM.
  class Node {
    constructor() { this.children = []; this.attributes = {}; this.listeners = {}; this.textContent = ''; this.classes = new Set();
      this.classList = { contains: x => this.classes.has(x), toggle: (x, on) => on ? this.classes.add(x) : this.classes.delete(x) }; }
    setAttribute(k, v) { this.attributes[k] = v; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(k, v) { this.listeners[k] = v; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); }
    prepend(node) { this.children.unshift(node); }
    remove() { this.removed = true; }
    contains() { return false; }
    focus() { this.focused = true; }
  }
  const nodes = Object.fromEntries(['Panel', 'Toggle', 'Close', 'List', 'Status', 'Badge'].map(k => ['browserDownloads' + k, new Node()]));
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const rs = renderer.indexOf('const browserDownloadState =');
  const re = renderer.indexOf('function renderBrowserDiagnostics(', rs);
  const ctx = { $: id => nodes[id], document: { createElement: () => new Node(), activeElement: null },
    setBrowserPlacesOpen() {}, syncBrowserOcclusion() {}, window: { api: { browserDownloads: async () => ({ ok: true, downloads: manager.snapshot() }) } } };
  vm.createContext(ctx); vm.runInContext(renderer.slice(rs, re), ctx);
  const data = { revision: 10, active: 1, message: '', items: [{ id: 'a', filename: '<script>alert(1)</script>',
    state: 'progressing', received: 5, total: 0, active: true, path: '' }] };
  ctx.receiveBrowserDownloads(data);
  const row = nodes.browserDownloadsList.children[0];
  assert.equal(row.children[0].textContent, '<script>alert(1)</script>', 'filename must remain literal text');
  assert.equal(row.children[2].attributes.value, undefined, 'unknown total is indeterminate');
  ctx.receiveBrowserDownloads({ ...data, revision: 9, items: [] });
  assert.equal(row.removed, undefined, 'stale list response removed current rows');
  ctx.receiveBrowserDownloads({ ...data, revision: 11 });
  assert.equal(nodes.browserDownloadsList.children.length, 1, 'progress rebuilds button/focus DOM');
  ctx.receiveBrowserDownloads({ ...data, revision: 12, active: 0, items: [{ ...data.items[0], state: 'completed', active: false, total: 5, path: 'saved.zip' }] });
  assert.equal(row.children[2].hidden, true);
  assert.equal(row.children[4].children[0].classList.contains('hidden'), true);
  assert.equal(row.children[4].children[2].classList.contains('hidden'), false);
  console.log('Browser downloads lifecycle, limits, IPC and renderer tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
