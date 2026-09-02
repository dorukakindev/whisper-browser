'use strict';

const fs = require('fs');
const path = require('path');
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.json']);
const MAX_SUBTITLE_BYTES = 32 * 1024 * 1024;

function canonicalLocalPath(value) {
  if (typeof value !== 'string' || !value || value.length > 32760 || /[\x00-\x1f]/.test(value)
      || !path.isAbsolute(value) || /^\\\\[?.]\\/.test(value)
      || (process.platform === 'win32' && value.slice(2).includes(':'))) {
    throw new Error('Geçerli bir yerel dosya yolu gerekli.');
  }
  const resolved = path.resolve(value);
  // Resolve aliases before checking extensions and permissions (symlink/ADS).
  return fs.existsSync(resolved) ? fs.realpathSync(resolved)
    : path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
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

module.exports = { canonicalLocalPath, SubtitleFileAccess, MAX_SUBTITLE_BYTES };
