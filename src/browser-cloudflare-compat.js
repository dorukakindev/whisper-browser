function browserCloudflareChallengeProbeScript() {
  return `(() => {
    const title = String(document.title || '').trim();
    const bodyText = String(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 5000);
    const url = String(location.href || '');
    const strongMarker = !!document.querySelector([
      '#challenge-running', '#challenge-stage', '#challenge-form',
      '[data-cf-challenge]', '[data-ray][data-translate="checking_browser"]'
    ].join(','));
    const turnstileWidget = !!document.querySelector([
      'iframe[src*="challenges.cloudflare.com"]',
      'input[name="cf-turnstile-response"]'
    ].join(','));
    const turnstileScript = !!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    const turnstile = turnstileWidget || turnstileScript;
    const challengeText = /(?:just a moment|checking (?:your )?browser|verify (?:you are|that you are) human|security verification|performing security verification|bir dakika|tarayıcınız kontrol ediliyor|insan olduğunuzu doğrulayın|güvenlik doğrulaması)/i
      .test(title + ' ' + bodyText);
    const titleChallengeText = /(?:just a moment|checking (?:your )?browser|security verification|bir dakika|tarayıcınız kontrol ediliyor|güvenlik doğrulaması)/i.test(title);
    const challengeFrame = /\\/cdn-cgi\\/challenge-platform\\//i.test(url);
    return {
      active: strongMarker || challengeFrame || (turnstileWidget && challengeText)
        || (turnstileScript && titleChallengeText),
      strongMarker, turnstile, challengeText,
      title: title.slice(0, 180), url: url.slice(0, 2048),
    };
  })()`;
}

function cloudflareCompatibilityMessage(active, timedOut = false) {
  if (!active) {
    return 'Cloudflare doğrulaması tamamlandı; altyazı yakalama yeniden açıldı.';
  }
  if (timedOut) {
    return 'Cloudflare doğrulaması hâlâ açık. Doğrulamayı tamamlayıp sayfayı yenileyin; altyazı yakalama o sırada kapalı kalır.';
  }
  return 'Cloudflare güvenlik doğrulaması algılandı. Sayfaya müdahale eden altyazı yakalama geçici olarak durduruldu; doğrulama bitince kendiliğinden yeniden açılacak.';
}

function cloudflareProbeState(probe) {
  if (!probe || typeof probe !== 'object' || typeof probe.active !== 'boolean') return 'unknown';
  return probe.active ? 'active' : 'clear';
}

function browserCompatibilityHost(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.hostname.toLowerCase().replace(/^\.+|\.+$/g, '').slice(0, 253);
  } catch (_) { return ''; }
}

function normalizeBrowserCompatibilityHosts(values, limit = 100) {
  const unique = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const host = String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!host || host.length > 253 || !/^[a-z0-9.-]+$/i.test(host)) continue;
    unique.add(host);
  }
  return [...unique].slice(-Math.max(1, Number(limit) || 100));
}

function browserCompatibilityEnabledForUrl(rawUrl, hosts) {
  const host = browserCompatibilityHost(rawUrl);
  return !!host && normalizeBrowserCompatibilityHosts(hosts).includes(host);
}

function withBrowserCompatibilityHost(hosts, rawUrl, enabled) {
  const host = browserCompatibilityHost(rawUrl);
  if (!host) return { ok: false, host: '', hosts: normalizeBrowserCompatibilityHosts(hosts) };
  const next = new Set(normalizeBrowserCompatibilityHosts(hosts));
  if (enabled) next.add(host); else next.delete(host);
  return { ok: true, host, hosts: normalizeBrowserCompatibilityHosts([...next]) };
}

module.exports = {
  browserCloudflareChallengeProbeScript,
  browserCompatibilityEnabledForUrl,
  browserCompatibilityHost,
  cloudflareCompatibilityMessage,
  cloudflareProbeState,
  normalizeBrowserCompatibilityHosts,
  withBrowserCompatibilityHost,
};
