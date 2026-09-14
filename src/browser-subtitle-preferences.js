'use strict';
const { normalizeSessionTab } = require('./browser-session-store');
// Video kimliği başına sınırlı yerel tercih deposu; erişim yetkisini çağıran main doğrular.
class BrowserSubtitlePreferences {
  constructor({ read, write, limit = 200 }) {
    this.write = write; this.limit = limit; this.items = new Map();
    try { for (const row of read()?.items || []) this.put(row, false); } catch (_) {}
  }
  put(raw, persist = true) {
    if (!raw?.mediaId || !raw.subtitleSelection) return false;
    const normalized = normalizeSessionTab({ ...raw, id: 'preference' });
    if (!normalized) return false;
    const row = { mediaId: normalized.mediaId, url: normalized.url,
      subtitleSelection: normalized.subtitleSelection, subtitleMode: normalized.subtitleMode,
      subtitleSyncRecords: normalized.subtitleSyncRecords };
    if (!row.mediaId) return false;
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
