const assert = require('assert');
const {
  buildReplacementPlan,
  findLiteralMatches,
  foldSearchText,
  literalRanges,
  replaceLiteralRanges,
} = require('../src/subtitle-find-replace');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

const entries = [
  { field: 'source', channel: 'primary', index: 0, cueId: 'same-a', start: 1, end: 2, text: 'Merhaba dünya.' },
  { field: 'source', channel: 'primary', index: 1, cueId: 'same-b', start: 1, end: 2, text: 'Merhaba yeniden.' },
  { field: 'translation', channel: 'secondary', index: 0, cueId: 'tr-a', start: 1, end: 2, text: 'Hello world.' },
];

test('düz metin araması bütün oluşumları bulur', () => {
  assert.equal(findLiteralMatches(entries, 'Merhaba', { field: 'source' }).length, 2);
});

test('Türkçe büyük küçük harf NFKC fold ile eşleşir', () => {
  assert.equal(literalRanges('İSTANBUL IĞDIR', 'istanbul ığdır').length, 1);
  assert.equal(foldSearchText('İ'), 'i');
});

test('Türkçe ı ve i bul-değiştir sırasında birbirine karışmaz', () => {
  assert.equal(foldSearchText('ılık'), 'ılık');
  assert.equal(foldSearchText('ilik'), 'ilik');
  assert.deepEqual(literalRanges('ılık ilik sık sik', 'ilik'), [{ start: 5, end: 9 }]);
  assert.deepEqual(literalRanges('IĞDIR İzmir', 'ığdır'), [{ start: 0, end: 5 }]);
});

test('özel karakterler regex değil düz metindir', () => {
  assert.equal(literalRanges('a.*b ve a.*b', '.*').length, 2);
});

test('kelime sınırı sözcük içini dışlar', () => {
  assert.equal(literalRanges('ev evren eve', 'ev', { wholeWord: true }).length, 1);
});

test('büyük küçük harf duyarlı arama ayrım yapar', () => {
  assert.equal(literalRanges('Test test', 'Test', { caseSensitive: true }).length, 1);
});

test('aynı zaman kodlu cue kimlikleri ayrı kalır', () => {
  const found = findLiteralMatches(entries, 'Merhaba', { field: 'source' });
  assert.equal(new Set(found.map((item) => item.id)).size, 2);
  assert.deepEqual(found.map((item) => item.cueId), ['same-a', 'same-b']);
});

test('alan filtresi yalnız kaynağı seçer', () => {
  assert(findLiteralMatches(entries, 'Hello', { field: 'source' }).length === 0);
});

test('alan filtresi yalnız çeviriyi seçer', () => {
  assert(findLiteralMatches(entries, 'Hello', { field: 'translation' }).length === 1);
});

test('her iki alan birlikte aranır', () => {
  assert.equal(findLiteralMatches(entries, 'world', { field: 'both' }).length, 1);
});

test('tek eşleşme değiştirilir', () => {
  const found = findLiteralMatches(entries, 'Merhaba', { field: 'source' });
  const plan = buildReplacementPlan(found, new Set([found[0].id]), 'Selam');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].after, 'Selam dünya.');
});

test('seçili eşleşmeler ayrı cue işlemlerine dönüşür', () => {
  const found = findLiteralMatches(entries, 'Merhaba', { field: 'source' });
  const plan = buildReplacementPlan(found, new Set(found.map((item) => item.id)), 'Selam');
  assert.deepEqual(plan.map((item) => item.after), ['Selam dünya.', 'Selam yeniden.']);
});

test('aynı cue içindeki tüm oluşumlar tek işlem olur', () => {
  const list = [{ field: 'source', channel: 'primary', index: 0, text: 'x x x' }];
  const found = findLiteralMatches(list, 'x', { field: 'source' });
  const plan = buildReplacementPlan(found, new Set(found.map((item) => item.id)), 'y');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].after, 'y y y');
  assert.equal(plan[0].matchCount, 3);
});

test('no-op değişiklik plan üretmez', () => {
  const found = findLiteralMatches(entries, 'Merhaba', { field: 'source' });
  assert.equal(buildReplacementPlan(found, new Set([found[0].id]), 'Merhaba').length, 0);
});

test('boş string bilinçli değiştirme olarak korunur', () => {
  const found = findLiteralMatches(entries, 'Merhaba ', { field: 'source' });
  const plan = buildReplacementPlan(found, new Set([found[0].id]), '');
  assert.equal(plan[0].after, 'dünya.');
});

test('Unicode normalize eşleşmesi özgün aralığı güvenle değiştirir', () => {
  const text = 'ＡＢＣ sonra';
  const ranges = literalRanges(text, 'ABC');
  assert.equal(replaceLiteralRanges(text, ranges, 'XYZ'), 'XYZ sonra');
});

test('örtüşen aralıklar iki kez değiştirilmez', () => {
  assert.equal(replaceLiteralRanges('abcd', [{ start: 0, end: 3 }, { start: 1, end: 4 }], 'x'), 'ax');
});

test('boş sorgu eşleşme üretmez', () => {
  assert.deepEqual(findLiteralMatches(entries, '', { field: 'both' }), []);
});

console.log(`subtitle-find-replace: ${passed} test`);
