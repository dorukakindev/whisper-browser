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
  assert.deepEqual(scheduler.snapshot().reconcile,
    { unchanged: 2, added: 1, changed: 0, removed: 0 });
  assert.equal(waiting.get('pending').signal.aborted, false, 'değişmeyen uçuşan istek iptal edildi');
  assert.equal(calls.filter((text) => text === 'First.').length, 1);
  assert.equal(calls.filter((text) => text === 'Pending.').length, 1);
  const contextOnly = assembleCueSentences([first, pending, cue('c', 'New.', 4)]);
  contextOnly[0].contextAfter = [{ text: 'New neighboring context.' }];
  scheduler.reconcileSentences(contextOnly);
  assert.equal(scheduler.snapshot().reconcile.changed, 0,
    'yalnız komşu bağlam değiştiğinde gönderilmiş cümle yeniden ücretlendirilmemeli');
  assert.equal(waiting.get('pending').signal.aborted, false);
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
  assert.match(translationSource, /!sentences\.length && options\.sourceComplete !== false/,
    'yarım cümleyle başlayan canlı iz çeviri oturumunu kapatmamalı');

  const context = { normalizeCues, assembleCueSentences, createHash: require('node:crypto').createHash,
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
  const expectedHash = context.createHash('sha256').update(JSON.stringify([[10, 11, 'Corrected.']])).digest('hex');
  assert.equal(scheduler.context.sourceHash, expectedHash);
  assert.equal(scheduler.context.sourceRevision, expectedHash);
  assert.equal(result.completeTrack, true);
  assert.equal(result.reused + result.added + result.changed, result.sentenceCount);
  assert.match(translationSource, /persistCompletedBrowserTranslation\(tab, scheduler, config, scheduler\.context\)/,
    'Arşivleme güncel kaynak bağlamını kullanmalı');
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const liveStart = renderer.slice(renderer.indexOf('async function startBrowserLiveTranslation('),
    renderer.indexOf('function browserTranslationCueKey('));
  assert.match(liveStart,
    /player\.browserTranslationTrackId === track\.id[\s\S]*?refresh: true[\s\S]*?restoreBrowserTranslationSnapshot/,
    'aynı izin ikinci seçimi scheduler ve sonuçları sıfırlamamalı');
  let reusedRequest = null;
  let restored = 0;
  const oldTranslations = new Map([['a', { cueId: 'a', text: 'Korunan çeviri.' }]]);
  const liveContext = {
    player: {
      browserActiveTabId: 'tab-1', cues: [first], cuesRaw: [first],
      browserTranslationTrackId: 'source', browserTranslationFailed: 0,
      browserLiveTranslations: oldTranslations,
    },
    window: { api: { startBrowserTranslation: async (_tabId, request) => {
      reusedRequest = request;
      return { ok: true, sentenceCount: 1 };
    } } },
    currentGeneration: () => 1, staleGeneration: () => false,
    browserTabState: () => ({}),
    restoreBrowserTranslationSnapshot: async () => { restored++; },
    retryFailedBrowserTranslation: async () => { throw new Error('başarılı iz yeniden denenmemeli'); },
    setBrowserSignal: () => {},
  };
  vm.createContext(liveContext);
  vm.runInContext(liveStart, liveContext);
  const reused = await liveContext.startBrowserLiveTranslation({ id: 'source', role: 'source' }, 'en');
  assert.equal(reused.reused, true);
  assert.equal(reusedRequest.refresh, true);
  assert.equal(restored, 1);
  assert.equal(liveContext.player.browserLiveTranslations, oldTranslations,
    'aynı iz yeniden seçilince hazır çeviri Map sıfırlandı');
  liveContext.player.browserTranslationFailed = 2;
  liveContext.retryFailedBrowserTranslation = async () => { liveContext.retried = true; };
  const retried = await liveContext.startBrowserLiveTranslation({ id: 'source', role: 'source' }, 'en');
  assert.equal(retried.reused, true);
  assert.equal(liveContext.retried, true, 'yalnız hatalı cümleler yeniden denenmedi');
  assert.equal(liveContext.player.browserLiveTranslations, oldTranslations,
    'kısmi hatada sağlam çeviriler silindi');
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
