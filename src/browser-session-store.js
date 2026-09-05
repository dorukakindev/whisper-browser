const fs = require('fs');
const path = require('path');
const { canonicalMediaIdentity, normalizeBrowserUrl } = require('./browser-media-identity');
const { safePlaceUrl } = require('./browser-place-url');

const BROWSER_SESSION_VERSION = 2;
const MAX_SESSION_TABS = 24;
const MAX_TRACK_REFS = 12;
const MAX_RECOVERY_JOBS = 50;

function cleanString(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanIdentifier(value, max = 240) {
  const text = cleanString(value, max);
  return /^https?:\/\//i.test(text) ? safePlaceUrl(text) : text;
}

function finiteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeTrackRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanIdentifier(raw.id || raw.trackId, 180);
  const assetId = cleanIdentifier(raw.assetId, 180);
  if (!id && !assetId) return null;
  return {
    id,
    assetId,
    role: ['source', 'translation', 'secondary'].includes(raw.role) ? raw.role : 'source',
    language: cleanString(raw.language, 24).toLowerCase(),
    label: cleanString(raw.label, 240),
    sourceHash: cleanString(raw.sourceHash, 64).replace(/[^a-f0-9]/gi, '').toLowerCase(),
    provider: cleanString(raw.provider, 120),
    model: cleanString(raw.model, 120),
    updatedAt: finiteNumber(raw.updatedAt, 0, 0),
  };
}

function normalizeRecoveryJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = ['subtitle-translation', 'manga', 'page-translation'].includes(raw.kind) ? raw.kind : '';
  if (!kind) return null;
  return {
    id: cleanIdentifier(raw.id, 180) || `${kind}:${cleanIdentifier(raw.trackId, 180)}`,
    kind,
    trackId: cleanIdentifier(raw.trackId, 180),
    mediaId: cleanString(raw.mediaId, 240),
    state: ['interrupted', 'queued', 'retryable'].includes(raw.state) ? raw.state : 'interrupted',
    completed: finiteNumber(raw.completed, 0, 0, 20000),
    total: finiteNumber(raw.total, 0, 0, 20000),
    failed: finiteNumber(raw.failed, 0, 0, 20000),
    createdAt: finiteNumber(raw.createdAt, Date.now(), 0),
    updatedAt: finiteNumber(raw.updatedAt, Date.now(), 0),
  };
}

function migrateBrowserSession(raw) {
  let source = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  let version = Number(source.version) || 1;
  if (version < 2) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab, recoveryJobs: Array.isArray(tab?.recoveryJobs) ? tab.recoveryJobs : [],
    })) : [] };
    version = 2;
  }
  // Yerel oturum gelecekte ek alanlar kazanırsa bilinmeyen alanları izinli
  // şemaya indirerek aç; taşınabilir paket sürümü ayrıca katı doğrulanır.
  return source;
}

function normalizeSessionTab(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safePlaceUrl(raw.url);
  if (!url) return null;
  const persistedMediaId = cleanString(raw.mediaId, 240);
  const persistedParts = persistedMediaId && !persistedMediaId.includes(':url:')
    ? persistedMediaId.split(':') : [];
  const identity = canonicalMediaIdentity(url, {
    service: raw.service || (persistedParts.length > 1 ? persistedParts[0] : ''),
    contentId: raw.contentId || (persistedParts.length > 1 ? persistedParts.slice(1).join(':') : ''),
  });
  const trackRefs = (Array.isArray(raw.trackRefs) ? raw.trackRefs : [])
    .map(normalizeTrackRef).filter(Boolean).slice(0, MAX_TRACK_REFS);
  const recoveryJobs = (Array.isArray(raw.recoveryJobs) ? raw.recoveryJobs : [])
    .map(normalizeRecoveryJob).filter(Boolean).slice(0, MAX_RECOVERY_JOBS);
  const favicon = safePlaceUrl(raw.favicon);
  return {
    id: cleanString(raw.id, 128),
    url,
    title: cleanString(raw.title, 300),
    favicon,
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
    recoveryJobs,
    // null eski kayıttır; iki boş kimlik ise kullanıcının bilinçli boş seçimidir.
    subtitleSelection: raw.subtitleSelection && typeof raw.subtitleSelection === 'object' && !Array.isArray(raw.subtitleSelection)
      ? { primaryId: cleanString(raw.subtitleSelection.primaryId, 180),
        secondaryId: cleanString(raw.subtitleSelection.secondaryId, 180) } : null,
  };
}

function normalizeBrowserSession(raw) {
  const source = migrateBrowserSession(raw);
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
  MAX_RECOVERY_JOBS,
  browserSessionPath,
  migrateBrowserSession,
  normalizeBrowserSession,
  normalizeSessionTab,
  readBrowserSession,
  writeBrowserSessionAtomic,
};
