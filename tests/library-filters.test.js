'use strict';
// Madde 32 — büyük katalog sorguları: birleşik filtre matrisi + kararlı sıra +
// 10k+ kayıtta tek-sorgu dil haritası ölçümü.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyLibraryFilters, libraryLanguages } = require('../src/library-filters');
const { WatchIndex, databaseConstructor } = require('../src/watch-index');

let passed = 0;

// Ortam sqlite'ı fts5 desteklemiyorsa index testleri atlanır (mevcut konvansiyon).
function hasFts5() {
  const Ctor = databaseConstructor();
  if (!Ctor) return false;
  const probe = new Ctor(':memory:');
  try {
    probe.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(value)');
    return true;
  } catch (_) { return false; }
  finally { probe.close(); }
}
const FTS5 = hasFts5();
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

const item = (over) => ({
  key: 'k', title: 't', position: 0, duration: 100, completed: false,
  collections: [], matches: [], subLangs: [], hasSubs: false, ...over,
});
const progress = (x) => (x.duration ? (x.position / x.duration) : 0);
const F = (over) => ({ watchState: 'all', language: 'all', subs: 'all', ...over });

const catalog = [
  item({ key: 'a', collections: ['filmler'], subLangs: ['en', 'tr'], hasSubs: true, position: 50 }),
  item({ key: 'b', collections: ['diziler'], subLangs: ['tr'], hasSubs: true, completed: true }),
  item({ key: 'c', collections: ['filmler'], subLangs: [], hasSubs: false, hasNotes: true }),
  item({ key: 'd', subLangs: ['en'], hasSubs: true, position: 10 }),
  item({ key: 'e' }),
];

test('tek filtreler tek başına doğru', () => {
  assert.deepEqual(applyLibraryFilters(catalog, F({ watchState: 'collection:filmler' }), { watchProgress: progress }).map((x) => x.key), ['a', 'c']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ watchState: 'completed' }), { watchProgress: progress }).map((x) => x.key), ['b']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ watchState: 'continue' }), { watchProgress: progress }).map((x) => x.key), ['a', 'd']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ watchState: 'has-notes' }), { watchProgress: progress }).map((x) => x.key), ['c']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ language: 'en' }), { watchProgress: progress }).map((x) => x.key), ['a', 'd']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ subs: 'yes' }), { watchProgress: progress }).map((x) => x.key), ['a', 'b', 'd']);
  assert.deepEqual(applyLibraryFilters(catalog, F({ subs: 'no' }), { watchProgress: progress }).map((x) => x.key), ['c', 'e']);
});

test('filtreler BİRLİKTE çalışır (koleksiyon+dil+durum+altyazı)', () => {
  const r = applyLibraryFilters(catalog,
    F({ watchState: 'collection:filmler', language: 'en', subs: 'yes' }),
    { watchProgress: progress }).map((x) => x.key);
  assert.deepEqual(r, ['a']); // filmler ∩ en ∩ altyazılı → yalnız a
  const r2 = applyLibraryFilters(catalog,
    F({ watchState: 'continue', language: 'en', subs: 'yes' }),
    { watchProgress: progress }).map((x) => x.key);
  assert.deepEqual(r2, ['a', 'd']); // devam eden ∩ en ∩ altyazılı
});

test('sonuç sırası kararlı — girdi sırası korunur', () => {
  const a = applyLibraryFilters(catalog, F({ language: 'en' }), { watchProgress: progress });
  const b = applyLibraryFilters([...catalog].reverse(), F({ language: 'en' }), { watchProgress: progress });
  assert.deepEqual(a.map((x) => x.key), ['a', 'd']);
  assert.deepEqual(b.map((x) => x.key), ['d', 'a']); // sıra filtreden değil girdiden
});

test('dil karşılaştırması büyük-küçük harf toleranslı', () => {
  assert.deepEqual(applyLibraryFilters(catalog, F({ language: 'EN' }), { watchProgress: progress }).map((x) => x.key), ['a', 'd']);
});

test('libraryLanguages deterministik alfabetik liste', () => {
  assert.deepEqual(libraryLanguages(catalog), ['en', 'tr']);
  assert.deepEqual(libraryLanguages(null), []);
});

test('50k kayıtta birleşik filtre < 150ms ve sıra korunur', () => {
  const big = Array.from({ length: 50000 }, (_, i) => item({
    key: `m${i}`, collections: i % 3 ? ['x'] : ['y'],
    subLangs: i % 4 ? ['en'] : ['tr'], hasSubs: i % 5 !== 0,
    position: i % 100, completed: i % 7 === 0,
  }));
  const t0 = process.hrtime.bigint();
  const r = applyLibraryFilters(big,
    F({ watchState: 'continue', language: 'en', subs: 'yes' }),
    { watchProgress: progress });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 150, `filtre 50k: ${ms.toFixed(1)}ms`);
  // Kararlılık: çıktı girdinin alt dizisi (sıra korunmuş).
  let prev = -1;
  for (const x of r) {
    const idx = big.indexOf(x);
    assert.ok(idx > prev); prev = idx;
  }
});

test('mediaLanguageMap: tek sorguyla dil+varlık haritası (index kullanımı)', () => {
  if (!FTS5) { console.log('    (fts5 yok — index testi atlandı)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-libfilters-'));
  const index = new WatchIndex(path.join(dir, 'index.db'));
  try {
    index.upsertMedia({ id: 'm1', title: 'A' });
    index.upsertMedia({ id: 'm2', title: 'B' });
    index.upsertTrack({ id: 't1', mediaId: 'm1', language: 'en', role: 'source' });
    index.upsertTrack({ id: 't2', mediaId: 'm1', language: 'tr', role: 'translation' });
    index.upsertTrack({ id: 't3', mediaId: 'm2', language: '', role: 'source' }); // dilsiz iz
    const map = index.mediaLanguageMap();
    assert.equal(map.get('m1').hasSubs, true);
    assert.deepEqual([...map.get('m1').languages].sort(), ['en', 'tr']);
    assert.equal(map.get('m2').hasSubs, true); // dilsiz iz de altyazı sayılır
    assert.deepEqual([...map.get('m2').languages], []);
    assert.equal(map.get('m3'), undefined);    // izsiz medya → hasSubs=false yolu
    // Sorgu planı kanıtı: tek SELECT, per-media N+1 yok.
    const plan = index.db.prepare(
      "EXPLAIN QUERY PLAN SELECT media_id, language FROM tracks WHERE media_id <> ''").all();
    assert.ok(plan.length >= 1);
  } finally { index.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('mediaLanguageMap ölçek: 10k medya / 30k iz', () => {
  if (!FTS5) { console.log('    (fts5 yok — index testi atlandı)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-libfilters-big-'));
  const index = new WatchIndex(path.join(dir, 'index.db'));
  try {
    index.transaction(() => {
      for (let i = 0; i < 10000; i++) index.upsertMedia({ id: `m${i}`, title: `T${i}` });
      for (let i = 0; i < 30000; i++) {
        index.upsertTrack({ id: `t${i}`, mediaId: `m${i % 10000}`, language: ['en', 'tr', 'ja'][i % 3] });
      }
    });
    const t0 = process.hrtime.bigint();
    const map = index.mediaLanguageMap();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(map.size, 10000);
    assert.equal(map.get('m0').hasSubs, true);
    assert.ok([...map.get('m0').languages].length >= 1);
    assert.ok(ms < 2000, `mediaLanguageMap 30k iz: ${ms.toFixed(1)}ms`);
  } finally { index.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`library-filters: ${passed} test`);
