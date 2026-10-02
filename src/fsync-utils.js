'use strict';

// Paylaşılan fsync dayanıklılık yardımcıları.
//
// Temp-write + rename atomikliği tek başına YARI yazılmış temp'in ana dosyaya
// geçmesini engeller; fakat işletim sistemi sayfa önbelleğinde bekleyen veri
// çökmede kaybolabilir — rename sonrası diske ulaşmamış bir "başarılı yazım"
// güç kesintisinde dosyayı sıfır-bayta döndürebilir. watch-library-store'daki
// tören (temp fsync → rename → dizin fsync) diğer depolara da aynı sözleşmeyle
// uygulanır.

const fs = require('fs');
const path = require('path');

const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch (_) {}
}

// Windows'ta antivirüs/Windows Search indeksleyici az önce yazılan dosyayı
// kısa süreli açık tutar; hedef üzerine renameSync EPERM/EACCES/EBUSY ile
// düşebilir — kullanıcı bunu "kaydetme başarısız" olarak görür. Atomik
// commit anlambilimini koruyarak kısa sınırlı yeniden deneme eklenir;
// kalıcı hata son denemede aynen fırlatılır. `io` enjekte edilmiş fs'tir —
// sahte-fs testlerinde davranış aynı kalır.
function renameSyncResilient(io, tmp, target, { attempts = 10, delayMs = 25 } = {}) {
  for (let i = 0; ; i++) {
    try { return io.renameSync(tmp, target); }
    catch (error) {
      if (!error || !RENAME_RETRY_CODES.has(error.code) || i >= attempts - 1) throw error;
      sleepSync(delayMs);
    }
  }
}

function fsyncFile(filePath, io = fs) {
  // Windows'ta FlushFileBuffers salt-okunur tanıtıcıda EPERM döndürebilir.
  // Geçici dosyalar bize ait ve yazılabilir; r+ gerçek flush semantiğini korur.
  const descriptor = io.openSync(filePath, 'r+');
  try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
}

function fsyncFileBestEffort(filePath, io = fs) {
  // Yedek (.bak) veya ikincil kopya gibi kritik-olmayan hedeflerde fsync
  // reddi (salt-okunur disk/izin) yazımın kendisini geri almamalı.
  try { fsyncFile(filePath, io); } catch (_) {}
}

// Dizin fsync'i desteklemeyen ortamlar: Windows'ta dizin open() zaten
// reddedilir; FUSE vb. fsync'te ENOTSUP/EINVAL verebilir. Bunlar tolere
// edilir; açılabilmiş bir dizinde fsync'in G/Ç hatasıyla düşmesi ise
// gerçek dayanıklılık kaybıdır — yutulursa çağıran kaydı kalıcı sanır.
const FSYNC_DIR_TOLERATED = new Set(['ENOTSUP', 'EINVAL', 'EPERM', 'EACCES', 'EROFS', 'ENOSYS', 'EISDIR']);

function fsyncDirectory(dirPath, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(dirPath, 'r');
  } catch (_) {
    return; // açılamayan dizin → platform desteklemiyor, en iyi çaba.
  }
  try {
    io.fsyncSync(descriptor);
  } catch (error) {
    if (error && FSYNC_DIR_TOLERATED.has(error.code)) return;
    throw error;
  } finally {
    try { io.closeSync(descriptor); } catch (_) {}
  }
}

// Tek-adımlık dayanıklı commit: payload'u temp'e yaz + fsync + rename + dizin
// fsync. Atomik değişim garantisi temp+rename'den, dayanıklılık fsync'ten gelir.
function atomicWriteFileSync(filePath, payload, options = {}) {
  const io = options.io || fs;
  const dir = path.dirname(filePath);
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  // recursive mkdir'in yeni kurduğu zincir köke kadar çıkabilir; her düzeyin
  // dizin kaydı kendi üst klasörünün önbelleğinde bekler. Yalnız `dir`'i
  // senkronlamak güç kesintisinde yeni klasörü kaybettirir.
  const missingDirs = [];
  for (let d = dir; !io.existsSync(d) && path.dirname(d) !== d; d = path.dirname(d)) {
    missingDirs.push(d);
  }
  const topParent = missingDirs.length ? path.dirname(missingDirs[missingDirs.length - 1]) : null;
  io.mkdirSync(dir, { recursive: true });
  try {
    io.writeFileSync(temp, payload, options.encoding || 'utf8');
    fsyncFile(temp, io);
    renameSyncResilient(io, temp, filePath);
    fsyncDirectory(dir, io);
    for (let i = 1; i < missingDirs.length; i++) fsyncDirectory(missingDirs[i], io);
    if (topParent) fsyncDirectory(topParent, io);
  } catch (error) {
    try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

module.exports = { fsyncFile, fsyncFileBestEffort, fsyncDirectory, atomicWriteFileSync, renameSyncResilient };
