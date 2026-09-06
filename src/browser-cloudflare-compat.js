function browserCloudflareChallengeProbeScript() {
  return `(() => {
    const title = String(document.title || '').trim();
    const bodyText = String(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 5000);
    const url = String(location.href || '');
    const strongMarker = !!document.querySelector([
      '#challenge-running', '#challenge-stage', '#challenge-form',
      '[data-cf-challenge]', '[data-ray][data-translate="checking_browser"]'
    ].join(','));
    const turnstile = !!document.querySelector([
      'iframe[src*="challenges.cloudflare.com"]',
      'script[src*="challenges.cloudflare.com/turnstile"]',
      'input[name="cf-turnstile-response"]'
    ].join(','));
    const challengeText = /(?:just a moment|checking (?:your )?browser|verify (?:you are|that you are) human|security verification|performing security verification|bir dakika|tarayıcınız kontrol ediliyor|insan olduğunuzu doğrulayın|güvenlik doğrulaması)/i
      .test(title + ' ' + bodyText);
    const challengeFrame = /\\/cdn-cgi\\/challenge-platform\\//i.test(url);
    return {
      active: strongMarker || challengeFrame || (turnstile && challengeText),
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

module.exports = {
  browserCloudflareChallengeProbeScript,
  cloudflareCompatibilityMessage,
};
