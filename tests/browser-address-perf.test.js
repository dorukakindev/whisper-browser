// R327: adres çubuğu arama performans ratchet'i + önbellek doğruluğu.
// B-327-01: buildAddressResults ve inlineCompletion kayıt başına
// foldSearchIndex/strip'i tuş vuruşu başına yeniden hesaplıyordu — 50k
// geçmişte tuş başına ~207ms. places nesneleri kalıcı olduğundan WeakMap
// önbelleği ile ~6ms'e indi. Bu test önbelleğin doğru sonuç ürettiğini ve
// tekrarlanan sorguların ölçülü bütçede kaldığını kilitler.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAddressResults, inlineCompletion } = require('../src/browser-address-model');

function place(i, over = {}) {
  return {
    url: `https://site${i}.example.com/page/${i}`,
    title: `Sayfa ${i} başlık örnek türkçe ${over.suffix || ''}`.trim(),
    visitedAt: Date.now() - i * 60000,
    visitCount: (i % 40) + 1,
    ...over.extra,
  };
}

function placesOf(n) {
  return {
    history: Array.from({ length: n }, (_, i) => place(i)),
    bookmarks: Array.from({ length: Math.floor(n / 10) }, (_, i) => place(i, { extra: { bookmark: true } })),
  };
}

function sectionUrls(results, section) {
  return results.filter((r) => r.section === section).map((r) => r.url);
}

test('önbellekli eşleşme sonuçları doğru (geçmiş + yer imi)', () => {
  const places = placesOf(200);
  const warm = buildAddressResults({ query: 'site7', places, tabs: [], faviconFor: () => null });
  const again = buildAddressResults({ query: 'site7', places, tabs: [], faviconFor: () => null });
  assert.deepEqual(again, warm);
  const hits = sectionUrls(again, 'history').concat(sectionUrls(again, 'bookmarks'));
  assert.ok(hits.length > 0, 'eşleşme bulunmalı');
  for (const url of hits) assert.match(url, /site7/);
});

test('places nesnesi yenilenince önbellek bayat sonuç vermez', () => {
  const old = placesOf(20);
  buildAddressResults({ query: 'sayfa', places: old, tabs: [], faviconFor: () => null });
  const renamed = {
    history: old.history.map((item, i) => (i === 0 ? { ...item, title: 'zilberx yeni başlık' } : item)),
    bookmarks: old.bookmarks,
  };
  const res = buildAddressResults({ query: 'zilberx', places: renamed, tabs: [], faviconFor: () => null });
  assert.ok(sectionUrls(res, 'history').some((u) => /site0/.test(u)), 'yeni başlık eşleşmeli');
});

test('inlineCompletion doğru adayı önerir (önbellekli yol)', () => {
  const items = [place(1, { extra: {} }), place(2), place(3)].map((p, i) => ({ ...p, url: `https://github.com/x${i}` }));
  const first = inlineCompletion('git', items);
  const second = inlineCompletion('git', items);
  assert.deepEqual(second, first);
  assert.ok(first && /github\.com/.test(first.text));
});

test('50k geçmiş: ısınma sonrası tuş vuruşu bütçesi (<60ms ortalama)', () => {
  const places = placesOf(50000);
  // Isınma: ilk sorgu önbelleği doldurur (tek seferlik maliyet).
  buildAddressResults({ query: 'site', places, tabs: [], faviconFor: () => null });
  const t0 = Date.now();
  for (let k = 0; k < 20; k += 1) {
    buildAddressResults({ query: `sayfa ${k}`, places, tabs: [], faviconFor: () => null });
  }
  const avg = (Date.now() - t0) / 20;
  assert.ok(avg < 60, `tuş vuruşu ortalaması bütçeyi aştı: ${avg.toFixed(1)}ms (B-327-01 öncesi ~207ms)`);
  const t1 = Date.now();
  for (let k = 0; k < 20; k += 1) inlineCompletion('sit', places.history);
  const avg2 = (Date.now() - t1) / 20;
  assert.ok(avg2 < 60, `inlineCompletion ortalaması bütçeyi aştı: ${avg2.toFixed(1)}ms`);
});

test('R327-1 ratchet: kaynak kilidi — tuş vuruşu yolunda foldSearchIndex yineleme yok', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'browser-address-model.js'), 'utf8');
  const matchBody = src.slice(src.indexOf('const match = (item) =>'), src.indexOf('const match = (item) =>') + 400);
  assert.match(matchBody, /placeSearchIndexOf/, 'match önbellekli dizin kullanmalı');
  assert.doesNotMatch(matchBody, /foldSearchIndex\(/, 'match içinde ham foldSearchIndex çağrısı olmamalı');
  const inlineBody = src.slice(src.indexOf('function inlineCompletion'), src.indexOf('function inlineCompletion') + 1600);
  assert.match(inlineBody, /placeSearchIndexOf/, 'inlineCompletion önbellekli dizin kullanmalı');
});
