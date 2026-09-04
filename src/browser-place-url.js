(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserPlaceUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const sensitive = /^(token|access[_-]?token|id[_-]?token|refresh[_-]?token|oauth[_-]?token|api[_-]?key|client[_-]?secret|csrf|xsrf|jwt|sig|signature|auth|authorization|key|expires?|exp|credential|session|sid)$/i;
  const tracking = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id|ref_.*|ref|referrer|source)$/i;
  function cleanQuery(params) {
    for (const key of [...params.keys()]) if (sensitive.test(key) || tracking.test(key)) params.delete(key);
    return params;
  }
  function safePlaceUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
      cleanQuery(url.searchParams);
      const hash = url.hash.slice(1);
      url.hash = '';
      // Yalnız yönlendirme ve zaman bağlantıları kalıcıdır; OAuth fragmentleri değil.
      if (/^!?\//.test(hash)) {
        const mark = hash.indexOf('?');
        const route = mark < 0 ? hash : hash.slice(0, mark);
        const query = mark < 0 ? '' : cleanQuery(new URLSearchParams(hash.slice(mark + 1))).toString();
        url.hash = route + (query ? '?' + query : '');
      } else if (/^(?:t|start)=\d+(?:[hms\d.]*)$/i.test(hash)) url.hash = hash;
      // Kesilmiş bir adresi farklı bir kaynağa dönüştürme.
      return url.href.length <= 4000 ? url.href : '';
    } catch (_) { return ''; }
  }
  return { safePlaceUrl, SENSITIVE_PARAM_RE: sensitive, TRACKING_PARAM_RE: tracking };
});
