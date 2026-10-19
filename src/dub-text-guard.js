'use strict';
function safeShortening(source, proposed) {
  if (typeof proposed !== 'string' || !proposed.trim() || proposed.length > source.length || proposed.length > 1000) return false;
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
  return true;
}
module.exports = {safeShortening};
