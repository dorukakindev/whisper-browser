'use strict';

// Çeviri inceleme araçları: model uyum karnesi, yeniden çeviri farkı ve
// "çevrilmemiş satırlar" filtresi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const score = require('../src/translation-model-score.js');
const diff = require('../src/translation-diff.js');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  PASS  ${name}`); };
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');

test('karne model başına son 10 işi tutar, oran ve baskın nedeni raporlar', () => {
  let store = {};
  for (let i = 0; i < 12; i += 1) {
    store = score.recordRun(store, { model: 'Flaky-Model', batches: 4, invalid_batches: 2, rejections: { kimlik_araligi_disinda: 2 } }, i);
  }
  assert.equal(store['flaky-model'].length, score.MAX_RUNS);
  const summary = score.summarize(store, 'FLAKY-model');
  assert.equal(summary.level, 'poor');
  assert.equal(Math.round(summary.ratio * 100), 50);
  assert.match(score.describe(store, 'flaky-model').text, /blok numaralarını kaydırdı/);
  assert.match(score.describe(store, 'flaky-model', 'en').text, /shifted block numbers/);
  store = score.recordRun(store, { model: 'steady', batches: 20, invalid_batches: 0 });
  assert.equal(score.describe(store, 'steady').level, 'good');
  assert.equal(score.describe(store, 'unknown-model').text, '');
  // Bozuk olay (toplu istek yok, zararlı anahtar) karneyi kirletmez.
  const same = score.recordRun(store, { model: 'x', batches: 0 });
  assert.equal(same.x, undefined);
  const safe = score.recordRun({}, { model: 'y', batches: 1, rejections: { '__proto__': 5, 'a b': 1, ok: 1 } });
  assert.deepEqual(Object.keys(safe.y[0].rejections), ['ok']);
});

test('karne renderer ve ayarlar arayüzüne bağlı', () => {
  assert.match(renderer, /case 'translation_quality': \{\s*recordTranslationModelScore\(event\);/);
  assert.match(html, /id="translateModelScore"/);
  assert.ok(html.indexOf('../translation-model-score.js') < html.indexOf('src="renderer.js"'));
});

test('fark zaman örtüşmesiyle eşler, etiket/boşluk farkını değişiklik saymaz', () => {
  const before = [{ start: 0, end: 2, text: 'Merhaba.' }, { start: 3, end: 5, text: 'Nasılsın?' }, { start: 6, end: 8, text: 'İyi.' }];
  const after = [{ start: 0, end: 2, text: 'Selam.' }, { start: 3, end: 5, text: ' Nasılsın? ' }, { start: 6, end: 8, text: '<i>İyi.</i>' }];
  const changes = diff.diffTranslationCues(before, after);
  assert.deepEqual(changes.map((change) => [change.index, change.before, change.after]), [[0, 'Merhaba.', 'Selam.']]);
  assert.deepEqual(diff.revertChanges(after, changes, [0]).map((cue) => cue.text), ['Merhaba.', ' Nasılsın? ', '<i>İyi.</i>']);
  assert.deepEqual(diff.revertChanges(after, changes, []).map((cue) => cue.text), after.map((cue) => cue.text));
});

test('fark penceresi açıldıktan sonra değişen satır geri alma sırasında ezilmez', () => {
  const before = [{ start: 0, end: 2, text: 'Eski çeviri' }];
  const after = [{ start: 0, end: 2, text: 'Yeni çeviri' }];
  const changes = diff.diffTranslationCues(before, after);
  assert.equal(diff.selectedChangesStillMatch(after, changes, [0]), true);
  assert.equal(diff.selectedChangesStillMatch([{ ...after[0], text: 'Kullanıcının son düzenlemesi' }], changes, [0]), false);
  assert.equal(diff.selectedChangesStillMatch([{ ...after[0], start: 1 }], changes, [0]), false);
  const review = diff.fullTranslationDiff(before, after);
  assert.equal(diff.reviewStillApplies(after, review, [0], [], []), true);
  assert.equal(diff.reviewStillApplies([{ ...after[0], text: 'Kullanıcının son düzenlemesi' }], review, [0], [], []), false);
  assert.match(renderer, /if \(!diff\.reviewStillApplies\(current\.cues, review, picks\.changed, picks\.missing, picks\.added\)\)/);
});

test('kuyruk-50/5: eksik/yeni satırlar görünür ve güvenli seçimle uygulanır', () => {
  const before = [{ start: 0, end: 2, text: 'Ahmet geldi.' }, { start: 3, end: 5, text: 'Gitti.' }, { start: 6, end: 8, text: 'Kaldı.' }];
  const after = [{ start: 0, end: 2, text: 'Ahmet gitti.' }, { start: 3, end: 5, text: 'Gitti.' }, { start: 9, end: 11, text: 'Yeni satır.' }];
  const review = diff.fullTranslationDiff(before, after);
  assert.equal(review.changed.length, 1);
  assert.equal(review.missing.length, 1);           // 'Kaldı.' eksik satır
  assert.equal(review.missing[0].text, 'Kaldı.');
  assert.equal(review.added.length, 1);             // 'Yeni satır.' yeni
  assert.equal(review.added[0].index, 2);
  assert.deepEqual(review.changed[0].terms, []);  // 'Ahmet' her iki sürümde de var → terim uyarısı yok
  const applied = diff.applyReviewChoice(after, review, [0], [0], [2]);
  assert.deepEqual(applied.map((c) => [c.start, c.text]),
    [[0, 'Ahmet geldi.'], [3, 'Gitti.'], [6, 'Kaldı.']]);
  // Yuva doluysa eksik geri alımı güvenlikten geçemez.
  const occupied = after.concat([{ start: 6, end: 8, text: 'Kaldı.' }]);
  assert.equal(diff.reviewStillApplies(occupied, review, [], [0], []), false);
  assert.equal(diff.reviewStillApplies(after, review, [], [0], []), true);
  // Eklenen satır artık metni değiştiyse silme uygulanmaz.
  const drifted = after.map((c, i) => (i === 2 ? { ...c, text: 'Değişti' } : c));
  assert.equal(diff.reviewStillApplies(drifted, review, [], [], [2]), false);
});

test('kuyruk-50/5: kelime-diff değişen anlamı satır içinde işaretler', () => {
  const parts = diff.wordParts('Ahmet eve geldi ama geç kaldı', 'Ahmet eve geldi ve erken oturdu');
  assert.deepEqual(parts.before.filter((p) => p.kind === 'del').map((p) => p.text), ['ama geç kaldı']);
  assert.deepEqual(parts.after.filter((p) => p.kind === 'add').map((p) => p.text), ['ve erken oturdu']);
  // Terim uyarısı: eski sürümdeki özel ad yenisinde yoksa işaretlenir.
  assert.deepEqual(diff.changedTerms('Ahmet İstanbul’a gitti', 'Şehre gitti'), ['Ahmet', 'İstanbul’a']);
  assert.deepEqual(diff.changedTerms('Ahmet eve geldi', 'Ahmet eve geldi'), []);
  // Render tarafı bölümleri ve işaretleri kullanır.
  assert.match(renderer, /diff\.fullTranslationDiff\(previousCues, channel\.cues\)/);
  assert.match(renderer, /retranslate-review-\$\{kind\}/);
  assert.match(renderer, /makeRow\('missing', idx\)/);
  assert.match(renderer, /makeRow\('added', item\.index\)/);
  assert.ok(renderer.includes('`diff-${kind}`'));
});

test('yeniden çeviri anlık görüntüsü yalnız yeniden-çeviri işlerine ait', () => {
  // Anlık görüntü "tamamını yenile" VE aralık yeniden çevirisi için korunur;
  // kalan işlerde sıfırlanır (madde 11 — aralık farkı da aynı review'e düşer).
  assert.match(renderer, /if \(!state\.forceRetranslate && !state\.translateCueRange\) state\.retranslateSnapshot = null;/);
  assert.match(renderer, /void openRetranslationReview\(snapshot\.cues\)/);
  assert.match(renderer, /const canRevert = \/\\\.srt\$\/i\.test\(channel\.path\)/, 'VTT/ASS dosyasına SRT yazılmamalı');
});

test('çevrilmemiş satır sezgisi', () => {
  const start = renderer.indexOf('function cueLooksUntranslated(');
  const end = renderer.indexOf('function untranslatedCueBanner(', start);
  const fold = (value) => String(value).replace(/[Iİı]/g, 'i').toLowerCase();
  const foldIx = (value) => ({ dense: fold(value), map: [] });
  const make = (cues2) => new Function('player', 'foldIndex', 'foldIndexCached',
    `${renderer.slice(start, end)}; return cueLooksUntranslated;`)({ cues2 }, foldIx, foldIx);
  const looks = make([{}]);
  assert.equal(looks('Where are you going?', ''), true, 'karşılığı yok');
  assert.equal(looks('Where are you going?', 'Where are you going?'), true, 'kaynak aynen kalmış');
  assert.equal(looks('Where are you going?', '<i>Where are you going</i>'), true, 'etiket/noktalama farkı');
  assert.equal(looks('Where are you going?', 'Nereye gidiyorsun?'), false);
  assert.equal(looks('OK.', 'OK.'), false, 'çok kısa ortak ünlem çevrilmemiş sayılmaz');
  assert.equal(make([])('Hello.', ''), false, 'çeviri yüklü değilse filtre anlamsız');
  assert.match(html, /id="untranslatedOnlyBtn"/);
});

console.log(`translation-review-tools: ${passed} test geçti`);
