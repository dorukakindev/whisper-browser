const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  burninOutputPaths,
  burninRecoveryPathsMatch,
  burninTempLooksComplete,
  normalizeBurninRecovery,
  removeFileQuietly,
  replaceBurninOutput,
} = require('../src/burnin-output');

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

  const recovery = normalizeBurninRecovery({
    id: 'recover-1', videoPath: video, subPath: path.join(dir, 'film.srt'),
    tempPath: paths.tempPath, outPath: paths.outPath, pid: 42, totalSec: 100,
  });
  assert(recovery && recovery.pid === 42);
  assert(burninRecoveryPathsMatch(recovery));
  assert(!burninRecoveryPathsMatch({ ...recovery, tempPath: path.join(dir, 'baska.tmp.mp4') }));
  assert.equal(normalizeBurninRecovery({ videoPath: video }), null);
  assert(burninTempLooksComplete({ size: 4096, duration: 99.2, totalSec: 100 }));
  assert(!burninTempLooksComplete({ size: 4096, duration: 70, totalSec: 100 }));
  assert(!burninTempLooksComplete({ size: 10, duration: 100, totalSec: 100 }));

  console.log('  PASS  burn-in geçici çıktı güvenli biçimde tamamlanır veya temizlenir');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
