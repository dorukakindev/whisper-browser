const assert = require('node:assert/strict');
const {
  youtubeVideoId, hashPrefix, normalizeCategories, extractHashSegments, validateSegments,
  validateChapters, splitSponsorActions, clampSegmentsToDuration, SponsorBlockCache,
} = require('../src/browser-sponsorblock');

let passed = 0;
function test(name, fn) {
  fn(); passed += 1; console.log(`  PASS  ${name}`);
}

test('YouTube adreslerinden güvenli video kimliği çıkarılır', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk?t=4'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube-nocookie.com/embed/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk'), '');
  assert.equal(hashPrefix('abcdefghijk').length, 4);
});

test('Kategori varsayılanı yalnızca seçim belirtilmediğinde uygulanır', () => {
  assert.deepEqual(normalizeCategories(), ['sponsor']);
  assert.deepEqual(normalizeCategories([]), []);
  assert.deepEqual(normalizeCategories(['chapter']), []);
});

const hashResponse = [
  { videoID: 'other-video', segments: [{ segment: [1, 2], category: 'sponsor', actionType: 'skip', UUID: 'wrong' }] },
  { videoID: 'abcdefghijk', segments: [
    { segment: [60, 90], category: 'sponsor', actionType: 'skip', UUID: 'ok' },
    { segment: [2, 1], category: 'sponsor', actionType: 'skip', UUID: 'bad' },
    { segment: [1, 2], category: 'chapter', actionType: 'skip', UUID: 'cat' },
  ] },
];

test('Hash yanıtı doğru videoya ve geçerli kategorilere süzülür', () => {
  const checked = validateSegments(extractHashSegments(hashResponse, 'abcdefghijk'), 'abcdefghijk');
  assert.equal(checked.segments.length, 1);
  assert.equal(checked.invalid, 2);
  assert.equal(extractHashSegments(hashResponse, 'missing').length, 0);
});

test('API video süresi korunur ve geçersiz süre güvenle yok sayılır', () => {
  const extracted = extractHashSegments([{ videoID: 'abcdefghijk', videoDuration: 123,
    segments: [{ segment: [1, 2], category: 'sponsor' }] }], 'abcdefghijk');
  assert.equal(extracted[0].videoDuration, 123);
  assert.equal(validateSegments([{ videoID: 'abcdefghijk', videoDuration: '1e999', segment: [1, 2], category: 'sponsor' }],
    'abcdefghijk').segments[0].videoDuration, null);
});

test('Yerel video süresi segmentleri sınırlar', () => {
  const checked = validateSegments(extractHashSegments(hashResponse, 'abcdefghijk'), 'abcdefghijk', 80);
  assert.deepEqual(checked.segments.map(({ start, end }) => [start, end]), [[60, 80]],
    'video süresini aşan segment güvenli süreye kırpılmadı');
});

test('chapter eylemleri skip listesinden ayrılır ve başlığı güvenle doğrulanır', () => {
  const payload = [
    { videoID: 'abcdefghijk', segment: [0, 30], category: 'chapter', actionType: 'chapter',
      description: '  Giriş\u0000 bölümü  ', UUID: 'chapter-1', videoDuration: 120 },
    { videoID: 'abcdefghijk', segment: [30, 60], category: 'chapter', actionType: 'skip',
      description: 'Yanlış eylem', UUID: 'chapter-2' },
    { videoID: 'abcdefghijk', segment: [60, 90], category: 'sponsor', actionType: 'skip', UUID: 'skip-1' },
  ];
  const actions = splitSponsorActions(payload);
  assert.equal(actions.chapter.length, 1);
  assert.equal(actions.skip.length, 2);
  const checked = validateChapters(actions.chapter, 'abcdefghijk', 120);
  assert.equal(checked.invalid, 0);
  assert.deepEqual(checked.chapters.map(({ start, end, title, actionType }) => ({ start, end, title, actionType })),
    [{ start: 0, end: 30, title: 'Giriş bölümü', actionType: 'chapter' }]);
  assert.equal(validateSegments(actions.skip, 'abcdefghijk').segments.length, 1,
    'chapter kategorili skip eylemi atlama listesine kabul edildi');
});

test('boş, taşan veya yanlış videoya ait chapter kayıtları reddedilir', () => {
  const checked = validateChapters([
    { videoID: 'abcdefghijk', segment: [5, 999], category: 'chapter', actionType: 'chapter', description: 'Son' },
    { videoID: 'abcdefghijk', segment: [5, 6], category: 'chapter', actionType: 'chapter', description: '' },
    { videoID: 'other-video', segment: [5, 6], category: 'chapter', actionType: 'chapter', description: 'Başka' },
  ], 'abcdefghijk', 100);
  assert.equal(checked.chapters.length, 1);
  assert.equal(checked.chapters[0].end, 100);
  assert.equal(checked.invalid, 2);
});

test('süre bilinmiyorsa aşırı uzun chapter kaydı reddedilir', () => {
  const checked = validateChapters([
    { videoID: 'abcdefghijk', segment: [5, 5 + (2 * 60 * 60) + 1], category: 'chapter',
      actionType: 'chapter', description: 'Şüpheli uzun bölüm' },
  ], 'abcdefghijk');
  assert.equal(checked.chapters.length, 0);
  assert.equal(checked.invalid, 1);
});

test('ana süreç chapter ve skip action type değerlerini aynı mahrem sorguda ister', () => {
  const main = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /JSON\.stringify\(\[\.\.\.normalized, 'chapter'\]\)/);
  assert.match(main, /JSON\.stringify\(\['skip', 'chapter'\]\)/);
  assert.match(main, /validateSponsorChapters\(actions\.chapter/);
});

test('video sonundaki küçük süre farkı segmenti silmek yerine kırpar', () => {
  const payload = [{ videoID: 'abcdefghijk', segment: [75, 80.2], category: 'outro', actionType: 'skip' }];
  const checked = validateSegments(payload, 'abcdefghijk', 80);
  assert.deepEqual(checked.segments.map(({ start, end }) => [start, end]), [[75, 80]]);
  assert.deepEqual(clampSegmentsToDuration([{ start: 75, end: 80.2 }], 80), [{ start: 75, end: 80 }]);
});

test('UUID boyutu sınırlanır', () => {
  const longUuid = 'x'.repeat(500);
  assert.equal(validateSegments([{ videoID: 'abcdefghijk', segment: [1, 2], category: 'sponsor', actionType: 'skip', UUID: longUuid }],
    'abcdefghijk').segments[0].uuid.length, 180);
});

test('Cache TTL, negatif TTL ve LRU sınırı uygulanır', () => {
  const cache = new SponsorBlockCache({ ttlMs: 100, negativeTtlMs: 10, maxEntries: 1 });
  cache.set('abcdefghijk', ['sponsor'], { segments: [{ start: 1 }] }, { now: 1000 });
  assert.deepEqual(cache.get('abcdefghijk', ['sponsor'], 'skip', 1050), { segments: [{ start: 1 }] });
  assert.equal(cache.get('abcdefghijk', ['sponsor'], 'skip', 1201), null);
  cache.set('empty', ['sponsor'], { segments: [] }, { negative: true, now: 1000 });
  assert.deepEqual(cache.get('empty', ['sponsor'], 'skip', 1005), { segments: [] });
  assert.equal(cache.get('empty', ['sponsor'], 'skip', 1011), null);
});


test('uzun video segmenti iki saat güvenlik sınırı yüzünden reddedilmez', () => { const checked = validateSegments([{ videoID: 'abcdefghijk', segment: [0, 11000], category: 'selfpromo', actionType: 'skip', videoDuration: 11000 }], 'abcdefghijk', 10800); assert.equal(checked.segments.length, 1); assert.equal(checked.segments[0].end, 10800); });
test('kısa veya bilinmeyen sürede iki saatten uzun ham segment reddedilir', () => { const payload = [{ videoID: 'abcdefghijk', segment: [0, 99999], category: 'sponsor', actionType: 'skip' }]; assert.equal(validateSegments(payload, 'abcdefghijk', 90).segments.length, 0); assert.equal(validateSegments(payload, 'abcdefghijk').segments.length, 0); });
console.log(`SponsorBlock: ${passed} test`);
