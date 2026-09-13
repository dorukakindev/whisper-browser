'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  applyQueueRunEvent,
  assertQueueInvariants,
  beginQueueRun,
  createProcessTerminalLatch,
  createSingleFlightScheduler,
  eventMatchesActiveJob,
  snapshotOptions,
} = require('../src/renderer/queue-lifecycle');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

function makeState(count = 3) {
  return {
    queue: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      label: `iş-${index + 1}`,
      status: 'pending',
      files: [],
      opts: snapshotOptions({ model: `model-${index + 1}`, nested: { beam: index + 1 } }),
    })),
    queueRunning: true,
    currentQueueId: null,
    activeJobId: null,
    running: false,
    cancelled: false,
  };
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.sequence = 0;
    this.tasks = [];
  }

  setTimeout(fn, delay = 0) {
    this.tasks.push({ at: this.now + Math.max(0, Number(delay) || 0), sequence: ++this.sequence, fn });
  }

  async runAll(limit = 1000) {
    let steps = 0;
    while (this.tasks.length) {
      if (++steps > limit) throw new Error('Sahte zamanlayıcı adım sınırını aştı.');
      this.tasks.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
      const task = this.tasks.shift();
      this.now = task.at;
      await task.fn();
      await Promise.resolve();
    }
  }
}

function xorshift(seed) {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}

function shuffle(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const other = random() % (index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

(async () => {
  await test('item.opts ekleme anında derin kopyalanır ve dondurulur', () => {
    const original = { model: 'large-v3', nested: { beam: 5 }, list: [{ language: 'tr' }] };
    const frozen = snapshotOptions(original);
    original.nested.beam = 99;
    original.list[0].language = 'en';
    assert.deepStrictEqual(frozen, { model: 'large-v3', nested: { beam: 5 }, list: [{ language: 'tr' }] });
    assert(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.list[0]));
    assert.throws(() => { frozen.nested.beam = 7; }, TypeError);
  });

  await test('regression izi: eski code=0 exit çalışan öğeyi terminalsiz bırakıyordu', () => {
    const legacy = { queueRunning: true, running: true, currentQueueId: 1,
      queue: [{ id: 1, status: 'running' }] };
    const legacyExit = (code) => {
      const item = legacy.queue.find((entry) => entry.id === legacy.currentQueueId);
      if (code !== 0 && item && item.status === 'running') item.status = 'error';
      legacy.currentQueueId = null;
      legacy.running = false;
    };
    legacyExit(0);
    assert.strictEqual(legacy.queue[0].status, 'running');
    assert.strictEqual(legacy.currentQueueId, null);
  });

  await test('regression izi: eski error→start→close sırası yeni active işi siliyordu', () => {
    let legacyActiveJob = 'A';
    const oldErrorA = () => { legacyActiveJob = null; };
    const oldCloseA = () => { legacyActiveJob = null; };
    oldErrorA();
    legacyActiveJob = 'B';
    oldCloseA();
    assert.strictEqual(legacyActiveJob, null);

    let guardedActiveJob = 'A';
    const guardedCloseA = () => {
      if (guardedActiveJob === 'A') guardedActiveJob = null;
    };
    guardedActiveJob = 'B';
    guardedCloseA();
    assert.strictEqual(guardedActiveJob, 'B');
  });

  await test('done+exit aynı tickte tek terminal ve tek kapanış üretir', () => {
    const state = makeState(1);
    const item = state.queue[0];
    assert(beginQueueRun(state, item, 'job-done').accepted);
    assert(applyQueueRunEvent(state, { type: 'done', jobId: 'job-done', files: ['a.srt'] }).accepted);
    assert(applyQueueRunEvent(state, { type: 'done', jobId: 'job-done' }).duplicate);
    const closed = applyQueueRunEvent(state, { type: 'exit', code: 0, jobId: 'job-done' });
    assert.strictEqual(closed.outcome, 'done');
    assert.strictEqual(item.activeRun.terminalCount, 1);
    assert.strictEqual(item.status, 'done');
    assertQueueInvariants(state);
  });

  await test('error+exit sonucu done ile ezilemez', () => {
    const state = makeState(1);
    const item = state.queue[0];
    beginQueueRun(state, item, 'job-error');
    applyQueueRunEvent(state, { type: 'error', message: 'fixture', jobId: 'job-error' });
    assert(applyQueueRunEvent(state, { type: 'done', jobId: 'job-error' }).duplicate);
    const closed = applyQueueRunEvent(state, { type: 'exit', code: 1, jobId: 'job-error' });
    assert.strictEqual(closed.outcome, 'error');
    assert.strictEqual(item.status, 'error');
    assertQueueInvariants(state);
  });

  await test('terminalsiz code=0 exit protokol hatası olarak kapanır', () => {
    const state = makeState(1);
    const item = state.queue[0];
    beginQueueRun(state, item, 'job-empty');
    const closed = applyQueueRunEvent(state, { type: 'exit', code: 0, jobId: 'job-empty' });
    assert.strictEqual(closed.outcome, 'error');
    assert.strictEqual(closed.synthesizedTerminal, true);
    assert.strictEqual(item.status, 'error');
    assertQueueInvariants(state);
  });

  await test('start→cancel→start her generationı bir kez kapatır', () => {
    const state = makeState(1);
    const item = state.queue[0];
    beginQueueRun(state, item, 'job-cancel');
    state.cancelled = true;
    state.queueRunning = false;
    assert.strictEqual(applyQueueRunEvent(state,
      { type: 'done', jobId: 'job-cancel' }).cancelled, true);
    const cancelled = applyQueueRunEvent(state,
      { type: 'exit', code: 1, cancelled: true, jobId: 'job-cancel' });
    assert.strictEqual(cancelled.outcome, 'cancelled');
    assert.strictEqual(item.status, 'pending');

    state.queueRunning = true;
    beginQueueRun(state, item, 'job-retry');
    applyQueueRunEvent(state, { type: 'done', jobId: 'job-retry' });
    applyQueueRunEvent(state, { type: 'exit', code: 0, jobId: 'job-retry' });
    assert.strictEqual(item.startCount, 2);
    assert.deepStrictEqual(item.runs.map((run) => [run.terminal, run.terminalCount, run.closed]),
      [['cancelled', 1, true], ['done', 1, true]]);
    assertQueueInvariants(state);
  });

  await test('renderer reload ve eski Python olayı yeni duruma uygulanmaz', () => {
    const oldState = makeState(1);
    beginQueueRun(oldState, oldState.queue[0], 'old-job');
    const reloadedState = makeState(1);
    assert.strictEqual(eventMatchesActiveJob(reloadedState, { type: 'done', jobId: 'old-job' }), false);
    reloadedState.activeJobId = 'new-job';
    assert.strictEqual(eventMatchesActiveJob(reloadedState, { type: 'done', jobId: 'old-job' }), false);
    assert.strictEqual(eventMatchesActiveJob(reloadedState, { type: 'progress', jobId: 'new-job' }), true);
  });

  await test('bayat jobId sonucu aktif çalışmanın terminalini ve UI durumunu değiştiremez', () => {
    const state = makeState(1);
    const item = state.queue[0];
    beginQueueRun(state, item, 'current-job');
    const staleDone = applyQueueRunEvent(state,
      { type: 'done', jobId: 'previous-job', files: ['bayat.srt'] });
    assert.deepStrictEqual(staleDone, { accepted: false, stale: true });
    assert.strictEqual(item.status, 'running');
    assert.strictEqual(item.activeRun.terminal, null);
    assert.strictEqual(item.activeRun.terminalCount, 0);
    assert.deepStrictEqual(item.files, []);
    assert.strictEqual(state.activeJobId, 'current-job');
    assert.strictEqual(state.running, true);

    const staleExit = applyQueueRunEvent(state,
      { type: 'exit', code: 0, jobId: 'previous-job' });
    assert.deepStrictEqual(staleExit, { accepted: false, stale: true });
    assert.strictEqual(item.activeRun.closed, false);
    assert.strictEqual(state.currentQueueId, item.id);
    assertQueueInvariants(state);
  });

  await test('çalışan öğe sırasında reorder kimlik eşlemesini bozmaz', () => {
    const state = makeState(3);
    const active = state.queue[1];
    beginQueueRun(state, active, 'job-reorder');
    state.queue = [state.queue[2], state.queue[0], active];
    applyQueueRunEvent(state, { type: 'done', jobId: 'job-reorder' });
    applyQueueRunEvent(state, { type: 'exit', code: 0, jobId: 'job-reorder' });
    assert.strictEqual(active.status, 'done');
    assert.strictEqual(state.queue[2].id, 2);
    assertQueueInvariants(state);
  });

  await test('tek-uçuş pump yinelenen timer ve çalışma-içi isteği birleştirir', async () => {
    const clock = new FakeClock();
    let calls = 0;
    let scheduler;
    scheduler = createSingleFlightScheduler(async () => {
      calls += 1;
      if (calls === 1) scheduler.request(0);
    }, clock.setTimeout.bind(clock));
    assert.strictEqual(scheduler.request(0), true);
    assert.strictEqual(scheduler.request(0), false);
    await clock.runAll();
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(scheduler.snapshot(), { scheduled: false, running: false, rerun: false });
  });

  await test('main error+close latch active işi erken serbest bırakmadan tek terminal üretir', () => {
    const lifecycle = createProcessTerminalLatch('main-error');
    assert.strictEqual(lifecycle.acceptTerminal('error'), true);
    assert.strictEqual(lifecycle.acceptTerminal('done'), false);
    const closing = lifecycle.close(1, 'fixture stderr');
    assert.strictEqual(closing.accepted, true);
    assert.strictEqual(closing.syntheticTerminal, null);
    assert.deepStrictEqual(closing.exitEvent,
      { type: 'exit', code: 1, stderr: 'fixture stderr', cancelled: false, jobId: 'main-error' });
    assert.strictEqual(lifecycle.close(1).duplicate, true);
    assert.strictEqual(lifecycle.state.terminalCount, 1);
  });

  await test('main app-close/cancel fault yolları terminal eksikliğini deterministik kapatır', () => {
    const crashed = createProcessTerminalLatch('main-crash');
    const crashClose = crashed.close(0);
    assert.strictEqual(crashClose.syntheticTerminal.type, 'error');
    assert.strictEqual(crashed.state.terminalCount, 1);

    const cancelled = createProcessTerminalLatch('main-cancel');
    assert.strictEqual(cancelled.requestCancel(), true);
    assert.strictEqual(cancelled.acceptTerminal('done'), false);
    const cancelClose = cancelled.close(1);
    assert.strictEqual(cancelClose.syntheticTerminal, null);
    assert.strictEqual(cancelClose.exitEvent.cancelled, true);
    assert.strictEqual(cancelled.state.terminalType, 'cancelled');
    assert.strictEqual(cancelled.state.terminalCount, 1);
  });

  await test('25.000 rastgele interleaving at-most-once start ve exactly-once terminali korur', async () => {
    const startedAt = Date.now();
    for (let trial = 1; trial <= 25000; trial++) {
      const random = xorshift(trial * 0x45d9f3b);
      const clock = new FakeClock();
      const state = makeState(3);
      let jobSequence = 0;
      let cancellationUsed = false;
      let scheduler;
      scheduler = createSingleFlightScheduler(async () => {
        if (!state.queueRunning || state.running) return;
        const next = state.queue.find((item) => item.status === 'pending');
        if (!next) {
          state.queueRunning = false;
          return;
        }
        const jobId = `trial-${trial}-job-${++jobSequence}`;
        assert(beginQueueRun(state, next, jobId).accepted);
        const injectCancel = !cancellationUsed && random() % 5 === 0;
        if (injectCancel) cancellationUsed = true;
        const terminalChoice = random() % 3;
        const terminal = terminalChoice === 0 ? null : {
          type: terminalChoice === 1 ? 'done' : 'error', jobId,
        };
        const events = [
          ...(terminal ? [terminal, { ...terminal }] : []),
          { type: 'exit', code: terminalChoice === 2 ? 1 : 0, jobId },
          { type: 'done', jobId: `${jobId}-stale` },
          ...(injectCancel ? [{ type: 'cancel_request', jobId }] : []),
        ];
        for (const event of shuffle(events, random)) {
          clock.setTimeout(() => {
            if (event.type === 'cancel_request') {
              if (eventMatchesActiveJob(state, event) && !next.activeRun.closed) {
                state.cancelled = true;
                state.queueRunning = false;
              }
              return;
            }
            const result = applyQueueRunEvent(state, event);
            if (result.closed) {
              // Açıkça iptal edilmiş bir run kapandıktan sonra kullanıcı kuyruğu
              // yeniden başlatıyor; aynı item ancak yeni generation ile koşabilir.
              if (!state.queueRunning) state.queueRunning = true;
              scheduler.request(random() % 3);
            }
          }, random() % 4);
        }
      }, clock.setTimeout.bind(clock));

      scheduler.request(random() % 3);
      scheduler.request(random() % 3);
      await clock.runAll(100);
      assert.strictEqual(state.queueRunning, false);
      assert.strictEqual(state.currentQueueId, null);
      assert.strictEqual(state.running, false);
      assert.strictEqual(state.activeJobId, null);
      for (const item of state.queue) {
        assert(item.startCount === 1 || item.startCount === 2,
          `trial ${trial}: öğe generation dışında iki kez başladı/atlandı`);
        assert(['done', 'error'].includes(item.status), `trial ${trial}: terminal durum yok`);
        for (const run of item.runs) {
          assert.strictEqual(run.terminalCount, 1, `trial ${trial}: terminal sayısı`);
          assert.strictEqual(run.closed, true, `trial ${trial}: süreç kapanmadı`);
        }
      }
      assertQueueInvariants(state);
    }
    console.log(`         randomized=25000 · süre=${Date.now() - startedAt} ms`);
  });

  await test('üretim bağlantıları jobId, lifecycle scripti ve app-close iptalini kullanır', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
    const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
    const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
    assert(html.indexOf('queue-lifecycle.js') < html.indexOf('renderer.js'));
    assert(/startTranscribeSafe\(opts, requestedJobId/.test(renderer));
    assert(/eventMatchesActiveJob\(state, event\)/.test(renderer));
    assert(/const sendJobEvent = \(event\) => sendEvent\(\{ \.\.\.event, jobId \}\)/.test(main));
    const killBody = main.slice(main.indexOf('function killActiveJob()'), main.indexOf('// ---- Kalıcı ayarlar'));
    assert(/lifecycle\.requestCancel\(\)/.test(killBody), 'app-close kill yolu lifecycle iptalini işaretlemiyor');
  });

  await test('mutation: terminal latch kaldırılırsa aynı run iki terminale ulaşıyor', () => {
    const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'queue-lifecycle.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const needle = 'if (run.closed || run.terminal) return { accepted: false, duplicate: true, item, run };';
    assert(source.includes(needle), 'mutation hedefi kaynakta bulunamadı');
    const mutated = source.replace(needle,
      'if (run.closed) return { accepted: false, duplicate: true, item, run };');
    const sandbox = { module: { exports: {} }, exports: {}, console };
    vm.runInNewContext(mutated, sandbox, { filename: 'queue-lifecycle.mutated.js' });
    const api = sandbox.module.exports;
    const state = makeState(1);
    api.beginQueueRun(state, state.queue[0], 'mutated-job');
    api.applyQueueRunEvent(state, { type: 'done', jobId: 'mutated-job' });
    api.applyQueueRunEvent(state, { type: 'error', jobId: 'mutated-job' });
    assert.throws(() => api.assertQueueInvariants(state), /birden fazla terminale/i);
  });

  if (!process.exitCode) console.log(`\n${passed} kuyruk lifecycle testi geçti.`);
})();
