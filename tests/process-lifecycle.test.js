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
console.log(`process-lifecycle: ${passed} test`);
