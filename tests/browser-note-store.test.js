const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { BrowserNoteStore, NOTE_STORE_VERSION } = require('../src/browser-note-store');

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

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-browser-notes-'));
try {
  const filePath = path.join(directory, 'browser-notes.json');
  const store = new BrowserNoteStore(filePath);

  test('yeni not deposu eski SQLite göçüne açık başlar', () => {
    assert.equal(store.needsLegacyImport, true);
  });

  test('not atomik JSON belgesine medya bağlamıyla yazılır', () => {
    const note = store.upsert({
      id: 'note:one', mediaId: 'youtube:abc', type: 'note', start: 12.5, end: 14,
      source: 'IŞIK üzerine bir cümle', translation: 'A sentence about light', note: 'İzmir notu',
      mediaTitle: 'Örnek video', mediaType: 'youtube', mediaUrl: 'https://youtube.com/watch?v=abc',
      trackId: 'track:en', cueId: 'cue:12',
      createdAt: 100, updatedAt: 200,
    });
    assert.equal(note.mediaTitle, 'Örnek video');
    const disk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(disk.version, NOTE_STORE_VERSION);
    assert.equal(disk.annotations.length, 1);
    assert.equal(disk.annotations[0].note, 'İzmir notu');
    assert.equal(disk.annotations[0].trackId, 'track:en');
    assert.equal(disk.annotations[0].cueId, 'cue:12');
    assert.equal(store.needsLegacyImport, false);
    assert.equal(fs.existsSync(`${filePath}.bak`), true);
  });

  test('Türkçe NFKC araması not ve kaynak metninde çalışır', () => {
    assert.equal(store.search('ışık').length, 1);
    assert.equal(store.search('İZMİR').length, 1);
    assert.equal(store.search('yok').length, 0);
  });

  test('güncelleme oluşturulma zamanını korur', () => {
    const updated = store.upsert({
      id: 'note:one', mediaId: 'youtube:abc', type: 'note', start: 12.5,
      source: 'IŞIK üzerine bir cümle', note: 'Yeni not', createdAt: 999, updatedAt: 300,
    });
    assert.equal(updated.createdAt, 100);
    assert.equal(updated.note, 'Yeni not');
  });

  test('altyazı bağlamı güncellenirken kullanıcı notu açıkça verilmedikçe korunur', () => {
    const updated = store.upsert({
      id: 'note:one', mediaId: 'youtube:abc', type: 'note', start: 12.5,
      source: 'Güncel kaynak', translation: 'Güncel çeviri', updatedAt: 350,
    });
    assert.equal(updated.note, 'Yeni not');
    assert.equal(updated.translation, 'Güncel çeviri');
  });

  test('silme diske yansır ve dönen kayıt geri alma için kullanılabilir', () => {
    const removed = store.remove('note:one');
    assert.equal(removed.note, 'Yeni not');
    assert.equal(store.list('youtube:abc').length, 0);
    const restored = store.upsert(removed);
    assert.equal(restored.id, 'note:one');
    assert.equal(store.list('youtube:abc').length, 1);
  });

  test('ilk göç yalnız eksik kayıtları ekler', () => {
    const migrationPath = path.join(directory, 'migrated.json');
    const migrated = new BrowserNoteStore(migrationPath);
    assert.equal(migrated.importMissing([
      { id: 'legacy:a', media_id: 'browser:a', type: 'note', note: 'Eski not', start: 3 },
      { id: 'legacy:a', media_id: 'browser:a', type: 'note', note: 'Çift kayıt', start: 3 },
    ]), 1);
    assert.equal(migrated.list('browser:a').length, 1);
    assert.equal(new BrowserNoteStore(migrationPath).needsLegacyImport, false);
  });

  test('kapasite sınırı eski notları sessizce silmez', () => {
    const limitedPath = path.join(directory, 'limited.json');
    const limited = new BrowserNoteStore(limitedPath, { maxNotes: 100 });
    for (let index = 0; index < 100; index++) {
      limited.upsert({ id: `limit:${index}`, mediaId: 'local:limit', note: `Not ${index}` });
    }
    assert.throws(() => limited.upsert({ id: 'limit:overflow', mediaId: 'local:limit', note: 'Taşma' }), /sınırı/);
    assert.equal(limited.list('local:limit').length, 100);
    assert.equal(new BrowserNoteStore(limitedPath).list('local:limit').length, 100);
  });

  test('bozuk ana dosyada sağlam yedekten kurtarır', () => {
    const recoveryPath = path.join(directory, 'recovery.json');
    const recovery = new BrowserNoteStore(recoveryPath);
    recovery.upsert({ id: 'recover:a', mediaId: 'local:a', note: 'Yedekteki not' });
    recovery.upsert({ id: 'recover:b', mediaId: 'local:a', note: 'En yeni not' });
    fs.writeFileSync(recoveryPath, '{bozuk', 'utf8');
    const loaded = new BrowserNoteStore(recoveryPath);
    assert.equal(loaded.recoveredFromBackup, true);
    assert.equal(loaded.get('recover:a').note, 'Yedekteki not');
    assert.equal(JSON.parse(fs.readFileSync(recoveryPath, 'utf8')).annotations.length, 1);
  });

  test('ana dosya ve yedek bozuksa kullanıcı verisinin üstüne yazmaz', () => {
    const corruptPath = path.join(directory, 'corrupt.json');
    fs.writeFileSync(corruptPath, '{bozuk-ana', 'utf8');
    fs.writeFileSync(`${corruptPath}.bak`, '{bozuk-yedek', 'utf8');
    const corrupt = new BrowserNoteStore(corruptPath);
    assert.match(corrupt.loadError, /yazma durduruldu/);
    assert.throws(() => corrupt.upsert({ id: 'new', mediaId: 'local:a', note: 'Yeni' }), /yazma durduruldu/);
    assert.equal(fs.readFileSync(corruptPath, 'utf8'), '{bozuk-ana');
    assert.equal(fs.readFileSync(`${corruptPath}.bak`, 'utf8'), '{bozuk-yedek');
  });

  console.log(`browser-note-store: ${passed} test`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
