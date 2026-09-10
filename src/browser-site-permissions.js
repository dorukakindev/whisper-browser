const SUPPORTED_BROWSER_PERMISSIONS = Object.freeze([
  'camera', 'microphone', 'media', 'geolocation', 'notifications',
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
  if (name === 'fullscreen' || name === 'clipboard-sanitized-write') return 'allow';
  return 'ask';
}

function withBrowserPermission(sitePermissions, rawUrl, permission, decision, now = Date.now()) {
  const origin = permissionOrigin(rawUrl);
  const name = normalizePermissionName(permission);
  const choice = DECISIONS.has(decision) ? decision : '';
  if (!origin || !name || !choice) return { ok: false, error: 'Gecersiz site veya izin secimi.' };
  const normalized = normalizeBrowserSitePermissions(sitePermissions);
  const existing = normalized[origin] || { permissions: {}, updatedAt: 0 };
  const permissions = { ...existing.permissions };
  if (choice === 'ask') delete permissions[name];
  else permissions[name] = choice;
  if (Object.keys(permissions).length) normalized[origin] = { permissions, updatedAt: now };
  else delete normalized[origin];
  const entries = Object.entries(normalized).sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt))
    .slice(0, MAX_PERMISSION_ORIGINS);
  return { ok: true, origin, permission: name, decision: choice,
    sitePermissions: Object.fromEntries(entries) };
}

module.exports = { MAX_PERMISSION_ORIGINS, SUPPORTED_BROWSER_PERMISSIONS,
  browserPermissionDecision, normalizeBrowserSitePermissions, normalizePermissionName,
  permissionOrigin, withBrowserPermission };
