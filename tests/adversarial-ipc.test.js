'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const { SubtitleFileAccess, canonicalLocalPath, MAX_SUBTITLE_BYTES } = require('../src/local-file-access');
const { clonePublicOptions, validateQueueOptions } = require('../src/queue-persistence');
const { createNdjsonLineBuffer } = require('../src/ndjson-lines');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const handlers = new Map();
for (const match of main.matchAll(/^ipcMain\.handle\('([^']+)'/gm)) {
  const ends = ['\n});', '\n}));'].map((token) => ({ at: main.indexOf(token, match.index), length: token.length }))
    .filter((end) => end.at >= 0).sort((a, b) => a.at - b.at);
  const end = ends[0];
  const lineEnd = main.indexOf('\n', match.index);
  const oneLine = main.slice(match.index, lineEnd).trimEnd().endsWith(');');
  handlers.set(match[1], main.slice(match.index, oneLine ? lineEnd : end.at + end.length));
}
function register(channel, context) {
  let callback;
  vm.runInNewContext(handlers.get(channel), { ...context, ipcMain: { handle: (name, fn) => {
    assert.equal(name, channel); assert.equal(callback, undefined); callback = fn;
  } } });
  return callback;
}
const frame = {}, sender = { mainFrame: frame };
const authorized = { sender, senderFrame: frame };
const authSrc = main.slice(main.indexOf('function authorizedBrowserSender'), main.indexOf('\nasync function authorizeSubtitleFile'));
const auth = vm.runInNewContext(`${authSrc}; authorizedBrowserSender`, {
  mainWindow: { isDestroyed: () => false, webContents: sender },
});
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`  PASS  ${name}`); }

(async () => {
  await test('tüm invoke kanalları yabancı pencere ve alt frame isteklerini yan etkisiz reddeder', async () => {
    assert(handlers.size >= 90);
    for (const channel of handlers.keys()) {
      const handler = register(channel, {
        authorizedBrowserSender: auth,
        queueBrowserTabTransition: (fn) => fn(),
      });
      for (const event of [{ sender: {}, senderFrame: frame }, { sender, senderFrame: {} }, null]) {
        await handler(event); // Missing globals would throw if the guard were bypassed.
      }
    }
    assert.equal(auth(authorized), true);
    console.log(`    ${handlers.size} kanal × 3 yetkisiz gönderici`);
  });
  await test('altyazı yetkisi yalnız seçilen dosyaya aittir; tür/boyut/ADS kontrolü yapılır', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-path-access-'));
    try {
      const file = path.join(dir, 'seçilen.srt'), other = path.join(dir, 'başka.srt');
      fs.writeFileSync(file, 'altyazı'); fs.writeFileSync(other, 'başka');
      const access = new SubtitleFileAccess();
      assert.equal(access.has(access.inspect(file)), false);
      access.grant(file);
      assert.equal(access.has(access.inspect(file)), true);
      assert.equal(access.has(access.inspect(other)), false);
      assert.throws(() => access.inspect(path.join(dir, 'private_key')));
      assert.throws(() => access.inspect(path.join(dir, 'run.exe')));
      assert.throws(() => access.inspect('relative.srt'));
      if (process.platform === 'win32') assert.throws(() => access.inspect(file + ':secret.srt'));
      const big = path.join(dir, 'big.srt'); fs.writeFileSync(big, ''); fs.truncateSync(big, 33 * 1024 * 1024);
      assert.throws(() => access.inspect(big), /32 MB/);
      const authorizeSrc = main.slice(main.indexOf('async function authorizeSubtitleFile'), main.indexOf("\nipcMain.on('browser:trusted-bridge'"));
      let prompts = 0, response = 0;
      const authorizeFile = vm.runInNewContext(`${authorizeSrc}; authorizeSubtitleFile`, {
        subtitleFileAccess: access, mainWindow: {},
        dialog: { showMessageBox: async () => { prompts++; return { response }; } },
      });
      await authorizeFile(file); assert.equal(prompts, 0);
      await assert.rejects(authorizeFile(other), /onaylanmadı/);
      assert.equal(access.has(access.inspect(other)), false);
      response = 1; await authorizeFile(other); await authorizeFile(other);
      assert.equal(prompts, 2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test('izinli altyazı okuma/yazma/kaydırma Türkçe kodlamayı ve ilk yedeği korur', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-subtitle-handlers-'));
    try {
      const file = path.join(dir, 'film.srt');
      const original = Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\n\xdeimdi\r\n', 'latin1');
      fs.writeFileSync(file, original);
      const access = new SubtitleFileAccess(); access.grant(file);
      const context = vm.createContext({ fs, path, Buffer, MAX_SUBTITLE_BYTES,
        authorizedBrowserSender: auth, subtitleFileAccess: access,
        dialog: { showMessageBox: async () => ({ response: 0 }) }, mainWindow: {} });
      const snippets = [
        main.slice(main.indexOf('const CP1254_FIXUP'), main.indexOf("ipcMain.handle('media:readSubtitle'")),
        main.slice(main.indexOf('function backupOnce'), main.indexOf('function queueStatePath')),
        main.slice(main.indexOf('function shiftTimecodes'), main.indexOf("ipcMain.handle('subs:shift'")),
        main.slice(main.indexOf('async function authorizeSubtitleFile'), main.indexOf("\nipcMain.on('browser:trusted-bridge'")),
      ];
      vm.runInContext(snippets.join('\n'), context);
      const registered = {};
      context.ipcMain = { handle: (channel, fn) => { registered[channel] = fn; } };
      for (const channel of ['media:readSubtitle', 'media:writeSubtitle', 'subs:shift']) vm.runInContext(handlers.get(channel), context);
      const read = await registered['media:readSubtitle'](authorized, file);
      assert.equal(read.ok, true); assert.match(read.text, /Şimdi/); assert.equal(read.note, 'cp1254');
      for (const offset of [1, 2]) assert.equal((await registered['subs:shift'](authorized, file, offset)).ok, true);
      assert.match(fs.readFileSync(file, 'utf8'), /00:00:04,000 --> 00:00:05,000\r\nŞimdi/);
      assert.equal((await registered['media:writeSubtitle'](authorized, { path: file, text: 'Yeni çeviri' })).ok, true);
      assert.equal(fs.readFileSync(file, 'utf8'), '\uFEFFYeni çeviri');
      assert.deepEqual(fs.readFileSync(file + '.bak'), original);
      const unknown = path.join(dir, 'başka.srt'); fs.writeFileSync(unknown, 'dokunma');
      assert.equal((await registered['media:writeSubtitle'](authorized, { path: unknown, text: 'overwrite' })).ok, false);
      assert.equal(fs.readFileSync(unknown, 'utf8'), 'dokunma');
      assert.equal(fs.existsSync(unknown + '.bak'), false);
      const secret = path.join(dir, 'private_key'); fs.writeFileSync(secret, 'private');
      assert.equal((await registered['media:readSubtitle'](authorized, secret)).ok, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test('shell yalnız desteklenen belge/medya veya klasör açar, betik ve EXE reddedilir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-shell-guard-'));
    try {
      const opened = [];
      const handler = register('shell:openPath', { authorizedBrowserSender: auth, canonicalLocalPath, fs,
        shell: { openPath: async (file) => { opened.push(file); return ''; } } });
      for (const name of ['run.exe', 'run.cmd', 'run.ps1', 'shortcut.lnk']) {
        const file = path.join(dir, name); fs.writeFileSync(file, 'not executable');
        assert.match(await handler(authorized, file), /açılamaz/);
      }
      const file = path.join(dir, 'film.srt'); fs.writeFileSync(file, 'subtitle');
      await handler(authorized, file); await handler(authorized, dir);
      assert.deepEqual(opened, [fs.realpathSync(file), fs.realpathSync(dir)]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test('renderer eski iş olayını oynatıcıya veya kuyruk durumuna dokunmadan reddeder', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
    const start = renderer.indexOf('window.api.onEvent((event) => {');
    const end = renderer.indexOf('\n});', start) + 4;
    let callback, processed = 0;
    const state = { queueRunning: true, currentQueueId: 42 };
    vm.runInNewContext(renderer.slice(start, end), { state,
      window: { api: { onEvent: (fn) => { callback = fn; } } },
      playerJobEvent: () => { processed++; return true; },
    });
    for (const type of ['exit', 'done', 'error', 'progress']) callback({ type, queueItemId: 41 });
    assert.equal(processed, 0);
    callback({ type: 'progress', queueItemId: 42 }); assert.equal(processed, 1);
    state.queueRunning = false;
    state.currentQueueId = null;
    callback({ type: 'done', queueItemId: 42 }); assert.equal(processed, 1);
  });
  await test('büyük queue:save mevcut kayda dokunmaz', async () => {
    let writes = 0;
    const handler = register('queue:save', {
      authorizedBrowserSender: () => true, validateQueueOptions,
      writeQueueState: () => { writes++; },
    });
    const result = await handler(authorized, { items: [{ opts: { glossary: 'x'.repeat(600000) } }] });
    assert.equal(result.ok, false); assert.equal(writes, 0);
  });
  await test('transcribe error → close eski kilidi erken açmaz, olaylar iş kimliği taşır', async () => {
    const emitted = [], terminals = [], spawned = [];
    const context = {
      authorizedBrowserSender: () => true, clonePublicOptions, createNdjsonLineBuffer,
      activeJob: null, activeQueueItemId: null, burninJob: null, browserLiveAsr: null,
      modelBenchmarkJob: null, modelProcesses: new Set(), mainWindow: null,
      app: { getAppPath: () => os.tmpdir(), getPath: () => os.tmpdir() }, path, Buffer,
      process: { env: {} }, resolvePython: () => 'mock-python',
      spawn: () => {
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
        proc.stdout.setEncoding = proc.stderr.setEncoding = () => {};
        spawned.push(proc); return proc;
      },
      persistQueueRunning: () => {}, persistQueueTerminal: (id, event) => terminals.push({ id, event }),
      sendEvent: (event) => emitted.push(event), writeJobLog: () => {}, startJobLog: () => {},
      endJobLog: () => {}, recordJob: () => {}, setTaskbarProgress: () => {},
      startPowerBlocker: () => {}, stopPowerBlocker: () => {},
    };
    // Unlike register(), keep one context so assignments remain observable.
    const sandbox = vm.createContext(context);
    sandbox.ipcMain = { handle: (_name, fn) => { sandbox.start = fn; } };
    vm.runInContext(handlers.get('transcribe:start'), sandbox);
    for (const key of ['browserLiveAsr', 'modelBenchmarkJob']) {
      sandbox[key] = {}; assert.equal((await sandbox.start({}, { input: 'fake.mp4' })).ok, false); sandbox[key] = null;
    }
    sandbox.modelProcesses.add({}); assert.equal((await sandbox.start({}, { input: 'fake.mp4' })).ok, false); sandbox.modelProcesses.clear();
    assert.equal((await sandbox.start({}, { input: 'fake.mp4', queueItemId: 10 })).ok, true);
    const proc = spawned[0];
    proc.emit('error', Object.assign(Error('missing'), { code: 'ENOENT' }));
    assert.equal(sandbox.activeJob, proc);
    assert.equal((await sandbox.start({}, { input: 'fake.mp4', queueItemId: 11 })).ok, false);
    proc.emit('close', -1);
    assert.equal(sandbox.activeJob, null); assert.equal(sandbox.modelProcesses.size, 0);
    assert.equal(terminals.length, 1);
    assert(emitted.every((event) => event.queueItemId === 10));
    assert.equal((await sandbox.start({}, { input: 'fake.mp4', queueItemId: 11 })).ok, true);
    spawned[1].stdout.emit('data', JSON.stringify({ type: 'error', message: 'test', traceback: 'private path', queueItemId: 999 }) + '\n');
    assert.equal(emitted.at(-1).queueItemId, 11);
    assert.equal(emitted.at(-1).traceback, undefined);
    spawned[1].emit('close', 1);
  });
  await test('benchmark dosya diyaloğu sırasında başlayan model işi ikinci spawnı engeller', async () => {
    const context = { authorizedBrowserSender: () => true, activeJob: null, burninJob: null, browserLiveAsr: null,
      modelBenchmarkJob: null, modelProcesses: new Set(), mainWindow: { webContents: sender } };
    let complete;
    context.dialog = { showOpenDialog: () => new Promise((resolve) => { complete = resolve; }) };
    const sandbox = vm.createContext(context);
    sandbox.ipcMain = { handle: (_name, fn) => { sandbox.start = fn; } };
    vm.runInContext(handlers.get('models:benchmark'), sandbox);
    const pending = sandbox.start(authorized);
    sandbox.modelProcesses.add({}); complete({ filePaths: ['fake.mp4'], canceled: false });
    assert.equal((await pending).ok, false);
  });
  await test('gömme sürerken kurtarma ve silme dosyalara dokunmadan reddedilir', async () => {
    for (const channel of ['burnin:recovery:recover', 'burnin:recovery:discard']) {
      const handler = register(channel, { authorizedBrowserSender: auth, burninJob: {} });
      const result = await handler(authorized, 'test');
      assert.equal(result.ok, false); assert.equal(result.running, true);
    }
    let finishInspect;
    const context = vm.createContext({ authorizedBrowserSender: auth, burninJob: null,
      inspectBurninRecovery: () => new Promise((resolve) => { finishInspect = resolve; }) });
    context.ipcMain = { handle: (_channel, handler) => { context.recover = handler; } };
    vm.runInContext(handlers.get('burnin:recovery:recover'), context);
    const pending = context.recover(authorized, 'test');
    context.burninJob = {};
    finishInspect({ ok: true, recovery: { id: 'test' } });
    assert.equal((await pending).running, true);
    const discard = register('burnin:recovery:discard', { authorizedBrowserSender: auth, burninJob: null,
      readBurninRecoveryState: () => ({ id: 'test' }), burninRecoveryProcessIsRunning: () => true });
    assert.equal(discard(authorized, 'test').running, true);
  });
  await test('modal açıkken gezinme görünümü erkenden açmaz', async () => {
    for (const occluded of [true, false]) {
      const visibility = [];
      const tab = { id: 't' };
      const view = { setVisible: (v) => visibility.push(v), webContents: { loadURL: async () => {} } };
      const navigate = register('browser:navigate', {
        authorizedBrowserSender: auth, activeRequestedBrowserTab: () => tab,
        normalizeBrowserUrl: (u) => u, waitForProtectedPlayback: async () => {},
        setBrowserTabCompatibilityMode: async () => {},
        browserCompatibilityModeForUrl: () => false,
        ensureBrowserView: () => view, browserBounds: null, browserVisible: false,
        browserModalOccluded: occluded, browserOverlay: {}, resetBrowserCaptureState: () => {},
        startBrowserPolling: () => {}, scheduleBrowserSessionSave: () => {},
        browserEventContext: () => ({}), browserNavigationState: () => ({}) });
      assert((await navigate(authorized, { url: 'https://example.com', tabId: 't' })).ok);
      assert.deepEqual(visibility, [!occluded]);
    }
  });
  await test('pencere Widevine hazırlığı tamamlanmadan oluşturulur', async () => {
    const start = main.indexOf('if (hasSingleInstanceLock) app.whenReady().then(');
    const block = main.slice(start, main.indexOf('\n});', start) + 4);
    const calls = []; let ready, finishDrm;
    vm.runInNewContext(block, {
      hasSingleInstanceLock: true,
      app: { whenReady: () => ({ then: (fn) => { ready = fn; } }), getPath: () => 'test-profile' },
      prepareWidevineComponents: () => { calls.push('prepare'); return new Promise((resolve) => { finishDrm = resolve; }); },
      sweepStaleChatFiles() {}, sweepBrowserLiveAsrTemp() {}, sweepBrowserSubtitleFiles() {},
      browserAssetStore: () => ({ sweepTempFiles() {} }),
      ADAPTER_REGISTRY: { loadJsonDirectory() {} }, browserAdapterPluginStatus: null, path,
      restoreBrowserSessionState() {}, createWindow: () => calls.push('window'), console });
    await ready();
    assert.deepEqual(calls, ['prepare', 'window']);
    finishDrm();
  });
  console.log(`adversarial-ipc: ${passed} test`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
