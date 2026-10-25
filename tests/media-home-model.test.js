'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/media-home-model');
test('resume excludes completed/end credits and rejects invalid timing without mutating history', () => {
  const history = [
    { key: 'file:a', position: 20, duration: 100, lastWatched: 1 },
    { key: 'file:b', position: 96, duration: 100, lastWatched: 3 },
    { key: 'file:c', position: 50, duration: 100, completed: true, lastWatched: 2 },
    { key: 'file:d', position: Infinity, duration: NaN },
    { key: 'file:e', position: 40, duration: 0, lastWatched: 4 },
  ];
  const before = structuredClone(history);
  assert.deepEqual(model.snapshot([], history).continuing.map(row => row.key), ['file:e', 'file:a']);
  assert.deepEqual(history, before);
  assert.equal(model.progress({ duration: 100, position: 500 }).percent, 100);
});
test('audio files, video files and browser pages retain their own category', () => {
  assert.equal(model.medium({ type: 'local', localPath: 'C:\\Sesler\\Türkçe.FLAC' }), 'music');
  assert.equal(model.medium({ type: 'browser', sourceRef: 'https://example.com/album.mp3' }), 'web');
  assert.equal(model.medium({ type: 'youtube' }), 'web');
  assert.equal(model.medium({ type: 'local', localPath: 'C:\\Film.mkv' }), 'video');
  assert.equal(model.medium({ type: 'local', sourceRef: 'C:/Sesler/şarkı.opus' }), 'music');
});
test('search supports Turkish accents, preserves user text and tolerates malformed lists', () => {
  const item = { title: 'İSTANBUL Çığlığı', synopsis: 'Özgür bir öykü', year: 2026 };
  assert(model.matches(item, 'istanbul cigligi'));
  assert(model.matches(item, 'ozgur'));
  assert(model.matches(item, '2026'));
  assert.equal(item.title, 'İSTANBUL Çığlığı');
  assert.deepEqual(model.snapshot(null, [null, {}, { key: 'a' }, { key: 'a' }]).watch, [{ key: 'a' }]);
  assert.deepEqual(model.snapshot({}, null).items, []);
});
test('resume rows borrow existing catalog artwork without changing saved paths or titles', () => {
  const history = [{ key: 'file:c:/filmler/öykü.mp4', title: 'My title', position: 10, duration: 100 }];
  const result = model.snapshot([{ id: 'film', hasPoster: true, source: { type: 'local', value: 'C:\\Filmler\\Öykü.mp4' } }], history);
  assert.equal(result.watch[0].id, 'film');
  assert.equal(result.watch[0].hasPoster, true);
  assert.equal(result.watch[0].title, 'My title');
  assert.equal(history[0].id, undefined);
});

test('exported M4B audiobooks stay in the audio category',()=>{assert.equal(model.medium({type:'local',sourceRef:'C:/Books/Kitap.m4b'}),'music');});
