'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMediaCatalogStore } = require('../src/media-catalog-store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-catalog-'));
try {
  const filePath = path.join(dir, 'catalog.json');
  const store = createMediaCatalogStore({ filePath });
  const manual = store.upsert({ kind: 'film', title: 'Kuzey', year: 2024, imdbId: 'tt1234567',
    synopsis: 'Elle yazılan özet',
    ratings: { imdb: '8/10', letterboxd: null, personal: 'ham:91' },
    watchStatus: 'watching', favorite: true,
    source: { type: 'browser', value: 'https://video.example/watch' } });
  assert(manual.id);
  store.upsert({ id: manual.id, title: 'Kuzey Yeni' });
  assert.equal(store.get(manual.id).watchStatus, 'watching');
  assert.equal(store.get(manual.id).synopsis, 'Elle yazılan özet');
  assert.equal(store.get(manual.id).source.value, 'https://video.example/watch');
  const incoming = { id: 'nmdb:work:1', importRef: 'nmdb:work:1', kind: 'film', title: 'Kuzey', year: 2024,
    imdbId: 'tt1234567', watchStatus: 'completed', favorite: false,
    ratings: { imdb: '9/10', letterboxd: '4.3', personal: '95' },
    source: { type: 'local', value: 'C:\\Movies\\Kuzey.mp4' } };
  const before = fs.readFileSync(filePath, 'utf8');
  const preview = store.previewImport([incoming]);
  assert.equal(preview.updated.length, 1);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before, 'Önizleme dosyaya yazmamalı');
  const merged = store.mergeImport([incoming]);
  assert.equal(merged.updated.length, 1);
  assert.equal(store.get(manual.id).favorite, true);
  assert.deepEqual(store.get(manual.id).ratings, { imdb: '8/10', letterboxd: '4.3', personal: 'ham:91' });
  assert.equal(store.get(manual.id).watchStatus, 'watching');
  assert.equal(store.get(manual.id).source.value, 'https://video.example/watch');
  assert.equal(store.mergeImport([incoming]).updated.length, 1);
  assert.equal(store.list().length, 1);
  assert.equal(store.previewImport([{ ...incoming, imdbId: 'tt7654321' }]).conflicts.length, 1);
  const conflict = store.previewImport([{ id: 'nmdb:work:2', importRef: 'nmdb:work:2', kind: 'film', title: 'Kuzey Yeni', year: 2024 }]);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(store.mergeImport([{ id: 'nmdb:work:2', importRef: 'nmdb:work:2', kind: 'film', title: 'Kuzey Yeni', year: 2024 }]).conflicts.length, 1);
  assert.equal(store.list().length, 1);
  const episodeImport = { id: 'nmdb:work:3', importRef: 'nmdb:work:3', kind: 'series', title: 'Yol', year: 2023,
    episodes: [{ id: 's1e1', season: 1, number: 1, title: 'Başlangıç', source: { type: 'local', value: 'C:\\TV\\S01E01.mp4' } }] };
  assert.equal(store.mergeImport([episodeImport], { selectedIds: ['nmdb:work:3'] }).added.length, 1);
  const series = store.list().find((item) => item.importRef === 'nmdb:work:3');
  store.upsert({ id: series.id, episodes: [{ ...series.episodes[0], watchStatus: 'completed', title: 'Elle düzeltilen bölüm', season: 2 }] });
  store.mergeImport([{ ...episodeImport, episodes: [{ ...episodeImport.episodes[0], title: 'Yeni başlık', source: null }] }]);
  assert.equal(store.get(series.id).episodes[0].watchStatus, 'completed');
  assert.equal(store.get(series.id).episodes[0].title, 'Elle düzeltilen bölüm');
  assert.equal(store.get(series.id).episodes[0].season, 2);
  assert.equal(store.get(series.id).episodes[0].source.value, 'C:\\TV\\S01E01.mp4');
  assert.equal(store.remove(series.id), true);
  assert.equal(store.get(series.id), null);
  assert.equal(store.remove(series.id), false);
  store.upsert({ kind: 'film', title: 'Sayısal kimlik', year: 2020, tmdbId: '42' });
  assert.equal(store.previewImport([{ id: 'nmdb:b:work:1', importRef: 'nmdb:b:work:1',
    kind: 'series', title: 'Başka dizi', year: 2020, tmdbId: 'tv:42' }]).added.length, 1);
  assert.equal(store.previewImport([{ id: 'nmdb:c:work:1', importRef: 'nmdb:c:work:1',
    kind: 'film', title: 'Başka film', year: 2020, tmdbId: 'movie:42' }]).updated.length, 1);
  assert.throws(() => store.upsert({ kind: 'series', title: 'Tekrar bölüm', episodes: [
    { id: 'a', season: 1, number: 1 }, { id: 'b', season: 1, number: 1 },
  ] }), /Aynı sezon/);
  const sentinel = store.upsert({ kind: 'film', title: 'İlk', year: 2021, imdbId: '-', tmdbId: 'N/A',
    ratings: { imdb: 'N/A', letterboxd: '-', personal: 'null' } });
  assert.equal(sentinel.imdbId, '');
  assert.equal(sentinel.tmdbId, '');
  assert.deepEqual(sentinel.ratings, { imdb: null, letterboxd: null, personal: null });
  const unrelated = store.previewImport([{ id: 'nmdb:x:work:3', importRef: 'nmdb:x:work:3',
    kind: 'film', title: 'İkinci', year: 2022, imdbId: 'N/A', tmdbId: '-' }]);
  assert.equal(unrelated.added.length, 1);
  assert.equal(store.upsert({ kind: 'film', title: 'Kısa ID', imdbId: 'tt1', tmdbId: 'movie:0' }).imdbId, '');
  store.upsert({ id: manual.id, year: null });
  assert.equal(store.get(manual.id).year, null, 'Boşaltılan yıl yeniden eski değere dönmemeli');
  assert.equal(createMediaCatalogStore({ filePath }).get(manual.id).year, null);
  const corrupt = path.join(dir, 'bad.json'); fs.writeFileSync(corrupt, '{broken');
  assert.throws(() => createMediaCatalogStore({ filePath: corrupt }).list(), /korunuyor/);
  assert.equal(fs.readFileSync(corrupt, 'utf8'), '{broken');
  console.log('media-catalog-store: CRUD, preview, identity and user-state preservation passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
