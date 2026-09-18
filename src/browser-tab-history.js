const { MAX_ABS_OFFSET_SECONDS } = require('./browser-subtitle-sync');
const { redactUrlSensitiveParams } = require('./browser-place-url');

const DEFAULT_CLOSED_TAB_LIMIT = 20;

function finiteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeClosedBrowserTab(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  // OAuth callback parametreleri kapalı-sekme geçmişine ve diske yazılmaz;
  // adresin geri kalanı (route çapası dahil) geri yükleme için korunur.
  const url = redactUrlSensitiveParams(String(snapshot.url || '').trim());
  if (!url) return null;
  return {
    url,
    title: String(snapshot.title || '').trim().slice(0, 300),
    captureEnabled: snapshot.captureEnabled !== false,
    pinned: !!snapshot.pinned,
    mediaId: String(snapshot.mediaId || '').slice(0, 300),
    service: String(snapshot.service || '').slice(0, 64),
    contentId: String(snapshot.contentId || '').slice(0, 300),
    position: finiteNumber(snapshot.position, 0, 0, 60 * 60 * 1000),
    duration: finiteNumber(snapshot.duration, 0, 0, 60 * 60 * 1000),
    rate: finiteNumber(snapshot.rate, 1, 0.25, 4),
    volume: finiteNumber(snapshot.volume, 1, 0, 1),
    muted: !!snapshot.muted,
    offset: finiteNumber(snapshot.offset, 0, -MAX_ABS_OFFSET_SECONDS, MAX_ABS_OFFSET_SECONDS),
    viewMode: ['cinema', 'reading', 'study'].includes(snapshot.viewMode)
      ? snapshot.viewMode : 'reading',
    subtitleMode: ['off', 'source', 'translation', 'both'].includes(snapshot.subtitleMode)
      ? snapshot.subtitleMode : 'source',
    targetLanguage: String(snapshot.targetLanguage || '').trim().toLowerCase().slice(0, 24),
    trackRefs: Array.isArray(snapshot.trackRefs)
      ? snapshot.trackRefs.slice(0, 12).map((item) => ({ ...item })) : [],
    subtitleSelection: snapshot.subtitleSelection && typeof snapshot.subtitleSelection === 'object'
      ? { ...snapshot.subtitleSelection } : null,
    subtitleSyncRecords: Array.isArray(snapshot.subtitleSyncRecords)
      ? snapshot.subtitleSyncRecords.slice(-500).map((item) => ({ ...item })) : [],
    subtitleEdits: Array.isArray(snapshot.subtitleEdits)
      ? snapshot.subtitleEdits.slice(-2000).map((item) => ({ ...item })) : [],
    subtitleRecordQuarantine: Array.isArray(snapshot.subtitleRecordQuarantine)
      ? snapshot.subtitleRecordQuarantine.slice(-100).map((item) => ({ ...item })) : [],
  };
}

class BrowserClosedTabHistory {
  constructor(limit = DEFAULT_CLOSED_TAB_LIMIT) {
    this.limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || DEFAULT_CLOSED_TAB_LIMIT)));
    this.entries = [];
  }

  push(snapshot) {
    const normalized = normalizeClosedBrowserTab(snapshot);
    if (!normalized) return false;
    this.entries.unshift(normalized);
    if (this.entries.length > this.limit) this.entries.length = this.limit;
    return true;
  }

  pop() {
    const entry = this.entries.shift();
    return entry ? normalizeClosedBrowserTab(entry) : null;
  }

  get size() { return this.entries.length; }
}

function isReplaceableBlankBrowserTab(snapshot, tabCount = 1) {
  if (Number(tabCount) !== 1 || !snapshot) return false;
  return !snapshot.url && !snapshot.title && !snapshot.pinned && !snapshot.loading
    && !snapshot.mangaBusy && !snapshot.pageTranslateBusy && !snapshot.translationTrackId;
}

module.exports = {
  BrowserClosedTabHistory,
  DEFAULT_CLOSED_TAB_LIMIT,
  isReplaceableBlankBrowserTab,
  normalizeClosedBrowserTab,
};
