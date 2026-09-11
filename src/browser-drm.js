const { isAmazonHost } = require('./browser-media-identity');
const { classifyPlaybackEvidence } = require('./browser-playback-diagnostics');

function sanitizeBrowserUserAgent(value) {
  return String(value || '')
    .replace(/\sElectron\/[^\s]+/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isProtectedBrowserHost(value) {
  try {
    const raw = String(value || '').trim();
    const host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return isAmazonHost(host)
      || /(^|\.)(netflix\.com|hulu\.com|hulu\.jp|max\.com|hbomax\.com|discoveryplus\.com|disneyplus\.com|primevideo\.com)$/.test(host);
  } catch (_) {
    return false;
  }
}

function redactConsoleUrls(value) {
  return String(value || '').replace(/https?:\/\/[^\s"']+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return '[bağlantı gizlendi]';
    }
  });
}

function browserDrmFailureMessage(rawMessage) {
  const diagnostic = classifyPlaybackEvidence({ kind: 'console', message: rawMessage });
  return diagnostic && /license|protected-playback|geo-restricted/.test(diagnostic.code)
    ? diagnostic.message : '';
}

module.exports = {
  browserDrmFailureMessage,
  isProtectedBrowserHost,
  redactConsoleUrls,
  sanitizeBrowserUserAgent,
};
