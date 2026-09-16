'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyTranslationHttpFailure } = require('../src/browser-translation-provider-error');
const { BrowserTranslationScheduler } = require('../src/browser-translation-scheduler');

(async () => {
  assert.deepEqual(classifyTranslationHttpFailure(503,
    'No available channel for model gpt-5.4 under group gemini-cli'),
  { retryable: false, providerUnavailable: true });
  assert.deepEqual(classifyTranslationHttpFailure(503, 'Temporary overload'),
    { retryable: true, providerUnavailable: false });
  assert.equal(classifyTranslationHttpFailure(429, '').retryable, true);
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /Object\.assign\(error, classifyTranslationHttpFailure\(error\.httpStatus, detail\)\)/);

  let unavailable = true;
  const calls = [];
  const errors = [];
  const scheduler = new BrowserTranslationScheduler({
    maxConcurrent: 2, maxAttempts: 3,
    translate: async (sentence) => {
      calls.push(sentence.id);
      if (unavailable) {
        const error = new Error('Model için kullanılabilir kanal yok.');
        error.retryable = false;
        error.providerUnavailable = true;
        throw error;
      }
      return { text: `TR ${sentence.text}` };
    },
    onResult: (result) => { if (result.error) errors.push(result); },
  });
  const sentences = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), start: index * 2, end: index * 2 + 1,
    text: `Cue ${index}.`,
    pieces: [{ cueId: String(index), start: index * 2, end: index * 2 + 1,
      text: `Cue ${index}.` }],
  }));
  scheduler.setSentences(sentences);
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.ok(calls.length <= 2, 'kanal yokken tüm cue listesi sağlayıcıya gönderildi');
  assert.equal(errors.length, 1, 'tek kök hata için hata günlüğü tekrarlandı');
  assert.equal(scheduler.recoverySummary().failed, 12);
  scheduler.reconcileSentences([...sentences, { ...sentences[0], id: 'new',
    pieces: [{ ...sentences[0].pieces[0], cueId: 'new' }] }]);
  await scheduler.whenIdle();
  assert.ok(calls.length <= 2, 'kaynak yenilenince açık devre tekrar istek gönderdi');
  unavailable = false;
  assert.equal(scheduler.retryFailed(), 13);
  await scheduler.whenIdle();
  assert.equal(scheduler.recoverySummary().completed, 13);
  console.log('Çeviri sağlayıcısı: model kanalı yoksa devre kesici, yenileme ve manuel kurtarma geçti.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
