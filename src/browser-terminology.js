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

function candidateTokens(text) {
  const raw = clean(text, 12000);
  const tokens = raw.match(/[\p{L}][\p{L}\p{M}'’-]{2,}/gu) || [];
  return tokens.map((token) => token.replace(/^['’]+|['’]+$/g, ''))
    .filter((token) => token.length >= 3 && token[0] === token[0].toLocaleUpperCase('tr-TR'));
}

function learnTerminology(map, sourceText, translatedText, cueId, confidence = 1) {
  if (!map || !(map.terms instanceof Map) || Number(confidence) < 0.8) return 0;
  const source = candidateTokens(sourceText);
  if (!source.length) return 0;
  const sourcePhrase = source.join(" ");
  const key = sourcePhrase.normalize("NFC").toLocaleLowerCase("tr-TR");
  const target = clean(translatedText, 180);
  const row = map.terms.get(key) || { source: sourcePhrase, target: "", count: 0, cueIds: [] };
  row.count += 1;
  if (target && !row.target) row.target = target;
  if (cueId != null && row.cueIds.length < 8 && !row.cueIds.includes(String(cueId))) row.cueIds.push(String(cueId));
  map.terms.set(key, row);
  trimTerminologyMap(map);
  return row.count >= map.minOccurrences ? 1 : 0;
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

module.exports = { createTerminologyMap, learnTerminology, terminologyPrompt, trimTerminologyMap };
