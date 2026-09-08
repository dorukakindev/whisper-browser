const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBrowserSubtitleFileStore } = require('../src/browser-subtitle-files');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

test('geçici web altyazılarını LRU sınırında tutar ve aktif dosyayı korur', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-subtitle-files-'));
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
    assert.equal(result.count, 64);
    assert.equal(fs.existsSync(files[0]), true);
    assert.equal(fs.existsSync(files[69]), true);
    assert.equal(fs.readdirSync(directory).filter((file) => file.endsWith('.srt')).length, 64);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('sahip olunan dizin dışındaki dosyayı silmez veya indekse almaz', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-subtitle-owner-'));
  const outside = path.join(os.tmpdir(), `browser-subtitle-outside-${process.pid}.srt`);
  try {
    fs.writeFileSync(outside, 'dışarıda', 'utf8');
    const store = createBrowserSubtitleFileStore({ fs, path, directory, limit: 2 });
    assert.deepEqual(store.touch(outside), { count: 0, removed: 0 });
    assert.equal(fs.existsSync(outside), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    try { fs.unlinkSync(outside); } catch (_) {}
  }
});

if (!process.exitCode) console.log(`\n${passed} tarayıcı altyazı dosyası testi geçti.`);
