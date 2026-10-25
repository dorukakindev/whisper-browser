'use strict';
function normalize(entries) {
  if (!Array.isArray(entries) || entries.length > 100 || JSON.stringify(entries).length > 16000) throw new Error('Use at most 100 pronunciation entries.');
  const seen = new Set();
  return entries.map(row => {
    const from = typeof row?.from === 'string' ? row.from.normalize('NFC').trim() : '';
    const to = typeof row?.to === 'string' ? row.to.normalize('NFC').trim() : '';
    if (!from || !to || from.length > 80 || to.length > 120 || !/\p{L}/u.test(from) || /[\x00-\x1f\x7f]/.test(from + to) || seen.has(from)) throw new Error('Invalid or duplicate pronunciation entry.');
    seen.add(from); return {from, to};
  });
}
if (typeof module !== 'undefined') module.exports = {normalize};
