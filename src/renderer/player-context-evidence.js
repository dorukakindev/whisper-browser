/* Seçili ifade için SINIRLI, DONMUŞ açıklama kanıtı.  UYGULAMA_PLANI §8.3.
   'watched' alanı tarihsel addır: UI etiketi "Bu konuma kadar"; gerçek izleme geçmişi iddiası değildir.
   Eşik, isteğin yakalandığı snapshot.time değeridir. Panel doğrudan fetch yapmaz; servis bu zarfı tüketir. */
(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require('./player-transcript-model.js') : root.PlayerTranscriptModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerContextEvidence = api;
})(globalThis, (Transcript) => {
  'use strict';

  const MAX_TOTAL_CHARS = 6000;      // seçili cue'lar + uygun ikincil metin (UTF-16 kod birimi)
  const MAX_SELECTED_CHARS = 3000;
  const MAX_WHOLE_CHARS = 60000;     // 'whole' açık kapsamı için ayrı, açıkça sınırlı bütçe
  const NEIGHBOURS = 2;
  const EPS = 1e-9;
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const fail = (code, message) => ({ ok: false, code, message });

  function findTrack(tracks, ref) {
    if (!ref) return { track: null, stale: false };
    const same = (Array.isArray(tracks) ? tracks : []).filter((t) => t && t.id === ref.id);
    if (!same.length) return { track: null, stale: true };
    const hit = same.find((t) => t.revision === ref.revision);
    return hit ? { track: hit, stale: false } : { track: null, stale: true };
  }

  /**
   * captureSelectionEvidence → { ok:true, envelope } | { ok:false, code, message }.
   * Hiçbir yerde sessiz kesme (ellipsis) yok: sığmıyorsa açık ret döner.
   */
  function captureSelectionEvidence({ snapshot, selection, scope = 'watched', tracks, now }) {
    if (!snapshot || !snapshot.sourceTrack) return fail('missing-source', 'Kaynak altyazı izi yok.');
    const src = findTrack(tracks, snapshot.sourceTrack);
    if (!src.track) return fail(src.stale ? 'stale-track' : 'missing-source', 'Kaynak altyazı izi değişti veya bulunamadı.');
    const sec = snapshot.secondaryTrack ? findTrack(tracks, snapshot.secondaryTrack) : { track: null, stale: false };
    if (snapshot.secondaryTrack && sec.stale) return fail('stale-track', 'İkincil altyazı izi değişti.');
    if (!['watched', 'selection', 'whole'].includes(scope)) return fail('requires-scope-change', 'Kapsam geçersiz.');

    const sourceTrack = src.track; const secondaryTrack = sec.track;
    const off = Number.isFinite(sourceTrack.offsetSeconds) ? sourceTrack.offsetSeconds : 0;
    const cues = sourceTrack.cues || [];
    const index = new Map(cues.map((c, i) => [c.id, i]));
    const selectedIds = Array.from(new Set(selection && Array.isArray(selection.cueIds) ? selection.cueIds : []));
    const selectedText = String(selection && selection.text != null ? selection.text : '');
    if (scope !== 'whole' && !selectedIds.length) return fail('missing-source', 'Seçim bir altyazı satırına bağlı değil.');
    if (selectedIds.some((id) => !index.has(id))) return fail('missing-source', 'Seçili satır bu izde yok.');
    if (selectedText.length > MAX_SELECTED_CHARS) return fail('selection-too-large', `Seçili metin ${MAX_SELECTED_CHARS} karakteri aşıyor; kapsamı daraltın.`);
    if (scope !== 'whole') {
      const haystack = norm(selectedIds.map((id) => cues[index.get(id)].text).join(' '));
      if (!norm(selectedText) || !haystack.includes(norm(selectedText))) return fail('missing-source', 'Seçili metin videonun altyazısında doğrulanamadı.');
    }

    const time = Number.isFinite(snapshot.time) ? snapshot.time : 0;
    const mediaEnd = (cue) => cue.end + off;
    const inScope = (cue) => scope !== 'watched' || mediaEnd(cue) <= time + EPS;

    const baseIds = scope === 'whole' ? cues.map((c) => c.id) : selectedIds.slice().sort((a, b) => index.get(a) - index.get(b));
    if (scope === 'watched' && baseIds.some((id) => !inScope(cues[index.get(id)]))) {
      return fail('requires-scope-change', 'Seçili satır kısmen veya tamamen bu konumun ilerisinde. "Seçili aralık" kapsamını açıkça seçin.');
    }

    const rows = Transcript.buildTranscriptRows({ sourceTrack, secondaryTrack, mediaKey: snapshot.mediaKey, generation: snapshot.generation });
    const rowOf = new Map(rows.map((r) => [r.cueId, r]));
    const limitations = ['transcript-only'];
    const secondaryFor = (cue) => {
      const row = rowOf.get(cue.id);
      if (!secondaryTrack || !row) return '';
      if (row.pairing === 'uncertain') { limitations.push('secondary-uncertain:' + cue.id); return ''; }
      if (row.pairing === 'missing') return '';
      if (scope === 'watched' && row.secondaryCandidates.some((c) => c.videoEnd > time + EPS)) { limitations.push('secondary-beyond-scope:' + cue.id); return ''; }
      return row.secondaryText;
    };
    const entry = (cue) => ({
      cueId: cue.id, source: cue.text, secondary: secondaryFor(cue), videoStart: cue.start + off, videoEnd: cue.end + off,
    });

    const limit = scope === 'whole' ? MAX_WHOLE_CHARS : MAX_TOTAL_CHARS;
    const cost = (e) => e.source.length + e.secondary.length;
    const chosen = new Map();
    let total = 0;
    for (const id of baseIds) { const e = entry(cues[index.get(id)]); chosen.set(id, e); total += cost(e); }
    if (total > limit) return fail('selection-too-large', `Bağlam ${limit} karakteri aşıyor; kapsamı daraltın.`);

    if (scope !== 'whole') {
      // Mesafe sırası: önce en yakın önceki, sonra en yakın sonraki; yalnız tam cue ve kapsama uygunsa.
      const first = index.get(baseIds[0]); const last = index.get(baseIds[baseIds.length - 1]);
      const order = [];
      for (let d = 1; d <= NEIGHBOURS; d++) { order.push(first - d); order.push(last + d); }
      for (const at of order) {
        if (at < 0 || at >= cues.length) continue;
        const cue = cues[at];
        if (chosen.has(cue.id) || !inScope(cue)) continue;
        const e = entry(cue);
        if (total + cost(e) <= limit) { chosen.set(cue.id, e); total += cost(e); }
      }
    }
    const evidence = Array.from(chosen.values()).sort((a, b) => index.get(a.cueId) - index.get(b.cueId));
    if (!evidence.length) return fail('missing-source', 'Kanıt oluşturulacak satır yok.');
    const uniqLimits = Array.from(new Set(limitations));
    return {
      ok: true,
      envelope: {
        schema: 'player-evidence-v1', mediaKey: snapshot.mediaKey, generation: snapshot.generation,
        title: String(snapshot.title || ''), capturedAt: new Date(typeof now === 'number' ? now : Date.now()).toISOString(),
        sourceTrackId: sourceTrack.id, sourceRevision: sourceTrack.revision,
        secondaryTrackId: secondaryTrack ? secondaryTrack.id : null, secondaryRevision: secondaryTrack ? secondaryTrack.revision : null,
        scope, scopeEnd: scope === 'watched' ? time : null, selectedText: scope === 'whole' ? '' : selectedText,
        cueIds: evidence.map((e) => e.cueId),
        range: { start: Math.min(...evidence.map((e) => e.videoStart)), end: Math.max(...evidence.map((e) => e.videoEnd)) },
        evidence, limitations: uniqLimits,
      },
    };
  }

  /** Yanıttaki zaman bağlantısı yalnız aynı medya+nesil için seek olur; farklı medyada açma teklif edilir. */
  function resolveTimeLink({ envelope, current }) {
    if (!envelope || !current) return { action: 'none' };
    if (envelope.mediaKey === current.mediaKey && envelope.generation === current.generation) return { action: 'seek' };
    if (envelope.mediaKey === current.mediaKey) return { action: 'offer-open', reason: 'generation-changed' };
    return { action: 'offer-open', reason: 'different-media' };
  }

  return Object.freeze({ captureSelectionEvidence, resolveTimeLink, MAX_TOTAL_CHARS, MAX_SELECTED_CHARS, MAX_WHOLE_CHARS });
});
