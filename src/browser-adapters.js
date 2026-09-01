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
  return ADAPTER_REGISTRY.forResponse(pageUrl, responseUrl) || browserAdapterForUrl(pageUrl);
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
    const kept = new URLSearchParams();
    for (const key of ['lang', 'language', 'locale', 'hl', 'fmt']) {
      if (url.searchParams.has(key)) kept.set(key, url.searchParams.get(key));
    }
    url.search = kept.toString();
    url.hash = '';
    return url.href.slice(0, 360);
  } catch (_) {
    return String(value || '').split(/[?#]/)[0].slice(0, 360);
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
  redactCaptureUrl,
};
