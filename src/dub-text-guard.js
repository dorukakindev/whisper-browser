'use strict';
function safeShortening(source, proposed, {natural=false} = {}) {
  if (typeof proposed !== 'string' || !proposed.trim() || proposed.length > (natural ? Math.max(source.length, Math.round(source.length*1.25)) : source.length) || proposed.length > 1000) return false;
  const numbers = text => text.match(/\d+(?:[.,]\d+)*/g) || [];
  const remaining = numbers(proposed);
  for (const value of numbers(source)) {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  if (remaining.length) return false;
  // Conservative evidence, not proof of semantic equivalence.
  for (const match of source.matchAll(/(?:^|\s)(değil\p{L}*|yok\p{L}*|asla|hiçbir|hiç)(?=\s|[.,!?;:]|$)/giu)) {
    if (!proposed.toLocaleLowerCase('tr').includes(match[1].toLocaleLowerCase('tr'))) return false;
  }
  for (const match of source.matchAll(/\p{Lu}[\p{L}]+(?=['’])/gu)) {
    if (!proposed.includes(match[0])) return false;
  }
  // Retain repeated negation evidence and non-initial capitalized names.
  const words = text => text.toLocaleLowerCase('tr').match(/[\p{L}]+/gu) || [];
  const target = words(proposed);
  for (const token of words(source).filter(w => /^(?:değil|yok|asla|hiç)/u.test(w))) {
    const i = target.indexOf(token); if (i < 0) return false; target.splice(i,1);
  }
  for (const match of source.matchAll(/(?<![.!?]\s)(?<=\p{L}[,;:]?\s)\p{Lu}[\p{L}]+/gu)) {
    if (!proposed.includes(match[0])) return false;
  }
  return true;
}
module.exports = {safeShortening};
