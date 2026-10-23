'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { terminateProcessTree, terminateProcessTreeAndWait } = require('../src/process-lifecycle');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }
function fixture(pid = 42) {
  const killer = new EventEmitter();
  const signals = [], calls = [];
  const proc = { pid, exitCode: null, signalCode: null, kill: (signal) => { signals.push(signal); return true; } };
  const spawn = (...args) => { calls.push(args); return killer; };
  return { proc, spawn, signals, calls, killer, platform: 'win32' };
}
test('taskkill asenkron error + exit yalnız bir yedek iptal yapar', () => {
  const f = fixture(); terminateProcessTree(f.proc, f);
  f.killer.emit('error', new Error('ENOENT')); f.killer.emit('exit', -1);
  assert.deepEqual(f.signals, ['SIGKILL']);
  assert.deepEqual(f.calls[0][1], ['/pid', '42', '/T', '/F']);
  assert.equal(f.proc.pid, 42);
});
test('başarılı taskkill ve kapanmış çocuk tekrar öldürülmez', () => {
  const f = fixture(); terminateProcessTree(f.proc, f); f.killer.emit('exit', 0);
  assert.deepEqual(f.signals, []);
  f.proc.exitCode = 0;
  assert.equal(terminateProcessTree(f.proc, f), false);
});
test('hatalı çıkış, eksik PID ve senkron spawn hatası güvenli yakalanır', () => {
  const f = fixture(); terminateProcessTree(f.proc, f); f.killer.emit('exit', 1);
  assert.deepEqual(f.signals, ['SIGKILL']);
  const noPid = fixture(undefined); noPid.proc.pid = undefined;
  terminateProcessTree(noPid.proc, noPid);
  assert.equal(noPid.calls.length, 0); assert.equal(noPid.signals.length, 1);
  const thrown = fixture(); thrown.spawn = () => { throw Error('spawn'); };
  terminateProcessTree(thrown.proc, thrown); assert.equal(thrown.signals.length, 1);
});
test('geç gelen taskkill hatası artık kapanmış çocuğa sinyal göndermez', () => {
  const f = fixture(); terminateProcessTree(f.proc, f);
  f.proc.exitCode = 1; f.killer.emit('error', Error('late'));
  assert.equal(f.signals.length, 0);
});
test('yanıt vermeyen taskkill zaman aşımında bir kez yedek iptal yapar', () => {
  const f = fixture(); let timeout, cleared = 0;
  f.setTimeoutFn = (fn, ms) => { assert.equal(ms, 5000); timeout = fn; return 1; };
  f.clearTimeoutFn = () => { cleared++; };
  terminateProcessTree(f.proc, f);
  timeout();
  f.killer.emit('error', Error('late'));
  assert.deepEqual(f.signals, ['SIGKILL']);
  assert(cleared > 0);
  assert.equal(f.proc.exitCode, null, 'çocuk kapanmadan işi bitmiş sayma');
});
test('aynı canlı süreç için art arda iptal yalnız bir sonlandırma zinciri başlatır', () => {
  const f = fixture();
  assert.equal(terminateProcessTree(f.proc, f), true);
  assert.equal(terminateProcessTree(f.proc, f), false);
  assert.equal(f.calls.length, 1);
  f.killer.emit('error', Error('fallback'));
  assert.deepEqual(f.signals, ['SIGKILL']);
});

// Madde 29 — POSIX süreç ağacı: detached çocuklar için kill(-pid) torunları da öldürür.
test('POSIX: grup-kill (-pid) önce denenir, başarılıysa tek kill atlanır', () => {
  const groupCalls = [];
  const f = fixture(777); f.platform = 'linux';
  f.killFn = (pid, sig) => { groupCalls.push([pid, sig]); return true; };
  terminateProcessTree(f.proc, f);
  assert.deepEqual(groupCalls, [[-777, 'SIGKILL']]);
  assert.deepEqual(f.signals, [], 'grup kill yeterliyse tek-proc kill çağrılmamalı');
});
test('POSIX: grup-kill ESRCH verirse tek-proc SIGKILL yedeğine düşer', () => {
  const f = fixture(888); f.platform = 'linux';
  f.killFn = () => { throw Object.assign(new Error('no group'), { code: 'ESRCH' }); };
  terminateProcessTree(f.proc, f);
  assert.deepEqual(f.signals, ['SIGKILL']);
});
test('POSIX: pid yoksa grup-kill atlanır', () => {
  const f = fixture(0); f.platform = 'darwin';
  let called = 0;
  f.killFn = () => { called++; return true; };
  terminateProcessTree(f.proc, f);
  assert.equal(called, 0);
  assert.deepEqual(f.signals, ['SIGKILL']);
});

// Real parent/grandchild probe uses the host platform, including taskkill on Windows.
async function realTreeTest() {
  const { spawn } = require('child_process');
  const parentScript = `
    const child = require('child_process').spawn(process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    child.once('spawn', () => console.log(child.pid));
    child.once('error', error => { throw error; });
    setInterval(() => {}, 1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentScript], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  let grandchild;
  const closed = new Promise(resolve => parent.once('close', resolve));
  const bounded = async promise => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Process-tree fixture timed out')), 10000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const alive = pid => {
    try {
      process.kill(pid, 0);
      // A killed Linux orphan can briefly remain as an inert zombie until reaped.
      if (process.platform === 'linux'
          && /\)\s+Z\b/.test(require('fs').readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false;
      return true;
    } catch (error) {
      if (['ESRCH', 'ENOENT'].includes(error.code)) return false;
      throw error;
    }
  };
  try {
    await bounded(new Promise((resolve, reject) => {
      let output = '';
      parent.once('error', reject);
      parent.stdout.on('data', chunk => {
        output += chunk.toString();
        if (!output.includes('\n')) return;
        grandchild = Number(output.trim());
        if (!Number.isSafeInteger(grandchild) || grandchild <= 0) reject(new Error('Invalid fixture PID'));
        else resolve();
      });
    }));
    assert.equal(alive(grandchild), true, 'grandchild must exist before cancellation');
    assert.equal(await bounded(terminateProcessTreeAndWait(parent, { spawn })), true);
    await bounded(closed);
    const deadline = Date.now() + 3000;
    while (alive(grandchild) && Date.now() < deadline) await new Promise(setImmediate);
    assert.equal(alive(grandchild), false, 'grandchild must not survive cancellation');
    passed++;
    console.log('  PASS  real host-platform parent/grandchild cancellation');
  } finally {
    terminateProcessTree(parent, { spawn });
    if (parent.exitCode == null && parent.signalCode == null) parent.kill('SIGKILL');
    if (grandchild && alive(grandchild)) {
      try { process.kill(grandchild, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await bounded(closed);
  }
}
realTreeTest().then(() => console.log(`process-lifecycle: ${passed} test`))
  .catch(error => { console.error(error); process.exitCode = 1; });
