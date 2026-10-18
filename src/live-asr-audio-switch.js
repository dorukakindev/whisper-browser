'use strict';
// Kuyruk-50 madde 24 — canlı Whisper'da ses parçası/dil değişimi takibi.
//
// live_asr.py otomatik dil modunda parça başına Whisper'ın gözlediği dili
// (info.language) raporlar. Kaynak ses dili değiştiğinde (ör. filmde ses parçası
// ya da program değişimi) yeni dilin cue'larının eski dilin izine katılmaması
// gerekir; tek seferlik yanlış algı (suskun/gürültülü parça) izi bölememeli.
// observe(): aynı yeni dil ardışık `minConsecutive` parçada görülünce
// 'switch' döner ve streamSeq artar — yeni cue'lar yeni streamKey'le ayrı izde
// saklanır; geç gelen eski-parça satırları yeni izin bağlamını kirletemez.
const normalizeLanguage = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z-]/g, '');

function createLiveAsrAudioSwitch(minConsecutive = 2) {
  const state = { observedLanguage: '', pendingLanguage: '', pendingCount: 0, streamSeq: 1 };
  let lastChunk = null;
  let lastResult = null;
  const recent = new Map();
  function observe(rawLanguage, chunkKey) {
    if (chunkKey != null && recent.has(chunkKey)) return { ...recent.get(chunkKey), action: 'stable' };
    if (chunkKey != null && chunkKey === lastChunk && lastResult) {
      return { ...lastResult, action: 'stable' };
    }
    const result = observeLanguage(rawLanguage);
    lastChunk = chunkKey;
    lastResult = result;
    if (chunkKey != null) {
      recent.set(chunkKey, result);
      if (recent.size > 64) recent.delete(recent.keys().next().value);
    }
    return result;
  }
  function observeLanguage(rawLanguage) {
    const seen = normalizeLanguage(rawLanguage);
    if (!seen) return { action: 'stable', language: state.observedLanguage, streamSeq: state.streamSeq };
    if (!state.observedLanguage) {
      state.observedLanguage = seen;
      return { action: 'stable', language: seen, streamSeq: state.streamSeq };
    }
    if (seen === state.observedLanguage) {
      state.pendingLanguage = '';
      state.pendingCount = 0;
      return { action: 'stable', language: seen, streamSeq: state.streamSeq };
    }
    if (seen === state.pendingLanguage) state.pendingCount += 1;
    else { state.pendingLanguage = seen; state.pendingCount = 1; }
    if (state.pendingCount < minConsecutive) {
      return { action: 'pending', language: seen, streamSeq: state.streamSeq };
    }
    state.observedLanguage = seen;
    state.pendingLanguage = '';
    state.pendingCount = 0;
    state.streamSeq += 1;
    return { action: 'switch', language: seen, streamSeq: state.streamSeq };
  }
  return { observe, snapshot: () => ({ ...state }) };
}

module.exports = { createLiveAsrAudioSwitch };
