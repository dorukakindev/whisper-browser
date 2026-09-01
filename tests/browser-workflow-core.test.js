const assert = require('assert');
const {
  CaptionAcquisitionPlan,
  capabilityMatrixEntry,
} = require('../src/browser-acquisition');
const {
  BrowserTranslationScheduler,
  assembleCueSentences,
  distributeTranslation,
  planTranslationWindow,
  translationCacheKey,
} = require('../src/browser-translation-scheduler');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

(async () => {
  await test('edinme merdiveni otomatik basamakları sırayla yürütür', () => {
    const plan = new CaptionAcquisitionPlan({
      mediaId: 'youtube:1',
      acquisitionId: 'cap-1',
      capabilities: { networkCapture: true, manifestCapture: true, liveAsr: true },
    });
    assert.equal(plan.next().id, 'network-capture');
    assert(plan.start('network-capture'));
    assert(plan.finish('network-capture', { success: false, reason: 'İz bulunamadı.' }));
    assert.equal(plan.next().id, 'manifest');
    assert.deepEqual(plan.snapshot().needsConsent, ['live-asr']);
    plan.updateConsent({ liveAsr: true });
    assert.equal(plan.stage('live-asr').status, 'waiting');
  });

  await test('başarılı basamak kalan bekleyen basamakları kapatır', () => {
    const plan = new CaptionAcquisitionPlan({
      capabilities: { nativeTextTrack: true, networkCapture: true, manifestCapture: true },
    });
    assert(plan.start('native-text-track'));
    assert(plan.finish('native-text-track', { success: true, trackCount: 2 }));
    const snapshot = plan.snapshot();
    assert.equal(snapshot.winner, 'native-text-track');
    assert(snapshot.complete);
    assert.equal(plan.next(), null);
    assert.equal(plan.stage('network-capture').status, 'skipped');
  });

  await test('servis yetenek matrisi doğrulama tarihini ve caption yollarını özetler', () => {
    const row = capabilityMatrixEntry('netflix', {
      networkCapture: true,
      dualTrack: true,
      fullscreen: true,
    }, '2026-09-01');
    assert.equal(row.service, 'netflix');
    assert(row.captionDetection);
    assert(row.dualTrack);
    assert.equal(row.verifiedAt, '2026-09-01');
  });

  const cues = [
    { id: 'a', start: 0, end: 1, text: 'This is' },
    { id: 'b', start: 1.05, end: 2, text: 'one sentence.' },
    { id: 'c', start: 5, end: 6, text: 'Second sentence!' },
  ];

  await test('cue parçaları cümle kimliği ve parça bağını koruyarak birleşir', () => {
    const sentences = assembleCueSentences(cues);
    assert.equal(sentences.length, 2);
    assert.deepEqual(sentences[0].cueIds, ['a', 'b']);
    assert.equal(sentences[0].text, 'This is one sentence.');
    assert.match(sentences[0].id, /^sentence:a:b:/);
  });

  await test('çeviri cue zamanlarını ve kimliklerini değiştirmeden dağıtılır', () => {
    const sentence = assembleCueSentences(cues)[0];
    const distributed = distributeTranslation(sentence, 'Bu tek bir cümledir.');
    assert.equal(distributed.length, 2);
    assert.deepEqual(distributed.map((cue) => cue.cueId), ['a', 'b']);
    assert.deepEqual(distributed.map((cue) => [cue.start, cue.end]), [[0, 1], [1.05, 2]]);
    assert.equal(distributed.map((cue) => cue.text).join(' '), 'Bu tek bir cümledir.');
  });

  await test('oynatma penceresi aktif ve ilerideki cümleleri önce planlar', () => {
    const sentences = [
      { id: 'past', start: 5, end: 10 },
      { id: 'active', start: 19, end: 21 },
      { id: 'near', start: 25, end: 27 },
      { id: 'far', start: 200, end: 205 },
    ];
    assert.deepEqual(planTranslationWindow(sentences, 20, { lookBehind: 15, lookAhead: 90 }).map((x) => x.id),
      ['active', 'near', 'past']);
  });

  await test('cache anahtarı hedef dil/model/sözlük değişimini ayırır', () => {
    const sentence = { text: 'Hello', contextHash: 'ctx' };
    const first = translationCacheKey(sentence, { targetLanguage: 'tr', model: 'a', glossaryVersion: '1' });
    const same = translationCacheKey(sentence, { targetLanguage: 'tr', model: 'a', glossaryVersion: '1' });
    const other = translationCacheKey(sentence, { targetLanguage: 'de', model: 'a', glossaryVersion: '1' });
    assert.equal(first, same);
    assert.notEqual(first, other);
  });

  await test('zamanlayıcı pencereyi çevirir ve ikinci koşuda cache kullanır', async () => {
    const sentences = assembleCueSentences(cues);
    const cache = new Map();
    let calls = 0;
    const scheduler = new BrowserTranslationScheduler({
      cache,
      maxConcurrent: 1,
      lookAhead: 90,
      context: { targetLanguage: 'tr', model: 'test' },
      translate: async (sentence) => {
        calls++;
        return sentence.id === sentences[0].id ? 'Bu tek bir cümledir.' : 'İkinci cümle!';
      },
    });
    scheduler.setSentences(sentences);
    scheduler.updatePlayhead(0);
    await scheduler.whenIdle();
    assert.equal(calls, 2);
    assert.equal(scheduler.snapshot().results.length, 2);

    const cachedResults = [];
    const second = new BrowserTranslationScheduler({
      cache,
      context: { targetLanguage: 'tr', model: 'test' },
      translate: async () => { throw new Error('Cache kullanılmadı.'); },
      onResult: (result) => cachedResults.push(result),
    });
    second.setSentences(sentences);
    second.updatePlayhead(0);
    await second.whenIdle();
    assert.equal(cachedResults.length, 2);
    assert(cachedResults.every((result) => result.cached));
  });

  await test('uzak seek pencere dışındaki çalışan çeviriyi iptal eder', async () => {
    const sentences = [
      { id: 'old', start: 0, end: 2, text: 'Old.', pieces: [{ cueId: 'o', start: 0, end: 2, text: 'Old.' }] },
      { id: 'new', start: 200, end: 202, text: 'New.', pieces: [{ cueId: 'n', start: 200, end: 202, text: 'New.' }] },
    ];
    const finished = [];
    const scheduler = new BrowserTranslationScheduler({
      maxConcurrent: 1,
      lookAhead: 30,
      farSeekThreshold: 20,
      translate: (sentence, { signal }) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(sentence.id), sentence.id === 'old' ? 80 : 5);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
      }),
      onResult: (result) => { if (!result.error) finished.push(result.sentenceId); },
    });
    scheduler.setSentences(sentences);
    scheduler.updatePlayhead(0);
    scheduler.updatePlayhead(200);
    await scheduler.whenIdle();
    assert.deepEqual(finished, ['new']);
  });

  await test('tüm izi tamamlama pencere dışındaki cümleleri de sıraya alır', async () => {
    const sentences = [
      { id: 'near', start: 0, end: 2, text: 'Near.', pieces: [{ cueId: 'n', start: 0, end: 2, text: 'Near.' }] },
      { id: 'far', start: 500, end: 502, text: 'Far.', pieces: [{ cueId: 'f', start: 500, end: 502, text: 'Far.' }] },
    ];
    const completed = [];
    const states = [];
    const scheduler = new BrowserTranslationScheduler({
      maxConcurrent: 1,
      lookAhead: 30,
      translate: async (sentence) => sentence.text,
      onResult: (result) => completed.push(result.sentenceId),
      onState: (state) => states.push(state),
    });
    scheduler.setSentences(sentences);
    scheduler.completeAll();
    await scheduler.whenIdle();
    assert.deepEqual(completed, ['near', 'far']);
    assert(states.some((state) => state.completeTrack && state.estimatedTokens > 0));
  });

  console.log(`browser-workflow-core: ${passed} test`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
