const SERVICE_ADAPTERS = Object.freeze([
  {
    id: 'netflix',
    label: 'Netflix',
    hosts: /(^|\.)netflix\.com$|(^|\.)nflxvideo\.net$/i,
    pageHosts: /(^|\.)netflix\.com$/i,
    responseHint: /manifest|timedtext|texttrack|caption|subtitle|webvtt|ttml|dfxp/i,
    help: 'Videoyu başlatın ve Netflix altyazı menüsünden kaynak dili açın.',
  },
  {
    id: 'disney',
    label: 'Disney+',
    hosts: /(^|\.)(disneyplus\.com|dssott\.com|bamgrid\.com)$/i,
    pageHosts: /(^|\.)disneyplus\.com$/i,
    responseHint: /caption|subtitle|texttrack|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i,
    help: 'Videoyu başlatın ve Disney+ oynatıcısında kaynak altyazıyı açın.',
  },
  {
    id: 'max',
    label: 'Max',
    hosts: /(^|\.)(max\.com|hbomax\.com|hbo\.com)$/i,
    pageHosts: /(^|\.)(max\.com|hbomax\.com)$/i,
    responseHint: /manifest|playback|caption|subtitle|texttrack|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i,
    help: 'Videoyu başlatın ve Max oynatıcısında kaynak altyazıyı açın.',
  },
  {
    id: 'discovery',
    label: 'Discovery+',
    hosts: /(^|\.)(discoveryplus\.com|discovery\.com)$/i,
    pageHosts: /(^|\.)discoveryplus\.com$/i,
    responseHint: /caption|subtitle|texttrack|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i,
    help: 'Videoyu başlatın; HLS altyazı izi oynatma başlayınca görünür.',
  },
  {
    id: 'hulu',
    label: 'Hulu',
    hosts: /(^|\.)hulu\.(com|jp)$/i,
    pageHosts: /(^|\.)hulu\.(com|jp)$/i,
    responseHint: /caption|subtitle|texttrack|webvtt|ttml|dfxp|sami|\.vtt|\.m3u8|\.mpd/i,
    help: 'Videoyu başlatın ve Hulu oynatıcısında kaynak altyazıyı açın.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hosts: /(^|\.)(youtube\.com|googlevideo\.com|youtu\.be)$/i,
    pageHosts: /(^|\.)(youtube\.com|youtu\.be)$/i,
    responseHint: /timedtext|caption|subtitle|json3|srv3|\.vtt/i,
    help: 'Videoyu başlatın ve YouTube CC menüsünden kaynak altyazıyı seçin.',
  },
]);

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
  const host = hostnameOf(url);
  return SERVICE_ADAPTERS.find((adapter) => adapter.pageHosts.test(host)) || GENERIC_ADAPTER;
}

function browserResponseAdapter(pageUrl, responseUrl) {
  const responseHost = hostnameOf(responseUrl);
  const pageAdapter = browserAdapterForUrl(pageUrl);
  if (pageAdapter !== GENERIC_ADAPTER
      && (pageAdapter.hosts.test(responseHost) || pageAdapter.responseHint.test(String(responseUrl || '')))) {
    return pageAdapter;
  }
  return SERVICE_ADAPTERS.find((adapter) => adapter.hosts.test(responseHost)) || pageAdapter;
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
  GENERIC_ADAPTER,
  SERVICE_ADAPTERS,
  adapterAcceptsResponse,
  browserAdapterForUrl,
  browserResponseAdapter,
  hostnameOf,
  redactCaptureUrl,
};
