const fs = require('fs');
const path = require('path');
const { canonicalMediaIdentity, normalizeBrowserUrl } = require('./browser-media-identity');
const { safePlaceUrl } = require('./browser-place-url');

const BROWSER_SESSION_VERSION = 1;
const MAX_SESSION_TABS = 24;
const MAX_TRACK_REFS = 12;

function cleanString(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function finiteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeTrackRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id || raw.trackId, 180);
  const assetId = cleanString(raw.assetId, 180);
  if (!id && !assetId) return null;
  return {
    id,
    assetId,
    role: ['source', 'translation', 'secondary'].includes(raw.role) ? raw.role : 'source',
    language: cleanString(raw.language, 24).toLowerCase(),
  };
}

function normalizeSessionTab(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safePlaceUrl(raw.url);
  if (!url) return null;
  const identity = canonicalMediaIdentity(url, {
    service: raw.service,
    contentId: raw.contentId,
    mediaId: raw.mediaId && !String(raw.mediaId).includes(':url:') ? String(raw.mediaId).split(':').slice(1).join(':') : '',
  });
  const trackRefs = (Array.isArray(raw.trackRefs) ? raw.trackRefs : [])
    .map(normalizeTrackRef).filter(Boolean).slice(0, MAX_TRACK_REFS);
  return {
    id: cleanString(raw.id, 128),
    url,
    title: cleanString(raw.title, 300),
    service: identity.service,
    mediaId: identity.key,
    contentId: identity.contentId,
    position: finiteNumber(raw.position, 0, 0, 60 * 60 * 1000),
    duration: finiteNumber(raw.duration, 0, 0, 60 * 60 * 1000),
    rate: finiteNumber(raw.rate, 1, 0.25, 4),
    volume: finiteNumber(raw.volume, 1, 0, 1),
    muted: !!raw.muted,
    pinned: !!raw.pinned,
    offset: finiteNumber(raw.offset, 0, -30, 30),
    captureEnabled: raw.captureEnabled !== false,
    viewMode: ['cinema', 'reading', 'study'].includes(raw.viewMode) ? raw.viewMode : 'reading',
    subtitleMode: ['off', 'source', 'translation', 'both'].includes(raw.subtitleMode)
      ? raw.subtitleMode : 'source',
    targetLanguage: cleanString(raw.targetLanguage, 24).toLowerCase(),
    trackRefs,
    // null eski kayıttır; iki boş kimlik ise kullanıcının bilinçli boş seçimidir.
    subtitleSelection: raw.subtitleSelection && typeof raw.subtitleSelection === 'object' && !Array.isArray(raw.subtitleSelection)
      ? { primaryId: cleanString(raw.subtitleSelection.primaryId, 180),
        secondaryId: cleanString(raw.subtitleSelection.secondaryId, 180) } : null,
  };
}

function normalizeBrowserSession(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const normalized = (Array.isArray(source.tabs) ? source.tabs : [])
    .map(normalizeSessionTab).filter(Boolean);
  const tabs = normalized.slice(0, MAX_SESSION_TABS);
  const activeTabId = cleanString(source.activeTabId, 128);
  const active = normalized.find((tab) => tab.id === activeTabId);
  if (active && !tabs.some((tab) => tab.id === activeTabId)) tabs[tabs.length - 1] = active;
  return {
    version: BROWSER_SESSION_VERSION,
    restoreEnabled: source.restoreEnabled !== false,
    activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : (tabs[0] ? tabs[0].id : ''),
    savedAt: finiteNumber(source.savedAt, Date.now(), 0),
    tabs,
  };
}

function browserSessionPath(app) {
  return path.join(app.getPath('userData'), 'browser-session.json');
}

function readBrowserSession(filePath, fsModule = fs) {
  for (const candidate of [filePath, `${filePath}.bak`]) {
    try {
      const parsed = JSON.parse(fsModule.readFileSync(candidate, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.tabs)) continue;
      if (parsed.tabs.length && !parsed.tabs.some((tab) => normalizeSessionTab(tab))) continue;
      return normalizeBrowserSession(parsed);
    } catch (_) {}
  }
  return normalizeBrowserSession({});
}

function writeBrowserSessionAtomic(filePath, rawSession, fsModule = fs) {
  const session = normalizeBrowserSession({ ...rawSession, savedAt: Date.now() });
  const dir = path.dirname(filePath);
  const temp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fsModule.mkdirSync(dir, { recursive: true });
  try {
    fsModule.writeFileSync(temp, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    if (fsModule.existsSync(filePath)) {
      try {
        const previous = JSON.parse(fsModule.readFileSync(filePath, 'utf8'));
        if (previous && !Array.isArray(previous) && Array.isArray(previous.tabs)
          && (!previous.tabs.length || previous.tabs.some((tab) => normalizeSessionTab(tab)))) {
          fsModule.copyFileSync(filePath, `${filePath}.bak`);
        }
      } catch (_) {} // Bozuk ana kayıt sağlam yedeğin üstüne yazılmasın.
    }
    fsModule.renameSync(temp, filePath);
    return { ok: true, session };
  } catch (error) {
    try { if (fsModule.existsSync(temp)) fsModule.unlinkSync(temp); } catch (_) {}
    return { ok: false, error: error.message, session };
  }
}

module.exports = {
  BROWSER_SESSION_VERSION,
  MAX_SESSION_TABS,
  browserSessionPath,
  normalizeBrowserSession,
  normalizeSessionTab,
  readBrowserSession,
  writeBrowserSessionAtomic,
};
