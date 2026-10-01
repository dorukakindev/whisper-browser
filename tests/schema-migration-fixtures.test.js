'use strict';
// Madde 34 — veri şeması geçişleri: eski katalog/oturum/kütüphane şemalarından
// güncele geçiş gerçekçi fixture'larla sınanır; başarısız geçişte eski veri
// okunabilir kalır ve .bak geri dönüşü korunur.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readBrowserSessionWithStatus,
  writeBrowserSessionAtomic,
  BROWSER_SESSION_VERSION,
} = require('../src/browser-session-store');
const { createWatchLibraryStore, CURRENT_SCHEMA_VERSION } = require('../src/watch-library-store');
const { createMediaCatalogStore } = require('../src/media-catalog-store');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-mig-'));
const j = (o) => JSON.stringify(o, null, 2);

// ---------- A. browser-session.json: v1 → v8 ----------
// Eski uygulamanın gerçekçi v1 satırı: grup/split/lifecycle/sync/edits/queue
// alanlarının hiçbiri henüz yok.
const V1_SESSION = {
  version: 1, savedAt: 1690000000000, restoreEnabled: true,
  activeTabId: 't2',
  tabs: [
    { id: 't1', url: 'https://www.youtube.com/watch?v=abc', title: 'Video 1',
      position: 120.5, duration: 600, rate: 1, volume: 0.8, muted: false, pinned: true },
    { id: 't2', url: 'https://example.com/film', title: 'Film',
      position: 0, duration: 0, rate: 1.25, volume: 1, muted: false, pinned: false },
  ],
};

test("v1 oturum fixtureı güncele geçer: sekmeler + varsayılanlar korunur", () => {
  const file = path.join(root, 'browser-session.json');
  fs.writeFileSync(file, j(V1_SESSION));
  const { session, droppedTabs, warning } = readBrowserSessionWithStatus(file);
  assert.equal(session.version, BROWSER_SESSION_VERSION);
  assert.equal(session.tabs.length, 2);
  assert.equal(droppedTabs, 0);
  assert.equal(warning, '');
  assert.equal(session.activeTabId, 't2');
  const t1 = session.tabs.find((t) => t.id === 't1');
  assert.equal(t1.url, 'https://www.youtube.com/watch?v=abc');
  assert.equal(t1.position, 120.5);
  assert.equal(t1.pinned, true);
  // v1'de olmayan alanlar güvenli varsayılanlara geçti.
  assert.deepEqual(t1.subtitleSyncRecords, []);
  assert.deepEqual(t1.subtitleEdits, []);
  assert.deepEqual(t1.recoveryJobs, []);
  assert.equal(t1.lifecycle, 'background');
  assert.equal(t1.keepAwake, false);
  assert.equal(t1.compatibilityMode, false);
  assert.equal(t1.group, null);
  assert.equal(session.splitSecondaryTabId, '');
  assert.equal(session.splitRatio, 0.5);
  assert.equal(session.cleanExit, null);
});

test('v4 ara sürüm: mangaPosition varken grup/split/cleanExit varsayılanları', () => {
  const file = path.join(root, 'session-v4.json');
  fs.writeFileSync(file, j({
    version: 4, savedAt: 1, tabs: [
      { id: 'a', url: 'https://x.test/manga/1', title: 'M',
        mangaPosition: { version: 1, documentId: 'doc-9', imageId: 'p3', ratio: 0.42, ordinal: 3, updatedAt: 1 } },
    ],
  }));
  const { session } = readBrowserSessionWithStatus(file);
  assert.equal(session.tabs[0].mangaPosition.imageId, 'p3');
  assert.equal(session.tabs[0].mangaPosition.ratio, 0.42);
  assert.equal(session.tabs[0].group, null);
  assert.equal(session.splitRatio, 0.5);
});

test('geçiş sonrası ilk yazım: eski v1 dosya .bak\'ta geri dönüş için durur', () => {
  const file = path.join(root, 'rollback-session.json');
  fs.writeFileSync(file, j(V1_SESSION));
  readBrowserSessionWithStatus(file); // geçiş okuması
  const current = readBrowserSessionWithStatus(file).session;
  writeBrowserSessionAtomic(file, current); // güncel şemayla yaz
  const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(backup.version, 1); // eski şema okunabilir kaldı
  assert.equal(backup.tabs.length, 2);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, BROWSER_SESSION_VERSION);
});

test('başarısız geçiş: birincil+yedek bozuksa dosyalar olduğu gibi korunur', () => {
  const file = path.join(root, 'corrupt-session.json');
  const bad = '{ "version": 9, "tabs": [{"url": !!bozuk';
  fs.writeFileSync(file, bad);
  fs.writeFileSync(`${file}.bak`, '{yine bozuk');
  const { session, warning } = readBrowserSessionWithStatus(file);
  assert.equal(session.tabs.length, 0);
  assert.ok(warning.includes('okunamadı'));
  assert.equal(fs.readFileSync(file, 'utf8'), bad); // dosya silinmedi/değişmedi
});

test('bozuk birincil + sağlam yedek: oturum yedekten gelir, birincil silinmez', () => {
  const file = path.join(root, 'bak-session.json');
  fs.writeFileSync(file, '{{{bozuk');
  fs.writeFileSync(`${file}.bak`, j(V1_SESSION));
  const { session, warning } = readBrowserSessionWithStatus(file);
  assert.equal(session.tabs.length, 2);
  assert.equal(warning, '');
  assert.equal(fs.readFileSync(file, 'utf8'), '{{{bozuk'); // kullanıcı görebilsin diye durur
});

// ---------- B. watch-library.json: ham dizi/zarf → schemaVersion 3 ----------
test('ham dizi (en eski şema) güncel zarfa geçer, kayıtlar korunur', () => {
  const file = path.join(root, 'watch-array.json');
  fs.writeFileSync(file, j([
    { key: 'file:/a.mp4', title: 'A', lastWatched: 100, firstWatched: 100, position: 10, sessions: [] },
    { key: 'file:/b.mp4', title: 'B', lastWatched: 50, firstWatched: 50, position: 0 },
  ]));
  const store = createWatchLibraryStore({ filePath: file });
  const items = store.load();
  assert.equal(items.length, 2);
  const doc = store.loadDocument();
  assert.equal(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(items[0].key, 'file:/a.mp4'); // lastWatched sıralaması
});

test('schemaVersion 1 zarf: overflow + mezar taşı + bozuk kayıt karantinaya', () => {
  const file = path.join(root, 'watch-env.json');
  fs.writeFileSync(file, j({
    schemaVersion: 1,
    items: [
      { key: 'file:/a.mp4', title: 'A', lastWatched: 5 },
      { key: '', title: 'bozuk kayıt' },
    ],
    overflowItems: [{ key: 'file:/c.mp4', title: 'C', lastWatched: 3 }],
    tombstones: [{ key: 'file:/dead.mp4', removedAt: 9 }],
  }));
  const store = createWatchLibraryStore({ filePath: file });
  const doc = store.loadDocument();
  assert.equal(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
  const keys = [...doc.items, ...(doc.overflowItems || [])].map((i) => i.key);
  assert.ok(keys.includes('file:/a.mp4') && keys.includes('file:/c.mp4'));
  assert.ok(!keys.includes('file:/dead.mp4'));
  assert.equal(doc.tombstones.length, 1);
  assert.equal(doc.migrationQuarantine.length, 1); // bozuk kayıt düşürülmedi, karantinada
  const report = store.getLastReport();
  assert.equal(report.rejectedRecords, 1);
});

test('paket içi gömülü kütüphane (backupVersion+watchLibrary) çıkarılır', () => {
  const file = path.join(root, 'watch-bundled.json');
  fs.writeFileSync(file, j({ backupVersion: 2,
    watchLibrary: [{ key: 'file:/x.mp4', title: 'X', lastWatched: 1 }] }));
  const store = createWatchLibraryStore({ filePath: file });
  assert.equal(store.load()[0].key, 'file:/x.mp4');
});

test('eski sidecar mezar taşı dosyası bir kez içe aktarılır', () => {
  const file = path.join(root, 'watch-sidecar.json');
  const sidecar = path.join(root, 'watch-sidecar.tombstones.json');
  fs.writeFileSync(file, j({ schemaVersion: 3, items: [{ key: 'file:/keep.mp4', title: 'K', lastWatched: 2 }], tombstones: [] }));
  fs.writeFileSync(sidecar, j([{ key: 'file:/gone.mp4', removedAt: 7 }]));
  const store = createWatchLibraryStore({ filePath: file, tombstonePath: sidecar });
  const doc = store.loadDocument();
  assert.equal(doc.legacyTombstoneSidecarImported, true);
  assert.equal(doc.tombstones.length, 1);
  store.resetCache();
  const doc2 = store.loadDocument();
  assert.equal(doc2.tombstones.length, 1); // ikinci okumada tekrar uygulanmaz
});

test('geçiş commit\'inde önceki ham dosya .bak\'a taşınır (geri dönüş)', () => {
  const file = path.join(root, 'watch-rollback.json');
  const legacy = [{ key: 'file:/old.mp4', title: 'Eski', lastWatched: 4 }];
  fs.writeFileSync(file, j(legacy));
  const store = createWatchLibraryStore({ filePath: file });
  store.loadDocument(); // geçiş commit'i
  const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(backup[0].key, 'file:/old.mp4'); // ham dizi okunabilir duruyor
  assert.equal(store.loadDocument().schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('birincil+yedek okunamıyorsa hata fırlatılır ve dosyalar korunur', () => {
  const file = path.join(root, 'watch-corrupt.json');
  fs.writeFileSync(file, '~~~json değil~~~');
  fs.writeFileSync(`${file}.bak`, '~~~o da bozuk~~~');
  const store = createWatchLibraryStore({ filePath: file });
  assert.throws(() => store.load(), /korunuyor/);
  assert.equal(fs.readFileSync(file, 'utf8'), '~~~json değil~~~');
});

// ---------- C. media-catalog.json: eski minimal kayıtlar ----------
test('minimal eski katalog kayıtları okunur ve varsayılanlar tamamlanır', () => {
  const file = path.join(root, 'catalog-min.json');
  fs.writeFileSync(file, j({ version: 1, items: [
    { kind: 'film', title: 'Sadece ad' },
    { kind: 'series', title: 'Dizi', episodes: [{ season: 1, number: 1 }] },
  ] }));
  const store = createMediaCatalogStore({ filePath: file });
  const items = store.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'film');
  assert.equal(items[1].episodes.length, 1);
});

test('geçersiz kayıt içeren katalog koruma hatası verir, veri değişmez', () => {
  const file = path.join(root, 'catalog-bad.json');
  const raw = j({ version: 1, items: [{ title: 'kind yok' }] });
  fs.writeFileSync(file, raw);
  const store = createMediaCatalogStore({ filePath: file });
  assert.throws(() => store.list(), /korunuyor|tür/i);
  assert.equal(fs.readFileSync(file, 'utf8'), raw); // dosya korundu
});

test('katalog yazımı önceki birincili yedeğe taşır (geri dönüş)', () => {
  const file = path.join(root, 'catalog-rollback.json');
  fs.writeFileSync(file, j({ version: 1, items: [{ id: 'k1', kind: 'film', title: 'Eski' }] }));
  const store = createMediaCatalogStore({ filePath: file });
  store.upsert({ id: 'k1', kind: 'film', title: 'Yeni ad' });
  const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(backup.items[0].title, 'Eski');
});

fs.rmSync(root, { recursive: true, force: true });
console.log(`schema-migration-fixtures: ${passed} test`);
