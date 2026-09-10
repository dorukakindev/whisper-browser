'use strict';

const CP1254_FIXUP = { 'Ð': 'Ğ', 'Ý': 'İ', 'Þ': 'Ş', 'ð': 'ğ', 'ý': 'ı', 'þ': 'ş' };
const MOJIBAKE_MARKERS = ['Ã§', 'Ã¼', 'Ã¶', 'Ä±', 'ÄŸ', 'Ã‡', 'Ãœ', 'Ã–', 'Ä°'];

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
    text = decodeWindows1254(buffer);
    note = 'cp1254';
  }

  const marks = markerCount(text);
  if (marks > 0) {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    if (markerCount(fixed) < marks) {
      text = fixed;
      note = 'çift kodlama onarıldı';
    }
  }

  const suspicious = markerCount(text, Object.keys(CP1254_FIXUP));
  const hasTurkish = /[ğışİĞŞ]/.test(text);
  const hasForeign = /[áéíóúÁÉÍÓÚæÆøåÅ]/.test(text);
  if (suspicious >= 3 && !hasTurkish && !hasForeign) {
    for (const [bad, good] of Object.entries(CP1254_FIXUP)) text = text.split(bad).join(good);
    note = 'Türkçe karakterler onarıldı';
  }
  return { text, note };
}

module.exports = { decodeSubtitleBuffer };
