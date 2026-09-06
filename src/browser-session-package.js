const crypto = require('crypto');
const { normalizeBrowserSession, normalizeSessionTab } = require('./browser-session-store');
const { normalizeCues } = require('./browser-asset-store');
const { safePlaceUrl } = require('./browser-place-url');
const { normalizeBrowserSiteZooms } = require('./browser-site-zoom');
const { normalizeBrowserCompatibilityHosts } = require('./browser-cloudflare-compat');

const BROWSER_SESSION_PACKAGE_KIND = 'whisper-local-browser-session';
const BROWSER_SESSION_PACKAGE_VERSION = 1;
const MAX_PACKAGE_VARIANTS = 288;

function clean(value, max = 240) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function safePortableValue(value, max = 240) {
  const text = clean(value, max);
  return /^https?:\/\//i.test(text) ? safePlaceUrl(text) : text;
}

function checksumPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

function sanitizePlaces(raw = {}) {
  const cleanEntries = (items) => (Array.isArray(items) ? items : []).map((item) => ({
    url: safePlaceUrl(item?.url),
    title: clean(item?.title, 240),
    folder: clean(item?.folder, 64),
    visitedAt: Math.max(0, Number(item?.visitedAt || item?.createdAt) || 0),
  })).filter((item) => item.url).slice(0, 100);
  const workspaces = (Array.isArray(raw.workspaces) ? raw.workspaces : []).map((workspace) => ({
    name: clean(workspace?.name, 64),
    tabs: (Array.isArray(workspace?.tabs) ? workspace.tabs : [])
      .map(normalizeSessionTab).filter(Boolean).slice(0, 24),
  })).filter((workspace) => workspace.name && workspace.tabs.length).slice(0, 20);
  return {
    history: cleanEntries(raw.history),
    bookmarks: cleanEntries(raw.bookmarks),
    workspaces,
    siteZooms: normalizeBrowserSiteZooms(raw.siteZooms),
    compatibilityHosts: normalizeBrowserCompatibilityHosts(raw.compatibilityHosts),
  };
}

function sanitizeVariant(raw = {}) {
  const mediaId = clean(raw.mediaId, 240);
  const trackId = safePortableValue(raw.trackId || raw.id, 180);
  const cues = normalizeCues(raw.cues);
  if (!mediaId || !trackId || !cues.length) return null;
  return {
    assetId: clean(raw.assetId, 180),
    mediaId,
    trackId,
    language: clean(raw.language, 24).toLowerCase(),
    label: clean(raw.label, 240),
    role: ['source', 'translation', 'secondary'].includes(raw.role) ? raw.role : 'source',
    source: ['text-track', 'network', 'manifest', 'persisted', 'manual', 'embedded', 'live-asr', 'translation'].includes(raw.source)
      ? raw.source : 'manual',
    sourceHash: clean(raw.sourceHash, 64).replace(/[^a-f0-9]/gi, '').toLowerCase(),
    sourceTrackId: safePortableValue(raw.sourceTrackId, 180),
    provider: safePortableValue(raw.provider, 120),
    model: clean(raw.model, 120),
    createdAt: Math.max(0, Number(raw.createdAt) || 0),
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
    cues,
  };
}

function createBrowserSessionPackage({ session, places, variants = [], now = Date.now() } = {}) {
  const payload = {
    session: normalizeBrowserSession(session || {}),
    places: sanitizePlaces(places),
    variants: (Array.isArray(variants) ? variants : []).map(sanitizeVariant)
      .filter(Boolean).slice(0, MAX_PACKAGE_VARIANTS),
  };
  return {
    kind: BROWSER_SESSION_PACKAGE_KIND,
    version: BROWSER_SESSION_PACKAGE_VERSION,
    createdAt: new Date(now).toISOString(),
    payload,
    checksum: `sha256:${checksumPayload(payload)}`,
  };
}

function migratePackage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Oturum paketi bir JSON nesnesi olmalı.');
  const version = Number(raw.version);
  if (raw.kind !== BROWSER_SESSION_PACKAGE_KIND) throw new Error('Bu dosya Whisper Local tarayıcı oturum paketi değil.');
  if (!Number.isInteger(version) || version < 0 || version > BROWSER_SESSION_PACKAGE_VERSION) {
    throw new Error('Oturum paketi sürümü desteklenmiyor.');
  }
  if (!raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)) {
    throw new Error('Oturum paketinin veri bölümü eksik.');
  }
  const expected = `sha256:${checksumPayload(raw.payload)}`;
  if (typeof raw.checksum !== 'string' || raw.checksum.toLowerCase() !== expected) {
    throw new Error('Oturum paketinin checksum doğrulaması başarısız. Dosya değiştirilmiş veya bozulmuş olabilir.');
  }
  if (version === 0) {
    return {
      ...raw,
      version: 1,
      payload: {
        session: raw.payload.browserSession || raw.payload.session || {},
        places: raw.payload.browserPlaces || raw.payload.places || {},
        variants: raw.payload.tracks || raw.payload.variants || [],
      },
    };
  }
  return raw;
}

function inspectBrowserSessionPackage(raw) {
  const migrated = migratePackage(raw);
  const warnings = [];
  const rawSession = migrated.payload.session && typeof migrated.payload.session === 'object'
    ? migrated.payload.session : {};
  const tabs = [];
  for (const [index, candidate] of (Array.isArray(rawSession.tabs) ? rawSession.tabs : []).entries()) {
    const tab = normalizeSessionTab(candidate);
    if (tab) tabs.push(tab);
    else warnings.push(`Sekme ${index + 1} geçersiz olduğu için atlandı.`);
  }
  const session = normalizeBrowserSession({ ...rawSession, tabs });
  const variants = [];
  for (const [index, candidate] of (Array.isArray(migrated.payload.variants) ? migrated.payload.variants : []).entries()) {
    const variant = sanitizeVariant(candidate);
    if (variant) variants.push(variant);
    else warnings.push(`Altyazı varyantı ${index + 1} bozuk olduğu için atlandı.`);
  }
  return {
    ok: true,
    packageVersion: migrated.version,
    session,
    places: sanitizePlaces(migrated.payload.places),
    variants: variants.slice(0, MAX_PACKAGE_VARIANTS),
    warnings,
  };
}

module.exports = {
  BROWSER_SESSION_PACKAGE_KIND,
  BROWSER_SESSION_PACKAGE_VERSION,
  MAX_PACKAGE_VARIANTS,
  checksumPayload,
  createBrowserSessionPackage,
  inspectBrowserSessionPackage,
  sanitizePlaces,
  sanitizeVariant,
};
