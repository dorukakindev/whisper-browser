'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const {
  BrowserRecoveryGovernor,
  bindWebContentsLifecycle,
  isGpuProcessFailure,
  isRecoverableRenderGone,
} = require('../src/browser-recovery');

class FakeClock {
  constructor() { this.time = 0; this.nextId = 1; this.tasks = new Map(); }
  now = () => this.time;
  setTimer = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = (id) => { this.tasks.delete(id); };
  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  assert.equal(isRecoverableRenderGone({ reason: 'crashed' }), true);
  assert.equal(isRecoverableRenderGone({ reason: 'oom' }), true);
  assert.equal(isRecoverableRenderGone({ reason: 'clean-exit' }), false);
  assert.equal(isGpuProcessFailure({ type: 'GPU', reason: 'crashed' }), true);
  assert.equal(isGpuProcessFailure({ type: 'Utility', reason: 'crashed' }), false);
  assert.equal(isGpuProcessFailure({ type: 'GPU', reason: 'normal-exit' }), false);

  const wc = new EventEmitter();
  let crashes = 0;
  const cleanup = bindWebContentsLifecycle(wc, { renderProcessGone: () => { crashes++; } });
  const duplicateCleanup = bindWebContentsLifecycle(wc, { renderProcessGone: () => { crashes += 10; } });
  assert.strictEqual(cleanup, duplicateCleanup);
  assert.equal(wc.listenerCount('render-process-gone'), 1);
  assert.equal(wc.listenerCount('unresponsive'), 1);
  assert.equal(wc.listenerCount('responsive'), 1);
  wc.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(crashes, 1);
  cleanup();
  assert.equal(wc.listenerCount('render-process-gone'), 0);
  assert.equal(wc.listenerCount('unresponsive'), 0);
  assert.equal(wc.listenerCount('responsive'), 0);

  const clock = new FakeClock();
  const statuses = [];
  let recoveries = 0;
  const governor = new BrowserRecoveryGovernor({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    recoverDelayMs: 10, unresponsiveDelayMs: 100, duplicateWindowMs: 20,
    maxRecoveries: 2, windowMs: 1000,
    canRecover: () => true,
    onStatus: (status) => statuses.push(status),
    onRecover: async () => { recoveries++; return true; },
  });

  assert.equal(governor.handleUnresponsive(), true);
  assert.equal(governor.snapshot().pendingTimers, 1);
  assert.equal(governor.handleUnresponsive(), false);
  assert.equal(governor.handleResponsive(), true);
  assert.equal(governor.snapshot().pendingTimers, 0);
  clock.advance(200);
  assert.equal(recoveries, 0);
  assert.deepEqual(statuses.slice(0, 2).map((item) => item.phase), ['unresponsive', 'responsive']);

  assert.equal(governor.handleUnresponsive(), true);
  clock.advance(100);
  assert.equal(governor.snapshot().pendingTimers, 1);
  assert.equal(governor.handleResponsive(), true,
    'responsive olayı gecikmeli yeniden kurulum başlamadan önce onu iptal etmeli');
  assert.equal(governor.snapshot().pendingTimers, 0);
  assert.equal(governor.snapshot().recoveryCount, 0);
  clock.advance(10);
  await flushPromises();
  assert.equal(recoveries, 0);

  assert.equal(governor.handleUnresponsive(), true);
  clock.advance(110);
  clock.advance(10);
  await flushPromises();
  assert.equal(recoveries, 1);
  assert.equal(governor.snapshot().pendingTimers, 0);
  assert.equal(governor.snapshot().recovering, false);
  assert(statuses.some((item) => item.phase === 'recovered' && /yakalama durumu/.test(item.message)));

  clock.advance(25);
  assert.equal(governor.handleRenderProcessGone({ reason: 'crashed' }), true);
  assert.equal(governor.handleGpuProcessGone({ type: 'GPU', reason: 'crashed' }), false,
    'aynı olayın renderer ve GPU bildirimleri çift toparlanma başlatmamalı');
  clock.advance(10);
  await flushPromises();
  assert.equal(recoveries, 2);

  clock.advance(25);
  assert.equal(governor.handleRenderProcessGone({ reason: 'oom' }), false);
  assert.equal(recoveries, 2);
  assert.equal(statuses.at(-1).phase, 'terminal');
  assert.match(statuses.at(-1).message, /otomatik yeniden açma durduruldu/);

  governor.reset();
  assert.equal(governor.snapshot().recoveryCount, 0);
  assert.equal(governor.handleUnresponsive(), true);
  assert.equal(governor.handleGpuProcessGone({ type: 'GPU', reason: 'crashed' }), true);
  assert.equal(governor.snapshot().pendingTimers, 1,
    'GPU çökmesi bekleyen hang zamanlayıcısını temizlemeli');
  clock.advance(10);
  await flushPromises();
  assert.equal(recoveries, 3);
  clock.advance(100);
  assert.equal(recoveries, 3, 'temizlenmiş hang zamanlayıcısı ikinci toparlanma başlattı');

  governor.reset();
  assert.equal(governor.handleGpuProcessGone({ type: 'GPU', reason: 'crashed' }), true);
  clock.advance(10);
  await flushPromises();
  assert.equal(recoveries, 4);

  governor.handleUnresponsive();
  assert.equal(clock.tasks.size, 1);
  governor.dispose();
  assert.equal(clock.tasks.size, 0, 'dispose sonrasında zamanlayıcı sızıntısı var');
  assert.deepEqual(governor.snapshot(), { disposed: true, recovering: false, recoveryCount: 0, pendingTimers: 0 });

  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(mainSource, /app\.on\('child-process-gone'/);
  assert.match(mainSource, /renderProcessGone:/);
  assert.match(mainSource, /unresponsive:/);
  assert.match(mainSource, /responsive:/);
  assert.match(rendererSource, /event\.type === 'recovery-status'/);

  console.log('  OK  webContents crash/hang toparlanma bütçesi ve kaynak temizliği');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
