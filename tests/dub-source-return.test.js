'use strict';
// Source return for saved production runs (Podcast episodes).
// REAL: registerDubService + run ledger + dub-source-locator (main), the real index.html DOM, dub-runs-ui.js, dub-generator-ui.js,
//       dub-source-return.js, assistant-voice-runs.js (renderer), and the REAL openPodcastEntry body sliced out of
//       player-source-catalog-integration.js (the existing Podcast open owner, with its own intent/cancel handling).
// CONTROLLED: the worker process, the feed store (a Map behind the real store interface), the owner's play() (network/media part),
//       and the delays injected between resolve, open and confirm.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { world } = require('./dub-run-world');
const session = require('../src/podcast-session');
const { createSourceLocator, clean, fingerprint } = require('../src/dub-source-locator');
const read = name => fs.readFileSync(path.join(__dirname, '../src/renderer', name), 'utf8');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const tick = (ms = 12) => new Promise(resolve => setTimeout(resolve, ms));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(8); };
const sha = value => createHash('sha256').update(value).digest('hex');

// ---- a Map behind the real feed-store interface ------------------------------------------------------------
function library() {
  const entries = new Map();
  const locator = createSourceLocator({ podcasts: { store: () => ({ entry: id => { if (!entries.has(id)) throw Error('Choose a saved feed entry.'); return structuredClone(entries.get(id)); } }), exactAudio: async () => ({ available: false }) } });
  const lib = {
    entries, locator,
    add: (id, over = {}) => { entries.set(id, { id, kind: 'podcast', feedId: 'feed-1', externalId: 'guid-' + id, title: 'Episode ' + id, enclosures: [{ url: 'https://cdn.example.org/' + id + '.mp3', type: 'audio/mpeg', length: 1000 }], ...over }); return entries.get(id); },
    version: id => session.sourceVersion(entries.get(id)),
    key: id => 'stream:' + sha(new URL(entries.get(id).enclosures[0].url).href),
    ref: id => ({ kind: 'podcast', entryId: id, sourceVersion: lib.version(id) })
  };
  return lib;
}
// A run that ends (fails) right away so the single production slot is free for the next one; its record and input copy remain.
async function startRun(w, svc, id, extra = {}) {
  const index = w.spawns.length;
  assert.equal((await svc.call('dub:start', { ...w.request(id), ...extra })).ok, true, id);
  w.spawns[index].proc.exitCode = 1; w.spawns[index].proc.emit('close', 1); await tick();
}
const recordFile = (w, id) => path.join(w.logs, fs.readdirSync(w.logs).find(name => name.startsWith(id + '-') && name.endsWith('.json')));
const recordOf = (w, id) => w.records().find(row => row.id === id);
const podcastRun = (w, svc, lib, id, entryId) => startRun(w, svc, id, { source: lib.key(entryId), sourceRef: lib.ref(entryId) });

// =====================================================================================================================
test('PIN: the locator is derived in main from a corroborated claim; renderer-supplied locators, paths, titles and mismatches pin nothing', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); lib.add('E2', { title: 'Episode E1' });          // E2 has E1's title: a title is never an identity
    const svc = w.boot({ sourceLocators: lib.locator });
    const forged = { v: 1, kind: 'podcast', entryId: 'E2', episodeIdentity: 'x', sourceVersion: '0'.repeat(64) };
    await startRun(w, svc, 'r1', { source: lib.key('E1'), sourceRef: lib.ref('E1'), sourceLocator: forged });
    assert.deepEqual(recordOf(w, 'r1').pinned.sourceLocator, { v: 1, kind: 'podcast', entryId: 'E1', episodeIdentity: session.episodeIdentity(lib.entries.get('E1')), sourceVersion: lib.version('E1') }, 'only the main-derived locator is stored; the forged one is ignored');
    assert.doesNotMatch(JSON.stringify(recordOf(w, 'r1').pinned.sourceLocator), /https?:|[A-Za-z]:[\\/]|\/Users\/|stream:/, 'no URL, path or stream key in the portable record');
    await startRun(w, svc, 'r2', { source: lib.key('E2'), sourceRef: lib.ref('E1') });                       // names E1 while bound to E2's source
    await startRun(w, svc, 'r3', { source: lib.key('E1'), sourceRef: { ...lib.ref('E1'), sourceVersion: 'f'.repeat(64) } });  // wrong version
    await startRun(w, svc, 'r4', { source: 'https://cdn.example.org/E1.mp3', sourceRef: lib.ref('E1') });     // a renderer URL is not corroboration
    await startRun(w, svc, 'r5', { source: lib.key('E1'), sourceRef: { kind: 'podcast', entryId: 'missing', sourceVersion: lib.version('E1') } });
    for (const id of ['r2', 'r3', 'r4', 'r5']) assert.equal(recordOf(w, id).pinned.sourceLocator, undefined, id + ' pinned nothing');
    const list = await svc.call('dub:runs', { action: 'list' });
    assert.deepEqual(list.runs.find(row => row.id === 'r1').source, { state: 'recorded', kind: 'podcast' });
    for (const id of ['r2', 'r3', 'r4', 'r5']) assert.equal(list.runs.find(row => row.id === id).source.state, 'legacy', 'older/unpinned records stay honestly legacy');
    assert.doesNotMatch(JSON.stringify(list), /"E1"|"E2"|episodeIdentity|sourceVersion/, 'the renderer never receives a locator or an id');
  } finally { w.close(); }
});

test('SCHEMA: unknown versions are preserved byte-for-byte and never used; only valid v1 records are accepted', async () => {
  assert.equal(clean(undefined).state, 'none');
  assert.equal(clean({ v: 2, kind: 'podcast' }).state, 'unsupported');
  assert.equal(clean({ v: 1, kind: 'ftp', entryId: 'a' }).state, 'unsupported');
  assert.equal(clean({ v: 1, kind: 'podcast', entryId: '../x', episodeIdentity: 'e', sourceVersion: '0'.repeat(64) }).state, 'unsupported');
  assert.equal(clean({ v: 1, kind: 'podcast', entryId: 'a', episodeIdentity: 'e', sourceVersion: 'short' }).state, 'unsupported');
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1');
    const file = recordFile(w, 'r1'), record = JSON.parse(fs.readFileSync(file, 'utf8')); record.pinned.sourceLocator = { v: 2, kind: 'podcast', future: 'field' };
    fs.writeFileSync(file, JSON.stringify(record)); const before = fs.readFileSync(file);
    const list = await svc.call('dub:runs', { action: 'list' });
    assert.equal(list.runs.find(row => row.id === 'r1').source.state, 'unsupported');
    const resolved = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' });
    assert.deepEqual([resolved.ok, resolved.code], [false, 'unsupported']);
    assert(fs.readFileSync(file).equals(before), 'reading and resolving never rewrote the record');
  } finally { w.close(); }
});

test('RESOLVE: exact target only; missing, replaced and re-versioned sources are explained and open nothing; legacy keeps its explained limit', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await startRun(w, svc, 'legacy', { source: lib.key('E1') });
    const ok = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' });
    assert.deepEqual([ok.ok, ok.kind, ok.target, ok.versionMatches], [true, 'podcast', { kind: 'podcast', entryId: 'E1', view: 'podcast' }, true]);
    assert.match(ok.ticket, /^[a-f0-9]{32}$/); assert.equal(ok.fingerprint, undefined, 'the internal fingerprint stays in main');
    // the same episode, new audio declaration → a different source version: refused unless explicitly asked for the current one
    lib.entries.get('E1').enclosures[0].length = 2222;
    const changed = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' });
    assert.deepEqual([changed.ok, changed.code, changed.canOpenCurrent], [false, 'version-changed', true]);
    const current = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1', allowChanged: true });
    assert.deepEqual([current.ok, current.versionMatches], [true, false], 'opened for reference, flagged as not the version this run used');
    // the library record now holds a different episode under the same id
    lib.entries.get('E1').externalId = 'another-guid';
    assert.equal((await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1', allowChanged: true })).code, 'source-changed');
    lib.entries.delete('E1');
    const gone = await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' });
    assert.deepEqual([gone.ok, gone.code], [false, 'source-missing']); assert.match(gone.error, /no longer in the library/); assert.match(gone.next, /record and its audio are kept/);
    assert.ok(recordOf(w, 'r1'), 'the saved production record is kept');
    const legacy = await svc.call('dub:runs', { action: 'source-resolve', runId: 'legacy' });
    assert.deepEqual([legacy.ok, legacy.code], [false, 'no-locator']);
    assert.equal((await svc.call('dub:runs', { action: 'source-resolve', runId: 'nope-123' })).code, 'unknown-run');
    const pathAsRun = await svc.call('dub:runs', { action: 'source-resolve', runId: '../x' }); assert.equal(pathAsRun.ok, false); assert.match(pathAsRun.error, /Invalid run identity/, 'a path is never accepted as a run');
  } finally { w.close(); }
});

test('TICKET: confirming is one-shot, bound to the asking window, and reports a deleted or changed record instead of success', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); lib.add('E2'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await podcastRun(w, svc, lib, 'r2', 'E2');
    const confirm = (ticket, sender = { id: 7 }) => svc.handlers['dub:runs']({ sender }, { action: 'source-confirm', ticket });
    let t = (await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' })).ticket;
    assert.equal((await confirm(t, { id: 99 })).code, 'expired', 'another window cannot confirm it');
    t = (await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' })).ticket;
    assert.equal((await confirm(t)).ok, true); assert.equal((await confirm(t)).code, 'expired', 'a second confirmation is refused');
    t = (await svc.call('dub:runs', { action: 'source-resolve', runId: 'r1' })).ticket; fs.rmSync(recordFile(w, 'r1'));
    assert.deepEqual(await confirm(t).then(r => [r.ok, r.code]), [false, 'record-gone']);
    t = (await svc.call('dub:runs', { action: 'source-resolve', runId: 'r2' })).ticket;
    const file = recordFile(w, 'r2'), record = JSON.parse(fs.readFileSync(file, 'utf8')); record.pinned.sourceLocator.entryId = 'E1'; fs.writeFileSync(file, JSON.stringify(record));
    assert.deepEqual(await confirm(t).then(r => [r.ok, r.code]), [false, 'record-changed']);
    const badTicket = await confirm('not-a-ticket'); assert.equal(badTicket.ok, false); assert.match(badTicket.error, /Invalid source ticket/);
    assert.equal(fingerprint({ v: 1, kind: 'podcast', entryId: 'a', episodeIdentity: 'b', sourceVersion: 'c' }).length, 64);
  } finally { w.close(); }
});

test('RETRY: an approved retry keeps the original run\'s pinned locator; it is never re-derived from whatever is open now', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); lib.add('E2'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1');
    const original = clone(recordOf(w, 'r1').pinned.sourceLocator);
    const preview = await svc.call('dub:runs', { action: 'retry-preview', runId: 'r1', settings: 'pinned' }); assert.equal(preview.ok, true, JSON.stringify(preview));
    const approved = await svc.call('dub:runs', { action: 'retry-approve', token: preview.token }); assert.equal(approved.ok, true, JSON.stringify(approved));
    const retry = recordOf(w, approved.runId);
    assert.deepEqual(retry.pinned.sourceLocator, original); assert.equal(retry.retryOf, 'r1');
  } finally { w.close(); }
});

test('ASSISTANT VIEW: one source_navigation truth; no ids, paths or locators; blocked reasons are specific and a matching open media still works for older records', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await startRun(w, svc, 'old', { source: lib.key('E1') });
    const recorded = svc.service.runs.detail('r1', { openSource: '' });
    assert.deepEqual([recorded.source_navigation.available, recorded.source_navigation.via, recorded.source_navigation.kind], [true, 'recorded-locator', 'podcast']);
    assert.equal(recorded.run.source_return.state, 'recorded');
    const olderMatch = svc.service.runs.detail('old', { openSource: lib.key('E1') });
    assert.deepEqual([olderMatch.source_navigation.available, olderMatch.source_navigation.via], [true, 'matching-open-media']);
    const olderNoMatch = svc.service.runs.detail('old', { openSource: '' });
    assert.deepEqual([olderNoMatch.source_navigation.available, olderNoMatch.source_navigation.code], [false, 'no-locator']);
    lib.entries.delete('E1');
    const missing = svc.service.runs.detail('r1', { openSource: '' });
    assert.deepEqual([missing.source_navigation.available, missing.source_navigation.code], [false, 'source-missing']); assert.match(missing.source_navigation.reason, /no longer in the library/);
    assert.doesNotMatch(JSON.stringify([recorded, olderMatch, olderNoMatch, missing]), /entryId|episodeIdentity|sourceVersion|"E1"|cdn\.example|stream:/);
  } finally { w.close(); }
});

// =====================================================================================================================
// Renderer: the real DubSourceReturn driving the real openPodcastEntry body.
function owner(lib, extra = {}) {
  const dom = new JSDOM('<!doctype html><dialog id="dubGeneratorDialog" open></dialog>', { runScripts: 'outside-only' }), win = dom.window;
  const log = { plays: [], scene: [], attach: 0, mediaPlay: 0 }, holds = new Map(), behaviour = { version: null, afterScene: null };
  win.HTMLMediaElement.prototype.play = function () { log.mediaPlay++; return Promise.resolve(); };
  const player = win.player = { mediaKey: 'start', generation: 1, workspaceAudio: null };
  // The part of the owner that talks to the network/player: it honours the same cancel and owner checks as the real play().
  const play = async (item, _mode, { isCancelled = () => false } = {}) => {
    const id = item.entry.id, initial = { key: player.mediaKey, generation: player.generation };
    log.plays.push(id);
    const hold = holds.get(id); if (hold) { hold.reach(); await hold.gate; }
    if (isCancelled() || player.mediaKey !== initial.key || player.generation !== initial.generation) return;
    player.mediaKey = 'stream:' + id; player.generation++;
    player.workspaceAudio = { entryId: id, mediaKey: player.mediaKey, generation: player.generation, sourceVersion: behaviour.version ? behaviour.version(id) : lib.version(id) };
  };
  const text = fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'), 'utf8'), start = text.indexOf('  let podcastOpenIntent='), end = text.indexOf('  const podcastButton=', start);
  win.PlayerWorkspaceIntegration = { setPodcastMode() {}, refresh() {} };
  win.CinemaSahne = { open: mode => { log.scene.push(mode.mode); behaviour.afterScene?.(); } };
  const ctx = { player, window: win, play, t: en => en, document: win.document }; vm.runInNewContext(text.slice(start, end), ctx);
  win.PlayerSourceCatalogIntegration = { openPodcastEntry: ctx.openPodcastEntry };
  win.BrowserDubAudioUI = { attachGenerated: async () => { log.attach++; return true; }, context: () => ({ mode: 'player', hasMedia: false, visible: true }) };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  Object.assign(win, extra);
  const hold = id => { const item = {}; item.gate = new Promise(r => { item.release = r; }); item.reached = new Promise(r => { item.reach = r; }); holds.set(id, item); return item; };
  return { dom, win, player, log, hold, behaviour };
}
function rendererWorld(w, svc, lib) {
  const o = owner(lib); o.win.api = { dubRuns: async request => clone(await svc.call('dub:runs', clone(request))) };
  o.win.UiLocale = { get: () => 'en' };   // these tests assert the English texts; the panel tests below run in the default (Turkish) interface
  o.win.eval(read('dub-source-return.js') + '\n;0');
  o.open = (id, options) => o.win.DubSourceReturn.open(id, options);
  return o;
}

test('OPEN: a recorded run reopens the exact episode through the real Podcast opener; nothing plays, nothing is attached', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator }); await podcastRun(w, svc, lib, 'r1', 'E1');
    const r = rendererWorld(w, svc, lib), result = await r.open('r1');
    assert.deepEqual([result.ok, result.kind, result.versionMatches], [true, 'podcast', true]);
    assert.deepEqual(r.log.plays, ['E1']); assert.equal(r.player.workspaceAudio.entryId, 'E1'); assert.deepEqual(r.log.scene, ['podcast']);
    assert.equal(r.log.mediaPlay, 0, 'no playback was started'); assert.equal(r.log.attach, 0, 'no dubbed audio was attached');
    assert.equal(recordOf(w, 'r1').result, 'error', 'the production record is untouched (this fixture run failed)');
    // already open: the existing owner does not reload the same episode
    const again = await r.open('r1'); assert.equal(again.ok, true); assert.deepEqual(r.log.plays, ['E1']);
  } finally { w.close(); }
});

test('RACES: A while B is chosen, reverse completion, double open, cancel — an old open never takes over and never makes a second player', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); lib.add('E2'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await podcastRun(w, svc, lib, 'r2', 'E2');
    // A opens slowly; B is chosen; B finishes first; A completes late
    let r = rendererWorld(w, svc, lib); const slowA = r.hold('E1');
    const pA = r.open('r1'); await slowA.reached; const resultB = await r.open('r2'); slowA.release(); const resultA = await pA;
    assert.equal(resultB.ok, true); assert.deepEqual([resultA.ok, resultA.code], [false, 'superseded']);
    assert.equal(r.player.workspaceAudio.entryId, 'E2', 'the later choice owns the player'); assert.equal(r.log.mediaPlay, 0);
    // the same run asked twice while opening shares one attempt
    r = rendererWorld(w, svc, lib); const slow = r.hold('E1'); const first = r.open('r1'), second = r.open('r1');
    assert.equal(first, second, 'one shared attempt'); await slow.reached; slow.release(); assert.equal((await first).ok, true); assert.deepEqual(r.log.plays, ['E1']);
    // cancelled (panel closed) while opening
    r = rendererWorld(w, svc, lib); let cancelled = false; const held = r.hold('E1'); const pending = r.open('r1', { isCancelled: () => cancelled });
    await held.reached; cancelled = true; held.release(); const result = await pending;
    assert.deepEqual([result.ok, result.code], [false, 'superseded']); assert.equal(r.player.workspaceAudio, null, 'nothing was opened after the cancel');
    // another video starts in the player while the source is opening
    r = rendererWorld(w, svc, lib); const racing = r.hold('E1'); const opening = r.open('r1'); await racing.reached;
    r.player.mediaKey = 'other-video'; r.player.generation++; racing.release(); const lost = await opening;
    assert.equal(lost.ok, false); assert.equal(r.player.mediaKey, 'other-video', 'the other video was not taken over'); assert.equal(r.player.workspaceAudio, null);
    // another video takes the player right after the episode opened, before it is confirmed
    r = rendererWorld(w, svc, lib); r.behaviour.afterScene = () => { r.player.mediaKey = 'intruder'; r.player.generation++; };
    const notConfirmed = await r.open('r1'); assert.deepEqual([notConfirmed.ok, notConfirmed.code], [false, 'not-confirmed']);
  } finally { w.close(); }
});

test('UNCONFIRMED: a different audio version, or a record that vanished/changed while opening, is "opened, not confirmed" — never a success', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); lib.add('E2'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await podcastRun(w, svc, lib, 'r2', 'E2');
    let r = rendererWorld(w, svc, lib); r.behaviour.version = () => 'f'.repeat(64);
    let result = await r.open('r1'); assert.deepEqual([result.ok, result.code, result.opened], [false, 'version-unverified', true]); assert.match(result.message, /not the one this run used/);
    r = rendererWorld(w, svc, lib); let slow = r.hold('E1'); let pending = r.open('r1'); await slow.reached; fs.rmSync(recordFile(w, 'r1')); slow.release();
    result = await pending; assert.deepEqual([result.ok, result.code, result.opened], [false, 'record-gone', true]); assert.match(result.message, /Nothing was deleted/);
    r = rendererWorld(w, svc, lib); slow = r.hold('E2'); pending = r.open('r2'); await slow.reached;
    const file = recordFile(w, 'r2'), record = JSON.parse(fs.readFileSync(file, 'utf8')); record.pinned.sourceLocator.entryId = 'E1'; fs.writeFileSync(file, JSON.stringify(record)); slow.release();
    result = await pending; assert.deepEqual([result.ok, result.code], [false, 'record-changed']);
  } finally { w.close(); }
});

test('REFUSALS: missing source, re-versioned source and legacy records open nothing and say what to do; the record is kept', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await startRun(w, svc, 'old', { source: lib.key('E1') });
    const r = rendererWorld(w, svc, lib);
    let result = await r.open('old'); assert.deepEqual([result.ok, result.code], [false, 'no-locator']); assert.match(result.next, /Open the original episode or file yourself/);
    lib.entries.get('E1').enclosures[0].length = 3333;
    result = await r.open('r1'); assert.deepEqual([result.ok, result.code, result.canOpenCurrent], [false, 'version-changed', true]);
    result = await r.open('r1', { allowChanged: true }); assert.deepEqual([result.ok, result.versionMatches], [true, false]);
    const r2 = rendererWorld(w, svc, lib); lib.entries.delete('E1');
    result = await r2.open('r1'); assert.deepEqual([result.ok, result.code], [false, 'source-missing']); assert.match(result.message, /no longer in the library/);
    assert.deepEqual(r2.log.plays, [], 'no source was opened'); assert.equal(r2.player.workspaceAudio, null); assert.ok(recordOf(w, 'r1'));
    assert.equal((await r2.open('../x')).ok, false, 'a path is never accepted as a run');
  } finally { w.close(); }
});

// =====================================================================================================================
// The real production panel and the assistant action on top of it.
function panelWorld(w, svc, lib) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', pretendToBeVisual: true }), win = dom.window, el = id => win.document.getElementById(id);
  const o = owner(lib, {}), state = { source: 'media-Z' };
  // reuse one window: the owner() window is separate, so copy its pieces into the panel window
  const log = o.log, holds = o.hold;
  win.HTMLMediaElement.prototype.pause = win.HTMLMediaElement.prototype.load = () => {}; win.HTMLMediaElement.prototype.play = () => { log.mediaPlay++; return Promise.resolve(); };
  win.syncBrowserOcclusion = () => {};
  win.BrowserDubAudioUI = { context: () => ({ mode: 'player', tabId: 'tab-1', mediaKey: state.source, source: state.source, currentTime: 0, backgroundSource: '', visible: true, hasMedia: true }), attachGenerated: async () => { log.attach++; return true; } };
  win.api = { dubConfig: kind => svc.call('dub:config', kind), selectFile: async () => w.srt, listVoiceReferences: async () => ({ ok: true, references: [] }),
    latestDub: async request => clone(await svc.call('dub:latest', clone(request))), dubRuns: async request => clone(await svc.call('dub:runs', clone(request))), onDubEvent: cb => svc.on(cb), startDub: async r => svc.call('dub:start', clone(r)), cancelDub: async () => ({ ok: true }) };
  const player = win.player = { mediaKey: 'start', generation: 1, workspaceAudio: null }, pHolds = new Map();
  const play = async (item, _m, { isCancelled = () => false } = {}) => { const id = item.entry.id, initial = { key: player.mediaKey, generation: player.generation }; log.plays.push(id); const h = pHolds.get(id); if (h) { h.reach(); await h.gate; }
    if (isCancelled() || player.mediaKey !== initial.key || player.generation !== initial.generation) return; player.mediaKey = 'stream:' + id; player.generation++; player.workspaceAudio = { entryId: id, mediaKey: player.mediaKey, generation: player.generation, sourceVersion: lib.version(id) }; };
  const text = fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'), 'utf8'), start = text.indexOf('  let podcastOpenIntent='), end = text.indexOf('  const podcastButton=', start);
  win.PlayerWorkspaceIntegration = { setPodcastMode() {}, refresh() {} }; win.CinemaSahne = { open: m => log.scene.push(m.mode) };
  const ctx = { player, window: win, play, t: en => en, document: win.document }; vm.runInNewContext(text.slice(start, end), ctx); win.PlayerSourceCatalogIntegration = { openPodcastEntry: ctx.openPodcastEntry };
  el('dubGeneratorDialog').showModal = () => { el('dubGeneratorDialog').open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  win.DubRunInfo = require('../src/renderer/dub-run-info');
  for (const name of ['dub-generator-ui.js', 'dub-source-return.js', 'dub-runs-ui.js', 'assistant-voice-runs.js']) win.eval(read(name) + '\n;0');
  const section = el('dubRuns');
  const hold = id => { const item = {}; item.gate = new Promise(r => { item.release = r; }); item.reached = new Promise(r => { item.reach = r; }); pHolds.set(id, item); return item; };
  return { win, el, state, log, player, hold, section, dialog: el('dubGeneratorDialog'),
    open: async () => { el('playerDubGenerate').click(); await settle(); section.open = true; section.dispatchEvent(new win.Event('toggle')); await settle(); },
    select: async id => { section.querySelector(`.dub-run[data-run="${id}"] .dub-run-main`).click(); await settle(); },
    button: label => [...section.querySelectorAll('button')].find(b => b.textContent.includes(label)),
    click: async label => { const b = [...section.querySelectorAll('button')].find(x => x.textContent.includes(label)); assert(b, 'button ' + label); b.click(); await settle(); },
    text: () => section.textContent, close: () => win.close() };
}

test('PANEL: a recorded run shows its source and one primary action; opening it closes the panel on the episode without playing or attaching anything', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await startRun(w, svc, 'old', { source: lib.key('E1') });
    const p = panelWorld(w, svc, lib); await p.open();
    await p.select('old'); assert.match(p.text(), /Eski kayıt: yalnız opak kimlik/); assert.equal(p.button('Kaynağı aç'), undefined, 'no action without a locator'); assert.match(p.text(), /Özgün kaynağı kendin aç/);
    await p.select('r1'); assert.match(p.text(), /Podcast bölümü/); const open = p.button('Kaynağı aç'); assert(open); assert.equal(open.disabled, false);
    assert.doesNotMatch(p.text(), /cdn\.example|E1|stream:/, 'no id, URL or locator is rendered');
    await p.click('Kaynağı aç'); await tick(30); await settle();
    assert.deepEqual(p.log.plays, ['E1']); assert.equal(p.player.workspaceAudio.entryId, 'E1'); assert.equal(p.dialog.open, false, 'the panel closed on success');
    assert.equal(p.log.mediaPlay, 0); assert.equal(p.log.attach, 0); p.close();
  } finally { w.close(); }
});

test('PANEL: refusals stay in the panel with the reason and the next step; the explicit current-version action is separate; focus stays on the action', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator }); await podcastRun(w, svc, lib, 'r1', 'E1');
    const p = panelWorld(w, svc, lib); await p.open(); await p.select('r1');
    lib.entries.get('E1').enclosures[0].length = 4444; await p.click('Kaynağı aç');
    assert.equal(p.dialog.open, true); assert.match(p.text(), /audio source version or file contents are different|ses kaynağı sürümü veya dosya içeriği farklı/); assert(p.button('Güncel sürümü başvuru için aç')); assert.deepEqual(p.log.plays, []);
    assert.equal(p.win.document.activeElement, p.button('Kaynağı aç'), 'focus returns to the action');
    await p.click('Güncel sürümü başvuru için aç'); await tick(30); await settle(); assert.deepEqual(p.log.plays, ['E1']); assert.equal(p.dialog.open, false);
    p.close();
    const q = panelWorld(w, svc, lib); await q.open(); await q.select('r1'); lib.entries.delete('E1'); await q.click('Kaynağı aç');
    assert.match(q.text(), /no longer in the library|artık kütüphanede yok/); assert.match(q.text(), /kept|korunur/); assert.equal(q.dialog.open, true); assert.ok(recordOf(w, 'r1'));
    assert.equal(q.section.querySelector('.dub-run-source [role="status"]').textContent.includes('<'), false); q.close();
  } finally { w.close(); }
});

test('PANEL: closing the panel while a source opens drops the answer; a late result never touches a newer panel', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator }); await podcastRun(w, svc, lib, 'r1', 'E1');
    const p = panelWorld(w, svc, lib); await p.open(); await p.select('r1'); const slow = p.hold('E1');
    p.button('Kaynağı aç').click(); await slow.reached;
    p.dialog.open = false; p.dialog.removeAttribute('open'); p.dialog.dispatchEvent(new p.win.Event('close')); await settle();
    slow.release(); await settle(); await tick(30);
    assert.equal(p.player.workspaceAudio, null, 'the cancelled open did not complete'); assert.doesNotMatch(p.text(), /Kaynak açılıyor/); assert.equal(p.log.mediaPlay, 0); p.close();
  } finally { w.close(); }
});

test('ASSISTANT ACTION: target=source reopens the recorded source; an older record falls back to the matching open media only; nothing plays or starts', async () => {
  const w = world(); try {
    const lib = library(); lib.add('E1'); const svc = w.boot({ sourceLocators: lib.locator });
    await podcastRun(w, svc, lib, 'r1', 'E1'); await startRun(w, svc, 'old', { source: lib.key('E1') });
    const p = panelWorld(w, svc, lib); await p.open();
    const done = await p.win.AssistantVoiceRuns.open({ run_id: 'r1', target: 'source' });
    assert.deepEqual([done.status, done.kind, done.version_matches], ['completed', 'podcast', true]); assert.match(done.note, /Nothing was played or generated, and no dubbed audio was attached/);
    assert.deepEqual(p.log.plays, ['E1']); assert.equal(p.log.mediaPlay, 0); assert.equal(p.log.attach, 0);
    await p.open(); const fallback = await p.win.AssistantVoiceRuns.open({ run_id: 'old', target: 'source' });
    assert.match(fallback.note, /matching open media/); assert.deepEqual(p.log.plays, ['E1'], 'the older record opened no other source');
    lib.entries.delete('E1'); await p.open();
    await assert.rejects(() => p.win.AssistantVoiceRuns.open({ run_id: 'r1', target: 'source' }), /no longer in the library|artık kütüphanede yok/);
    p.close();
  } finally { w.close(); }
});
