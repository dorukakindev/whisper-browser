'use strict';
// BROWSER_BUG_REPORT_86 düzeltmelerinin davranışsal regresyon testleri.
// Her bölüm rapordaki bulgu kimliğiyle işaretli; sözleşmeler tur-2
// talimatındaki kabul koşullarından gelir.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');

const { exportPackage, readPackage, restorePackage } = require('../src/workspace-package');
const videoPackages = require('../src/workspace-video-package');
const { findTestPython } = require('./python-runtime');
const { WatchIndex, selectPrunableTracks } = require('../src/watch-index');
const { collectTrackAssetRefs, pruneAndSweepTracks } = require('../src/browser-asset-gc');
const { writeJsonAtomic, writeMirroredJsonAtomic } = require('../src/atomic-json');
const { writeBrowserSessionAtomic, readBrowserSession } = require('../src/browser-session-store');
const { BrowserNoteStore } = require('../src/browser-note-store');
const { createWatchLibraryStore, stableJson } = require('../src/watch-library-store');
const { createPlaybackDiagnosticTracker } = require('../src/browser-playback-diagnostics');
const { buildTranscriptEvidence } = require('../src/browser-transcript-search');
const { saveCeaCheckpoint, loadCeaCheckpoint } = require('../src/browser-cea-checkpoint');
const sitePermissions = require('../src/browser-site-permissions');

const results = [];
const test = (name, fn) => {
  const entry = ['PENDING', name];
  results.push(entry);
  Promise.resolve()
    .then(fn)
    .then(() => { entry[0] = 'PASS'; })
    .catch((error) => { entry[0] = 'FAIL'; entry[1] = `${name} :: ${error.message}`; });
};

const eacces = () => {
  const error = new Error('EACCES: permission denied');
  error.code = 'EACCES';
  throw error;
};

// fs'nin yalnız istenen metodunu hata enjekte eden sarmalayıcı — gerçek
// kullanıcı verisi değil, sentetik temp dosyaları üzerinde çalışır.
function faultedIo(overrides = {}) {
  const names = ['mkdirSync', 'writeFileSync', 'renameSync', 'existsSync', 'unlinkSync',
    'copyFileSync', 'readFileSync', 'rmSync', 'statSync', 'readdirSync', 'lstatSync',
    'openSync', 'readSync', 'writeSync', 'closeSync', 'rmdirSync', 'fsyncSync', 'appendFileSync'];
  const io = {};
  for (const name of names) if (typeof fs[name] === 'function') io[name] = fs[name].bind(fs);
  return Object.assign(io, overrides);
}

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...paths) {
  for (const target of paths) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// R86-01 — video paketi mutlak yol sızıntısı
// ---------------------------------------------------------------------------

function writeCatalog(root, items) {
  fs.writeFileSync(path.join(root, 'media-catalog.json'), JSON.stringify({ version: 1, items }));
}

const VIDEO_EXT = '.mp4';
function expectedName(source) {
  return 'videos/' + createHash('sha256').update(source).digest('hex') + VIDEO_EXT;
}

// Senaryo A: video userData kökü DIŞINDA (kullanıcı dizinini temsil eden yol)
test('R86-01: kök dışı video pakete mutlak yol sızdırmaz', async () => {
  const python = findTestPython();
  assert.ok(python, 'test python yorumlayıcısı gerekli');
  const root = tmpdir('wb-r86-src-');
  const outside = path.join(tmpdir('wb-r86-user-'), 'Users', 'Ahmet', 'Videos');
  const output = path.join(tmpdir('wb-r86-out-'), 'paket.wbp');
  try {
    fs.mkdirSync(outside, { recursive: true });
    const videoAbs = path.join(outside, 'secret-user-film.mp4');
    fs.writeFileSync(videoAbs, 'sentetik-video');
    writeCatalog(root, [{ id: 'v1', kind: 'film', title: 'Gizli Film',
      source: { type: 'local', value: videoAbs } }]);
    await videoPackages.exportWithVideos(root, output, {}, python);
    const data = await videoPackages.read(output, python);
    const manifestText = JSON.stringify(data);
    assert.equal(data.videos.length, 1);
    assert.equal(data.videos[0].source, `{{VIDEO}}/${expectedName(videoAbs)}`,
      'manifest kaynağı paket-içi takma kimlik olmalı');
    assert.equal(path.isAbsolute(data.videos[0].source), false);
    for (const leak of [videoAbs, 'Ahmet', 'secret-user-film', outside]) {
      assert.ok(!manifestText.includes(leak), `manifest sızıntısı: ${leak}`);
    }
    for (const [from] of data.mappings) assert.equal(path.isAbsolute(from), false);
  } finally { cleanup(root, outside, path.dirname(output)); }
});

// Senaryo B: video paket kökü İÇİNDE de aynı takma kimlik kullanılır
test('R86-01: kök içi video da takma kimlikle yazılır', async () => {
  const python = findTestPython();
  assert.ok(python, 'test python yorumlayıcısı gerekli');
  const root = tmpdir('wb-r86-src-');
  const output = path.join(tmpdir('wb-r86-out-'), 'paket.wbp');
  try {
    const videoAbs = path.join(root, 'media', 'yerel-film.mp4');
    fs.mkdirSync(path.dirname(videoAbs), { recursive: true });
    fs.writeFileSync(videoAbs, 'sentetik-video');
    writeCatalog(root, [{ id: 'v2', kind: 'film', title: 'Yerel Film',
      source: { type: 'local', value: videoAbs } }]);
    await videoPackages.exportWithVideos(root, output, {}, python);
    const data = await videoPackages.read(output, python);
    assert.equal(data.videos.length, 1);
    assert.equal(data.videos[0].source, `{{VIDEO}}/${expectedName(videoAbs)}`);
    const catalogFile = data.files.find((f) => f.name === 'media-catalog.json');
    const catalog = JSON.parse(Buffer.from(catalogFile.data, 'base64').toString('utf8'));
    assert.equal(catalog.items[0].source.value, `{{VIDEO}}/${expectedName(videoAbs)}`,
      'katalog kaydı da takma kimlik taşımalı');
    assert.ok(!JSON.stringify(data).includes(videoAbs));
  } finally { cleanup(root, path.dirname(output)); }
});

// Senaryo C: uçtan uca — dış-kök video paketlenir, hedef köke çıkarılır,
// katalog yeni yerel hedefe bağlanır
test('R86-01: extract + restore takma kimliği yeni yerel hedefe bağlar', async () => {
  const python = findTestPython();
  assert.ok(python, 'test python yorumlayıcısı gerekli');
  const root = tmpdir('wb-r86-src-');
  const target = tmpdir('wb-r86-dst-');
  const outside = path.join(tmpdir('wb-r86-user-'), 'Users', 'Ahmet');
  const output = path.join(tmpdir('wb-r86-out-'), 'paket.wbp');
  try {
    const videoAbs = path.join(outside, 'film.mp4');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(videoAbs, 'sentetik-video-icerigi');
    writeCatalog(root, [{ id: 'v3', kind: 'film', title: 'Film',
      source: { type: 'local', value: videoAbs } }]);
    await videoPackages.exportWithVideos(root, output, {}, python);
    const data = await videoPackages.read(output, python);
    const folder = await videoPackages.extract(target, data, python);
    assert.equal(data.videoMappings.length, 1);
    const [alias, extractedTarget] = data.videoMappings[0];
    assert.equal(alias, `{{VIDEO}}/${expectedName(videoAbs)}`);
    assert.ok(extractedTarget.startsWith(folder));
    assert.equal(fs.readFileSync(extractedTarget, 'utf8'), 'sentetik-video-icerigi');
    const applied = restorePackage(target, data, data.videoMappings);
    assert.ok(applied > 0);
    const restored = JSON.parse(fs.readFileSync(path.join(target, 'media-catalog.json'), 'utf8'));
    assert.equal(restored.items[0].source.value, extractedTarget,
      'katalog kaynağı çıkarılan yerel hedefe bağlanmalı');
    assert.equal(restored.items[0].source.imported, true, 'içe aktarılan kaynak doğrulama ister');
  } finally { cleanup(root, target, outside, path.dirname(output)); }
});

// Senaryo D: geriye uyumluluk — eski (mutlak yollu) paket hâlâ açılır
test('R86-01: eski mutlak-yollu paket geriye uyumlu açılır', async () => {
  const python = findTestPython();
  assert.ok(python, 'test python yorumlayıcısı gerekli');
  const work = tmpdir('wb-r86-legacy-');
  const target = tmpdir('wb-r86-dst-');
  const fixture = path.join(work, 'fixture.mp4');
  try {
    fs.writeFileSync(fixture, 'eski-paket-video');
    const oldSource = 'C:\\Users\\K\\Movies\\eski-film.mp4';
    const catalog = { version: 1, items: [{ id: 'v4', kind: 'film', title: 'Eski',
      source: { type: 'local', value: oldSource } }] };
    const name = 'videos/' + 'a'.repeat(64) + '.mp4';
    const manifest = path.join(work, 'manifest.wbp');
    fs.writeFileSync(manifest, gzipSync(Buffer.from(JSON.stringify({
      format: 'whisper-workspace', version: 1, created: new Date().toISOString(),
      sourceRoot: '{{ROOT}}', mappings: [], rendererValues: {},
      videos: [{ source: oldSource, name, size: 16 }],
      files: [{ name: 'media-catalog.json', data: Buffer.from(JSON.stringify(catalog)).toString('base64') }],
    }))));
    const archive = path.join(work, 'legacy.wbp');
    const written = spawnSync(python,
      [path.resolve(__dirname, '../backend/workspace_video_package.py')],
      { input: JSON.stringify({ action: 'write', manifest, videos: [{ source: fixture, name }], output: archive }),
        encoding: 'utf8', timeout: 60000 });
    assert.equal(written.status, 0, written.stderr || written.stdout);
    assert.equal(JSON.parse(written.stdout).ok, true);
    const data = await videoPackages.read(archive, python);
    assert.equal(data.videos[0].source, oldSource, 'eski biçim olduğu gibi okunur');
    await videoPackages.extract(target, data, python);
    const [from, to] = data.videoMappings[0];
    assert.equal(from, oldSource);
    restorePackage(target, data, data.videoMappings);
    const restored = JSON.parse(fs.readFileSync(path.join(target, 'media-catalog.json'), 'utf8'));
    assert.equal(restored.items[0].source.value, to, 'eski mutlak yol da yeni hedefe bağlanır');
    assert.equal(fs.readFileSync(to, 'utf8'), 'eski-paket-video');
  } finally { cleanup(work, target); }
});

// Senaryo E: arşivde olmayan video sessizce yanlış dosyaya bağlanmaz
test('R86-01: pakette olmayan video yanlış dosyaya bağlanmaz, relink kalır', async () => {
  const python = findTestPython();
  assert.ok(python, 'test python yorumlayıcısı gerekli');
  const root = tmpdir('wb-r86-src-');
  const target = tmpdir('wb-r86-dst-');
  const outside = tmpdir('wb-r86-user-');
  const output = path.join(tmpdir('wb-r86-out-'), 'paket.wbp');
  try {
    const videoAbs = path.join(outside, 'film.mp4');
    fs.writeFileSync(videoAbs, 'icerik');
    writeCatalog(root, [{ id: 'v5', kind: 'film', title: 'Film',
      source: { type: 'local', value: videoAbs } }]);
    await videoPackages.exportWithVideos(root, output, {}, python);
    const data = await videoPackages.read(output, python);
    // Arşivde hiç var olmamış ikinci bir video girdisi enjekte et.
    const alias = `{{VIDEO}}/videos/${'b'.repeat(64)}.mp4`;
    data.videos.push({ source: alias, name: `videos/${'b'.repeat(64)}.mp4`, size: 5 });
    await videoPackages.extract(target, data, python);
    assert.equal(data.videoMappings.length, 1, 'yalnız gerçekten çıkarılan video eşlenir');
    assert.deepEqual(data.missingVideos, [alias], 'eksik girdi raporlanır');
    assert.ok(!data.videoMappings.some(([from]) => from === alias),
      'eksik video başka dosyaya bağlanmamalı');
  } finally { cleanup(root, target, outside, path.dirname(output)); }
});

// ---------------------------------------------------------------------------
// R86-02 — pruneTracks referans koruması
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const NOW = 200 * DAY;

test('R86-02: selectPrunableTracks — referanslı yaşlı satır korunur', () => {
  const old = NOW - 181 * DAY;
  const fresh = NOW - 10 * DAY;
  const rows = [
    { id: 't-fresh', asset_path: 'aaaabbbbccccdddd11112222:eeeeffffffff0000111122223333', updated_at: fresh },
    { id: 't-ref', asset_path: 'ffff00001111222233334444:aaaabbbbccccddddeeee00001111', updated_at: old },
    { id: 't-free', asset_path: '000011112222333344445555:6666777788889999aaaabbbb', updated_at: old },
  ];
  const keep = new Set(['ffff00001111222233334444:aaaabbbbccccddddeeee00001111']);
  const removed = selectPrunableTracks(rows, { now: NOW, keep });
  assert.deepEqual(removed.map((r) => r.id), ['t-free'],
    'yalnız referanssız yaşlı satır budanmalı');
  const removedAll = selectPrunableTracks(rows, { now: NOW });
  assert.equal(removedAll.length, 2, 'korumasız her iki yaşlı satır budanır');
});

test('R86-02: keep kümesi büyük/küçük harf duyarsız eşleşir', () => {
  const old = NOW - 200 * DAY;
  const rows = [{ id: 'x', asset_path: 'AAAA00001111222233334444:BBBB11112222333344445555', updated_at: old }];
  const removed = selectPrunableTracks(rows, {
    now: NOW, keep: new Set(['aaaa00001111222233334444:bbbb11112222333344445555']) });
  assert.equal(removed.length, 0);
});

test('R86-02: WatchIndex.pruneTracks keep kümesini satır silmeden önce uygular', () => {
  const old = Date.now() - 181 * DAY;
  const fresh = Date.now();
  const refPath = 'aaaa00001111222233334444:bbbb11112222333344445555';
  const freePath = 'cccc66667777888899990000:dddd11112222333344445555';
  const rows = [
    { id: 't-fresh', asset_path: 'eeee55556666777788889999:0000aaaabbbbccccddddeeee', updated_at: fresh },
    { id: 't-ref', asset_path: refPath, updated_at: old },
    { id: 't-free', asset_path: freePath, updated_at: old },
  ];
  const deleted = [];
  const index = Object.create(WatchIndex.prototype);
  index.db = {
    prepare: (sql) => sql.includes('DELETE')
      ? { run: (id) => deleted.push(id) }
      : { all: () => rows.slice() },
    exec: () => {},
  };
  const removed = index.pruneTracks({ keep: new Set([refPath]) });
  assert.deepEqual(removed.map((r) => r.id), ['t-free']);
  assert.deepEqual(deleted, ['t-free'], 'referanslı satır dizinden silinmemeli');
});

test('R86-02: pruneAndSweepTracks aynı koruma kümesini paylaşır', () => {
  const refPath = 'aaaa00001111222233334444:bbbb11112222333344445555';
  const keptIndexPath = '111122223333444455556666:7777888899990000aaaabbbb';
  const calls = { removed: [], swept: null, kept: null };
  const candidates = [
    { id: 't1', asset_path: 'cccc66667777888899990000:dddd11112222333344445555' },
    { id: 't2', asset_path: refPath },
  ];
  const index = {
    pruneTracks: (options) => {
      calls.kept = options.keep;
      return candidates.filter((row) => !options.keep.has(String(row.asset_path).toLowerCase()));
    },
    listTrackAssetPaths: () => [refPath, keptIndexPath],
  };
  const store = {
    removeTrack: (asset) => calls.removed.push(asset),
    sweepOrphans: (set) => { calls.swept = set; },
  };
  pruneAndSweepTracks(index, store, new Set([refPath]));
  assert.ok(calls.kept instanceof Set && calls.kept.has(refPath),
    'pruneTracks referans kümesini almalı');
  assert.deepEqual(calls.removed, ['cccc66667777888899990000:dddd11112222333344445555'],
    'referanslı varlık silinmemeli');
  assert.ok(calls.swept.has(refPath) && calls.swept.has(keptIndexPath),
    'sweep aynı koruma kümesini kullanmalı');
});

test('R86-02: session ve workspace referansları ayrı ayrı korur; bozuk ref çökertmez', () => {
  const sessionAsset = 'aaaa00001111222233334444:bbbb11112222333344445555';
  const wsAsset = 'cccc66667777888899990000:DDDD11112222333344445555';
  const refs = collectTrackAssetRefs(
    [{ trackRefs: [{ assetId: sessionAsset }] }],            // oturum sekmesi
    [{ trackRefs: [{ assetId: wsAsset.toUpperCase() }] }],   // workspace sekmesi
    [{ trackRefs: [null, {}, { assetId: '' }, { assetId: 0 }] }], // bozuk girdiler
    undefined, null,
  );
  assert.ok(refs.has(sessionAsset));
  assert.ok(refs.has(wsAsset.toLowerCase()), 'assetId normalize edilir');
  assert.equal(refs.size, 2, 'boş/falsy referanslar eklenmez');
});

// ---------------------------------------------------------------------------
// R86-03 — .bak ayna hatası sahte başarı döndürmez
// ---------------------------------------------------------------------------

const SESSION_OK = () => ({ version: 2, savedAt: 1, restoreEnabled: true,
  tabs: [{ id: 't1', url: 'https://ornek.test/', title: 'x', history: [], historyIndex: 0 }] });

test('R86-03: session mirror — copyFileSync EACCES sahte başarı döndürmez', () => {
  const dir = tmpdir('wb-r86-sess-');
  try {
    const file = path.join(dir, 'browser-session.json');
    const oldSecret = { version: 2, savedAt: 0, restoreEnabled: true,
      tabs: [{ id: 'old', url: 'https://gizli.test/', title: 'SECRET-OLD', history: [], historyIndex: 0 }] };
    fs.writeFileSync(file, JSON.stringify(oldSecret));
    fs.writeFileSync(`${file}.bak`, JSON.stringify(oldSecret));
    const result = writeBrowserSessionAtomic(file, SESSION_OK(),
      faultedIo({ copyFileSync: eacces }), { mirrorBackup: true });
    assert.equal(result.ok, false, 'ayna hatası başarı gibi raporlanmamalı');
    assert.ok(String(result.error).includes('EACCES'));
    // Birincil ve yedek eski durumda kalır; bir sonraki okuma tutarlıdır.
    assert.equal(readBrowserSession(file).tabs[0].title, 'SECRET-OLD');
    assert.ok(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).tabs[0].title === 'SECRET-OLD');
  } finally { cleanup(dir); }
});

test('R86-03: session mirror — rename EACCES birincili korur', () => {
  const dir = tmpdir('wb-r86-sess-');
  try {
    const file = path.join(dir, 'browser-session.json');
    fs.writeFileSync(file, JSON.stringify(SESSION_OK()));
    fs.writeFileSync(`${file}.bak`, JSON.stringify(SESSION_OK()));
    const result = writeBrowserSessionAtomic(file, { ...SESSION_OK(), savedAt: 9 },
      faultedIo({ renameSync: eacces }), { mirrorBackup: true });
    assert.equal(result.ok, false);
    assert.equal(readBrowserSession(file).savedAt, 1, 'birincil eski durumda kalır');
  } finally { cleanup(dir); }
});

test('R86-03: session mirror — copyFileSync + unlink EACCES bile hata yüzeylenir', () => {
  const dir = tmpdir('wb-r86-sess-');
  try {
    const file = path.join(dir, 'browser-session.json');
    const result = writeBrowserSessionAtomic(file, SESSION_OK(),
      faultedIo({ copyFileSync: eacces, unlinkSync: eacces }), { mirrorBackup: true });
    assert.equal(result.ok, false, 'temp temizliği de düşse sonuç başarısız kalır');
    assert.equal(fs.existsSync(file), false, 'başarısız yazım birincil oluşturmamalı');
  } finally { cleanup(dir); }
});

test('R86-03: session mirror — mutlu yol birincil+yedeği birlikte günceller', () => {
  const dir = tmpdir('wb-r86-sess-');
  try {
    const file = path.join(dir, 'browser-session.json');
    fs.writeFileSync(file, JSON.stringify(SESSION_OK()));
    fs.writeFileSync(`${file}.bak`, JSON.stringify(SESSION_OK()));
    const cleared = { version: 2, savedAt: 5, restoreEnabled: true, tabs: [] };
    const result = writeBrowserSessionAtomic(file, cleared, faultedIo(), { mirrorBackup: true });
    assert.equal(result.ok, true);
    assert.equal(readBrowserSession(file).tabs.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).tabs.length, 0,
      'silinen oturum yedekte dirilmemeli');
  } finally { cleanup(dir); }
});

test('R86-03: writeMirroredJsonAtomic — ayna önce yazılır, hata birincili korur', () => {
  const dir = tmpdir('wb-r86-json-');
  try {
    const file = path.join(dir, 'history.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 'eski' }]));
    fs.writeFileSync(`${file}.bak`, JSON.stringify([{ id: 'eski' }]));
    assert.throws(() => writeMirroredJsonAtomic(
      faultedIo({ writeFileSync: (p, ...rest) => p.endsWith('.bak.tmp') || p.includes('.bak') ? eacces() : fs.writeFileSync(p, ...rest) }),
      file, [{ id: 'yeni' }]), /EACCES/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [{ id: 'eski' }],
      'ayna başarısızsa birincil değişmemeli');
    assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), [{ id: 'eski' }],
      'eski yedek korunur — silme işlemi hiç uygulanmamış sayılır');
  } finally { cleanup(dir); }
});

test('R86-03: writeMirroredJsonAtomic — birincil hatası yalnız yedeği güncel bırakır', () => {
  const dir = tmpdir('wb-r86-json-');
  try {
    const file = path.join(dir, 'history.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 'eski' }]));
    let primaryWrite = false;
    const io = faultedIo({
      writeFileSync: (p, ...rest) => {
        if (!p.endsWith('.bak') && !p.endsWith('.bak.tmp') && (p === file || p.startsWith(file + '.'))) {
          if (primaryWrite) eacces();
          primaryWrite = true;
        }
        return fs.writeFileSync(p, ...rest);
      },
      renameSync: (from, to) => { if (to === file) eacces(); return fs.renameSync(from, to); },
    });
    assert.throws(() => writeMirroredJsonAtomic(io, file, [{ id: 'yeni' }]), /EACCES/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [{ id: 'eski' }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), [{ id: 'yeni' }],
      'yedek yeni durumda kalabilir — birincil okuma her zaman kazanır');
  } finally { cleanup(dir); }
});

test('R86-03: writeJsonAtomic — temp temizliği ve içerik bütünlüğü', () => {
  const dir = tmpdir('wb-r86-json-');
  try {
    const file = path.join(dir, 'places.json');
    writeJsonAtomic(faultedIo(), file, { ok: 1 });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ok: 1 });
    assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')).length, 0);
  } finally { cleanup(dir); }
});

test('R86-03: BrowserNoteStore mirror — ayna EACCES bellek/disk ayrıştırmaz', () => {
  const dir = tmpdir('wb-r86-note-');
  try {
    const file = path.join(dir, 'browser-notes.json');
    const store = new BrowserNoteStore(file);
    store.upsert({ id: 'n1', mediaId: 'm1', type: 'note', note: 'SECRET-OLD', createdAt: 1, updatedAt: 1 });
    assert.equal(store.list('m1').length, 1);
    // Ayna kopyasını bozan io enjekte edilmiş ikinci bir store — aynı dosya
    // üzerinde silme işlemi: hata durumunda bellekte kayıt geri döner.
    const faulty = new BrowserNoteStore(file, { io: faultedIo({ copyFileSync: eacces }) });
    assert.throws(() => faulty.remove('n1'), /EACCES/);
    assert.equal(faulty.list('m1').length, 1, 'bellek kaydı geri yüklenmeli');
    assert.equal(store.list('m1').length, 1);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(disk.annotations.length, 1, 'birincil dosya eski durumda kalır');
    const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    assert.equal(backup.annotations.length, 1, 'eski yedek ezilmez — işlem uygulanmadı');
  } finally { cleanup(dir); }
});

test('R86-03: BrowserNoteStore mirror — mutlu yol yedeği güncel duruma çeker', () => {
  const dir = tmpdir('wb-r86-note-');
  try {
    const file = path.join(dir, 'browser-notes.json');
    const store = new BrowserNoteStore(file);
    store.upsert({ id: 'n1', mediaId: 'm1', type: 'note', note: 'veri', createdAt: 1, updatedAt: 1 });
    store.remove('n1');
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    assert.equal(disk.annotations.length, 0);
    assert.equal(backup.annotations.length, 0, 'silinen not yedekte kalmamalı');
  } finally { cleanup(dir); }
});

// watch-library politikası (belgeleyici): .bak bilinçli olarak ÖNCEKİ nesli
// tutar — commit atomiktir, yedek geri-alma noktasıdır; ayna modu yoktur.
test('R86-03: watch-library .bak önceki nesli undo noktası olarak korur', () => {
  const dir = tmpdir('wb-r86-wl-');
  try {
    const file = path.join(dir, 'watch-library.json');
    fs.writeFileSync(file, stableJson([{ key: 'file:a', completed: false, position: 5 }]));
    const store = createWatchLibraryStore({ filePath: file });
    store.loadDocument();
    store.upsert({ key: 'file:a', position: 99 });
    const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
    const primary = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(primary.items[0].position, 99, 'birincil güncel');
    assert.equal(backup.items[0].position, 5,
      'yedek bilinçli olarak önceki nesli tutar (undo noktası)');
  } finally { cleanup(dir); }
});

test('R86-03: watch-library commit fault — birincil dosya bütün kalır', () => {
  const dir = tmpdir('wb-r86-wl-');
  try {
    const file = path.join(dir, 'watch-library.json');
    fs.writeFileSync(file, stableJson([{ key: 'file:a', completed: false, position: 5 }]));
    let injected = false;
    let armed = false;
    const store = createWatchLibraryStore({
      filePath: file,
      fault: (stage) => {
        if (armed && !injected && stage === 'after-backup-replace') { injected = true; throw new Error('FAULT'); }
      },
    });
    store.loadDocument();
    armed = true;
    assert.throws(() => store.upsert({ key: 'file:a', position: 50 }), /FAULT/);
    assert.ok(injected, 'fault aşamasına ulaşılmadı');
    const primary = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(primary.items[0].position, 5, 'yarım commit birincili bozmaz');
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// R86-04 — tanı backoff'u tavanda log seli üretmez
// ---------------------------------------------------------------------------

function stallSample(tracker, seconds, opts = {}) {
  let emitted = 0;
  const ats = [];
  for (let s = 0; s <= seconds; s++) {
    const out = tracker.observeMediaSample({
      paused: false, area: 100, currentTime: opts.advance ? s : 5,
      readyState: opts.readyState ?? 1, spinnerVisible: opts.spinner ?? false,
      videoWidth: 640, videoHeight: 360,
      totalVideoFrames: opts.framesStagnant ? 100 : 100 + s,
    }, s * 1000);
    emitted += out.length;
    for (const item of out) ats.push(s);
  }
  return { emitted, ats };
}

test('R86-04: 10 dakikalık stall sel üretmez — tavan sonrası sabit aralık', () => {
  const tracker = createPlaybackDiagnosticTracker();
  const { emitted, ats } = stallSample(tracker, 600, { readyState: 1 });
  assert.ok(emitted <= 8, `600 sn stall'de en fazla ~8 kayıt beklenir, çıkan: ${emitted}`);
  const lastMinute = ats.filter((s) => s >= 540);
  assert.ok(lastMinute.length <= 1, 'son 60 saniyede saniyelik kayıt olmamalı');
  for (let i = 1; i < ats.length; i++) {
    if (ats[i] > 200) assert.ok(ats[i] - ats[i - 1] >= 190,
      `tavan sonrası aralık ~192 sn olmalı, ölçülen: ${ats[i] - ats[i - 1]}`);
  }
});

test('R86-04: siyah kare durumu aynı tavan davranışını izler', () => {
  const tracker = createPlaybackDiagnosticTracker();
  const { emitted, ats } = stallSample(tracker, 600, { advance: true, framesStagnant: true, readyState: 4 });
  assert.ok(emitted <= 10, `600 sn siyah-kare'de sınırlı kayıt beklenir, çıkan: ${emitted}`);
  const lastMinute = ats.filter((s) => s >= 540);
  assert.ok(lastMinute.length <= 1, 'son 60 saniyede saniyelik kayıt olmamalı');
});

test('R86-04: stall → düzelme → yeniden stall sayaçları sıfırlanır', () => {
  const tracker = createPlaybackDiagnosticTracker();
  stallSample(tracker, 200, { readyState: 1 });               // ilk stall dalgası
  // düzelme: ilerleme olan örnekler
  for (let s = 201; s <= 220; s++) {
    tracker.observeMediaSample({ paused: false, area: 100, currentTime: s,
      readyState: 4, videoWidth: 640, videoHeight: 360, totalVideoFrames: s }, s * 1000);
  }
  let early = 0;
  for (let s = 221; s <= 231; s++) {                        // yeni stall'ın ilk 11 sn'si
    early += tracker.observeMediaSample({ paused: false, area: 100, currentTime: 5,
      readyState: 1, videoWidth: 640, videoHeight: 360, totalVideoFrames: 1 }, s * 1000).length;
  }
  assert.equal(early, 0, 'yeni stall ilk 12 sn içinde kayıt üretmemeli — sayaç sıfırlandı');
  let first = 0;
  for (let s = 232; s <= 235; s++) {
    first += tracker.observeMediaSample({ paused: false, area: 100, currentTime: 5,
      readyState: 1, videoWidth: 640, videoHeight: 360, totalVideoFrames: 1 }, s * 1000).length;
  }
  assert.equal(first, 1, 'yeni stall kendi 12 sn eşiğinde ilk kaydını üretir');
});

test('R86-04: çoklu tanı türleri backoff durumunu paylaşmaz', () => {
  const tracker = createPlaybackDiagnosticTracker();
  // 0-200 sn: stall; 201-400 sn: ilerleyen ama kare donmuş (frame-stagnant)
  const first = stallSample(tracker, 200, { readyState: 1 });
  assert.ok(first.emitted >= 4 && first.emitted <= 6, `stall emisyonları: ${first.ats}`);
  let frameEmits = 0;
  const frameAts = [];
  for (let s = 201; s <= 400; s++) {
    const out = tracker.observeMediaSample({ paused: false, area: 100, currentTime: s,
      readyState: 4, videoWidth: 640, videoHeight: 360, totalVideoFrames: 7 }, s * 1000);
    frameEmits += out.length;
    for (const item of out) frameAts.push(s);
  }
  assert.ok(frameEmits >= 4 && frameEmits <= 7,
    `frame-stagnant kendi eşik dizisini izler: ${frameAts}`);
  // frameStagnantSince ~201'de başlar → 8/16/32/64/128 sn eşikleri
  assert.ok(frameAts.length && frameAts[0] >= 208, 'ilk kare kaydı 8 sn eşiğinden önce değil');
});

// ---------------------------------------------------------------------------
// R86-05 — transkript niyet whitelist'i
// ---------------------------------------------------------------------------

const CUES = Array.from({ length: 20 }, (_, i) => ({
  start: i * 30, end: i * 30 + 25, text: `cue ${i} metni`, translation: `cue ${i} çevirisi`,
}));

for (const question of [
  'Videonun tamamını özetle',
  'Tüm transkripti incele',
  'Baştan sona ne anlatıyor?',
  'Bu videonun genel özeti nedir?',
  'Videoyu özetle',
  'Konunun tamamı hakkında bilgi ver',
  'Bütün videoyu analiz et',
  'Transkriptin tümünü çıkar',
]) {
  test(`R86-05 pozitif: "${question}" tüm-transkript niyeti`, () => {
    const result = buildTranscriptEvidence(CUES, question, { scope: 'full' });
    assert.equal(result.coverage, 'distributed');
  });
}

for (const question of [
  'Bu iddia tamamen yanlış mı?',
  'Bu işi tamamla',
  'Tamam, ikinci cümleyi açıkla',
  'Konuşmacı cümleyi tamamlamış mı?',
  'Bu bölüm neden tamamlanmadı?',
  'Videonun konumu nerede?',
  'Genelde bu tarz videolar nasıl olur?',
  'Tümör hakkında ne dedi?',
  'Bu konuşmanın beşinci dakikasında ne oldu?',
]) {
  test(`R86-05 negatif: "${question}" dağıtılmış bağlam eklemez`, () => {
    const result = buildTranscriptEvidence(CUES, question, { scope: 'full' });
    assert.equal(result.coverage, 'lexical', 'dar niyet tüm transkript sayılmamalı');
  });
}

// ---------------------------------------------------------------------------
// R85 kapsam eksiği — ek sözleşme testleri
// ---------------------------------------------------------------------------

test('R85/CEA: checkpoint kimliği captionMode/speaker/language/streamKey korur', () => {
  const dir = tmpdir('wb-r86-cea-');
  try {
    const tracks = [{ instreamId: 'CC1', cues: [{
      start: 1, end: 2, text: 'satır', sequence: 4, discontinuity: 0,
      captionMode: 'roll-up', speaker: 'Ahmet', language: 'tr',
      provenance: { streamKey: 'yt:abc:cc1', extra: 'x'.repeat(500) },
    }] }];
    const { checkpointId } = require('../src/browser-cea-checkpoint');
    const id = checkpointId('https://video.test/watch', 'media:abc', tracks);
    assert.ok(/^[a-f0-9]{64}$/.test(id));
    assert.equal(saveCeaCheckpoint(dir, id, tracks, 3, 1000), true);
    const loaded = loadCeaCheckpoint(dir, id, 1001);
    assert.equal(loaded.completedSegments, 3);
    const cue = loaded.tracks[0].cues[0];
    assert.equal(cue.captionMode, 'roll-up');
    assert.equal(cue.speaker, 'Ahmet');
    assert.equal(cue.language, 'tr');
    assert.equal(cue.provenance.streamKey, 'yt:abc:cc1');
    assert.ok(cue.provenance.streamKey.length <= 200);
    assert.equal(cue.provenance.extra, undefined, 'keyfi alanlar taşınmaz');
  } finally { cleanup(dir); }
});

test('R85/izin: mediaTypes bileşen kararları ve EME fail-closed', () => {
  const { browserMediaTypesFor, browserMediaPermissionDecision,
    browserPermissionDecision, normalizePermissionName } = sitePermissions;
  assert.deepEqual(browserMediaTypesFor(['video', 'audio']), ['camera', 'microphone']);
  assert.deepEqual(browserMediaTypesFor('video'), ['camera']);
  assert.deepEqual(browserMediaTypesFor(['unknown']), []);
  const perms = {
    'https://site.test': { permissions: { camera: 'allow', microphone: 'block' }, updatedAt: 1 },
    'https://ok.test': { permissions: { camera: 'allow', microphone: 'allow' }, updatedAt: 1 },
  };
  // camera allow + microphone block → bileşim block
  assert.equal(browserMediaPermissionDecision(perms, 'https://site.test/watch', ['video', 'audio']), 'block');
  // yalnız istenen türlere bakılır
  assert.equal(browserMediaPermissionDecision(perms, 'https://site.test/watch', ['video']), 'allow');
  assert.equal(browserMediaPermissionDecision(perms, 'https://ok.test/watch', ['video', 'audio']), 'allow');
  // kayıt yoksa sorulur
  assert.equal(browserMediaPermissionDecision(perms, 'https://yeni.test/watch', ['video']), 'ask');
  // EME: normalizePermissionName bilinen listeyi döndürür; bilinmeyen → ''
  assert.equal(normalizePermissionName('mediaKeySystem'), 'mediaKeySystem');
  assert.equal(normalizePermissionName('uydurma-izin'), '');
  // kayıtlı EME kararı uygulanır; bilinmeyen izin fail-closed (block) kalır
  const emePerms = { 'https://drm.test': { permissions: { mediaKeySystem: 'block' }, updatedAt: 1 } };
  assert.equal(browserPermissionDecision(emePerms, 'https://drm.test/watch', 'mediaKeySystem'), 'block');
  assert.equal(browserPermissionDecision({}, 'https://drm.test/watch', 'uydurma-izin'), 'block');
  assert.equal(browserPermissionDecision({}, 'https://drm.test/watch', 'mediaKeySystem'), 'ask');
});

// ---------------------------------------------------------------------------

process.on('exit', () => {
  let failed = 0;
  for (const [status, name] of results) {
    if (status !== 'PASS') { console.log(`  ${status}  ${name}`); failed += 1; }
  }
  if (failed) { console.error(`\n${failed} test başarısız`); process.exitCode = 1; return; }
  console.log(`report86-regressions: ${results.length}/${results.length} OK`);
});
