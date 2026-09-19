(function (root, factory) {
  const shared = (typeof module === 'object' && module.exports)
    ? require('./browser-sensitive-keys')
    : root.BrowserSensitiveKeys;
  const api = factory(shared || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserPlaceUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shared) {
  const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Ortak sözlük tek kaynaktır; 'key' eski davranışı korur (CDN imzalı adresler).
  const sensitive = shared.SENSITIVE_KEY_NAMES
    ? new RegExp(`^(?:${shared.SENSITIVE_KEY_NAMES.map(escapeRe).join('|')}|key)$`, 'i')
    : /^(token|access[_-]?token|id[_-]?token|refresh[_-]?token|oauth[_-]?token|api[_-]?key|client[_-]?secret|csrf|xsrf|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;
  const hasSensitivePrefix = typeof shared.startsWithSensitivePrefix === 'function'
    ? shared.startsWithSensitivePrefix
    : (key) => /^(?:x-amz-|x-goog-|x-api-|aws-|google-)/i.test(key);
  const tracking = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id|ref_.*|ref|referrer|source)$/i;
  // Pathname matris parametreleri (`/yol;jsessionid=ABC/sonraki`) sorgu gibi
  // taranır; hassas olanı düşürür, diğerlerini korur.
  function cleanPathParams(pathname) {
    if (!pathname || pathname.indexOf(';') < 0) return pathname;
    return pathname.split('/').map((segment) => {
      if (segment.indexOf(';') < 0) return segment;
      const parts = segment.split(';');
      const kept = [parts[0]];
      for (const param of parts.slice(1)) {
        const name = param.split('=')[0];
        if (sensitive.test(name) || hasSensitivePrefix(name) || tracking.test(name)) continue;
        kept.push(param);
      }
      return kept.join(';');
    }).join('/');
  }
  function cleanQuery(params) {
    for (const key of [...params.keys()]) {
      if (sensitive.test(key) || hasSensitivePrefix(key) || tracking.test(key)) params.delete(key);
    }
    return params;
  }
  function safePlaceUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.username = '';
      url.password = '';
      cleanQuery(url.searchParams);
      url.pathname = cleanPathParams(url.pathname);
      const hash = url.hash.slice(1);
      url.hash = '';
      // Yalnız yönlendirme ve zaman bağlantıları kalıcıdır; OAuth fragmentleri değil.
      if (/^!?\//.test(hash)) {
        const mark = hash.indexOf('?');
        const route = mark < 0 ? hash : hash.slice(0, mark);
        const query = mark < 0 ? '' : cleanQuery(new URLSearchParams(hash.slice(mark + 1))).toString();
        url.hash = route + (query ? '?' + query : '');
      } else if (/^(?:t|start)=\d+(?:[hms\d.]*)$/i.test(hash)) url.hash = hash;
      // Kesilmiş bir adresi farklı bir kaynağa dönüştürme. Sınır gezinme
      // politikasınınkiyle (MAX_POLICY_URL_LENGTH) aynı.
      return url.href.length <= 8192 ? url.href : '';
    } catch (_) { return ''; }
  }
  // Kapalı sekme geçmişi gibi adresin bütününü korumak isteyen yüzeyler için:
  // yalnız hassas parametreleri siler; route çapası ve güvenli sorgu korunur.
  // OAuth implicit akışı token'ı query yerine fragment'a koyar — ikisi de temizlenir.
  function redactUrlSensitiveParams(raw) {
    try {
      const source = String(raw || '');
      const url = new URL(source);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      let changed = false;
      if (url.username || url.password) { url.username = ''; url.password = ''; changed = true; }
      const cleanedPath = cleanPathParams(url.pathname);
      if (cleanedPath !== url.pathname) { url.pathname = cleanedPath; changed = true; }
      for (const key of [...url.searchParams.keys()]) {
        if (sensitive.test(key) || hasSensitivePrefix(key)) { url.searchParams.delete(key); changed = true; }
      }
      const hash = url.hash.slice(1);
      const mark = hash.indexOf('?');
      const paramPart = mark >= 0 ? hash.slice(mark + 1)
        : (/^[^/].*=.*/.test(hash) ? hash : '');
      if (paramPart) {
        const params = new URLSearchParams(paramPart);
        let hashChanged = false;
        for (const key of [...params.keys()]) {
          if (sensitive.test(key) || hasSensitivePrefix(key)) { params.delete(key); hashChanged = true; }
        }
        // Yalnız gerçekten silme olduysa hash yeniden yazılır; aksi halde
        // güvenli parametrelerin kodlaması (örn. %20 → +) bozulmaz.
        if (hashChanged) {
          changed = true;
          const cleaned = params.toString();
          url.hash = mark >= 0
            ? hash.slice(0, mark) + (cleaned ? '?' + cleaned : '')
            : cleaned;
        }
      }
      // Redaksiyon yapılmadıysa ham adres aynen döner; URL.href'in eklediği
      // normalizasyon (sondaki / gibi) sekme geri yüklemesini değiştirmez.
      const result = changed ? url.href : source;
      return result.length <= 8192 ? result : '';
    } catch (_) { return ''; }
  }
  return { safePlaceUrl, redactUrlSensitiveParams, SENSITIVE_PARAM_RE: sensitive, TRACKING_PARAM_RE: tracking };
});
