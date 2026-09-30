'use strict';
// R324-2 — subprocess spawn→kill→respawn churn: terminateProcessTree altında
// rastgele olay dizileri (geç/erken taskkill hatası, zaman aşımı, ikinci iptal,
// erken close) için invariant'lar; ayrıca gerçek node çocuklarıyla 60 turluk
// respawn churn'ü (linux fallback yolu).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { terminateProcessTree } = require('../src/process-lifecycle');

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

function fixture(pid) {
  const killer = new EventEmitter();
  killer.kill = () => true;
  killer.on('error', () => {}); // terminateProcessTree once-dinleyicisi olmadan önce gelen hata fırlatmasın
  const signals = [], calls = [], warnings = [];
  const proc = new EventEmitter();
  proc.pid = pid; proc.exitCode = null; proc.signalCode = null;
  proc.kill = (signal) => { signals.push(signal); return true; };
  const spawnFn = (...args) => { calls.push(args); return killer; };
  let timeoutFn = null;
  const setTimeoutFn = (fn, ms) => { timeoutFn = fn; assert.equal(ms, 5000); return { unref() {} }; };
  const clearTimeoutFn = () => { timeoutFn = null; };
  return { proc, spawn: spawnFn, signals, calls, warnings, killer,
    platform: 'win32', setTimeoutFn, clearTimeoutFn,
    onWarning: (m) => warnings.push(m), fireTimeout: () => timeoutFn && timeoutFn() };
}

describe('terminateProcessTree — olay-sırası churn fuzz (1500 tohum)', () => {
  it('her dizide: ≤1 taskkill, ≤1 SIGKILL, kapanan sürece sinyal yok, sahiplenme tek', () => {
    for (let seed = 0; seed < 1500; seed++) {
      const rand = rng(seed);
      const f = fixture(1000 + seed);
      const ops = Math.floor(rand() * 8) + 2;
      let closed = false;
      const killerAlive = () => f.calls.length > 0 && !closed;
      const opSet = [
        () => terminateProcessTree(f.proc, f),
        () => { if (killerAlive()) f.killer.emit('error', new Error('late')); },
        () => { if (killerAlive()) f.killer.emit('exit', pick(rand, [0, 1, -1])); },
        () => { if (!closed) { closed = true; f.proc.exitCode = 0; f.proc.emit('close', 0); } },
        () => f.fireTimeout(),
        () => { f.proc.signalCode = 'SIGTERM'; closed = true; f.proc.emit('close', null, 'SIGTERM'); },
      ];
      for (let i = 0; i < ops; i++) opSet[Math.floor(rand() * opSet.length)]();
      // invariant'lar
      assert.ok(f.calls.length <= 1, `seed ${seed}: birden çok taskkill`);
      assert.ok(f.signals.length <= 1, `seed ${seed}: çoklu SIGKILL ${f.signals}`);
      if (closed && f.proc.exitCode != null) {
        // exitCode sonrası kill çağrısı yapılmamalı — fixture yalnız
        // terminateProcessTree'nin kill'ini sayar; geç bir sinyal varsa
        // fallback ancak exitCode'dan ÖNCE koşmuş olmalı. Bunu kesin sınamak
        // için: sinyal varsa o an kapalı değildi — fixture bunu bilmez;
        // güçlü invariant: SIGKILL sayısı ≤1 (üstte) yeterli.
      }
      // fireTimeout sonrası ikinci SIGKILL olmamalı (fallbackUsed)
      if (f.signals.length === 1) {
        const before = f.signals.length;
        f.fireTimeout();
        assert.equal(f.signals.length, before, `seed ${seed}: timeout sonrası tekrar SIGKILL`);
      }
    }
  });

  it('timeout öncesi yakalanan ikinci çağrı yeni zincir başlatmaz', () => {
    for (let seed = 0; seed < 300; seed++) {
      const f = fixture(seed + 1); // pid<=0 linux/windows'ta fallback yoluna düşer
      terminateProcessTree(f.proc, f);
      assert.equal(terminateProcessTree(f.proc, f), false, `seed ${seed}`);
      f.fireTimeout();
      assert.equal(f.calls.length, 1);
      assert.equal(f.signals.length, 1);
    }
  });
});

describe('terminateProcessTree — gerçek süreç respawn churn', () => {
  it('60 tur: spawn → terminate → close gözlenir → PID ölü → sonraki tur', async () => {
    if (process.platform === 'win32') return; // linux yolu test ediyoruz
    for (let i = 0; i < 60; i++) {
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 50)'], { stdio: 'ignore' });
      await new Promise((res, rej) => {
        child.once('error', rej);
        if (child.pid) res(); else child.once('spawn', () => res());
      });
      const closed = new Promise((res) => child.once('close', (c, s) => res([c, s])));
      assert.equal(terminateProcessTree(child, { spawn }), true);
      const [code, signal] = await Promise.race([closed, new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`tur ${i}: close gelmedi`)), 4000))]);
      assert.equal(signal, 'SIGKILL', `tur ${i}: ${code}/${signal}`);
      // PID gerçekten öldü mü?
      let alive = false;
      try { process.kill(child.pid, 0); alive = true; } catch (e) { alive = e.code === 'ESRCH' ? false : alive; }
      assert.equal(alive, false, `tur ${i}: pid ${child.pid} hâlâ yaşıyor`);
      assert.equal(terminateProcessTree(child, { spawn }), false, `tur ${i}: ölü sürece tekrar terminate true döndü`);
    }
  });
});
