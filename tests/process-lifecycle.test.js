'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { terminateProcessTree } = require('../src/process-lifecycle');
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

// Canlı doğrulama: detached grubun torun süreci iptalde yetim kalmaz.
test('CANLI: detached grup-kill python torununu öldürür', () => {
  const { spawnSync, execSync } = require('child_process');
  const proc = require('child_process').spawn('bash', ['-c',
    'sleep 300 & echo $! > /tmp/devin-m29-grandchild.pid; wait'], { detached: true });
  const pid = proc.pid;
  // Torunun başlaması için kısa bekleme
  const started = Date.now();
  while (Date.now() - started < 1500) {
    try { require('fs').readFileSync('/tmp/devin-m29-grandchild.pid'); break; }
    catch (_) { spawnSync('sleep', ['0.05']); }
  }
  terminateProcessTree(proc, { spawn: () => { throw new Error('no taskkill'); }, platform: 'linux' });
  spawnSync('sleep', ['0.2']);
  let grandchildAlive = true;
  try {
    const gp = Number(require('fs').readFileSync('/tmp/devin-m29-grandchild.pid', 'utf8').trim());
    process.kill(gp, 0);
    const comm = require('fs').readFileSync(`/proc/${gp}/comm`, 'utf8').trim();
    grandchildAlive = comm === 'sleep';
  } catch (_) { grandchildAlive = false; }
  try { process.kill(-pid, 0); } catch (_) {}
  assert.equal(grandchildAlive, false, 'torun süreç yetim kalmamalı');
  require('fs').rmSync('/tmp/devin-m29-grandchild.pid', { force: true });
});
console.log(`process-lifecycle: ${passed} test`);

