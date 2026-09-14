'use strict';
const { normalizeSessionTab } = require('./browser-session-store');
// Video kimliği başına sınırlı yerel tercih deposu; erişim yetkisini çağıran main doğrular.
class BrowserSubtitlePreferences {
  constructor({ read, readBackup, write, limit = 200 }) {
    this.write = write; this.limit = limit; this.items = new Map();
    this.recovery = '';
    try { this.load(read()); } catch (error) {
      try { this.load(readBackup?.()); this.recovery = 'backup'; }
      catch (_) { if (error.code !== 'ENOENT') this.recovery = 'unavailable'; }
    }
  }
  load(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.items)) throw Error('Geçersiz altyazı tercih dosyası');
    if (value.items.some(row => !row?.mediaId || !row.subtitleSelection || !normalizeSessionTab({ ...row, id: 'preference' }))) {
      throw Error('Geçersiz video altyazı tercihi');
    }
    for (const row of value.items) this.put(row, false);
  }
  remove(mediaId) {
    if (!this.items.has(mediaId)) return false;
    const next = new Map(this.items); next.delete(mediaId);
    this.write({ version: 1, items: [...next.values()] });
    this.items = next; return true;
  }
  put(raw, persist = true) {
    if (!raw?.mediaId || !raw.subtitleSelection) return false;
    const normalized = normalizeSessionTab({ ...raw, id: 'preference' });
    if (!normalized) return false;
    const row = { mediaId: normalized.mediaId, url: normalized.url,
      subtitleSelection: normalized.subtitleSelection, subtitleMode: normalized.subtitleMode,
      subtitleSyncRecords: normalized.subtitleSyncRecords };
    if (!row.mediaId) return false;
    if (persist && !Object.values(row.subtitleSelection || {}).some(Boolean) && !row.subtitleSyncRecords?.length) return this.remove(row.mediaId);
    const before = JSON.stringify(this.items.get(row.mediaId));
    if (before === JSON.stringify(row)) return false;
    const next = new Map(this.items); next.delete(row.mediaId); next.set(row.mediaId, row);
    while (next.size > this.limit) next.delete(next.keys().next().value);
    if (persist) this.write({ version: 1, items: [...next.values()] });
    this.items = next;
    return true;
  }
  get(mediaId) { const row = this.items.get(mediaId); return row ? JSON.parse(JSON.stringify(row)) : null; }
}
module.exports = { BrowserSubtitlePreferences };
