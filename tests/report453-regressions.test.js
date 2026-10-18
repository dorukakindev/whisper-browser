'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');
const Dub = require('../src/renderer/browser-dub-audio');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('reading during initial cache compaction cannot discard a concurrent translation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r453-'));
  const entered = deferred(), release = deferred(); let delay = true, cache;
  const file = path.join(directory, 'cache.json');
  const injected = { ...fs, promises: { ...fs.promises, async writeFile(...args) {
    if (delay) { delay = false; entered.resolve(); await release.promise; }
    return fs.promises.writeFile(...args);
  } } };
  try {
    cache = new PersistentTranslationCache(file, { fsModule: injected, journalMaxFlushes: 100 });
    cache.set('first', 'first translation');
    const flush = cache.flush(); await entered.promise;
    cache.set('late', 'new translation');
    assert.equal(cache.get('first'), 'first translation');
    release.resolve(); assert.equal((await flush).ok, true);
    assert.equal((await cache.flush()).ok, true);
    const reloaded = new PersistentTranslationCache(file);
    assert.equal(reloaded.get('late'), 'new translation');
    assert.equal(reloaded.get('first'), 'first translation');
  } finally {
    release.resolve(); clearTimeout(cache?.timer);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed compaction restores detached rows and preserves concurrent writes for retry', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r453-retry-'));
  const entered = deferred(), release = deferred(); let fail = true, cache;
  const file = path.join(directory, 'cache.json');
  try {
    cache = new PersistentTranslationCache(file, { fsModule: { ...fs, promises: { ...fs.promises,
      async writeFile(...args) {
        if (fail) { fail = false; entered.resolve(); await release.promise; throw new Error('fixture disk error'); }
        return fs.promises.writeFile(...args);
      },
    } } });
    cache.set('first', 'first'); const pending = cache.flush(); await entered.promise;
    cache.set('second', 'second'); cache.get('first'); release.resolve();
    assert.equal((await pending).ok, false);
    assert(cache.pendingJournal.some(row => row.k === 'first'));
    assert(cache.pendingJournal.some(row => row.k === 'second'));
    assert.equal((await cache.flush()).ok, true);
    const restored = new PersistentTranslationCache(file);
    assert.equal(restored.get('first'), 'first'); assert.equal(restored.get('second'), 'second');
  } finally { release.resolve(); clearTimeout(cache?.timer); fs.rmSync(directory, { recursive: true, force: true }); }
});

function dubbing(mute) {
  const context = { mode: 'browser', tabId: 'tab', generation: 1, mediaKey: 'key', mediaId: 'media-1' };
  const audio = { readyState: 4, duration: 10, paused: true, currentTime: 0,
    addEventListener() {}, load() {}, removeAttribute() {}, pause() { this.paused = true; } };
  const controller = new Dub({ audio, context: () => ({ ...context }), mute,
    urls: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} } });
  return { controller, context, audio };
}

test('media change while restoring prior mute prevents a new stale mute request', async () => {
  const entered = deferred(), release = deferred(), calls = []; let block = true;
  const fixture = dubbing(async (_tab, muted) => {
    calls.push(muted);
    if (!muted && block) { block = false; entered.resolve(); await release.promise; }
    return { ok: true };
  });
  try {
    assert.equal(await fixture.controller.attach({ url: 'file:first' }, { ...fixture.context }), true);
    const pending = fixture.controller.attach({ url: 'file:second' }, { ...fixture.context });
    await entered.promise;
    fixture.context.mediaKey = 'other-video'; fixture.context.mediaId = 'media-2';
    release.resolve(); assert.equal(await pending, false);
    assert.deepEqual(calls, [true, false]);
    assert.equal(fixture.controller.session, null);
  } finally { release.resolve(); await fixture.controller.remove(); }
});

test('same page and generation with a replaced media element cannot keep old dub attached', async () => {
  const fixture = dubbing(async () => ({ ok: true }));
  try {
    assert.equal(await fixture.controller.attach({ url: 'file:first' }, { ...fixture.context }), true);
    fixture.context.mediaId = 'media-2';
    assert.equal(fixture.controller.matches(), false);
    fixture.controller.tick(); await fixture.controller.cleanup;
    assert.equal(fixture.controller.session, null);
  } finally { await fixture.controller.remove(); }
});

const tick = () => new Promise(setImmediate);
function generator() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8'), { runScripts: 'outside-only' });
  const w = dom.window, el = id => w.document.getElementById(id);
  let event, request;
  const context = { mode: 'browser', tabId: 'tab', generation: 1, mediaKey: 'key', mediaId: 'media-1', hasMedia: true, visible: true };
  w.HTMLMediaElement.prototype.pause = w.HTMLMediaElement.prototype.load = () => {};
  w.syncBrowserOcclusion = () => {};
  w.BrowserDubAudioUI = { context: () => ({ ...context }), attachGenerated: async () => true };
  w.api = { dubConfig: async () => ({ ok: true, ready: true }), latestDub: async () => ({ ok: true }),
    selectFile: async () => 'fixture.srt', onDubEvent: fn => { event = fn; },
    startDub: async value => { request = value; return { ok: true }; }, cancelDub: async () => ({ ok: true }) };
  el('dubGeneratorDialog').showModal = () => { el('dubGeneratorDialog').open = true; };
  w.eval(fs.readFileSync(path.join(root, 'src/renderer/dub-generator-ui.js'), 'utf8'));
  return { w, el, context, get request() { return request; }, event: value => event(value), close: () => dom.window.close() };
}

test('a late cancellation failure from job A cannot replace job B status', async () => {
  const fixture = generator(); const cancellation = deferred();
  const { el, w } = fixture;
  try {
    el('browserDubGenerate').click(); await tick(); el('dubChooseSrt').click(); await tick();
    el('dubGeneratorStart').click(); await tick(); const first = fixture.request.id;
    assert.equal(fixture.request.backgroundTab.mediaId, fixture.context.mediaId);
    w.api.cancelDub = () => cancellation.promise;
    el('dubGeneratorCancel').click(); await tick();
    fixture.event({ id: first, type: 'cancelled' });
    el('dubGeneratorStart').click(); await tick();
    assert.notEqual(fixture.request.id, first);
    const status = el('dubGeneratorStatus').textContent;
    cancellation.resolve({ ok: false }); await tick();
    assert.equal(el('dubGeneratorStatus').textContent, status);
    assert.equal(el('dubGeneratorCancel').disabled, false);
  } finally { cancellation.resolve({ ok: true }); fixture.close(); }
});

test('a late plan cannot leave the previous video SRT enabled for the next video', async () => {
  const fixture = generator(); const plan = deferred(); const { el, w, context } = fixture;
  try {
    el('browserDubGenerate').click(); await tick(); el('dubChooseSrt').click(); await tick();
    w.api.planDub = () => plan.promise;
    el('dubPlanPrepare').click(); await tick();
    context.mediaId = 'media-2'; context.mediaKey = 'other';
    el('browserDubGenerate').click(); await tick();
    plan.resolve({ ok: true, sourceHash: 'fixture', groups: [{ key: '1', text: 'old text', start: 0, end: 1000, seconds: 1 }] });
    await tick();
    assert.equal(el('dubSrtName').textContent, '—');
    assert.equal(el('dubPlanGroup').options.length, 0);
    assert.equal(el('dubGeneratorStart').disabled, true);
  } finally { fixture.close(); }
});

test('background source acquisition rejects a replaced media identity before spawning', async () => {
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const start = source.indexOf('  prepareBackground: async ({request,...options}) => {');
  let calls = 0;
  const handler = vm.runInNewContext('({' + source.slice(start, source.indexOf('  setRate: async request =>', start)) + '})', {
    browserTabById: () => ({ generation: 1, mediaId: 'new-media', view: { webContents: {
      isDestroyed: () => false, getURL: () => 'https://www.youtube.com/watch?v=abcdefghijk' } } }),
    URL, appResourceRoot: () => root, app: { getPath: () => root }, resolvePython: () => 'python', resolveFfTool: () => 'ffmpeg',
    spawn() {}, withoutSecretEnv: () => ({}), process: { env: {} },
    require: name => name === './dub-background' ? { prepareBackground: () => { calls++; } }
      : { voiceStorage: () => ({ input: root }) },
  }).prepareBackground;
  await assert.rejects(handler({ request: { backgroundTab: { tabId: 'tab', generation: 1, mediaId: 'old-media' } } }));
  assert.equal(calls, 0);
});

test('a shortening response from the previous video cannot repopulate its text editor', async () => {
  const fixture = generator(); const shortening = deferred(); const { el, w, context } = fixture;
  try {
    el('browserDubGenerate').click(); await tick(); el('dubChooseSrt').click(); await tick();
    w.api.planDub = async () => ({ ok: true, sourceHash: 'fixture', groups: [{ key: '1', text: 'original', start: 0, end: 1000, seconds: 1 }] });
    el('dubPlanPrepare').click(); await tick();
    w.api.shortenDub = () => shortening.promise;
    el('dubPlanShorten').click(); await tick();
    context.mediaId = 'media-2';
    shortening.resolve({ ok: true, text: 'wrong video text' }); await tick();
    assert.equal(el('dubPlanText').value, ''); assert.equal(el('dubGeneratorStart').disabled, true);
  } finally { fixture.close(); }
});

test('a late cancellation failure from an earlier voice-reference job leaves the new job intact', async () => {
  const fixture = generator(); const cancellation = deferred(); const { el, w } = fixture;
  const preparations = [];
  Object.assign(w.api, {
    prepareVoiceReference: () => { const pending = deferred(); preparations.push(pending); return pending.promise; },
    listVoiceReferences: async () => ({ ok: true, references: [], folder: 'fixture' }),
    onDubEvent() {}, cancelDub: () => cancellation.promise,
  });
  w.eval(fs.readFileSync(path.join(root, 'src/renderer/voice-reference-ui.js'), 'utf8'));
  try {
    el('voiceReferencePrepare').click(); await tick();
    el('voiceReferenceCancel').click(); await tick();
    preparations[0].resolve({ ok: false, cancelled: true }); await tick();
    el('voiceReferencePrepare').click(); await tick();
    assert.equal(preparations.length, 2);
    const status = el('voiceReferenceStatus').textContent;
    cancellation.resolve({ ok: false }); await tick();
    assert.equal(el('voiceReferenceStatus').textContent, status);
    assert.equal(el('voiceReferenceCancel').disabled, false);
    preparations[1].resolve({ ok: false, cancelled: true }); await tick();
  } finally { cancellation.resolve({ ok: true }); fixture.close(); }
});
