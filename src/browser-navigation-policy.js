'use strict';

const MAX_POLICY_URL_LENGTH = 8192;
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

const URL_POLICY = Object.freeze({
  'browser-address': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(), allowAboutBlank: false }),
  'browser-window-open': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(['mailto:']), allowAboutBlank: true }),
  'browser-navigation': Object.freeze({ internal: WEB_PROTOCOLS, external: new Set(['mailto:']), allowAboutBlank: true }),
  'app-window-open': Object.freeze({ internal: new Set(), external: new Set(['http:', 'https:', 'mailto:']), allowAboutBlank: false }),
  'renderer-external': Object.freeze({ internal: new Set(), external: new Set(['http:', 'https:', 'mailto:']), allowAboutBlank: false }),
});

function parsePolicyUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string' };
  if ([...raw].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return { ok: false, reason: 'control-character' };
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > MAX_POLICY_URL_LENGTH) return { ok: false, reason: 'too-long' };

  let parsed;
  try { parsed = new URL(value); }
  catch (_) { return { ok: false, reason: 'invalid-url' }; }
  const protocol = parsed.protocol.toLowerCase();
  if (WEB_PROTOCOLS.has(protocol) && !parsed.hostname) return { ok: false, reason: 'missing-host' };
  // URL kullanıcı bilgisi adres çubuğunda gerçek hostu saklayabildiği için
  // gömülü ve harici akışların ikisinde de reddedilir.
  if (parsed.username || parsed.password) return { ok: false, reason: 'credentials-not-allowed' };
  return {
    ok: true,
    url: parsed.href,
    protocol,
    hostname: parsed.hostname.toLowerCase(),
    origin: parsed.origin,
  };
}

function urlOriginRelation(sourceRaw, target) {
  if (!sourceRaw) return 'no-opener';
  const source = parsePolicyUrl(String(sourceRaw));
  if (!source.ok || !WEB_PROTOCOLS.has(source.protocol) || !WEB_PROTOCOLS.has(target.protocol)) {
    return 'opaque-or-invalid';
  }
  return source.origin === target.origin ? 'same-origin' : 'cross-origin';
}

function decideUrlPolicy(raw, surface, sourceUrl = '') {
  const rule = URL_POLICY[surface];
  if (!rule) return { action: 'deny', reason: 'unknown-surface', url: '' };
  const parsed = parsePolicyUrl(raw);
  if (!parsed.ok) return { action: 'deny', reason: parsed.reason, url: '' };
  const result = {
    url: parsed.url,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    origin: parsed.origin,
    relation: urlOriginRelation(sourceUrl, parsed),
  };
  if (parsed.protocol === 'about:' && parsed.url === 'about:blank' && rule.allowAboutBlank) {
    return { action: 'allow', reason: 'blank-bootstrap', ...result };
  }
  if (rule.internal.has(parsed.protocol)) return { action: 'allow', reason: 'web-navigation', ...result };
  if (rule.external.has(parsed.protocol)) return { action: 'external', reason: 'explicit-external-protocol', ...result };
  return { action: 'deny', reason: 'protocol-not-allowed', ...result };
}

function navigationEventDetails(eventOrDetails, legacyUrl, legacyIsMainFrame) {
  const url = eventOrDetails && typeof eventOrDetails.url === 'string' ? eventOrDetails.url : legacyUrl;
  const isMainFrame = eventOrDetails && typeof eventOrDetails.isMainFrame === 'boolean'
    ? eventOrDetails.isMainFrame
    : (typeof legacyIsMainFrame === 'boolean' ? legacyIsMainFrame : true);
  return { event: eventOrDetails, url, isMainFrame };
}

function safeWebContentsUrl(webContents) {
  try {
    if (!webContents || typeof webContents.isDestroyed !== 'function'
        || webContents.isDestroyed() || typeof webContents.getURL !== 'function') return '';
    return String(webContents.getURL() || '');
  } catch (_) { return ''; }
}

function attachNavigationGuard(webContents, options = {}) {
  if (!webContents || typeof webContents.on !== 'function') throw new TypeError('Geçerli bir webContents gerekli.');
  const surface = options.surface || 'browser-navigation';
  const sourceUrl = typeof options.sourceUrl === 'function'
    ? options.sourceUrl
    : () => String(options.sourceUrl || '');
  const guard = (eventOrDetails, legacyUrl, _legacyInPlace, legacyIsMainFrame) => {
    const navigation = navigationEventDetails(eventOrDetails, legacyUrl, legacyIsMainFrame);
    let currentSourceUrl = '';
    try { currentSourceUrl = sourceUrl(); } catch (_) {}
    const decision = decideUrlPolicy(navigation.url, surface, currentSourceUrl);
    try { if (typeof options.onDecision === 'function') options.onDecision(decision, navigation); } catch (_) {}
    if (decision.action === 'allow') return;
    if (navigation.event && typeof navigation.event.preventDefault === 'function') navigation.event.preventDefault();
    // Alt kare dış protokol isteği işletim sistemi uygulaması açamaz.
    if (navigation.isMainFrame && decision.action === 'external' && typeof options.openExternal === 'function') {
      try {
        const pending = options.openExternal(decision.url);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } catch (_) {}
    }
  };
  const frameGuard = (details) => {
    const navigation = navigationEventDetails(details);
    if (!navigation.isMainFrame) guard(details);
  };
  webContents.on('will-frame-navigate', frameGuard);
  webContents.on('will-navigate', guard);
  webContents.on('will-redirect', guard);
  return () => {
    if (typeof webContents.removeListener !== 'function') return;
    webContents.removeListener('will-frame-navigate', frameGuard);
    webContents.removeListener('will-navigate', guard);
    webContents.removeListener('will-redirect', guard);
  };
}

function securePopupWebPreferences(partition) {
  return {
    partition,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
  };
}

function createWindowRegistry() {
  const windows = new Set();
  return {
    add(window) {
      if (!window || typeof window.isDestroyed !== 'function' || window.isDestroyed()) return false;
      if (windows.has(window)) return true;
      windows.add(window);
      const remove = () => windows.delete(window);
      if (typeof window.once === 'function') window.once('closed', remove);
      else if (typeof window.on === 'function') window.on('closed', remove);
      return true;
    },
    closeAll() {
      const snapshot = [...windows];
      let closed = 0;
      for (const window of snapshot) {
        try {
          if (!window.isDestroyed()) {
            if (typeof window.destroy === 'function') window.destroy();
            else window.close();
          }
        } catch (_) {
          try { if (!window.isDestroyed() && typeof window.close === 'function') window.close(); } catch (_) {}
        }
        try {
          if (window.isDestroyed()) {
            windows.delete(window);
            closed++;
          }
        } catch (_) {}
      }
      return { attempted: snapshot.length, closed, remaining: windows.size };
    },
    size() { return windows.size; },
    values() { return [...windows]; },
  };
}

module.exports = {
  MAX_POLICY_URL_LENGTH,
  URL_POLICY,
  attachNavigationGuard,
  createWindowRegistry,
  decideUrlPolicy,
  parsePolicyUrl,
  safeWebContentsUrl,
  securePopupWebPreferences,
  urlOriginRelation,
};
