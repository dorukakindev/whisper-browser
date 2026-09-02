const crypto = require('crypto');

const SENSITIVE_PARAM_RE = /^(?:token|access[_-]?token|id[_-]?token|refresh[_-]?token|oauth[_-]?token|api[_-]?key|client[_-]?secret|csrf|xsrf|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;
const TRACKING_PARAM_RE = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id|ref_|referrer|source)$/i;

function cleanPart(value, max = 240) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeBrowserUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!/^https?:$/.test(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_RE.test(key) || TRACKING_PARAM_RE.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href.slice(0, 2048);
  } catch (_) {
    return '';
  }
}

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function firstMatch(value, expressions) {
  for (const expression of expressions) {
    const match = String(value || '').match(expression);
    if (match && match[1]) return match[1];
  }
  return '';
}

function serviceIdentity(url, hints = {}) {
  const host = url.hostname.toLowerCase();
  const hintedService = cleanPart(hints.service, 48).toLowerCase();
  const hintedId = cleanPart(hints.contentId || hints.mediaId, 180);
  if (hintedService && hintedId) return { service: hintedService, contentId: hintedId };

  if (hostMatches(host, 'youtu.be')) {
    return { service: 'youtube', contentId: cleanPart(url.pathname.split('/').filter(Boolean)[0], 64) };
  }
  if (hostMatches(host, 'youtube.com')) {
    const id = url.searchParams.get('v') || firstMatch(url.pathname, [
      /^\/(?:shorts|live|embed)\/([^/?#]+)/i,
    ]);
    if (id) return { service: 'youtube', contentId: cleanPart(id, 64) };
  }
  if (hostMatches(host, 'netflix.com')) {
    const id = firstMatch(url.pathname, [/\/watch\/(\d+)/i, /\/title\/(\d+)/i]);
    if (id) return { service: 'netflix', contentId: id };
  }
  if (hostMatches(host, 'crunchyroll.com')) {
    const id = firstMatch(url.pathname, [/\/watch\/([A-Z0-9]+)/i]);
    if (id) return { service: 'crunchyroll', contentId: id.toUpperCase() };
  }
  if (hostMatches(host, 'amazon.com') || hostMatches(host, 'primevideo.com')) {
    const id = firstMatch(url.pathname, [
      /\/(?:gp\/video\/detail|detail)\/([A-Z0-9]+)/i,
      /\/dp\/([A-Z0-9]+)/i,
    ]) || url.searchParams.get('asin');
    if (id) return { service: 'prime-video', contentId: cleanPart(id, 64).toUpperCase() };
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
    const id = hintedId || firstMatch(url.pathname, [
      /\/(?:video|videos|watch|episode|episodes|lecture|learn)\/([^/?#]+)/i,
      /\/([a-f0-9-]{16,})$/i,
    ]);
    if (id) return { service: known[1], contentId: cleanPart(id, 180) };
    return { service: known[1], contentId: '' };
  }
  return { service: hintedService || 'web', contentId: hintedId };
}

function stableUrlHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 24);
}

function canonicalMediaIdentity(rawUrl, hints = {}) {
  const canonicalUrl = normalizeBrowserUrl(rawUrl);
  if (!canonicalUrl) return { key: '', service: '', contentId: '', canonicalUrl: '' };
  const url = new URL(canonicalUrl);
  const identity = serviceIdentity(url, hints);
  const contentId = cleanPart(identity.contentId, 180);
  const service = cleanPart(identity.service || 'web', 48).toLowerCase();
  const key = contentId ? `${service}:${contentId}` : `${service}:url:${stableUrlHash(canonicalUrl)}`;
  return { key, service, contentId, canonicalUrl };
}

module.exports = {
  SENSITIVE_PARAM_RE,
  TRACKING_PARAM_RE,
  canonicalMediaIdentity,
  normalizeBrowserUrl,
  serviceIdentity,
  stableUrlHash,
};
