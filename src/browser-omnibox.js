(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrowserOmnibox = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Omnibox "bang" kısayolları: "!kod sorgu" yazınca arama sağlayıcısına
  // düşmeden doğrudan hedef sitenin aramasına gider. Bilinmeyen kodlar ve
  // sorgusuz kullanım zararsız geri dönüş üretir (site ana sayfası).
  const enc = encodeURIComponent;
  const BANGS = [
    { trigger: 'yt', label: 'YouTube', base: 'https://www.youtube.com', url: (q) => `https://www.youtube.com/results?search_query=${enc(q)}` },
    { trigger: 'g', label: 'Google', base: 'https://www.google.com', url: (q) => `https://www.google.com/search?q=${enc(q)}` },
    { trigger: 'ddg', label: 'DuckDuckGo', base: 'https://duckduckgo.com', url: (q) => `https://duckduckgo.com/?q=${enc(q)}` },
    { trigger: 'w', label: 'Wikipedia', base: 'https://en.wikipedia.org', url: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${enc(q)}` },
    { trigger: 'wiki', label: 'Wikipedia', base: 'https://en.wikipedia.org', url: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${enc(q)}` },
    { trigger: 'wikitr', label: 'Vikipedi', base: 'https://tr.wikipedia.org', url: (q) => `https://tr.wikipedia.org/wiki/Special:Search?search=${enc(q)}` },
    { trigger: 'gh', label: 'GitHub', base: 'https://github.com', url: (q) => `https://github.com/search?q=${enc(q)}` },
    { trigger: 'so', label: 'Stack Overflow', base: 'https://stackoverflow.com', url: (q) => `https://stackoverflow.com/search?q=${enc(q)}` },
    { trigger: 'mdn', label: 'MDN', base: 'https://developer.mozilla.org', url: (q) => `https://developer.mozilla.org/en-US/search?q=${enc(q)}` },
    { trigger: 'npm', label: 'npm', base: 'https://www.npmjs.com', url: (q) => `https://www.npmjs.com/search?q=${enc(q)}` },
    { trigger: 'imdb', label: 'IMDb', base: 'https://www.imdb.com', url: (q) => `https://www.imdb.com/find/?q=${enc(q)}` },
    { trigger: 'maps', label: 'Haritalar', base: 'https://www.google.com/maps', url: (q) => `https://www.google.com/maps/search/${enc(q)}` },
    { trigger: 'gt', label: 'Google Çeviri', base: 'https://translate.google.com', url: (q) => `https://translate.google.com/?sl=auto&tl=tr&text=${enc(q)}` },
  ];

  // Girdi "!kod ..." biçimindeyse hedef URL'yi döndürür; aksi halde null.
  // "!" tek başına veya bilinmeyen kod arama olarak kalır.
  function resolveBang(input) {
    const match = /^!([a-z0-9]+)(?:\s+(.*))?$/i.exec(String(input || '').trim());
    if (!match) return null;
    const trigger = match[1].toLowerCase();
    const entry = BANGS.find((bang) => bang.trigger === trigger);
    if (!entry) return null;
    const query = String(match[2] || '').trim();
    return { trigger, label: entry.label, query, url: query ? entry.url(query) : entry.base };
  }

  // Güvenli aritmetik hesaplayıcı — eval kullanmaz; yalnız sayı, + - * / % ^,
  // parantez ve tekli eksi desteklenir. Girdi en az bir işleç içermelidir ki
  // düz metin/sayı aramaları hesap satırı göstermesin.
  function evaluateArithmetic(input) {
    const text = String(input || '').trim();
    if (!text || text.length > 200 || !/[-+*/%^()]/.test(text)) return null;
    if (!/^[\d\s.,+\-*/%^()]+$/.test(text)) return null;
    const tokens = tokenizeArithmetic(text);
    if (!tokens) return null;
    const rpn = toRpn(tokens);
    if (!rpn) return null;
    const value = evalRpn(rpn);
    if (value === null || !Number.isFinite(value)) return null;
    return value;
  }

  function tokenizeArithmetic(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (/[\d.,]/.test(ch)) {
        let j = i;
        while (j < text.length && /[\d.,]/.test(text[j])) j += 1;
        const raw = text.slice(i, j);
        // En fazla bir ondalık ayracı (nokta veya Türkçe virgül) kabul edilir.
        if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return null;
        const number = Number(raw.replace(',', '.'));
        tokens.push({ type: 'num', value: number });
        i = j;
        continue;
      }
      if ('+-*/%^'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
      if (ch === '(' || ch === ')') { tokens.push({ type: ch }); i += 1; continue; }
      return null;
    }
    return tokens.length ? tokens : null;
  }

  // Tekli eksi, üs alma işleminden DÜŞÜK önceliklidir (matematik kuralı ve
  // hesap makineleriyle aynı): -2^2 = -(2^2) = -4. Çarpma/bölmeden yüksek
  // olduğu için -3*2 = (-3)*2 davranışı değişmez. BUG-117-03.
  const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, 'u-': 2.5, '^': 3 };
  const RIGHT_ASSOC = { '^': true, 'u-': true };

  function toRpn(tokens) {
    const out = [];
    const stack = [];
    let prev = null;
    for (const token of tokens) {
      if (token.type === 'num') out.push(token);
      else if (token.type === 'op') {
        // İşleç başta, parantez sonrası veya başka işleçten sonra tekli eksi.
        const unary = token.value === '-' && (!prev || prev === 'op' || prev === '(');
        const op = unary ? 'u-' : token.value;
        // Önek işleci sol işlenen almaz; yığından hiçbir şey çıkarmamalıdır
        // (aksi halde 2^-2 gibi girdilerde ^ erken boşaltılır).
        while (!unary && stack.length) {
          const top = stack[stack.length - 1];
          if (top.type !== 'op') break;
          const topOp = top.value;
          if (PRECEDENCE[topOp] > PRECEDENCE[op] || (PRECEDENCE[topOp] === PRECEDENCE[op] && !RIGHT_ASSOC[op])) {
            out.push(stack.pop());
          } else break;
        }
        stack.push({ type: 'op', value: op });
        prev = 'op';
        continue;
      } else if (token.type === '(') stack.push(token);
      else if (token.type === ')') {
        let found = false;
        while (stack.length) {
          const top = stack.pop();
          if (top.type === '(') { found = true; break; }
          out.push(top);
        }
        if (!found) return null;
      }
      prev = token.type === 'op' ? 'op' : token.type;
    }
    while (stack.length) {
      const top = stack.pop();
      if (top.type !== 'op') return null;
      out.push(top);
    }
    return out.length ? out : null;
  }

  function evalRpn(rpn) {
    const stack = [];
    for (const token of rpn) {
      if (token.type === 'num') { stack.push(token.value); continue; }
      if (token.value === 'u-') {
        if (!stack.length) return null;
        stack.push(-stack.pop());
        continue;
      }
      if (stack.length < 2) return null;
      const b = stack.pop(); const a = stack.pop();
      switch (token.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': if (b === 0) return null; stack.push(a / b); break;
        case '%': if (b === 0) return null; stack.push(a % b); break;
        case '^': stack.push(a ** b); break;
        default: return null;
      }
    }
    return stack.length === 1 ? stack[0] : null;
  }

  // Sonucu okunabilir biçimde gösterir (taşan ondalığı kırpar).
  function formatCalcResult(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.abs(value) >= 1e15 ? value.toExponential(6) : Number(value.toPrecision(12));
    return String(rounded);
  }

  // "[başlık](url)" biçiminde Markdown bağlantısı üretir.
  function markdownLink(title, url) {
    const target = String(url || '').trim();
    if (!target) return '';
    // encodeURIComponent "(" ve ")" karakterlerini KODLAMAZ; açık eşleme şart,
    // yoksa "https://x/a)b" bağlantıyı erken kapatıyordu.
    const MD_URL_ESCAPES = { '(': '%28', ')': '%29', '\\': '%5C' };
    const safeUrl = target.replace(/[()\s\\]/g, (ch) => MD_URL_ESCAPES[ch] || enc(ch));
    const text = String(title || '').trim() || target;
    const safeTitle = text.replace(/([\\[\]])/g, '\\$1').replace(/\s+/g, ' ');
    return `[${safeTitle}](${safeUrl})`;
  }

  // Arama eşleştirmesi için dil bağımsız katlama. toLocaleLowerCase('tr') ASCII
  // "I"yı "ı" yapıyor, kullanıcının yazdığı "i" İngilizce "Interstellar"ı
  // bulamıyordu; 'en' yerelinde de "İstanbul" "istanbul" ile eşleşmiyordu.
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

  // Varsayılan arama sağlayıcısı (adres çubuğu, sağ tık "ara"). Eskiden her
  // yerde Google sabitti. Değer ayarlardaki `browserSearchEngine` enum'udur;
  // bilinmeyen değer Google'a düşer.
  const SEARCH_ENGINES = Object.freeze({
    google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${enc(q)}` },
    duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${enc(q)}` },
    bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${enc(q)}` },
    brave: { label: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${enc(q)}` },
    startpage: { label: 'Startpage', url: (q) => `https://www.startpage.com/do/search?q=${enc(q)}` },
  });

  function normalizeSearchEngine(value) {
    return Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, value) ? value : 'google';
  }

  function searchUrl(engine, query) {
    return SEARCH_ENGINES[normalizeSearchEngine(engine)].url(String(query == null ? '' : query));
  }

  function searchEngineLabel(engine) {
    return SEARCH_ENGINES[normalizeSearchEngine(engine)].label;
  }

  return { BANGS, resolveBang, evaluateArithmetic, formatCalcResult, markdownLink, foldSearchText, foldSearchIndex, foldSearchQuery,
    SEARCH_ENGINES, normalizeSearchEngine, searchUrl, searchEngineLabel };
});
