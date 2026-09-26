// Sayı kalite kapısı: doğal Türkçe karşılıklar reddedilmemeli, değişen sayılar
// yine yakalanmalı. Aynı korpus backend/test_translation_number_gate.py
// tarafından da okunur; iki uygulama birbirinden ayrışırsa iki test de kırılır.
const assert = require('node:assert/strict');
const { translationBlockingIssues } = require('../src/subtitle-sentence-layout');
const corpus = require('./fixtures/turkish-number-gate.json');

for (const [source, translated] of corpus.accept) {
  assert.deepEqual(translationBlockingIssues(source, translated, 'tr'), [],
    `doğal Türkçe reddedildi: ${source} → ${translated}`);
}
for (const [source, translated] of corpus.reject) {
  assert.ok(translationBlockingIssues(source, translated, 'tr').includes('number_mismatch'),
    `değişen sayı kaçırıldı: ${source} → ${translated}`);
}
// Hedef dil Türkçe değilse Türkçe sayı sözcükleri kanıt sayılmaz.
assert.ok(translationBlockingIssues('Give me 2 or 3 days.', 'iki üç gün', 'de').includes('number_mismatch'));

console.log(`translation-number-gate: ${corpus.accept.length} kabul + ${corpus.reject.length} ret örneği geçti`);
