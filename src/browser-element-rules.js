'use strict';

// B10 — Kozmetik element picker kuralları: kullanıcının açıkça onayladığı
// display:none seçicileri kaynak (origin) başına kalıcı tutulur. Tek JSON
// dosyası, atomik tmp+rename yazımı; CSS kırılım karakterleri {}@;< yasak
// ('>' ve ':' meşru seçici birleştiricileri olarak serbest).
const fs = require('fs');
const path = require('path');

const ORIGIN_LIMIT = 60;
const SELECTOR_LIMIT = 40;
const SELECTOR_MAX_LEN = 300;

function originOf(url) {
  try {
    const u = new URL(String(url || ''));
    return /^https?:$/.test(u.protocol) ? u.origin : '';
  } catch (_) { return ''; }
}

function validSelector(sel) {
  const s = String(sel || '').trim();
  return !!s && s.length <= SELECTOR_MAX_LEN && !/[{}@;<]/.test(s);
}

class BrowserElementRules {
  constructor(filePath, fsImpl = fs) {
    this.filePath = filePath;
    this.fs = fsImpl;
  }

  _read() {
    try {
      const data = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      const origins = data && typeof data.origins === 'object' && data.origins ? data.origins : {};
      const clean = {};
      for (const [origin, list] of Object.entries(origins)) {
        if (!originOf(`${origin}/`)) continue;
        const sels = (Array.isArray(list) ? list : []).filter(validSelector).slice(0, SELECTOR_LIMIT);
        if (sels.length) clean[origin] = sels;
      }
      return clean;
    } catch (_) { return {}; }
  }

  _write(origins) {
    const entries = Object.entries(origins).slice(0, ORIGIN_LIMIT);
    const dir = path.dirname(this.filePath);
    this.fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.filePath}.tmp`;
    this.fs.writeFileSync(temp, `${JSON.stringify({ version: 1, origins: Object.fromEntries(entries) }, null, 2)}\n`);
    this.fs.renameSync(temp, this.filePath);
    return entries.length;
  }

  selectorsFor(url) {
    const origin = originOf(url);
    return origin ? (this._read()[origin] || []).slice() : [];
  }

  listOrigins() {
    const origins = this._read();
    return Object.entries(origins).map(([origin, selectors]) => ({ origin, selectors: selectors.slice() }));
  }

  add(url, selector) {
    const origin = originOf(url);
    const sel = String(selector || '').trim();
    if (!origin) return { ok: false, error: 'Geçerli bir sayfa kaynağı yok.' };
    if (!validSelector(sel)) return { ok: false, error: 'Seçici geçersiz veya desteklenmeyen karakter içeriyor.' };
    const origins = this._read();
    const list = origins[origin] || [];
    if (list.includes(sel)) return { ok: true, count: list.length, unchanged: true };
    if (list.length >= SELECTOR_LIMIT) return { ok: false, error: `Kaynak başına en fazla ${SELECTOR_LIMIT} öğe gizlenebilir.` };
    if (!origins[origin] && Object.keys(origins).length >= ORIGIN_LIMIT) {
      return { ok: false, error: `En fazla ${ORIGIN_LIMIT} site için gizleme kuralı tutulabilir.` };
    }
    origins[origin] = [...list, sel];
    this._write(origins);
    return { ok: true, count: origins[origin].length };
  }

  remove(url, selector) {
    const origin = originOf(url);
    if (!origin) return { ok: false, error: 'Geçerli bir sayfa kaynağı yok.' };
    const origins = this._read();
    const list = origins[origin] || [];
    const next = list.filter((sel) => sel !== selector);
    if (next.length === list.length) return { ok: true, unchanged: true };
    if (next.length) origins[origin] = next; else delete origins[origin];
    this._write(origins);
    return { ok: true, count: next.length };
  }

  clear(url) {
    const origin = originOf(url);
    if (!origin) return { ok: false, error: 'Geçerli bir sayfa kaynağı yok.' };
    const origins = this._read();
    if (!origins[origin]) return { ok: true, unchanged: true };
    delete origins[origin];
    this._write(origins);
    return { ok: true };
  }
}

module.exports = { BrowserElementRules, originOf, validSelector, ORIGIN_LIMIT, SELECTOR_LIMIT, SELECTOR_MAX_LEN };
