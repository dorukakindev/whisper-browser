const { parseSubtitlePayload } = require('./browser-subtitles');

function expectedFormat(filePath = '') {
  const match = String(filePath).toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match ? match[1] : 'srt';
  if (extension === 'vtt') return 'vtt';
  if (extension === 'ass' || extension === 'ssa') return 'ass';
  return 'srt';
}

function normalizeCueText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function validateSubtitleExport(expectedText, actualBuffer, filePath) {
  if (!Buffer.isBuffer(actualBuffer)) throw new TypeError('Dışa aktarılan altyazı okunamadı.');
  const decoded = actualBuffer.toString('utf8');
  if (decoded.includes('\uFFFD')) throw new Error('Dışa aktarılan altyazı geçerli UTF-8 değil.');
  const format = expectedFormat(filePath);
  const needsBom = format === 'srt' || format === 'ass';
  if (needsBom && !decoded.startsWith('\uFEFF')) throw new Error('SRT/ASS çıktısında UTF-8 BOM eksik.');
  if (!needsBom && decoded.startsWith('\uFEFF')) throw new Error('WebVTT çıktısında beklenmeyen BOM var.');
  const expected = parseSubtitlePayload(String(expectedText || ''), '', `file.${format}`);
  const actual = parseSubtitlePayload(decoded.replace(/^\uFEFF/, ''), '', `file.${format}`);
  if (expected.format !== format || !expected.cues.length) {
    throw new Error(`İçerik ${format.toUpperCase()} biçimiyle uyuşmuyor.`);
  }
  if (actual.format !== format) throw new Error(`Kaydedilen dosya ${format.toUpperCase()} olarak yeniden okunamadı.`);
  if (actual.cues.length !== expected.cues.length) {
    throw new Error(`Cue sayısı doğrulanamadı: ${expected.cues.length} bekleniyordu, ${actual.cues.length} okundu.`);
  }
  for (let index = 0; index < expected.cues.length; index++) {
    const before = expected.cues[index];
    const after = actual.cues[index];
    if (Math.abs(Number(before.start) - Number(after.start)) > .002
        || Math.abs(Number(before.end) - Number(after.end)) > .002) {
      throw new Error(`${index + 1}. cue zaman kodu kaydetme sırasında değişti.`);
    }
    if (normalizeCueText(before.text) !== normalizeCueText(after.text)) {
      throw new Error(`${index + 1}. cue metni kaydetme sırasında değişti.`);
    }
  }
  return { ok: true, format, cueCount: actual.cues.length, bom: needsBom };
}

module.exports = { expectedFormat, validateSubtitleExport };
