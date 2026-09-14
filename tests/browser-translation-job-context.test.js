'use strict';
const assert = require('node:assert/strict');
const { BrowserTranslationScheduler, assembleCueSentences, translationCacheKey } = require('../src/browser-translation-scheduler');
const tick = () => new Promise(resolve => setImmediate(resolve));
const [sentence] = assembleCueSentences([{ id: 'one', start: 0, end: 2, text: 'Captain, wait.' }]);

async function main() {
  for (const asyncFailure of [false, true]) {
    let calls = 0;
    const scheduler = new BrowserTranslationScheduler({ maxAttempts: 1,
      cache: { get: () => { if (asyncFailure) return Promise.reject(Error('cache unavailable')); throw Error('cache unavailable'); }, set() {} },
      translate: async () => { calls++; return 'Kaptan, bekleyin.'; } });
    scheduler.setSentences([sentence]); scheduler.completeAll(); await scheduler.whenIdle();
    assert.equal(calls, 1); assert.equal(scheduler.snapshot().completed, 1); assert.equal(scheduler.snapshot().failures.length, 0);
  }
  let releaseRead, calledContext;
  const writes = new Map();
  const before = { targetLanguage: 'tr', terminologyVersion: 'one', terminologyText: 'Captain=Kaptan' };
  const after = { targetLanguage: 'tr', terminologyVersion: 'two', terminologyText: 'Captain=Komutan' };
  const scheduler = new BrowserTranslationScheduler({ context: before,
    cache: { get: () => new Promise(resolve => { releaseRead = resolve; }), set: (key, value) => writes.set(key, value) },
    translate: async (_, context) => { calledContext = context; return context.terminologyText === before.terminologyText ? 'Kaptan, bekleyin.' : 'Komutan, bekleyin.'; } });
  scheduler.setSentences([sentence]); scheduler.completeAll(); await tick();
  scheduler.setContext(after); releaseRead(undefined); await scheduler.whenIdle();
  assert.equal(calledContext.terminologyVersion, before.terminologyVersion);
  assert.equal(calledContext.terminologyText, before.terminologyText);
  assert(writes.has(translationCacheKey(sentence, before))); assert(!writes.has(translationCacheKey(sentence, after)));
  assert.match(writes.get(translationCacheKey(sentence, before)), /Kaptan/);
  assert.notEqual(translationCacheKey(sentence, before), translationCacheKey(sentence, { ...before, terminologyText: after.terminologyText }));

  let calls = 0;
  const canceled = new BrowserTranslationScheduler({ translate: async () => { calls++; return 'Kaptan.'; } });
  const controller = new AbortController();
  const pending = canceled.translateShared(sentence, 'key', controller);
  controller.abort('Kaynak değişti.');
  await assert.rejects(pending, /iptal/); assert.equal(calls, 0, 'A microtask-delayed provider call must honor cancellation');
  assert.equal(canceled.inFlightByCacheKey.size, 0);
  console.log('browser translation: cache read fallback, immutable job context/key, terminology identity and pre-dispatch cancellation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
