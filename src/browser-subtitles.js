const crypto = require('crypto');

const SUBTITLE_URL_RE = /(?:^|[\/?&_.=-])(caption|captions|subtitle|subtitles|timedtext|texttrack|webvtt|ttml|dfxp|srt|vtt|srv3|json3|altyazi|altyazilar|sous-titres?|untertitel|subtitulos?|legendas?|sottotitoli)(?:[\/?&_.=-]|$)/i;

function decodeEntities(value) {
  const decodeCodePoint = (raw, radix = 10) => {
    const codePoint = parseInt(String(raw), radix);
    // Kötü niyetli/bozuk altyazı yanıtı String.fromCodePoint'u patlatmasın.
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
      ? String.fromCodePoint(codePoint) : '\uFFFD';
  };
  const named = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®',
    auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü',
    ccedil: 'ç', Ccedil: 'Ç', szlig: 'ß', eacute: 'é', Eacute: 'É',
    scedil: 'ş', Scedil: 'Ş', gbreve: 'ğ', Gbreve: 'Ğ',
    idot: 'ı', Idot: 'İ', inodot: 'ı', Inodot: 'İ', imath: 'ı', Imath: 'I',
  };
  // Üretilen & işaretini aynı geçişte yeniden çözme: &amp;#39; literal kalmalı.
  return String(value || '').replace(/&([a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) return decodeCodePoint(key.slice(2), 16);
    if (key.startsWith('#')) return decodeCodePoint(key.slice(1));
    return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity]
      : (Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match);
  });
}

function cleanCueText(value) {
  const decoded = decodeEntities(String(value || '')
    // ASS/SSA biçimlendirme etiketleri görsel değil, altyazı metadatasıdır.
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<br\s*\/?>/gi, '\n'));
  // Yalnız bilinen altyazı biçimlendirme etiketlerini kaldır. Genel <...>
  // deseni "5 < 10 ve 20 > 15" gibi gerçek diyalog parçalarını siliyordu.
  return decoded
    .replace(/<\/?(?:b|i|u|strong|em|ruby|rt|font|span|small|big|sub|sup)(?:\s+[^<>]*?)?\s*\/?>/gi, '')
    .replace(/<\/?(?:c(?:\.[\w-]+)*|v(?:\s+[^<>]*)?|lang(?:\s+[^<>]*)?)\s*>/gi, '')
    .replace(/<\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const unit = raw.match(/^(-?\d+(?:\.\d+)?)(ms|s|m|h)$/i);
  if (unit) {
    const n = Number(unit[1]);
    const mult = unit[2].toLowerCase() === 'ms' ? 0.001
      : unit[2].toLowerCase() === 'm' ? 60
      : unit[2].toLowerCase() === 'h' ? 3600 : 1;
    return Number.isFinite(n) ? n * mult : null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((x) => !/^\d+(?:\.\d+)?$/.test(x))) return null;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  const result = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(result) ? result : null;
}

function normalizeCues(cues) {
  const clean = (cues || []).map((cue) => ({
    ...cue,
    start: Number(cue.start),
    end: Number(cue.end),
    text: cleanCueText(cue.text),
  })).filter((cue) => Number.isFinite(cue.start) && cue.start >= 0 && cue.text)
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < clean.length; i++) {
    if (!Number.isFinite(clean[i].end) || clean[i].end <= clean[i].start) {
      const next = clean[i + 1];
      clean[i].end = next && next.start > clean[i].start
        ? Math.min(next.start, clean[i].start + 8)
        : clean[i].start + 3;
    }
    clean[i].end = Math.max(clean[i].start + 0.08, clean[i].end);
  }
  // YouTube ve bazı canlı caption sağlayıcıları aynı ekran metnini birkaç yüz
  // milisaniye kaymış, örtüşen ikinci bir cue olarak yineler. Başlangıcı aynı
  // saniye içinde kalan birebir metni tek cue yap; bitişik/uzak gerçek tekrarları
  // ve farklı konuşmacı metadata'sı taşıyan kayıtları koru.
  const deduped = [];
  for (const cue of clean) {
    const previous = deduped[deduped.length - 1];
    const differentSpeaker = previous && cue.speaker && previous.speaker
      && String(cue.speaker) !== String(previous.speaker);
    const rollingDuplicate = previous && !differentSpeaker && cue.text === previous.text
      && cue.start < previous.end && cue.start - previous.start <= 1.0;
    if (rollingDuplicate) {
      previous.end = Math.max(previous.end, cue.end);
      continue;
    }
    deduped.push(cue);
  }
  return deduped;
}

const MPEGTS_CLOCK_RATE = 90000;
const MPEGTS_ROLLOVER = 2 ** 33;
const MPEGTS_ROLLOVER_THRESHOLD = MPEGTS_ROLLOVER / 2;

function unwrapMpegTs(rawValue, state = null) {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw)) return 0;
  if (!state || typeof state !== 'object') return raw / MPEGTS_CLOCK_RATE;
  const previous = Number(state.lastRaw);
  let wraps = Math.trunc(Number(state.wraps) || 0);
  if (Number.isFinite(previous)) {
    const delta = raw - previous;
    if (delta < -MPEGTS_ROLLOVER_THRESHOLD) wraps += 1;
    else if (delta > MPEGTS_ROLLOVER_THRESHOLD) wraps -= 1;
  }
  state.lastRaw = raw;
  state.wraps = wraps;
  return (raw + wraps * MPEGTS_ROLLOVER) / MPEGTS_CLOCK_RATE;
}

function parseTimedBlocks(body, timing = {}) {
  const out = [];
  const clean = String(body || '').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const timestampMap = (clean.match(/X-TIMESTAMP-MAP\s*=\s*[^\n]*/i) || [])[0] || '';
  const localMatch = timestampMap.match(/LOCAL:([^,\s]+)/i);
  const mpegMatch = timestampMap.match(/MPEGTS:(\d+)/i);
  const local = localMatch ? parseTime(localMatch[1]) : 0;
  const mapped = mpegMatch ? unwrapMpegTs(mpegMatch[1], timing.mpegTsState) : 0;
  const timelineOffset = Number.isFinite(local) && Number.isFinite(mapped) ? mapped - local : 0;
  const re = /(?:(\d+):)?(\d+):(\d{2})[,.](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d{2})[,.](\d+)/;
  const lines = clean.split('\n');
  const indices = lines.flatMap((line, index) => re.test(line) ? [index] : []);
  for (let position = 0; position < indices.length; position++) {
      const idx = indices[position];
      const m = lines[idx].match(re);
      const start = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
        + Number(`0.${m[4]}`);
      const end = Number(m[5] || 0) * 3600 + Number(m[6]) * 60 + Number(m[7])
        + Number(`0.${m[8]}`);
      let until = indices[position + 1] ?? lines.length;
      // Ayraçsız SRT'de sonraki zaman kodunun önündeki sıra numarası metin değildir.
      if (position + 1 < indices.length) {
        const candidate = lines[until - 1]?.trim() || '';
        const separatedCueId = /^[A-Za-z0-9_-]{1,128}$/.test(candidate)
          && until > 1 && !lines[until - 2]?.trim();
        if (/^\d+$/.test(candidate) || separatedCueId) until--;
      }
      // WebVTT NOTE/STYLE/REGION blokları cue değildir. Global zaman satırı
      // taraması ayraçsız SRT'yi kurtarırken son cue'dan sonraki bu blokları
      // yanlışlıkla konuşma metnine eklememeli.
      for (let lineIndex = idx + 1; lineIndex < until; lineIndex++) {
        const metadata = lines[lineIndex].trim();
        if (lineIndex > idx + 1 && !lines[lineIndex - 1].trim()
            && /^(?:NOTE(?:\s|$)|STYLE\s*$|REGION\s*$)/i.test(metadata)) {
          until = lineIndex - 1;
          break;
        }
      }
      const text = lines.slice(idx + 1, until).join('\n');
      out.push({ start: start + timelineOffset, end: end + timelineOffset, text });
  }
  return normalizeCues(out);
}

function stripAssDrawing(text) {
  let drawing = false;
  return String(text || '').split(/(\{[^}]*\})/g).map((part) => {
    if (part.startsWith('{') && part.endsWith('}')) {
      for (const tag of part.matchAll(/\\(p\s*\d+|r[^\\}]*)/gi)) {
        drawing = /^p/i.test(tag[1]) && Number(tag[1].slice(1).trim()) > 0;
      }
      return part;
    }
    return drawing ? '' : part;
  }).join('');
}

function parseAss(body) {
  const out = [];
  let eventFields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  let inEvents = false;
  for (const line of String(body || '').replace(/\r/g, '').split('\n')) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inEvents = section[1].trim().toLowerCase() === 'events';
      continue;
    }
    const format = inEvents && line.match(/^\s*Format\s*:\s*(.+)$/i);
    if (format) {
      const fields = format[1].split(',').map((field) => field.trim().toLowerCase());
      if (fields.includes('start') && fields.includes('end') && fields.includes('text')) eventFields = fields;
      continue;
    }
    if (!/^\s*Dialogue\s*:/i.test(line)) continue;
    const rawFields = line.replace(/^\s*Dialogue\s*:\s*/i, '').split(',');
    const textIndex = eventFields.indexOf('text');
    const startIndex = eventFields.indexOf('start');
    const endIndex = eventFields.indexOf('end');
    if (textIndex < 0 || startIndex < 0 || endIndex < 0 || rawFields.length <= textIndex) continue;
    const start = parseTime(rawFields[startIndex]);
    const end = parseTime(rawFields[endIndex]);
    // Text alanı son yapısal alandır ve virgül içerebilir.
    const text = stripAssDrawing(rawFields.slice(textIndex).join(','))
      .replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/gi, ' ');
    if (start !== null) out.push({ start, end, text });
  }
  return normalizeCues(out);
}

function parseSami(body) {
  const out = [];
  const matches = [...String(body || '').matchAll(/<sync\b[^>]*\bstart\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<sync\b|$)/gi)];
  for (let i = 0; i < matches.length; i++) {
    const start = Number(matches[i][1]) / 1000;
    const end = i + 1 < matches.length ? Number(matches[i + 1][1]) / 1000 : null;
    const text = matches[i][2].replace(/<p\b[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n');
    out.push({ start, end, text });
  }
  return normalizeCues(out);
}

function parseLrc(body) {
  const rows = [];
  for (const line of String(body || '').replace(/\r/g, '').split('\n')) {
    const tagPattern = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const tags = [...line.matchAll(tagPattern)];
    // Bir satırda birden çok zaman etiketi boşlukla ayrılabilir:
    // [00:01.00] [00:02.00]Metin. Etiketler arasındaki boşluğu da tüket.
    const text = line.replace(new RegExp(`(?:${tagPattern.source})+(?:\\s*)`, 'g'), '').trim();
    if (!text) continue;
    for (const tag of tags) {
      const fraction = String(tag[4] || '').padEnd(3, '0').slice(0, 3);
      rows.push({ start: Number(tag[1] || 0) * 3600 + Number(tag[2]) * 60
        + Number(tag[3]) + Number(fraction) / 1000, text });
    }
  }
  rows.sort((a, b) => a.start - b.start);
  return normalizeCues(rows.map((row, i) => ({
    ...row,
    // LRC'nin son satırında bitiş damgası yoktur. Sıfıra düşürüp satırı
    // kaybetmek yerine okunabilir kısa bir varsayılan süre kullan.
    end: rows[i + 1] ? Math.min(rows[i + 1].start, row.start + 7) : row.start + 5,
  })));
}

function parseHlsSubtitleTracks(body, baseUrl = '') {
  const tracks = [];
  const text = String(body || '');
  for (const line of text.split(/\r?\n/)) {
    if (!/#EXT-X-MEDIA:/i.test(line) || !/TYPE\s*=\s*SUBTITLES/i.test(line)) continue;
    const attrs = {};
    for (const match of line.matchAll(/([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi)) {
      attrs[match[1].toUpperCase()] = String(match[2] || '').replace(/^"|"$/g, '');
    }
    if (!attrs.URI) continue;
    try { tracks.push({
      url: new URL(attrs.URI, baseUrl).href,
      language: attrs.LANGUAGE || '',
      // Etiket doğrudan iz kaydı/önbelleği ve seçiciye taşınır. Yalnız yabancı
      // replikleri içeren forced izi tam altyazı sanılmasın.
      label: (attrs.NAME || attrs.LANGUAGE || 'HLS altyazısı')
        + (String(attrs.FORCED || '').toUpperCase() === 'YES' ? ' (zorunlu)' : ''),
      forced: String(attrs.FORCED || '').toUpperCase() === 'YES',
    }); } catch (_) {}
  }
  return tracks;
}

function parseHlsSegmentUris(body, baseUrl = '') {
  return parseHlsSegments(body, baseUrl).map((segment) => segment.url);
}

function parseHlsSegments(body, baseUrl = '') {
  const out = [];
  const text = String(body || '');
  const mediaSequence = Math.max(0, Number(text.match(/#EXT-X-MEDIA-SEQUENCE\s*:\s*(\d+)/i)?.[1]) || 0);
  const targetDuration = Math.max(0, Number(text.match(/#EXT-X-TARGETDURATION\s*:\s*([\d.]+)/i)?.[1]) || 0);
  const discontinuitySequence = Math.max(0, Number(text.match(/#EXT-X-DISCONTINUITY-SEQUENCE\s*:\s*(\d+)/i)?.[1]) || 0);
  let elapsed = 0;
  let pendingDuration = 0;
  let sequence = mediaSequence;
  let discontinuity = discontinuitySequence;
  let pendingByteRange = null;
  let previousByteRangeEnd = 0;
  let previousByteRangeUrl = '';
  let initializationUrl = '';
  let initializationByteRange = null;
  let previousInitializationUrl = '';
  let previousInitializationRangeEnd = 0;
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    const duration = value.match(/^#EXTINF\s*:\s*([\d.]+)/i);
    if (duration) {
      pendingDuration = Math.max(0, Number(duration[1]) || 0);
      continue;
    }
    const byteRange = value.match(/^#EXT-X-BYTERANGE\s*:\s*(\d+)(?:@(\d+))?/i);
    if (byteRange) {
      const length = Math.max(0, Number(byteRange[1]) || 0);
      pendingByteRange = length ? { length,
        start: byteRange[2] === undefined ? null : Math.max(0, Number(byteRange[2]) || 0) } : null;
      continue;
    }
    const map = value.match(/^#EXT-X-MAP\s*:\s*(.+)$/i);
    if (map) {
      const uri = map[1].match(/(?:^|,)\s*URI\s*=\s*"([^"]+)"/i)?.[1] || '';
      const range = map[1].match(/(?:^|,)\s*BYTERANGE\s*=\s*"(\d+)(?:@(\d+))?"/i);
      try { initializationUrl = uri ? new URL(uri, baseUrl).href : ''; } catch (_) { initializationUrl = ''; }
      if (range) {
        const length = Math.max(0, Number(range[1]) || 0);
        // RFC 8216: @offset yoksa aynı URI'deki önceki init aralığının hemen
        // ardından devam eder. Her örtük aralığı sıfıra sabitlemek ikinci
        // init parçasını yanlış baytlardan indiriyordu.
        const start = range[2] === undefined
          ? (initializationUrl && initializationUrl === previousInitializationUrl
            ? previousInitializationRangeEnd : 0)
          : Math.max(0, Number(range[2]) || 0);
        initializationByteRange = length ? { start, end: start + length - 1 } : null;
        previousInitializationUrl = initializationUrl;
        previousInitializationRangeEnd = initializationByteRange ? initializationByteRange.end + 1 : 0;
      } else {
        initializationByteRange = null;
        previousInitializationUrl = '';
        previousInitializationRangeEnd = 0;
      }
      continue;
    }
    if (/^#EXT-X-DISCONTINUITY(?:\s|$)/i.test(value)) {
      discontinuity += 1;
      continue;
    }
    if (value.startsWith('#')) continue;
    try {
      const url = new URL(value, baseUrl).href;
      let byteRange = null;
      if (pendingByteRange) {
        const start = pendingByteRange.start === null
          ? (url === previousByteRangeUrl ? previousByteRangeEnd : 0)
          : pendingByteRange.start;
        byteRange = { start, end: start + pendingByteRange.length - 1 };
        previousByteRangeEnd = byteRange.end + 1;
        previousByteRangeUrl = url;
      } else {
        previousByteRangeEnd = 0;
        previousByteRangeUrl = '';
      }
      // Aynı URI canlı/kayan bir listede yeniden kullanılabilir. URI'yi tekilleştirmek
      // sonraki parçaların zamanını geriye kaydırdığı gibi ikinci oluşumun kendi
      // zamanını da kaybettirir; her playlist satırı ayrı bir zaman örneğidir.
      // Bazı canlı listeler geçici olarak EXTINF satırını düşürüyor. Sıfır
      // süre sonraki bütün parçaları aynı zamana yığmasın; manifestin hedef
      // süresi bu bozukluk için en güvenli yaklaşık değerdir.
      const segmentDuration = pendingDuration > 0 ? pendingDuration : targetDuration;
      out.push({ url, start: elapsed, duration: segmentDuration, sequence, discontinuity,
        targetDuration, ...(byteRange ? { byteRange } : {}),
        ...(initializationUrl ? { initializationUrl } : {}),
        ...(initializationByteRange ? { initializationByteRange } : {}) });
      elapsed += segmentDuration;
      sequence += 1;
    } catch (_) {}
    pendingDuration = 0;
    pendingByteRange = null;
  }
  return out;
}

function isHlsSubtitlePlaylist(body, url = '') {
  const text = String(body || '');
  if (!/^\s*#EXTM3U/m.test(text) || /#EXT-X-STREAM-INF/i.test(text)) return false;
  const uris = parseHlsSegmentUris(text, url);
  if (!uris.length) return false;
  const subtitleUris = uris.filter((item) => /\.(?:vtt|webvtt|srt|ttml|dfxp)(?:[?#]|$)/i.test(item));
  if (subtitleUris.length && subtitleUris.length >= Math.ceil(uris.length * 0.6)) return true;
  return SUBTITLE_URL_RE.test(String(url || ''));
}

function resolveUrl(value, baseUrl) {
  try { return new URL(decodeEntities(value).trim(), baseUrl).href; } catch (_) { return ''; }
}

function lastBaseUrl(xml, baseUrl) {
  const values = [...String(xml || '').matchAll(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/gi)];
  return values.length ? resolveUrl(values[values.length - 1][1], baseUrl) : baseUrl;
}

function firstBaseValue(xml) {
  const match = String(xml || '').match(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/i);
  return match ? decodeEntities(match[1]).trim() : '';
}

function dashOuterBase(xml, adaptation, baseUrl) {
  const source = String(xml || '');
  const prefix = source.slice(0, adaptation.index);
  const periodOpen = prefix.toLowerCase().lastIndexOf('<period');
  const periodClose = prefix.toLowerCase().lastIndexOf('</period>');
  const inPeriod = periodOpen > periodClose;
  // Yalnız MPD kökü ile mevcut Period'un BaseURL zincirini kullan. Önceki
  // Period bloklarını prefix içinde bırakmak, p1/ + p2/ gibi kardeş tabanları
  // art arda ekleyip ikinci dönemin URL'lerini bozuyordu.
  const rootPrefix = (inPeriod ? prefix.slice(0, periodOpen) : prefix)
    .replace(/<Period\b[\s\S]*?<\/Period>/gi, '')
    .replace(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi, '');
  const periodPrefix = inPeriod
    ? prefix.slice(periodOpen).replace(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/gi, '')
    : '';
  let resolved = baseUrl;
  for (const scope of [rootPrefix, periodPrefix]) {
    for (const match of scope.matchAll(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/gi)) {
      resolved = resolveUrl(match[1], resolved);
    }
  }
  return resolved;
}

function dashTextAdaptations(xml) {
  const out = [];
  for (const match of String(xml || '').matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)) {
    const tag = match[1];
    const inner = match[2];
    const repTag = (inner.match(/<Representation\b([^>]*)/i) || [])[1] || '';
    const roleTag = (inner.match(/<Role\b[^>]*>/i) || [])[0] || '';
    const signature = `${attr(tag, 'contentType')} ${attr(tag, 'mimeType')} ${attr(tag, 'codecs')} ${tag} ${repTag} ${roleTag}`;
    if (/\btext\b|subtitle|caption|ttml|vtt|wvtt|stpp/i.test(signature)) out.push({ ...match, tag, inner, signature });
  }
  return out;
}

function dashRepresentations(inner) {
  const reps = [];
  for (const match of String(inner || '').matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)) {
    reps.push({ tag: match[1], inner: match[2] });
  }
  for (const match of String(inner || '').matchAll(/<Representation\b([^>]*?)\/>/gi)) {
    reps.push({ tag: match[1], inner: '' });
  }
  return reps.length ? reps : [{ tag: '', inner: '' }];
}

function parseDashSubtitleMatchers(body, baseUrl = '') {
  const xml = String(body || '');
  if (!/<MPD\b/i.test(xml)) return [];
  const matchers = [];
  for (const adaptation of dashTextAdaptations(xml)) {
    // Önceki AdaptationSet'lerin BaseURL değerlerini dış kapsam sanmamak için
    // tamamlanmış adaptasyonları prefix'ten çıkar; geriye MPD/Period tabanı kalır.
    const outerBase = dashOuterBase(xml, adaptation, baseUrl);
    const adaptationPrefix = adaptation.inner.split(/<Representation\b/i)[0];
    const adaptationBase = lastBaseUrl(adaptationPrefix, outerBase);
    const adaptationTemplate = (adaptationPrefix.match(/<SegmentTemplate\b([^>]*)\/?\s*>/i) || [])[1] || '';
    for (const rep of dashRepresentations(adaptation.inner)) {
      const repBase = lastBaseUrl(rep.inner, adaptationBase);
      const templateTag = (rep.inner.match(/<SegmentTemplate\b([^>]*)\/?\s*>/i) || [])[1] || adaptationTemplate;
      const media = attr(templateTag, 'media');
      if (!media) continue;
      const representationId = attr(rep.tag, 'id');
      const bandwidth = attr(rep.tag, 'bandwidth');
      const initialization = attr(templateTag, 'initialization');
      const initializationUrl = initialization ? resolveUrl(decodeEntities(initialization)
        .replace(/\$RepresentationID\$/gi, representationId || '')
        .replace(/\$Bandwidth\$/gi, bandwidth || '')
        .replace(/\$\$/g, '$'), repBase) : '';
      let template = decodeEntities(media)
        .replace(/\$RepresentationID\$/gi, representationId || '__DASHREP__')
        .replace(/\$Bandwidth\$/gi, bandwidth || '__DASHREP__')
        .replace(/\$\$/g, '__DASHDOLLAR__');
      let variable = '';
      template = template.replace(/\$(Number|Time|SubNumber)(?:%0\d+d)?\$/gi, (_whole, name) => {
        if (!variable) { variable = name.toLowerCase(); return '__DASHCAP__'; }
        return '__DASHNUM__';
      });
      if (!variable) continue;
      const absolute = resolveUrl(template, repBase);
      const escaped = absolute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const querySuffix = absolute.includes('#') ? ''
        : absolute.includes('?') ? '(?:&[^#]*)?(?:#.*)?' : '(?:[?#].*)?';
      const pattern = `^${escaped
        .replace('__DASHCAP__', '(\\d+)')
        .replace(/__DASHNUM__/g, '\\d+')
        .replace(/__DASHREP__/g, '[^/?#]+')
        .replace(/__DASHDOLLAR__/g, '\\$')}${querySuffix}$`;
      matchers.push({
        pattern,
        variable,
        // MPD'de timescale bulunmayabilir; 1 varsaymak tfdt değerlerini
        // günler sonrasına şişirir. Çağıran taraf init segmentindeki mdhd'yi okur.
        timescale: Math.max(0, Number(attr(templateTag, 'timescale')) || 0),
        initializationUrl,
        duration: Math.max(0, Number(attr(templateTag, 'duration')) || 0),
        startNumber: dashStartNumber(attr(templateTag, 'startNumber')),
        language: attr(adaptation.tag, 'lang') || attr(rep.tag, 'lang') || '',
        label: attr(adaptation.tag, 'label') || representationId || attr(adaptation.tag, 'lang') || 'DASH altyazısı',
        format: /vtt|wvtt/i.test(adaptation.signature + rep.tag) ? 'vtt' : 'ttml',
      });
    }
  }
  return matchers.filter((item, index, all) => all.findIndex((other) => other.pattern === item.pattern) === index).slice(0, 64);
}

function matchDashSubtitleUrl(url, matchers = []) {
  for (const matcher of matchers || []) {
    try {
      const match = String(url || '').match(new RegExp(matcher.pattern));
      if (match) return { ...matcher, segmentValue: Number(match[1]) };
    } catch (_) {}
  }
  return null;
}

function dashStartNumber(raw) {
  const value = raw == null || String(raw).trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

function dashSegmentOffset(matcher) {
  const value = Number(matcher && matcher.segmentValue);
  // MPEG-DASH'te timescale verilmezse standart varsayılanı 1'dir. Manifest
  // varsa init parçasından okunan gerçek değer eşleştiriciye daha önce yazılır.
  const timescale = Math.max(1, Number(matcher && matcher.timescale) || 1);
  if (!Number.isFinite(value)) return 0;
  if (matcher.variable === 'time') return Math.max(0, value / timescale);
  if (matcher.variable === 'number' || matcher.variable === 'subnumber') {
    const duration = Math.max(0, Number(matcher.duration) || 0);
    const start = dashStartNumber(matcher.startNumber);
    return duration ? Math.max(0, (value - start) * duration / timescale) : 0;
  }
  return 0;
}

function cuesUseLocalSegmentTimeline(cues, segmentDuration, segmentStart = 0) {
  const list = normalizeCues(cues);
  const duration = Math.max(0, Number(segmentDuration) || 0);
  const absoluteStart = Math.max(0, Number(segmentStart) || 0);
  if (!list.length || !duration) return false;
  // Bu yardımcı yalnız segment başlangıcı > 0 iken çağrılır. İlk birkaç saniyesi
  // müzik/sessizlik olan yerel zamanlı parçalarda ilk cue 2 saniyeden sonra da
  // başlayabilir; belirleyici olan bütün cue'ların parça süresine sığmasıdır.
  // Cue zaten parçanın mutlak başlangıcına denk geliyorsa ikinci kez ofsetleme.
  // Küçük tolerans, komşu parçalara taşan replikleri mutlak kabul eder.
  if (absoluteStart > 0 && list[0].start >= absoluteStart - 0.5) return false;
  return list[0].start >= 0
    && list[0].start < duration
    // Bir cue segment sınırını aşabilir; yalnızca birden fazla segmentlik
    // sıçramayı mutlak zaman işareti olarak kabul etmeye devam et.
    && list[list.length - 1].end <= duration * 2 + 0.5;
}

function browserActiveCuesAt(cues, time) {
  const list = Array.isArray(cues) ? cues : [];
  const t = Number(time);
  if (!Number.isFinite(t) || !list.length) return [];
  let lo = 0;
  let hi = list.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Number(list[mid].start) <= t) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const active = [];
  // Uzun süre ekranda kalan bir cue (şarkı sözü, işaret dili açıklaması vb.)
  // arada 64'ten fazla kısa cue olsa da hâlâ aktiftir. Sabit geri-bakış sınırı
  // onu sessizce kaybediyordu. Liste zaman sıralı olduğundan yalnız son cue'ya
  // kadar taranır; tipik izlerde bu birkaç yüz/bitmiş canlı izde birkaç bindir.
  // Önek maksimum bitiş dizisi sayesinde uzun cue doğruluğu korunurken her
  // video karesinde bütün geçmiş izi dolaşmayız. Aynı cue dizisi overlay açık
  // kaldığı sürece WeakMap üzerinden yeniden kullanılır.
  if (!browserActiveCuesAt._prefixCache) browserActiveCuesAt._prefixCache = new WeakMap();
  let indexData = browserActiveCuesAt._prefixCache.get(list);
  if (!indexData || indexData.length !== list.length) {
    let maximum = -Infinity;
    const prefix = list.map((cue) => {
      maximum = Math.max(maximum, Number(cue.end));
      return maximum;
    });
    indexData = { length: list.length, prefix };
    browserActiveCuesAt._prefixCache.set(list, indexData);
  }
  for (let index = last; index >= 0; index--) {
    if (indexData.prefix[index] <= t) break;
    // Zaman araliklari yari aciktir: biten cue ile ayni anda baslayan cue bir
    // kare boyunca ust uste binmemeli.
    if (Number(list[index].end) > t) active.push(list[index]);
  }
  return active.reverse();
}

function parseDashSubtitleTracks(body, baseUrl = '') {
  const xml = String(body || '');
  if (!/<MPD\b/i.test(xml)) return [];
  const tracks = [];
  for (const match of dashTextAdaptations(xml)) {
    const tag = match.tag;
    const inner = match.inner;
    const signature = match.signature;
    const representation = dashRepresentations(inner)[0];
    const repTag = representation ? representation.tag : '';
    const repInner = representation ? representation.inner : '';
    const outerBase = dashOuterBase(xml, match, baseUrl);
    const adaptationPrefix = inner.split(/<Representation\b/i)[0];
    const adaptationValue = firstBaseValue(adaptationPrefix);
    const adaptationBase = adaptationValue ? resolveUrl(adaptationValue, outerBase) : outerBase;
    const repValue = firstBaseValue(repInner);
    const directValue = repValue || (/(?:vtt|webvtt|srt|ttml|dfxp|xml)(?:[?#]|$)/i.test(adaptationValue) ? adaptationValue : '');
    if (!directValue) continue;
    try {
      tracks.push({
        url: repValue ? resolveUrl(repValue, adaptationBase) : resolveUrl(directValue, outerBase),
        language: attr(tag, 'lang') || attr(repTag, 'lang') || '',
        label: attr(tag, 'label') || attr(repTag, 'id') || attr(tag, 'lang') || 'DASH altyazısı',
        format: /vtt|wvtt/i.test(signature + repTag) ? 'vtt' : 'ttml',
      });
    } catch (_) {}
  }
  return tracks;
}

function findSubtitleUrls(body, baseUrl = '') {
  let root;
  try { root = JSON.parse(String(body || '')); } catch (_) { return []; }
  const found = new Set();
  const visit = (value, context = '', depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || text.length > 2000) return;
      const hinted = /subtitle|subtitles|caption|captions|timedtext|texttrack|ttml|dfxp|webvtt|vtt|srt/i.test(context);
      const looksLikeResource = /^https?:\/\//i.test(text)
        || text.startsWith('/')
        || /\.(?:vtt|srt|ttml|dfxp|srv3|json3|xml)(?:[?#]|$)/i.test(text);
      if (!looksLikeResource || (!hinted && !/\.(?:vtt|srt|ttml|dfxp|xml)(?:[?#]|$)/i.test(text))) return;
      try {
        const url = new URL(text, baseUrl).href;
        if (/^https?:$/i.test(new URL(url).protocol)) found.add(url);
      } catch (_) {}
      return;
    }
    if (Array.isArray(value)) return value.slice(0, 500).forEach((item) => visit(item, context, depth + 1));
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value).slice(0, 1000)) {
        visit(item, `${context} ${key}`, depth + 1);
      }
    }
  };
  visit(root);
  return [...found].slice(0, 64);
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function parseXmlTime(value, xml) {
  const raw = String(value || '').trim();
  const tick = raw.match(/^(-?\d+(?:\.\d+)?)t$/i);
  if (tick) {
    const rateMatch = String(xml || '').match(/(?:\b|:)tickRate\s*=\s*["']([\d.]+)["']/i);
    const rate = Math.max(1, Number(rateMatch && rateMatch[1]) || 1);
    return Number(tick[1]) / rate;
  }
  const frame = raw.match(/^(-?\d+(?:\.\d+)?)f$/i);
  if (frame) {
    const rateMatch = String(xml || '').match(/(?:\b|:)frameRate\s*=\s*["']([\d.]+)["']/i);
    const multiplier = String(xml || '').match(/(?:\b|:)frameRateMultiplier\s*=\s*["'](\d+)\s+(\d+)["']/i);
    let rate = Math.max(1, Number(rateMatch && rateMatch[1]) || 30);
    if (multiplier && Number(multiplier[2])) rate *= Number(multiplier[1]) / Number(multiplier[2]);
    return Number(frame[1]) / rate;
  }
  const clockFrame = raw.match(/^(\d+):(\d{2}):(\d{2}):(\d+(?:\.\d+)?)$/);
  if (clockFrame) {
    const rateMatch = String(xml || '').match(/(?:\b|:)frameRate\s*=\s*["']([\d.]+)["']/i);
    const multiplier = String(xml || '').match(/(?:\b|:)frameRateMultiplier\s*=\s*["'](\d+)\s+(\d+)["']/i);
    let rate = Math.max(1, Number(rateMatch && rateMatch[1]) || 30);
    if (multiplier && Number(multiplier[2])) rate *= Number(multiplier[1]) / Number(multiplier[2]);
    const result = Number(clockFrame[1]) * 3600 + Number(clockFrame[2]) * 60
      + Number(clockFrame[3]) + Number(clockFrame[4]) / rate;
    return Number.isFinite(result) ? result : null;
  }
  return parseTime(raw);
}

function parseXml(body) {
  const out = [];
  const xml = String(body || '');
  const parentOffsets = new Map();
  const stack = [{ name: 'root', offset: 0 }];
  const localName = (value) => String(value || '').toLowerCase().split(':').pop();
  for (const token of xml.matchAll(/<\/?(?:[\w.-]+:)?(?:body|div|p)\b[^>]*>/gi)) {
    const rawTag = token[0];
    const closing = /^<\//.test(rawTag);
    const name = localName(rawTag.match(/^<\/?\s*([\w:.-]+)/)?.[1]);
    if (closing) {
      for (let index = stack.length - 1; index > 0; index--) {
        const popped = stack.pop();
        if (popped.name === name) break;
      }
      continue;
    }
    const parentOffset = stack[stack.length - 1]?.offset || 0;
    if (name === 'p') parentOffsets.set(token.index, parentOffset);
    const begin = parseXmlTime(attr(rawTag, 'begin'), xml);
    if (!/\/>$/.test(rawTag)) stack.push({ name, offset: parentOffset + (begin || 0) });
  }
  // YouTube timedtext / srv biçimi.
  for (const match of xml.matchAll(/<((?:[\w.-]+:)?(?:text|p))\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const elementName = localName(match[1]);
    const tag = match[2];
    const inner = match[3];
    const timedTextStart = attr(tag, 't');
    const timedTextDuration = attr(tag, 'd');
    const startRaw = attr(tag, 'start') || attr(tag, 'begin') || timedTextStart;
    const durRaw = attr(tag, 'dur') || timedTextDuration;
    const endRaw = attr(tag, 'end');
    let start = parseXmlTime(startRaw, xml);
    let duration = parseXmlTime(durRaw, xml);
    let end = parseXmlTime(endRaw, xml);
    const parentOffset = parentOffsets.get(match.index) || 0;
    // TTML'de asil zaman kimi servislerde p yerine ic span'lere yazilir.
    // Her zamanli span kendi cue'su olur; p baslangici varsa span ona gore
    // ofsetlenir. Boylece farkli span sureleri tek buyuk cue'ya cokmez.
    const timedSpans = elementName === 'p' ? [...inner.matchAll(
      /<((?:[\w.-]+:)?span)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
    )].filter((span) => /\b(?:begin|start|t|end|dur|d)\s*=/i.test(span[2])) : [];
    if (timedSpans.length) {
      let paragraphStart = parseXmlTime(startRaw, xml);
      if (startRaw === timedTextStart && timedTextStart && Number.isFinite(Number(startRaw))) {
        paragraphStart = Number(startRaw) / 1000;
      }
      const paragraphEnd = end !== null ? end
        : (duration !== null && paragraphStart !== null ? paragraphStart + duration : null);
      const paragraphDuration = paragraphEnd !== null && paragraphStart !== null
        ? Math.max(0, paragraphEnd - paragraphStart) : 0;
      const spanBase = parentOffset + (paragraphStart || 0);
      for (const span of timedSpans) {
        const spanTag = span[2];
        const spanTimedStart = attr(spanTag, 't');
        const spanTimedDuration = attr(spanTag, 'd');
        const spanStartRaw = attr(spanTag, 'start') || attr(spanTag, 'begin') || spanTimedStart;
        const spanDurRaw = attr(spanTag, 'dur') || spanTimedDuration;
        const spanEndRaw = attr(spanTag, 'end');
        let spanStart = parseXmlTime(spanStartRaw, xml);
        let spanDuration = parseXmlTime(spanDurRaw, xml);
        let spanEnd = parseXmlTime(spanEndRaw, xml);
        if (spanStartRaw === spanTimedStart && spanTimedStart && Number.isFinite(Number(spanStartRaw))) spanStart = Number(spanStartRaw) / 1000;
        if (spanDurRaw === spanTimedDuration && spanTimedDuration && Number.isFinite(Number(spanDurRaw))) spanDuration = Number(spanDurRaw) / 1000;
        if (spanStart === null) continue;
        // Bazı TTML üreticileri span zamanlarını p'ye göre göreli, bazıları
        // doğrudan belge mutlakı yazar. Span p başlangıcına eşitse veya p'nin
        // süresini belirgin biçimde aşıyorsa mutlak kabul et; normal göreli
        // span'lerde geriye dönük uyumluluk için p ofsetini koru.
        const absoluteSpan = (paragraphStart !== null && paragraphStart > 0
          && (Math.abs(spanStart - paragraphStart) < 0.001
            || (paragraphDuration > 0 && spanStart > paragraphDuration + 3)));
        spanStart += absoluteSpan ? parentOffset : spanBase;
        if (spanEnd !== null) spanEnd += absoluteSpan ? parentOffset : spanBase;
        if (spanEnd === null && spanDuration !== null) spanEnd = spanStart + spanDuration;
        out.push({ start: spanStart, end: spanEnd, text: span[3] });
      }
      continue;
    }
    // YouTube srv3 t/d değerleri milisaniyedir.
    if (startRaw === timedTextStart && timedTextStart && Number.isFinite(Number(startRaw))) start = Number(startRaw) / 1000;
    if (durRaw === timedTextDuration && timedTextDuration && Number.isFinite(Number(durRaw))) duration = Number(durRaw) / 1000;
    if (start !== null) start += parentOffset;
    if (end !== null) end += parentOffset;
    if (end === null && start !== null && duration !== null) end = start + duration;
    if (start !== null) out.push({ start, end, text: inner });
  }
  return normalizeCues(out);
}

function parseJson(body) {
  let data;
  try { data = JSON.parse(body); } catch (_) { return []; }
  const events = Array.isArray(data && data.events) ? data.events : [];
  const out = [];
  for (const event of events) {
    const text = Array.isArray(event.segs) ? event.segs.map((seg) => seg.utf8 || '').join('')
      : (event.text || event.utf8 || '');
    const start = Number(event.tStartMs ?? event.startMs ?? event.start);
    const duration = Number(event.dDurationMs ?? event.durationMs ?? event.duration);
    if (!Number.isFinite(start)) continue;
    const milliseconds = event.tStartMs !== undefined || event.startMs !== undefined;
    const s = milliseconds ? start / 1000 : start;
    const d = Number.isFinite(duration)
      ? ((event.dDurationMs !== undefined || event.durationMs !== undefined) ? duration / 1000 : duration)
      : null;
    const end = d === null ? null : s + d;
    // YouTube json3 canlı altyazısında aAppend olayı önceki ekrandaki metnin
    // devamıdır. Ayrı cue üretmek kelimeleri böler ve çeviride tekrar yaratır.
    if (event.aAppend && out.length) {
      const previous = out[out.length - 1];
      previous.text += text;
      if (Number.isFinite(end)) previous.end = Math.max(Number(previous.end) || s, end);
    } else {
      out.push({ start: s, end, text });
    }
  }
  if (out.length) return normalizeCues(out);
  const generic = [data && data.segments, data && data.captions, data && data.subtitles, data && data.cues]
    .find((value) => Array.isArray(value)) || (Array.isArray(data) ? data : []);
  for (const cue of generic.slice(0, 20000)) {
    if (!cue || typeof cue !== 'object') continue;
    const text = cue.text ?? cue.content ?? cue.caption ?? cue.payload;
    const startKey = ['startTimeMs', 'startMs', 'beginMs', 'startTime', 'start', 'begin', 'from']
      .find((key) => cue[key] !== undefined);
    if (!startKey || typeof text !== 'string') continue;
    const endKey = ['endTimeMs', 'endMs', 'endTime', 'end', 'to'].find((key) => cue[key] !== undefined);
    const durationKey = ['durationMs', 'duration', 'dur'].find((key) => cue[key] !== undefined);
    let start = parseTime(cue[startKey]);
    let end = endKey ? parseTime(cue[endKey]) : null;
    let duration = durationKey ? parseTime(cue[durationKey]) : null;
    if (!Number.isFinite(start)) continue;
    if (/Ms$|TimeMs$/i.test(startKey)) start /= 1000;
    if (Number.isFinite(end) && /Ms$|TimeMs$/i.test(endKey)) end /= 1000;
    if (Number.isFinite(duration) && /Ms$/i.test(durationKey)) duration /= 1000;
    if (!Number.isFinite(end)) end = Number.isFinite(duration) ? start + duration : null;
    out.push({ start, end, text });
  }
  return normalizeCues(out);
}

function mp4Boxes(buffer, start = 0, end = buffer.length) {
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(large); header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) break;
    boxes.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function mp4Child(boxes, type) {
  return (boxes || []).find((box) => box.type === type) || null;
}

function mp4Tfhd(buffer, box) {
  if (!box || box.start + 8 > box.end) return {};
  const flags = buffer.readUInt32BE(box.start) & 0x00ffffff;
  const trackId = buffer.readUInt32BE(box.start + 4);
  let cursor = box.start + 8; // full-box + track_ID
  if (flags & 0x000001) cursor += 8;
  if (flags & 0x000002) cursor += 4;
  const out = { trackId };
  if (flags & 0x000008 && cursor + 4 <= box.end) { out.duration = buffer.readUInt32BE(cursor); cursor += 4; }
  if (flags & 0x000010 && cursor + 4 <= box.end) out.size = buffer.readUInt32BE(cursor);
  return out;
}

function parseMp4SampleDefaults(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const defaults = {};
  if (data.length < 16) return defaults;
  const visit = (start, end, depth = 0) => {
    if (depth > 6) return;
    for (const box of mp4Boxes(data, start, end)) {
      if (box.type === 'trex' && box.start + 24 <= box.end) {
        // trex: version/flags, track_ID, description index, duration, size, flags.
        const trackId = data.readUInt32BE(box.start + 4);
        if (!trackId) continue;
        defaults[String(trackId)] = {
          duration: data.readUInt32BE(box.start + 12),
          size: data.readUInt32BE(box.start + 16),
        };
      } else if (/^(moov|mvex)$/.test(box.type)) {
        visit(box.start, box.end, depth + 1);
      }
    }
  };
  visit(0, data.length);
  return defaults;
}

function mp4Tfdt(buffer, box) {
  if (!box || box.start + 8 > box.end) return 0;
  const version = buffer[box.start];
  if (version === 1 && box.start + 12 <= box.end) {
    const value = buffer.readBigUInt64BE(box.start + 4);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : 0;
  }
  return buffer.readUInt32BE(box.start + 4);
}

function mp4TrunSamples(buffer, box, defaults = {}) {
  if (!box || box.start + 8 > box.end) return [];
  const version = buffer[box.start];
  const flags = buffer.readUInt32BE(box.start) & 0x00ffffff;
  const count = buffer.readUInt32BE(box.start + 4);
  if (count > 20000) return [];
  let cursor = box.start + 8;
  if (flags & 0x000001) cursor += 4;
  if (flags & 0x000004) cursor += 4;
  const samples = [];
  for (let index = 0; index < count; index++) {
    let duration = defaults.duration || 0;
    let size = defaults.size || 0;
    let composition = 0;
    if (flags & 0x000100) { if (cursor + 4 > box.end) return []; duration = buffer.readUInt32BE(cursor); cursor += 4; }
    if (flags & 0x000200) { if (cursor + 4 > box.end) return []; size = buffer.readUInt32BE(cursor); cursor += 4; }
    if (flags & 0x000400) cursor += 4;
    if (flags & 0x000800) {
      if (cursor + 4 > box.end) return [];
      composition = version === 1 ? buffer.readInt32BE(cursor) : buffer.readUInt32BE(cursor);
      cursor += 4;
    }
    if (!duration || size < 0 || cursor > box.end) return [];
    samples.push({ duration, size, composition });
  }
  return samples;
}

function mp4PaylText(buffer) {
  const visit = (start, end, depth = 0) => {
    if (depth > 4) return [];
    const texts = [];
    for (const box of mp4Boxes(buffer, start, end)) {
      if (box.type === 'payl') texts.push(buffer.toString('utf-8', box.start, box.end));
      else if (box.type === 'vttc') texts.push(...visit(box.start, box.end, depth + 1));
    }
    return texts;
  };
  return visit(0, buffer.length).map(cleanCueText).filter(Boolean).join('\n');
}

function parseMp4Timescale(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (data.length < 16) return 0;
  let movieTimescale = 0;
  const readTimescale = (box) => {
    const version = data[box.start];
    const offset = box.start + (version === 1 ? 20 : 12);
    return offset + 4 <= box.end ? data.readUInt32BE(offset) || 0 : 0;
  };
  const visit = (start, end, depth = 0) => {
    if (depth > 6) return 0;
    for (const box of mp4Boxes(data, start, end)) {
      if (box.type === 'mdhd') return readTimescale(box);
      if (box.type === 'mvhd' && !movieTimescale) movieTimescale = readTimescale(box);
      if (/^(moov|trak|mdia)$/.test(box.type)) {
        const nested = visit(box.start, box.end, depth + 1);
        if (nested) return nested;
      }
    }
    return 0;
  };
  return visit(0, data.length) || movieTimescale;
}

function parseMp4WebVtt(buffer, matcher = {}) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (data.length < 16) return [];
  const top = mp4Boxes(data);
  const timescale = Math.max(0, Number(matcher.timescale) || parseMp4Timescale(data));
  // Yanlış bir '1' varsayımı sessizce devasa zamanlar üretmektense, init
  // segmenti henüz bulunamadığında parçayı reddetmek daha güvenlidir.
  if (!timescale) return [];
  const cues = [];
  for (let topIndex = 0; topIndex < top.length; topIndex++) {
    const moof = top[topIndex];
    if (moof.type !== 'moof') continue;
    const mdat = top.slice(topIndex + 1).find((box) => box.type === 'mdat' || box.type === 'moof');
    if (!mdat || mdat.type !== 'mdat') continue;
    const trafs = mp4Boxes(data, moof.start, moof.end).filter((box) => box.type === 'traf');
    for (const traf of trafs) {
      const children = mp4Boxes(data, traf.start, traf.end);
      const fragmentDefaults = mp4Tfhd(data, mp4Child(children, 'tfhd'));
      const initDefaults = matcher.sampleDefaults?.[String(fragmentDefaults.trackId)] || {};
      const defaults = {
        ...fragmentDefaults,
        duration: fragmentDefaults.duration || Number(initDefaults.duration) || 0,
        size: fragmentDefaults.size || Number(initDefaults.size) || 0,
      };
      const baseTime = mp4Tfdt(data, mp4Child(children, 'tfdt'));
      const samples = children.filter((box) => box.type === 'trun')
        .flatMap((box) => mp4TrunSamples(data, box, defaults));
      if (!samples.length || samples.reduce((sum, sample) => sum + sample.size, 0) > mdat.end - mdat.start) continue;
      let mediaCursor = mdat.start;
      let decodeTime = baseTime;
      for (const sample of samples) {
        const sampleBuffer = data.subarray(mediaCursor, mediaCursor + sample.size);
        const text = mp4PaylText(sampleBuffer);
        if (text) cues.push({
          start: (decodeTime + sample.composition) / timescale,
          end: (decodeTime + sample.composition + sample.duration) / timescale,
          text,
        });
        mediaCursor += sample.size;
        decodeTime += sample.duration;
      }
    }
  }
  return normalizeCues(cues);
}

function decodeSubtitleBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const bodyLength = (buffer.length - 2) & ~1;
    const swapped = Buffer.alloc(bodyLength);
    for (let index = 2; index < 2 + bodyLength; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString('utf16le');
  }
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!utf8.includes('\uFFFD')) return utf8;
  // Ağdan yakalanan eski Türkçe SRT/VTT dosyaları hâlâ Windows-1254 olabilir.
  // Buffer#toString('latin1') 0x80-0x9f aralığını yanlış eşlediği için standart
  // TextDecoder kullan; desteklenmeyen eski Node sürümünde sınırlı harf
  // eşlemesiyle güvenli bir geri dönüş yap.
  try {
    return new TextDecoder('windows-1254', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  } catch (_) {
    const cp1254 = { 0xd0: 'Ğ', 0xdd: 'İ', 0xde: 'Ş', 0xf0: 'ğ', 0xfd: 'ı', 0xfe: 'ş' };
    return [...buffer].map((byte) => cp1254[byte] || String.fromCharCode(byte)).join('');
  }
}

function parseSubtitlePayload(body, mimeType = '', url = '', timing = {}) {
  const raw = String(body || '').trim();
  if (!raw || raw.length > 12 * 1024 * 1024) return { cues: [], format: '' };
  let cues = [];
  let format = '';
  if (/^[\[{]/.test(raw) || /json/i.test(mimeType) || /json3/i.test(url)) {
    cues = parseJson(raw);
    if (cues.length) format = 'json3';
  }
  if (!cues.length && /<(?:[\w.-]+:)?(?:tt|transcript|timedtext|text|p)\b/i.test(raw)) {
    cues = parseXml(raw);
    if (cues.length) format = /<(?:[\w.-]+:)?tt\b/i.test(raw) ? 'ttml' : 'timedtext';
  }
  if (!cues.length && (raw.includes('-->') || /vtt|srt|subrip/i.test(mimeType + url))) {
    cues = parseTimedBlocks(raw, timing);
    if (cues.length) format = /^WEBVTT/i.test(raw) || /vtt/i.test(mimeType + url) ? 'vtt' : 'srt';
  }
  if (!cues.length && (/ass|ssa/i.test(mimeType + url)
      || /(?:^|\r?\n)\s*\[(?:Script Info|Events|V4\+? Styles)\]/i.test(raw))) {
    cues = parseAss(raw);
    if (cues.length) format = 'ass';
  }
  if (!cues.length && (/sami|smi/i.test(mimeType + url) || /<sami\b|<sync\b/i.test(raw))) {
    cues = parseSami(raw);
    if (cues.length) format = 'sami';
  }
  if (!cues.length && (/lrc/i.test(mimeType + url) || /^\s*\[\d{1,2}:\d{2}/m.test(raw))) {
    cues = parseLrc(raw);
    if (cues.length) format = 'lrc';
  }
  return { cues, format };
}

function isLikelySubtitleResponse(response = {}) {
  const url = String(response.url || '');
  const mime = String(response.mimeType || '').toLowerCase();
  const pathname = (() => { try { return new URL(url).pathname.toLowerCase(); } catch (_) { return url.toLowerCase(); } })();
  if (/\.(vtt|srt|ttml|dfxp|srv3)(?:$|[?#])/.test(url.toLowerCase())) return true;
  if (mime.includes('text/vtt') || mime.includes('application/ttml') || mime.includes('x-subrip')) return true;
  const hinted = SUBTITLE_URL_RE.test(url) || SUBTITLE_URL_RE.test(pathname);
  if (!hinted) return false;
  // wvtt/stpp altyazı parçaları video değil application/mp4 olarak sunulabilir.
  // Yalnız URL açıkça altyazı ipucu taşıyorsa kabul ederek genel MP4 videolarını
  // ağ yakalama kuyruğuna almıyoruz.
  return /(?:text|xml|json|octet-stream|unknown|application\/mp4|video\/mp4)/i.test(mime || 'unknown');
}

function subtitleLanguage(response = {}) {
  const headers = response.headers || {};
  const header = headers['content-language'] || headers['Content-Language'];
  if (header) return String(header).split(',')[0].trim();
  try {
    const u = new URL(response.url || '');
    return u.searchParams.get('lang') || u.searchParams.get('language')
      || u.searchParams.get('locale') || u.searchParams.get('hl') || '';
  } catch (_) { return ''; }
}

function cueFingerprint(cues) {
  const list = Array.isArray(cues) ? cues : [];
  const hash = crypto.createHash('sha256').update(`${list.length}\n`);
  // Orta satır, yalnız bitiş zamanı ve milisaniye düzeltmeleri de yayını yeniler.
  // Akış halinde hash'le; tüm izin ikinci büyük metin kopyasını oluşturma.
  for (const cue of list) hash.update(JSON.stringify([Number(cue.start), Number(cue.end), cleanCueText(cue.text)]) + '\n');
  return hash.digest('hex').slice(0, 20);
}

function manifestFingerprint(body) {
  // DASH SegmentTimeline belgenin ortasında aynı uzunlukta değişebilir; baş/son
  // örneklemesi bu yenilemeyi kaçırır. Tam gövde hash'i bu sessiz kaçırmayı önler.
  return crypto.createHash('sha256').update(String(body || '')).digest('hex');
}

function formatSrtTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(total / 3600000))}:${pad(Math.floor((total % 3600000) / 60000))}:`
    + `${pad(Math.floor((total % 60000) / 1000))},${pad(total % 1000, 3)}`;
}

function cuesToSrt(cues) {
  return normalizeCues(cues).map((cue, index) => `${index + 1}\r\n${formatSrtTime(cue.start)} --> `
    + `${formatSrtTime(cue.end)}\r\n${cue.text.replace(/\r?\n[ \t]*\r?\n+/g, '\n')}\r\n`).join('\r\n');
}

function cuesToVtt(cues) {
  const stamp = (seconds) => formatSrtTime(seconds).replace(',', '.');
  const body = normalizeCues(cues).map((cue) => `${stamp(cue.start)} --> ${stamp(cue.end)}\r\n`
    + `${cue.text.replace(/\r?\n[ \t]*\r?\n+/g, '\n')}\r\n`).join('\r\n');
  return `WEBVTT\r\n\r\n${body}`;
}

function browserNavigationCapabilities(webContents) {
  const history = webContents && webContents.navigationHistory;
  const readCapability = (name) => {
    try {
      if (history && typeof history[name] === 'function') return Boolean(history[name]());
      if (webContents && typeof webContents[name] === 'function') return Boolean(webContents[name]());
    } catch (_) {}
    return false;
  };
  return {
    canGoBack: readCapability('canGoBack'),
    canGoForward: readCapability('canGoForward'),
  };
}

module.exports = {
  browserNavigationCapabilities,
  cleanCueText,
  cueFingerprint,
  cuesToSrt,
  cuesToVtt,
  isLikelySubtitleResponse,
  manifestFingerprint,
  normalizeCues,
  parseSubtitlePayload,
  parseTime,
  parseAss,
  parseHlsSubtitleTracks,
  parseHlsSegmentUris,
  parseHlsSegments,
  isHlsSubtitlePlaylist,
  parseDashSubtitleTracks,
  parseDashSubtitleMatchers,
  matchDashSubtitleUrl,
  dashSegmentOffset,
  cuesUseLocalSegmentTimeline,
  browserActiveCuesAt,
  findSubtitleUrls,
  parseLrc,
  parseSami,
  parseMp4WebVtt,
  parseMp4SampleDefaults,
  parseMp4Timescale,
  parseTimedBlocks,
  decodeSubtitleBuffer,
  subtitleLanguage,
};
