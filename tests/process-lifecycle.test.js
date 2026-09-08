'use strict';

const assert = require('assert');
const { EventEmitter, once } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  createProcessJobController,
  normalizeJobId,
  terminateProcessTree,
} = require('../src/process-lifecycle');

let passed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name} — ${error.message}`);
    throw error;
  }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function waitForJsonLine(stream, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Fixture hazır olma zaman aşımı.')), timeoutMs);
    stream.setEncoding('utf-8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(buffer.slice(0, nl))); } catch (error) { reject(error); }
    });
  });
}

const STAGE_WORKER = String.raw`
  const { spawn } = require('child_process');
  const phase = process.argv[1];
  let child = null;
  if (phase === 'download') {
    child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  }
  process.stdout.write(JSON.stringify({ phase, childPid: child && child.pid }) + '\n');
  process.stdin.resume();
  process.stdin.on('data', () => {
    if (child) { try { child.kill(); } catch (_) {} }
    process.exit(0);
  });
  if (phase === 'write') {
    let writes = 0;
    setInterval(() => { writes++; }, 5);
  } else {
    setInterval(() => {}, 1000);
  }
`;

async function cleanupFixture(worker) {
  if (!worker || !isAlive(worker.pid)) return;
  try { worker.stdin.write('stop\n'); } catch (_) {}
  await Promise.race([once(worker, 'close'), new Promise((resolve) => setTimeout(resolve, 500))]);
  if (isAlive(worker.pid)) {
    try { worker.kill(); } catch (_) {}
  }
}

async function runRealStage(controller, phase) {
  const worker = spawn(process.execPath, ['-e', STAGE_WORKER, phase], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const ready = await waitForJsonLine(worker.stdout);
  assert.equal(ready.phase, phase);
  assert.equal(isAlive(worker.pid), true, `${phase} ebeveyni başlamadı`);
  if (ready.childPid) assert.equal(isAlive(ready.childPid), true, `${phase} çocuğu başlamadı`);

  const job = controller.begin(worker, `phase-${phase}`);
  assert.equal(controller.tag(job, { type: 'status' }).jobId, `phase-${phase}`);
  const result = await terminateProcessTree(worker, { timeoutMs: 3000 });

  if (!result.ok && /Access denied|EACCES/i.test(result.error || '')) {
    await cleanupFixture(worker);
    skipped++;
    console.log(`  SKIP  ${phase}: sandbox taskkill izni yok`);
    controller.release(job);
    return;
  }

  try {
    assert.equal(result.ok, true, result.error || 'süreç ağacı kapatılamadı');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(isAlive(worker.pid), false, `${phase} ebeveyni yetim kaldı`);
    if (ready.childPid) assert.equal(isAlive(ready.childPid), false, `${phase} alt süreci yetim kaldı`);
  } finally {
    controller.release(job);
    await cleanupFixture(worker);
  }
}

async function main() {
  await test('iş kimliği geçerli istemci kimliğini korur, geçersizi yeniler', async () => {
    assert.equal(normalizeJobId('renderer-1', () => 'fallback'), 'renderer-1');
    assert.equal(normalizeJobId('boşluk yasak', () => 'fallback'), 'fallback');
  });

  await test('start→cancel→start sonrası eski olay/release yeni işe karışmaz', async () => {
    const controller = createProcessJobController({ idFactory: () => 'generated' });
    const oldJob = controller.begin({ pid: 1 }, 'old');
    assert.deepEqual(controller.tag(oldJob, { type: 'progress' }), { type: 'progress', jobId: 'old' });
    assert.equal(controller.release(oldJob), true);
    const newJob = controller.begin({ pid: 2 }, 'new');
    assert.equal(controller.tag(oldJob, { type: 'exit' }), null);
    assert.equal(controller.release(oldJob), false);
    assert.equal(controller.current, newJob);
  });

  await test('Windows sonlandırması yalnız hedef PID ağacını /T /F ile kapatır ve close bekler', async () => {
    const target = new EventEmitter();
    target.pid = 4242;
    target.exitCode = null;
    target.signalCode = null;
    const calls = [];
    const spawnImpl = (command, args) => {
      calls.push({ command, args });
      const killer = new EventEmitter();
      killer.stderr = new EventEmitter();
      setTimeout(() => killer.emit('close', 0, null), 5);
      setTimeout(() => {
        target.exitCode = 1;
        target.emit('close', 1, null);
      }, 15);
      return killer;
    };
    const result = await terminateProcessTree(target, { platform: 'win32', spawnImpl, timeoutMs: 200 });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [{ command: 'taskkill', args: ['/pid', '4242', '/T', '/F'] }]);
  });

  await test('main ve renderer aynı jobId sözleşmesini uygular', async () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
    const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf-8');
    assert.match(mainSource, /transcribeJobs\.tag\(job, payload\)/);
    assert.match(mainSource, /sendEvent\(\{ \.\.\.exitEvent, jobId: job\.id \}\)/);
    assert.match(mainSource, /process_supervisor\.py/);
    assert.match(rendererSource, /event\.jobId !== state\.activeJobId/);
    assert.match(rendererSource, /startTranscribe\(\{ \.\.\.opts, jobId: requestedJobId \}\)/);
  });

  await test('iptal sonrası eşleşen exit UIyi hazırlar ve iş sahipliğini bırakır', async () => {
    const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf-8');
    const cancelExitStart = rendererSource.indexOf("case 'exit':");
    const cancelExitEnd = rendererSource.indexOf('if (state.queueRunning', cancelExitStart);
    const cancelExitBody = rendererSource.slice(cancelExitStart, cancelExitEnd);
    assert.match(cancelExitBody, /if \(state\.cancelled\)/);
    assert.match(cancelExitBody, /state\.running = false/);
    assert.match(cancelExitBody, /startBtn'\)\.classList\.remove\('hidden'\)/);
    assert.match(cancelExitBody, /cancelBtn'\)\.classList\.add\('hidden'\)/);
    assert.match(rendererSource, /event\.type === 'exit' && event\.jobId === state\.activeJobId/);
    assert.match(rendererSource, /state\.activeJobId = null/);
  });

  await test('Electron quit hedefli süreç ağacı temizliğini bekler', async () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
    const start = mainSource.indexOf("app.on('window-all-closed'");
    const end = mainSource.indexOf("app.on('activate'", start);
    const body = mainSource.slice(start, end);
    assert.match(body, /terminateApplicationJobs\(\)\.finally/);
    assert.doesNotMatch(body, /spawn\('taskkill'/);
  });

  if (process.platform === 'win32') {
    const controller = createProcessJobController();
    for (const phase of ['download', 'model_load', 'write']) {
      await test(`${phase} sırasında iptal süreç ağacını yetim bırakmaz`, () => runRealStage(controller, phase));
    }

    if (process.env.WHISPER_RUN_WINDOWS_LIFECYCLE === '1') {
      await test('Python crash sonrası Job Object alt süreci yetim bırakmaz', async () => {
        const python = process.env.WHISPER_TEST_PYTHON || 'python';
        const supervisor = path.join(__dirname, '..', 'backend', 'process_supervisor.py');
        const script = [
          'import os, subprocess, time',
          'child = subprocess.Popen(["ping", "-t", "127.0.0.1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)',
          'print("{\\\"childPid\\\":%d}" % child.pid, flush=True)',
          'time.sleep(0.1)',
          'os._exit(7)',
        ].join('; ');
        const worker = spawn(python, [supervisor, '--', '-c', script], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const ready = await waitForJsonLine(worker.stdout);
        const childPid = Number(ready.childPid);
        const [exitCode] = await once(worker, 'close');
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(exitCode, 7, 'gözetmen backend çıkış kodunu korumadı');
        try {
          assert.equal(isAlive(childPid), false, `Python çocuğu ${childPid} yetim kaldı`);
        } finally {
          if (isAlive(childPid)) {
            const killer = spawn('taskkill', ['/pid', String(childPid), '/F'], { windowsHide: true });
            await once(killer, 'close');
          }
        }
      });
    }
  }

  console.log(`\n${passed} yaşam döngüsü testi geçti${skipped ? ` · ${skipped} gerçek Windows ölçümü izin nedeniyle atlandı` : ''}.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
