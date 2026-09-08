const assert = require('assert');
const {
  isYoutubePlayerResponseUrl,
  pruneYoutubePlayerResponseBody,
  responseHeadersWithoutEntityEncoding,
} = require('../src/youtube-player-response-pruner');

const source = JSON.stringify({
  playabilityStatus: { status: 'OK' },
  adPlacements: [{ id: 'placement' }],
  playerAds: [{ id: 'player-ad' }],
  adSlots: [{ id: 'slot' }],
  streamingData: { formats: [{ itag: 18 }] },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  nested: { adSlots: ['bu alan üst düzey olmadığı için korunur'] },
});
const pruned = pruneYoutubePlayerResponseBody(source);
assert.equal(pruned.changed, true);
assert.deepEqual(pruned.removedFields, ['adPlacements', 'playerAds', 'adSlots']);
assert.deepEqual(JSON.parse(pruned.body), {
  playabilityStatus: { status: 'OK' },
  streamingData: { formats: [{ itag: 18 }] },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  nested: { adSlots: ['bu alan üst düzey olmadığı için korunur'] },
});

const broken = '{"adPlacements":';
assert.deepEqual(pruneYoutubePlayerResponseBody(broken), {
  changed: false,
  body: broken,
  removedFields: [],
  reason: 'invalid-json',
});

const clean = '{ "playabilityStatus": { "status": "OK" } }';
assert.deepEqual(pruneYoutubePlayerResponseBody(clean), {
  changed: false,
  body: clean,
  removedFields: [],
  reason: 'no-ad-fields',
});

assert.equal(isYoutubePlayerResponseUrl('https://www.youtube.com/youtubei/v1/player?key=secret'), true);
assert.equal(isYoutubePlayerResponseUrl('https://music.youtube.com/youtubei/v1/player'), true);
assert.equal(isYoutubePlayerResponseUrl('https://youtube.com.evil.test/youtubei/v1/player'), false);
assert.equal(isYoutubePlayerResponseUrl('https://rr1.googlevideo.com/youtubei/v1/player'), false);
assert.equal(isYoutubePlayerResponseUrl('https://www.youtube.com/youtubei/v1/browse'), false);

assert.deepEqual(responseHeadersWithoutEntityEncoding([
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Content-Encoding', value: 'br' },
  { name: 'content-length', value: '999' },
  { name: 'Transfer-Encoding', value: 'chunked' },
  { name: 'Cache-Control', value: 'private' },
]), [
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Cache-Control', value: 'private' },
]);

console.log('youtube-player-response-pruner: dar URL, reklam alanları ve fail-open testleri geçti.');
