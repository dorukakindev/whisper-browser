'use strict';
// R221 sözleşmeleri: kısa çevirinin tek balona birleşmesi (coveredCueIds),
// birleşen cue'nun bütünlük sayımında "tamamlandı" işaretlenmesi ve kesin
// hataların paylaşılan devre kesicisiyle fırtına üretmeden durması.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { summarizeTranslationIntegrity } = require('../src/browser-translation-integrity');

const file = path.resolve(__dirname, '../src/browser-translation-scheduler.js');
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  module: mod, exports: mod.exports, require: createRequire(file),
  AbortController, Date, setTimeout, clearTimeout,
});
const { BrowserTranslationScheduler, distributeTranslation, isDefinitiveTranslateError } = mod.exports;

const sentence = {
  id: 's1', start: 0, end: 4, text: "I don't know.",
  pieces: [
    { cueId: 'a', start: 0, end: 2, text: "I don't" },
    { cueId: 'b', start: 2, end: 4, text: 'know.' },
  ],
};

// 1) Model iki cue'lu cümleyi tek kelimeye indirdiğinde dağıtıcı parça
//    üretemez → tek birleşik balon, iki cue kimliği de kapsanır.
const mergedPlain = distributeTranslation(sentence, 'Bilmiyorum.');
assert.equal(mergedPlain.length, 1, 'Tek kelimelik çeviri tek cue üretmeli');
assert.equal(mergedPlain[0].text, 'Bilmiyorum.');
assert.equal(mergedPlain[0].end, 4, 'Birleşik cue son cue bitişine uzanır');
assert.deepEqual(mergedPlain[0].coveredCueIds, ['a', 'b']);

// 2) Modelin açık merged işareti de aynı yolu kullanır.
const mergedFlag = distributeTranslation(sentence, '{"text":"Bilmiyorum.","merged":true}');
assert.equal(mergedFlag.length, 1);
assert.deepEqual(mergedFlag[0].coveredCueIds, ['a', 'b']);

// 3) Birleşen cue'nun kapsadığı kaynak kimlikleri bütünlük sayımında
//    tamamlandı sayılır — ikinci cue "eksik" kalmaz, durum "kısmi" donmaz.
//    translationResults sözleşmesi (main.js:8517): cueId → cue satırı;
//    birleşik cue coveredCueIds ile ikinci kimliği de kapsar.
const integrity = summarizeTranslationIntegrity({
  sourceCues: [{ id: 'a', text: "I don't" }, { id: 'b', text: 'know.' }],
  results: new Map(mergedPlain.map((cue) => [String(cue.cueId), cue])),
  state: { total: 1, completed: 1, queued: [], pending: [], failures: [] },
});
assert.equal(integrity.status, 'complete', `merged cue iki kaynağı da kapsamalı (${integrity.status})`);
assert.deepEqual(integrity.missingCueIds, []);

// 4) Kesin hata sınıflandırması — aynı girdiyle düzelmeyecek hatalar.
assert.equal(isDefinitiveTranslateError(Object.assign(new Error('x'), { code: 'PARTS_MISMATCH' })), true);
assert.equal(isDefinitiveTranslateError(Object.assign(new Error('x'), { code: 'PARTS_MISSING' })), true);
assert.equal(isDefinitiveTranslateError(new Error('content_filter triggered')), true);
assert.equal(isDefinitiveTranslateError(Object.assign(new Error('500'), { httpStatus: 500 })), false);
assert.equal(isDefinitiveTranslateError(Object.assign(new Error('net'), { transportError: true })), false);

// 5) Ard arda kesin hata → paylaşılan devre kesici; her cümle için
//    maxAttempts yanmaz, kuyruk eşik sonrası durur.
(async () => {
  let calls = 0;
  const scheduler = new BrowserTranslationScheduler({
    maxAttempts: 3, providerFailureThreshold: 3, retryBaseMs: 10, retryMaxMs: 20,
    lookBehind: 100, lookAhead: 100, maxConcurrent: 1,
    translate: async () => {
      calls += 1;
      const error = new Error('Çeviri parçaları tam cümleyle eşleşmiyor');
      error.code = 'PARTS_MISMATCH';
      throw error;
    },
  });
  const sentences = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `s${i}`, start: i * 10, end: i * 10 + 9, text: `Line ${i}`,
    pieces: [{ cueId: `c${i}`, start: i * 10, end: i * 10 + 9, text: `Line ${i}` }],
  }));
  scheduler.setSentences(sentences);
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(calls, 3, `Kesici 3. kesin hatada devreye girmeli; ${calls} istek gitti`);
  assert.ok(scheduler.providerFailure, 'Kesici devreye girince providerFailure dolmalı');
  assert.ok(scheduler.providerFailure.includes('kesin hata'), 'Kesici mesajı kesin-hata sınıfını bildirmeli');

  // Kesici, hiç denenmemiş cümleleri "kesin hata" olarak değil
  // sağlayıcı-kesici kategorisinde işaretler.
  const snapshot = scheduler.snapshot();
  assert.equal(snapshot.results.length, 0);

  // Geçici hata kesici sayacını sıfırlar: karışık dizide fırtına yok.
  calls = 0;
  const mixed = new BrowserTranslationScheduler({
    maxAttempts: 2, providerFailureThreshold: 4, retryBaseMs: 10, retryMaxMs: 20,
    lookBehind: 100, lookAhead: 100, maxConcurrent: 1,
    translate: async (payload) => {
      calls += 1;
      const source = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
      if (source.includes('Line 1')) return 'Geçti 1';
      const error = new Error('moderation flagged');
      throw error;
    },
  });
  const mixSentences = [0, 1, 2, 3].map((i) => ({
    id: `m${i}`, start: i * 10, end: i * 10 + 9, text: `Line ${i}`,
    pieces: [{ cueId: `x${i}`, start: i * 10, end: i * 10 + 9, text: `Line ${i}` }],
  }));
  mixed.setSentences(mixSentences);
  mixed.completeAll();
  await mixed.whenIdle();
  // m0,m2,m3 definitive (3 istek) + m1 başarı (1 istek) = 4;
  // başarı definitive sayacını sıfırladığı için kesici hiç ateşlenmez.
  assert.equal(calls, 4, `Başarı sayacı sıfırlar; ${calls} istek`);
  assert.equal(mixed.providerFailure, '', 'Araya giren başarı kesiciyi ateşlememeli');
  assert.equal(mixed.snapshot().results.length, 1);

  console.log('browser-translation-merged: tek-balon birleşimi, coveredCueIds bütünlüğü, definitive-kesici sözleşmeleri geçti');
})().catch((error) => { console.error(error); process.exitCode = 1; });
