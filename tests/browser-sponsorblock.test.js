const assert = require('node:assert/strict');
const {
  youtubeVideoId, hashPrefix, normalizeCategories, extractHashSegments, validateSegments, SponsorBlockCache,
} = require('../src/browser-sponsorblock');

assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk?t=4'), 'abcdefghijk');
assert.equal(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
assert.equal(youtubeVideoId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk'), '');
assert.equal(hashPrefix('abcdefghijk').length, 4);

assert.deepEqual(normalizeCategories(), ['sponsor']);
const hashResponse = [
  { videoID: 'other-video', segments: [{ segment: [1, 2], category: 'sponsor', actionType: 'skip', UUID: 'wrong' }] },
  { videoID: 'abcdefghijk', segments: [
    { segment: [60, 90], category: 'sponsor', actionType: 'skip', UUID: 'ok' },
    { segment: [2, 1], category: 'sponsor', actionType: 'skip', UUID: 'bad' },
    { segment: [1, 2], category: 'chapter', actionType: 'skip', UUID: 'cat' },
  ] },
];
const checked = validateSegments(extractHashSegments(hashResponse, 'abcdefghijk'), 'abcdefghijk');
assert.equal(checked.segments.length, 1);
assert.equal(checked.invalid, 2);
assert.equal(extractHashSegments(hashResponse, 'missing').length, 0);
assert.equal(validateSegments(extractHashSegments(hashResponse, 'abcdefghijk'), 'abcdefghijk', 80).segments.length, 0,
  'video süresini aşan segment kabul edildi');
const longUuid = 'x'.repeat(500);
assert.equal(validateSegments([{ videoID: 'abcdefghijk', segment: [1, 2], category: 'sponsor', actionType: 'skip', UUID: longUuid }],
  'abcdefghijk').segments[0].uuid.length, 180);

const cache = new SponsorBlockCache({ ttlMs: 100, negativeTtlMs: 10, maxEntries: 1 });
cache.set('abcdefghijk', ['sponsor'], { segments: [{ start: 1 }] }, { now: 1000 });
assert.deepEqual(cache.get('abcdefghijk', ['sponsor'], 'skip', 1050), { segments: [{ start: 1 }] });
assert.equal(cache.get('abcdefghijk', ['sponsor'], 'skip', 1201), null);
cache.set('empty', ['sponsor'], { segments: [] }, { negative: true, now: 1000 });
assert.deepEqual(cache.get('empty', ['sponsor'], 'skip', 1005), { segments: [] });
assert.equal(cache.get('empty', ['sponsor'], 'skip', 1011), null);
console.log('SponsorBlock: URL kimliği, segment doğrulama, TTL/LRU cache testleri geçti.');
