const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  burninFinalOutputLooksComplete,
  burninOutputPaths,
  burninProcessNameMatches,
  burninRecoveryProcessMatches,
  burninRecoveryPathsMatch,
  burninReplacementBackupPaths,
  burninTempLooksComplete,
  normalizeBurninRecovery,
  removeFileQuietly,
  restoreNewestBurninReplacementBackup,
  replaceBurninOutput,
} = require('../src/burnin-output');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-burnin-'));
try {
  const video = path.join(dir, 'film.mkv');
  const paths = burninOutputPaths(video, 'test-token');
  assert.equal(paths.outPath, path.join(dir, 'film.altyazili.mkv'));
  assert.equal(paths.tempPath, path.join(dir, 'film.altyazili.test-token.tmp.mkv'));
  const mp4Paths = burninOutputPaths(path.join(dir, 'film.mp4'), 'mp4-token');
  assert.equal(mp4Paths.outPath, path.join(dir, 'film.altyazili.mp4'));

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
  assert(burninFinalOutputLooksComplete({
    size: 4096, duration: 100, totalSec: 100, startedAt: 1000, mtimeMs: 1001,
  }));
  assert(!burninFinalOutputLooksComplete({
    size: 4096, duration: 100, totalSec: 100, startedAt: 5000, mtimeMs: 2999,
  }));
  assert(!burninFinalOutputLooksComplete({
    size: 4096, duration: 100, totalSec: 100, startedAt: 1000, mtimeMs: 1001,
    previousOutSize: 4096, previousOutMtimeMs: 1001,
  }));
  assert(burninProcessNameMatches('C:\\tools\\ffmpeg.exe'));
  assert(!burninProcessNameMatches('notepad.exe'));
  assert(burninRecoveryProcessMatches({ pidAlive: true, processName: 'ffmpeg.exe', startedAt: 1000, now: 2000 }));
  assert(!burninRecoveryProcessMatches({ pidAlive: true, processName: 'notepad.exe', startedAt: 1000, now: 2000 }));
  assert(!burninRecoveryProcessMatches({ pidAlive: true, processName: '', startedAt: 1000,
    now: 1000 + 49 * 60 * 60 * 1000 }));

  const orphan = `${paths.outPath}.orphan-token.replace-backup`;
  fs.writeFileSync(orphan, 'önceki çıktı');
  fs.unlinkSync(paths.outPath);
  assert.equal(burninReplacementBackupPaths(paths.outPath, fs).length, 1);
  assert(restoreNewestBurninReplacementBackup(paths.outPath, fs));
  assert.equal(fs.readFileSync(paths.outPath, 'utf8'), 'önceki çıktı');
  assert.equal(burninReplacementBackupPaths(paths.outPath, fs).length, 0);

  console.log('  PASS  burn-in geçici çıktı güvenli biçimde tamamlanır veya temizlenir');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
