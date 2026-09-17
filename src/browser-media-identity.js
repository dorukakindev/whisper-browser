const crypto = require('crypto');

const { SENSITIVE_PARAM_RE, TRACKING_PARAM_RE } = require('./browser-place-url');

const VOLATILE_STREAM_PARAM_RE = /^(?:expire|expires|expiration|sig|signature|token|auth|authorization|policy|key-pair-id|x-amz-.+|x-goog-.+|hdnts|hdnea|range|rn|rbuf|ms|mv|mt|ip|ipbits|start|end|segment|seq|sequence|n|frag|fragment|index|chunk|part|offset)$/i;

function cleanPart(value, max = 240) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeBrowserUrl(rawUrl, maxLength = 16384) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!/^https?:$/.test(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hostname = url.hostname.toLowerCase();
    // SPA hash-route'ları (Stremio '#/player/..', Plex/Emby '#!/..') içerik
    // kimliğinin parçasıdır — sıyrılınca aynı hosttaki tüm videolar tek
    // mediaId'ye çöküyordu. Sıradan sayfa-içi fragment'ler yine atılır.
    if (!/^#!?\//.test(url.hash)) url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_RE.test(key) || TRACKING_PARAM_RE.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href.slice(0, Math.max(1, Number(maxLength) || 16384));
  } catch (_) {
    return '';
  }
}

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

const AMAZON_HOST_SUFFIXES = Object.freeze([
    'amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br', 'amazon.co.uk',
    'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.se',
    'amazon.pl', 'amazon.com.be', 'amazon.ie', 'amazon.co.jp', 'amazon.in',
    'amazon.com.au', 'amazon.sg', 'amazon.ae', 'amazon.sa', 'amazon.com.tr',
    'amazon.eg', 'amazon.co.za',
]);

function isAmazonHost(host) {
  return AMAZON_HOST_SUFFIXES.some((suffix) => hostMatches(host, suffix));
}

function firstMatch(value, expressions) {
  for (const expression of expressions) {
    const match = String(value || '').match(expression);
    if (match && match[1]) return match[1];
  }
  return '';
}

const ROUTE_KEYWORD_RE = /^(?:video|videos|watch|episode|episodes|lecture|learn|show|series|movie|movies|play|feature|sport)$/i;

function serviceIdentity(url, hints = {}) {
  const host = url.hostname.toLowerCase();
  const hintedService = cleanPart(hints.service, 48).toLowerCase();
  const hintedId = cleanPart(hints.contentId || hints.mediaId, 180);
  if (hintedService && hintedId) return { service: hintedService, contentId: hintedId };

  if (hostMatches(host, 'youtu.be')) {
    return { service: 'youtube', contentId: cleanPart(url.pathname.split('/').filter(Boolean)[0], 64) };
  }
  if (hostMatches(host, 'youtube.com') || hostMatches(host, 'youtube-nocookie.com')) {
    const clipId = firstMatch(url.pathname, [/^\/clip\/([^/?#]+)/i]);
    const id = url.searchParams.get('v') || firstMatch(url.pathname, [
      /^\/(?:shorts|live|embed)\/([^/?#]+)/i,
    ]);
    if (clipId) return { service: 'youtube', contentId: `clip:${cleanPart(clipId, 59)}` };
    if (id) return { service: 'youtube', contentId: cleanPart(id, 64) };
  }
  if (hostMatches(host, 'netflix.com')) {
    const id = firstMatch(url.pathname, [/\/watch\/(\d+)/i, /\/title\/(\d+)/i])
      || (/^\/browse\/?$/i.test(url.pathname) ? url.searchParams.get('jbv') : '');
    if (id) return { service: 'netflix', contentId: id };
  }
  if (hostMatches(host, 'crunchyroll.com')) {
    const id = firstMatch(url.pathname, [/\/watch\/([A-Z0-9]+)/i]);
    if (id) return { service: 'crunchyroll', contentId: id.toUpperCase() };
  }
  if (isAmazonHost(host) || hostMatches(host, 'primevideo.com')) {
    const id = firstMatch(url.pathname, [
      /\/(?:gp\/video\/detail|detail)\/([A-Z0-9]+)/i,
      /\/dp\/([A-Z0-9]+)/i,
    ]) || url.searchParams.get('asin');
    if (id) return { service: 'prime-video', contentId: cleanPart(id, 64).toUpperCase() };
  }
  if (hostMatches(host, 'vimeo.com')) {
    // Vimeo'nun yaygın paylaşım adresi /<sayısal-id> biçimindedir; genel
    // /video/<id> deseni bunu yakalamadığında aynı video ayrı kayıtlara bölünür.
    const id = firstMatch(url.pathname, [/^\/(\d{6,})(?:\/|$)/, /\/video\/(\d{6,})(?:\/|$)/i]);
    if (id) return { service: 'vimeo', contentId: id };
  }

  const knownHosts = [
    ['disneyplus.com', 'disney'],
    ['max.com', 'max'],
    ['hbomax.com', 'max'],
    ['discoveryplus.com', 'discovery'],
    ['hulu.com', 'hulu'],
    ['arte.tv', 'arte'],
    ['bbc.co.uk', 'bbc-iplayer'],
    ['rai.it', 'raiplay'],
    ['raiplay.it', 'raiplay'],
    ['vimeo.com', 'vimeo'],
    ['udemy.com', 'udemy'],
    ['coursera.org', 'coursera'],
  ];
  const known = knownHosts.find(([suffix]) => hostMatches(host, suffix));
  if (known) {
    // Genel desende ilk anahtar kelime sonrasındaki parça alınır — bu
    // `/learn/lecture/123`'te "lecture", `/video/watch/x`'te "watch",
    // `/video/2024/..`'de "2024" gibi rota parçasını kimlik sanıp aynı
    // servisteki tüm videoları tek kayda çökertir. Bunun yerine SONDAN
    // bir önceki değil, EN SON rota anahtar kelimesinden sonraki kuyruk
    // kimlik yapılır: dizi/bölüm slug'ları kuyrukta kalır.
    const segments = url.pathname.split('/').filter(Boolean);
    let keywordIdx = -1;
    for (let i = 0; i + 1 < segments.length; i++) {
      if (ROUTE_KEYWORD_RE.test(segments[i])) keywordIdx = i;
    }
    let id = hintedId;
    if (!id && keywordIdx >= 0) id = segments.slice(keywordIdx + 1).join('/');
    if (!id) id = firstMatch(url.pathname, [/\/([a-f0-9-]{16,})$/i]);
    if (id) return { service: known[1], contentId: cleanPart(id, 180) };
    return { service: known[1], contentId: '' };
  }
  return { service: hintedService || 'web', contentId: hintedId };
}

function stableUrlHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 24);
}

function normalizeStreamIdentityUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!/^https?:$/.test(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_RE.test(key) || TRACKING_PARAM_RE.test(key)
          || VOLATILE_STREAM_PARAM_RE.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch (_) {
    return '';
  }
}

function deriveStreamMediaIdentity(baseMediaIdentity, streamUrl, hints = {}) {
  const base = cleanPart(baseMediaIdentity, 512);
  const stream = normalizeStreamIdentityUrl(streamUrl);
  const contentHint = cleanPart(hints.contentId || hints.streamId, 240);
  if (!stream && !contentHint) return base;
  const material = JSON.stringify([base, stream, contentHint]);
  return `${base || 'browser:web'}:stream:${stableUrlHash(material)}`;
}

function canonicalMediaIdentity(rawUrl, hints = {}) {
  // Depolanan URL'yi sınırlı tut, fakat kimliği tam normalize edilmiş URL'den
  // üret. Aksi halde aynı 16 KiB öneke sahip iki ayrı adres aynı içeriğe
  // birleşir ve izleme/çeviri kayıtlarını paylaşır.
  const identityUrl = normalizeBrowserUrl(rawUrl, Number.MAX_SAFE_INTEGER);
  if (!identityUrl) return { key: '', service: '', contentId: '', canonicalUrl: '' };
  const canonicalUrl = identityUrl.slice(0, 16384);
  const url = new URL(identityUrl);
  const identity = serviceIdentity(url, hints);
  const contentId = cleanPart(identity.contentId, 180);
  const service = cleanPart(identity.service || 'web', 48).toLowerCase();
  const key = contentId ? `${service}:${contentId}` : `${service}:url:${stableUrlHash(identityUrl)}`;
  return { key, service, contentId, canonicalUrl };
}

module.exports = {
  AMAZON_HOST_SUFFIXES,
  SENSITIVE_PARAM_RE,
  TRACKING_PARAM_RE,
  canonicalMediaIdentity,
  deriveStreamMediaIdentity,
  normalizeBrowserUrl,
  normalizeStreamIdentityUrl,
  isAmazonHost,
  serviceIdentity,
  stableUrlHash,
};
