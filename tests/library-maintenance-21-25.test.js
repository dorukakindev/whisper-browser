// 50'lik kuyruk maddeleri 21-25 — kütüphane bakımı:
// 21 artımlı tarama "kaybolan" listesi (collectMissingSources),
// 22 mükerrer kayıt bulma/birleştirme (findLibraryDuplicates/mergeWatchItems/mergeMediaIds),
// 24 toplu yol yeniden bağlama planlayıcısı (planBulkRelink),
// 25 paket taşıma sihirbazı eksik-ortam grupları (missingLocalMedia).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  planBulkRelink, findLibraryDuplicates, mergeWatchItems, collectMissingSources, looksLikeAbsoluteDir,
} = require('../src/media-relink-matcher');
const { missingLocalMedia } = require('../src/workspace-package');
const { WatchIndex } = require('../src/watch-index');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

// ---------- yardımcılar ----------
const fileItem = (over = {}) => ({
  key: `file:${(over.localPath || 'd:/medya/film.mkv').toLowerCase()}`,
  type: 'local',
  title: 'Film',
  localPath: over.localPath || 'D:/Medya/film.mkv',
  sourceRef: over.localPath || 'D:/Medya/film.mkv',
  duration: 0, position: 0, lastWatched: 0, sizeBytes: 0,
  ...over,
});

// ---------- planBulkRelink (madde 24) ----------
test('planBulkRelink: önek sınırı — aynı isimli kardeş klasör eşleşmez', () => {
  const items = [
    fileItem({ localPath: 'D:/Medya/film1.mkv' }),
    fileItem({ localPath: 'D:/MedyaExtra/film2.mkv' }), // önek uzantılı, eşleşmemeli
    fileItem({ localPath: 'C:/Baska/film3.mkv' }),
  ];
  const plan = planBulkRelink(items, { oldPrefix: 'D:/Medya', newPrefix: 'E:/Medya', exists: () => true });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].candidate, 'E:/Medya/film1.mkv');
});

test('planBulkRelink: durum matrisi — alive/ready/missing/pending', () => {
  const disk = new Set(['D:/Medya/saglam.mkv', 'E:/Medya/tasindi.mkv']);
  const items = [
    fileItem({ localPath: 'D:/Medya/saglam.mkv', title: 'Saglam' }),
    fileItem({ localPath: 'D:/Medya/tasindi.mkv', title: 'Tasindi' }),
    fileItem({ localPath: 'D:/Medya/kayip.mkv', title: 'Kayip' }),
  ];
  const plan = planBulkRelink(items, {
    oldPrefix: 'D:/Medya', newPrefix: 'E:/Medya',
    exists: (p) => disk.has(p),
  });
  const byTitle = Object.fromEntries(plan.rows.map((row) => [row.title, row.status]));
  assert.equal(byTitle.Saglam, 'alive');
  assert.equal(byTitle.Tasindi, 'ready');
  assert.equal(byTitle.Kayip, 'missing');
});

test('planBulkRelink: yeni kök boşken kayıplar pending kalır, dosya olmayan kayıtlar taranmaz', () => {
  const items = [
    fileItem({ localPath: 'D:/Medya/kayip.mkv' }),
    { key: 'youtube:abc', type: 'youtube', title: 'Web', sourceRef: 'https://youtube.com/x', localPath: '' },
  ];
  const plan = planBulkRelink(items, { oldPrefix: 'D:/Medya', exists: () => false });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].status, 'pending');
  assert.equal(plan.rows[0].candidate, '');
});

test('planBulkRelink: Windows/UNC ve ters eğik çizgi varyantları normalize edilir', () => {
  const items = [fileItem({ localPath: 'D:\\Medya\\Alt\\film.mkv' })];
  const plan = planBulkRelink(items, {
    oldPrefix: 'd:\\medya', newPrefix: '\\\\NAS\\Medya',
    exists: (p) => p.startsWith('//NAS'),
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].status, 'ready');
  assert.equal(plan.rows[0].candidate, '//NAS/Medya/Alt/film.mkv');
});

test('looksLikeAbsoluteDir: mutlak yol kapısı', () => {
  assert.equal(looksLikeAbsoluteDir('D:/Medya'), true);
  assert.equal(looksLikeAbsoluteDir('\\\\nas\\share'), true);
  assert.equal(looksLikeAbsoluteDir('/mnt/media'), true);
  assert.equal(looksLikeAbsoluteDir('filmler'), false);
  assert.equal(looksLikeAbsoluteDir('https://x'), false);
  assert.equal(looksLikeAbsoluteDir(''), false);
});

// ---------- findLibraryDuplicates (madde 22) ----------
test('findLibraryDuplicates: aynı dosya adı + eşit boyut → güçlü grup', () => {
  const items = [
    fileItem({ localPath: 'D:/Filmler/Matrix.mkv', sizeBytes: 1024, title: 'Matrix A' }),
    fileItem({ localPath: 'E:/Yedek/Matrix.mkv', sizeBytes: 1024, title: 'Matrix B' }),
    fileItem({ localPath: 'D:/Filmler/Baska.mkv', sizeBytes: 1024 }),
  ];
  const groups = findLibraryDuplicates(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strong, true);
  assert.equal(groups[0].reason, 'Aynı ad ve dosya boyutu');
  assert.equal(groups[0].members.length, 2);
});

test('findLibraryDuplicates: aynı dosya adı + yakın süre → zayıf grup', () => {
  const items = [
    fileItem({ localPath: 'D:/a/Show.mkv', duration: 3600 }),
    fileItem({ localPath: 'E:/b/Show.mkv', duration: 3600 + 30 }), // %2 pay içinde
  ];
  const groups = findLibraryDuplicates(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strong, false);
  assert.equal(groups[0].reason, 'Aynı ad ve yaklaşık süre');
});

test('findLibraryDuplicates: kanıt yoksa ve web kayıtları gruplanmaz', () => {
  const items = [
    fileItem({ localPath: 'D:/a/Same.mkv', duration: 100, sizeBytes: 0 }),
    fileItem({ localPath: 'E:/b/Same.mkv', duration: 5000, sizeBytes: 0 }),
    { key: 'youtube:x', type: 'youtube', localPath: '', sourceRef: 'https://x', title: 'Same' },
  ];
  assert.equal(findLibraryDuplicates(items).length, 0);
});

// ---------- mergeWatchItems (madde 22) ----------
test('mergeWatchItems: konum/süre max, ilk-izleme min, tamamlama VE/öncelik', () => {
  const target = fileItem({ key: 'file:d:/keep.mkv', position: 300, duration: 3600, lastWatched: 2000, firstWatched: 1000, completed: false, revision: 2 });
  const source = fileItem({ key: 'file:d:/drop.mkv', position: 900, duration: 3700, lastWatched: 1500, firstWatched: 500, completed: true, automaticCompleted: true, revision: 1 });
  const merged = mergeWatchItems(source, target);
  assert.equal(merged.key, 'file:d:/keep.mkv');
  assert.equal(merged.position, 900);
  assert.equal(merged.duration, 3700);
  assert.equal(merged.lastWatched, 2000);
  assert.equal(merged.firstWatched, 500);
  assert.equal(merged.automaticCompleted, true);
  assert.equal(merged.completed, false); // hedef alanlarından gelen değer korunur
  assert.ok(merged.legacyKeys.includes('file:d:/drop.mkv'));
});

test('mergeWatchItems: koleksiyon/altyazı/prefs birleşimi + oturum toplamı', () => {
  const target = fileItem({ key: 'file:d:/keep.mkv', collections: ['fav'], subtitlePaths: ['a.srt'],
    prefs: { a: 1 }, sessions: [{ id: 's1', startedAt: 100, watchSeconds: 10, device: 'pc' }], revision: 1 });
  const source = fileItem({ key: 'file:d:/drop.mkv', collections: ['fav', 'dizi'], subtitlePaths: ['a.srt', 'b.srt'],
    prefs: { a: 9, b: 2 }, sessions: [{ id: 's1', startedAt: 100, watchSeconds: 99, device: 'pc' }, { id: 's2', startedAt: 200, watchSeconds: 5, device: 'pc' }], revision: 1 });
  const merged = mergeWatchItems(source, target);
  assert.deepEqual([...merged.collections].sort(), ['dizi', 'fav']);
  assert.deepEqual([...merged.subtitlePaths].sort(), ['a.srt', 'b.srt']);
  assert.equal(merged.prefs.a, 1); // hedef (saklanan kayıt) değeri korur
  assert.equal(merged.prefs.b, 2); // yalnız kaynakta olan alan eklenir
  assert.equal(merged.sessions.length, 2); // s1 kimliğe göre tekilleşti
  assert.equal(merged.sessions.find((s) => s.id === 's1').watchSeconds, 10); // hedef kayıt otoritesi
  assert.equal(merged.totalWatchSeconds, 15);
});

test('mergeWatchItems: hedefe dönüşüm kimliği yoksa sourceKey zorunludur', () => {
  assert.throws(() => mergeWatchItems(fileItem(), fileItem({ key: '' })), /hedef kayıt/);
});

// ---------- collectMissingSources (madde 21) ----------
test('collectMissingSources: kök altındaki kayıp yerel kaynaklar listelenir', () => {
  const catalogItems = [
    { title: 'Film1', source: { type: 'local', value: 'D:/Medya/film1.mkv' } },
    { title: 'Film2', source: { type: 'local', value: 'D:/Medya/film2.mkv' } },
    { title: 'BaskaKok', source: { type: 'local', value: 'C:/Disarda/film3.mkv' } },
    { title: 'Dizi', source: null, episodes: [
      { source: { type: 'local', value: 'D:/Medya/dizi/b1.mkv' } },
      { source: { type: 'local', value: 'D:/Medya/dizi/b2.mkv' } },
      { source: { type: 'url', value: 'https://x/v.mp4' } },
    ] },
  ];
  const disk = new Set(['d:/medya/film1.mkv']);
  const rows = collectMissingSources(catalogItems, 'D:/Medya', (p) => disk.has(p.toLowerCase()));
  const paths = rows.map((row) => row.path).sort();
  assert.deepEqual(paths, ['D:/Medya/dizi/b1.mkv', 'D:/Medya/dizi/b2.mkv', 'D:/Medya/film2.mkv']);
  assert.equal(rows.find((row) => row.path.endsWith('b1.mkv')).title, 'Dizi');
});

test('collectMissingSources: exists atmaları kayıp sayılır, sınırı aşan yol atlanır', () => {
  const rows = collectMissingSources([{ source: { type: 'local', value: 'D:/x/f.mkv' } }], 'D:/x', () => { throw new Error('io'); });
  assert.equal(rows.length, 1);
});

// ---------- missingLocalMedia (madde 25) ----------
test('missingLocalMedia: paket içindeki eksik mutlak yollar kök bazında gruplanır', () => {
  const pkg = {
    files: [
      { name: 'watch-library.json', data: Buffer.from(JSON.stringify({
        items: [
          { localPath: 'D:/Filmler/a.mkv' },
          { localPath: 'D:/Filmler/b.mkv' },
          { localPath: 'https://youtube.com/x' }, // url değil
          { localPath: 'E:/Var/ok.mkv' },
        ],
      })).toString('base64') },
      { name: 'media-catalog.json', data: Buffer.from(JSON.stringify({
        items: [
          { title: 'Film', source: { type: 'local', value: 'D:/Filmler/c.mkv' } },
          { title: 'Dizi', episodes: [{ source: { type: 'local', value: 'D:/Diziler/d1.mkv' } }] },
        ],
      })).toString('base64') },
    ],
  };
  const exists = (p) => p === 'E:/Var/ok.mkv';
  const groups = missingLocalMedia(pkg, exists);
  assert.equal(groups.length, 2);
  const roots = groups.map((g) => g.root).sort();
  assert.deepEqual(roots, ['D:/Diziler', 'D:/Filmler'].sort());
  const films = groups.find((g) => g.root === 'D:/Filmler');
  assert.equal(films.count, 3); // a, b, c aynı kök
});

test('missingLocalMedia: bozuk/eksik dosya ve olmayan kökler güvenle atlanır', () => {
  const pkg = { files: [{ name: 'watch-library.json', data: '%%%bozuk%%%' }] };
  assert.deepEqual(missingLocalMedia(pkg, () => false), []);
  assert.deepEqual(missingLocalMedia({ files: [] }, () => false), []);
});

// ---------- mergeMediaIds (gerçek sqlite, madde 22) ----------
// Bazı Node derlemelerinde node:sqlite FTS5'siz gelir — watch-index-assets
// testindeki gibi prob yap, yoksa bu bölümü atla.
const { databaseConstructor } = require('../src/watch-index');
const FtsDatabase = databaseConstructor();
let hasFts5 = false;
if (FtsDatabase) {
  const probe = new FtsDatabase(':memory:');
  try { probe.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(value)'); hasFts5 = true; }
  catch (_) { hasFts5 = false; }
  finally { probe.close(); }
}

function makeIndex() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-merge-'));
  const index = new WatchIndex(path.join(dir, 'watch.db'));
  return { index, dir };
}

if (hasFts5) {

test('mergeMediaIds: hedef satır korunur; iz/not taşınır, kimlik çakışması atılır, kaynak silinir', () => {
  const { index, dir } = makeIndex();
  try {
    index.upsertMedia({ id: 'file:keep', title: 'Hedef', duration: 3600, position: 500, completed: 0, lastWatched: 9 });
    index.upsertMedia({ id: 'file:drop', title: 'Kaynak', duration: 3500, position: 800, completed: 1, lastWatched: 5 });
    index.upsertTrack({ id: 't1', mediaId: 'file:keep', role: 'source', language: 'en' });
    index.upsertTrack({ id: 't1', mediaId: 'file:drop', role: 'source', language: 'tr' }); // kimlik çakışması → atılır
    index.upsertTrack({ id: 't2', mediaId: 'file:drop', role: 'translation', language: 'tr' });
    index.upsertAnnotation({ id: 'a1', mediaId: 'file:drop', type: 'note', start: 10, end: 20 });
    const result = index.mergeMediaIds('file:drop', 'file:keep');
    assert.equal(result.id, 'file:keep');
    assert.equal(result.title, 'Hedef'); // hedef alanları korunur
    assert.equal(result.position, 500);
    const tracks = index.db.prepare('SELECT id, language FROM tracks WHERE media_id = ? ORDER BY id').all('file:keep');
    assert.deepEqual(tracks, [{ id: 't1', language: 'en' }, { id: 't2', language: 'tr' }]);
    const notes = index.db.prepare('SELECT id FROM annotations WHERE media_id = ?').all('file:keep');
    assert.deepEqual(notes, [{ id: 'a1' }]);
    assert.equal(index.getMedia('file:drop'), null);
  } finally {
    index.close?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeMediaIds: kaynak yoksa null; hedef yoksa kaynak kopyalanır', () => {
  const { index, dir } = makeIndex();
  try {
    assert.equal(index.mergeMediaIds('file:yok', 'file:hedef'), null);
    index.upsertMedia({ id: 'file:src', title: 'S', position: 12 });
    const row = index.mergeMediaIds('file:src', 'file:new');
    assert.equal(row.id, 'file:new');
    assert.equal(row.title, 'S');
    assert.equal(index.getMedia('file:src'), null);
  } finally {
    index.close?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

} else {
  console.log('library-maintenance-21-25: mergeMediaIds entegrasyonu bu Node derlemesinde FTS5 olmadığı için atlandı');
}

console.log(`${passed} passed — library-maintenance-21-25`);
