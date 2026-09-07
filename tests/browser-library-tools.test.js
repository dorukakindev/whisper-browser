const assert = require('assert');
const vm = require('vm');
const {
  ReopenGuard,
  foldLibraryText,
  removeCollection,
  renameCollection,
  resolveMangaPosition,
  resolveTextAnchor,
  selectionAnchorCaptureScript,
  setCollectionMembership,
  textAnchorRestoreScript,
  unifiedLibrarySearch,
  waitForMangaPosition,
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

test('koleksiyon yeniden adlandırma özel sıralamayı yeni ada taşır', () => {
  const [renamed] = renameCollection([{ key: 'a', collections: [' Eski '],
    prefs: { collectionOrder: { Eski: 3, Başka: 1 } } }], 'Eski', 'Yeni');
  assert.deepEqual(renamed.collections, ['Yeni']);
  assert.deepEqual(renamed.prefs.collectionOrder, { Yeni: 3, Başka: 1 });
});

test('koleksiyon sıralama üyelik adını normalize eder', () => {
  const [ordered] = require('../src/browser-library-tools').reorderCollection(
    [{ key: 'a', collections: [' Ders '], prefs: {} }], 'Ders', ['a']);
  assert.equal(ordered.prefs.collectionOrder.Ders, 0);
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

test('HTML ve script görünümlü alıntı kod olarak çalıştırılmadan veri kalır', () => {
  const quote = `</script><img src=x onerror="globalThis.pwned=true">`;
  const block = {
    nodeType: 1, id: 'quote', localName: 'p', parentElement: null,
    textContent: `ön ${quote} son`,
    closest(selector) { return selector.startsWith('input') ? null : this; },
  };
  const context = {
    window: { getSelection: () => ({ rangeCount: 1, isCollapsed: false,
      getRangeAt: () => ({ commonAncestorContainer: block }), toString: () => quote }) },
    document: { documentElement: {}, }, CSS: { escape: (value) => value },
  };
  const result = vm.runInNewContext(selectionAnchorCaptureScript('doc-1'), context);
  assert(result.ok);
  assert.equal(result.anchor.exact, quote);
  assert.equal(context.pwned, undefined);
});

test('iç içe bloklarda en özgül metin düğümü belirsiz sayılmaz', () => {
  const makeElement = (name, text, parent = null) => ({
    localName: name, textContent: text, parentElement: parent, id: '', nodeType: 1,
    style: { setProperty() {}, removeProperty() {} },
    closest: () => null, setAttribute() {}, removeAttribute() {}, scrollIntoView() {},
    contains(other) { for (let node = other; node; node = node.parentElement) if (node === this) return true; return false; },
  });
  const section = makeElement('section', 'ön hedef son');
  const paragraph = makeElement('p', 'ön hedef son', section);
  const context = {
    document: { querySelectorAll: (selector) => selector.includes('data-whisper') ? [] : [section, paragraph] },
    setTimeout() {}, String, Array,
  };
  const result = vm.runInNewContext(textAnchorRestoreScript({ exact: 'hedef', prefix: 'ön ', suffix: ' son' }), context);
  assert.equal(result.status, 'found');
  assert.equal(result.count, 2);
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

(async () => {
  let ready = false;
  let canceled = false;
  let scans = 0;
  const restored = await waitForMangaPosition({
    attempts: 5, delayMs: 0, sleep: async () => {}, isCanceled: () => canceled,
    scan: async () => (++scans >= 3 && ready ? { status: 'found' } : (ready = true, { status: 'pending' })),
  });
  assert.equal(restored.status, 'found');
  assert.equal(restored.attempts, 3, 'tembel görsel ölçülebilir olana dek sınırlı beklemeli');

  scans = 0;
  const stopped = await waitForMangaPosition({
    attempts: 5, delayMs: 0,
    sleep: async () => { canceled = true; },
    isCanceled: () => canceled,
    scan: async () => (++scans, { status: 'pending' }),
  });
  assert.equal(stopped.status, 'canceled');
  assert.equal(scans, 1, 'kullanıcı kaydırınca tekrar konuma zıplamamalı');
  console.log('  PASS  manga konumu tembel yüklemeyi bekler ve kullanıcı kaydırınca iptal olur');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
