'use strict';
// Source return for saved production runs: library (catalog) local media and YouTube.
// REAL: registerDubService + ledger + locator (main); the REAL media-catalog service (its real "play" action, real catalog store, real
//       film-watch source ids); dub-source-return.js; the REAL bodies of openLocalMedia, openMediaCatalogPlayback, mediaKeyFor and
//       youtubeVideoId sliced out of renderer.js.
// CONTROLLED: the worker process, the player's media element (setPlayerSource only records), the Browser tab manager (a Map-like
//       tab list with delays), file contents, and the delays injected between resolve, open and confirm. No native dialog is ever shown.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { world } = require('./dub-run-world');
const { registerMediaCatalogService } = require('../src/media-catalog-service');
const { createSourceLocator, youtubeId } = require('../src/dub-source-locator');
const read = name => fs.readFileSync(path.join(__dirname, '../src/renderer', name), 'utf8');
const rendererSource = read('renderer.js');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const tick = (ms = 12) => new Promise(resolve => setTimeout(resolve, ms));
const cut = (from, to) => { const a = rendererSource.indexOf(from); assert(a >= 0, 'missing ' + from); const b = rendererSource.indexOf(to, a); assert(b > a, 'missing ' + to); return rendererSource.slice(a, b); };
const SLICES = {
  local: cut('async function openLocalMedia(', 'function resetEmbeddedSubtitleTracks'),
  key: cut('function mediaKeyFor(kind, ref) {', 'function playerPositionKey'),
  youtube: cut('function youtubeVideoId(url) {', 'function mediaKeyFor('),
  catalog: cut('window.openMediaCatalogPlayback = async (item) => {', 'async function openHistoryResult')
};

// ---- real catalog service over a temp user-data folder --------------------------------------------------------------
function catalogWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-catalog-')), handlers = new Map(), granted = [];
  let pickerCalls = 0;
  const service = registerMediaCatalogService({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    dialog: { showOpenDialog: async () => { pickerCalls++; return { canceled: true, filePaths: [] }; } }, owner: () => null, authorized: () => true,
    userData: () => root, pythonPath: () => '', inspectMedia: value => { if (!fs.existsSync(value)) throw new Error('Yerel video yolu yetkili değil.'); return value; },
    grantMedia: value => { granted.push(value); return true; }, watchItems: () => [], nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
  });
  const invoke = request => handlers.get('media-catalog:request')({ sender: { id: 1 } }, request);
  const file = (name, bytes = 'video-bytes') => { const p = path.join(root, 'media', name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); return p; };
  const film = (title, source, extra = {}) => service.store().upsert({ kind: 'film', title, year: 2020, ...(source ? { source: { type: 'local', value: source } } : {}), ...extra });
  const locators = createSourceLocator({ catalog: { store: () => service.store(), sources: item => require('../src/film-watch-service').sources(item) } });
  return { root, service, store: service.store(), invoke, file, film, granted, picker: () => pickerCalls, locators, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
async function endRun(w, svc, id, extra = {}) {
  const index = w.spawns.length;
  assert.equal((await svc.call('dub:start', { ...w.request(id), ...extra })).ok, true, id);
  w.spawns[index].proc.exitCode = 1; w.spawns[index].proc.emit('close', 1); await tick();
}
const recordFile = (w, id) => path.join(w.logs, fs.readdirSync(w.logs).find(name => name.startsWith(id + '-') && name.endsWith('.json')));
const recordOf = (w, id) => w.records().find(row => row.id === id);
const libraryRun = (w, svc, id, file) => endRun(w, svc, id, { source: file, sourceRef: { kind: 'catalog' } });
const youtubeRun = (w, svc, id, url, videoId) => endRun(w, svc, id, { source: url, sourceRef: { kind: 'youtube', videoId } });
const VIDEO_A = 'aaaaaaaaaaa', VIDEO_B = 'bbbbbbbbbbb', VIDEO_C = 'ccccccccccc';
const watch = id => 'https://www.youtube.com/watch?v=' + id;

// =====================================================================================================================
test('CATALOG PIN: the library record is found by the exact file in main-owned sources; none, several, imported, relative or forged claims pin nothing; no path is stored', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'), b = c.file('b.mkv'), shared = c.file('shared.mkv'), outside = c.file('outside.mkv'), imported = c.file('imported.mkv');
    const filmA = c.film('Same Title', a); c.film('Same Title', b); c.film('Twin 1', shared); c.film('Twin 2', shared); c.film('Imported', null, { source: { type: 'local', value: imported, imported: true } });
    const svc = w.boot({ sourceLocators: c.locators });
    await libraryRun(w, svc, 'ok', a);
    const locator = recordOf(w, 'ok').pinned.sourceLocator;
    assert.deepEqual(Object.keys(locator).sort(), ['fileIdentity', 'itemId', 'kind', 'sourceId', 'v']); assert.equal(locator.itemId, filmA.id); assert.equal(locator.kind, 'catalog');
    assert.doesNotMatch(JSON.stringify(locator), new RegExp(c.root.replace(/[\\/.*+?^${}()|[\]]/g, '\\$&')), 'the portable record carries no personal path');
    assert.doesNotMatch(JSON.stringify(locator), /a\.mkv|Same Title/, 'neither file name nor title');
    await endRun(w, svc, 'forged', { source: b, sourceRef: { kind: 'catalog', itemId: filmA.id }, sourceLocator: locator });
    assert.notEqual(recordOf(w, 'forged').pinned.sourceLocator.itemId, filmA.id, 'a claimed item id or a forged locator never wins; the file decides');
    await libraryRun(w, svc, 'twin', shared); await libraryRun(w, svc, 'outside', outside); await libraryRun(w, svc, 'imported', imported);
    await endRun(w, svc, 'relative', { source: 'a.mkv', sourceRef: { kind: 'catalog' } });
    await endRun(w, svc, 'unnamed', { source: a });
    for (const id of ['twin', 'outside', 'imported', 'relative', 'unnamed']) assert.equal(recordOf(w, id).pinned.sourceLocator, undefined, id + ': nothing guessed');
    const list = await svc.call('dub:runs', { action: 'list' });
    assert.deepEqual(list.runs.find(row => row.id === 'ok').source, { state: 'recorded', kind: 'catalog' });
    assert.doesNotMatch(JSON.stringify(list), new RegExp(locator.itemId + '|' + locator.sourceId + '|' + locator.fileIdentity));
  } finally { w.close(); c.close(); }
});

test('CATALOG RESOLVE: replaced, removed, relinked, imported, missing and edited sources are explained and open nothing; the saved record and audio stay', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'), other = c.file('other.mkv', 'something else');
    const item = c.film('Movie', a); const svc = w.boot({ sourceLocators: c.locators }); await libraryRun(w, svc, 'r1', a);
    const resolve = (extra = {}) => svc.call('dub:runs', { action: 'source-resolve', runId: 'r1', ...extra });
    const ok = await resolve(); assert.deepEqual([ok.ok, ok.kind, ok.target, ok.versionMatches], [true, 'catalog', { kind: 'catalog', itemId: item.id, sourceId: recordOf(w, 'r1').pinned.sourceLocator.sourceId }, true]);
    assert.doesNotMatch(JSON.stringify(ok), /fileIdentity|verify|fingerprint/, 'internal proof stays in main');
    // the file was edited after the run
    fs.writeFileSync(a, 'edited video bytes!'); const changed = await resolve();
    assert.deepEqual([changed.ok, changed.code, changed.canOpenCurrent], [false, 'version-changed', true]);
    assert.deepEqual(await resolve({ allowChanged: true }).then(r => [r.ok, r.versionMatches]), [true, false]);
    fs.rmSync(a); const gone = await resolve(); assert.deepEqual([gone.ok, gone.code], [false, 'file-missing']); assert.match(gone.next, /record and its audio are kept/);
    fs.writeFileSync(a, 'video-bytes');
    // the library item now points at another file → the pinned source id no longer exists
    c.store.upsert({ id: item.id, source: { type: 'local', value: other } }); assert.equal((await resolve()).code, 'source-changed');
    c.store.upsert({ id: item.id, source: { type: 'local', value: a } });
    // imported (package) sources need the file picker; this is refused, never triggered
    c.store.upsert({ id: item.id, source: { type: 'local', value: a, imported: true } }); assert.equal((await resolve()).code, 'source-changed', 'an imported source is a different library source');
    c.store.remove(item.id); assert.equal((await resolve()).code, 'source-missing');
    assert.ok(recordOf(w, 'r1')); assert.equal(c.picker(), 0, 'no file picker or permission window was triggered'); assert.deepEqual(c.granted, [], 'nothing was authorized');
    // YouTube address parsing: only allow-listed hosts and an 11-character id
    assert.equal(youtubeId('https://youtu.be/' + VIDEO_A + '?t=5'), VIDEO_A); assert.equal(youtubeId('https://www.youtube.com/shorts/' + VIDEO_B), VIDEO_B);
    for (const bad of ['https://evil.example/watch?v=' + VIDEO_A, 'https://www.youtube.com.evil.example/watch?v=' + VIDEO_A, 'https://www.youtube.com/watch?v=short', 'file:///x', 'javascript:alert(1)', 'not a url', '']) assert.equal(youtubeId(bad), null, bad);
  } finally { w.close(); c.close(); }
});

test('CATALOG TICKET: a file that changes between resolve and confirm is never confirmed as the run\'s source', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'); c.film('Movie', a); const svc = w.boot({ sourceLocators: c.locators }); await libraryRun(w, svc, 'r1', a);
    const confirm = ticket => svc.call('dub:runs', { action: 'source-confirm', ticket });
    let resolved = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' }); assert.equal((await confirm(resolved.ticket)).ok, true);
    resolved = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' }); fs.writeFileSync(a, 'changed while opening!!');
    const bad = await confirm(resolved.ticket); assert.deepEqual([bad.ok, bad.code], [false, 'file-changed']); assert.match(bad.error, /changed while it was being opened/);
  } finally { w.close(); c.close(); }
});

test('YOUTUBE PIN/RESOLVE: only a verified 11-character id is kept — never the address, its query, a list or a token; renderer and main must agree', async () => {
  const w = world(); try {
    const svc = w.boot({ sourceLocators: createSourceLocator({}) });
    const url = watch(VIDEO_A) + '&t=95s&list=PLsecret&si=token123&pp=signed';
    await youtubeRun(w, svc, 'r1', url, VIDEO_A);
    assert.deepEqual(recordOf(w, 'r1').pinned.sourceLocator, { v: 1, kind: 'youtube', videoId: VIDEO_A });
    assert.doesNotMatch(JSON.stringify(recordOf(w, 'r1').pinned.sourceLocator), /https?:|list=|token|t=95|youtube\.com/);
    await youtubeRun(w, svc, 'r2', 'https://youtu.be/' + VIDEO_B + '?si=abc', VIDEO_B);
    await youtubeRun(w, svc, 'bad1', watch(VIDEO_A), VIDEO_B);                                          // claim disagrees with the bound address
    await youtubeRun(w, svc, 'bad2', 'https://evil.example/watch?v=' + VIDEO_A, VIDEO_A);               // wrong host
    await endRun(w, svc, 'bad3', { source: watch(VIDEO_A) });                                            // nothing named
    for (const id of ['bad1', 'bad2', 'bad3']) assert.equal(recordOf(w, id).pinned.sourceLocator, undefined, id);
    assert.equal(recordOf(w, 'r2').pinned.sourceLocator.videoId, VIDEO_B);
    const resolved = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' });
    assert.deepEqual([resolved.ok, resolved.kind, resolved.target], [true, 'youtube', { kind: 'youtube', videoId: VIDEO_A }]);
    const list = await svc.call('dub:runs', { action: 'list' }); assert.deepEqual(list.runs.find(row => row.id === 'r1').source, { state: 'recorded', kind: 'youtube' });
    assert.doesNotMatch(JSON.stringify(list), new RegExp(VIDEO_A));
  } finally { w.close(); }
});

// =====================================================================================================================
// Renderer worlds
function baseWindow() {
  const dom = new JSDOM('<!doctype html><div id="playerLayer" class="hidden"></div><div id="playerVideoPath"></div><dialog id="dubGeneratorDialog" open></dialog>', { runScripts: 'outside-only' }), win = dom.window;
  const log = { sources: [], playlist: [], attach: 0, mediaPlay: 0, navigations: [], created: 0, activated: [], modes: [] };
  win.HTMLMediaElement.prototype.play = function () { log.mediaPlay++; return Promise.resolve(); };
  win.UiLocale = { get: () => 'en' };
  win.BrowserDubAudioUI = { attachGenerated: async () => { log.attach++; return true; } };
  return { dom, win, log };
}
function libraryRenderer(w, svc, c) {
  const { win, log } = baseWindow(), holds = new Map();
  const player = win.player = { openIntent: 0, probeRequestSeq: 0, pendingAutoOpen: null, pendingLibrarySeek: null, mediaKey: '', generation: 0, localPath: '', workspaceMode: 'player' };
  win.api = { dubRuns: async request => clone(await svc.call('dub:runs', clone(request))), listWatchLibrary: async () => [],
    mediaCatalog: async request => { const h = holds.get('catalog-play'); if (h) { h.reach(); await h.gate; } return clone(await c.invoke(clone(request))); } };
  const ctx = { window: win, document: win.document, player, $: id => win.document.getElementById(id), flushWatchState: async () => {}, setWorkspaceMode: mode => { player.workspaceMode = mode; },
    pathToFileUrl: p => 'file:///' + p, currentGeneration: () => player.generation, attachSiblingSubtitles() {}, refreshEmbeddedSubtitleTracks() {}, openWatchLibraryItem: async () => { throw Error('not used'); },
    setLocalPlaylistAround: async (file) => { log.playlist.push(file); const h = holds.get('playlist:' + path.basename(file)); if (h) { h.reach(); await h.gate; } return true; },
    setPlayerSource: (url, title, key, meta) => { player.mediaKey = key; player.generation++; player.localPath = meta?.localPath || ''; log.sources.push(meta?.localPath || url); } };
  vm.createContext(ctx); vm.runInContext(SLICES.local + SLICES.key + SLICES.youtube + SLICES.catalog, ctx);
  win.mediaKeyFor = ctx.mediaKeyFor; win.youtubeVideoId = ctx.youtubeVideoId; win.eval(read('dub-source-return.js') + '\n;0');
  const hold = name => { const item = {}; item.gate = new Promise(r => { item.release = r; }); item.reached = new Promise(r => { item.reach = r; }); holds.set(name, item); return item; };
  return { win, player, log, hold, ctx, open: (id, options) => win.DubSourceReturn.open(id, options) };
}
function youtubeRenderer(w, svc) {
  const { win, log } = baseWindow(), holds = new Map();
  const player = win.player = { workspaceMode: 'player', browserActiveTabId: 'tab-0', browserTabs: [{ id: 'tab-0', url: 'https://news.example/article', closing: false }] };
  win.api = { dubRuns: async request => clone(await svc.call('dub:runs', clone(request))) };
  win.eval('1'); const ctx = { };
  vm.createContext(ctx); vm.runInContext(SLICES.youtube, ctx); win.youtubeVideoId = ctx.youtubeVideoId;
  const gate = async name => { const h = holds.get(name); if (h) { h.reach(); await h.gate; } };
  win.setWorkspaceMode = mode => { player.workspaceMode = mode; log.modes.push(mode); };
  win.activateBrowserTab = async id => { log.activated.push(id); await gate('activate'); player.browserActiveTabId = id; };
  win.createBrowserTab = async () => { log.created++; await gate('create'); const tab = { id: 'tab-' + log.created, url: '', closing: false }; player.browserTabs.push(tab); player.browserActiveTabId = tab.id; return tab; };
  win.navigateBrowser = async (url, tabId) => { log.navigations.push([url, tabId]); await gate('navigate'); const tab = player.browserTabs.find(row => row.id === tabId); if (tab && !holds.get('never-loads')) tab.url = url; return { ok: true }; };
  win.eval(read('dub-source-return.js') + '\n;0');
  const hold = name => { const item = {}; item.gate = new Promise(r => { item.release = r; }); item.reached = new Promise(r => { item.reach = r; }); holds.set(name, item); return item; };
  return { win, player, log, hold, open: (id, options) => win.DubSourceReturn.open(id, { timing: { poll: 5, limit: 6 }, ...options }) };
}

test('CATALOG OPEN: the real play action and the real library opener open the exact file; the same file is not reloaded; nothing plays or attaches', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'); c.film('Movie', a); const svc = w.boot({ sourceLocators: c.locators }); await libraryRun(w, svc, 'r1', a);
    const r = libraryRenderer(w, svc, c), result = await r.open('r1');
    assert.deepEqual([result.ok, result.kind, result.alreadyOpen], [true, 'catalog', false]);
    assert.deepEqual(r.log.sources, [a]); assert.equal(r.player.localPath, a); assert.equal(r.player.workspaceMode, 'player'); assert.deepEqual(c.granted, [a], 'the existing play action authorized exactly this file');
    assert.equal(r.log.mediaPlay, 0); assert.equal(r.log.attach, 0); assert.equal(c.picker(), 0);
    const again = await r.open('r1'); assert.deepEqual([again.ok, again.alreadyOpen], [true, true]); assert.deepEqual(r.log.sources, [a], 'already open: no reload');
  } finally { w.close(); c.close(); }
});

test('CATALOG RACES: A while B is chosen, reverse completion, double open, cancel and another media taking the player — an old open never takes over', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'), b = c.file('b.mkv'); c.film('A', a); c.film('B', b);
    const svc = w.boot({ sourceLocators: c.locators }); await libraryRun(w, svc, 'rA', a); await libraryRun(w, svc, 'rB', b);
    // A is still being authorized when B is chosen: A must not open at all
    let r = libraryRenderer(w, svc, c); let held = r.hold('catalog-play'); const pA = r.open('rA'); await held.reached;
    const pB = r.open('rB'); held.release(); const [resA, resB] = [await pA, await pB];
    assert.deepEqual([resA.ok, resA.code], [false, 'superseded']); assert.equal(resB.ok, true); assert.deepEqual(r.log.sources, [b], 'only B was ever opened');
    // A is inside the library opener when B is chosen: B waits for A to finish, then opens; A can never re-open over B
    r = libraryRenderer(w, svc, c); held = r.hold('playlist:a.mkv'); const first = r.open('rA'); await held.reached;
    const second = r.open('rB'); await tick(80);          // give an un-serialized B every chance to run ahead of A
    assert.deepEqual(r.log.sources, [], 'B has not opened while A is still inside the opener'); held.release(); const [oldResult, newResult] = [await first, await second];
    assert.equal(oldResult.code, 'superseded'); assert.equal(newResult.ok, true); assert.deepEqual(r.log.sources, [a, b], 'A finished before B started'); assert.equal(r.player.localPath, b, 'the later choice owns the player');
    // the same run twice shares one attempt
    r = libraryRenderer(w, svc, c); held = r.hold('catalog-play'); const x = r.open('rA'), y = r.open('rA'); assert.equal(x, y); await held.reached; held.release(); assert.equal((await x).ok, true); assert.deepEqual(r.log.sources, [a]);
    // cancelled while authorizing
    r = libraryRenderer(w, svc, c); held = r.hold('catalog-play'); let cancelled = false; const p = r.open('rA', { isCancelled: () => cancelled }); await held.reached; cancelled = true; held.release();
    assert.equal((await p).code, 'superseded'); assert.deepEqual(r.log.sources, []);
    // another media takes the player while the file is opening: the real opener drops the old intent; nothing is claimed
    r = libraryRenderer(w, svc, c); held = r.hold('playlist:a.mkv'); const racing = r.open('rA'); await held.reached;
    const other = r.ctx.openLocalMedia(b); held.release(); await other; const lost = await racing;
    assert.equal(lost.ok, false); assert.equal(r.player.localPath, b, 'the other media was not taken over'); assert.deepEqual(r.log.sources, [b]);
  } finally { w.close(); c.close(); }
});

test('CATALOG UNCONFIRMED / REFUSED: a file that changes while opening, a deleted record, missing, edited, relinked and imported sources never report success and never show a native dialog', async () => {
  const w = world(), c = catalogWorld(); try {
    const a = c.file('a.mkv'); const item = c.film('A', a); const svc = w.boot({ sourceLocators: c.locators }); await libraryRun(w, svc, 'rA', a);
    let r = libraryRenderer(w, svc, c); let held = r.hold('playlist:a.mkv'); let pending = r.open('rA'); await held.reached; fs.writeFileSync(a, 'rewritten during open!!'); held.release();
    let result = await pending; assert.deepEqual([result.ok, result.code, result.opened], [false, 'file-changed', true]); assert.match(result.message, /changed while it was being opened/);
    fs.writeFileSync(a, 'video-bytes'); await libraryRun(w, svc, 'rA2', a);          // the file's identity changed with the rewrite, so pin it again
    r = libraryRenderer(w, svc, c); held = r.hold('playlist:a.mkv'); pending = r.open('rA2'); await held.reached; fs.rmSync(recordFile(w, 'rA2')); held.release();
    result = await pending; assert.deepEqual([result.ok, result.code, result.opened], [false, 'record-gone', true]);
    // fresh run for the refusal cases
    await libraryRun(w, svc, 'rB', a); const before = c.granted.length;
    r = libraryRenderer(w, svc, c); fs.writeFileSync(a, 'edited'); result = await r.open('rB'); assert.deepEqual([result.ok, result.code, result.canOpenCurrent], [false, 'version-changed', true]);
    fs.rmSync(a); result = await r.open('rB'); assert.deepEqual([result.ok, result.code], [false, 'file-missing']);
    fs.writeFileSync(a, 'video-bytes'); c.store.upsert({ id: item.id, source: { type: 'local', value: a, imported: true } });
    result = await r.open('rB'); assert.equal(result.ok, false);
    assert.deepEqual(r.log.sources, [], 'nothing was opened in any refusal'); assert.equal(c.granted.length, before, 'nothing was authorized'); assert.equal(c.picker(), 0, 'no picker or permission window was triggered');
    assert.ok(recordOf(w, 'rB'), 'records are kept');
  } finally { w.close(); c.close(); }
});

test('YOUTUBE OPEN: a tab already showing the video is activated; otherwise exactly one new tab goes to the canonical address; other tabs and other videos are never touched; nothing plays', async () => {
  const w = world(); try {
    const svc = w.boot({ sourceLocators: createSourceLocator({}) }); await youtubeRun(w, svc, 'rA', watch(VIDEO_A) + '&t=5&list=PLx', VIDEO_A);
    let r = youtubeRenderer(w, svc); r.player.browserTabs.push({ id: 'tab-b', url: watch(VIDEO_B) + '&ab_channel=same-title-different-video', closing: false });
    let result = await r.open('rA');
    assert.deepEqual([result.ok, result.kind, result.newTab], [true, 'youtube', true]); assert.equal(r.log.created, 1); assert.deepEqual(r.log.navigations, [[watch(VIDEO_A), 'tab-1']], 'canonical address built from the verified id; query and list dropped');
    assert.equal(r.player.browserTabs.find(t => t.id === 'tab-0').url, 'https://news.example/article', 'the user\'s page was not navigated'); assert.equal(r.player.browserTabs.find(t => t.id === 'tab-b').url, watch(VIDEO_B) + '&ab_channel=same-title-different-video');
    assert.equal(r.player.browserActiveTabId, 'tab-1'); assert.equal(r.log.mediaPlay, 0); assert.equal(r.log.attach, 0);
    // a tab already showing the video: activate it, no new tab, no navigation
    r = youtubeRenderer(w, svc); r.player.browserTabs.push({ id: 'tab-a', url: watch(VIDEO_A) + '&t=300', closing: false });
    result = await r.open('rA'); assert.deepEqual([result.ok, result.newTab], [true, false]); assert.deepEqual(r.log.activated, ['tab-a']); assert.equal(r.log.created, 0); assert.deepEqual(r.log.navigations, []);
    // only another video is open: it is NOT used
    r = youtubeRenderer(w, svc); r.player.browserTabs.push({ id: 'tab-b', url: watch(VIDEO_B), closing: false }); await r.open('rA');
    assert.deepEqual(r.log.activated, []); assert.equal(r.log.created, 1);
  } finally { w.close(); }
});

test('YOUTUBE RACES: tab closes, another video starts in the same tab, A while B is chosen, double open, unconfirmed load, deleted record — success only from the tab itself', async () => {
  const w = world(); try {
    const svc = w.boot({ sourceLocators: createSourceLocator({}) });
    await youtubeRun(w, svc, 'rA', watch(VIDEO_A), VIDEO_A); await youtubeRun(w, svc, 'rB', watch(VIDEO_B), VIDEO_B);
    let r = youtubeRenderer(w, svc), held = r.hold('navigate'), pending = r.open('rA'); await held.reached;
    r.player.browserTabs = r.player.browserTabs.filter(t => t.id !== 'tab-1'); held.release();
    let result = await pending; assert.deepEqual([result.ok, result.code], [false, 'not-confirmed']);
    r = youtubeRenderer(w, svc); r.hold('never-loads'); held = r.hold('navigate'); pending = r.open('rA'); await held.reached;
    held.release(); r.player.browserTabs.find(t => t.id === 'tab-1').url = watch(VIDEO_C);   // another video starts in that tab right after the navigation was issued
    result = await pending; assert.deepEqual([result.ok, result.code], [false, 'not-confirmed']); assert.equal(r.log.navigations.length, 1, 'the tab was not navigated again');
    // A is still creating its tab when B is chosen: A must not navigate; B alone opens
    r = youtubeRenderer(w, svc); held = r.hold('create'); const pA = r.open('rA'); await held.reached; const pB = r.open('rB'); held.release();
    const [resA, resB] = [await pA, await pB]; assert.equal(resA.code, 'superseded'); assert.equal(resB.ok, true);
    assert.deepEqual(r.log.navigations.map(n => n[0]), [watch(VIDEO_B)], 'only B was ever navigated');
    r = youtubeRenderer(w, svc); held = r.hold('create'); const x = r.open('rA'), y = r.open('rA'); assert.equal(x, y); await held.reached; held.release(); assert.equal((await x).ok, true); assert.equal(r.log.created, 1);
    r = youtubeRenderer(w, svc); r.hold('never-loads'); result = await r.open('rA'); assert.deepEqual([result.ok, result.code], [false, 'not-confirmed']); assert.match(result.message, /not what is shown now/);
    r = youtubeRenderer(w, svc); held = r.hold('navigate'); pending = r.open('rB'); await held.reached; fs.rmSync(recordFile(w, 'rB')); held.release();
    result = await pending; assert.deepEqual([result.ok, result.code, result.opened], [false, 'record-gone', true]);
    r = youtubeRenderer(w, svc); let cancelled = false; held = r.hold('create'); pending = r.open('rA', { isCancelled: () => cancelled }); await held.reached; cancelled = true; held.release();
    assert.equal((await pending).code, 'superseded'); assert.deepEqual(r.log.navigations, []);
  } finally { w.close(); }
});

test('source-only stream opening passes autoplay=false to HLS and does not start the native engine',async()=>{
 const source=read('media-hub-ui.js'),start=source.indexOf('async function playStream('),end=source.indexOf('async function drawPlayer(',start);assert(start>=0&&end>start);
 const calls=[],video={paused:true,classList:{remove:()=>{}},play:async()=>calls.push(['play'])},context={player:{openIntent:0},flushWatchState:async()=>{},document:{getElementById:()=>video},setWorkspaceMode:()=>{},setPlayerHls:(...args)=>calls.push(['hls',args[3]]),setPlayerSource:(_url,_title,key)=>{context.player.mediaKey=key;calls.push(['source']);},currentGeneration:()=>1,currentTorrent:null,window:{NativePlayerUI:{start:async()=>{calls.push(['native']);return true;}}}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 await context.playStream({url:'https://fixture.test/audio.m3u8',key:'a',title:'A'},0,{autoplay:false});assert.equal(calls[0][1].autoplay,false);assert.equal(calls.some(row=>row[0]==='native'),false);
 calls.length=0;await context.playStream({url:'https://fixture.test/audio.mp3',key:'b',title:'B'},0,{autoplay:false});assert.deepEqual(calls,[['source']]);
 calls.length=0;await context.playStream({url:'https://fixture.test/audio.mp3',key:'b',title:'B'});assert.deepEqual(calls,[['source'],['native'],['play']]);
});

test('source-return mute hold restores only its own web contents and preserves prior manual mute',()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8'),a=main.indexOf('function releaseSourceReturnHold('),b=main.indexOf("ipcMain.handle('browser:navigate'",a),context={};vm.createContext(context);vm.runInContext(main.slice(a,b),context);
 let muted=true;const wc={isDestroyed:()=>false,isAudioMuted:()=>muted,setAudioMuted:value=>muted=value};const tab={view:{webContents:wc},sourceReturnHold:{wc,priorMuted:false}};context.releaseSourceReturnHold(tab);assert.equal(muted,false);assert.equal(tab.sourceReturnHold,null);
 muted=true;tab.sourceReturnHold={wc,priorMuted:true};context.releaseSourceReturnHold(tab);assert.equal(muted,true);
 tab.sourceReturnHold={wc:{},priorMuted:false};context.releaseSourceReturnHold(tab);assert.equal(muted,true);
});

test('native stream autoplay cannot play a replacement source, cancelled request or failed start',async()=>{
 const source=read('media-hub-ui.js'),start=source.indexOf('async function playStream('),end=source.indexOf('async function drawPlayer(',start);
 for(const scenario of ['cancelled','source','generation','intent','failed','unknown']){
  let cancelled=false,generation=1,plays=0;const video={paused:true,classList:{remove:()=>{}},play:async()=>{plays++;}};
  const context={player:{openIntent:0},flushWatchState:async()=>{},document:{getElementById:()=>video},setWorkspaceMode:()=>{},setPlayerSource:(_url,_title,key)=>{context.player.mediaKey=key;},currentGeneration:()=>generation,currentTorrent:null,window:{NativePlayerUI:{start:async()=>{await Promise.resolve();if(scenario==='cancelled')cancelled=true;if(scenario==='source')context.player.mediaKey='another';if(scenario==='generation')generation++;if(scenario==='intent')context.player.openIntent++;return scenario==='failed'?false:scenario==='unknown'?undefined:true;}}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.playStream({url:'https://fixture.test/audio.wav',key:'expected',title:'Expected'},0,{isCancelled:()=>cancelled});assert.equal(plays,0,scenario+' must not play another source');
 }
});
