'use strict';

function clean(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function createTerminologyMap(options = {}) {
  return {
    maxTerms: Math.max(1, Math.min(100, Number(options.maxTerms) || 40)),
    maxChars: Math.max(200, Math.min(6000, Number(options.maxChars) || 1800)),
    minOccurrences: Math.max(2, Math.min(10, Number(options.minOccurrences) || 2)),
    terms: new Map(),
  };
}

const AMBIGUOUS_SENTENCE_STARTERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'bir', 'bu', 'şu', 'o', 'ben', 'sen', 'biz', 'siz', 'onlar',
]);

function ambiguousStarterKey(value) {
  return String(value || '').normalize('NFKD').replace(/\u0307/g, '')
    .toLowerCase().normalize('NFC');
}

function candidatePhrases(text) {
  const raw = clean(text, 12000);
  const words = [...raw.matchAll(/[\p{L}][\p{L}\p{M}'’-]*/gu)];
  const phrases = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const atSentenceStart = /^[^\p{L}\p{N}]*$/u.test(raw.slice(0, run[0].index));
    if (run.length > 1 && atSentenceStart
        && AMBIGUOUS_SENTENCE_STARTERS.has(ambiguousStarterKey(run[0].word))) {
      run = run.slice(1);
    }
    const source = run.map((item) => item.word).join(' ');
    const key = source.normalize('NFC').toLocaleLowerCase('tr-TR');
    if (!(run.length === 1 && atSentenceStart && AMBIGUOUS_SENTENCE_STARTERS.has(ambiguousStarterKey(source)))) {
      phrases.push({ source, key,
        strong: run.length > 1 || !atSentenceStart || source === source.toLocaleUpperCase('tr-TR')
          || /\p{Ll}\p{Lu}/u.test(source) });
    }
    run = [];
  };
  for (const match of words) {
    const word = match[0].replace(/^['’]+|['’]+$/g, '');
    const gap = run.length ? raw.slice(run.at(-1).end, match.index) : '';
    if (run.length && !/^\s+$/.test(gap)) flush();
    const titleCase = word && word[0] === word[0].toLocaleUpperCase('tr-TR');
    const internalUpper = /\p{Ll}\p{Lu}/u.test(word);
    const shortSuffix = run.length && /^[\p{Lu}\d]{1,2}$/u.test(word);
    if ((titleCase || internalUpper) && (word.length >= 2 || shortSuffix)) {
      run.push({ word, index: match.index, end: match.index + match[0].length });
    } else {
      flush();
    }
  }
  flush();
  return phrases.filter((item, index, all) => all.findIndex((other) => other.key === item.key) === index);
}

function standaloneCandidate(sourceText, phrase) {
  const source = clean(sourceText, 12000)
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .normalize('NFC').toLocaleLowerCase('tr-TR');
  return source === phrase.key;
}

function learnTerminology(map, sourceText, translatedText, cueId, confidence = 1) {
  if (!map || !(map.terms instanceof Map) || Number(confidence) < 0.8) return 0;
  const phrases = candidatePhrases(sourceText);
  if (!phrases.length) return 0;
  const target = phrases.length === 1 && standaloneCandidate(sourceText, phrases[0])
    ? clean(translatedText, 180) : '';
  let qualified = 0;
  for (const phrase of phrases) {
    const row = map.terms.get(phrase.key)
      || { source: phrase.source, target: '', count: 0, cueIds: [] };
    row.count += 1;
    if (target && !row.target) row.target = target;
    if (cueId != null && row.cueIds.length < 8 && !row.cueIds.includes(String(cueId))) {
      row.cueIds.push(String(cueId));
    }
    map.terms.set(phrase.key, row);
    if (row.count >= map.minOccurrences) qualified += 1;
  }
  trimTerminologyMap(map);
  return qualified;
}

function seedTerminology(map, sourceTexts) {
  if (!map || !(map.terms instanceof Map)) return 0;
  const counts = new Map();
  for (const text of Array.isArray(sourceTexts) ? sourceTexts : []) {
    for (const phrase of candidatePhrases(text)) {
      const row = counts.get(phrase.key) || { source: phrase.source, count: 0, strong: 0 };
      row.count += 1;
      if (phrase.strong) row.strong += 1;
      counts.set(phrase.key, row);
    }
  }
  let added = 0;
  for (const [key, candidate] of counts) {
    if (candidate.count < map.minOccurrences || !candidate.strong) continue;
    const row = map.terms.get(key) || { source: candidate.source, target: '', count: 0, cueIds: [] };
    row.count = Math.max(row.count, candidate.count);
    map.terms.set(key, row);
    added += 1;
  }
  trimTerminologyMap(map);
  return added;
}

function trimTerminologyMap(map) {
  if (!map || !(map.terms instanceof Map)) return map;
  const rows = [...map.terms.values()]
    .filter((row) => row && row.source)
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const kept = new Map();
  let chars = 0;
  for (const row of rows) {
    const line = `${row.source}${row.target ? `=${row.target}` : ''}`;
    if (kept.size >= map.maxTerms || chars + line.length + 3 > map.maxChars) break;
    kept.set(row.source.normalize('NFC').toLocaleLowerCase('tr-TR'), row);
    chars += line.length + 3;
  }
  map.terms = kept;
  return map;
}

function terminologyPrompt(map) {
  if (!map || !(map.terms instanceof Map)) return '';
  const rows = [...map.terms.values()].filter((row) => row.count >= map.minOccurrences && row.source);
  if (!rows.length) return '';
  return rows.map((row) => `${clean(row.source, 80)}${row.target ? `=${clean(row.target, 120)}` : ''}`).join(' | ');
}

function terminologySuggestions(map, lockedTerms = []) {
  if (!map || !(map.terms instanceof Map)) return [];
  const locked = new Set((Array.isArray(lockedTerms) ? lockedTerms : [])
    .map((value) => clean(value, 260).split('=')[0].normalize('NFC').toLocaleLowerCase('tr-TR'))
    .filter(Boolean));
  return [...map.terms.values()]
    .filter((row) => row && row.source && row.target && row.count >= map.minOccurrences
      && !locked.has(clean(row.source).normalize('NFC').toLocaleLowerCase('tr-TR')))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, map.maxTerms)
    .map((row) => ({ source: clean(row.source, 80), target: clean(row.target, 120),
      count: Math.max(0, Math.trunc(Number(row.count) || 0)) }));
}

module.exports = { createTerminologyMap, learnTerminology, seedTerminology,
  terminologyPrompt, terminologySuggestions, trimTerminologyMap };
