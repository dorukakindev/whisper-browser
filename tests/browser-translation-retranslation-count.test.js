'use strict';

/**
 * T3 — aynı metnin gereksiz yeniden çevrilmesini sayan maliyet testleri.
 *
 * Senaryolar: uygulama yeniden açma (kalıcı önbellek), duraklat/devam,
 * sağlayıcı hatası + retryFailed, eşzamanlı istek tekilleşmesi.
 * Sağlayıcı deterministik mock'tur; gerçek faturalama iddiası yoktur —
 * sayılan şey translate() fonksiyonuna giden istek adedidir.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const {
  BrowserTranslationScheduler,
  assembleCueSentences,
} = require('../src/browser-translation-scheduler');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');

const CONTEXT = { trackIdentity: 't3-track', targetLanguage: 'tr', model: 'm1', provider: 'mock' };

function cues(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${offset + i}`, start: (offset + i) * 2, end: (offset + i) * 2 + 1.5,
    text: `Cümle ${offset + i} metni.`,
  }));
}

function schedulerWith(overrides) {
  const calls = [];
  const states = [];
  const scheduler = new BrowserTranslationScheduler({
    cache: overrides.cache || new Map(),
    maxConcurrent: overrides.maxConcurrent ?? 4,
    maxAttempts: overrides.maxAttempts ?? 1,
    retryBaseMs: 20,
    context: CONTEXT,
    onState: (s) => states.push(s),
    ...overrides.extra,
    translate: async (sentence, call) => {
      calls.push(sentence.id);
      if (overrides.onCall) overrides.onCall(sentence, call);
      if (overrides.shouldFail && overrides.shouldFail(sentence)) {
        const error = new Error('sağlayıcı düşüşü');
        error.retryable = false;
        throw error;
      }
      return { text: `TR: ${sentence.text}` };
    },
  });
  return { scheduler, calls, states };
}

test('yeniden açılışta kalıcı önbellek: 0 sağlayıcı çağrısı, N isabet', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-trcache-'));
  const file = path.join(dir, 'translation-cache.json');
  const sentences = assembleCueSentences(cues(10), { sourceComplete: true });

  const a = schedulerWith({ cache: new PersistentTranslationCache(file, { minFlushIntervalMs: 0 }) });
  a.scheduler.setSentences(sentences);
  a.scheduler.completeAll();
  await a.scheduler.whenIdle();
  assert.equal(a.scheduler.snapshot().completed, 10);
  assert.equal(a.calls.length, 10);
  assert.equal(a.scheduler.stats.providerRequests, 10);
  assert.equal(a.scheduler.stats.cacheHits, 0);
  assert.equal(a.scheduler.stats.cacheMisses, 10);
  await a.scheduler.cache.flush();

  // Yeni oturum: yeni scheduler + diskten yeni cache nesnesi.
  const b = schedulerWith({ cache: new PersistentTranslationCache(file, { minFlushIntervalMs: 0 }) });
  b.scheduler.setSentences(sentences);
  b.scheduler.completeAll();
  await b.scheduler.whenIdle();
  assert.equal(b.scheduler.snapshot().completed, 10);
  assert.equal(b.calls.length, 0, `yeniden açılış tek sağlayıcı çağrısı bile yapmamalı, ${b.calls.length} gitti`);
  assert.equal(b.scheduler.stats.cacheHits, 10);
  assert.equal(b.scheduler.stats.cacheMisses, 0);
  // Sayaçlar state olayında görünür olmalı (tanı paneli bunu okur).
  const last = b.states.at(-1);
  assert.equal(last.stats.cacheHits, 10);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('aynı cue listesi yeniden reconcile — 0 yeni istek', async () => {
  const { scheduler, calls } = schedulerWith({ maxConcurrent: 1 });
  scheduler.setSentences(assembleCueSentences(cues(6), { sourceComplete: true }));
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(calls.length, 6);

  scheduler.reconcileSentences(assembleCueSentences(cues(6), { sourceComplete: true }));
  await scheduler.whenIdle();
  assert.equal(calls.length, 6, 'devam turu hiçbir cümleyi tekrar göndermemeli');
  assert.equal(scheduler.stats.providerRequests, 6);
});

test('sağlayıcı hatasında retryFailed yalnız düşen cümleyi tekrarlar', async () => {
  let failS3 = true;
  const { scheduler, calls } = schedulerWith({
    maxConcurrent: 2,
    shouldFail: (sentence) => failS3 && sentence.text === 'Üçüncü düşecek.',
  });
  const list = [
    { id: 's1', start: 0, end: 1, text: 'Birinci.' },
    { id: 's2', start: 2, end: 3, text: 'İkinci.' },
    { id: 's3', start: 4, end: 5, text: 'Üçüncü düşecek.' },
    { id: 's4', start: 6, end: 7, text: 'Dördüncü.' },
  ];
  scheduler.setSentences(assembleCueSentences(list, { sourceComplete: true }));
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().completed, 3);
  assert.equal(calls.length, 4, 'ilk tur: 3 başarılı + 1 düşen = 4 istek');

  failS3 = false;
  scheduler.retryFailed();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().completed, 4);
  const s3Calls = calls.filter((id) => String(id).includes('s3'));
  assert.equal(s3Calls.length, 2, 's3 ilk denemede düştü + retryFailed\'da bir kez — toplam 2');
  assert.equal(calls.length, 5, 'başarılı s1/s2/s4 tekrar ücretlendirilmedi');
  assert.equal(scheduler.stats.providerRequests, 5);
});

test('eşzamanlı aynı-anahtar istekler tek sağlayıcı çağrısı üretir', async () => {
  const calls = [];
  const scheduler = new BrowserTranslationScheduler({
    cache: new Map(), maxConcurrent: 4,
    context: CONTEXT,
    translate: async () => {
      calls.push(1);
      await new Promise((r) => setTimeout(r, 20));
      return { text: 'ortak' };
    },
  });
  const sentence = assembleCueSentences(
    [{ id: 'x', start: 0, end: 1, text: 'Paylaşılan.' }], { sourceComplete: true })[0];
  const key = require('../src/browser-translation-scheduler')
    .translationCacheKey(sentence, scheduler.context);
  const a = new AbortController(); const b = new AbortController();
  const [ra, rb] = await Promise.all([
    scheduler.translateShared(sentence, key, a),
    scheduler.translateShared(sentence, key, b),
  ]);
  assert.equal(ra.text, rb.text);
  assert.equal(calls.length, 1, 'iki eşzamanlı istek tek sağlayıcı çağrısına indirgenmeli');
  assert.equal(scheduler.stats.providerRequests, 1);
});

test('stats snapshot ve emitState içinde taşınır', async () => {
  const { scheduler, states } = schedulerWith({});
  scheduler.setSentences(assembleCueSentences(cues(3), { sourceComplete: true }));
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.deepEqual(snap.stats, { providerRequests: 3, cacheHits: 0, cacheMisses: 3 });
  const last = states.at(-1);
  assert.deepEqual(last.stats, { providerRequests: 3, cacheHits: 0, cacheMisses: 3 });
});
