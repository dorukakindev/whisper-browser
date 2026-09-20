(function exposePlaybackPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WhisperPlaybackPolicy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PLAYBACK_POLICIES = Object.freeze({
    normal: { id: 'normal', label: 'Normal' },
    accelerateGaps: { id: 'accelerate-gaps', label: 'Altyazısız bölümü hızlandır' },
    skipGaps: { id: 'skip-gaps', label: 'Altyazısız bölümü atla' },
    shadowing: { id: 'shadowing', label: 'Dinle ve tekrar et' },
    loopCue: { id: 'loop-cue', label: 'Her altyazıyı tekrarla' },
  });

  function normalizeCueList(raw) {
    return (Array.isArray(raw) ? raw : []).map((cue, index) => ({
      id: String(cue && (cue.id ?? index)), start: Math.max(0, Number(cue && cue.start) || 0),
      end: Math.max(0, Number(cue && cue.end) || 0), text: String(cue && cue.text || '').trim(),
    })).filter((cue) => cue.text && cue.end > cue.start).sort((a, b) => a.start - b.start);
  }

  function playbackLearningAction(rawCues, time, previousTime, policy = 'normal', options = {}) {
    const cues = normalizeCueList(rawCues);
    const currentTime = Math.max(0, Number(time) || 0);
    const previous = Number(previousTime);
    const baseRate = Math.max(0.25, Math.min(4, Number(options.baseRate) || 1));
    const gapRate = Math.max(baseRate, Math.min(4, Number(options.gapRate) || 2));
    const minGap = Math.max(0.5, Number(options.minGap) || 2);
    const lead = Math.max(0, Math.min(1, Number(options.lead) || 0.15));
    const active = cues.find((cue) => currentTime >= cue.start && currentTime < cue.end);
    const next = cues.find((cue) => cue.start > currentTime);
    // Büyük zaman sıçraması kullanıcı seek'idir; cue sonunu doğal oynatmayla
    // geçti sanıp kullanıcıyı istemsiz duraklatma. Sınır 1.5 sn: tarayıcı
    // medya ölçümü 1000 ms aralıkla çalışır ve tam sınırda uyanan tick
    // delta≈1.0 üretip doğal ilerlemeyi yanlışlıkla seek sayıyordu (B83-04).
    const naturalAdvance = Number.isFinite(previous) && currentTime >= previous && currentTime - previous < 1.5;
    if (policy === PLAYBACK_POLICIES.loopCue.id && naturalAdvance) {
      const ended = cues.find((cue) => previous >= cue.start && previous < cue.end
        && currentTime >= cue.end && currentTime - cue.end < 1.5);
      if (ended) {
        const continuingOverlap = cues.some((cue) => cue.id !== ended.id
          && currentTime >= cue.start && currentTime < cue.end && cue.start < ended.end);
        if (!continuingOverlap) {
          const repeatCount = Math.max(2, Math.min(20, Math.round(Number(options.repeatCount) || 5)));
          const sameCue = String(options.loopCueId || '') === ended.id;
          const completedRepeats = sameCue ? Math.max(0, Number(options.completedRepeats) || 0) : 0;
          if (completedRepeats < repeatCount - 1) return {
            type: 'loop-cue', cueId: ended.id, time: ended.start,
            completedRepeats: completedRepeats + 1, repeatCount,
          };
          return { type: 'loop-cue-finished', cueId: ended.id, repeatCount };
        }
      }
    }
    if (options.autoPause && naturalAdvance) {
      const ended = cues.find((cue) => previous >= cue.start && previous < cue.end
        && currentTime >= cue.end && currentTime - cue.end < 1.5);
      if (ended) {
        // İki konuşmacının cue'ları örtüşüyorsa ilki bitti diye devam eden
        // konuşmanın ortasında durma. Tam sınırda başlayan bir sonraki cue ise
        // yeni bloktur ve kullanıcı devam ettirene kadar bekletilir.
        const continuingOverlap = cues.some((cue) => cue.id !== ended.id
          && currentTime >= cue.start && currentTime < cue.end && cue.start < ended.end);
        if (!continuingOverlap) return { type: 'pause-at-cue-end', cueId: ended.id };
      }
    }
    if (policy === PLAYBACK_POLICIES.shadowing.id && naturalAdvance && !active) {
      const ended = cues.find((cue) => previous < cue.end && currentTime >= cue.end && currentTime - cue.end < 1.5);
      if (ended && String(options.lastShadowCueId || '') !== ended.id) {
        const duration = Math.max(0.5, ended.end - ended.start);
        return { type: 'pause-for-shadowing', cueId: ended.id,
          durationMs: Math.round(Math.max(1000, Math.min(8000, duration * 1000 * (Number(options.shadowingFactor) || 1.2)))) };
      }
    }
    if (active) return { type: 'set-rate', rate: baseRate, cueId: active.id };
    if (!next || next.start - currentTime < minGap) return { type: 'set-rate', rate: baseRate };
    if (policy === PLAYBACK_POLICIES.accelerateGaps.id) return { type: 'set-rate', rate: gapRate, until: next.start };
    if (policy === PLAYBACK_POLICIES.skipGaps.id) return { type: 'seek', time: Math.max(currentTime, next.start - lead) };
    return { type: 'set-rate', rate: baseRate };
  }

  return { PLAYBACK_POLICIES, playbackLearningAction };
}));
