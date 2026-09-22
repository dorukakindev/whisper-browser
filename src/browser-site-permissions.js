const SUPPORTED_BROWSER_PERMISSIONS = Object.freeze([
  'camera', 'microphone', 'media', 'mediaKeySystem', 'geolocation', 'notifications',
  'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture',
  'midi', 'midiSysex', 'pointerLock', 'idle-detection', 'serial', 'usb',
]);
const DECISIONS = new Set(['allow', 'block', 'ask']);
const MAX_PERMISSION_ORIGINS = 200;

function permissionOrigin(raw) {
  try {
    const url = new URL(String(raw || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch (_) { return ''; }
}

function browserPermissionRequesterUrl(requestingOrigin, details = {}, allowOriginFallback = false) {
  const frameUrl = String(details?.requestingUrl || '');
  // An opaque or invalid frame URL must not inherit its embedding page's grant.
  if (frameUrl) return permissionOrigin(frameUrl) ? frameUrl : '';
  const origin = allowOriginFallback ? String(requestingOrigin || '') : '';
  return permissionOrigin(origin) ? origin : '';
}

function normalizePermissionName(value) {
  const name = String(value || '').slice(0, 80);
  return SUPPORTED_BROWSER_PERMISSIONS.includes(name) ? name : '';
}

function normalizeBrowserSitePermissions(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw).slice(0, MAX_PERMISSION_ORIGINS)) {
    const origin = permissionOrigin(key);
    if (!origin || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const permissions = {};
    for (const [name, decision] of Object.entries(value.permissions || value)) {
      const normalizedName = normalizePermissionName(name);
      if (normalizedName && DECISIONS.has(decision)) permissions[normalizedName] = decision;
    }
    if (Object.keys(permissions).length) result[origin] = {
      permissions,
      updatedAt: Math.max(0, Number(value.updatedAt) || 0),
    };
  }
  return result;
}

function browserPermissionDecision(sitePermissions, rawUrl, permission) {
  const origin = permissionOrigin(rawUrl);
  const name = normalizePermissionName(permission);
  if (!origin || !name) return 'block';
  const stored = normalizeBrowserSitePermissions(sitePermissions)[origin]?.permissions?.[name];
  if (stored) return stored;
  return 'ask';
}

// Electron 'media' isteği details.mediaTypes ile gelir; kayıtlı camera/microphone
// kararları bu türlere uygulanmalı — aksi halde 'kamera: engelle' saklanmışken
// media isteği yeniden soruluyordu.
function browserMediaTypesFor(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const mapped = [];
  for (const item of list) {
    const type = String(item || '').toLowerCase();
    if (type === 'video' || type === 'camera') mapped.push('camera');
    else if (type === 'audio' || type === 'microphone') mapped.push('microphone');
  }
  return [...new Set(mapped)];
}

function browserMediaPermissionDecision(sitePermissions, rawUrl, mediaTypes) {
  const mapped = browserMediaTypesFor(mediaTypes);
  if (!mapped.length) return browserPermissionDecision(sitePermissions, rawUrl, 'media');
  const decisions = mapped.map((name) => browserPermissionDecision(sitePermissions, rawUrl, name));
  if (decisions.includes('block')) return 'block';
  return decisions.every((item) => item === 'allow') ? 'allow' : 'ask';
}

function withBrowserPermission(sitePermissions, rawUrl, permission, decision, now = Date.now()) {
  const origin = permissionOrigin(rawUrl);
  const name = normalizePermissionName(permission);
  const choice = DECISIONS.has(decision) ? decision : '';
  if (!origin || !name || !choice) return { ok: false, error: 'Gecersiz site veya izin secimi.' };
  const normalized = normalizeBrowserSitePermissions(sitePermissions);
  const existing = normalized[origin] || { permissions: {}, updatedAt: 0 };
  const permissions = { ...existing.permissions };
  permissions[name] = choice;
  if (Object.keys(permissions).length) normalized[origin] = { permissions, updatedAt: now };
  else delete normalized[origin];
  const entries = Object.entries(normalized).sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt))
    .slice(0, MAX_PERMISSION_ORIGINS);
  return { ok: true, origin, permission: name, decision: choice,
    sitePermissions: Object.fromEntries(entries) };
}

module.exports = { MAX_PERMISSION_ORIGINS, SUPPORTED_BROWSER_PERMISSIONS,
  browserPermissionRequesterUrl,
  browserMediaPermissionDecision, browserMediaTypesFor, browserPermissionDecision,
  normalizeBrowserSitePermissions, normalizePermissionName,
  permissionOrigin, withBrowserPermission };
