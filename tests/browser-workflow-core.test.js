const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  CaptionAcquisitionPlan,
  CaptionDiscoveryState,
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
  await test('browser preload medya ve cue olaylarını içerik sızdırmadan yayınlar', async () => {
    class Events {
      constructor() { this.listeners = new Map(); }
      addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
      }
      emit(type, payload = {}) {
        for (const fn of this.listeners.get(type) || []) fn({ type, target: this, ...payload });
      }
    }
    const trackEvents = new Events();
    const track = Object.assign(trackEvents, { cues: [] });
    const trackListEvents = new Events();
    const textTracks = [];
    textTracks.addEventListener = trackListEvents.addEventListener.bind(trackListEvents);
    textTracks.emit = trackListEvents.emit.bind(trackListEvents);
    const videoEvents = new Events();
    const video = Object.assign(videoEvents, { tagName: 'VIDEO', readyState: 0, textTracks,
      querySelectorAll: () => [] });
    const windowEvents = new Events();
    const documentEvents = new Events();
    const sent = [];
    const context = {
      require: (name) => {
        assert.equal(name, 'electron');
        return { ipcRenderer: { send: (channel, payload) => sent.push({ channel, payload }), on: () => {} } };
      },
      window: windowEvents,
      document: Object.assign(documentEvents, {
        readyState: 'complete', documentElement: {},
        querySelectorAll: (selector) => selector === 'video' ? [video] : [],
      }),
      location: { href: 'https://example.test/watch' },
      MutationObserver: class { observe() {} disconnect() {} },
      URL, setTimeout, clearTimeout, console,
    };
    context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/browser-preload.js'), 'utf8'), context);
    video.readyState = 1;
    video.emit('loadedmetadata');
    textTracks.push(track);
    textTracks.emit('addtrack', { track });
    track.cues.push({ startTime: 0, endTime: 1, text: 'gizli cue metni' });
    track.emit('cuechange');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const discovery = sent.filter((entry) => entry.channel === 'browser:discovery-signal').map((entry) => entry.payload);
    assert(discovery.some((entry) => entry.type === 'document_ready'));
    assert(discovery.some((entry) => entry.type === 'video_found'));
    assert(discovery.some((entry) => entry.type === 'media_metadata_ready'));
    assert(discovery.some((entry) => entry.type === 'track_candidate_found'));
    assert(discovery.some((entry) => entry.type === 'cue_list_growing' && entry.cueCount === 1));
    assert(!JSON.stringify(discovery).includes('gizli cue metni'));
  });

  await test('olay tabanlı keşif ilerler ve geç gelen düşük seviye olay geriye taşımaz', () => {
    const discovery = new CaptionDiscoveryState();
    assert(discovery.observe('document_ready', { mediaCount: 0 }, 10));
    assert(discovery.observe('video_found', { mediaCount: 1 }, 20));
    assert(discovery.observe('media_metadata_ready', { trackCount: 0 }, 30));
    assert.match(discovery.snapshot().message, /henüz okunabilir/);
    assert(discovery.observe('track_candidate_found', { trackCount: 1, cueCount: 0 }, 40));
    assert(discovery.observe('cue_list_growing', { cueCount: 12 }, 50));
    assert.equal(discovery.observe('document_ready', {}, 60), false);
    assert.equal(discovery.snapshot().phase, 'cue_list_growing');
    assert.equal(discovery.snapshot().cueCount, 12);
    discovery.observe('navigation_started', {}, 70);
    assert.equal(discovery.snapshot().phase, 'navigation_started');
    assert.equal(discovery.snapshot().cueCount, 0);
  });

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

  await test('geç kalan eşzamanlı edinme sonucu ilk kazananı değiştirmez', () => {
    const plan = new CaptionAcquisitionPlan({
      capabilities: { nativeTextTrack: true, networkCapture: true },
    });
    assert(plan.start('native-text-track'));
    assert(plan.start('network-capture'));
    assert(plan.finish('network-capture', { success: true, trackCount: 1 }));
    assert.equal(plan.finish('native-text-track', { success: true, trackCount: 2 }), false);
    assert.equal(plan.snapshot().winner, 'network-capture');
    assert.equal(plan.stage('native-text-track').status, 'skipped');
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

  await test('kısa çeviri boş cue üretmeden komşu zaman aralıklarını birleştirir', () => {
    const sentence = {
      pieces: [
        { cueId: 'a', start: 0, end: 1, text: 'First' },
        { cueId: 'b', start: 1, end: 2, text: 'second' },
        { cueId: 'c', start: 2, end: 3, text: 'third' },
      ],
    };
    const distributed = distributeTranslation(sentence, 'Kısa metin');
    assert.deepEqual(distributed.map((cue) => cue.text), ['Kısa', 'metin']);
    assert(distributed.every((cue) => cue.text.trim()), 'boş çeviri cue üretildi');
    assert.equal(distributed[1].end, 3);
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
    const providerA = translationCacheKey(sentence, {
      targetLanguage: 'tr', model: 'a', glossaryVersion: '1',
      provider: 'https://one.example/chat/completions', sourceHash: 'source-a',
    });
    const providerB = translationCacheKey(sentence, {
      targetLanguage: 'tr', model: 'a', glossaryVersion: '1',
      provider: 'https://two.example/chat/completions', sourceHash: 'source-a',
    });
    const sourceB = translationCacheKey(sentence, {
      targetLanguage: 'tr', model: 'a', glossaryVersion: '1',
      provider: 'https://one.example/chat/completions', sourceHash: 'source-b',
    });
    assert.notEqual(providerA, providerB);
    assert.notEqual(providerA, sourceB);

    const identityBase = {
      targetLanguage: 'tr', model: 'a', provider: 'https://one.example/chat/completions',
      sourceHash: 'source-a', sourceRevision: 'revision-a', promptVersion: 'prompt-v1',
      mediaIdentity: 'browser:youtube:video-a', trackIdentity: 'captions-en',
      sourceLineage: 'browser:youtube:video-a|captions-en',
    };
    assert.notEqual(
      translationCacheKey(sentence, identityBase),
      translationCacheKey(sentence, { ...identityBase, mediaIdentity: 'browser:youtube:video-b',
        sourceLineage: 'browser:youtube:video-b|captions-en' }),
      'aynı metin farklı medyada cache paylaşmamalı');
    assert.notEqual(
      translationCacheKey(sentence, identityBase),
      translationCacheKey(sentence, { ...identityBase, trackIdentity: 'captions-de',
        sourceLineage: 'browser:youtube:video-a|captions-de' }),
      'aynı medya içindeki farklı kaynak izler cache paylaşmamalı');
    assert.equal(
      translationCacheKey(sentence, identityBase),
      translationCacheKey(sentence, { ...identityBase, sourceRevision: 'revision-b' }),
      'komşu cue değişse de değişmeyen cümlenin cache sonucu korunmalı');
    assert.notEqual(
      translationCacheKey(sentence, identityBase),
      translationCacheKey(sentence, { ...identityBase, promptVersion: 'prompt-v2' }),
      'prompt sözleşmesi değişince eski cache kullanılmamalı');
    assert.notEqual(
      translationCacheKey(sentence, identityBase),
      translationCacheKey({ ...sentence, text: 'Hello again' }, identityBase),
      'cümlenin kendi metni değişince cache sonucu paylaşılmamalı');
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

  await test('önbellek yazma hatası başarılı çeviriyi kullanıcıdan saklamaz', async () => {
    const sentence = { id: 'cache-write', start: 0, end: 2, text: 'Hello.',
      pieces: [{ cueId: 'cw', start: 0, end: 2, text: 'Hello.' }] };
    const delivered = [];
    const scheduler = new BrowserTranslationScheduler({
      cache: { get: async () => undefined, set: async () => { throw new Error('disk dolu'); } },
      translate: async () => 'Merhaba.',
      onResult: (result) => delivered.push(result),
    });
    scheduler.setSentences([sentence]);
    scheduler.updatePlayhead(0);
    await scheduler.whenIdle();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].error, undefined);
    assert.equal(delivered[0].cues[0].text, 'Merhaba.');
    assert.equal(scheduler.snapshot().completed, 1);
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

  await test('başarısız çeviri sınırlı sayıda ve backoff ile yeniden denenir', async () => {
    const sentence = { id: 'retry', start: 0, end: 2, text: 'Retry.', pieces: [{ cueId: 'r', start: 0, end: 2, text: 'Retry.' }] };
    const failures = [];
    let calls = 0;
    let shouldFail = true;
    const scheduler = new BrowserTranslationScheduler({
      maxAttempts: 3,
      retryBaseMs: 10,
      retryMaxMs: 20,
      translate: async () => {
        calls++;
        if (shouldFail) throw new Error('kalıcı hata');
        return 'Başarılı.';
      },
      onResult: (result) => { if (result.error) failures.push(result); },
    });
    scheduler.setSentences([sentence]);
    scheduler.updatePlayhead(0);
    await scheduler.whenIdle();
    assert.equal(calls, 3);
    assert.equal(failures.length, 3);
    assert.deepEqual(failures.map((failure) => failure.retrying), [true, true, false]);
    assert.equal(scheduler.snapshot().failures[0].terminal, true);
    scheduler.updatePlayhead(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls, 3, 'terminal hata yeniden kuyruğa girdi');
    shouldFail = false;
    assert.equal(scheduler.retryFailed(), 1, 'terminal hata elle yeniden kuyruğa alınmadı');
    await scheduler.whenIdle();
    assert.equal(calls, 4, 'elle yeniden deneme yeni bir istek başlatmadı');
    assert.equal(scheduler.snapshot().failures.length, 0, 'başarılı yeniden deneme hata kaydını temizlemedi');
    assert.equal(scheduler.snapshot().results.length, 1, 'başarılı yeniden deneme sonucu saklanmadı');
  });

  await test('aynı cache anahtarındaki eşzamanlı çeviriler tek isteği paylaşır', async () => {
    const pieces = (cueId, start) => [{ cueId, start, end: start + 1, text: 'Same.' }];
    const sentences = [
      { id: 'same-a', start: 0, end: 1, text: 'Same.', pieces: pieces('a', 0) },
      { id: 'same-b', start: 2, end: 3, text: 'Same.', pieces: pieces('b', 2) },
    ];
    let calls = 0;
    const scheduler = new BrowserTranslationScheduler({
      maxConcurrent: 2,
      translate: async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'Aynı.';
      },
    });
    scheduler.setSentences(sentences);
    scheduler.updatePlayhead(0);
    await scheduler.whenIdle();
    assert.equal(calls, 1);
    assert.equal(scheduler.snapshot().results.length, 2);
  });

  await test('abort edilmiş paylaşılan istek yeni tüketiciyi zehirlemez', async () => {
    let calls = 0;
    const scheduler = new BrowserTranslationScheduler({
      translate: (_sentence, { signal }) => {
        calls++;
        return new Promise((resolve, reject) => {
          if (signal.aborted) return reject(new Error('aborted'));
          const timer = setTimeout(() => resolve('Yeni sonuç'), 5);
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
        });
      },
    });
    const sentence = { id: 'shared', text: 'Same.' };
    const firstController = new AbortController();
    const first = scheduler.translateShared(sentence, 'same-key', firstController);
    firstController.abort('ilk tüketici ayrıldı');
    const secondController = new AbortController();
    const second = scheduler.translateShared(sentence, 'same-key', secondController);
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    assert.equal(firstResult.status, 'rejected');
    assert.equal(secondResult.status, 'fulfilled');
    assert.equal(secondResult.value, 'Yeni sonuç');
    assert.equal(calls, 2);
  });

  await test('cache beklerken iptal edilen tüketici yeni API isteği başlatmaz', async () => {
    let calls = 0;
    const scheduler = new BrowserTranslationScheduler({
      translate: async () => { calls++; return 'Gereksiz sonuç'; },
    });
    const controller = new AbortController();
    controller.abort('konum değişti');
    await assert.rejects(
      scheduler.translateShared({ id: 'late', text: 'Late.' }, 'late-key', controller),
      /konum değişti/
    );
    assert.equal(calls, 0);
    assert.equal(scheduler.inFlightByCacheKey.size, 0);
  });

  await test('boşluksuz çeviri metni çoklu cueya kayıpsız dağıtılır', async () => {
    const sentence = {
      id: 'cjk', text: 'Source',
      pieces: [
        { cueId: 'a', start: 0, end: 1, text: 'A' },
        { cueId: 'b', start: 1, end: 2, text: 'B' },
      ],
    };
    const cues = distributeTranslation(sentence, 'これはテストです');
    assert.equal(cues.length, 2);
    assert.equal(cues.map((cue) => cue.text).join(''), 'これはテストです');
  });

  console.log(`browser-workflow-core: ${passed} test`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
