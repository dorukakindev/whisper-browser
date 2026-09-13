const { createBuiltinAdapterRegistry } = require('./browser-adapter-registry');

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

function sanitizeManifestPreview(value, limit = 2048) {
  return String(value == null ? '' : value).slice(0, Math.max(0, Number(limit) || 2048))
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactCaptureUrl(url))
    .replace(/([?&](?:access_?token|auth(?:orization)?|api_?key|credential|expires?|jwt|key|password|policy|secret|session(?:id)?|sig(?:nature)?|token|x-amz-[^=&\s]+|x-goog-[^=&\s]+)=)[^&\s"'<>]+/gi, '$1[gizlendi]')
    .replace(/\b(?:authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, (match) => `${match.split(/[:=]/)[0]}=[gizlendi]`);
}

const SENSITIVE_MEDIA_URL_PARAM = /^(?:access_?token|auth(?:orization)?|api_?key|code|credential|expires?|jwt|key|key-pair-id|pass(?:code|word)?|policy|secret|session(?:id)?|sig(?:nature)?|state|token|x-amz-.+)$/i;

function persistentBrowserMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_MEDIA_URL_PARAM.test(key)) url.searchParams.delete(key);
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
