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

  // --- Kelime düzeyi iç-diff: "değişen anlamı göster" için satır içinde
  // neyin değiştiğini işaretler. Cue metinleri küçük; O(n·m) LCS yeterli,
  // aşırı uzun satırda bütün metin tek blok döner.
  const tokenize = (text) => normalize(text).split(' ').filter(Boolean);

  function wordParts(beforeText, afterText) {
    const a = tokenize(beforeText);
    const b = tokenize(afterText);
    if (!a.length || !b.length || a.length * b.length > 20000) {
      return { before: [{ text: String(beforeText || ''), kind: 'del' }],
               after: [{ text: String(afterText || ''), kind: 'add' }] };
    }
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const before = [];
    const after = [];
    const push = (list, text, kind) => {
      const last = list[list.length - 1];
      if (last && last.kind === kind) last.text += ' ' + text;
      else list.push({ text, kind });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { push(before, a[i], 'same'); push(after, b[j], 'same'); i += 1; j += 1; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { push(before, a[i], 'del'); i += 1; }
      else { push(after, b[j], 'add'); j += 1; }
    }
    while (i < a.length) { push(before, a[i], 'del'); i += 1; }
    while (j < b.length) { push(after, b[j], 'add'); j += 1; }
    return { before, after };
  }

  // Özel-ad benzeri belirteç: cümle ortasında büyük harfli ya da sayı/taç
  // içeren token; eski sürümde olup yenisinde aynen geçmeyenleri "terim"
  // uyarısı olarak döndürür (yalnız görünürlük — otomatik düzeltme yok).
  const TERM_TOKEN = /^[\p{Lu}][\p{L}\p{Nd}'’\-.]*$/u;
  function changedTerms(beforeText, afterText) {
    const afterFold = normalize(afterText).toLocaleLowerCase('tr');
    const terms = [];
    for (const token of tokenize(beforeText)) {
      if (!TERM_TOKEN.test(token) || token.length < 2) continue;
      if (!afterFold.includes(token.toLocaleLowerCase('tr')) && !terms.includes(token)) terms.push(token);
    }
    return terms.slice(0, 8);
  }

  // Tam inceleme modeli: değişen + eksik (yalnız eski) + yeni (yalnız yeni).
  // Eksik satır görünmezse kullanıcı çeviride kaybolan repliği asla görmez.
  function fullTranslationDiff(beforeCues, afterCues, { limit = 2000 } = {}) {
    const before = (Array.isArray(beforeCues) ? beforeCues : []).slice().sort((a, b) => a.start - b.start);
    const after = Array.isArray(afterCues) ? afterCues : [];
    const changed = [];
    const added = [];
    const used = new Set();
    after.forEach((cue, index) => {
      const previous = matchBefore(before, cue);
      if (!previous) { added.push({ index, start: cue.start, end: cue.end, text: cue.text }); return; }
      used.add(previous);
      if (normalize(previous.text) === normalize(cue.text)) return;
      if (changed.length < limit) {
        changed.push({ index, start: cue.start, end: cue.end,
                       before: previous.text, after: cue.text,
                       parts: wordParts(previous.text, cue.text),
                       terms: changedTerms(previous.text, cue.text) });
      }
    });
    const missing = before.filter((cue) => !used.has(cue))
      .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text, cue }));
    return { changed, missing, added };
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

  // İnceleme penceresi açıkken altyazı yeniden yüklenmiş veya düzenlenmiş olabilir.
  // Yalnız yolun aynı kalması, satırın hâlâ incelenen sürüm olduğunu kanıtlamaz.
  function selectedChangesStillMatch(currentCues, changes, selectedIndexes) {
    const cues = Array.isArray(currentCues) ? currentCues : [];
    const byIndex = new Map((Array.isArray(changes) ? changes : []).map((change) => [change.index, change]));
    return Array.isArray(selectedIndexes) && selectedIndexes.length > 0
      && selectedIndexes.every((index) => {
        const cue = cues[index];
        const change = byIndex.get(index);
        return Boolean(cue && change && cue.start === change.start && cue.end === change.end
          && cue.text === change.after);
      });
  }

  // İnceleme seçimlerini uygular: değişen satır → eski metin, yeni satır →
  // sil, eksik satır → eski cue zaman sırasına geri eklenir.
  function applyReviewChoice(afterCues, review, selChanged, selMissing, selAdded) {
    const changedSel = new Set(selChanged);
    const missingSel = new Set(selMissing);
    const addedSel = new Set(selAdded);
    const byIndex = new Map((review?.changed || []).filter((change) => changedSel.has(change.index))
      .map((change) => [change.index, change.before]));
    const next = [];
    (Array.isArray(afterCues) ? afterCues : []).forEach((cue, index) => {
      if (addedSel.has(index)) return;
      next.push(byIndex.has(index) ? { ...cue, text: byIndex.get(index) } : cue);
    });
    const restored = (review?.missing || []).filter((item, idx) => missingSel.has(idx))
      .map((item) => ({ ...(item.cue || { start: item.start, end: item.end }), text: item.text }));
    next.push(...restored);
    next.sort((a, b) => a.start - b.start || a.end - b.end);
    return next;
  }

  // Üç seçim sınıfı için güvenlik kontrolü: pencere açıkken iz değiştiyse
  // hiçbir yazım yapılmaz. Eksik satırın yuvası hâlâ boş olmalıdır.
  function reviewStillApplies(currentCues, review, selChanged, selMissing, selAdded) {
    const cues = Array.isArray(currentCues) ? currentCues : [];
    const byIndex = new Map((review?.changed || []).map((change) => [change.index, change]));
    const cueStillNew = (index) => {
      const cue = cues[index];
      const change = byIndex.get(index);
      const added = (review?.added || []).find((item) => item.index === index);
      return Boolean(cue && (change ? cue.start === change.start && cue.end === change.end && cue.text === change.after
        : added ? cue.start === added.start && cue.end === added.end && cue.text === added.text : false));
    };
    const missing = review?.missing || [];
    return (selChanged || []).concat(selAdded || []).every(cueStillNew)
      && (selMissing || []).every((idx) => {
        const item = missing[idx];
        return Boolean(item) && !cues.some((cue) => cue.start === item.start && cue.end === item.end);
      });
  }

  return { diffTranslationCues, fullTranslationDiff, wordParts, changedTerms,
           revertChanges, applyReviewChoice, reviewStillApplies,
           selectedChangesStillMatch };
});
