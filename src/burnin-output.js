'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { fsyncDirectory, renameSyncResilient } = require('./fsync-utils');

function burninOutputPaths(videoPath, token = randomUUID()) {
  const dir = path.dirname(videoPath);
  const sourceExt = path.extname(videoPath).toLowerCase();
  const outputExt = sourceExt === '.mkv' ? '.mkv' : '.mp4';
  const base = path.basename(videoPath, sourceExt);
  return {
    outPath: path.join(dir, `${base}.altyazili${outputExt}`),
    tempPath: path.join(dir, `${base}.altyazili.${token}.tmp${outputExt}`),
  };
}

function burninAudioArgs(videoPath, outPath) {
  const sourceExt = path.extname(String(videoPath || '')).toLowerCase();
  const outputExt = path.extname(String(outPath || '')).toLowerCase();
  // WebM/Ogg kaynaklarinda Opus/Vorbis sesi MP4'e stream-copy etmek FFmpeg
  // muxerinda basarisiz olabilir. Yalniz bu container gecisinde AAC'e cevir;
  // diger kaynaklarda hizli ve kayipsiz copy davranisini koru.
  if (outputExt === '.mp4' && ['.webm', '.ogg', '.oga', '.ogv'].includes(sourceExt)) {
    return ['-c:a', 'aac', '-b:a', '192k'];
  }
  return ['-c:a', 'copy'];
}

function removeFileQuietly(filePath, fsImpl = fs) {
  if (!filePath) return;
  try { fsImpl.unlinkSync(filePath); }
  catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
}

function replaceBurninOutput(tempPath, outPath, fsImpl = fs, token = randomUUID()) {
  if (!fsImpl.existsSync(outPath)) {
    renameSyncResilient(fsImpl, tempPath, outPath);
    fsyncDirectory(path.dirname(outPath), fsImpl);
    return;
  }
  const backupPath = `${outPath}.${token}.replace-backup`;
  renameSyncResilient(fsImpl, outPath, backupPath);
  try {
    renameSyncResilient(fsImpl, tempPath, outPath);
    removeFileQuietly(backupPath, fsImpl);
    fsyncDirectory(path.dirname(outPath), fsImpl);
  } catch (error) {
    try { removeFileQuietly(outPath, fsImpl); } catch (_) {}
    try { renameSyncResilient(fsImpl, backupPath, outPath); } catch (_) {}
    throw error;
  }
}

const BURNIN_RECOVERY_SCHEMA_VERSION = 1;

function normalizeBurninRecovery(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // Şema migrasyonu: eksik/eski sürüm alanı v1 sayılır; daha yeni bir sürümle
  // yazılmış dosya alan anlamlarını değiştirmiş olabilir — sessizce v1 gibi
  // okumak yanlış yollarla kurtarma yapar, bu yüzden reddedilir. Taşan değer
  // (1e309) Infinity olur; isFinite koymadan büyüklük kıyası hepsini yakalar.
  if (Number(raw.version) > BURNIN_RECOVERY_SCHEMA_VERSION) return null;
  const videoPath = typeof raw.videoPath === 'string' ? raw.videoPath.trim() : '';
  const subPath = typeof raw.subPath === 'string' ? raw.subPath.trim() : '';
  const tempPath = typeof raw.tempPath === 'string' ? raw.tempPath.trim() : '';
  const outPath = typeof raw.outPath === 'string' ? raw.outPath.trim() : '';
  if (!videoPath || !subPath || !tempPath || !outPath) return null;
  return {
    version: BURNIN_RECOVERY_SCHEMA_VERSION,
    id: String(raw.id || '').slice(0, 100) || randomUUID(),
    videoPath: videoPath.slice(0, 8000),
    subPath: subPath.slice(0, 8000),
    tempPath: tempPath.slice(0, 8000),
    outPath: outPath.slice(0, 8000),
    pid: Number.isSafeInteger(Number(raw.pid)) && Number(raw.pid) > 0 ? Number(raw.pid) : null,
    totalSec: Math.max(0, Number(raw.totalSec) || 0),
    startedAt: Math.max(0, Number(raw.startedAt) || 0),
    previousOutSize: Math.max(0, Number(raw.previousOutSize) || 0),
    previousOutMtimeMs: Math.max(0, Number(raw.previousOutMtimeMs) || 0),
    missingGlyphs: Math.max(0, Number(raw.missingGlyphs) || 0),
    missingGlyphList: Array.isArray(raw.missingGlyphList)
      ? raw.missingGlyphList.map((g) => String(g)).slice(0, 512) : [],
  };
}

function burninTempLooksComplete({ size = 0, duration = 0, totalSec = 0 } = {}) {
  const bytes = Number(size) || 0;
  const actual = Number(duration) || 0;
  const expected = Number(totalSec) || 0;
  if (bytes < 1024 || actual <= 0) return false;
  if (expected <= 0) return true;
  return actual >= Math.max(expected * 0.99, expected - 1);
}

function burninFinalOutputLooksComplete({ size = 0, duration = 0, totalSec = 0,
    mtimeMs = 0, startedAt = 0, previousOutSize = 0, previousOutMtimeMs = 0 } = {}) {
  // Var olan eski bir .altyazili.mp4 dosyasını yeni işin çıktısı sanma. FFmpeg
  // geçici dosyayı bitirdikten sonra rename mtime'ı koruduğundan başarılı yeni
  // çıktı başlangıç zamanından daha yeni olmalıdır.
  const unchangedPrevious = Number(previousOutMtimeMs) > 0
    && Number(mtimeMs) === Number(previousOutMtimeMs)
    && Number(size) === Number(previousOutSize);
  if (unchangedPrevious || !(Number(startedAt) > 0)
      || Number(mtimeMs) < Number(startedAt) - 2000) return false;
  return burninTempLooksComplete({ size, duration, totalSec });
}

function burninProcessNameMatches(processName) {
  // path.basename POSIX'te ters bölü ayracı tanımaz; süreç adları Windows
  // biçiminde gelebilir — iki ayıracı da böl.
  const base = String(processName || '').trim().split(/[\\/]/).pop() || '';
  return /^ffmpeg(?:\.exe)?$/i.test(base);
}

function burninRecoveryProcessMatches({ pidAlive = false, processName = '', startedAt = 0,
    now = Date.now(), maxAgeMs = 48 * 60 * 60 * 1000 } = {}) {
  if (!pidAlive) return false;
  const age = Number(now) - Number(startedAt);
  if (!(Number(startedAt) > 0) || age < 0 || age > Number(maxAgeMs)) return false;
  // Süreç adı sorgulanabildiyse yalnız FFmpeg kabul edilir. Sorgu işletim
  // sistemi tarafından engellendiyse kısa ömürlü PID kontrolü güvenli fallback.
  return processName ? burninProcessNameMatches(processName) : true;
}

function burninReplacementBackupPaths(outPath, fsImpl = fs) {
  const dir = path.dirname(outPath);
  const base = path.basename(outPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${base}\\.[A-Za-z0-9-]{1,100}\\.replace-backup$`, 'i');
  try {
    return fsImpl.readdirSync(dir).filter((name) => pattern.test(name))
      .map((name) => path.join(dir, name));
  } catch (_) { return []; }
}

function cleanupBurninReplacementBackups(outPath, fsImpl = fs) {
  for (const backupPath of burninReplacementBackupPaths(outPath, fsImpl)) {
    removeFileQuietly(backupPath, fsImpl);
  }
}

function restoreNewestBurninReplacementBackup(outPath, fsImpl = fs) {
  if (fsImpl.existsSync(outPath)) return false;
  const backups = burninReplacementBackupPaths(outPath, fsImpl)
    .map((backupPath) => {
      try { return { backupPath, mtimeMs: Number(fsImpl.statSync(backupPath).mtimeMs) || 0 }; }
      catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!backups.length) return false;
  renameSyncResilient(fsImpl, backups[0].backupPath, outPath);
  cleanupBurninReplacementBackups(outPath, fsImpl);
  return true;
}

function burninRecoveryPathsMatch(recovery) {
  const item = normalizeBurninRecovery(recovery);
  if (!item) return false;
  const expected = burninOutputPaths(item.videoPath, 'token');
  if (path.resolve(item.outPath) !== path.resolve(expected.outPath)) return false;
  if (path.dirname(path.resolve(item.tempPath)) !== path.dirname(path.resolve(expected.tempPath))) return false;
  const base = path.basename(item.videoPath, path.extname(item.videoPath))
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const outputExt = path.extname(expected.outPath).replace('.', '\\.');
  return new RegExp(`^${base}\\.altyazili\\.[^.\\/]+\\.tmp${outputExt}$`, 'i')
    .test(path.basename(item.tempPath));
}

// Dosya sürüm alanı şemadan yeniyse dosya "tanınmış ama desteklenmeyen"
// durumdadır; bu durumda .bak yedeğine düşülmez — yedeğin daha eski sürümde
// kaldığı garanti değildir ve kullanıcının geçtiği eski işi diriltir.
function burninRecoveryVersionTooNew(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) &&
    Number(raw.version) > BURNIN_RECOVERY_SCHEMA_VERSION;
}

// Birincil dosya okunamazsa (yok/bozuk/büyük/yol uymaz) .bak denenir;
// sürüm-reddi ise her iki adayda da dosyayı tamamen reddeder.
function readBurninRecoveryFile(primaryPath, fsImpl = fs) {
  for (const candidate of [primaryPath, `${primaryPath}.bak`]) {
    try {
      if (!fsImpl.existsSync(candidate) || fsImpl.statSync(candidate).size > 128 * 1024) continue;
      const raw = JSON.parse(fsImpl.readFileSync(candidate, 'utf8'));
      if (burninRecoveryVersionTooNew(raw)) return null;
      const recovery = normalizeBurninRecovery(raw);
      if (recovery && burninRecoveryPathsMatch(recovery)) return recovery;
    } catch (_) {}
  }
  return null;
}

module.exports = {
  BURNIN_RECOVERY_SCHEMA_VERSION,
  burninAudioArgs,
  burninFinalOutputLooksComplete,
  burninOutputPaths,
  burninProcessNameMatches,
  burninRecoveryProcessMatches,
  burninRecoveryPathsMatch,
  burninRecoveryVersionTooNew,
  burninReplacementBackupPaths,
  burninTempLooksComplete,
  cleanupBurninReplacementBackups,
  normalizeBurninRecovery,
  readBurninRecoveryFile,
  removeFileQuietly,
  restoreNewestBurninReplacementBackup,
  replaceBurninOutput,
};
