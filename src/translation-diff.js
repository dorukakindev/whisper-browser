// "Tamamını yeni modelle çevir" sonrası eski/yeni çeviri farkı. DOM'suz ve saf:
// cue'lar zaman örtüşmesiyle eşlenir (blok sayısı çeviride değişmez ama dosya
// yeniden yüklenince sıra/indeks güvenilir kimlik değildir).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TranslationDiff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normalize = (text) => String(text || '').replace(/<[^>]+>|\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

  function matchBefore(before, cue) {
    let best = null;
    let bestOverlap = 0;
    for (const item of before) {
      if (item.start >= cue.end) break;
      const overlap = Math.min(cue.end, item.end) - Math.max(cue.start, item.start);
      if (overlap > bestOverlap) { bestOverlap = overlap; best = item; }
    }
    return bestOverlap > Math.min(0.4, (cue.end - cue.start) * 0.25) ? best : null;
  }

  function diffTranslationCues(beforeCues, afterCues, { limit = 2000 } = {}) {
    const before = (Array.isArray(beforeCues) ? beforeCues : []).slice().sort((a, b) => a.start - b.start);
    const changes = [];
    (Array.isArray(afterCues) ? afterCues : []).forEach((cue, index) => {
      if (changes.length >= limit) return;
      const previous = matchBefore(before, cue);
      if (!previous) return;
      if (normalize(previous.text) === normalize(cue.text)) return;
      changes.push({ index, start: cue.start, end: cue.end, before: previous.text, after: cue.text });
    });
    return changes;
  }

  // Seçilen değişiklikleri eski metne döndürülmüş YENİ cue listesi (kaynak değişmez).
  function revertChanges(afterCues, changes, selectedIndexes) {
    const selected = new Set(selectedIndexes);
    const byIndex = new Map(changes.filter((change) => selected.has(change.index)).map((change) => [change.index, change.before]));
    return (Array.isArray(afterCues) ? afterCues : []).map((cue, index) => (byIndex.has(index) ? { ...cue, text: byIndex.get(index) } : cue));
  }

  return { diffTranslationCues, revertChanges };
});
