'use strict';
const { parseSubtitlePayload, parseMp4WebVtt, parseMp4Stpp, dashSegmentOffset, cuesUseLocalSegmentTimeline } = require('./browser-subtitles');
const { decodeSubtitleBuffer } = require('./browser-textutil');

// Yalnız açık SegmentURL girdileri ile süresi manifestten kesin hesaplanabilen
// statik altyazı SegmentTemplate parçaları alınır. Video URL'leri ve
// sınırsız/canlı SegmentTemplate adresleri hiçbir zaman tahmin edilmez.
function segmentKey(segment) {
  return JSON.stringify([segment.segmentUrl, segment.byteRange, dashSegmentOffset(segment)]);
}

async function captureDashSegments(matchers, { fetchBuffer, store, current, completed, coverage, onError }) {
  const groups = new Map();
  for (const matcher of matchers) {
    if (!matcher.segmentUrl) continue;
    if (!groups.has(matcher.streamKey)) groups.set(matcher.streamKey, []);
    groups.get(matcher.streamKey).push(matcher);
  }
  let complete = true;
  for (const [streamKey, segments] of groups) {
    const done = completed.get(streamKey) || new Set();
    completed.set(streamKey, done);
    coverage?.expect?.(streamKey, segments.map((segment) => ({
      start: dashSegmentOffset(segment),
      duration: segment.duration / Math.max(1, segment.timescale || 1),
    })));
    const pending = segments.filter(s => !done.has(segmentKey(s)));
    const cues = [], accepted = []; let bytes = 0;
    for (let i = 0; i < pending.length; i += 6) {
      if (!current()) return false;
      const results = await Promise.all(pending.slice(i, i + 6).map(async segment => {
        try {
          if (segment.initializationFailed) throw Error('DASH başlangıç parçası hazır değil.');
          const buffer = await fetchBuffer(segment.segmentUrl, segment.byteRange);
          if (!current()) return null;
          bytes += buffer.length;
          if (bytes > 64 * 1024 * 1024) throw Error('DASH altyazı indirme sınırı aşıldı.');
          const body = decodeSubtitleBuffer(buffer).text;
          let parsed = parseSubtitlePayload(body, '', segment.segmentUrl).cues;
          if (!parsed.length) parsed = segment.format === 'vtt' ? parseMp4WebVtt(buffer, segment) : parseMp4Stpp(buffer, segment);
          // Sessiz bölümde boş ama geçerli WebVTT segmenti olabilir. Bozuk
          // zaman satırlarını veya HTML hata yanıtlarını boş başarı sayma.
          const emptyVtt = /^\uFEFF?WEBVTT(?:[^\S\r\n][^\r\n]*)?(?:\r?\n|$)/.test(body)
            && !body.includes('-->') && !body.includes('<html');
          if (!parsed.length && !emptyVtt) throw Error('DASH altyazı parçası çözümlenemedi.');
          const start = dashSegmentOffset(segment), duration = segment.duration / Math.max(1, segment.timescale || 1);
          if (start > 0 && cuesUseLocalSegmentTimeline(parsed, duration, start)) parsed = parsed.map(cue => ({ ...cue, start: cue.start + start, end: cue.end + start }));
          return { segment, cues: parsed, start, duration };
        } catch (error) {
          if (!current()) return null;
          onError?.(error);
          coverage?.failure(streamKey, { ...segment, url: segment.segmentUrl,
            start: dashSegmentOffset(segment), duration: segment.duration / Math.max(1, segment.timescale || 1) }, error.message);
          return null;
        }
      }));
      for (const result of results) {
        if (!result) { complete = false; continue; }
        cues.push(...result.cues); accepted.push(result);
      }
      if (bytes > 64 * 1024 * 1024) { complete = false; break; }
    }
    if (!current()) return false;
    if (cues.length && !store(cues, segments[0])) { complete = false; continue; }
    for (const { segment, start, duration } of accepted) {
      done.add(segmentKey(segment)); coverage?.success(streamKey, { start, duration });
    }
    if (segments.some(segment => !done.has(segmentKey(segment)))) complete = false;
  }
  while (completed.size > 64) completed.delete(completed.keys().next().value);
  return complete;
}
module.exports = { captureDashSegments };
