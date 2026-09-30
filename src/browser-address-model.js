// Adres çubuğu, sekme sırası ve altyazı dil rozeti için DOM'suz saf mantık.
// renderer.js'ten ayrıldı: testler artık kaynak metnini dilimlemeden doğrudan
// require() ile çağırabilir. index.html'de renderer.js'ten ÖNCE yüklenir.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserAddressModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Katlamada düşürülen karakterler (birleştirme işaretleri, bidi denetimleri,
  // ZWJ, denetim karakterleri, yalın vekil yarıları) bu işaretçiyle yer tutar —
  // metin tarafında uzunluk HER ZAMAN korunur; eşleşme ofsetleri özgün metinle
  // birebir hizalı kalır (vurgu konumları için).
  const FOLD_SENTINEL = '\uFFFF';
  // NFD'de ayrışmayan Latin vuru harfleri — tek karakterle katlanır
  // (æ→a / œ→o gibi bileşikler yaklaşık eşleşir).
  const LATIN_STROKE = {
    'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'đ': 'd', 'Đ': 'd', 'ð': 'd',
    'ŧ': 't', 'Ŧ': 't', 'ħ': 'h', 'Ħ': 'h', 'ŋ': 'n', 'Ŋ': 'n',
    'ƶ': 'z', 'Ƶ': 'z', 'æ': 'a', 'Æ': 'a', 'œ': 'o', 'Œ': 'o',
    'þ': 't', 'Þ': 't', 'ĸ': 'k', 'ı': 'i', 'ſ': 's',
  };

  function foldSearchText(value) {
    return String(value == null ? '' : value)
      .replace(/[Iİı]/g, 'i')
      .replace(/[^\x20-\x7E]/g, (ch, off, str) => {
        if (/\p{Cs}/u.test(ch)) {
          // Vekil ÇİFTİ (emoji, tarihî yazı) meşru içeriktir — aranabilir
          // kalır; yalnız başı kopmuş yarılar işaretçiye düşer.
          const code = ch.charCodeAt(0);
          const prev = off > 0 ? str.charCodeAt(off - 1) : 0;
          const next = off + 1 < str.length ? str.charCodeAt(off + 1) : 0;
          const paired = (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
            || (code >= 0xdc00 && code <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff);
          return paired ? ch : FOLD_SENTINEL;
        }
        if (/\p{M}|\p{Cf}|\p{Cc}/u.test(ch)) return FOLD_SENTINEL;
        const mapped = LATIN_STROKE[ch];
        if (mapped) return mapped;
        // Yalnız "taban harf + birleştirme işaretleri" ayrışması temel harfe
        // iner (é→e, أ→ا); Korece hece/jamo ve sunum biçimleri korunur.
        const nfd = ch.normalize('NFD');
        if (nfd.length > 1 && !/^\p{M}/u.test(nfd) && /^\p{M}+$/u.test(nfd.slice(1))) {
          return nfd[0];
        }
        return ch;
      })
      .toLowerCase();
  }

  // Hangul jamo kod noktaları: L (sesbaşı), V (orta), T (son). NFC yalnız
  // L+V(+T) dizisini heceye birleştirir — tek başına duran jamo korunur.
  const isJamoL = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0xa960 && cp <= 0xa97c);
  const isJamoV = (cp) => (cp >= 0x1160 && cp <= 0x11a7) || (cp >= 0xd7b0 && cp <= 0xd7c6);
  const isJamoT = (cp) => (cp >= 0x11a8 && cp <= 0x11ff) || (cp >= 0xd7cb && cp <= 0xd7fb);

  // Eşleştirme dizini: işaretçiler düşülür, NFC'de birleşen Hangul jamo
  // dizileri tek heceye katlanır — metin ve sorgu aynı yoğun forma indiği için
  // ayrışık/bileşik yazım, görünmez karakterler ve emoji aynı eşleşmeyi verir.
  // map[i] = yoğun konum i'nin özgün metindeki [başlangıç, uzunluk] aralığı;
  // vurgu ve tamamlama ofsetleri bu haritayla özgün metne çevrilir.
  function foldSearchIndex(value) {
    const folded = foldSearchText(value);
    const dense = [];
    const map = [];
    let i = 0;
    while (i < folded.length) {
      const cp = folded.codePointAt(i);
      const w = cp > 0xffff ? 2 : 1;
      if (folded[i] === FOLD_SENTINEL) { i += w; continue; }
      if (isJamoL(cp)) {
        let j = i + w;
        let vCount = 0;
        while (j < folded.length && isJamoV(folded.codePointAt(j))) { j += 1; vCount += 1; }
        while (vCount > 0 && j < folded.length && isJamoT(folded.codePointAt(j))) { j += 1; }
        if (vCount > 0) {
          dense.push(folded.slice(i, j).normalize('NFC'));
          map.push([i, j - i]);
          i = j;
          continue;
        }
      }
      dense.push(folded.slice(i, i + w));
      map.push([i, w]);
      // dense UTF-16 birimi sayar, map öğe sayar — vekil çift (emoji) 2 birim
      // kaplar ama tek kayıt bırakırdı; ofset hizası için ikinci kayıt şart.
      if (w === 2) map.push([i, w]);
      i += w;
    }
    return { dense: dense.join(''), map };
  }

  // Sorgu tarafı katlama = yoğun form: işaretçiler silinir, jamo dizileri
  // heceye katlanır — görünmez/ayrışık yazılan sorgu da aynı forma iner.
  function foldSearchQuery(value) {
    return foldSearchIndex(value).dense;
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
    const needle = foldSearchQuery(typed);
    let best = null;
    for (const item of Array.isArray(items) ? items : []) {
      const bare = strippedUrl(item?.url).replace(/\/$/, '');
      if (!bare) continue;
      const bareIdx = foldSearchIndex(bare);
      if (!bareIdx.dense.startsWith(needle)) continue;
      const slash = bare.indexOf('/');
      const host = slash < 0 ? bare : bare.slice(0, slash);
      // Kesim adayın ÖZGÜN karakterleriyle yapılır (yoğun uzunluk değil):
      // sorgudaki görünmez/ayrışık karakterler üretilen tamamlamaya sızmaz.
      const origEnd = needle.length
        ? bareIdx.map[needle.length - 1][0] + bareIdx.map[needle.length - 1][1] : 0;
      const completion = origEnd <= host.length ? host : bare;
      if (completion.length <= origEnd) continue;
      const score = frecencyScore(item, now) + (completion === host ? 1 : 0);
      if (!best || score > best.score) {
        const url = completion === host ? `${originOf(item.url)}/` : item.url;
        best = { text: completion, prefix: completion.slice(0, origEnd), url, score };
      }
    }
    return best ? { text: best.text, prefix: best.prefix, url: best.url } : null;
  }

  // Satır sırası: yazılan metin (veya bang / otomatik tamamlama) HER ZAMAN ilk satır.
  // Kalan bölümler: hesap, açık sekmeler, yer imleri, geçmiş (frecency sırasıyla).
  function buildAddressResults(input = {}) {
    const query = String(input.query || '').trim();
    if (!query) return [];
    const omnibox = input.omnibox || {};
    const folded = foldSearchQuery(query);
    // Sorgu katlanınca boş kalıyorsa (yalnız işaretçi karakterler) saklı kayıt
    // eşleşmez — ''.includes('') gibi her şeyi döndüren yol bilinçli kapatılır.
    const now = Number(input.now) || Date.now();
    const limit = Number(input.limit) || 14;
    const faviconFor = typeof input.faviconFor === 'function' ? input.faviconFor : () => '';
    const tabLabel = typeof input.tabLabel === 'function' ? input.tabLabel : (tab) => tab.title || tab.url || '';
    const placeTitle = typeof input.placeTitle === 'function' ? input.placeTitle : (item) => item.title || item.url || '';
    const results = [];
    const seen = new Set();
    const add = (row) => {
      const key = `${row.action}:${row.id || row.url || row.value || row.title}`;
      if (seen.has(key) || results.length >= limit) return false;
      seen.add(key);
      results.push(row);
      return true;
    };
    // Aynı adresin açık sekme + geçmiş/yer imi satırlarında iki kez görünmesi
    // "Open tabs" tekrarı yaratıyordu; sekme satırı kazanır, url sahiplenilir.
    const claimedUrls = new Set();
    const urlKey = (url) => strippedUrl(url).replace(/\/+$/, '').toLowerCase();
    const bang = omnibox.resolveBang?.(query);
    if (bang) add({ action: 'navigate', section: 'input', url: bang.url,
      title: bang.query ? `${bang.label} araması: ${bang.query}` : `${bang.label} ana sayfası`,
      detail: bang.url, kindLabel: 'Kısayol', mark: '!' });
    const completion = input.completion;
    if (completion?.url) add({ action: 'url', section: 'input', url: completion.url, title: completion.text,
      detail: completion.url, kindLabel: 'Otomatik tamamlama', mark: '↗', icon: faviconFor(completion.url) });
    // İlk satırın açıklaması yazılanın adres mi arama mı olacağını söyler;
    // metin render katmanında yerelleştirilir (inputKind'e göre).
    const looksLikeAddress = /^[\w-]+(?:\.[\w-]+)+(:\d+)?([/?#].*)?$|^localhost(:\d+)?([/?#].*)?$/i.test(query)
      || /^[a-z][a-z0-9+.-]*:\/\//i.test(query);
    add({ action: 'navigate', section: 'input', value: query, title: `“${query.slice(0, 120)}” için git veya ara`,
      detail: '', inputKind: looksLikeAddress ? 'address' : 'search', kindLabel: 'Web', mark: 'A' });
    const calc = omnibox.evaluateArithmetic?.(query);
    if (calc !== null && calc !== undefined) {
      const value = omnibox.formatCalcResult ? omnibox.formatCalcResult(calc) : String(calc);
      add({ action: 'calc', section: 'calc', value, title: `${query} = ${value}`,
        detail: 'Seçip Enter: sonucu panoya kopyala', kindLabel: 'Hesap', mark: '=' });
    }
    for (const tab of Array.isArray(input.tabs) ? input.tabs : []) {
      // Aktif sekme listeden çıkarılır: ona geçiş hiçbir şey değiştirmez.
      if (input.activeTabId != null && tab.id === input.activeTabId) continue;
      if (!folded || !foldSearchIndex(`${tab.title} ${tab.url}`).dense.includes(folded)) continue;
      const key = urlKey(tab.url);
      if (key && claimedUrls.has(key)) continue;
      if (add({ action: 'tab', section: 'tabs', id: tab.id,
        title: tabLabel(tab), detail: tab.url, kindLabel: 'Açık sekme', mark: 'S', icon: tab.favicon || faviconFor(tab.url) }) && key) {
        claimedUrls.add(key);
      }
    }
    const places = input.places || {};
    const match = (item) => !!folded
      && foldSearchIndex(`${item.title} ${item.url}`).dense.includes(folded)
      && !claimedUrls.has(urlKey(item.url));
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

  // ---- Yeni sekme sayfası (NTP) ----
  // Hızlı erişim: önce yer imleri (kullanıcının seçimi), sonra geçmiş sıklık ×
  // yakınlık puanıyla. Aynı adres (şema/www/sondaki / farkı) tek kutucuk; yalnız
  // http(s); kullanıcının NTP'den gizlediği adresler çıkarılır.
  function ntpPlaceKey(url) {
    return strippedUrl(url).replace(/\/+$/, '').toLowerCase();
  }
  function ntpQuickTiles(places, { hidden = [], limit = 8, now = Date.now() } = {}) {
    const hiddenKeys = new Set((Array.isArray(hidden) ? hidden : []).map(ntpPlaceKey));
    const seen = new Set();
    const out = [];
    const take = (item, bookmark) => {
      if (out.length >= limit || !item || !/^https?:\/\//i.test(String(item.url || ''))) return;
      const key = ntpPlaceKey(item.url);
      if (!key || seen.has(key) || hiddenKeys.has(key)) return;
      seen.add(key);
      out.push({ url: item.url, title: item.title || '', bookmark, key });
    };
    for (const item of (places && Array.isArray(places.bookmarks) ? places.bookmarks : [])) take(item, true);
    const history = (places && Array.isArray(places.history) ? places.history : [])
      .map((item, index) => ({ item, index, score: frecencyScore(item, now) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    for (const { item } of history) take(item, false);
    return out;
  }

  // İzlemeye devam et: izleme kütüphanesindeki yarım kalmış web/YouTube kayıtları
  // (en son izlenen önce), ilerleme ve kalan süreyle. Baştaki birkaç saniye ve
  // bitmiş kayıtlar "devam" sayılmaz.
  function ntpContinueItems(watchItems, { limit = 6, minPosition = 30 } = {}) {
    return (Array.isArray(watchItems) ? watchItems : [])
      .filter((item) => item && (item.type === 'youtube' || item.type === 'browser') && !item.completed
        && Number(item.position) >= minPosition && item.sourceRef)
      .sort((a, b) => (Number(b.lastWatched) || 0) - (Number(a.lastWatched) || 0))
      .slice(0, limit)
      .map((item) => {
        const duration = Number(item.duration) || 0;
        const position = Number(item.position) || 0;
        return {
          key: item.key, url: item.sourceRef, title: item.title || '', type: item.type, position, duration,
          progress: duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0,
          remaining: duration > 0 ? Math.max(0, duration - position) : 0,
        };
      });
  }

  const RTL_LANGUAGE = /^(?:ar|fa|he|iw|ur|ps|yi|dv|ckb|sd|ug)(?:[-_]|$)/i;
  function isRtlLanguage(code) { return RTL_LANGUAGE.test(String(code || '')); }

  return {
    foldSearchText, foldSearchIndex, foldSearchQuery, frecencyScore, inlineCompletion, buildAddressResults, SECTION_LABELS,
    visibleTabsInDisplayOrder, langFromPath, isRtlLanguage, originOf, httpFallbackUrl,
    ntpPlaceKey, ntpQuickTiles, ntpContinueItems,
  };
});
