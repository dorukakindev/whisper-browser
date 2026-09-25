const { cuesToSrt, cuesToVtt, normalizeCues, parseSubtitlePayload } = require('./browser-subtitles');

const OUTPUT_FORMATS = new Set(['srt', 'vtt', 'ass']);

function assTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) throw new TypeError('Altyazı zaman kodu geçersiz.');
  const centiseconds = Math.max(0, Math.round(value * 100));
  const cs = centiseconds % 100;
  const totalSeconds = Math.floor(centiseconds / 100);
  return `${Math.floor(totalSeconds / 3600)}:${String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0')}:`
    + `${String(totalSeconds % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(value) {
  return String(value || '')
    .replace(/\\(?=[Nnh])/g, '\\⁠')
    // İşaretçi, üçüncü taraf bozuk ASS içindeki sıradan \\{ dizilerinden
    // ayırarak kendi çıktımızı birebir geri okuyabilmemizi sağlar.
    .replace(/\{/g, '\\{⁠').replace(/\}/g, '\\}⁠')
    .replace(/\r?\n/g, '\\N');
}

function cuesToAss(cues) {
  const list = normalizeCues(cues);
  const header = '[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1920\r\nPlayResY: 1080\r\nWrapStyle: 0\r\nScaledBorderAndShadow: yes\r\n\r\n'
    + '[V4+ Styles]\r\n'
    + 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\n'
    + 'Style: Default,Segoe UI,54,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,70,70,60,1\r\n\r\n'
    + '[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n';
  return header + list.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${escapeAssText(cue.text)}`)
    .join('\r\n') + (list.length ? '\r\n' : '');
}

function validateBrowserSubtitleDocument(text, format, expectedCues) {
  const expected = normalizeCues(expectedCues).slice(0, 20000);
  const parsed = parseSubtitlePayload(String(text || ''), '', `subtitle.${format}`).cues;
  // Boşa-boş eşleşme başarı sayılmaz — kayıp ölçüm için anlamlı karşılaştırma
  // yoktur; sessiz "her şey yolunda" dönüşü kaybolan cue'ları gizlerdi.
  if (!expected.length) {
    return { ok: false, error: 'Doğrulanacak altyazı içeriği yok.', cues: parsed };
  }
  if (parsed.length !== expected.length) {
    return { ok: false, error: `Altyazı blok sayısı uyuşmuyor (${parsed.length}/${expected.length}).`, cues: parsed };
  }
  const tolerance = format === 'ass' ? 0.011 : 0.0015;
  const timingsMatch = parsed.every((cue, index) => Math.abs(cue.start - expected[index].start) <= tolerance
    && Math.abs(cue.end - expected[index].end) <= tolerance);
  if (!timingsMatch) return { ok: false, error: 'Altyazı zaman kodları doğrulanamadı.', cues: parsed };
  const normalizeText = (value) => {
    let normalized = String(value == null ? '' : value)
      .replace(/\\N/g, '\n').replace(/\r\n?/g, '\n');
    if (format === 'ass') normalized = normalized.replace(/｛/g, '{').replace(/｝/g, '}');
    return normalized.normalize('NFC');
  };
  const textMatches = parsed.every((cue, index) => normalizeText(cue.text) === normalizeText(expected[index].text));
  if (!textMatches) return { ok: false, error: 'Altyazı metni veya Türkçe karakterler doğrulanamadı.', cues: parsed };
  return { ok: true, cues: parsed };
}

function buildBrowserSubtitleDocument(cues, requestedFormat = 'srt') {
  const format = OUTPUT_FORMATS.has(String(requestedFormat).toLowerCase())
    ? String(requestedFormat).toLowerCase() : 'srt';
  const normalized = normalizeCues(cues).slice(0, 20000);
  if (!normalized.length) throw new Error('Dışa aktarılacak altyazı yok.');
  const text = format === 'vtt' ? cuesToVtt(normalized)
    : format === 'ass' ? cuesToAss(normalized) : cuesToSrt(normalized);
  const validation = validateBrowserSubtitleDocument(text, format, normalized);
  if (!validation.ok) throw new Error(validation.error);
  return { format, extension: `.${format}`, text, cues: normalized };
}

module.exports = {
  OUTPUT_FORMATS,
  assTime,
  buildBrowserSubtitleDocument,
  cuesToAss,
  validateBrowserSubtitleDocument,
};
