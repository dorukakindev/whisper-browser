// V3-T02 — dil/ülke/yönetmen koşulları; unknown ve provider-truncated açık.
const assert = require('node:assert');
const C = require('../src/catalog-conditions.js');

const films = [
  { itemId: 'f1', originalLanguage: 'ja', productionCountries: ['JP'], crew: [{ personId: 'p1', job: 'Director' }] },
  { itemId: 'f2', originalLanguage: 'fr', productionCountries: ['FR', 'BE'], crew: [{ personId: 'p2', job: 'Director' }, { personId: 'p1', job: 'Producer' }] },
  { itemId: 'f3', originalLanguage: null, productionCountries: null, crew: null },
  { itemId: 'f4', originalLanguage: 'en', productionCountries: ['JP'], audioLanguage: 'tr', crew: [{ personId: 'p3', job: 'Director' }], crewTruncated: true },
];
const ids = (a) => a.map((x) => x.itemId);

// 1) Dil ve ülke ayrı alanlar: Japon yapımı ≠ Japonca film
{
  assert.deepStrictEqual(ids(C.filterByConditions(films, { originalLanguages: ['ja'] }).matches), ['f1']);
  assert.deepStrictEqual(ids(C.filterByConditions(films, { productionCountries: ['JP'] }).matches), ['f1', 'f4'], 'f4: İngilizce ama Japon yapımı');
  assert.deepStrictEqual(ids(C.filterByConditions(films, { originalLanguages: ['ja'], productionCountries: ['JP'] }).matches), ['f1']);
}
// 2) Bilinmeyen alan eşleşme sayılmaz, 'unknown' kovasına gider
{
  const r = C.filterByConditions(films, { originalLanguages: ['fr'] });
  assert.deepStrictEqual(ids(r.matches), ['f2']); assert.deepStrictEqual(ids(r.unknown), ['f3']); assert.ok(r.scopeNotes.includes('unknown-metadata')); assert.strictEqual(r.complete, false);
}
// 3) Yönetmen: yalnız Director işi; yapımcı kredisi eşleşmez; kırpılmış ekip "yok" kanıtı değildir
{
  assert.deepStrictEqual(ids(C.filterByConditions(films, { directorIds: ['p1'] }).matches), ['f1'], 'f2 p1 yapımcı');
  const r = C.filterByConditions(films, { directorIds: ['p1'] });
  assert.deepStrictEqual(ids(r.unknown).sort(), ['f3', 'f4'], 'f3 ekip yok; f4 kırpılmış → bilinmiyor');
  assert.ok(r.scopeNotes.includes('provider-truncated'));
}
// 4) Kişi filmografisi: oyunculuk Director rotasında yok; kırpılmış liste tam değil
{
  const credits = [{ personId: 'p1', job: 'Director', itemId: 'a' }, { personId: 'p1', job: 'Actor', itemId: 'b' }, { personId: 'p9', job: 'Director', itemId: 'c' }];
  const r = C.directorRoute(credits, 'p1', { truncated: true });
  assert.deepStrictEqual(r.items.map((x) => x.itemId), ['a']); assert.strictEqual(r.complete, false); assert.strictEqual(r.note, 'provider-truncated'); assert.strictEqual(r.actingExcluded, true);
  assert.strictEqual(C.directorRoute(credits, 'p1').complete, true);
}
// 5) Dublaj ses dili özgün dil değil
{
  const f = C.normalizeCatalogFacts(films[3]); assert.strictEqual(C.isDubbed(f), true); assert.strictEqual(C.isDubbed(C.normalizeCatalogFacts(films[0])), false);
  assert.strictEqual(C.normalizeCatalogFacts({ originalLanguage: 'en-US' }).originalLanguage, 'en');
  assert.strictEqual(C.normalizeCatalogFacts({ productionCountries: ['xx1', 'tr'] }).productionCountries[0], 'TR');
}
console.log('catalog-conditions.test.js: OK');
