'use strict';
// Paylaşılan atomik JSON yazımı ve silme/sıfırlama yedek-ayna politikası
// (R86-03): mirror yazımlarında güncel içerik önce .bak'a yazılır; ayna
// yazılamazsa birincil dosya hiç değişmez — API sahte başarı dönmez, bellek
// ve disk aynı eski durumda kalır. Yalnız sahip olunan kesin dosyalar
// hedeflenir; wildcard silme kullanılmaz.
const fs = require('node:fs');
const path = require('node:path');

function writeJsonAtomic(io, filePath, value) {
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    io.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', flush: true });
    io.renameSync(tmp, filePath);
  } catch (error) {
    try { if (io.existsSync(tmp)) io.unlinkSync(tmp); } catch (_) {}
    throw error;
  }
}

function writeMirroredJsonAtomic(io, filePath, value) {
  writeJsonAtomic(io, `${filePath}.bak`, value);
  writeJsonAtomic(io, filePath, value);
}

module.exports = { writeJsonAtomic, writeMirroredJsonAtomic };
