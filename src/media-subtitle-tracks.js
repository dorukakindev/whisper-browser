const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'ttml', 'dfxp']);
const BITMAP_SUBTITLE_CODECS = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub']);

function buildSubtitleProbeArgs(filePath) {
  return [
    '-v', 'error',
    '-select_streams', 's',
    '-show_entries', 'stream=index,codec_name:stream_tags=language,title:stream_disposition=default,forced,hearing_impaired',
    '-of', 'json',
    filePath,
  ];
}

function parseSubtitleStreams(rawProbe) {
  let parsed = rawProbe;
  if (typeof rawProbe === 'string') {
    try { parsed = JSON.parse(rawProbe); } catch (_) { return []; }
  }
  const streams = parsed && Array.isArray(parsed.streams)
    ? parsed.streams.filter((stream) => stream && typeof stream === 'object'
        && (!stream.codec_type || stream.codec_type === 'subtitle')) : [];
  return streams.map((stream, subtitleIndex) => {
    const tags = stream.tags || {};
    const disposition = stream.disposition || {};
    const codec = String(stream.codec_name || '').toLowerCase();
    const textBased = TEXT_SUBTITLE_CODECS.has(codec);
    const bitmap = BITMAP_SUBTITLE_CODECS.has(codec);
    // `-map 0:N` mutlak akış indeksi ister; indeks alanı bozuk/eksikse
    // altyazı-göreli sıraya düşmek başka bir izi (çoğu zaman video/ses
    // akışını) haritalar — o iz listede kalır ama çıkarılamaz. Yalnız
    // gerçek sayı veya boş-olmayan sayısal dizgi kabul; Number(null)=0 ve
    // Number([])=0 tuzakları nesne/bool/null'da mutlak 0'a koerce olmasın.
    const rawIndex = typeof stream.index === 'number' ? stream.index
      : (typeof stream.index === 'string' && stream.index.trim() !== '' ? Number(stream.index) : NaN);
    const streamIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
    return {
      streamIndex,
      subtitleIndex,
      codec,
      language: String(tags.language || tags.LANGUAGE || '').toLowerCase(),
      title: String(tags.title || tags.TITLE || ''),
      default: !!Number(disposition.default),
      forced: !!Number(disposition.forced),
      hearingImpaired: !!Number(disposition.hearing_impaired),
      textBased,
      bitmap,
      extractable: textBased && streamIndex !== null,
      requiresOcr: bitmap,
    };
  });
}

function subtitleOutputExtension(track) {
  return track && ['ass', 'ssa'].includes(track.codec) ? '.ass' : '.srt';
}

function buildSubtitleExtractionArgs(inputPath, track, outputPath) {
  if (!track || !track.textBased || !Number.isInteger(track.streamIndex)
      || track.streamIndex < 0) return null;
  const codec = ['ass', 'ssa'].includes(track.codec) ? 'ass' : 'srt';
  return [
    '-y', '-v', 'error',
    '-i', inputPath,
    '-map', `0:${Number(track.streamIndex)}`,
    '-c:s', codec,
    outputPath,
  ];
}

function subtitleTrackLabel(track) {
  const parts = [];
  if (track.language) parts.push(track.language.toUpperCase());
  if (track.title) parts.push(track.title);
  if (track.forced) parts.push('Zorunlu');
  if (track.hearingImpaired) parts.push('SDH');
  if (track.bitmap) parts.push('Görüntü altyazısı');
  return parts.join(' · ') || `Altyazı ${Number(track.subtitleIndex) + 1}`;
}

module.exports = {
  BITMAP_SUBTITLE_CODECS,
  TEXT_SUBTITLE_CODECS,
  buildSubtitleExtractionArgs,
  buildSubtitleProbeArgs,
  parseSubtitleStreams,
  subtitleOutputExtension,
  subtitleTrackLabel,
};
