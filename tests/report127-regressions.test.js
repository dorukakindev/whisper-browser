const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { WatchIndex, databaseConstructor, lastWatchedValue } = require('../src/watch-index');
const { createWatchLibraryStore } = require('../src/watch-library-store');
const { sanitizeAbsolutePath } = require('../src/settings-security');
const { redactDiagnosticText } = require('../src/browser-playback-diagnostics');

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r127-'));
try {
  test('watch-library-store: açık lastWatched 0 "hiç izlenmedi" olarak korunur', () => {
    const store = createWatchLibraryStore({ filePath: path.join(dir, 'library.json') });
    const older = store.upsert({ key: 'youtube:abcdefghijk', title: 'eski izlenen', lastWatched: 1000 });
    assert.strictEqual(older.lastWatched, 1000);
    const never = store.upsert({ key: 'youtube:bcdefghijkl', title: 'hiç izlenmedi', lastWatched: 0 });
    // Sıfır, "şimdi"ye çevrilmemeli — aksi halde hiç açılmamış kayıt
    // en üste fırlıyordu.
    assert.strictEqual(never.lastWatched, 0);
    const items = store.load();
    const neverRow = items.find((item) => item.key === 'youtube:bcdefghijkl');
    assert.strictEqual(neverRow.lastWatched, 0);
    assert.strictEqual(items[0].key, 'youtube:abcdefghijk');
    assert.strictEqual(items[1].key, 'youtube:bcdefghijkl');
  });

  test('watch-library-store: lastWatched gönderilmezse dokunma damgası korunur', () => {
    const store = createWatchLibraryStore({ filePath: path.join(dir, 'library2.json') });
    const before = Date.now();
    const merged = store.upsert({ key: 'youtube:cdefghijklm', title: 'dokunma' });
    assert.ok(merged.lastWatched >= before, 'atlanan lastWatched şimdiyle damgalanmalı');
  });

  test('watch-index lastWatchedValue: 0 korunur, eksik/geçersiz şimdi olur', () => {
    assert.strictEqual(lastWatchedValue(0), 0);
    assert.strictEqual(lastWatchedValue('0'), 0);
    assert.strictEqual(lastWatchedValue(1234), 1234);
    assert.strictEqual(lastWatchedValue(-50), 0);
    const now = Date.now();
    assert.ok(lastWatchedValue(undefined) >= now - 1000);
    assert.ok(lastWatchedValue(null) >= now - 1000);
    assert.ok(lastWatchedValue('bozuk') >= now - 1000);
  });

  test('watch-index: açık lastWatched 0 saklanır, eksik olanda şimdi yazılır', () => {
    const DatabaseSync = databaseConstructor();
    if (!DatabaseSync) return; // node:sqlite bu derlemede yoksa atla
    const probe = new DatabaseSync(':memory:');
    try {
      probe.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(value)');
    } catch (_) {
      probe.close();
      return; // FTS5 yoksa WatchIndex kurulamaz
    }
    probe.close();
    const index = new WatchIndex(path.join(dir, 'watch.db'));
    index.upsertMedia({ id: 'youtube:defghijklmn', title: 'izlenen', lastWatched: 5000 });
    index.upsertMedia({ id: 'youtube:efghijklmno', title: 'hiç izlenmedi', lastWatched: 0 });
    const never = index.getMedia('youtube:efghijklmno');
    assert.strictEqual(never.last_watched, 0);
    const touched = index.upsertMedia({ id: 'youtube:fghijklmnop', title: 'dokunulan' });
    assert.ok(touched.last_watched > 5000, 'atlanan lastWatched şimdiyle damgalanmalı');
    const list = index.listMedia();
    assert.strictEqual(list[list.length - 1].id, 'youtube:efghijklmno',
      'hiç izlenmeyen kayıt en sonda olmalı');
    // Eş zaman damgalı kayıtlarda id ASC ikincil anahtarı deterministik sıralar.
    index.upsertMedia({ id: 'youtube:bbbbbbbbbbb', title: 'a', lastWatched: 7000 });
    index.upsertMedia({ id: 'youtube:aaaaaaaaaaa', title: 'b', lastWatched: 7000 });
    const tied = index.listMedia().filter((row) => row.last_watched === 7000);
    assert.deepStrictEqual(tied.map((row) => row.id), ['youtube:aaaaaaaaaaa', 'youtube:bbbbbbbbbbb']);
  });

  test('settings-security: POSIX ve Windows mutlak yolları her platformda kabul edilir', () => {
    // win32.isAbsolute `/` ile başlayan yolları da mutlak sayar — POSIX
    // mutlak yolları (ve `C:\...` biçimi) her platformda geçmeli.
    const posix = '/home/kullanici/videolar';
    assert.strictEqual(sanitizeAbsolutePath(posix, 'Klasör'), posix);
    assert.strictEqual(sanitizeAbsolutePath('C:\\videolar\\altyazı', 'Klasör'), 'C:\\videolar\\altyazı');
    assert.throws(() => sanitizeAbsolutePath('goreli/yol', 'Klasör'), /mutlak/);
    assert.throws(() => sanitizeAbsolutePath('videolar\\alt', 'Klasör'), /mutlak/);
  });

  test('playback diagnostics: `pass=` artık redakte edilir, genel sözcükler korunur', () => {
    const leaked = redactDiagnosticText('form: pass=hunter2 user=foo state=paused code=403');
    assert.doesNotMatch(leaked, /hunter2/, 'pass değeri sızdı: ' + leaked);
    assert.match(leaked, /pass=\[gizlendi\]/);
    // Genel tanı sözcükleri okunabilir kalmalı (genişletilmiş redaksiyon
    // kanıtları değil).
    assert.match(leaked, /state=paused/);
    assert.match(leaked, /code=403/);
    assert.match(leaked, /user=foo/);
  });

  console.log(`report127-regressions: ${passed} test geçti`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
