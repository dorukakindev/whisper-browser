// Adres çubuğu, sekme sırası ve altyazı dil rozeti için DOM'suz saf mantık.
// renderer.js'ten ayrıldı: testler artık kaynak metnini dilimlemeden doğrudan
// require() ile çağırabilir. index.html'de renderer.js'ten ÖNCE yüklenir.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserAddressModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // I/İ/ı tek "i"; uzunluk korunur (vurgu konumları için).
  function foldSearchText(value) {
    return String(value == null ? '' : value).replace(/[Iİı]/g, 'i').toLowerCase();
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  // Sıklık × yakınlık puanı (Firefox "frecency" fikrinin sade hâli): çok ziyaret
  // edilen ve yakın zamanda açılan adres üstte. Ziyaret sayısı log ile sönümlenir.
  function frecencyScore(item, now = Date.now()) {
    const visits = Math.max(1, Number(item?.visits) || 1);
    const ageDays = Math.max(0, (now - (Number(item?.visitedAt) || 0)) / DAY_MS);
    const recency = ageDays < 1 ? 100 : ageDays < 4 ? 70 : ageDays < 14 ? 50 : ageDays < 31 ? 30 : ageDays < 90 ? 10 : 5;
    return recency * (1 + Math.log2(visits));
  }

  function strippedUrl(url) {
    return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  }

  function originOf(url) {
    try { return new URL(String(url || '')).origin; } catch (_) { return ''; }
  }

  // Satır içi otomatik tamamlama: "git" → "github.com". Yalnız boşluksuz ve şemasız
  // girişte, adresin (www. ve şema atılmış) başıyla eşleşen en yüksek puanlı kayıt
  // seçilir. Alan adı sınırında durur; yol yazılmışsa yolu tamamlar.
  function inlineCompletion(query, items, now = Date.now()) {
    const typed = String(query || '');
    if (typed.length < 2 || /\s/.test(typed) || /^[a-z][a-z0-9+.-]*:/i.test(typed)) return null;
    const needle = foldSearchText(typed);
    let best = null;
    for (const item of Array.isArray(items) ? items : []) {
      const bare = strippedUrl(item?.url).replace(/\/$/, '');
      if (!bare || !foldSearchText(bare).startsWith(needle)) continue;
      const slash = bare.indexOf('/');
      const host = slash < 0 ? bare : bare.slice(0, slash);
      const completion = typed.length <= host.length ? host : bare;
      if (completion.length <= typed.length) continue;
      const score = frecencyScore(item, now) + (completion === host ? 1 : 0);
      if (!best || score > best.score) {
        const url = completion === host ? `${originOf(item.url)}/` : item.url;
        best = { text: typed + completion.slice(typed.length), url, score };
      }
    }
    return best ? { text: best.text, url: best.url } : null;
  }

  // Satır sırası: yazılan metin (veya bang / otomatik tamamlama) HER ZAMAN ilk satır.
  // Kalan bölümler: hesap, açık sekmeler, yer imleri, geçmiş (frecency sırasıyla).
  function buildAddressResults(input = {}) {
    const query = String(input.query || '').trim();
    if (!query) return [];
    const omnibox = input.omnibox || {};
    const folded = foldSearchText(query);
    const now = Number(input.now) || Date.now();
    const limit = Number(input.limit) || 14;
    const faviconFor = typeof input.faviconFor === 'function' ? input.faviconFor : () => '';
    const tabLabel = typeof input.tabLabel === 'function' ? input.tabLabel : (tab) => tab.title || tab.url || '';
    const placeTitle = typeof input.placeTitle === 'function' ? input.placeTitle : (item) => item.title || item.url || '';
    const results = [];
    const seen = new Set();
    const add = (row) => {
      const key = `${row.action}:${row.id || row.url || row.value || row.title}`;
      if (seen.has(key) || results.length >= limit) return;
      seen.add(key);
      results.push(row);
    };
    const bang = omnibox.resolveBang?.(query);
    if (bang) add({ action: 'navigate', section: 'input', url: bang.url,
      title: bang.query ? `${bang.label} araması: ${bang.query}` : `${bang.label} ana sayfası`,
      detail: bang.url, kindLabel: 'Kısayol', mark: '!' });
    const completion = input.completion;
    if (completion?.url) add({ action: 'url', section: 'input', url: completion.url, title: completion.text,
      detail: completion.url, kindLabel: 'Otomatik tamamlama', mark: '↗', icon: faviconFor(completion.url) });
    add({ action: 'navigate', section: 'input', value: query, title: `“${query.slice(0, 120)}” için git veya ara`,
      detail: 'Adresse doğrudan açılır; değilse web araması yapılır.', kindLabel: 'Web', mark: 'A' });
    const calc = omnibox.evaluateArithmetic?.(query);
    if (calc !== null && calc !== undefined) {
      const value = omnibox.formatCalcResult ? omnibox.formatCalcResult(calc) : String(calc);
      add({ action: 'calc', section: 'calc', value, title: `${query} = ${value}`,
        detail: 'Seçip Enter: sonucu panoya kopyala', kindLabel: 'Hesap', mark: '=' });
    }
    for (const tab of Array.isArray(input.tabs) ? input.tabs : []) {
      if (foldSearchText(`${tab.title} ${tab.url}`).includes(folded)) add({ action: 'tab', section: 'tabs', id: tab.id,
        title: tabLabel(tab), detail: tab.url, kindLabel: 'Açık sekme', mark: 'S', icon: tab.favicon || faviconFor(tab.url) });
    }
    const places = input.places || {};
    const match = (item) => foldSearchText(`${item.title} ${item.url}`).includes(folded);
    for (const item of (places.bookmarks || []).filter(match)) add({ action: 'url', section: 'bookmarks', url: item.url,
      title: placeTitle(item), detail: item.url, kindLabel: 'Yer imi', mark: 'Y', icon: faviconFor(item.url) });
    const history = (places.history || []).filter(match)
      .map((item, index) => ({ item, index, score: frecencyScore(item, now) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    for (const { item } of history) add({ action: 'url', section: 'history', url: item.url,
      title: placeTitle(item), detail: item.url, kindLabel: 'Geçmiş', mark: 'G', icon: faviconFor(item.url) });
    return results;
  }

  const SECTION_LABELS = { calc: 'Hesap', tabs: 'Açık sekmeler', bookmarks: 'Yer imleri', history: 'Geçmiş', library: 'Kütüphane' };

  // Ctrl+Tab / Ctrl+1..9 ekranda görünen sırayı izler (gruplar ilk üyelerinin
  // konumunda toplu çizilir, daraltılmış gruptaki sekmeler atlanır).
  function visibleTabsInDisplayOrder(rows, fallback = []) {
    const tabs = (Array.isArray(rows) ? rows : []).filter((row) => row.kind === 'tab').map((row) => row.tab);
    return tabs.length ? tabs : fallback;
  }

  const SUBTITLE_PATH_LANGUAGE_CODES = new Set(`
    tr en de fr es it ru ar ja ko zh pt nl el fa az pl sv no nb nn da fi cs sk hu ro
    bg hr sr sl uk he hi id ms th vi ca eu gl et lv lt is ga ka hy kk uz ur bn ta te
    tur eng ger deu fre fra spa ita rus ara jpn kor chi zho por dut nld gre ell per fas
    aze pol swe nor dan fin cze ces slo slk hun rum ron bul hrv srp slv ukr heb hin ind
    may msa tha vie cat baq eus glg est lav lit ice isl gle geo kat arm hye kaz uzb urd
  `.trim().split(/\s+/));

  // "film.tr.srt" → TR, "film.en.forced.srt" → EN; "Dune.Part.Two.srt" → ''.
  function langFromPath(path) {
    const m = String(path || '').match(/\.([a-z]{2,3})(?:[-_][a-z0-9]{2,4})?(?:\.(?:forced|sdh|cc|hi))*\.(?:srt|vtt|ass|ssa)$/i);
    return m && SUBTITLE_PATH_LANGUAGE_CODES.has(m[1].toLowerCase()) ? m[1].toUpperCase() : '';
  }

  // https bağlantısı kurulamadığında (bağlantı reddi/sıfırlama/zaman aşımı/TLS
  // protokol hatası) kullanıcıya açık onayla http denemesi önerilir. Sertifika
  // doğrulama hataları bilerek HARİÇ: orada http'ye düşmek saldırganın istediği
  // şifresiz bağlantıyı onaylatmak olur.
  const HTTP_FALLBACK_CODES = new Set([-100, -101, -102, -104, -105, -106, -107, -109, -113, -118, -130, -324]);
  function httpFallbackUrl(url, code) {
    if (!HTTP_FALLBACK_CODES.has(Number(code))) return '';
    try {
      const parsed = new URL(String(url || ''));
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
      parsed.protocol = 'http:';
      return parsed.href;
    } catch (_) { return ''; }
  }

  const RTL_LANGUAGE = /^(?:ar|fa|he|iw|ur|ps|yi|dv|ckb|sd|ug)(?:[-_]|$)/i;
  function isRtlLanguage(code) { return RTL_LANGUAGE.test(String(code || '')); }

  return {
    foldSearchText, frecencyScore, inlineCompletion, buildAddressResults, SECTION_LABELS,
    visibleTabsInDisplayOrder, langFromPath, isRtlLanguage, originOf, httpFallbackUrl,
  };
});
