const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
function handler(channel, context) {
  const start = main.indexOf(`ipcMain.handle('${channel}'`);
  const end = main.indexOf('\n});', start) + 4;
  const sandbox = vm.createContext(context);
  sandbox.ipcMain = { handle: (_, fn) => { sandbox.run = fn; } };
  vm.runInContext(main.slice(start, end), sandbox);
  return sandbox;
}

const watchdog = setTimeout(() => { console.error('Tur 4 testleri tamamlanamadı'); process.exit(1); }, 5000);
(async () => {
  // BUG-179: same extension set for the picker and directory scanning.
  const extsStart = main.indexOf('const MEDIA_EXTS =');
  const mediaExts = vm.runInNewContext(main.slice(extsStart, main.indexOf('\n]);', extsStart) + 4) + '\nMEDIA_EXTS');
  let pickedOptions;
  const picker = handler('dialog:openVideo', {
    authorizedBrowserSender: () => true, loadSettings: () => ({}), mainWindow: {}, MEDIA_EXTS: mediaExts,
    dialog: { showOpenDialog: async (_, opts) => { pickedOptions = opts; return { canceled: true }; } },
  });
  await picker.run({});
  assert.deepStrictEqual([...pickedOptions.filters[0].extensions], [...mediaExts]);

  // BUG-180/191: no real processes, GPU or timers; exercise the full IPC handler.
  function benchmarkContext() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
    proc.stdout.setEncoding = proc.stderr.setEncoding = () => {};
    const ctx = {
      authorizedBrowserSender: () => true, activeJob: null, burninJob: null, browserLiveAsr: null,
      modelBenchmarkJob: null, modelProcesses: new Set(), mainWindow: {},
      dialog: { showOpenDialog: async () => ({ filePaths: ['synthetic.mp4'] }) },
      loadSettings: () => ({}), KNOWN_MODELS: ['small'], app: { getAppPath: () => '/synthetic' },
      path, process, fs: { existsSync: () => false }, resolvePython: () => 'python',
      spawned: 0, killed: 0, cleared: 0,
    };
    ctx.spawn = () => { ctx.spawned++; return proc; };
    ctx.terminateProcessTree = () => { ctx.killed++; };
    ctx.setTimeout = (fn, ms) => { ctx.timeout = fn; assert.strictEqual(ms, 1200000); return { unref() {} }; };
    ctx.clearTimeout = () => { ctx.cleared++; };
    return { ctx, proc };
  }
  for (const busyAfterDialog of [false, true]) {
    const { ctx } = benchmarkContext();
    const sandbox = handler('models:benchmark', ctx);
    if (busyAfterDialog) ctx.dialog.showOpenDialog = async () => {
      sandbox.burninJob = {}; return { filePaths: ['synthetic.mp4'] };
    };
    else sandbox.burninJob = {};
    assert.strictEqual((await sandbox.run({})).ok, false);
    assert.strictEqual(ctx.spawned, 0);
  }
  for (const timedOut of [false, true]) {
    const { ctx, proc } = benchmarkContext();
    const sandbox = handler('models:benchmark', ctx);
    const pending = sandbox.run({});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(proc.listenerCount('close'), 1);
    if (timedOut) {
      ctx.timeout();
      assert.strictEqual(ctx.killed, 1);
      assert.strictEqual((await pending).ok, false);
      assert.strictEqual(sandbox.modelProcesses.has(proc), true, 'Keep GPU lock until close');
    } else proc.stdout.emit('data', '{"ok":true}\n');
    proc.emit('close', 0);
    assert.strictEqual((await pending).ok, !timedOut);
    assert.strictEqual(sandbox.modelBenchmarkJob, null);
    assert.strictEqual(ctx.cleared, 1);
    assert.strictEqual(sandbox.modelProcesses.size, 0);
  }
  const liveStart = main.indexOf('function startBrowserLiveAsr(');
  const liveGuard = main.slice(liveStart, main.indexOf('  const settings = loadSettings();', liveStart)) + '\n}';
  assert.strictEqual(vm.runInNewContext(liveGuard + '\nstartBrowserLiveAsr({})', {
    browserLiveAsr: null, activeJob: null, burninJob: {}, modelBenchmarkJob: null, modelProcesses: new Set(),
  }).ok, false);

  // BUG-181: invalid backend lines cannot pollute the live job or track store.
  const consumeStart = main.indexOf('  const consumeLiveAsrLine =');
  const consumeCode = main.slice(consumeStart, main.indexOf('  const liveAsrLines =', consumeStart));
  const job = { nextCueId: 0, cues: [] };
  const stored = [];
  const consume = vm.runInNewContext(consumeCode + '\nconsumeLiveAsrLine', {
    job, browserLiveAsr: job, context: {}, isCurrentBrowserContext: () => true,
    tab: { id: 'test', acquisitionId: 'test' }, language: 'en',
    storeBrowserTrack: (cues) => { stored.push(cues); },
  });
  consume('null');
  for (const times of [[null, 2], ['1', 2], [-1, 2], [3, 2], [2, 2]]) {
    consume(JSON.stringify({ type: 'segment', start: times[0], end: times[1], text: 'Test' }));
  }
  assert.strictEqual(stored.length, 0);
  consume('{"type":"segment","start":1,"end":2,"text":"Test"}');
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(job.cues.length, 1);

  // BUG-193: dispatch one key through both actual handlers.
  const listeners = [], activations = [];
  const tabs = [0, 1].map(i => ({ dataset: { browserTabActivate: String(i) }, focus() {}, click() { activations.push(String(i)); } }));
  const strip = { dataset: {}, querySelectorAll: () => tabs, addEventListener: (_, fn) => listeners.push(fn) };
  const navStart = renderer.indexOf("if ($('browserTabStrip')) $('browserTabStrip').addEventListener('keydown'");
  const nav = renderer.slice(navStart, renderer.indexOf("if ($('browserGo'))", navStart));
  const genericStart = renderer.indexOf('function setupRovingTablists()');
  const generic = renderer.slice(genericStart, renderer.indexOf('// PLAYER_END', genericStart));
  vm.runInNewContext(nav + generic, { $: () => strip, $$: () => [strip], document: { activeElement: tabs[0] },
    activateBrowserTabAndFocus: id => activations.push(id) });
  const event = { key: 'ArrowRight', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  listeners.forEach(fn => fn(event));
  assert.deepStrictEqual(activations, ['1']);

  // BUG-214: closing queued B must not close/de-inert active A.
  const active = {}, queued = {};
  const modalStart = renderer.indexOf('function closeManagedModal(');
  const modalCode = renderer.slice(modalStart, renderer.indexOf("document.addEventListener('keydown'", modalStart));
  const modal = vm.createContext({ _activeModal: active, _queuedModalOpen: { modal: queued }, _modalReturnFocus: active });
  vm.runInContext(modalCode + '\nthis.close = closeManagedModal;', modal);
  modal.close(queued);
  assert.strictEqual(modal._queuedModalOpen, null);
  assert.strictEqual(modal._activeModal, active);
  assert.strictEqual(modal._modalReturnFocus, active);

  // BUG-195: clearing the picker also invalidates a delayed ffprobe reply.
  const audioNodes = {
    audioTrackField: { hidden: false, classList: { add() { audioNodes.audioTrackField.hidden = true; }, remove() { audioNodes.audioTrackField.hidden = false; } } },
    audioTrack: { innerHTML: '', appendChild() { throw Error('Stale track was rendered'); } },
  };
  let completeProbe;
  const audioCode = renderer.slice(renderer.indexOf('let audioTrackProbeGeneration'), renderer.indexOf("$('clearFile').addEventListener"));
  const audio = vm.createContext({ $: id => audioNodes[id], window: { api: { probeTracks: () => new Promise(resolve => { completeProbe = resolve; }) } } });
  vm.runInContext(audioCode + '\nthis.refresh = refreshAudioTracks; this.reset = resetAudioTracks;', audio);
  const probing = audio.refresh('synthetic.mp4');
  audio.reset();
  completeProbe({ ok: true, tracks: [{ index: 0 }, { index: 1 }] });
  await probing;
  assert.strictEqual(audioNodes.audioTrackField.hidden, true);
  const queueAdd = renderer.slice(renderer.indexOf("$('queueAddBtn').addEventListener"), renderer.indexOf("$('clearQueue').addEventListener"));
  assert.match(queueAdd, /state\.inputFile = null;\s*resetAudioTracks\(\)/);

  // BUG-206: IPC history is the last eight messages, without mutating UI history.
  const chatStart = renderer.indexOf('async function aiChatSend(');
  const chatCode = renderer.slice(chatStart, renderer.indexOf('  delete opts.youtube;', chatStart)) + '\nreturn opts.chat; }';
  const history = Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: String(i) }));
  const chat = vm.runInNewContext(chatCode + '\naiChatSend', {
    state: {}, player: { chatHistory: history }, buildOptsFromUI: () => ({}), aiChatContext: () => ({}),
  });
  assert.deepStrictEqual([...(await chat('Test')).history], history.slice(-8));
  assert.strictEqual(history.length, 100);

  // BUG-216: refreshing chapter markers preserves both A-B edges and the range.
  let children = ['ab-marker', 'ab-range', 'seek-marker'].map(className => ({ className, remove() { children = children.filter(x => x !== this); } }));
  const box = { querySelectorAll: selector => children.filter(x => '.' + x.className === selector), appendChild: el => children.push(el) };
  const markerStart = renderer.indexOf('function renderSeekMarkers(');
  const markerCode = renderer.slice(markerStart, renderer.indexOf('// ---- bölümler', markerStart));
  const draw = vm.runInNewContext(markerCode + '\nrenderSeekMarkers', {
    $: id => id === 'seekMarkers' ? box : { duration: 100 }, document: { createElement: () => ({ style: {} }) },
  });
  draw([50]);
  assert.deepStrictEqual(children.map(x => x.className), ['ab-marker', 'ab-range', 'seek-marker']);
  assert.strictEqual(children[2].style.left, '50%');
  const abStart = renderer.indexOf('function renderAbMarkers()');
  const abCode = renderer.slice(abStart, renderer.indexOf('// ---- ekran görüntüsü', abStart));
  const abBox = { querySelectorAll: () => children.filter(x => x.className.startsWith('ab-')) };
  const clearAb = vm.runInNewContext(abCode + '\nrenderAbMarkers', {
    $: id => id === 'seekMarkers' ? abBox : { duration: NaN }, player: { workspaceMode: 'player', abA: null, abB: null },
  });
  clearAb();
  assert.deepStrictEqual(children.map(x => x.className), ['seek-marker']);
  console.log('Tur 4: picker, GPU exclusion, timeout, live cues, keyboard and modal regressions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
