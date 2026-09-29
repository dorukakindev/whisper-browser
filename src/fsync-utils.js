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

function fsyncDirectory(dirPath, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(dirPath, 'r');
    io.fsyncSync(descriptor);
  } catch (_) {
    // Windows ve bazı dosya sistemleri dizin fsync'ini desteklemez.
  } finally {
    if (descriptor !== undefined) try { io.closeSync(descriptor); } catch (_) {}
  }
}

// Tek-adımlık dayanıklı commit: payload'u temp'e yaz + fsync + rename + dizin
// fsync. Atomik değişim garantisi temp+rename'den, dayanıklılık fsync'ten gelir.
function atomicWriteFileSync(filePath, payload, options = {}) {
  const io = options.io || fs;
  const dir = path.dirname(filePath);
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  io.mkdirSync(dir, { recursive: true });
  try {
    io.writeFileSync(temp, payload, options.encoding || 'utf8');
    fsyncFile(temp, io);
    io.renameSync(temp, filePath);
    fsyncDirectory(dir, io);
  } catch (error) {
    try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

module.exports = { fsyncFile, fsyncFileBestEffort, fsyncDirectory, atomicWriteFileSync };
