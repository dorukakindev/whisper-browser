const fs = require('fs');
const path = require('path');
const { canonicalMediaIdentity, normalizeBrowserUrl } = require('./browser-media-identity');
const { safePlaceUrl } = require('./browser-place-url');
const { MAX_ABS_OFFSET_SECONDS, createEditRecord, createSyncRecord } = require('./browser-subtitle-sync');
const { normalizeMangaPosition } = require('./browser-library-tools');
const { normalizeTabGroup } = require('./browser-tab-layout');
const { normalizeReaderPreferences } = require('./browser-reader');

const BROWSER_SESSION_VERSION = 8;
const MAX_SESSION_TABS = 24;
const MAX_TRACK_REFS = 12;
const MAX_RECOVERY_JOBS = 50;
const MAX_SYNC_RECORDS = 24;
const MAX_SUBTITLE_EDITS = 2000;
// HTMLMediaElement currentTime/duration değerleri saniyedir. Bu sınır uzun
// yayınları korurken bozuk veya aşırı kalıcılık girdilerini engeller.
const MAX_MEDIA_TIME_SECONDS = 60 * 60 * 1000;

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
    workspaceId: cleanIdentifier(raw.workspaceId, 128),
    tabId: cleanIdentifier(raw.tabId, 128),
    generation: finiteNumber(raw.generation, 0, 0),
    sourceHash: cleanString(raw.sourceHash, 128),
    operationId: cleanIdentifier(raw.operationId, 180),
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
  if (version < 6) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab, keepAwake: tab?.keepAwake === true,
      lifecycle: tab?.lifecycle === 'unloaded' ? 'unloaded' : 'background',
    })) : [] };
    version = 6;
  }
  if (version < 7) {
    source = { ...source, tabs: Array.isArray(source.tabs) ? source.tabs.map((tab) => ({
      ...tab, group: normalizeTabGroup(tab?.group),
    })) : [], splitSecondaryTabId: '', splitRatio: 0.5 };
    version = 7;
  }
  if (version < 8) {
    source = { ...source, cleanExit: source.cleanExit === true ? true : source.cleanExit === false ? false : null };
    version = 8;
  }
  source.version = BROWSER_SESSION_VERSION;
  // Yerel oturum gelecekte ek alanlar kazanırsa bilinmeyen alanları izinli
  // şemaya indirerek aç; taşınabilir paket sürümü ayrıca katı doğrulanır.
  return source;
}

// Düz sayfa içi çapa (#re.sub, #L42, #kurulum) yalnız YEREL oturum dosyasında
// korunur: geri açılan/geri yüklenen sekme sayfa başına dönmesin. Yedek, çalışma
// alanı ve taşınabilir oturum paketi safePlaceUrl ile çapasız kalır (gizlilik
// sözleşmesi). "=" / "&" taşıyan OAuth benzeri fragmentler hiçbir zaman tutulmaz.
const PLAIN_ANCHOR = /^[\p{L}\p{N}_.:~%-][\p{L}\p{N}_.:~%/-]{0,199}$/u;
function sessionTabUrl(rawUrl, keepAnchor) {
  const safe = safePlaceUrl(rawUrl);
  if (!safe || !keepAnchor || safe.includes('#')) return safe;
  try {
    const hash = new URL(String(rawUrl || '')).hash.slice(1);
    return hash && PLAIN_ANCHOR.test(hash) && `${safe}#${hash}`.length <= 8192 ? `${safe}#${hash}` : safe;
  } catch (_) { return safe; }
}

function normalizeSessionTab(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const url = sessionTabUrl(raw.url, options?.keepAnchor === true);
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
    position: finiteNumber(raw.position, 0, 0, MAX_MEDIA_TIME_SECONDS),
    duration: finiteNumber(raw.duration, 0, 0, MAX_MEDIA_TIME_SECONDS),
    rate: finiteNumber(raw.rate, 1, 0.25, 4),
    volume: finiteNumber(raw.volume, 1, 0, 1),
    muted: !!raw.muted,
    pinned: !!raw.pinned,
    group: normalizeTabGroup(raw.group),
    readerPreferences: normalizeReaderPreferences(raw.readerPreferences),
    keepAwake: !!raw.keepAwake,
    lifecycle: raw.lifecycle === 'unloaded' ? 'unloaded' : 'background',
    unloadedAt: finiteNumber(raw.unloadedAt, 0, 0),
    offset: finiteNumber(raw.offset, 0, -MAX_ABS_OFFSET_SECONDS, MAX_ABS_OFFSET_SECONDS),
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
        secondaryId: cleanString(raw.subtitleSelection.secondaryId, 180),
        ...(raw.subtitleSelection.primaryFile ? { primaryFile: cleanString(raw.subtitleSelection.primaryFile, 4096) } : {}),
        ...(raw.subtitleSelection.secondaryFile ? { secondaryFile: cleanString(raw.subtitleSelection.secondaryFile, 4096) } : {}) } : null,
  };
}

function normalizeBrowserSession(raw, options = {}) {
  const source = migrateBrowserSession(raw);
  const keepAnchor = options?.keepAnchor === true;
  const normalized = (Array.isArray(source.tabs) ? source.tabs : [])
    .map((tab) => normalizeSessionTab(tab, { keepAnchor })).filter(Boolean);
  const tabs = normalized.slice(0, MAX_SESSION_TABS);
  const activeTabId = cleanString(source.activeTabId, 128);
  const active = normalized.find((tab) => tab.id === activeTabId);
  // Aktif sekme sınır dışındaysa sıralamayı bozmadan başa al; son sekme
  // yerine en sondaki kayıt düşer, aktif sekme her zaman kurtarılır (R85-K2).
  if (active && !tabs.some((tab) => tab.id === activeTabId)) {
    tabs.pop();
    tabs.unshift(active);
  }
  const splitSecondaryTabId = cleanString(source.splitSecondaryTabId, 128);
  return {
    version: BROWSER_SESSION_VERSION,
    restoreEnabled: source.restoreEnabled !== false,
    activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : (tabs[0] ? tabs[0].id : ''),
    splitSecondaryTabId: splitSecondaryTabId !== activeTabId && tabs.some((tab) => tab.id === splitSecondaryTabId)
      ? splitSecondaryTabId : '',
    splitRatio: finiteNumber(source.splitRatio, 0.5, 0.25, 0.75),
    savedAt: finiteNumber(source.savedAt, Date.now(), 0),
    cleanExit: source.cleanExit === true ? true : source.cleanExit === false ? false : null,
    tabs,
  };
}

function browserSessionPath(app) {
  return path.join(app.getPath('userData'), 'browser-session.json');
}

function readBrowserSessionWithStatus(filePath, fsModule = fs) {
  let damaged = false;
  for (const candidate of [filePath, `${filePath}.bak`]) {
    try {
      const parsed = JSON.parse(fsModule.readFileSync(candidate, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.tabs)) {
        damaged = true;
        continue;
      }
      if (parsed.tabs.length && !parsed.tabs.some((tab) => normalizeSessionTab(tab))) {
        damaged = true;
        continue;
      }
      const session = normalizeBrowserSession(parsed, { keepAnchor: true });
      const droppedTabs = Math.max(0, parsed.tabs.length - session.tabs.length);
      return {
        session,
        droppedTabs,
        warning: droppedTabs
          ? `Tarayıcı oturumundaki ${droppedTabs} sekme geçersiz olduğu veya ${MAX_SESSION_TABS} sekme sınırını aştığı için kurtarılamadı.`
          : '',
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') damaged = true;
    }
  }
  return {
    session: normalizeBrowserSession({}),
    droppedTabs: 0,
    warning: damaged
      ? 'Tarayıcı oturumu okunamadı; ana dosya ve yedek kullanılabilir değil. Eski sekmeler kurtarılamadı.'
      : '',
  };
}

function readBrowserSession(filePath, fsModule = fs) {
  return readBrowserSessionWithStatus(filePath, fsModule).session;
}

function writeBrowserSessionAtomic(filePath, rawSession, fsModule = fs, options = {}) {
  const session = normalizeBrowserSession({ ...rawSession, savedAt: Date.now() }, { keepAnchor: true });
  const dir = path.dirname(filePath);
  const temp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fsModule.mkdirSync(dir, { recursive: true });
  try {
    fsModule.writeFileSync(temp, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    if (!options.mirrorBackup && fsModule.existsSync(filePath)) {
      try {
        const previous = JSON.parse(fsModule.readFileSync(filePath, 'utf8'));
        if (previous && !Array.isArray(previous) && Array.isArray(previous.tabs)
          && (!previous.tabs.length || previous.tabs.some((tab) => normalizeSessionTab(tab)))) {
          fsModule.copyFileSync(filePath, `${filePath}.bak`);
        }
      } catch (_) {} // Bozuk ana kayıt sağlam yedeğin üstüne yazılmasın.
    }
    // Silme/sıfırlama yazımlarında eski sekme durumunun .bak'ta yaşamaya devam
    // etmesi silinen veriyi geri getiriyordu (R83-34): bu yollarda yedek
    // doğrulanmış güncel duruma çekilir. Ayna birincil rename'den ÖNCE
    // yazılır — yedek yazılamazsa ana dosya hiç değişmez, böylece eski
    // hassas veri yedekte sessizce kalmaz ve API sahte başarı dönmez;
    // rename hatası da yalnız "yedek yeni, birincil eski" durumunda kalır
    // ve bir sonraki yükleme birincil dosyadan tutarlı okur (R86-03).
    if (options.mirrorBackup) {
      fsModule.copyFileSync(temp, `${filePath}.bak`);
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
  readBrowserSessionWithStatus,
  writeBrowserSessionAtomic,
};
