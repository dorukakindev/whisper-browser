const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { burninOutputPaths, removeFileQuietly, replaceBurninOutput } = require('../src/burnin-output');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-burnin-'));
try {
  const video = path.join(dir, 'film.mkv');
  const paths = burninOutputPaths(video, 'test-token');
  assert.equal(paths.outPath, path.join(dir, 'film.altyazili.mp4'));
  assert.equal(paths.tempPath, path.join(dir, 'film.altyazili.test-token.tmp.mp4'));

  fs.writeFileSync(paths.outPath, 'eski');
  fs.writeFileSync(paths.tempPath, 'tamamlanmis');
  replaceBurninOutput(paths.tempPath, paths.outPath, fs, 'replace-token');
  assert.equal(fs.readFileSync(paths.outPath, 'utf8'), 'tamamlanmis');
  assert.equal(fs.existsSync(paths.tempPath), false);
  assert.equal(fs.existsSync(`${paths.outPath}.replace-token.replace-backup`), false);

  const partial = path.join(dir, 'yarim.tmp.mp4');
  fs.writeFileSync(partial, 'yarim');
  removeFileQuietly(partial);
  removeFileQuietly(partial);
  assert.equal(fs.existsSync(partial), false);

  console.log('  PASS  burn-in geçici çıktı güvenli biçimde tamamlanır veya temizlenir');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
