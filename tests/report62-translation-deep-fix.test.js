const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const layout = require('../src/subtitle-sentence-layout');
const {
  BrowserTranslationScheduler, assembleCueSentences, distributeTranslation,
} = require('../src/browser-translation-scheduler');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');
const integrity = require('../src/browser-translation-integrity');
const endpoints = require('../src/translation-endpoints');

async function run() {
  // ------------------------------------------------------------------
  // Report 62: sentencePartsMatch locale-aware (Türkçe i ↔ İ)
  // ------------------------------------------------------------------
  assert(layout.sentencePartsMatch('İstanbul', ['istanbul']), 'i ↔ İ locale farkı kabul edilmeli');
  assert(layout.sentencePartsMatch('İSTANBUL', ['istanbul']), 'tamamen büyük harf kabul edilmeli');
  assert(!layout.sentencePartsMatch('İstanbul', ['Ankara']), 'farklı şehir adı reddedilmeli');
  assert(layout.sentencePartsMatch('Merhaba dünya', ['Merhaba', 'dünya']), 'boşlukla ayrılan parçalar kabul edilmeli');

  // ------------------------------------------------------------------
  // Report 62: SENTENCE_PROTOCOL_VERSION uyumluluk kümesi
  // ------------------------------------------------------------------
  assert.equal(layout.SENTENCE_PROTOCOL_VERSION, 4, 'JS tarafı v4 olmalı');
  assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(2), 'v2 cache okunabilmeli');
  assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(3), 'Python v3 cache okunabilmeli');
  assert(layout.SUPPORTED_SENTENCE_PROTOCOL_VERSIONS.has(4), 'v4 cache okunabilmeli');

  // ------------------------------------------------------------------
  // Report 62: PersistentTranslationCache flush snapshot race
  // ------------------------------------------------------------------
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cache-'));
  const cacheFile = path.join(tmpDir, 'translation.json');
  try {
    const cache = new PersistentTranslationCache(cacheFile, { minFlushIntervalMs: 1, limit: 1000 });
    await cache.set('key-1', 'val-1');
    const flushPromise = cache.flush();
    // Flush sürerken ekleme yap; sonraki flush yeni değeri içermeli.
    cache.set('key-2', 'val-2');
    await flushPromise;
    await cache.flush();
    const reread = new PersistentTranslationCache(cacheFile, { minFlushIntervalMs: 1, limit: 1000 });
    assert.equal(reread.map.size, 2, 'iki anahtar da kalıcı olmalı');
    assert.equal(reread.map.get('key-1').value, 'val-1');
    assert.equal(reread.map.get('key-2').value, 'val-2');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }

  // ------------------------------------------------------------------
  // Report 62: cancelAll generation'ı artırır (eski start sonuçları düşer)
  // ------------------------------------------------------------------
  let calls = 0;
  const cache = new Map();
  const scheduler = new BrowserTranslationScheduler({
    cache, maxAttempts: 1, maxConcurrent: 1,
    translate: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { text: 'Sonuç', parts: ['Sonuç'] };
    },
  });
  const sentence = assembleCueSentences([
    { id: 'g-1', start: 0, end: 1, text: 'Birinci cümle.' },
    { id: 'g-2', start: 1, end: 2, text: 'İkinci kısım.' },
  ])[0];
  scheduler.setSentences([sentence]);
  scheduler.completeAll();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const generationBeforeCancel = scheduler.generation;
  scheduler.cancelAll('test iptal');
  assert.ok(scheduler.generation > generationBeforeCancel,
    'cancelAll generation artırmalı');
  // Yeniden setSentences ile aynı cümle çevrilebilmeli.
  scheduler.setSentences([sentence]);
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().results.length, 1, 'iptal sonrası yeni çeviri başarılı olmalı');

  // ------------------------------------------------------------------
  // Report 62: core() sıralı stringify (anahtar sırası fark etmemeli)
  // ------------------------------------------------------------------
  // reconcileSentences'a iki kez aynı cümle ver; ikincisinde "changed" 0 olmalı.
  const stable = (s) => ({
    id: s.id, text: s.text, start: s.start, end: s.end,
    pieces: s.pieces.map((p) => ({ cueId: p.cueId, text: p.text })),
  });
  const stableSentence = stable(sentence);
  const reconScheduler = new BrowserTranslationScheduler({
    cache: new Map(), maxAttempts: 1, maxConcurrent: 1, translate: async () => ({ text: 'x', parts: ['x'] }),
  });
  reconScheduler.setSentences([stableSentence]);
  reconScheduler.reconcileSentences([stableSentence]);
  const secondReconcile = reconScheduler.lastReconcile;
  assert.equal(secondReconcile.added, 0, 'aynı cümle eklenmiş sayılmamalı');
  assert.equal(secondReconcile.unchanged, 1, 'aynı cümle değişmeden sayılmalı');

  // ------------------------------------------------------------------
  // Report 62: integrity submittedSentences queued dahil
  // ------------------------------------------------------------------
  const summary = integrity.summarizeTranslationIntegrity({
    sourceCues: [{ id: 'a' }, { id: 'b' }],
    state: { total: 4, completed: 1, pending: 1, queued: 1, failed: 1 },
  });
  assert.equal(summary.submittedSentences, 4,
    'submittedSentences queued dahil 4 olmalıydı');
  assert.equal(summary.status, 'running', 'queued > 0 iken running olmalı');

  // ------------------------------------------------------------------
  // Report 62: 429 failover yalnız sameProviderAliases ile
  // ------------------------------------------------------------------
  assert.equal(endpoints.shouldFailoverTranslationStatus(429), false,
    '429 varsayılan olarak failover edilmemeli');
  assert.equal(endpoints.shouldFailoverTranslationStatus(429, { sameProviderAliases: true }), true,
    '429 sameProviderAliases modunda failover edilmeli');
  assert.equal(endpoints.shouldFailoverTranslationStatus(401), false,
    '401 varsayılan olarak failover edilmemeli');
  assert.equal(endpoints.shouldFailoverTranslationStatus(401, { sameProviderAliases: true }), true,
    '401 sameProviderAliases modunda failover edilmeli');
  assert.equal(endpoints.shouldFailoverTranslationStatus(500), true, '500 hâlâ failover edilmeli');

  // ------------------------------------------------------------------
  // Report 62: distributeTranslation CJK kelime dağılımı
  // ------------------------------------------------------------------
  const cjkSentence = assembleCueSentences([
    { id: 'cjk-1', start: 0, end: 1, text: '一' },
    { id: 'cjk-2', start: 1, end: 2, text: '二' },
  ])[0];
  const cjkReply = { text: '一二三', parts: ['一', '二三'] };
  const cjkCues = distributeTranslation(cjkSentence, cjkReply);
  assert.equal(cjkCues.length, 2, 'CJK parça sayısı korunmalı');
  assert.equal(cjkCues[0].text, '一');
  assert.equal(cjkCues[1].text, '二三');
}

run().then(() => {
  console.log('Rapor 62 regression testleri geçti.');
}).catch((error) => {
  console.error('Rapor 62 regression testleri başarısız:', error);
  process.exitCode = 1;
});
