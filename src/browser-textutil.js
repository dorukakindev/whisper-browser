'use strict';

const CP1254_FIXUP = { 'Ð': 'Ğ', 'Ý': 'İ', 'Þ': 'Ş', 'ð': 'ğ', 'ý': 'ı', 'þ': 'ş' };
// backend/transcribe.py _MOJIBAKE_MARKERS ile birebir aynı liste — iki taraf
// aynı dosyada aynı onarım kararını versin (B83-37).
const MOJIBAKE_MARKERS = ['Ã§', 'Ã¼', 'Ã¶', 'Ä±', 'ÄŸ', 'Å', 'Ã‡', 'Ãœ', 'Ã–', 'Ä°', 'Ã¢'];

// UTF-8 olmayan sağlayıcı/arşiv altyazıları için tek+çok bayt adayları.
// Tam-ICU TextDecoder hepsini destekler; ayrı bağımlılık gerekmiyor.
// Sıralama = öncelik: çok-baytlar kendini fatal decode'la eler ve kanıtı
// güçlüdür; tek-baytlar her diziyi "çözer" o yüzden harf-bölge
// tutarlılığı + nadir-harf/gürültü cezasıyla yarışır, Latin ailesi sona
// kalır (cp1254 taban çizgisine en yakınlar).
// Belirsizlikte liste sırası kazanır: altyazı arşivlerindeki yaygınlık
// sırasına dizilmiştir (çok-bayt CJK önce, sonra Kiril/Batı Avrupa/Orta
// Avrupa tek-baytları).
const LEGACY_CANDIDATE_ENCODINGS = [
  'gb18030', 'shift_jis', 'big5', 'euc-jp', 'iso-2022-jp', 'euc-kr',
  'windows-1251', 'windows-1252', 'windows-1250', 'windows-1253',
  'windows-1256', 'windows-1255', 'windows-874', 'windows-1258',
  'koi8-r', 'iso-8859-5', 'iso-8859-7', 'windows-1257', 'ibm866',
  'x-mac-cyrillic',
];

// OpenSubtitles/Stremio 'language' alanı (ISO-639-1 veya -2/-3) → kodlama
// ipucu. İpuçları önce denenir; tutarlı çözüm bulursa doğrudan kabul edilir.
const LANGUAGE_ENCODING_HINTS = {
  tr: 'windows-1254', tur: 'windows-1254',
  ru: 'windows-1251', rus: 'windows-1251', uk: 'windows-1251', ukr: 'windows-1251',
  be: 'windows-1251', bel: 'windows-1251', bg: 'windows-1251', bul: 'windows-1251',
  mk: 'windows-1251', mkd: 'windows-1251', sr: 'windows-1251', srp: 'windows-1251',
  kk: 'windows-1251', kaz: 'windows-1251', ky: 'windows-1251', kir: 'windows-1251',
  mn: 'windows-1251', mon: 'windows-1251', tg: 'windows-1251', tgk: 'windows-1251',
  uz: 'windows-1251', uzb: 'windows-1251',
  pl: 'windows-1250', pol: 'windows-1250', cs: 'windows-1250', ces: 'windows-1250', cze: 'windows-1250',
  sk: 'windows-1250', slk: 'windows-1250', slo: 'windows-1250', hu: 'windows-1250', hun: 'windows-1250',
  hr: 'windows-1250', hrv: 'windows-1250', bs: 'windows-1250', bos: 'windows-1250',
  sl: 'windows-1250', slv: 'windows-1250', sq: 'windows-1250', alb: 'windows-1250', sqi: 'windows-1250',
  ro: 'windows-1250', ron: 'windows-1250', rum: 'windows-1250',
  el: 'windows-1253', ell: 'windows-1253', gre: 'windows-1253',
  ar: 'windows-1256', ara: 'windows-1256', fa: 'windows-1256', per: 'windows-1256', fas: 'windows-1256',
  ur: 'windows-1256', urd: 'windows-1256', he: 'windows-1255', heb: 'windows-1255', iw: 'windows-1255',
  th: 'windows-874', tha: 'windows-874', vi: 'windows-1258', vie: 'windows-1258',
  lv: 'windows-1257', lav: 'windows-1257', lt: 'windows-1257', lit: 'windows-1257', et: 'windows-1257', est: 'windows-1257',
  zh: ['gb18030', 'big5'], chi: ['gb18030', 'big5'], zho: ['gb18030', 'big5'],
  ja: ['shift_jis', 'euc-jp', 'iso-2022-jp'], jpn: ['shift_jis', 'euc-jp', 'iso-2022-jp'],
  ko: 'euc-kr', kor: 'euc-kr',
};

const LEGACY_SCRIPT_BLOCKS = [
  ['cyrillic', 0x0400, 0x04ff], ['greek', 0x0370, 0x03ff], ['hebrew', 0x0590, 0x05ff],
  ['arabic', 0x0600, 0x077f], ['thai', 0x0e00, 0x0e7f], ['kana', 0x3040, 0x30ff],
  ['hangul', 0x1100, 0x11ff], ['hangul', 0x3130, 0x318f], ['hangul', 0xac00, 0xd7af],
  ['cjk', 0x3400, 0x9fff], ['cjk', 0xf900, 0xfaff],
];

// Kiril'de standart Rusça dışı nadir harfler (Ukrayna/Sırp/Makedon envanteri).
// Yanlış tek-bayt çözümde bunlar yüksek oranda belirir (örn. Lehçe cp1250'nin
// cp1251 çözümü 'ї','њ','№' üretir).
const RARE_CYRILLIC = /[єіїїјљњћџѕўґґЀЍѝ]/;
// Tek-bayt yanlış çözüm işaretleri: № § ¤ ¦ ¨ ° ± ² ³ ´ µ ¶ · ¸ ¹ º » ¼ ½ ¾ ¿ ¡
// ve kutu-çizim bloğu. Ara sıra gerçek metinde de olur — hafif ceza.
const SOFT_SYMBOL = /[№¤§¦¨°±²³´µ¶·¸¹º»¼½¾¿¡─-╿]/;

function legacyTextProfile(text) {
  let letters = 0, noise = 0, symbols = 0, rare = 0, latinAccented = 0, asciiLetters = 0;
  const counts = Object.create(null);
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      // ASCII Latin harfler Latin metnin asıl gövdesidir — hem baskın
      // senaryo sayımına hem aksan oranı paydasına katılır. Yanlış
      // tek-bayt çözümler ASCII harf üretmez, gerçek Latin metin üretir.
      if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
        asciiLetters++; counts.latin = (counts.latin || 0) + 1; letters++;
      }
      continue;
    }
    if (cp === 0xfffd || (cp >= 0x80 && cp <= 0x9f) || (cp >= 0xe000 && cp <= 0xf8ff)
        || (cp >= 0xd800 && cp <= 0xdfff)) { noise++; continue; }
    if ((cp >= 0x2500 && cp <= 0x259f) || SOFT_SYMBOL.test(ch)) { symbols++; continue; }
    if ((cp >= 0x00c0 && cp <= 0x024f) || (cp >= 0x1e00 && cp <= 0x1eff)) {
      counts.latin = (counts.latin || 0) + 1; latinAccented++; letters++; continue;
    }
    const block = LEGACY_SCRIPT_BLOCKS.find(([, lo, hi]) => cp >= lo && cp <= hi);
    if (block) {
      counts[block[0]] = (counts[block[0]] || 0) + 1;
      if (block[0] === 'cyrillic' && RARE_CYRILLIC.test(ch)) rare++;
      letters++;
    }
    // noktalama/rakam/boşluk nötr — kanıt değil
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const dominantName = entries[0]?.[0] || '';
  const dominant = entries[0]?.[1] || 0;
  const latinTotal = asciiLetters + latinAccented;
  // Gerçek Japonca kana+kanji ile karışır; yanlış çok-bayt çözümleri tek
  // blokta kalır — kana+cjk karışımı doğruluk işareti (hangul+hanja
  // karışımı nadirdir, işaret sayılmaz).
  const mixedCjk = counts.kana > 0 && counts.cjk > 0;
  return { letters, noise, symbols, rare, latinAccented, asciiLetters,
    accentShare: latinTotal ? latinAccented / latinTotal : 0, mixedCjk,
    kana: counts.kana || 0, hangul: counts.hangul || 0,
    dominant, dominantName, coherence: letters ? dominant / letters : 0 };
}

function legacyDecodeScore(text) {
  const profile = legacyTextProfile(text);
  if (!profile.letters || profile.noise > Math.max(2, Math.floor(profile.letters / 8))) {
    return { score: -Infinity, profile };
  }
  // Tamamı aksanlı Latin üreten çözüm çoğunlukla Latin-olmayan kaynağın
  // yanlış tek-bayt eşlemesidir (Kiril cp1251 → cp1250'de 'Ďđčâĺň').
  // Gerçek Latin metin ASCII harf de üretir — aksan oranı bütün Latin
  // harfler üzerinden hesaplanır.
  const accentOverload = profile.dominantName === 'latin' && profile.latinAccented >= 4
    && profile.accentShare > 0.7 ? 60 : 0;
  const coherenceBonus = profile.coherence >= 0.8 ? 30 : profile.coherence >= 0.5 ? 12 : 0;
  // Kana yalnız Japonca kodlamalardan çıkar — yanlış adaylar kana
  // üretemez. Hangul da dil işaretidir ama gb18030 baytlarının euc-kr
  // çözümü sahte hangul üretebilir — bonusu kana'dan zayıf tutulur.
  const scriptBonus = (profile.kana > 0 ? 45 : 0) + (profile.hangul >= 3 ? 10 : 0)
    + (profile.mixedCjk ? 20 : 0);
  return {
    score: profile.dominant * 4 + profile.letters + coherenceBonus + scriptBonus
      - profile.noise * 30 - profile.symbols * 6 - profile.rare * 15 - accentOverload,
    profile,
  };
}

const MULTIBYTE_ENCODINGS = new Set(['gb18030', 'big5', 'shift_jis', 'euc-jp', 'iso-2022-jp', 'euc-kr']);

// Çok-bayt kodlamalarda rastgele bayt dizisi geçerli dizi üretmesi zordur:
// fatal çözümün başarısı başlı başına güçlü kanıttır (+25 bonus).
function scoreCandidate(encoding, buffer) {
  const multibyte = MULTIBYTE_ENCODINGS.has(encoding);
  let text;
  try {
    text = new TextDecoder(encoding, { fatal: multibyte }).decode(buffer).replace(/^\uFEFF/, '');
  } catch { return null; }
  const { score, profile } = legacyDecodeScore(text);
  return { text, encoding, score: score + (multibyte ? 25 : 0), profile, multibyte };
}

function hintEncodings(language) {
  if (!language) return [];
  const raw = String(language).toLowerCase().trim();
  const hints = new Set();
  for (const key of [raw, raw.split(/[-_]/)[0]]) {
    const value = LANGUAGE_ENCODING_HINTS[key];
    for (const enc of Array.isArray(value) ? value : value ? [value] : []) hints.add(enc);
  }
  return [...hints];
}

// UTF-8 ve cp1254 kanıtı tutmayan tamponda en iyi eski kodlamayı seçer;
// cp1254 tabanını belirgin aşan aday yoksa null döner (Türkçe varsayımı).
// Çok-bayt adaylar fatal decode'dan geçince tek-baytlar yarışa girmez —
// tek-bayt her bayt dizisinde tutarlı görünen sahte metin üretebilir.
function pickLegacyEncoding(buffer, language) {
  const hinted = hintEncodings(language);
  const baseline = legacyDecodeScore(decodeWindows1254(buffer));
  const order = hinted.concat(LEGACY_CANDIDATE_ENCODINGS.filter((e) => !hinted.includes(e)));

  // Dil ipucu en güçlü sinyal: tutarlı, gürültüsüz çözüm doğrudan kabul.
  for (const encoding of hinted) {
    const scored = scoreCandidate(encoding, buffer);
    if (scored && scored.profile.coherence >= 0.6 && scored.profile.letters >= 3
        && scored.profile.noise === 0) return scored;
  }

  // Kana/hangul üretimi başlı başına dil kanıtıdır (yanlış çok-bayt
  // çözümü kana üretemez) — karışık senaryolu Japonca/Korece metnin
  // coherence'ı doğal olarak düşük çıkar, kapı buna izin vermeli.
  const strongMultibyte = order
    .map((encoding) => scoreCandidate(encoding, buffer))
    .filter((s) => s && s.multibyte && s.profile.letters >= 4
      && ['cjk', 'kana', 'hangul'].includes(s.profile.dominantName)
      && (s.profile.coherence >= 0.7 || s.profile.kana > 0 || s.profile.hangul >= 3));
  const pool = strongMultibyte.length ? strongMultibyte
    : order.map((encoding) => scoreCandidate(encoding, buffer)).filter((s) => s && !s.multibyte);
  // Kararlı sıralama: eşitlikte yaygınlık sırası (liste düzeni) kazanır.
  pool.sort((a, b) => b.score - a.score);
  const best = pool[0];
  if (!best || best.score < baseline.score + 12) return null;
  return best;
}

function markerCount(value, markers = MOJIBAKE_MARKERS) {
  return markers.reduce((sum, marker) => sum + String(value).split(marker).length - 1, 0);
}

function decodeWindows1254(buffer) {
  try {
    return new TextDecoder('windows-1254', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  } catch (_) {
    let text = buffer.toString('latin1');
    for (const [bad, good] of Object.entries(CP1254_FIXUP)) text = text.split(bad).join(good);
    return text;
  }
}

function countUtf8MultibyteSequences(buffer) {
  let count = 0;
  for (let index = 0; index < buffer.length;) {
    const first = buffer[index];
    let width = 0;
    if (first >= 0xc2 && first <= 0xdf) width = 2;
    else if (first >= 0xe0 && first <= 0xef) width = 3;
    else if (first >= 0xf0 && first <= 0xf4) width = 4;
    if (!width || index + width > buffer.length) { index++; continue; }
    const continuation = buffer.subarray(index + 1, index + width);
    if (![...continuation].every((byte) => byte >= 0x80 && byte <= 0xbf)
        || (width === 3 && first === 0xe0 && continuation[0] < 0xa0)
        || (width === 3 && first === 0xed && continuation[0] > 0x9f)
        || (width === 4 && first === 0xf0 && continuation[0] < 0x90)
        || (width === 4 && first === 0xf4 && continuation[0] > 0x8f)) {
      index++;
      continue;
    }
    count++;
    index += width;
  }
  return count;
}

function decodeSubtitleBuffer(value, options = {}) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), note: 'utf-16le' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const bodyLength = (buffer.length - 2) & ~1;
    const swapped = Buffer.alloc(bodyLength);
    for (let index = 2; index < 2 + bodyLength; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return { text: swapped.toString('utf16le'), note: 'utf-16be' };
  }

  let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  let note = '';
  if (text.includes('\uFFFD')) {
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    const utf8SequenceCount = countUtf8MultibyteSequences(buffer);
    const cp1254 = decodeWindows1254(buffer);
    // Az sayıda CP1254 baytı tesadüfen geçerli bir UTF-8 dizisi oluşturabilir
    // (örn. C7 85 = "Ç…" iken U+01C5 olur). Bu dar bölgede CP1254 çözümü
    // doğal Türkçe içeriyor ve bilinen UTF-8 mojibake izlerini taşımıyorsa onu
    // seç; gerçek UTF-8 Türkçe ise CP1254 adayındaki "Ã¼/Ã‡" izleri bu dalı
    // engeller.
    const cp1254LooksNative = /[ÇĞİÖŞÜçğıöşü]/u.test(cp1254) && markerCount(cp1254) === 0;
    const sparseUtf8Evidence = utf8SequenceCount <= Math.max(2, replacementCount);
    // cp1254 görünen ama başka eski kodlamanın çok daha tutarlı çözdüğü
    // dosyaları (Kiril, Yunan, CJK arşivleri — cp1254 çözümü tesadüfen
    // Türkçe işaret üretir) skor yarışmasıyla ayıkla.
    const legacy = pickLegacyEncoding(buffer, options.language);
    if (cp1254LooksNative && sparseUtf8Evidence && !legacy) {
      text = cp1254;
      note = 'cp1254';
    } else if (utf8SequenceCount > 0 && replacementCount <= Math.max(2, Math.floor(text.length * 0.01))) {
      // Kasıtlı olarak `legacy`'den önce gelir: dosya ≥%99 geçerli UTF-8 ise
      // tampondaki geçerli çok-bayt dizileri dil ipucundan daha güçlü
      // kanıttır (sağlayıcı 'ru' deyip UTF-8 gönderebilir). Gerçek bir eski
      // kodlama dosyası zaten binlerce FFFD üretip bu kapıyı geçemez.
      text = text.replace(/\uFFFD/g, '');
      note = 'utf-8 bozuk bayt atlandı';
    } else {
      // UTF-8 ve Türkçe kanıtı yok: sağlayıcı/arşiv dosyaları sıkça cp1251,
      // GBK, Big5 gibi eski kodlamalardadır — dil ipucu + senaryo
      // tutarlılığıyla en iyi adayı seç; belirgin üstünlük yoksa cp1254.
      if (legacy) {
        text = legacy.text;
        note = legacy.encoding;
      } else {
        text = cp1254;
        note = 'cp1254';
      }
    }
  }

  const marks = markerCount(text);
  if (marks > 0) {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    // Onarım gerçek aksanlı metni bozmasın: latin-1→utf-8 çevrimi geçersiz
    // bayt üretirse (örn. tek başına gerçek 'Å' veya latin-1'de olmayan
    // harfler) sonuç U+FFFD içerir — böyle bir "onarım" veri kaybıdır.
    if (!fixed.includes('\uFFFD') && markerCount(fixed) < marks) {
      text = fixed;
      note = 'çift kodlama onarıldı';
    }
  }

  const suspicious = markerCount(text, Object.keys(CP1254_FIXUP));
  const hasTurkish = /[ğışİĞŞ]/.test(text);
  // İzlandaca'da þ/ð/ý GERÇEK harf — onları foreign setine koymak onarımı
  // tamamen kapatır (onlar aynı zamanda mojibake işaretidir). Ayırt edici:
  // Türkçede olmayan aksanlı ünlüler + tipik İzlandaca işlev sözcükleri.
  const icelandicWords = /\b(?:það|og|að|ekki|með|ég|við|þú|hann|hún|orð)\b/;
  const hasForeign = /[áéíóúÁÉÍÓÚæÆøåÅ]/.test(text) || icelandicWords.test(text);
  if (suspicious >= 3 && !hasTurkish && !hasForeign) {
    for (const [bad, good] of Object.entries(CP1254_FIXUP)) text = text.split(bad).join(good);
    note = 'Türkçe karakterler onarıldı';
  }
  return { text, note };
}

module.exports = { decodeSubtitleBuffer };
