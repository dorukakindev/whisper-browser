/* Oynatıcı transkript görünüm modeli — parser değil, saf eşleme.
   UYGULAMA_PLANI §8.1/§8.2: kaynak rolü çözümü ve 1:N çeviri eşlemesi.
   Zaman birimi saniye. Pozitif offset altyazıyı geciktirir: medya zamanı = cue zamanı + offset.
   Mevcut translationsForCues tek en iyi metni seçer; bu model ona dokunmaz (legacy overlay korunur). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerTranscriptModel = api;
})(globalThis, () => {
  'use strict';

  const OVERLAP_CAP_SECONDS = 0.4;
  const OVERLAP_FRACTION = 0.25;
  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const cuesOf = (track) => (track && Array.isArray(track.cues) ? track.cues : []);
  const offsetOf = (track) => num(track && track.offsetSeconds, 0);

  /** Çakışmasız satır anahtarı: JSON dizisi, ayraç çakışması olamaz. */
  function rowKey(mediaKey, trackId, revision, cueId) {
    return JSON.stringify([String(mediaKey), String(trackId), String(revision), String(cueId)]);
  }

  function activeCueIdAt(track, mediaTime) {
    const off = offsetOf(track);
    let hit = null;
    for (const cue of cuesOf(track)) {
      const s = cue.start + off; const e = cue.end + off;
      if (s <= mediaTime && mediaTime < e && (!hit || s >= hit.s)) hit = { s, id: cue.id };
    }
    return hit ? hit.id : null;
  }

  /** Neden çözülemediğini de söyler: 'ok' | 'none' | 'ambiguous'. */
  function explainSourceRole({ primary, secondary, mediaTime }) {
    const p = primary && primary.role === 'source' ? primary : null;
    const s = secondary && secondary.role === 'source' ? secondary : null;
    if (p && s) return { reason: 'ambiguous', resolution: null };
    const track = p || s;
    if (!track) return { reason: 'none', resolution: null };
    return {
      reason: 'ok',
      resolution: {
        trackId: track.id, trackRevision: track.revision, channel: p ? 0 : 1,
        offsetSeconds: offsetOf(track), cues: cuesOf(track), activeCueId: activeCueIdAt(track, num(mediaTime)),
      },
    };
  }
  /** Yalnız role='source' izi döndürür; çeviri metni kaynak sanılmaz; iki kaynak varsa null. */
  function resolveSourceRole(input) { return explainSourceRole(input || {}).resolution; }

  function mediaSpan(cue, off) { return { start: cue.start + off, end: cue.end + off }; }
  const overlapOf = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const acceptedOverlap = (ov, aDur, bDur) => ov > Math.min(OVERLAP_CAP_SECONDS, Math.min(aDur, bDur) * OVERLAP_FRACTION);

  function originLinkIndex(secondaryTrack, sourceTrack) {
    const links = Array.isArray(secondaryTrack && secondaryTrack.sourceLinks) ? secondaryTrack.sourceLinks : [];
    const index = new Map();
    for (const link of links) {
      if (!link || link.sourceTrackId !== sourceTrack.id || link.sourceRevision !== sourceTrack.revision) continue;
      const sourceIds = link.sourceCueIds;
      if (!Array.isArray(sourceIds)) continue;
      for (const sourceId of sourceIds) {
        let ids = index.get(sourceId);
        if (!ids) index.set(sourceId, ids = new Set());
        // Set order retains first link order; duplicate cue IDs are still resolved by secById.
        ids.add(link.cueId);
      }
    }
    return index;
  }

  /**
   * buildTranscriptRows → TranscriptRow[]; kaynak satır başına bir satır.
   * origin-linked → time-overlap → uncertain (aday listesi) → missing.
   */
  function buildTranscriptRows({ sourceTrack, secondaryTrack, mediaKey, generation }) {
    const src = cuesOf(sourceTrack);
    if (!sourceTrack || !src.length) return [];
    const srcOff = offsetOf(sourceTrack);
    const secOff = offsetOf(secondaryTrack);
    const sec = cuesOf(secondaryTrack).map((cue, order) => ({ cue, order, span: mediaSpan(cue, secOff) }))
      .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end || a.order - b.order);
    const secById = new Map(sec.map((x) => [x.cue.id, x]));
    const linkedBySource = originLinkIndex(secondaryTrack, sourceTrack);
    const prefixEnd=[];for(const x of sec)prefixEnd.push(Math.max(prefixEnd.at(-1)??-Infinity,x.span.end));

    return src.map((cue) => {
      const span = mediaSpan(cue, srcOff);
      const linkedIds = linkedBySource.get(cue.id);
      let matches = []; let pairing = 'missing';

      if (linkedIds?.size) {
        matches = Array.from(linkedIds).map((id) => secById.get(id)).filter(Boolean);
        if (matches.length) pairing = 'origin-linked';
      }
      if (!matches.length && sec.length) {
        let lo=0,hi=sec.length;while(lo<hi){const mid=(lo+hi)>>>1;if(prefixEnd[mid]<=span.start)lo=mid+1;else hi=mid;}
        for (let i = lo; i < sec.length; i++) {
          const cand = sec[i];
          if (cand.span.start >= span.end) break;
          const ov = overlapOf(span, cand.span);
          if (ov > 0 && acceptedOverlap(ov, span.end - span.start, cand.span.end - cand.span.start)) matches.push(cand);
        }
        if (matches.length) {
          const overlapping = matches.some((a, i) => matches.some((b, j) => j > i && overlapOf(a.span, b.span) > 0));
          pairing = overlapping ? 'uncertain' : 'time-overlap';
        }
      }
      const candidates = matches.map((m) => ({ cueId: m.cue.id, text: m.cue.text, videoStart: m.span.start, videoEnd: m.span.end }));
      const certain = pairing === 'origin-linked' || pairing === 'time-overlap';
      return {
        mediaKey: String(mediaKey), generation,
        key: rowKey(mediaKey, sourceTrack.id, sourceTrack.revision, cue.id),
        cueId: cue.id, trackId: sourceTrack.id, trackRevision: sourceTrack.revision,
        start: cue.start, end: cue.end, videoStart: span.start, videoEnd: span.end,
        sourceText: cue.text,
        secondaryCueIds: certain ? matches.map((m) => m.cue.id) : [],
        secondaryText: certain ? matches.map((m) => m.cue.text).join('\n') : '',
        secondaryCandidates: candidates,
        pairing,
        wordTiming: Array.isArray(cue.words) && cue.words.length > 0,
      };
    });
  }

  /** Medya zamanındaki etkin satırın indeksi (-1 yok). Son başlayan kazanır. */
  function activeRowIndex(rows, mediaTime) {
    let at = -1;
    rows.forEach((row, i) => { if (row.videoStart <= mediaTime && mediaTime < row.videoEnd && (at < 0 || row.videoStart >= rows[at].videoStart)) at = i; });
    return at;
  }
  /** Cümleye atlamanın hedef zamanı: cümlenin 10 ms içi (kısa cümlede yarısı). Medya öğeleri hedefin biraz gerisine
   *  oturabildiği için tam başlangıca atlamak vurguyu önceki satıra düşürür; her atlama yolu bu hesabı paylaşır. */
  const LANDING_SECONDS = 0.01;
  function landingTime(start, end, offsetSeconds = 0) {
    const s = num(start) + num(offsetSeconds); const e = typeof end === 'number' && Number.isFinite(end) ? end + num(offsetSeconds) : NaN;
    const room = Number.isFinite(e) && e > s ? (e - s) / 2 : LANDING_SECONDS;
    return Math.max(0, s + Math.min(LANDING_SECONDS, room));
  }
  /** Seçili cue kimliklerinden en yakın satır (arama/aktif satıra dön için). */
  function rowIndexByCueId(rows, cueId) { return rows.findIndex((r) => r.cueId === cueId); }
  /** Filtre dışı aktif satırda filtre silinmez; yalnız "aktif satıra dön" eylemi bilgisi. */
  function activeRowVisibility(rows, visibleKeys, mediaTime) {
    const at = activeRowIndex(rows, mediaTime);
    if (at < 0) return { index: -1, visible: false };
    return { index: at, visible: visibleKeys instanceof Set ? visibleKeys.has(rows[at].key) : true };
  }

  function chooseCandidate(rows,key,candidateId,owner){
    const row=rows.find(r=>r.key===key);if(!row||row.pairing!=='uncertain'||row.mediaKey!==owner.mediaKey||row.generation!==owner.generation||row.trackRevision!==owner.trackRevision)throw Error('Pairing source changed / Eşleşme kaynağı değişti.');
    const candidate=row.secondaryCandidates.find(c=>c.cueId===candidateId);if(!candidate)throw Error('Candidate unavailable / Aday yok.');
    return rows.map(r=>r!==row?r:{...r,pairing:'human-selected',secondaryText:candidate.text,secondaryCueIds:[candidate.cueId],humanSelection:true});
  }
  // Reuse the existing timing scan and pairing result; filtering never repairs a match.
  function reviewKinds(rows, timingIssues = [], hasSecondary = false) {
    const kinds = rows.map(row => new Set([
      ...(row.pairing === 'uncertain' ? ['uncertain'] : []),
      ...(hasSecondary && row.pairing !== 'uncertain' && !String(row.secondaryText || '').trim() ? ['missing'] : []),
    ]));
    for (const issue of timingIssues) if (kinds[issue.i]) kinds[issue.i].add(issue.kind);
    return kinds;
  }

  return Object.freeze({
    rowKey, resolveSourceRole, explainSourceRole, buildTranscriptRows, activeRowIndex, rowIndexByCueId, activeRowVisibility,
    activeCueIdAt, landingTime, LANDING_SECONDS, OVERLAP_CAP_SECONDS, OVERLAP_FRACTION, reviewKinds, chooseCandidate,
  });
});
