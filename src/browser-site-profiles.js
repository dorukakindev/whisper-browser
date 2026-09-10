const MAX_BROWSER_SITE_PROFILES = 200;

const PROFILE_FIELDS = Object.freeze({
  targetLanguage: { type: 'string', max: 24 },
  subtitleMode: { type: 'enum', values: ['off', 'source', 'translation', 'both'] },
  subtitleAutomation: { type: 'enum', values: ['off', 'ask', 'auto'] },
  mangaFontScale: { type: 'number', min: 0.7, max: 1.7, precision: 2 },
  overlayScale: { type: 'number', min: 0.65, max: 1.8, precision: 2 },
  overlayOpacity: { type: 'number', min: 0, max: 1, precision: 2 },
  overlayBottom: { type: 'number', min: 0, max: 75, precision: 1 },
  overlayWidth: { type: 'number', min: 40, max: 98, precision: 0 },
  overlayMaxLines: { type: 'number', min: 1, max: 6, precision: 0 },
  overlaySourceFirst: { type: 'boolean' },
  hideSiteCaptions: { type: 'boolean' },
  pageMode: { type: 'enum', values: ['bilingual', 'replace'] },
  pageTargetLanguage: { type: 'string', max: 24 },
  mangaTargetLanguage: { type: 'string', max: 24 },
  pageAuto: { type: 'boolean' },
  zoom: { type: 'number', min: 0.5, max: 3, precision: 1 },
});

function browserSiteOrigin(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    return parsed.origin.toLowerCase();
  } catch (_) { return ''; }
}

function normalizeProfileValue(field, value) {
  const rule = PROFILE_FIELDS[field];
  if (!rule) return undefined;
  if (value === null || value === undefined) return undefined;
  if (rule.type === 'boolean') return value === true || value === false ? value : undefined;
  if (rule.type === 'string') {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (text.length > rule.max) return undefined;
    if (text === '') return text;
    try {
      // Intl.Locale dil, script, bölge ve varyant alt etiketlerini BCP 47
      // dilbilgisine göre doğrular; "tr-9x" gibi geniş regex kaçaklarını reddeder.
      return new Intl.Locale(text).baseName.toLowerCase();
    } catch (_) {
      return undefined;
    }
  }
  if (rule.type === 'enum') return rule.values.includes(value) ? value : undefined;
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < rule.min || number > rule.max) return undefined;
  const scale = 10 ** (rule.precision || 0);
  return Math.round(number * scale) / scale;
}

function normalizeBrowserSiteProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const profile = {};
  for (const field of Object.keys(PROFILE_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue;
    const value = normalizeProfileValue(field, raw[field]);
    if (value !== undefined) profile[field] = value;
  }
  return profile;
}

function normalizeBrowserSiteProfiles(raw, legacyZooms = {}) {
  const profiles = {};
  for (const [rawOrigin, rawProfile] of Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})) {
    const origin = browserSiteOrigin(rawOrigin);
    const profile = normalizeBrowserSiteProfile(rawProfile);
    if (!origin || !Object.keys(profile).length || profiles[origin]) continue;
    profiles[origin] = profile;
    if (Object.keys(profiles).length >= MAX_BROWSER_SITE_PROFILES) break;
  }
  // Eski sürüm zoom'u hostname ile saklıyordu. Tek site kimliği kullanmak için
  // kayıtları bir kez güvenli HTTPS origin anahtarına taşır.
  for (const [rawHost, rawZoom] of Object.entries(legacyZooms || {})) {
    const host = String(rawHost || '').trim().toLowerCase();
    if (!/^[a-z0-9.-]{1,253}$/.test(host)) continue;
    const origin = browserSiteOrigin(`https://${host}`);
    const zoom = normalizeProfileValue('zoom', rawZoom);
    if (!origin || zoom === undefined) continue;
    if (!profiles[origin] && Object.keys(profiles).length >= MAX_BROWSER_SITE_PROFILES) continue;
    profiles[origin] = { zoom, ...(profiles[origin] || {}) };
  }
  return profiles;
}

function withBrowserSiteProfileField(rawProfiles, rawUrl, field, rawValue) {
  const profiles = normalizeBrowserSiteProfiles(rawProfiles);
  const origin = browserSiteOrigin(rawUrl);
  if (!origin || !PROFILE_FIELDS[field]) return { ok: false, reason: 'invalid', origin, profiles };
  const current = { ...(profiles[origin] || {}) };
  if (rawValue === undefined || rawValue === null) delete current[field];
  else {
    const value = normalizeProfileValue(field, rawValue);
    if (value === undefined) return { ok: false, reason: 'invalid', origin, profiles };
    current[field] = value;
  }
  if (Object.keys(current).length && !profiles[origin] && Object.keys(profiles).length >= MAX_BROWSER_SITE_PROFILES) {
    return { ok: false, reason: 'limit', origin, profiles };
  }
  if (Object.keys(current).length) profiles[origin] = current;
  else delete profiles[origin];
  return { ok: true, origin, profile: current, profiles: normalizeBrowserSiteProfiles(profiles) };
}

function withoutBrowserSiteProfile(rawProfiles, rawUrl) {
  const profiles = normalizeBrowserSiteProfiles(rawProfiles);
  const origin = browserSiteOrigin(rawUrl);
  if (!origin) return { ok: false, origin, profiles };
  delete profiles[origin];
  return { ok: true, origin, profiles };
}

function browserPathKey(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    const pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return parsed.origin.toLowerCase() + pathname;
  } catch (_) { return ''; }
}

function normalizeBrowserPathProfiles(raw) {
  const profiles = {};
  for (const [rawKey, rawProfile] of Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})) {
    const key = browserPathKey(rawKey);
    const profile = normalizeBrowserSiteProfile(rawProfile);
    if (!key || key.endsWith('/') || !Object.keys(profile).length || profiles[key]) continue;
    profiles[key] = profile;
    if (Object.keys(profiles).length >= MAX_BROWSER_SITE_PROFILES) break;
  }
  return profiles;
}

function withBrowserPathProfileField(rawProfiles, rawUrl, field, rawValue) {
  const profiles = normalizeBrowserPathProfiles(rawProfiles);
  const key = browserPathKey(rawUrl);
  if (!key || key.endsWith('/') || !PROFILE_FIELDS[field]) return { ok: false, reason: 'invalid', key, profiles };
  const current = { ...(profiles[key] || {}) };
  if (rawValue === undefined || rawValue === null) delete current[field];
  else { const value = normalizeProfileValue(field, rawValue); if (value === undefined) return { ok: false, reason: 'invalid', key, profiles }; current[field] = value; }
  if (Object.keys(current).length) profiles[key] = current; else delete profiles[key];
  return { ok: true, key, profile: current, profiles };
}

function withoutBrowserPathProfile(rawProfiles, rawUrl) {
  const profiles = normalizeBrowserPathProfiles(rawProfiles);
  const key = browserPathKey(rawUrl);
  if (!key || key.endsWith('/')) return { ok: false, key, profiles };
  delete profiles[key];
  return { ok: true, key, profiles };
}

function resolveEffectiveBrowserSettings({ defaults = {}, general = {}, profile = {}, pathProfile = {}, tab = {} } = {}) {
  const layers = [['default', defaults], ['general', general],
    ['site', normalizeBrowserSiteProfile(profile)], ['path', normalizeBrowserSiteProfile(pathProfile)], ['tab', normalizeBrowserSiteProfile(tab)]];
  const values = {};
  const sources = {};
  for (const field of Object.keys(PROFILE_FIELDS)) {
    for (const [source, layer] of layers) {
      if (!layer || !Object.prototype.hasOwnProperty.call(layer, field)) continue;
      const value = normalizeProfileValue(field, layer[field]);
      if (value === undefined) continue;
      values[field] = value;
      sources[field] = source;
    }
  }
  return { values, sources };
}

const browserSiteProfilesApi = {
  MAX_BROWSER_SITE_PROFILES,
  PROFILE_FIELDS,
  browserSiteOrigin,
  browserPathKey,
  normalizeBrowserSiteProfile,
  normalizeBrowserPathProfiles,
  withBrowserPathProfileField,
  withoutBrowserPathProfile,
  normalizeBrowserSiteProfiles,
  resolveEffectiveBrowserSettings,
  withBrowserSiteProfileField,
  withoutBrowserSiteProfile,
};
if (typeof module !== 'undefined' && module.exports) module.exports = browserSiteProfilesApi;
if (typeof window !== 'undefined') window.BrowserSiteProfiles = browserSiteProfilesApi;
