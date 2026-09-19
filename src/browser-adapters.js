const { createBuiltinAdapterRegistry } = require('./browser-adapter-registry');
const { isSensitiveKey, startsWithSensitivePrefix, SENSITIVE_KEY_NAMES } = require('./browser-sensitive-keys');

const ADAPTER_REGISTRY = createBuiltinAdapterRegistry();
const SERVICE_ADAPTERS = Object.freeze(ADAPTER_REGISTRY.list());

const GENERIC_ADAPTER = Object.freeze({
  id: 'generic',
  label: 'Genel web videosu',
  help: 'Videoyu başlatın ve varsa sitenin kendi altyazısını açın.',
});

function hostnameOf(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); }
  catch (_) { return ''; }
}

function browserAdapterForUrl(url) {
  return ADAPTER_REGISTRY.forPage(url) || GENERIC_ADAPTER;
}

function browserResponseAdapter(pageUrl, responseUrl) {
  return ADAPTER_REGISTRY.forResponse(pageUrl, responseUrl) || GENERIC_ADAPTER;
}

function adapterAcceptsResponse(adapter, response = {}) {
  const url = String(response.url || '');
  const mime = String(response.mimeType || response.mime || '').toLowerCase();
  if (/text\/vtt|application\/(?:ttml|x-subrip)|application\/dash\+xml|mpegurl/i.test(mime)) return true;
  if (/\.(?:vtt|srt|ttml|dfxp|m3u8|mpd)(?:[?#]|$)/i.test(url)) return true;
  return Boolean(adapter && adapter.responseHint && adapter.responseHint.test(`${url} ${mime}`));
}

function redactCaptureUrl(value) {
  try {
    const url = new URL(String(value || ''));
    // URL userinfo is not part of a useful capture diagnosis and may contain
    // plaintext IPTV/intranet credentials.
    url.username = '';
    url.password = '';
    const kept = new URLSearchParams();
    for (const key of ['lang', 'language', 'locale', 'hl', 'fmt']) {
      if (url.searchParams.has(key)) kept.set(key, url.searchParams.get(key));
    }
    url.search = kept.toString();
    url.hash = '';
    return url.href.slice(0, 360);
  } catch (_) {
    return String(value || '').split(/[?#]/)[0]
      .replace(/^(https?:\/\/)[^/@\s]+@/i, '$1[gizlendi]@')
      .slice(0, 360);
  }
}

const MANIFEST_SECRET_KEY_RE = new RegExp(
  `([?&](?:${SENSITIVE_KEY_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`
  + `|key|(?:x-amz-|x-goog-|x-api-|aws-|google-)[^=&\\s]+)=)[^&\\s"'<>]+`,
  'gi');

function sanitizeManifestPreview(value, limit = 2048) {
  return String(value == null ? '' : value).slice(0, Math.max(0, Number(limit) || 2048))
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactCaptureUrl(url))
    .replace(MANIFEST_SECRET_KEY_RE, '$1[gizlendi]')
    .replace(/\b(?:authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, (match) => `${match.split(/[:=]/)[0]}=[gizlendi]`);
}

function persistentBrowserMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    // Kalıcı medya adresinde userinfo düz metin kimlik bilgisi taşır.
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      // Ortak sözlük camelCase OAuth adlarını da kapsar; 'key' eski davranış.
      if (isSensitiveKey(key) || startsWithSensitivePrefix(key) || /^key$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.href.slice(0, 2000);
  } catch (_) {
    return '';
  }
}

module.exports = {
  ADAPTER_REGISTRY,
  GENERIC_ADAPTER,
  SERVICE_ADAPTERS,
  adapterAcceptsResponse,
  browserAdapterForUrl,
  browserResponseAdapter,
  hostnameOf,
  persistentBrowserMediaUrl,
  redactCaptureUrl,
  sanitizeManifestPreview,
};
