'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { csvPlan, urlOf, registerMediaShelf } = require('../src/media-shelf-service');
const { createMediaCatalogStore } = require('../src/media-catalog-store');
const { findTestPython } = require('./python-runtime');
test('Letterboxd conservative title/year matching preserves personal scores and rejects ambiguity', () => {
  const plan = csvPlan([{ title: 'İstanbul', year: '2024', rating: 4 }, { title: 'Dune', year: '', rating: 3 }, { title: 'New', year: '2020', rating: 5 }], [
    { id: 'one', title: 'İstanbul', year: 2024, kind: 'film', ratings: { personal: 'own' } },
    { id: 'two', title: 'Dune', year: 1984, kind: 'film' }, { id: 'three', title: 'Dune', year: 2021, kind: 'film' },
  ]);
  assert.equal(plan.planned.length, 1); assert.equal(plan.planned[0].preserved, true);
  assert.deepEqual(plan.ambiguous, ['Dune']); assert.equal(plan.added.length, 1);
  assert.throws(() => urlOf('file:///C:/secret'));
  assert.throws(() => urlOf('https://a.example/feed?token=secret'));
  assert.equal(urlOf('https://a.example/feed'), 'https://a.example/feed');
});
test('atomic catalog batch validates the whole import and keeps existing source/ratings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-catalog-'));
  try {
    const store = createMediaCatalogStore({ filePath: path.join(dir, 'catalog.json') });
    const row = store.upsert({ title: 'Keep', kind: 'film', ratings: { personal: '4' }, source: { type: 'browser', value: 'https://media.example/watch' } });
    const before = fs.readFileSync(path.join(dir, 'catalog.json'));
    assert.throws(() => store.upsertMany([{ id: row.id, title: 'Changed' }, { title: '' }]));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'catalog.json')), before);
    assert.equal(store.get(row.id).title, 'Keep');
    store.upsertMany([{ id: row.id, year: 2024 }, { title: 'New', kind: 'film' }]);
    assert.equal(store.get(row.id).source.value, 'https://media.example/watch');
    assert.equal(store.get(row.id).ratings.personal, '4');
    assert.equal(store.list().length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('shelf main boundary, book progress, shared catalog import, podcast refresh preserve user data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-service-'));
  try {
    const handlers = new Map(), picker = [], python = findTestPython(); assert(python, 'Python required');
    const catalog = createMediaCatalogStore({ filePath: path.join(dir, 'media-catalog.json') });
    const old = catalog.upsert({ title: 'Existing', kind: 'film', year: 2024, ratings: { personal: 'keep' } });
    registerMediaShelf({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, authorized: event => event.allowed,
      dialog: { showOpenDialog: async () => ({ canceled: !picker.length, filePaths: picker.splice(0) }) }, owner: () => null, userData: () => dir,
      pythonPath: () => python, ffprobePath: () => 'ffprobe', inspectMedia: file => file, grantMedia() {}, grantPdf() {},
      nativeImage: { createFromDataURL: () => ({ isEmpty: () => true }) }, catalogStore: () => catalog,
      fetchImpl: async () => new Response('<rss><channel><title>Test</title><item><title>A</title><enclosure url="https://audio.example/a.mp3"/></item></channel></rss>') });
    const handle = handlers.get('media-shelf:request'), api = (action, rest = {}) => handle({ allowed: true }, { action, ...rest });
    assert.equal((await handle({ allowed: false }, { action: 'list' })).ok, false);
    const book = path.join(dir, 'Öykü.txt'); fs.writeFileSync(book, 'Şimdi bir kitap.'); picker.push(book);
    const imported = await api('book-import'); assert.equal(imported.ok, true, imported.error);
    assert.equal((await api('book-open', { id: imported.id })).chapters[0].text, 'Şimdi bir kitap.');
    assert.equal((await api('book-progress', { id: imported.id, chapter: 0, scroll: .5, bookmark: true, quote: 'bir kitap' })).ok, true);
    assert.equal((await api('book-open', { id: imported.id })).bookmarks[0].quote, 'bir kitap');
    assert.equal((await api('book-open', { id: 'C:/arbitrary.txt' })).ok, false);
    assert.equal((await api('book-progress', { id: imported.id, chapter: -1, scroll: 5 })).ok, false);
    assert.equal((await api('podcast-add', { url: 'https://feed.example/rss' })).ok, true);
    const pod = (await api('list')).podcasts[0];
    await api('listen-progress', { kind: 'podcasts', id: pod.id, url: pod.episodes[0].url, position: 42, duration: 120 });
    await api('podcast-add', { url: 'https://feed.example/rss' });
    assert.equal((await api('list')).podcasts[0].episodes[0].position, 42);
    const csv = path.join(dir, 'ratings.csv'); fs.writeFileSync(csv, 'Name,Year,Rating\nExisting,2024,5\nNew Film,2020,4.5\n'); picker.push(csv);
    const preview = await api('letterboxd-preview'); assert.equal(preview.preserved, 1);
    assert.equal(catalog.list().length, 1, 'Preview must not mutate');
    const applied = await api('letterboxd-apply', { token: preview.token }); assert.equal(applied.ok, true, applied.error);
    assert.equal(catalog.get(old.id).ratings.personal, 'keep'); assert.equal(catalog.list().length, 2, 'same live store sees imported rows');
    assert.equal((await api('letterboxd-apply', { token: preview.token })).ok, false);
    await api('remove', { kind: 'books', id: imported.id }); assert(fs.existsSync(book));
    fs.writeFileSync(path.join(dir, 'media-shelf.json'), '{broken');
    assert.equal((await api('radio-save', { title: 'X', url: 'https://audio.example/radio' })).ok, false);
    assert.equal(fs.readFileSync(path.join(dir, 'media-shelf.json'), 'utf8'), '{broken');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
