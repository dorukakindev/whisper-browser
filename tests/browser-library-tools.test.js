const assert = require('assert');
const {
  ReopenGuard,
  foldLibraryText,
  removeCollection,
  renameCollection,
  resolveMangaPosition,
  resolveTextAnchor,
  setCollectionMembership,
  unifiedLibrarySearch,
} = require('../src/browser-library-tools');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

test('Türkçe Unicode araması NFKC ve Türkçe harf katlaması kullanır', () => {
  assert.equal(foldLibraryText('IŞIK İZMİR'), 'ışık izmir');
});

test('birleşik arama açık sekme, yer imi, kaynak ve çeviri izlerini ayırır', () => {
  const results = unifiedLibrarySearch({
    query: 'ışık', scope: 'all', tabs: [{ id: 't1', title: 'IŞIK dersi', url: 'https://example.test' }],
    bookmarks: [{ title: 'Işık arşivi', url: 'https://bookmark.test' }],
    cueHits: [
      { media_id: 'm1', track_id: 's', cue_id: 'same', start: 5, title: 'Film', source_text: 'IŞIK', role: 'source', language: 'en' },
      { media_id: 'm1', track_id: 'tr', cue_id: 'same', start: 5, title: 'Film', translation_text: 'ışık', role: 'translation', language: 'tr', model: 'gemini', provider: 'https://api.test' },
    ],
  });
  assert(results.some((item) => item.kind === 'tabs'));
  assert(results.some((item) => item.kind === 'bookmarks'));
  const cues = results.filter((item) => item.kind === 'subtitles');
  assert.equal(cues.length, 2, 'aynı zaman ve cue kimliği farklı izleri karıştırmamalı');
  assert(cues.some((item) => item.role === 'translation' && item.model === 'gemini'));
});

test('koleksiyon silme içerik ve altyazı alanlarını korur', () => {
  const source = [{ key: 'm1', collections: ['Ders'], subtitlePaths: ['a.srt'], title: 'Video' }];
  const removed = removeCollection(source, 'Ders');
  assert.deepEqual(removed[0].collections, []);
  assert.deepEqual(removed[0].subtitlePaths, ['a.srt']);
  assert.equal(removed[0].title, 'Video');
});

test('koleksiyon yeniden adlandırma ve toplu üyelik yinelenmez', () => {
  let items = [{ key: 'a', collections: ['Eski'] }, { key: 'b', collections: [] }];
  items = renameCollection(items, 'Eski', 'Yeni');
  items = setCollectionMembership(items, ['a', 'b'], 'Yeni', true);
  assert.deepEqual(items.map((item) => item.collections), [['Yeni'], ['Yeni']]);
});

test('tekrarlanan alıntı bağlam eşitken belirsiz raporlanır', () => {
  const result = resolveTextAnchor({ exact: 'aynı söz' }, [
    { text: 'Burada aynı söz var.' }, { text: 'Başka yerde aynı söz var.' },
  ]);
  assert.equal(result.status, 'ambiguous');
});

test('paragraf araya eklense de prefix ve suffix bağlamı doğru alıntıyı bulur', () => {
  const result = resolveTextAnchor({ exact: 'hedef', prefix: 'ön ', suffix: ' son' }, [
    { id: 'new', text: 'Yeni paragraf.' }, { id: 'old', text: 'ön hedef son' },
  ]);
  assert.equal(result.status, 'found');
  assert.equal(result.match.id, 'old');
});

test('kayıp alıntı notu silmek yerine missing döndürür', () => {
  const result = resolveTextAnchor({ exact: 'kaybolan alıntı' }, [{ text: 'Başka metin' }]);
  assert.equal(result.status, 'missing');
});

test('manga konumu yanlış belgede ve kayıp görselde güvenli sonuç verir', () => {
  const saved = { documentId: 'chapter-a', imageId: 'img-2', ratio: .4, ordinal: 1 };
  assert.equal(resolveMangaPosition(saved, [], 'chapter-b').status, 'wrong-document');
  assert.equal(resolveMangaPosition(saved, [], 'chapter-a').status, 'missing');
  const result = resolveMangaPosition(saved, [{ id: 'img-1' }, { id: 'img-2' }], 'chapter-a');
  assert.equal(result.status, 'found');
  assert.equal(result.ratio, .4);
});

test('yeniden açma bileti navigasyon veya medya değişince geçersizleşir', () => {
  const guard = new ReopenGuard();
  const ticket = guard.begin({ tabId: 'a', mediaId: 'm1', generation: 2 });
  assert(guard.current(ticket, { tabId: 'a', mediaId: 'm1', generation: 2 }));
  assert(!guard.current(ticket, { tabId: 'a', mediaId: 'm2', generation: 2 }), 'yanlış medyada seek yapılmamalı');
  guard.cancel();
  assert(!guard.current(ticket, { tabId: 'a', mediaId: 'm1', generation: 2 }), 'navigasyon bekleyen yeniden açmayı iptal etmeli');
});

console.log(`browser-library-tools: ${passed} test`);
