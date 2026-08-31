function sanitizeBrowserUserAgent(value) {
  return String(value || '')
    .replace(/\sElectron\/[^\s]+/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  const text = redactConsoleUrls(rawMessage).replace(/\s+/g, ' ').trim().slice(0, 360);
  if (!text) return '';
  const drmSignal = /(widevine|media\s*key|key\s*system|license|\bcdm\b|encrypted\s*media|waitingforkey|2312400)/i;
  const failureSignal = /(error|fail(?:ed|ure)?|denied|reject(?:ed)?|unsupported|not\s+supported|not\s+allowed|abort(?:ed)?|2312400)/i;
  return drmSignal.test(text) && failureSignal.test(text) ? text : '';
}

module.exports = {
  browserDrmFailureMessage,
  redactConsoleUrls,
  sanitizeBrowserUserAgent,
};
