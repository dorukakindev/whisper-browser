'use strict';

const fs = require('fs');
const path = require('path');
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.json']);
const MAX_SUBTITLE_BYTES = 32 * 1024 * 1024;
const PDF_EXTENSIONS = new Set(['.pdf']);
const MAX_PDF_BYTES = 300 * 1024 * 1024;

function canonicalLocalPath(value) {
  if (typeof value !== 'string' || !value || value.length > 32760 || /[\x00-\x1f]/.test(value)
      || !path.isAbsolute(value) || /^\\\\[?.]\\/.test(value)
      || (process.platform === 'win32' && value.slice(2).includes(':'))) {
    throw new Error('Geçerli bir yerel dosya yolu gerekli.');
  }
  const resolved = path.resolve(value);
  // Resolve aliases before checking extensions and permissions (symlink/ADS).
  if (fs.existsSync(resolved)) return fs.realpathSync(resolved);
  // Yeni/silinmiş bir dosyada parent henüz mevcut olmayabilir. Var olan en
  // yakın üst dizini gerçekleyip eksik parçaları tekrar ekle.
  const missing = [];
  let cursor = path.dirname(resolved);
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('Yerel dosya yolu çözümlenemedi.');
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  const canonicalParent = fs.realpathSync(cursor);
  return path.join(canonicalParent, ...missing, path.basename(resolved));
}

class SubtitleFileAccess {
  constructor() { this.grants = new Map(); }
  inspect(value) {
    const target = canonicalLocalPath(value);
    if (!SUBTITLE_EXTENSIONS.has(path.extname(target).toLowerCase())
        || !SUBTITLE_EXTENSIONS.has(path.extname(value).toLowerCase())) {
      throw new Error('Bu işlem yalnızca altyazı dosyaları için kullanılabilir.');
    }
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (!stat.isFile() || stat.size > MAX_SUBTITLE_BYTES) throw new Error('Altyazı dosyası geçersiz veya 32 MB sınırını aşıyor.');
    }
    return target;
  }
  key(target) { return process.platform === 'win32' ? target.toLowerCase() : target; }
  grant(value) {
    try {
      const target = this.inspect(value);
      this.grants.set(this.key(target), true);
      if (this.grants.size > 10000) this.grants.delete(this.grants.keys().next().value);
      return target;
    } catch (_) { return null; }
  }
  has(target) { return this.grants.has(this.key(target)); }
}

class MediaFileAccess {
  constructor(extensions) {
    this.extensions = new Set([...(extensions || [])].map((value) => String(value).replace(/^\./, '').toLowerCase()));
    this.grants = new Map();
  }
  inspect(value) {
    const target = canonicalLocalPath(value);
    const originalExt = path.extname(String(value)).slice(1).toLowerCase();
    const targetExt = path.extname(target).slice(1).toLowerCase();
    if (!this.extensions.has(originalExt) || !this.extensions.has(targetExt)) {
      throw new Error('Bu işlem yalnızca desteklenen medya dosyaları için kullanılabilir.');
    }
    const stat = fs.statSync(target);
    if (!stat.isFile()) throw new Error('Geçersiz medya dosyası.');
    return target;
  }
  key(target) { return process.platform === 'win32' ? target.toLowerCase() : target; }
  grant(value) {
    try {
      const target = this.inspect(value);
      this.grants.set(this.key(target), true);
      if (this.grants.size > 20000) this.grants.delete(this.grants.keys().next().value);
      return target;
    } catch (_) { return null; }
  }
  authorize(value) {
    const target = this.inspect(value);
    if (!this.grants.has(this.key(target))) throw new Error('Bu medya dosyası kullanıcı tarafından seçilmedi.');
    return target;
  }
  has(value) {
    try { return this.grants.has(this.key(this.inspect(value))); } catch (_) { return false; }
  }
}

class PdfFileAccess {
  constructor() { this.grants = new Map(); }
  inspect(value) {
    const target = canonicalLocalPath(value);
    if (!PDF_EXTENSIONS.has(path.extname(target).toLowerCase())
        || !PDF_EXTENSIONS.has(path.extname(value).toLowerCase())) {
      throw new Error('Bu işlem yalnızca PDF dosyaları için kullanılabilir.');
    }
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size < 5 || stat.size > MAX_PDF_BYTES) {
      throw new Error('PDF dosyası geçersiz veya 300 MB sınırını aşıyor.');
    }
    const descriptor = fs.openSync(target, 'r');
    try {
      const signature = Buffer.alloc(Math.min(1024, stat.size));
      const bytesRead = fs.readSync(descriptor, signature, 0, signature.length, 0);
      if (bytesRead < 5 || !signature.subarray(0, bytesRead).includes(Buffer.from('%PDF-', 'ascii'))) {
        throw new Error('Dosyanın PDF imzası geçersiz.');
      }
    } finally { fs.closeSync(descriptor); }
    return target;
  }
  key(target) { return process.platform === 'win32' ? target.toLowerCase() : target; }
  grant(value) {
    try {
      const target = this.inspect(value);
      this.grants.set(this.key(target), true);
      if (this.grants.size > 1000) this.grants.delete(this.grants.keys().next().value);
      return target;
    } catch (_) { return null; }
  }
  has(target) { return this.grants.has(this.key(target)); }
}

module.exports = {
  canonicalLocalPath,
  SubtitleFileAccess,
  MediaFileAccess,
  PdfFileAccess,
  MAX_SUBTITLE_BYTES,
  MAX_PDF_BYTES,
};
