// R195 — canlı Whisper CUDA→CPU geri dönüşü: GPU'suz makinede cuda seçimi
// (açık ya da varsayılan/'auto' üzerinden) modeli yükleyemeyip süreci
// sessizce öldürüyordu. Artık ilk yükleme hatasında tek seferlik cpu/int8
// denenir ve kullanıcıya uyarı gönderilir.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');

const main = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  PASS  ${name}`); }

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stdout.setEncoding = () => {};
  proc.stderr = new EventEmitter();
  proc.stderr.setEncoding = () => {};
  proc.stdin = new EventEmitter();
  proc.stdin.writes = [];
  proc.stdin.write = (line) => { proc.stdin.writes.push(line); return true; };
  proc.kill = () => {};
  return proc;
}

function harness(deviceSetting) {
  const start = main.indexOf('function stopBrowserLiveAsr(');
  const end = main.indexOf('function sweepBrowserLiveAsrTemp', start);
  const tail = main.indexOf('function installSystemAudioCaptureHandler', start);
  assert.ok(start > 0 && tail > end && end > start, 'live-asr bloğu bulunamadı');
  const events = [];
  const spawns = [];
  const sandbox = {
    browserLiveAsr: null,
    activeJob: null, burninJob: null, burninStartPending: null,
    modelBenchmarkJob: null, modelProcesses: new Set(),
    browserDiagnostics: null,
    browserActiveTabId: 7,
    loadSettings: () => ({ ui: { device: deviceSetting } }),
    KNOWN_MODELS: ['small', 'tiny'],
    spawn: (...args) => { const p = fakeProc(); spawns.push({ args, proc: p }); return p; },
    resolvePython: () => 'python',
    app: { getAppPath: () => '/app', getPath: () => '/tmp' },
    path, fs, EventEmitter,
    randomUUID: () => 'uuid-1',
    browserEventContext: () => ({ tabId: 1 }),
    browserStateGeneration: 1,
    isCurrentBrowserContext: () => true,
    storeBrowserTrack: () => {},
    sendBrowserEvent: (_tab, payload) => events.push(payload),
    publishBrowserDiagnostics: () => {},
    terminateProcessTree: () => {},
    createNdjsonLineBuffer: ({ onOverflow } = {}) => {
      let buffer = '';
      return {
        push(chunk) {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (Buffer.byteLength(line) > 8 * 1024 * 1024) { onOverflow?.(); continue; }
          }
          return lines;
        },
        flush() { const rest = buffer ? [buffer] : []; buffer = ''; return rest; },
      };
    },
    setTimeout: (fn) => ({ unref() {} }),
    JSON, Object, Number, String, Math, Promise,
    dt: (tr, en) => en,
  };
  const region = main.slice(start, tail);
  vm.runInNewContext(region, sandbox);
  return { sandbox, events, spawns };
}

function tab() {
  return {
    id: 7,
    acquisitionPlan: {
      updateConsent() {}, start() {}, stage() { return null; },
      finish() {}, snapshot() { return {}; },
    },
    acquisitionId: 'acq',
  };
}

(async () => {
  await test('CUDA yükleme hatası CPU/int8 ile tek seferlik yeniden dener', async () => {
    const { sandbox, events, spawns } = harness('cuda');
    const res = sandbox.startBrowserLiveAsr(tab(), {});
    assert.equal(res.ok, true);
    assert.equal(spawns.length, 1);
    const first = spawns[0];
    // vm sınırı prototipleri farklılaştırır — elemanları karşılaştır.
    assert.equal(first.args[1].filter((x) => ['cuda', 'cpu', 'int8', 'float16'].includes(x)).join(','), 'cuda,float16');
    // Model yüklenemedi → error olayı → close; CPU'ya düşmeli.
    first.proc.stdout.emit('data', '{"type":"error","message":"libcublas not found"}\n');
    first.proc.emit('close');
    assert.equal(spawns.length, 2, 'CPU yeniden denemesi başlamadı');
    const second = spawns[1];
    const argv = second.args[1];
    assert.equal(argv[argv.indexOf('--device') + 1], 'cpu');
    assert.equal(argv[argv.indexOf('--compute-type') + 1], 'int8');
    assert.ok(events.some((e) => e.type === 'live-asr-warning' && /CPU/i.test(e.message)));
    // İkinci süreç ready verebilir ve job canlı kalır.
    second.proc.stdout.emit('data', '{"type":"ready","model":"small"}\n');
    assert.ok(events.some((e) => e.type === 'live-asr-state' && e.ready === true));
    assert.ok(sandbox.browserLiveAsr, 'job hâlâ kayıtlı olmalı');
  });

  await test('Sessiz ölüm (error olayı yok) da CPU geri dönüşünü tetikler', async () => {
    // 'auto' seçimi cuda olarak çözülür; GPU'suz makinede süreç NDJSON
    // hatası basamadan doğrudan ölür — 'close' yolu da geri dönmeli.
    const h = harness('auto');
    const r = h.sandbox.startBrowserLiveAsr(tab(), {});
    assert.equal(r.ok, true);
    h.spawns[0].proc.emit('close');
    assert.equal(h.spawns.length, 2);
    assert.equal(h.spawns[1].args[1][h.spawns[1].args[1].indexOf('--device') + 1], 'cpu');
  });

  await test('CPU seçiminde geri dönüş yok — gerçek hata raporlanır', async () => {
    const h = harness('cpu');
    const r = h.sandbox.startBrowserLiveAsr(tab(), {});
    assert.equal(r.ok, true);
    h.spawns[0].proc.stderr.emit('data', 'Traceback: disk full\n');
    h.spawns[0].proc.emit('close');
    assert.equal(h.spawns.length, 1, 'CPU işinde yeniden deneme olmamalı');
    assert.ok(h.events.some((e) => e.type === 'live-asr-state' && e.active === false));
  });

  await test('R196: CPU geri dönüşünde kuyruktaki ses parçaları korunur', async () => {
    // CUDA yüklemesi sürerken beslenen chunk'lar close'da siliniyordu; artık
    // pendingChunks saklanır ve yeni sürecin stdin'ine yeniden beslenir.
    const h = harness('cuda');
    h.sandbox.startBrowserLiveAsr(tab(), {});
    const job = h.sandbox.browserLiveAsr;
    const first = h.spawns[0];
    job.chunkFiles.add('/tmp/c1.wav');
    job.chunkFiles.add('/tmp/c2.wav');
    job.pendingChunks.set('/tmp/c1.wav', { offset: 0, rate: 16000 });
    job.pendingChunks.set('/tmp/c2.wav', { offset: 4, rate: 16000 });
    first.proc.emit('close');
    assert.equal(h.spawns.length, 2);
    const second = h.spawns[1];
    assert.equal(second.proc.stdin.writes.length, 2, 'bekleyen parçalar yeniden beslenmedi');
    assert.ok(second.proc.stdin.writes.some((l) => l.includes('/tmp/c1.wav') && l.includes('"offset":0')));
    // İşlenen parça (chunk_done) pending'den düşer — tekrar beslenmez.
    second.proc.stdout.emit('data', '{"type":"chunk_done","path":"/tmp/c1.wav"}\n');
    assert.equal(job.pendingChunks.size, 1);
  });

  await test('Hazır olduktan sonraki ölüm geri dönüş yapmaz', async () => {
    const h = harness('cuda');
    h.sandbox.startBrowserLiveAsr(tab(), {});
    const first = h.spawns[0];
    first.proc.stdout.emit('data', '{"type":"ready","model":"small"}\n');
    first.proc.emit('close');
    assert.equal(h.spawns.length, 1, 'ready sonrası ölümde yeniden deneme olmamalı');
    assert.ok(h.events.some((e) => e.type === 'live-asr-state' && e.active === false));
  });

  console.log(`live-asr-fallback: ${passed} kontrol geçti`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
