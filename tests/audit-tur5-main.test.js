'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { createWatchLibraryStore } = require('../src/watch-library-store');
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
function fn(name, ctx) {
  let start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  return vm.runInNewContext(`${source.slice(start, source.indexOf('\n}', start) + 2)}; ${name}`, ctx);
}
function handler(name, ctx, kind = 'handle') {
  const start = source.indexOf(`ipcMain.${kind}('${name}'`);
  const end = ['\n});', '\n}));'].map(s => ({ p: source.indexOf(s, start), s }))
    .filter(x => x.p >= 0).sort((a, b) => a.p - b.p)[0];
  const sandbox = vm.createContext(ctx);
  sandbox.ipcMain = { [kind]: (_, callback) => { sandbox.run = callback; } };
  vm.runInContext(source.slice(start, end.p + end.s.length), sandbox);
  return sandbox;
}
const turn = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  // Late A must not detach/clear the newer B debugger attachment on the SAME
  // WebContents after capture is toggled (or on another active tab).
  {
    const network = []; let detached = 0;
    const wc = { isDestroyed: () => false, debugger: { isAttached: () => true,
      detach() { detached++; }, sendCommand(name) {
        return name === 'Network.enable' ? new Promise(resolve => network.push(resolve)) : Promise.resolve();
      } } };
    const ctx = vm.createContext({ browserCaptureEnabled: true, browserPlayerResponseAdPruneEnabled: false,
      browserView: { webContents: wc },
      activeBrowserTab: () => ({}), browserEventContext: () => ({}), browserStateGeneration: 1,
      browserDebuggerReady: false, browserDebuggerAttachAttempts: new WeakMap(),
      setTimeout: () => 1, clearTimeout() {},
      // attachBrowserDebugger artik ortak zaman asimi yardimcisini kullaniyor
      // (yaris tabanli yerel surum kaybeden tarafi iptal etmiyordu).
      withTimeout: require('../src/async-timeout').withTimeout });
    ctx.browserDebuggerNeeded = () => ctx.browserCaptureEnabled;
    ctx.isCurrentBrowserContext = context => context.stateGeneration === ctx.browserStateGeneration;
    const attach = fn('attachBrowserDebugger', ctx);
    const old = attach(); ctx.browserStateGeneration++;
    const latest = attach();
    network[1](); await latest;
    assert.equal(ctx.browserDebuggerReady, true);
    network[0](); await old;
    assert.equal(ctx.browserDebuggerReady, true);
    assert.equal(detached, 0);
  }
  // Lazy restore loads only the selected blank view, once; closing/superseding
  // it while protected-playback startup waits must prevent stale navigation.
  for (const scenario of ['load', 'closed', 'navigated']) {
    let release, current, url = 'about:blank', loads = 0;
    const ready = new Promise(resolve => { release = resolve; });
    const tab = { id: 'tab', restoredUrl: 'https://example.test/watch/1', view: { webContents: {
      isDestroyed: () => false, getURL: () => url, loadURL: async value => { loads++; url = value; },
    } } };
    current = tab;
    const resume = fn('resumeRestoredBrowserPage', { waitForProtectedPlayback: () => ready,
      setBrowserTabCompatibilityMode: async (item, enabled) => { item.compatibilityMode = enabled; return true; },
      browserCompatibilityModeForUrl: () => false,
      suspendBrowserInstrumentationForNavigation() {},
      browserTabById: () => current, sendBrowserEvent() {}, isAbortedBrowserNavigation: () => false,
      browserLoadErrorMessage: () => 'hata' });
    resume(tab); resume(tab);
    assert.equal(loads, 0);
    if (scenario === 'closed') current = null;
    if (scenario === 'navigated') url = 'https://example.test/other';
    release(); await turn();
    assert.equal(loads, scenario === 'load' ? 1 : 0);
    assert.equal(tab.restoringPage, false);
    resume(tab); await turn();
    assert.equal(loads, scenario === 'load' ? 1 : 0);
  }

  // Library deletion is not annotation deletion; simulated transaction/write
  // failures must not report success or leave the JSON cache prematurely empty.
  for (const scenario of ['notes', 'none', 'json-failure', 'commit-failure']) {
    let library = [{ key: 'a' }], removed = 0, writes = 0;
    const index = {
      removeMedia() { removed++; }, transaction(work) {
        const old = removed;
        try { work(); if (scenario === 'commit-failure') throw Error('commit failed'); }
        catch (error) { removed = old; throw error; }
      } };
    const store = {
      remove(key) {
        writes++;
        if (scenario === 'json-failure') throw Error('json failed');
        library = library.filter(item => item.key !== key);
        return true;
      },
    };
    const ctx = handler('library:remove', { authorizedBrowserSender: () => true,
      loadWatchLibraryAll: () => library.slice(), watchLibraryStore: () => store, watchIndex: () => index,
      ensureBrowserNotesReady: () => ({ list: () => scenario === 'notes' ? [{}] : [] }),
      saveWatchLibrary: value => {
        writes++; library = value; return true;
      } });
    const result = await ctx.run({}, 'a');
    assert.equal(result.ok, ['notes', 'none'].includes(scenario));
    assert.equal(removed, scenario === 'none' ? 1 : 0);
    assert.equal(library.length, result.ok ? 0 : 1);
    if (scenario === 'commit-failure') assert.equal(writes, 2);
  }

  // Security limits are an external behavior contract, not a source-location
  // assertion: run the real main.js upsert function and IPC callback against
  // the real store so the test survives moving the guard to another helper.
  {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-library-ipc-size-'));
    try {
      const store = createWatchLibraryStore({ filePath: path.join(temp, 'watch-library.json') });
      const upsertWatchItem = fn('upsertWatchItem', {
        watchLibraryStore: () => store,
        watchIndex: () => null,
      });
      const ipc = handler('library:upsert', {
        authorizedBrowserSender: () => true,
        upsertWatchItem,
      });
      assert.equal((await ipc.run({}, { key: 'file:small', title: 'sağlam' })).ok, true);
      assert.equal((await ipc.run({}, {
        key: 'file:oversized-patch', title: 'x'.repeat(129 * 1024),
      })).ok, false, '128 KB üstü dış library:upsert isteği kabul edildi');
      assert.equal((await ipc.run({}, {
        key: 'file:merge', futureA: 'a'.repeat(110 * 1024),
      })).ok, true);
      assert.equal((await ipc.run({}, {
        key: 'file:merge', futureB: 'b'.repeat(110 * 1024),
      })).ok, true);
      assert.equal((await ipc.run({}, {
        key: 'file:merge', futureC: 'c'.repeat(50 * 1024),
      })).ok, false, '256 KB üstüne birleşen dış library:upsert kaydı kabul edildi');
      const persisted = store.loadAll();
      assert(!persisted.some((item) => item.key === 'file:oversized-patch'));
      assert.equal(persisted.find((item) => item.key === 'file:merge').futureC, undefined);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  // Invalid image data is rejected before a file dialog or allocation-heavy IO.
  let dialogs = 0, written;
  const images = handler('media:saveImage', { authorizedBrowserSender: () => true, Buffer, path,
    loadSettings: () => ({}), app: { getPath: () => '/synthetic' },
    mainWindow: {}, dialog: { showSaveDialog: async () => { dialogs++; return { filePath: 'test.png' }; } },
    fs: { writeFileSync: (_, value) => { written = value; } } });
  for (const dataUrl of ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,AAAA',
    'data:image/png;base64,' + 'A'.repeat(24 * 1024 * 1024)]) {
    assert.equal((await images.run({}, { dataUrl })).ok, false);
  }
  assert.equal(dialogs, 0);
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  assert.equal((await images.run({}, { dataUrl: 'data:image/png;base64,' + png.toString('base64') })).ok, true);
  assert(written.equals(png));

  const shift = handler('subs:shift', { authorizedBrowserSender: () => true });
  for (const offsetSec of [Infinity, NaN, 1e308, 86401, -86401]) {
    const result = await shift.run({}, 'file.srt', offsetSec);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Geçersiz parametre.');
  }

  for (const scenario of ['success', 'timeout', 'oversize', 'error']) {
    const proc = new EventEmitter(); proc.stdout = new EventEmitter();
    let timeout, killed = 0;
    const probe = handler('media:probeTracks', { authorizedBrowserSender: () => true,
      resolveFfTool: () => 'ffprobe', spawn: () => proc,
      setTimeout: fn => { timeout = fn; return { unref() {} }; }, clearTimeout() {},
      terminateProcessTree: () => { killed++; }, parseSubtitleStreams: () => [], subtitleTrackLabel: () => '',
    });
    const pending = probe.run({}, '/synthetic/video.mp4');
    if (scenario === 'timeout') timeout();
    else if (scenario === 'oversize') proc.stdout.emit('data', 'a'.repeat(4 * 1024 * 1024 + 1));
    else if (scenario === 'error') proc.emit('error', Error('spawn failed'));
    else proc.stdout.emit('data', '{"streams":[{"codec_type":"audio","codec_name":"aac"}]}');
    proc.emit('close', 0);
    const result = await pending;
    assert.equal(result.ok, scenario === 'success');
    assert.equal(killed, ['timeout', 'oversize'].includes(scenario) ? 1 : 0);
  }

  let shown = 0, now = 100;
  class Notification { static isSupported() { return true; } on() {} show() { shown++; } }
  const notify = handler('notify', { Notification, authorizedBrowserSender: () => true,
    notificationTimes: new WeakMap(), Date: { now: () => now } });
  const event = { sender: {} };
  assert.equal(notify.run(event, {}), true);
  assert.equal(notify.run(event, {}), false);
  now += 3000;
  assert.equal(notify.run(event, {}), true);
  assert.equal(shown, 2);

  // Failed persistence rolls the restore switch back to the actual saved state.
  const restore = handler('browser:session:setRestore', { authorizedBrowserSender: () => true,
    browserSessionRestoreEnabled: true, persistBrowserSessionNow: () => ({ ok: false, error: 'disk' }) });
  assert.equal((await restore.run({}, false)).ok, false);
  assert.equal(restore.browserSessionRestoreEnabled, true);

  // Session reset and subsequent tab creation share one serialized transition.
  let chain = Promise.resolve(), finishStorage;
  const events = [];
  const queue = work => { const result = chain.then(work); chain = result.catch(() => {}); return result; };
  const reset = handler('browser:session:reset', { authorizedBrowserSender: () => true,
    queueBrowserTabTransition: queue, mainWindowClosing: false,
    browserSessionMutationPromise: null, browserSessionResetPromise: null,
    resetPersistentBrowserSession: async () => {
      events.push('destroy');
      await new Promise(resolve => { finishStorage = resolve; });
      events.push('write-empty');
      return { ok: true };
    } });
  const resetting = reset.run({});
  const create = queue(() => events.push('create-tab'));
  await turn(); assert(!events.includes('create-tab'));
  finishStorage(); assert.equal((await resetting).ok, true); await create;
  assert(events.indexOf('write-empty') < events.indexOf('create-tab'));
  assert.equal(reset.browserSessionSaveTimer, null);

  let finishClear, oldReload = 0, newReload = 0;
  const oldView = { webContents: { isDestroyed: () => false, getURL: () => 'https://a.test/watch', reload: () => oldReload++ } };
  const cookies = handler('browser:cookies:clearSite', { authorizedBrowserSender: () => true, URL,
    mainWindowClosing: false, browserSessionMutationPromise: null,
    browserView: oldView, clearBrowserSiteData: () => new Promise(resolve => { finishClear = resolve; }) });
  const clearing = cookies.run({}, 'https://a.test/watch');
  cookies.browserView = { webContents: { isDestroyed: () => false, getURL: () => 'https://b.test/', reload: () => newReload++ } };
  finishClear({ ok: true }); await clearing;
  assert.equal(oldReload, 1); assert.equal(newReload, 0);

  const { clearBrowserSiteData } = require('../src/browser-session-privacy');
  const partialResult = await clearBrowserSiteData({
    closeAllConnections: async () => {},
    clearData: async () => {},
    clearStorageData: async () => { throw Error('cache-storage'); },
    cookies: { get: async () => { throw Error('values-read'); }, flushStore: async () => {} },
  }, 'https://a.test');
  assert.equal(partialResult.ok, false); assert.equal(partialResult.partial, true);

  // Bounded edit history does not delete old records and never prevents saving
  // the subtitle itself. Use an entirely in-memory filesystem.
  const id = 'a'.repeat(24), files = new Map();
  const append = fn('appendSubtitleEditLog', { path, Buffer, fs: {
    existsSync: () => true, readdirSync: () => [...files.keys()],
    statSync: name => ({ size: files.get(path.basename(name)) }), mkdirSync() {},
    appendFileSync(name, line) { const base = path.basename(name); files.set(base, (files.get(base) || 0) + Buffer.byteLength(line)); },
  } });
  assert.equal(append('/synthetic', id, { before: 'a', after: 'b' }), '');
  files.set(`${id}.jsonl`, 4 * 1024 * 1024);
  assert.match(append('/synthetic', id, {}), /sınır/);
  assert.equal(files.get(`${id}.jsonl`), 4 * 1024 * 1024);
  console.log('Tur 5 main davranış testleri geçti.');
})().catch(error => { console.error(error); process.exitCode = 1; });
