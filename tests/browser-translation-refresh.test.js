const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { BrowserTranslationScheduler, assembleCueSentences, normalizeCues } = require('../src/browser-translation-scheduler');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const cue = (id, text, start = 0) => ({ id, text, start, end: start + 1 });

(async () => {
  const calls = [];
  const waiting = new Map();
  const scheduler = new BrowserTranslationScheduler({ maxConcurrent: 3,
    translate: (sentence, { signal }) => {
      calls.push(sentence.text);
      if (sentence.text === 'Pending.') return new Promise((resolve) => waiting.set('pending', { resolve, signal }));
      return Promise.resolve(`TR ${sentence.text}`);
    } });
  const first = cue('a', 'First.');
  const pending = cue('b', 'Pending.', 2);
  scheduler.setSentences(assembleCueSentences([first, pending]));
  scheduler.completeAll();
  await tick();
  assert.equal(scheduler.snapshot().completed, 1);
  assert.deepEqual(scheduler.recoverySummary(), {
    total: 2, completed: 1, queued: 0, pending: 1, failed: 0, retryableFailures: 0,
  });
  scheduler.reconcileSentences(assembleCueSentences([first, pending, cue('c', 'New.', 4)]));
  await tick();
  assert.equal(waiting.get('pending').signal.aborted, false, 'değişmeyen uçuşan istek iptal edildi');
  assert.equal(calls.filter((text) => text === 'First.').length, 1);
  assert.equal(calls.filter((text) => text === 'Pending.').length, 1);
  waiting.get('pending').resolve('Bekleyen.');
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().total, 3);
  assert.equal(scheduler.snapshot().completed, 3);
  assert.equal(scheduler.snapshot().remaining, 0);
  scheduler.reconcileSentences(assembleCueSentences([cue('a', 'Corrected.', 10)]));
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().results.length, 1, 'kaldırılan sonuçlar kaldı');
  assert.equal(scheduler.snapshot().results[0].cues[0].start, 10);
  assert.match(scheduler.snapshot().results[0].text, /Corrected/);

  // Aynı kimlik/metin fakat yeni zaman: eski uçuşan sonucun dönmesi etkisizdir.
  let finishOld;
  const delayed = new BrowserTranslationScheduler({ translate: (sentence) => sentence.start === 0
    ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve('Yeni konum.') });
  delayed.setSentences(assembleCueSentences([cue('x', 'Same.')]));
  delayed.completeAll();
  await tick();
  delayed.reconcileSentences(assembleCueSentences([cue('x', 'Same.', 20)]));
  await delayed.whenIdle();
  finishOld('Eski konum.');
  await tick();
  assert.equal(delayed.snapshot().results.length, 1);
  assert.equal(delayed.snapshot().results[0].cues[0].start, 20);
  assert.equal(delayed.snapshot().results[0].text, 'Yeni konum.');

  let failures = 0;
  const failed = new BrowserTranslationScheduler({ maxAttempts: 1, translate: async () => { failures++; throw Error('limit'); } });
  const failedSentences = assembleCueSentences([first]);
  failed.setSentences(failedSentences);
  failed.completeAll();
  await failed.whenIdle();
  assert.deepEqual(failed.recoverySummary(), {
    total: 1, completed: 0, queued: 0, pending: 0, failed: 1, retryableFailures: 0,
  });
  failed.reconcileSentences(failedSentences);
  await failed.whenIdle();
  assert.equal(failures, 1, 'aynı kaynak terminal hatayı tekrar tekrar denedi');

  // Gerçek main işlevinin refresh dalı yeni sağlayıcı/scheduler yaratmamalı.
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const translationSource = main.slice(main.indexOf('function startBrowserTranslation('),
    main.indexOf('function persistCompletedBrowserTranslation('));
  assert.match(translationSource,
    /if \(terminologyVersion !== context\.terminologyVersion\)[\s\S]{0,180}scheduler\.setContext\(\{ terminologyVersion, terminologyText: terminologyPrompt\(config\.terminologyMap\) \}\)/,
    'öğrenilen terminoloji yeni cümlelerin önbellek bağlamına aktarılmalı');
  const context = { normalizeCues, assembleCueSentences,
    browserTranslationConfig: () => { throw Error('güncellemede sağlayıcı yeniden kuruldu'); } };
  vm.createContext(context);
  vm.runInContext(translationSource, context);
  const tab = { translationTrackId: 'source', translationScheduler: scheduler,
    translationResults: new Map([['old', cue('old', 'Eski')]]) };
  const result = context.startBrowserTranslation(tab, [cue('a', 'Corrected.', 10)], { trackId: 'source', refresh: true });
  assert.equal(result.ok, true);
  assert.equal(tab.translationScheduler, scheduler);
  assert.equal(tab.translationResults.has('old'), false);
  assert.equal(tab.translationResults.size, 1);
  assert.equal(context.startBrowserTranslation(tab, [first], { trackId: 'wrong', refresh: true }).ok, false);

  const recoveryContext = { Map, Date, Number, Array };
  vm.createContext(recoveryContext);
  vm.runInContext(main.slice(main.indexOf('function browserRecoveryJobsForTab('),
    main.indexOf('function browserTabSnapshot(')), recoveryContext);
  const recovery = recoveryContext.browserRecoveryJobsForTab({
    id: 'tab-1', mediaId: 'site:video', translationTrackId: 'track-1', recoveryJobs: [],
    translationScheduler: {
      recoverySummary: () => ({ total: 8, completed: 3, queued: 2, pending: 1,
        failed: 1, retryableFailures: 1 }),
      snapshot: () => { throw new Error('Kurtarma özeti tam sonuç snapshotı almamalı.'); },
    },
  });
  assert.equal(recovery.length, 1);
  assert.deepEqual({ completed: recovery[0].completed, total: recovery[0].total, failed: recovery[0].failed },
    { completed: 3, total: 8, failed: 1 });
  console.log('Browser translation refresh: incremental requests, timing changes, stale results, failure budget and main reuse passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
