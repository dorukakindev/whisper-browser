const { canonicalMediaIdentity } = require('./browser-media-identity');
const fs = require('fs');
const path = require('path');

function pattern(value, fallback = /$a/) {
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (Array.isArray(value) && value.length) {
    const escaped = value.map((host) => String(host).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(^|\\.)(?:${escaped.join('|')})$`, 'i');
  }
  return fallback;
}

function normalizeAdapter(raw = {}) {
  const id = String(raw.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id)) throw new Error('Geçersiz tarayıcı adaptörü kimliği.');
  return Object.freeze({
    id,
    label: String(raw.label || id).trim().slice(0, 80),
    hosts: pattern(raw.hosts),
    pageHosts: pattern(raw.pageHosts || raw.hosts),
    responseHint: pattern(raw.responseHint, /caption|subtitle|texttrack|timedtext|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i),
    help: String(raw.help || 'Videoyu başlatın ve varsa sitenin kendi altyazısını açın.').trim().slice(0, 300),
    capabilities: Object.freeze({
      signIn: raw.capabilities?.signIn !== false,
      playback: raw.capabilities?.playback !== false,
      nativeTextTrack: raw.capabilities?.nativeTextTrack !== false,
      networkCapture: raw.capabilities?.networkCapture !== false,
      manifestCapture: raw.capabilities?.manifestCapture !== false,
      dualTrack: !!raw.capabilities?.dualTrack,
      overlay: raw.capabilities?.overlay !== false,
      fullscreen: !!raw.capabilities?.fullscreen,
      translation: raw.capabilities?.translation !== false,
    }),
    verifiedAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.verifiedAt || '') ? raw.verifiedAt : '',
    verificationStatus: ['verified', 'partial', 'unverified'].includes(raw.verificationStatus)
      ? raw.verificationStatus : 'unverified',
    source: raw.source === 'user' ? 'user' : 'builtin',
  });
}

class BrowserAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = new Map();
    for (const adapter of adapters) this.register(adapter);
  }

  register(raw) {
    const adapter = normalizeAdapter(raw);
    if (this.adapters.has(adapter.id)) throw new Error(`Tarayıcı adaptörü zaten kayıtlı: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }

  list() {
    return [...this.adapters.values()];
  }

  get(id) {
    return this.adapters.get(String(id || '').toLowerCase()) || null;
  }

  forPage(url) {
    let host = '';
    try { host = new URL(String(url || '')).hostname.toLowerCase(); } catch (_) {}
    return this.list().find((adapter) => adapter.pageHosts.test(host)) || null;
  }

  forResponse(pageUrl, responseUrl) {
    let host = '';
    try { host = new URL(String(responseUrl || '')).hostname.toLowerCase(); } catch (_) {}
    const page = this.forPage(pageUrl);
    if (page && (page.hosts.test(host) || page.responseHint.test(String(responseUrl || '')))) return page;
    return this.list().find((adapter) => adapter.hosts.test(host)) || null;
  }

  mediaIdentity(url, hints = {}) {
    const adapter = this.forPage(url);
    return canonicalMediaIdentity(url, { ...hints, service: hints.service || adapter?.id });
  }

  capabilityMatrix() {
    return this.list().map((adapter) => ({
      service: adapter.id,
      label: adapter.label,
      ...adapter.capabilities,
      captionDetection: adapter.capabilities.nativeTextTrack
        || adapter.capabilities.networkCapture || adapter.capabilities.manifestCapture,
      verifiedAt: adapter.verifiedAt,
      verificationStatus: adapter.verificationStatus,
      source: adapter.source,
    }));
  }

  loadJsonDirectory(directory) {
    const loaded = [];
    const errors = [];
    let names = [];
    try {
      fs.mkdirSync(directory, { recursive: true });
      names = fs.readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.json')).slice(0, 50);
    } catch (error) {
      return { loaded, errors: [error.message] };
    }
    for (const name of names) {
      const filePath = path.join(directory, name);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Dosya 64 KB sınırını aşıyor.');
        const definition = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (definition.version !== 1) throw new Error('Yalnızca sürüm 1 adaptörleri destekleniyor.');
        const safeDefinition = {
          ...definition,
          source: 'user',
          hosts: Array.isArray(definition.hosts) ? definition.hosts.slice(0, 30) : [],
          pageHosts: Array.isArray(definition.pageHosts) ? definition.pageHosts.slice(0, 30) : definition.hosts,
          // JSON eklentileri kod veya serbest regex çalıştıramaz. Ağ yakalama
          // mevcut güvenli genel altyazı imzasını kullanır.
          responseHint: undefined,
          verificationStatus: 'unverified',
          verifiedAt: '',
        };
        loaded.push(this.register(safeDefinition).id);
      } catch (error) {
        errors.push(`${name}: ${error.message}`);
      }
    }
    return { loaded, errors };
  }
}

const BUILTIN_ADAPTER_DEFINITIONS = Object.freeze([
  { id: 'netflix', label: 'Netflix', hosts: ['netflix.com', 'nflxvideo.net'], pageHosts: ['netflix.com'], responseHint: /manifest|timedtext|texttrack|caption|subtitle|webvtt|ttml|dfxp/i, help: 'Videoyu başlatın ve Netflix altyazı menüsünden kaynak dili açın.' },
  { id: 'disney', label: 'Disney+', hosts: ['disneyplus.com', 'dssott.com', 'bamgrid.com'], pageHosts: ['disneyplus.com'], help: 'Videoyu başlatın ve Disney+ oynatıcısında kaynak altyazıyı açın.' },
  { id: 'max', label: 'Max', hosts: ['max.com', 'hbomax.com', 'hbo.com'], pageHosts: ['max.com', 'hbomax.com'], responseHint: /manifest|playback|caption|subtitle|texttrack|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i, help: 'Videoyu başlatın ve Max oynatıcısında kaynak altyazıyı açın.' },
  { id: 'discovery', label: 'Discovery+', hosts: ['discoveryplus.com', 'discovery.com'], pageHosts: ['discoveryplus.com'], help: 'Videoyu başlatın; HLS altyazı izi oynatma başlayınca görünür.' },
  { id: 'hulu', label: 'Hulu', hosts: ['hulu.com', 'hulu.jp'], responseHint: /caption|subtitle|texttrack|webvtt|ttml|dfxp|sami|\.vtt|\.m3u8|\.mpd/i, help: 'Videoyu başlatın ve Hulu oynatıcısında kaynak altyazıyı açın.' },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'googlevideo.com', 'youtu.be'], pageHosts: ['youtube.com', 'youtu.be'], responseHint: /timedtext|caption|subtitle|json3|srv3|\.vtt/i, help: 'Videoyu başlatın ve YouTube CC menüsünden kaynak altyazıyı seçin.', capabilities: { fullscreen: true } },
  { id: 'prime-video', label: 'Prime Video', hosts: ['primevideo.com', 'amazon.com', 'media-amazon.com', 'aiv-cdn.net'], pageHosts: ['primevideo.com', 'amazon.com'], responseHint: /caption|subtitle|timedtext|webvtt|ttml|dfxp|\.vtt|\.m3u8|\.mpd/i, help: 'Videoyu başlatın ve Prime Video altyazı menüsünden kaynak dili seçin.' },
  { id: 'crunchyroll', label: 'Crunchyroll', hosts: ['crunchyroll.com', 'crunchyrollcdn.com'], pageHosts: ['crunchyroll.com'], help: 'Videoyu başlatın ve Crunchyroll altyazı dilini açın.' },
  { id: 'bbc-iplayer', label: 'BBC iPlayer', hosts: ['bbc.co.uk', 'bbc.com', 'bbci.co.uk'], pageHosts: ['bbc.co.uk'], help: 'BBC iPlayer oynatıcısında altyazıları etkinleştirin.' },
  { id: 'arte', label: 'ARTE', hosts: ['arte.tv', 'arte-cdn.net'], pageHosts: ['arte.tv'], help: 'ARTE oynatıcısında istediğiniz altyazı dilini seçin.' },
  { id: 'raiplay', label: 'RaiPlay', hosts: ['raiplay.it', 'rai.it', 'rai-cdn.it'], pageHosts: ['raiplay.it', 'rai.it'], help: 'RaiPlay oynatıcısında altyazıları açın.' },
  { id: 'plex', label: 'Plex', hosts: ['plex.tv', 'plex.direct'], pageHosts: ['plex.tv', 'plex.direct'], help: 'Plex oynatıcısında bir altyazı izi seçin.' },
  { id: 'stremio', label: 'Stremio Web', hosts: ['strem.io', 'stremio.com'], pageHosts: ['strem.io', 'stremio.com'], help: 'Stremio Web oynatıcısında altyazı izini açın.' },
  { id: 'coursera', label: 'Coursera', hosts: ['coursera.org'], help: 'Ders videosunu başlatın ve CC menüsünden dili seçin.' },
  { id: 'udemy', label: 'Udemy', hosts: ['udemy.com', 'udemycdn.com'], pageHosts: ['udemy.com'], help: 'Ders videosunu başlatın ve altyazı menüsünü açın.' },
  { id: 'vimeo', label: 'Vimeo', hosts: ['vimeo.com', 'vimeocdn.com'], pageHosts: ['vimeo.com'], help: 'Vimeo oynatıcısında CC menüsünden altyazıyı açın.' },
]);

function createBuiltinAdapterRegistry() {
  return new BrowserAdapterRegistry(BUILTIN_ADAPTER_DEFINITIONS);
}

module.exports = {
  BUILTIN_ADAPTER_DEFINITIONS,
  BrowserAdapterRegistry,
  createBuiltinAdapterRegistry,
  normalizeAdapter,
};
