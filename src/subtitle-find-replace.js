(function exposeSubtitleFindReplace(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SubtitleFindReplace = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const WORD = /[\p{L}\p{N}_]/u;

  // watch-index.js ile ayni arama semantigi: NFKC + Turkce case-fold.
  function foldSearchText(value, caseSensitive = false) {
    const normalized = String(value == null ? '' : value).normalize('NFKC');
    return caseSensitive ? normalized : normalized.toLocaleLowerCase('tr-TR');
  }

  function codePointBoundaries(text) {
    const result = [0];
    let offset = 0;
    for (const character of String(text)) {
      offset += character.length;
      result.push(offset);
    }
    return result;
  }

  function literalRanges(text, query, options = {}) {
    const source = String(text == null ? '' : text);
    const needle = foldSearchText(query, options.caseSensitive === true);
    if (!source || !needle) return [];
    const boundaries = codePointBoundaries(source);
    const ranges = [];
    let startPoint = 0;
    while (startPoint < boundaries.length - 1) {
      let matched = null;
      for (let endPoint = startPoint + 1; endPoint < boundaries.length; endPoint++) {
        const candidate = foldSearchText(source.slice(boundaries[startPoint], boundaries[endPoint]),
          options.caseSensitive === true);
        if (candidate === needle) {
          matched = { start: boundaries[startPoint], end: boundaries[endPoint] };
          break;
        }
        if (candidate.length > needle.length + 2) break;
      }
      if (!matched) { startPoint++; continue; }
      if (options.wholeWord === true) {
        const before = source.slice(0, matched.start).match(/[\s\S]$/u)?.[0] || '';
        const after = source.slice(matched.end).match(/^[\s\S]/u)?.[0] || '';
        if ((before && WORD.test(before)) || (after && WORD.test(after))) {
          startPoint++;
          continue;
        }
      }
      ranges.push(matched);
      while (startPoint < boundaries.length && boundaries[startPoint] < matched.end) startPoint++;
    }
    return ranges;
  }

  function findLiteralMatches(entries, query, options = {}) {
    const allowed = options.field === 'source' || options.field === 'translation'
      ? options.field : 'both';
    const matches = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || (allowed !== 'both' && entry.field !== allowed)) continue;
      const ranges = literalRanges(entry.text, query, options);
      ranges.forEach((range, occurrence) => matches.push({
        id: `${entry.field}:${entry.channel}:${entry.index}:${occurrence}`,
        ...entry,
        occurrence,
        range,
      }));
    }
    return matches;
  }

  function replaceLiteralRanges(text, matches, replacement) {
    let result = String(text == null ? '' : text);
    const ranges = (Array.isArray(matches) ? matches : []).map((item) => item.range || item)
      .filter((range) => Number.isInteger(range?.start) && Number.isInteger(range?.end)
        && range.start >= 0 && range.end > range.start && range.end <= result.length)
      .sort((a, b) => b.start - a.start || b.end - a.end);
    let lastStart = Infinity;
    for (const range of ranges) {
      if (range.end > lastStart) continue;
      result = `${result.slice(0, range.start)}${String(replacement ?? '')}${result.slice(range.end)}`;
      lastStart = range.start;
    }
    return result;
  }

  function buildReplacementPlan(matches, selectedIds, replacement) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const grouped = new Map();
    for (const match of Array.isArray(matches) ? matches : []) {
      if (!selected.has(match.id)) continue;
      const key = `${match.field}|${match.channel}|${match.index}`;
      if (!grouped.has(key)) grouped.set(key, { ...match, ranges: [] });
      grouped.get(key).ranges.push(match.range);
    }
    return [...grouped.values()].map((entry) => ({
      ...entry,
      before: String(entry.text ?? ''),
      after: replaceLiteralRanges(entry.text, entry.ranges, replacement),
      matchCount: entry.ranges.length,
    })).filter((entry) => entry.before !== entry.after);
  }

  return { buildReplacementPlan, findLiteralMatches, foldSearchText, literalRanges, replaceLiteralRanges };
}));
