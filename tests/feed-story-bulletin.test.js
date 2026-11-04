// V3-T05/T06 — kopya ≠ konu grubu, bağımsız yayıncı sayısı, kapsam makbuzu, okundu ayrımı.
const assert = require('node:assert');
const S = require('../src/feed-story-identity.js');
const B = require('../src/cinema-bulletin-model.js');

// 1) URL kimliği: izleme parametreleri, parça, www, sondaki /
{
  assert.strictEqual(S.canonicalizeUrl('https://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag'), 'example.com/a/b?a=1&b=2');
  assert.strictEqual(S.canonicalizeUrl('http://example.com/a/b'), S.canonicalizeUrl('https://example.com/a/b/'));
  assert.strictEqual(S.canonicalizeUrl('javascript:alert(1)'), null); assert.strictEqual(S.canonicalizeUrl('çöp'), null);
}
// 2) Aynı haberin kopyası iki bağımsız kanıt değildir; aynı konudaki ayrı yazı ayrı hikâye
{
  const entries = [
    { guid: '1', publisherId: 'p1', url: 'https://p1.example/a?utm_source=rss', title: 'Parasite wins at Cannes', summary: 'The film took the top prize at the festival ceremony tonight in a historic vote, the jury president said afterwards.', workId: 'w1' },
    { guid: '2', publisherId: 'p2', url: 'https://p2.example/copy', title: 'Parasite wins at Cannes', summary: 'The film took the top prize at the festival ceremony tonight in a historic vote, the jury president said afterwards.', workId: 'w1' },
    { guid: '3', publisherId: 'p3', url: 'https://p3.example/essay', title: 'Why Parasite deserved the Palme', summary: 'An essay on class and staging.', workId: 'w1', stance: 'positive' },
    { guid: '4', publisherId: 'p4', url: 'https://p4.example/pan', title: 'Parasite is overrated', summary: 'A dissent.', workId: 'w1', stance: 'negative' },
    { guid: '5', publisherId: 'p1', url: 'https://p1.example/a', title: 'Parasite wins at Cannes (duplicate url)', summary: '' },
  ];
  for (const entry of entries) { entry.contentScope='feed-full'; entry.text=entry.summary; }
  const topics = S.groupStories(entries);
  assert.strictEqual(topics.length, 1, 'aynı workId → tek konu grubu');
  const t = topics[0];
  assert.strictEqual(t.stories.length, 3, 'p1+p2+kopya url = tek hikâye; essay ve dissent ayrı');
  const news = t.stories.find((s) => s.copies >= 2); assert.strictEqual(news.copies, 3); assert.strictEqual(news.publishers.length, 2);
  assert.strictEqual(t.independentPublishers, 4); assert.strictEqual(t.totalCopies, 5);
  assert.strictEqual(t.opposingStances, true); assert.deepStrictEqual(t.stances.sort(), ['negative', 'positive'], 'zıt görüş yalnız veriden');
}
// 3) Konu benzerliği eşiği; ilişkisiz yazılar karışmaz
{
  const t = S.groupStories([
    { guid: 'a', publisherId: 'p1', url: 'https://x.example/1', title: 'Cannes jury announces lineup', summary: 'Competition lineup announced today' },
    { guid: 'b', publisherId: 'p2', url: 'https://y.example/2', title: 'Cannes jury lineup announced', summary: 'Competition lineup today' },
    { guid: 'c', publisherId: 'p3', url: 'https://z.example/3', title: 'Bake sale results', summary: 'Local charity' },
  ]);
  assert.strictEqual(t.length, 2); assert.strictEqual(t.find((x) => x.stories.length === 2).independentPublishers, 2);
}
// 4) Kapsam: 304 yeni item değil ama kontrol edilmiş; 403/429 boş başarı değil; denenmeyen kalan sayılır
{
  const c = B.summarizeCoverage([
    { feedId: 'f1', status: 'ok', newItems: 3 }, { feedId: 'f2', status: 'not-modified', newItems: 9 }, { feedId: 'f3', status: 'forbidden' },
    { feedId: 'f4', status: 'rate-limited', retryAfterSeconds: 60 }, { feedId: 'f5', status: 'WAT' },
  ], ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  assert.strictEqual(c.checkedFeeds, 2); assert.strictEqual(c.remainingFeeds, 4); assert.strictEqual(c.complete, false);
  assert.strictEqual(c.rows.find((r) => r.feedId === 'f2').newItems, 0, '304: yeni item sayılmaz');
  assert.deepStrictEqual(c.remaining.map((r) => [r.feedId, r.status]), [['f3', 'forbidden'], ['f4', 'rate-limited'], ['f5', 'not-attempted'], ['f6', 'not-attempted']]);
  assert.strictEqual(c.rows.find((r) => r.feedId === 'f4').retryAfterSeconds, 60);
  assert.strictEqual(B.summarizeCoverage([{ feedId: 'f1', status: 'not-modified' }], ['f1']).complete, true);
}
// 5) Kütüphaneye bağlama: onaylı > aday > belirsiz; bülten donmuş, okundu ayrı
{
  const lib = [{ workId: 'w1', title: 'Parasite', aliases: ['Gisaengchung'] }, { workId: 'w2', title: 'Parasite 2' }];
  assert.strictEqual(B.linkEntryToLibrary({ workId: 'w1', title: 'x' }, lib).confidence, 'confirmed');
  assert.strictEqual(B.linkEntryToLibrary({ title: 'Gisaengchung review' }, lib).confidence, 'candidate');
  assert.strictEqual(B.linkEntryToLibrary({ title: 'Parasite 2 trailer' }, lib).confidence, 'ambiguous', 'iki başlık aynı metinde → belirsiz (remake/devam)');
  assert.strictEqual(B.linkEntryToLibrary({ title: 'Unrelated' }, lib).confidence, 'unknown');
  const bulletin = B.buildBulletin({
    entries: [{ guid: '1', publisherId: 'p1', url: 'https://a.example/1', title: 'Gisaengchung review', summary: 'x', entryId: 'e1' }, { guid: '2', publisherId: 'p2', url: 'https://a.example/2', title: 'Unrelated news', summary: 'y', entryId: 'e2' }],
    library: lib, feedResults: [{ feedId: 'f1', status: 'ok', newItems: 2 }], allFeedIds: ['f1', 'f2'], readState: { e1: true }, capturedAt: '2026-11-03T10:00:00Z',
  });
  assert.ok(Object.isFrozen(bulletin) && Object.isFrozen(bulletin.sections[0]));
  assert.strictEqual(bulletin.sections.length, 1); assert.strictEqual(bulletin.sections[0].linkConfidence, 'candidate'); assert.strictEqual(bulletin.sections[0].topics[0].read, true);
  assert.strictEqual(bulletin.unlinked.length, 1); assert.strictEqual(bulletin.coverage.complete, false);
  assert.ok(!('liked' in bulletin.sections[0].topics[0]) && !('watched' in bulletin.sections[0]), 'okundu ≠ beğenildi ≠ izlendi');
  assert.strictEqual(bulletin.schema, 'cinema-bulletin-v1');
}
console.log('feed-story-bulletin.test.js: OK');
