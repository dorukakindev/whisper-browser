'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBrowserSubtitleFileStore } = require('../src/browser-subtitle-files');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

function fixtureDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('geçici web altyazılarını LRU sınırında tutar ve etkin dosyaları korur', () => {
  const directory = fixtureDirectory('browser-subtitle-files-');
  try {
    const files = [];
    for (let index = 0; index < 70; index++) {
      const file = path.join(directory, `web-${String(index).padStart(3, '0')}.srt`);
      fs.writeFileSync(file, String(index), 'utf8');
      const at = new Date(1_700_000_000_000 + index * 1000);
      fs.utimesSync(file, at, at);
      files.push(file);
    }
    const store = createBrowserSubtitleFileStore({ fs, path, directory, limit: 64 });
    const result = store.touch(files[0], [files[0], files[69]]);
    assert.deepEqual(result, { count: 64, removed: 6 });
    assert.equal(fs.existsSync(files[0]), true);
    assert.equal(fs.existsSync(files[69]), true);
    assert.equal(store.snapshot().count, 64);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('etkin dosya sayısı sınırı aşarsa dosyayı bozmak yerine yumuşak sınırı görünür bırakır', () => {
  const directory = fixtureDirectory('browser-subtitle-active-');
  try {
    const files = Array.from({ length: 4 }, (_, index) => {
      const file = path.join(directory, `web-${index}.srt`);
      fs.writeFileSync(file, String(index), 'utf8');
      return file;
    });
    const store = createBrowserSubtitleFileStore({ fs, path, directory, limit: 2 });
    assert.deepEqual(store.touch(files[3], files), { count: 4, removed: 0 });
    assert.ok(files.every(file => fs.existsSync(file)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('dizin dışına, farklı dosya adına ve kullanıcı altyazısına dokunmaz', () => {
  const directory = fixtureDirectory('browser-subtitle-owner-');
  const outside = path.join(os.tmpdir(), `web-outside-${process.pid}.srt`);
  try {
    fs.writeFileSync(path.join(directory, 'kullanici.srt'), 'koru', 'utf8');
    fs.writeFileSync(path.join(directory, 'web-not-subtitle.txt'), 'koru', 'utf8');
    fs.writeFileSync(outside, 'dışarıda', 'utf8');
    const store = createBrowserSubtitleFileStore({ fs, path, directory, limit: 1 });
    assert.deepEqual(store.touch(outside), { count: 0, removed: 0 });
    assert.equal(fs.existsSync(outside), true);
    assert.equal(fs.existsSync(path.join(directory, 'kullanici.srt')), true);
    assert.equal(fs.existsSync(path.join(directory, 'web-not-subtitle.txt')), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    try { fs.unlinkSync(outside); } catch (_) {}
  }
});

test('silme hatasında dosyayı indeksten düşürmez ve sonraki dokunuşta yeniden dener', () => {
  const directory = fixtureDirectory('browser-subtitle-retry-');
  try {
    const oldest = path.join(directory, 'web-old.srt');
    const newest = path.join(directory, 'web-new.srt');
    fs.writeFileSync(oldest, 'old', 'utf8');
    fs.writeFileSync(newest, 'new', 'utf8');
    fs.utimesSync(oldest, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const blockedFs = Object.create(fs);
    let fail = true;
    blockedFs.unlinkSync = file => {
      if (fail && path.resolve(file) === path.resolve(oldest)) throw new Error('kilitli');
      return fs.unlinkSync(file);
    };
    const store = createBrowserSubtitleFileStore({ fs: blockedFs, path, directory, limit: 1 });
    assert.deepEqual(store.touch(newest), { count: 2, removed: 0 });
    fail = false;
    assert.deepEqual(store.touch(newest), { count: 1, removed: 1 });
    assert.equal(fs.existsSync(oldest), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('üretim bağlantısı yazılan dosyayı etkin yollarla birlikte LRU katmanına bildirir', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /BROWSER_SUBTITLE_FILE_LIMIT = 64/);
  assert.match(main, /function trackBrowserSubtitleFile[\s\S]{0,900}browserTrackPublications\.values\(\)/);
  assert.match(main, /browserTrackPublications\.set\(publicationKey[\s\S]{0,180}trackBrowserSubtitleFile\(filePath\)/);
});

console.log(`${passed} tarayıcı altyazı dosyası LRU testi geçti.`);
