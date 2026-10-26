'use strict';
// A deliberately bounded Turkish verb lexicon: bare -ma/-me also forms nouns
// (elma, çalışma, dondurma). Do not classify every matching word as negation.
// Unknown verbs still pass through the existing tense/evidence guards below.
const TURKISH_NEGATIVE_ROOTS = require('./turkish-negation-roots.json');
const TURKISH_NEGATIVE_ENDING = /^(?:m[ıiuü]yor[\p{L}]*|m[ae]y[ae]c[ae][kğ][\p{L}]*|m[ae](?:d[ae]n|ks[ıi]z[ıi]n|y[ıi]nc[ae]|m|z(?:s[ıi]n(?:[ıi]z)?|lar|ler)?|y[ıi]z|s[ıi]n(?:lar|ler)?|y[ıiuü]n(?:[ıiuü]z)?|y[ae]l[ıi]m)?|y?[ae]m[ae](?:m|z(?:s[ıi]n(?:[ıi]z)?|lar|ler)?|y[ıi]z|s[ıi]n)?|y?[ae]m[ıiuü]yor[\p{L}]*|y?[ae]m[ae]y[\p{L}]*)$/u;
function turkishLexicalNegatives(text) {
  const tokens = text.normalize('NFC').toLocaleLowerCase('tr').match(/[\p{L}]+/gu) || [];
  return tokens.filter(token => TURKISH_NEGATIVE_ROOTS.some(root =>
    token.startsWith(root) && TURKISH_NEGATIVE_ENDING.test(token.slice(root.length)))).sort();
}
function safeShortening(source, proposed, {natural=false} = {}) {
  if (typeof source !== 'string') return false;
  if (typeof proposed !== 'string' || !proposed.trim() || proposed.length > (natural ? Math.max(source.length, Math.round(source.length*1.25)) : source.length) || proposed.length > 1000) return false;
  const evidence = text => {
    const lower = text.toLocaleLowerCase('tr');
    const matches = pattern => (lower.match(pattern) || []).sort();
    return {
      currency: matches(/[$€£₺¥]|(?<!\p{L})(?:dolar|dollar|usd|euro|eur|lira|try|sterlin|gbp|yen|jpy)(?!\p{L})/gu),
      question: (text.match(/[?？]/g) || []).length,
      // The editor must not turn an exclamation or an unfinished thought into
      // neutral narration. Normalize the two common ellipsis spellings only.
      exclamation: (text.match(/[!！]/g) || []).length,
      hesitation: (text.replace(/\.{3,}/g, '…').match(/…/g) || []).length,
      acronyms: (text.match(/(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ]{2,}(?![\p{L}\p{N}])/gu) || []).sort(),
      comparisons: matches(/[<>≤≥≠]=?/gu),
      pastNegatives: matches(/(?<!\p{L})\p{L}{2,}m[ae](?:d[ıiuü]|m[ıiuü]ş)\p{L}*(?!\p{L})/gu),
      modality: matches(/(?<!\p{L})(?:\p{L}*abilir\p{L}*|\p{L}*ebilir\p{L}*|belki|muhtemelen|possibly|perhaps|might|may|must|should)(?!\p{L})/gu),
    };
  };
  if (JSON.stringify(evidence(source)) !== JSON.stringify(evidence(proposed))) return false;
  if (JSON.stringify(turkishLexicalNegatives(source)) !== JSON.stringify(turkishLexicalNegatives(proposed))) return false;
  const numbers = text => text.match(/\d+(?:[.,]\d+)*/g) || [];
  const remaining = numbers(proposed);
  for (const value of numbers(source)) {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  if (remaining.length) return false;
  const percentages = text => (text.match(/(?:%|yüzde)\s*\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s*(?:%|percent\b)/giu) || [])
    .map(v=>v.replace(/[^\d.,]/g,'')).sort();
  if (JSON.stringify(percentages(source)) !== JSON.stringify(percentages(proposed))) return false;
  const unitNames={kilometre:'km',kilogram:'kg',santimetre:'cm',milimetre:'mm',mililitre:'ml',miligram:'mg',metre:'m',gram:'g',litre:'l'};
  const units = text => [...text.matchAll(/\d+(?:[.,]\d+)*\s*(kilometre|kilogram|santimetre|milimetre|mililitre|miligram|metre|gram|litre|km|kg|cm|mm|ml|mg|m|g|l|°c|°f)(?!\p{L})/giu)]
    .map(m=>`${m[0].match(/^\d+(?:[.,]\d+)*/)[0]}:${unitNames[m[1].toLowerCase()] || m[1].toLowerCase()}`).sort();
  if (JSON.stringify(units(source)) !== JSON.stringify(units(proposed))) return false;
  const negativeVerbs = text => text.toLocaleLowerCase('tr').match(/\p{L}{2,}(?:m[ıiuü]yor\p{L}*|m[ae]y[ae]c[ae][kğ]\p{L}*|m[ae]z(?:[dt]\p{L}*|[ıiuü]\p{L}*)?|m[ae]y[ıiuü]n(?:[ıiuü]z)?|m[ae]m[ae]l[ıi]\p{L}*)(?!\p{L})/gu) || [];
  if (JSON.stringify(negativeVerbs(source).sort()) !== JSON.stringify(negativeVerbs(proposed).sort())) return false;
  const signedNumbers = text => (text.match(/[+\-−]?\d+(?:[.,]\d+)*/g) || []).map(value => value.replace('−','-')).sort();
  if (JSON.stringify(signedNumbers(source)) !== JSON.stringify(signedNumbers(proposed))) return false;
  const numericRelations = text => text.match(/\d+(?:[.,]\d+)*(?:\s*[:/–—-]\s*\d+(?:[.,]\d+)*)+/g)?.map(v=>v.replace(/\s/g,'')).sort() || [];
  if (JSON.stringify(numericRelations(source)) !== JSON.stringify(numericRelations(proposed))) return false;
  const englishNegations = text => (text.toLowerCase().replace(/\bcannot\b/g,'can not').replace(/\bcan['’]t\b/g,'can not')
    .replace(/\bwon['’]t\b/g,'will not').replace(/n['’]t\b/g,' not')
    .match(/\b(?:not|no|never|without|neither|nor|nothing|nobody|cannot)\b/g) || []).sort();
  if (JSON.stringify(englishNegations(source)) !== JSON.stringify(englishNegations(proposed))) return false;
  const containsName = name => new RegExp(`(?<![\\p{L}\\p{N}_])${name}(?![\\p{L}\\p{N}_])`,'u').test(proposed);
  // Conservative evidence, not proof of semantic equivalence.
  for (const match of source.matchAll(/(?:^|\s)(değil\p{L}*|yok\p{L}*|asla|hiçbir|hiç)(?=\s|[.,!?;:]|$)/giu)) {
    if (!proposed.toLocaleLowerCase('tr').includes(match[1].toLocaleLowerCase('tr'))) return false;
  }
  for (const match of source.matchAll(/\p{Lu}[\p{L}]+(?=['’])/gu)) {
    if (!containsName(match[0])) return false;
  }
  // Retain repeated negation evidence and non-initial capitalized names.
  const words = text => text.toLocaleLowerCase('tr').match(/[\p{L}]+/gu) || [];
  const negations = text => words(text).filter(w => /^(?:değil|yok|asla|hiç)/u.test(w)).sort();
  if (JSON.stringify(negations(source)) !== JSON.stringify(negations(proposed))) return false;
  const target = words(proposed);
  for (const token of words(source).filter(w => /^(?:değil|yok|asla|hiç)/u.test(w))) {
    const i = target.indexOf(token); if (i < 0) return false; target.splice(i,1);
  }
  for (const match of source.matchAll(/(?<![.!?]\s)(?<=\p{L}[,;:]?\s)\p{Lu}[\p{L}]+/gu)) {
    if (!containsName(match[0])) return false;
  }
  return true;
}
module.exports = {safeShortening};
