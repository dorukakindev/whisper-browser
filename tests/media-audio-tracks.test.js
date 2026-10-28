const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAudioStreams } = require('../src/media-audio-tracks');
test('MP4 handler labels preserve dubbed/original distinction and audio-relative indices', () => {
  const tracks = parseAudioStreams({ streams: [
    { index: 0, codec_type: 'video' },
    { index: 1, codec_type: 'audio', tags: { language: 'tur', handler_name: 'Türkçe dublaj' } },
    { index: 2, codec_type: 'audio', tags: { handler_name: 'Original' } },
    { index: 3, codec_type: 'audio', tags: { title: 'Commentary', handler_name: 'SoundHandler' } },
    { index: 4, codec_type: 'audio', tags: { handler_name: 'SoundHandler' } },
  ] });
  assert.deepEqual(tracks.map(t => [t.index, t.title]), [[0, 'Türkçe dublaj'], [1, 'Original'], [2, 'Commentary'], [3, '']]);
  assert.equal(tracks[0].lang, 'tur');
  assert.deepEqual(parseAudioStreams({}), []);
});
