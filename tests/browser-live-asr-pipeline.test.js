'use strict';
// 2026-10 browser canlı Whisper derin denetimi — regresyon testleri.
//
// 1) AudioWorklet kırıntı/sessiz parça göndermez (halüsinasyon + boşa GPU).
// 2) Reklam oynarken yakalama duraklatılmış sayılır (reklam konuşması asıl
//    videonun ilk saniyelerine yazılmaz).
// 3) RTF izleyicisi art arda yavaşlıkta TEK uyarı, düzelince TEK bildirim verir.
// 4) live_asr spawn'ı UTF-8 stdin ortamıyla başlar (Türkçe %TEMP% yolu).
// 5) Mini oynatıcı: eski pencerenin GEÇ gelen 'close' olayı eski sekmenin
//    görünümünü yine ana pencereye geri bağlar.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}\n    ${error.stack || error.message}`); process.exitCode = 1; }
}

// ---- Worklet'i sahte AudioWorkletGlobalScope'ta yükle.
function loadWorklet() {
  const posted = [];
  let Processor = null;
  const sandbox = {
    sampleRate: 16000, currentTime: 0,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (m) => posted.push(m), onmessage: null }; } },
    registerProcessor: (_name, cls) => { Processor = cls; },
    Int16Array, Math, Number,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'live-asr-worklet.js'), 'utf8'), sandbox);
  const node = new Processor();
  return { node, posted, sandbox, send: (data) => node.port.onmessage({ data }) };
}

function feed(worklet, seconds, amplitude, frequency = 220) {
  const block = 128;
  const total = Math.round(seconds * 16000);
  for (let done = 0; done < total; done += block) {
    const channel = new Float32Array(block);
    for (let i = 0; i < block; i++) channel[i] = amplitude * Math.sin(2 * Math.PI * frequency * (done + i) / 16000);
    worklet.node.process([[channel]]);
    worklet.sandbox.currentTime += block / 16000;
  }
}

test('worklet: 0,25 sn altı kırıntı Whisper\'a gönderilmez (duraklatma/atlama flush\'ı)', () => {
  const w = loadWorklet();
  w.send({ type: 'sync', time: 10, contextTime: 0, paused: false, rate: 1 });
  feed(w, 0.12, 0.3);
  w.send({ type: 'sync', time: 10.12, contextTime: w.sandbox.currentTime, paused: true, rate: 1 });
  assert.strictEqual(w.posted.filter((m) => m.type === 'chunk').length, 0, 'kırıntı chunk olarak gitti');
  assert.ok(w.posted.some((m) => m.type === 'dropped' && m.reason === 'short'));
});

test('worklet: tamamen sessiz parça gönderilmez, "silent" bildirilir', () => {
  const w = loadWorklet();
  w.send({ type: 'sync', time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(w, 4.5, 0);
  assert.strictEqual(w.posted.filter((m) => m.type === 'chunk').length, 0);
  assert.ok(w.posted.some((m) => m.type === 'silent'), 'sessizlik bildirilmedi');
});

test('worklet: gerçek ses 16 kHz PCM16 chunk olarak doğru ofsetle gider', () => {
  const w = loadWorklet();
  w.send({ type: 'sync', time: 42, contextTime: 0, paused: false, rate: 1 });
  feed(w, 1.0, 0.3);
  w.send({ type: 'flush' });
  const chunks = w.posted.filter((m) => m.type === 'chunk');
  assert.strictEqual(chunks.length, 1);
  assert.ok(Math.abs(chunks[0].offset - 42) < 0.01, `ofset ${chunks[0].offset}`);
  assert.strictEqual(new Int16Array(chunks[0].pcm).length, 16000);
});

test('reklam: saat senkronu reklam süresince paused=true gönderir', () => {
  const helpers = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer-helpers.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = helpers.indexOf('function syncBrowserLiveAsrClock()');
  assert(start >= 0, 'syncBrowserLiveAsrClock function must exist');
  const body = helpers.slice(start, helpers.indexOf('\n}\n', start) + 2);
  const messages = [];
  const sandbox = {
    player: { browserTime: 5, browserPaused: false, browserAdPlaying: true, browserRate: 1,
      browserLiveAsrCapture: { stopping: false, context: { currentTime: 1 },
        node: { port: { postMessage: (m) => messages.push(m) } } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${body}; syncBrowserLiveAsrClock();`, sandbox);
  assert.strictEqual(messages[0].paused, true, 'reklam sırasında yakalama sürüyor');
  sandbox.player.browserAdPlaying = false;
  vm.runInContext('syncBrowserLiveAsrClock();', sandbox);
  assert.strictEqual(messages[1].paused, false);
});

test('RTF izleyicisi: tek yavaş parça susar, art arda 3 yavaş parça tek uyarı, düzelince tek bildirim', () => {
  const { createLiveAsrRealtimeMonitor } = require('../src/live-asr-realtime');
  const monitor = createLiveAsrRealtimeMonitor({ model: 'large-v3' });
  assert.strictEqual(monitor.observe({ rtf: 1.6, audio_seconds: 5 }), null);
  assert.strictEqual(monitor.observe({ rtf: 0.5, audio_seconds: 5 }), null);
  assert.strictEqual(monitor.observe({ rtf: 1.3, audio_seconds: 5 }), null);
  assert.strictEqual(monitor.observe({ rtf: 1.4, audio_seconds: 5 }), null);
  const warn = monitor.observe({ rtf: 1.5, audio_seconds: 5 });
  assert.ok(warn && warn.level === 'warn' && /large-v3-turbo/.test(warn.message), JSON.stringify(warn));
  assert.strictEqual(monitor.observe({ rtf: 1.7, audio_seconds: 5 }), null, 'uyarı tekrarlandı');
  // Kısa parça karar dışı.
  assert.strictEqual(monitor.observe({ rtf: 0.1, audio_seconds: 0.4 }), null);
  const recovered = monitor.observe({ rtf: 0.6, audio_seconds: 5 });
  assert.ok(recovered && recovered.level === 'info');
});

test('RTF izleyicisi: halüsinasyon atlamaları ilk kez ve sonra seyrek özetlenir', () => {
  const { createLiveAsrRealtimeMonitor } = require('../src/live-asr-realtime');
  const monitor = createLiveAsrRealtimeMonitor({ model: 'small' });
  const first = monitor.observe({ rtf: 0.2, audio_seconds: 5, skipped: 1 });
  assert.ok(first && /Altyazı M\.K\./.test(first.message));
  let notices = 0;
  for (let i = 0; i < 8; i++) if (monitor.observe({ rtf: 0.2, audio_seconds: 5, skipped: 1 })) notices += 1;
  assert.strictEqual(notices, 0, 'her parçada günlük basılıyor');
  assert.ok(monitor.observe({ rtf: 0.2, audio_seconds: 5, skipped: 1 }), '10. parçada özet bekleniyordu');
});

test('live_asr spawn: UTF-8 stdin ortamı ve gizli anahtarsız env', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const start = main.indexOf("const proc = spawn(resolvePython(), [script, '--model', model, '--device', nextDevice,");
  assert.ok(start > 0);
  const call = main.slice(start, start + 900);
  assert.match(call, /env: pythonRuntimeEnv\(\{ PYTHONIOENCODING: 'utf-8'/);
  const py = fs.readFileSync(path.join(ROOT, 'backend', 'live_asr.py'), 'utf8');
  assert.match(py, /sys\.stdin\.reconfigure\(encoding="utf-8"/);
});

test('mini oynatıcı: eski pencerenin geç close olayı eski sekmeyi ana pencereye iade eder', () => {
  const { createBrowserMiniPlayer } = require('../src/browser-mini-player');
  const handlers = {};
  const mainChildren = new Set();
  const mainWindow = { isDestroyed: () => false,
    contentView: { addChildView: (v) => mainChildren.add(v), removeChildView: (v) => mainChildren.delete(v) } };
  const windows = [];
  class FakeWindow {
    constructor() {
      this.children = new Set(); this.listeners = {}; this.destroyed = false;
      this.contentView = { addChildView: (v) => this.children.add(v), removeChildView: (v) => this.children.delete(v) };
      this.webContents = { setWindowOpenHandler() {}, on() {}, mainFrame: {} };
      windows.push(this);
    }
    on(type, fn) { this.listeners[type] = fn; }
    // Electron'daki gibi: close() olayı hemen yaymaz.
    close() { this.closeRequested = true; }
    fireClose() { this.listeners.close?.(); this.destroyed = true; }
    isDestroyed() { return this.destroyed; }
    getContentSize() { return [720, 480]; }
    loadFile() {} focus() {} destroy() { this.destroyed = true; }
  }
  const view = (name) => ({ name, setBounds() {}, setVisible() {}, webContents: { isDestroyed: () => false } });
  let restores = 0;
  const mini = createBrowserMiniPlayer({
    BrowserWindow: FakeWindow, ipcMain: { handle: (n, f) => { handlers[n] = f; } },
    owner: () => mainWindow, restore: () => { restores += 1; }, command: () => ({ ok: true }),
    hideOffscreen: () => {},
  });
  const tabA = { id: 'A', view: view('A') };
  const tabB = { id: 'B', view: view('B') };
  mainChildren.add(tabA.view); mainChildren.add(tabB.view);
  assert.deepStrictEqual(mini.open(tabA), { ok: true });
  assert.ok(!mainChildren.has(tabA.view) && windows[0].children.has(tabA.view));
  assert.deepStrictEqual(mini.open(tabB), { ok: true });
  assert.ok(windows[0].closeRequested, 'eski mini pencere kapatılmadı');
  windows[0].fireClose(); // geç gelen olay — artık güncel pencere windows[1]
  assert.ok(mainChildren.has(tabA.view), 'A sekmesinin görünümü ana pencereye iade edilmedi (boş sekme)');
  assert.ok(!windows[0].children.has(tabA.view));
  assert.ok(restores >= 1);
  assert.ok(mini.owns(tabB), 'yeni mini pencerenin sahipliği bozuldu');
  windows[1].fireClose();
  assert.ok(mainChildren.has(tabB.view));
  assert.strictEqual(mini.owns(tabB), false);
});

console.log(`browser-live-asr-pipeline: ${passed} test geçti`);
