'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const {
  createIdempotentCancel,
  createJobTerminalGate,
  recoverOutputTransactions,
  terminateProcessTree,
} = require('../src/pipeline-job');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}

class FakeChild extends EventEmitter {
  constructor(pid = 1000) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signals = [];
  }
  kill(signal) { this.signals.push(signal); return true; }
  close(code = 0) { this.exitCode = code; this.emit('close', code); }
}

function firstLine(stream, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('fixture PID zaman aşımı')), timeoutMs);
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timer);
        resolve(buffer.slice(0, newline));
      }
    });
  });
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

async function waitUntilDead(pids, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  while (pids.some(processAlive) && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return pids.every((pid) => !processAlive(pid));
}

function forceKillPid(pid) {
  if (!pid || process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'],
      { windowsHide: true, stdio: 'ignore' });
    killer.once('error', resolve);
    killer.once('close', resolve);
  });
}

function fixturePython() {
  const executable = require('./python-runtime').findTestPython();
  if (!executable) throw new Error('Süreç ağacı testi için çalışan Python bulunamadı.');
  return executable;
}

(async () => {
  await test('marker ile graceful cancel force-kill kullanmadan kapanır', async () => {
    const child = new FakeChild();
    let requested = 0;
    const outcome = await terminateProcessTree(child, {
      platform: 'win32', spawnFn: () => { throw new Error('taskkill çağrılmamalı'); },
      graceMs: 30,
      requestCancel: () => { requested++; queueMicrotask(() => child.close(130)); },
    });
    assert.deepEqual(outcome, { terminated: true, forced: false });
    assert.equal(requested, 1);
    assert.equal(child.listenerCount('close'), 0);
  });

  await test('yanıt vermeyen Windows işi taskkill /T /F ile ve kapanışı beklenerek sonlanır', async () => {
    const child = new FakeChild(4321);
    let call = null;
    const spawnFn = (cmd, args, options) => {
      call = { cmd, args, options };
      const killer = new EventEmitter();
      setTimeout(() => { killer.emit('close', 0); child.close(1); }, 2);
      return killer;
    };
    const outcome = await terminateProcessTree(child, {
      platform: 'win32', spawnFn, graceMs: 1, forceWaitMs: 30,
    });
    assert.equal(outcome.forced, true);
    assert.equal(outcome.terminated, true);
    assert.equal(call.cmd, 'taskkill');
    assert.deepEqual(call.args, ['/pid', '4321', '/T', '/F']);
    assert.equal(child.listenerCount('close'), 0);
  });

  await test('gerçek Python parent+child süreç ağacı yetim bırakılmadan kapanır', async () => {
    if (process.platform !== 'win32') return;
    const fixture = spawn(fixturePython(),
      [path.join(__dirname, 'fixtures', 'pipeline-process-tree.py')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let pids = null;
    try {
      pids = JSON.parse(await firstLine(fixture.stdout));
      assert(processAlive(pids.parent), 'fixture parent başlamadı');
      assert(processAlive(pids.child), 'fixture child başlamadı');
      const started = performance.now();
      const outcome = await terminateProcessTree(fixture, {
        platform: process.platform, spawnFn: spawn, graceMs: 10, forceWaitMs: 2000,
      });
      const latency = performance.now() - started;
      console.log(`    gerçek Python process-tree cancel latency=${latency.toFixed(3)}ms`);
      assert.equal(outcome.terminated, true);
      assert.equal(await waitUntilDead([pids.parent, pids.child]), true, 'süreç ağacı kapanmadı');
    } finally {
      // Test assertion'ı düşse bile yalnızca bu fixture'ın kesin PID'lerini temizle.
      await forceKillPid(pids?.parent || fixture.pid);
      await forceKillPid(pids?.child);
    }
  });

  await test('çift cancel tek termination işlemini paylaşır', async () => {
    let actions = 0;
    const cancel = createIdempotentCancel(async () => { actions++; return { ok: true }; });
    const first = cancel();
    const second = cancel();
    assert.strictEqual(first, second);
    assert.deepEqual(await first, { ok: true });
    assert.equal(actions, 1);
  });

  await test('done/error/close yarışı cleanup ve terminal durumu yalnız bir kez çalıştırır', async () => {
    let cleanup = 0;
    let terminal = 0;
    const gate = createJobTerminalGate(() => { cleanup++; });
    assert.equal(gate.settle(() => { terminal++; }), true);
    assert.equal(gate.settle(() => { terminal++; }), false);
    assert.equal(gate.settle(() => { terminal++; }), false);
    assert.equal(cleanup, 1);
    assert.equal(terminal, 1);
    assert.equal(gate.cleanupCount, 1);
  });

  await test('zorla kesilmiş yazma journalı supervisor tarafından eski çıktıya döner', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-tx-recovery-'));
    try {
      const token = '0123456789abcdef0123456789abcdef';
      const final = path.join(root, 'film.srt');
      const staged = path.join(root, `.whisper-output-transaction-${token}-0.tmp.srt`);
      const backup = path.join(root, `.whisper-output-transaction-${token}-0.bak.srt`);
      const journal = path.join(root, `.whisper-output-transaction-${token}.json`);
      fs.writeFileSync(final, 'OLD', 'utf8');
      fs.copyFileSync(final, backup);
      fs.writeFileSync(staged, 'NEW', 'utf8');
      fs.renameSync(staged, final);
      fs.writeFileSync(journal, JSON.stringify({
        version: 1, owner_pid: 4242, state: 'prepared',
        entries: [{ final, staged, backup, existed: true }],
      }), 'utf8');

      const summary = recoverOutputTransactions(root, { ownerPid: 4242 });
      assert.deepEqual(summary, { recovered: 1, errors: [] });
      assert.equal(fs.readFileSync(final, 'utf8'), 'OLD');
      assert.deepEqual(fs.readdirSync(root), ['film.srt']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await test('100 cancel döngüsünde listener/kaynak artışı yok ve latency ölçülür', async () => {
    const latencies = [];
    for (let index = 0; index < 100; index++) {
      const child = new FakeChild(5000 + index);
      const started = performance.now();
      const outcome = await terminateProcessTree(child, {
        platform: 'win32', graceMs: 20,
        spawnFn: () => { throw new Error('taskkill çağrılmamalı'); },
        requestCancel: () => queueMicrotask(() => child.close(130)),
      });
      latencies.push(performance.now() - started);
      assert.equal(outcome.terminated, true);
      assert.equal(child.listenerCount('close'), 0);
      assert.equal(child.listenerCount('error'), 0);
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[49];
    const p95 = latencies[94];
    const max = latencies[99];
    console.log(`    cancel latency mock n=100 p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms max=${max.toFixed(3)}ms`);
    assert(max < 100, `mock cancel latency beklenmedik ölçüde yüksek: ${max}`);
  });

  await test('üretim bağları job kimliği, temp sahipliği ve transactional yazımı kullanır', async () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
    const backend = fs.readFileSync(path.join(__dirname, '..', 'backend', 'transcribe.py'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'backend', 'pipeline_control.py'), 'utf8');
    assert.match(main, /WHISPER_JOB_TEMP_DIR/);
    assert.match(main, /WHISPER_CANCEL_FILE/);
    assert.match(main, /if \(activeJob === job\) activeJob = null/);
    assert.match(main, /createIdempotentCancel/);
    assert.match(main, /terminateProcessTree/);
    assert.match(main, /recoverOutputTransactions\(pipelineOutputDir, \{ ownerPid: job\.pid \}\)/);
    assert.match(main, /app\.on\('before-quit'/);
    assert.match(renderer, /state\.cancelled \|\| event\.cancelled/);
    assert.match(renderer, /event\.cancelTooLate/);
    assert.match(renderer, /event\.cleanupError/);
    assert.match(backend, /OutputTransaction\(\s*output_dir/);
    assert.match(backend, /output_tx\.commit\(\)/);
    const production = `${backend}\n${control}`;
    for (const stage of ['download', 'extract', 'load_model', 'transcribe', 'llm', 'diarize', 'write']) {
      for (const point of ['before', 'start', 'during', 'after', 'handoff']) {
        assert(production.includes(`("${stage}", "${point}")`), `${stage}:${point} checkpoint yok`);
      }
    }
    assert.equal((renderer.match(/window\.api\.onEvent\(/g) || []).length, 1,
      'renderer terminal listener birden çok kez kuruluyor');
  });

  console.log(`\n${passed} pipeline cancel testi geçti, ${failures.length} başarısız.`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  - ${failure}`));
    process.exitCode = 1;
  }
})();
