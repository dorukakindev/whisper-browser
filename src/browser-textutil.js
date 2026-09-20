'use strict';

const CP1254_FIXUP = { 'Ð': 'Ğ', 'Ý': 'İ', 'Þ': 'Ş', 'ð': 'ğ', 'ý': 'ı', 'þ': 'ş' };
// backend/transcribe.py _MOJIBAKE_MARKERS ile birebir aynı liste — iki taraf
// aynı dosyada aynı onarım kararını versin (B83-37).
const MOJIBAKE_MARKERS = ['Ã§', 'Ã¼', 'Ã¶', 'Ä±', 'ÄŸ', 'Å', 'Ã‡', 'Ãœ', 'Ã–', 'Ä°', 'Ã¢'];

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

function decodeSubtitleBuffer(value) {
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
    if (cp1254LooksNative && sparseUtf8Evidence) {
      text = cp1254;
      note = 'cp1254';
    } else if (utf8SequenceCount > 0 && replacementCount <= Math.max(2, Math.floor(text.length * 0.01))) {
      text = text.replace(/\uFFFD/g, '');
      note = 'utf-8 bozuk bayt atlandı';
    } else {
      text = cp1254;
      note = 'cp1254';
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
