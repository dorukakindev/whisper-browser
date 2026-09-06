const fs = require('fs');
const path = require('path');
const { canonicalMediaIdentity, normalizeBrowserUrl } = require('./browser-media-identity');
const { safePlaceUrl } = require('./browser-place-url');
const { createEditRecord, createSyncRecord } = require('./browser-subtitle-sync');
const { normalizeMangaPosition } = require('./browser-library-tools');

const BROWSER_SESSION_VERSION = 5;
const MAX_SESSION_TABS = 24;
const MAX_TRACK_REFS = 12;
const MAX_RECOVERY_JOBS = 50;
const MAX_SYNC_RECORDS = 24;
const MAX_SUBTITLE_EDITS = 2000;

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

function quarantineRecord(raw, reason, kind) {
  const source = raw?.record && typeof raw.record === 'object' && !Array.isArray(raw.record)
    ? raw.record : raw;
  const safeRecord = kind === 'sync' ? {
    version: finiteNumber(source && source.version, 0, 0),
    sourceHash: cleanString(source && source.sourceHash, 128),
    sourcePrefixHash: cleanString(source && source.sourcePrefixHash, 64),
    sourcePrefixCount: finiteNumber(source && source.sourcePrefixCount, 0, 0, 32),
    scale: finiteNumber(source && source.scale, 0),
    offsetSeconds: finiteNumber(source && (source.offsetSeconds ?? source.offset), 0),
    points: (Array.isArray(source?.points) ? source.points : []).slice(0, 2).map((point) => ({
      sourceTime: finiteNumber(point?.sourceTime, -1),
      videoTime: finiteNumber(point?.videoTime, -1),
      cueId: cleanIdentifier(point?.cueId, 180),
    })),
  } : kind === 'edit' ? {
    version: finiteNumber(source && source.version, 0, 0),
    sourceHash: cleanString(source && source.sourceHash, 128),
    sourceCueHash: cleanString(source && source.sourceCueHash, 64),
    baseTranslation: cleanString(source && source.baseTranslation, 12000),
    hasOverride: source?.hasOverride === true,
    userOverride: source?.hasOverride === true ? cleanString(source?.userOverride, 12000) : null,
    revision: finiteNumber(source && source.revision, 0, 0),
  } : null;
  return {
    kind,
    reason: cleanString(reason, 240),
    mediaId: cleanString((raw && raw.mediaId) || source?.mediaId, 240),
    sourceTrackId: cleanIdentifier((raw && raw.sourceTrackId) || source?.sourceTrackId, 180),
    variantId: cleanIdentifier((raw && raw.variantId) || source?.variantId, 180),
    cueId: cleanIdentifier((raw && raw.cueId) || source?.cueId, 180),
    updatedAt: finiteNumber(raw && (raw.updatedAt || raw.userEditedAt), Date.now(), 0),
    record: safeRecord,
  };
}

function normalizeRecordList(values, normalizer, limit, kind, quarantine) {
  const records = [];
  for (const raw of Array.isArray(values) ? values : []) {
    try { records.push(normalizer(raw)); }
    catch (error) { quarantine.push(quarantineRecord(raw, error.message, kind)); }
  }
  const stamp = (item) => Number(item?.updatedAt ?? item?.userEditedAt) || 0;
  return records.sort((a, b) => stamp(b) - stamp(a)).slice(0, limit);
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
  if (version < 3) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab,
      subtitleSyncRecords: Array.isArray(tab?.subtitleSyncRecords) ? tab.subtitleSyncRecords : [],
      subtitleEdits: Array.isArray(tab?.subtitleEdits) ? tab.subtitleEdits : [],
      subtitleRecordQuarantine: Array.isArray(tab?.subtitleRecordQuarantine) ? tab.subtitleRecordQuarantine : [],
    })) : [] };
    version = 3;
  }
  if (version < 4) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab,
      mangaPosition: tab?.mangaPosition && typeof tab.mangaPosition === 'object'
        ? tab.mangaPosition : null,
    })) : [] };
    version = 4;
  }
  if (version < 5) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab, compatibilityMode: tab?.compatibilityMode === true,
    })) : [] };
    version = 5;
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
  const subtitleRecordQuarantine = [];
  const subtitleSyncRecords = normalizeRecordList(raw.subtitleSyncRecords, createSyncRecord,
    MAX_SYNC_RECORDS, 'sync', subtitleRecordQuarantine);
  const subtitleEdits = normalizeRecordList(raw.subtitleEdits, createEditRecord,
    MAX_SUBTITLE_EDITS, 'edit', subtitleRecordQuarantine);
  for (const item of Array.isArray(raw.subtitleRecordQuarantine) ? raw.subtitleRecordQuarantine : []) {
    if (!item || typeof item !== 'object') continue;
    subtitleRecordQuarantine.push(quarantineRecord(item, item.reason || 'Önceki sürümde ayrılmış kayıt.', item.kind || 'unknown'));
  }
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
    compatibilityMode: raw.compatibilityMode === true,
    viewMode: ['cinema', 'reading', 'study'].includes(raw.viewMode) ? raw.viewMode : 'reading',
    subtitleMode: ['off', 'source', 'translation', 'both'].includes(raw.subtitleMode)
      ? raw.subtitleMode : 'source',
    targetLanguage: cleanString(raw.targetLanguage, 24).toLowerCase(),
    mangaPosition: raw.mangaPosition && typeof raw.mangaPosition === 'object'
      ? normalizeMangaPosition(raw.mangaPosition) : null,
    trackRefs,
    recoveryJobs,
    subtitleSyncRecords,
    subtitleEdits,
    subtitleRecordQuarantine: subtitleRecordQuarantine.slice(-100),
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
  MAX_SYNC_RECORDS,
  MAX_SUBTITLE_EDITS,
  browserSessionPath,
  migrateBrowserSession,
  normalizeBrowserSession,
  normalizeSessionTab,
  readBrowserSession,
  writeBrowserSessionAtomic,
};
