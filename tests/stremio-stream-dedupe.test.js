'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../src/stremio-addons');
const { dedupeStreams } = require('../src/stremio-stream-dedupe');

const HASH = 'a'.repeat(40), HASH2 = 'b'.repeat(40);
const norm = (raw, key, name) => A.normalizeStream(raw, { key, name, host: `${key}.example` });
const torrent = (key, extra = {}, hints = {}, name = 'Addon\n1080p') => norm({ name, description: `Show.S01E01.1080p.WEB-DL.mkv\n👤 ${extra.seeds ?? 10}`, infoHash: HASH, sources: extra.sources || [], fileIdx: extra.fileIdx, behaviorHints: { filename: 'Show.S01E01.1080p.WEB-DL.mkv', videoSize: 2147483648, ...hints } }, key, key.toUpperCase());

test('same torrent from two addons collapses, keeps provenance, merges trackers and seeders', () => {
  const rows = [torrent('torrentio', { seeds: 12, sources: ['tracker:udp://one'] }), torrent('mediafusion', { seeds: 90, sources: ['tracker:udp://two'] })];
  const before = JSON.stringify(rows);
  const out = dedupeStreams(rows);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].alsoFrom.map((x) => x.addonKey).length, 1);
  assert.equal(out[0].duplicates, 1);
  assert.equal(out[0].seeders, 90);
  assert.equal(rows[0].alsoFrom, undefined, 'input rows are not mutated');
  assert.deepEqual(new Set(out[0].trackers), new Set(rows.flatMap(row => row.trackers)));
  assert.equal(JSON.stringify(rows), before, 'metadata and tracker arrays stay unchanged');
});

test('a pack whose rows repeat one file name still keeps each fileIdx separate', () => {
  const same = (key, idx) => torrent(key, { fileIdx: idx }, { filename: 'Show.Season.1.Complete.Pack.mkv', videoSize: 5000000000 });
  assert.equal(dedupeStreams([same('a', 3), same('b', 4)]).length, 2);
});

test('different and unspecified files of one season pack stay separate', () => {
  const ep1 = torrent('a', { fileIdx: 3 }, { filename: 'Show.S01E03.1080p.mkv' }), ep2 = torrent('b', { fileIdx: 4 }, { filename: 'Show.S01E04.1080p.mkv' }), none = torrent('c', {}, { filename: 'Show.S01E03.1080p.mkv' });
  assert.equal(dedupeStreams([ep1, ep2]).length, 2);
  assert.equal(dedupeStreams([ep1, none]).length, 2, 'an unspecified file is not proof of the indexed episode');
  assert.equal(dedupeStreams([ep1, ep2, none]).length, 3);
});

test('filename and size never replace playback identity or hide subtitle and binge variants', () => {
  const url = (key, suffix) => norm({ name: key, url: `https://cdn.example/${suffix}.mkv`, behaviorHints: { filename: 'Same.Release.1080p.mkv', videoSize: 9999 } }, key, key);
  assert.equal(dedupeStreams([url('a', 'one'), url('b', 'two')]).length, 2);
  const differentHash = { ...torrent('b'), infoHash: HASH2 };
  assert.equal(dedupeStreams([torrent('a'), differentHash]).length, 2);
  const original = torrent('a');
  assert.equal(dedupeStreams([original, { ...torrent('b'), subtitles: [{ id: 'sub', lang: 'tur', url: 'https://subs.example/tr.srt' }] }]).length, 2);
  assert.equal(dedupeStreams([original, { ...torrent('b'), bingeGroup: 'other-series' }]).length, 2);
  assert.equal(dedupeStreams([original, { ...torrent('b'), usesHeaders: true }]).length, 2);
});

test('addon filter still finds the surviving row through its provenance', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../src/renderer/stremio-ui.js'), 'utf8');
  const fn = source.slice(source.indexOf('  function filterStreams('), source.indexOf('  function mountStreamList('));
  const filter = vm.runInNewContext(`${fn}; filterStreams`);
  const rows = [{ addonKey: 'winner', alsoFrom: [{ addonKey: 'other' }], playable: true }];
  assert.equal(filter(rows, { addon: 'other' }).length, 1);
  assert.equal(filter(rows, { addon: 'absent' }).length, 0);
});

test('a cached copy wins over an uncached one regardless of order', () => {
  const plain = torrent('plain', {}, {}, 'Plain\n1080p');
  const cached = torrent('debrid', {}, {}, '[TB+] Debrid\n1080p');
  assert.equal(cached.availability, 'cached');
  for (const rows of [[plain, cached], [cached, plain]]) {
    const out = dedupeStreams(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0].availability, 'cached');
  }
});

test('rows that need addon request headers are never merged across addons', () => {
  const mk = (key) => norm({ name: key, description: 'x.mkv', url: 'https://cdn.example/video.mp4', behaviorHints: { proxyHeaders: { request: { Referer: 'https://cdn.example/' } } } }, key, key);
  const rows = [mk('one'), mk('two')];
  assert.ok(rows.every((r) => r.usesHeaders), 'fixture must exercise the header path');
  assert.equal(dedupeStreams(rows).length, 2);
});

test('identical URLs merge; different torrents and unplayable rows are untouched; ranking of distinct rows is unchanged', () => {
  const url = (key) => norm({ name: key, description: 'x.mkv', url: 'https://cdn.example/v.mp4' }, key, key);
  assert.equal(dedupeStreams([url('a'), url('b')]).length, 1);
  const other = norm({ name: 'o', description: 'Other.mkv', infoHash: HASH2 }, 'o', 'O');
  const unplayable = norm({ name: 'u', description: 'nothing' }, 'u', 'U');
  const distinct = [torrent('a'), other, unplayable];
  assert.equal(dedupeStreams(distinct).length, 3);
  assert.deepEqual(A.rankStreams(dedupeStreams(distinct)).map((r) => r.id), A.rankStreams(distinct).map((r) => r.id));
});
