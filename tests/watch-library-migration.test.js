/** İzleme kütüphanesi tarihsel şema, migration, recovery ve fault corpus testleri. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CURRENT_SCHEMA_VERSION,
  canonicalWatchKey,
  createWatchLibraryStore,
  stableJson,
} = require('../src/watch-library-store');
const { FAMILY_DEFINITIONS, buildCorpus } = require('./fixtures/watch-library-schema-corpus');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.stack || error.message}`);
    console.log(`  FAIL  ${name} — ${error.message}`);
  }
}

function withTemp(name, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `whisper-watch-migration-${name}-`));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function writeFixture(dir, fixture) {
  const filePath = path.join(dir, 'watch-library.json');
  const tombstonePath = path.join(dir, 'watch-library-tombstones.json');
  if (fixture.primaryRaw !== null) fs.writeFileSync(filePath, fixture.primaryRaw, 'utf-8');
  else fs.writeFileSync(filePath, stableJson(fixture.input), 'utf-8');
  if (fixture.backup) fs.writeFileSync(`${filePath}.bak`, stableJson(fixture.backup), 'utf-8');
  if (fixture.tombstones.length) fs.writeFileSync(tombstonePath, stableJson(fixture.tombstones), 'utf-8');
  return { filePath, tombstonePath };
}

const corpus = buildCorpus();
for (const fixture of corpus) {
  test(`corpus ${fixture.name}`, () => withTemp('corpus', (dir) => {
    const paths = writeFixture(dir, fixture);
    const store = createWatchLibraryStore({ ...paths, now: () => 9000 });
    const document = store.loadDocument();
    const report = store.getLastReport();
    assert(document.schemaVersion >= CURRENT_SCHEMA_VERSION, 'şema sürümü güncellenmedi');
    assert(report.inputRecords >= 1, 'girdi kaydı ölçülmedi');
    assert(stableJson(document).includes(`"familyIndex": ${fixture.expectedSentinel.familyIndex}`),
      'tarihsel kaydın sentinel alanı kayboldu');
    if (fixture.variant === 'manual-incomplete'
        || (fixture.family.wrapper === 'manual-array' && fixture.variant !== 'manual-complete')) {
      const manual = store.loadAll().find((item) => item.completionOverride === false);
      assert(manual && manual.completed === false, 'manuel Tamamlanmadı kararı kayboldu');
    }
    if (fixture.variant === 'manual-complete') {
      const manual = store.loadAll().find((item) => item.completionOverride === true);
      assert(manual && manual.completed === true, 'manuel Tamamlandı kararı kayboldu');
    }
    if (fixture.family.wrapper === 'tombstone-sidecar') {
      assert(document.tombstones.some((item) => item.futureDeleteReason === 'kullanıcı-kararı'),
        'tarihsel silme kararı kayboldu');
    }
    if (fixture.variant === 'future-schema-envelope') {
      assert(document.schemaVersion === 99 && document.futureRoot.keep, 'gelecek kök şeması/alanı düşürüldü');
    }
    const firstBytes = fs.readFileSync(paths.filePath, 'utf-8');
    const secondStore = createWatchLibraryStore({ ...paths, now: () => 9000 });
    const secondDocument = secondStore.loadDocument();
    const secondBytes = fs.readFileSync(paths.filePath, 'utf-8');
    assert.strictEqual(secondBytes, firstBytes, 'ikinci migration byte-idempotent değil');
    assert.strictEqual(stableJson(secondDocument), stableJson(document), 'ikinci migration semantik-idempotent değil');
  }));
}

test('altı tarihsel şema ailesi ve 100+ bozuk/sınır fixture kapsanır', () => {
  assert(FAMILY_DEFINITIONS.length >= 6, `şema ailesi ${FAMILY_DEFINITIONS.length}`);
  assert(corpus.length >= 100, `fixture sayısı ${corpus.length}`);
});

test('tek sözdizimsel bozuk kayıt iki sağlam kaydı sıfırlamaz', () => withTemp('salvage', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  fs.writeFileSync(filePath,
    '[{"key":"file:a","future":"koru-a"},{"key":"file:bozuk",},{"key":"file:b","future":"koru-b"}]', 'utf-8');
  const store = createWatchLibraryStore({ filePath });
  assert.deepStrictEqual(store.loadAll().map((item) => item.key).sort(), ['file:a', 'file:b']);
  const document = store.loadDocument();
  assert(document.migrationQuarantine.some((entry) => entry.rawText.includes('file:bozuk')),
    'bozuk parça karantinada korunmadı');
  assert(fs.existsSync(`${filePath}.bak`) === false, 'bozuk ana dosya sağlam yedek diye kaydedildi');
}));

test('backupVersion 2 paketi migration öncesinde birebir yedeklenir', () => withTemp('bundle-backup', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const legacy = {
    backupVersion: 2,
    settings: { futureSetting: { keep: true } },
    watchLibrary: [{ key: 'file:bundle', title: 'Paket', futureItem: { keep: true } }],
  };
  const originalRaw = stableJson(legacy);
  fs.writeFileSync(filePath, originalRaw, 'utf-8');

  const store = createWatchLibraryStore({ filePath });
  assert(store.loadAll().some((item) => item.key === 'file:bundle' && item.futureItem.keep));
  assert(fs.existsSync(`${filePath}.bak`), 'tarihsel paket için migration yedeği oluşmadı');
  assert.strictEqual(fs.readFileSync(`${filePath}.bak`, 'utf-8'), originalRaw, 'kaynak paket yedekte birebir korunmadı');
}));

test('eski URL kimlikleri tek kayda birleşirken bilinmeyen alanlar korunur', () => {
  const input = [
    { key: 'browser:https://example.test/watch?id=7&token=old#one', lastWatched: 10,
      completed: false, oldUnknown: { keep: 1 } },
    { key: 'browser:https://example.test/watch?token=new&id=7#two', lastWatched: 20,
      completed: true, futureUnknown: { keep: 2 } },
  ];
  return withTemp('identity', (dir) => {
    const filePath = path.join(dir, 'watch-library.json');
    fs.writeFileSync(filePath, stableJson(input), 'utf-8');
    const store = createWatchLibraryStore({ filePath });
    const items = store.loadAll();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].key, 'browser:https://example.test/watch?id=7');
    assert(items[0].futureUnknown.keep === 2, 'yeni bilinmeyen alan kayboldu');
    assert(items[0].migrationDuplicates.some((item) => item.oldUnknown && item.oldUnknown.keep === 1),
      'eski kopyanın bilinmeyen alanı kayboldu');
  });
});

test('manuel Tamamlanmadı kararı sonraki otomatik tamamlandı kaydıyla ezilmez', () => withTemp('manual', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  fs.writeFileSync(filePath, stableJson([{ key: 'file:manual', completed: false, automaticCompleted: true,
    completionOverride: false, revision: 4, lastWatched: 10 }]), 'utf-8');
  const store = createWatchLibraryStore({ filePath, now: () => 20 });
  const updated = store.upsert({ key: 'file:manual', completed: true, position: 999 });
  assert.strictEqual(updated.automaticCompleted, true);
  assert.strictEqual(updated.completionOverride, false);
  assert.strictEqual(updated.completed, false);
}));

test('tombstone otomatik upserti engeller; yalnız açık restore kararı kaldırır', () => withTemp('tombstone', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  let store = createWatchLibraryStore({ filePath, now: () => 100 });
  store.upsert({
    key: 'file:deleted',
    title: 'Silinecek',
    collections: ['Arşiv'],
    prefs: { audioTrack: 2 },
    session: { id: 'oturum-1', watchSeconds: 37 },
    futureUnknown: { keep: ['opaque'] },
  });
  assert(store.remove('file:deleted'));
  assert(store.isRemoved('file:deleted'));
  store = createWatchLibraryStore({ filePath, now: () => 101 });
  assert.strictEqual(store.upsert({ key: 'file:deleted', position: 50 }), null);
  assert(!store.loadAll().some((item) => item.key === 'file:deleted'));
  const restored = store.restore({ key: 'file:deleted', title: 'Açıkça geri getirildi' });
  assert(restored && !store.isRemoved('file:deleted'));
  assert.deepStrictEqual(restored.collections, ['Arşiv']);
  assert.deepStrictEqual(restored.prefs, { audioTrack: 2 });
  assert.deepStrictEqual(restored.sessions, [{ id: 'oturum-1', watchSeconds: 37 }]);
  assert.deepStrictEqual(restored.futureUnknown, { keep: ['opaque'] });
  store = createWatchLibraryStore({ filePath, now: () => 102 });
  const afterRestart = store.loadAll().find((item) => item.key === 'file:deleted');
  assert(afterRestart, 'geri yüklenen kayıt restartta kayboldu');
  assert.deepStrictEqual(afterRestart.collections, ['Arşiv']);
  assert.deepStrictEqual(afterRestart.prefs, { audioTrack: 2 });
  assert.deepStrictEqual(afterRestart.sessions, [{ id: 'oturum-1', watchSeconds: 37 }]);
  assert.deepStrictEqual(afterRestart.futureUnknown, { keep: ['opaque'] });
}));

test('tarihsel tombstone sidecar açık restore sonrasında restartta yeniden uygulanmaz', () => withTemp('sidecar-restore', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const tombstonePath = path.join(dir, 'watch-library-tombstones.json');
  fs.writeFileSync(filePath, stableJson([{ key: 'file:sidecar', title: 'Eski kayıt' }]), 'utf-8');
  fs.writeFileSync(tombstonePath, stableJson([{ key: 'file:sidecar', removedAt: 50 }]), 'utf-8');
  const first = createWatchLibraryStore({ filePath, tombstonePath, now: () => 100 });
  assert(first.isRemoved('file:sidecar'), 'sidecar ilk migrationda uygulanmadı');
  assert(first.restore({ key: 'file:sidecar', title: 'Geri getirildi' }), 'açık restore başarısız');
  const restarted = createWatchLibraryStore({ filePath, tombstonePath, now: () => 101 });
  assert(!restarted.isRemoved('file:sidecar'), 'eski sidecar restartta yeniden uygulandı');
  assert(restarted.loadAll().some((item) => item.key === 'file:sidecar'), 'geri yüklenen kayıt restartta kayboldu');
}));

test('gelecek şema ve kayıt alanları rewrite sonrasında aynen kalır', () => withTemp('future', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const input = { schemaVersion: 77, futureRoot: { codec: 'x' }, items: [{
    key: 'file:future', completed: false, futureRecord: { nested: [1, 2, 3] },
  }], tombstones: [], futureArray: [{ opaque: true }] };
  fs.writeFileSync(filePath, stableJson(input), 'utf-8');
  const store = createWatchLibraryStore({ filePath, now: () => 1 });
  store.upsert({ key: 'file:future', position: 5 });
  const document = store.loadDocument();
  assert.strictEqual(document.schemaVersion, 77);
  assert.deepStrictEqual(document.futureRoot, input.futureRoot);
  assert.deepStrictEqual(document.futureArray, input.futureArray);
  assert.deepStrictEqual(store.loadAll()[0].futureRecord, input.items[0].futureRecord);
}));

test('yanlış tipli IPC patch tek kaydı veya store işlemini çökertmez', () => withTemp('wrong-patch', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const store = createWatchLibraryStore({ filePath, now: () => 1 });
  const item = store.upsert({
    key: 'file:wrong-patch',
    collections: { bad: true },
    subtitlePaths: { bad: true },
    prefs: ['bad'],
  });
  assert(item && item.key === 'file:wrong-patch');
  assert.deepStrictEqual(item.collections, []);
  assert.deepStrictEqual(item.subtitlePaths, []);
  assert.deepStrictEqual(item.prefs, {});
}));

test('IPC patch ve birleşmiş kayıt boyut sınırları store içinde uygulanır', () => withTemp('size-limits', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const store = createWatchLibraryStore({ filePath });
  assert(store.upsert({ key: 'file:small', title: 'sağlam' }));
  assert.strictEqual(store.upsert({
    key: 'file:oversized-patch', title: 'x'.repeat(129 * 1024),
  }), null, '128 KB üstü IPC patch reddedilmedi');
  assert(store.upsert({ key: 'file:merge', futureA: 'a'.repeat(110 * 1024) }));
  assert(store.upsert({ key: 'file:merge', futureB: 'b'.repeat(110 * 1024) }));
  assert.strictEqual(store.upsert({
    key: 'file:merge', futureC: 'c'.repeat(50 * 1024),
  }), null, '256 KB üstüne birleşen kayıt reddedilmedi');
  assert.strictEqual(store.loadAll().find((item) => item.key === 'file:merge').futureC, undefined);
  assert(!store.loadAll().some((item) => item.key === 'file:oversized-patch'));
}));

test('eski manualCompleted kararı kanonik override olur ve otomatik ilerleme onu ezmez', () => withTemp('legacy-manual', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  fs.writeFileSync(filePath, stableJson([{
    key: 'file:C:\\Medya\\Film.mkv',
    type: 'local',
    title: 'Göç edilen gerçek şekilli kayıt',
    sourceRef: 'C:\\Medya\\Film.mkv',
    localPath: 'C:\\Medya\\Film.mkv',
    duration: 7200,
    position: 6800,
    firstWatched: 100,
    lastWatched: 900,
    completed: false,
    automaticCompleted: true,
    manualCompleted: false,
    revision: 3,
    collections: ['Bilimkurgu', 'Arşiv'],
    subtitlePaths: ['C:\\Medya\\Film.tr.srt'],
    prefs: { speed: 1.25, volume: 0.7, selectedSubRole: 'translation' },
    sessions: [
      { id: 'oturum-1', watchSeconds: 1200, startPosition: 0, endPosition: 1200 },
      { id: 'oturum-2', watchSeconds: 900, startPosition: 5900, endPosition: 6800 },
    ],
    totalWatchSeconds: 2100,
    futureUserField: { keep: true },
  }]), 'utf-8');
  const store = createWatchLibraryStore({ filePath, now: () => 20 });
  const migrated = store.loadAll()[0];
  assert.strictEqual(migrated.completionOverride, false);
  assert.strictEqual(migrated.completed, false);
  assert.strictEqual(migrated.manualCompleted, undefined);
  assert.strictEqual(migrated.migrationLegacy.manualCompleted, false);
  assert.deepStrictEqual(migrated.collections, ['Bilimkurgu', 'Arşiv']);
  assert.deepStrictEqual(migrated.subtitlePaths, ['C:\\Medya\\Film.tr.srt']);
  assert.deepStrictEqual(migrated.prefs, { speed: 1.25, volume: 0.7, selectedSubRole: 'translation' });
  assert.strictEqual(migrated.sessions.length, 2);
  assert.deepStrictEqual(migrated.futureUserField, { keep: true });
  const updated = store.upsert({
    key: migrated.key, automaticCompleted: true, completed: true, position: 999,
  });
  assert.strictEqual(updated.automaticCompleted, true);
  assert.strictEqual(updated.completionOverride, false);
  assert.strictEqual(updated.completed, false);
  assert.strictEqual(updated.revision, 4);
  assert.deepStrictEqual(updated.collections, ['Bilimkurgu', 'Arşiv']);
  assert.deepStrictEqual(updated.subtitlePaths, ['C:\\Medya\\Film.tr.srt']);
  assert.deepStrictEqual(updated.prefs, { speed: 1.25, volume: 0.7, selectedSubRole: 'translation' });
  assert.strictEqual(updated.sessions.length, 2);
  assert.strictEqual(updated.totalWatchSeconds, 2100);
  assert.deepStrictEqual(updated.futureUserField, { keep: true });
}));

test('main store bağlantısı boyut, tombstone ve açık geri yükleme sözleşmesini korur', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf-8');
  assert(source.includes("const { createWatchLibraryStore } = require('./watch-library-store');"));
  assert(source.includes('watchLibraryStore().upsert(patch)'));
  assert(source.includes('watchLibraryStore().remove(key)'));
  assert(source.includes('saveWatchLibrary(previous, { restoreRemoved: true })'));
  assert(source.includes('watchLibrary: loadWatchLibraryAll()'));
  assert(source.includes('saveWatchLibrary(watchLibrary, { restoreRemoved: true })'));
  assert(source.includes('renameCollection(loadWatchLibraryAll()'));
  assert(source.includes('previous = loadWatchLibraryAll().slice()'));
  assert(/async function searchWatchLibrary[\s\S]*const list = loadWatchLibraryAll\(\)/.test(source));
  assert(/const yieldToPendingInput = \(\) => new Promise\(\(resolve\) => setTimeout\(resolve, 0\)\)/.test(source));
  assert(/async function searchWatchLibrary[\s\S]*await yieldToPendingInput\(\);[\s\S]*if \(cancelled\(\)\) return \[\];[\s\S]*loadWatchLibraryAll\(\)/.test(source));
  assert(!source.includes('let watchLibraryCache = null'));
});

test('40 oturum sıradan güncellemede korunur; yalnız 41. oturum en eskiyi döndürür', () => withTemp('sessions-limit', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const store = createWatchLibraryStore({ filePath, now: () => 2 });
  const sessions = Array.from({ length: 40 }, (_, index) => ({ id: `oturum-${index}`, watchSeconds: index }));
  store.replaceItems([{ key: 'file:session-limit', sessions, lastWatched: 1 }]);

  const ordinaryUpdate = store.upsert({ key: 'file:session-limit', position: 12 });
  assert.strictEqual(ordinaryUpdate.sessions.length, 40);
  assert.strictEqual(ordinaryUpdate.sessions[0].id, 'oturum-0');

  const newSession = store.upsert({
    key: 'file:session-limit',
    session: { id: 'oturum-40', watchSeconds: 40 },
  });
  assert.strictEqual(newSession.sessions.length, 40);
  assert.strictEqual(newSession.sessions[0].id, 'oturum-1');
  assert.strictEqual(newSession.sessions[39].id, 'oturum-40');
}));

test('5000 kayıt limit üstünde diskte kayıpsız korunur', () => withTemp('large', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const input = Array.from({ length: 5000 }, (_, index) => ({
    key: `file:large-${index}`, title: `Kayıt ${index}`, lastWatched: index, completed: false,
    future: { index },
  }));
  fs.writeFileSync(filePath, stableJson(input), 'utf-8');
  const started = process.hrtime.bigint();
  const store = createWatchLibraryStore({ filePath });
  assert.strictEqual(store.load().length, 1000, 'görünür limit korunmadı');
  assert.strictEqual(store.loadAll().length, 5000, 'limit üstü kayıtlar kayboldu');
  assert.strictEqual(store.loadDocument().overflowItems.length, 4000);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`    büyük dosya: 5000 kayıt, ${elapsedMs.toFixed(1)} ms`);
}));

const FAULT_STAGES = [
  'before-read',
  'after-read',
  'after-migrate',
  'before-temp-write',
  'after-temp-write',
  'after-temp-fsync',
  'before-backup-write',
  'after-backup-write',
  'after-backup-replace',
  'before-main-replace',
  'after-main-replace',
  'after-directory-fsync',
];

for (const stage of FAULT_STAGES) {
  test(`fault ${stage}: eski sağlam dosya veya tamamlanmış migration kurtarılabilir`, () => withTemp('fault', (dir) => {
    const filePath = path.join(dir, 'watch-library.json');
    const legacy = [{ key: 'file:fault', completed: false, future: { keep: stage }, lastWatched: 1 }];
    fs.writeFileSync(filePath, stableJson(legacy), 'utf-8');
    let injected = false;
    const store = createWatchLibraryStore({
      filePath,
      fault: (seen) => {
        if (!injected && seen === stage) {
          injected = true;
          throw new Error(`FAULT:${stage}`);
        }
      },
    });
    assert.throws(() => store.loadDocument(), new RegExp(`FAULT:${stage}`));
    assert(injected, `${stage} aşamasına ulaşılmadı`);
    const recovered = createWatchLibraryStore({ filePath }).loadAll();
    assert(recovered.some((item) => item.key === 'file:fault' && item.future.keep === stage),
      'fault sonrası sağlam kayıt kurtarılamadı');
  }));
}

test('bozulan ana dosya son sağlam yedekten atomik onarılır', () => withTemp('recovery', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  fs.writeFileSync(filePath, stableJson([{ key: 'file:healthy', completed: false, future: 'koru' }]), 'utf-8');
  const first = createWatchLibraryStore({ filePath, now: () => 10 });
  first.loadDocument();
  first.upsert({ key: 'file:healthy', position: 20 });
  assert(fs.existsSync(`${filePath}.bak`), 'sağlam yedek oluşmadı');
  fs.writeFileSync(filePath, '{"yarim":', 'utf-8');
  const recovered = createWatchLibraryStore({ filePath }).loadAll();
  assert(recovered.some((item) => item.key === 'file:healthy' && item.future === 'koru'));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, 'utf-8')), 'ana dosya onarılmadı');
}));

test('ana dosya yoksa sağlam yedek okunmakla kalmaz, ana dosya yeniden kurulur', () => withTemp('missing-primary', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  const backupRaw = stableJson([{ key: 'file:backup-only', future: { keep: true } }]);
  fs.writeFileSync(`${filePath}.bak`, backupRaw, 'utf-8');

  const store = createWatchLibraryStore({ filePath });
  assert(store.loadAll().some((item) => item.key === 'file:backup-only' && item.future.keep));
  assert(fs.existsSync(filePath), 'eksik ana dosya yedekten yeniden kurulmadı');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, 'utf-8')), 'yeniden kurulan ana dosya geçersiz');
  assert.strictEqual(fs.readFileSync(`${filePath}.bak`, 'utf-8'), backupRaw, 'kurtarma sırasında sağlam yedek değiştirildi');
}));

test('eski davranış karşı örneği: parse hatası ardından save sağlam kaydı sıfırlardı', () => withTemp('counterexample', (dir) => {
  const filePath = path.join(dir, 'watch-library.json');
  fs.writeFileSync(filePath, '[{"key":"file:healthy"},{"key":"file:bad",}]', 'utf-8');
  let legacyCache = null;
  function legacyLoad() {
    try { legacyCache = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
    catch (_) { legacyCache = []; }
    return legacyCache;
  }
  legacyLoad();
  fs.writeFileSync(filePath, stableJson(legacyCache), 'utf-8');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf-8')), [], 'eski kayıp yolu tekrar üretilemedi');
}));

console.log(`\nCorpus: ${FAMILY_DEFINITIONS.length} tarihsel aile, ${corpus.length} bozuk/sınır fixture`);
console.log(`Fault matrisi: ${FAULT_STAGES.length} migration aşaması`);
console.log(`${passed} geçti, ${failures.length} başarısız (${passed + failures.length} test)`);
if (failures.length) {
  failures.forEach((failure) => console.error(`\n${failure}`));
  process.exit(1);
}
