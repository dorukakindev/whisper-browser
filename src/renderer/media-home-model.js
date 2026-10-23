/* Original Whisper home model. The layout is inspired by Luna; no Luna source is embedded. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.MediaHomeModel = model;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const audio = /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)(?:[?#]|$)/i;
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  function progress(item) {
    const p = item?.progress || item || {};
    const duration = number(p.duration), position = number(p.position);
    return { duration, position, percent: duration ? Math.min(100, position / duration * 100) : 0,
      resume: !p.completed && position > 0 && (!duration || position < duration * .95) };
  }
  function medium(item) {
    if (item?.type === 'browser' || item?.type === 'youtube') return 'web';
    return audio.test(String(item?.localPath || item?.sourceRef || '')) ? 'music' : 'video';
  }
  function fold(value) { return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i'); }
  function matches(item, query) { return fold(`${item?.title || ''} ${item?.year || ''} ${item?.synopsis || ''}`).includes(fold(query).trim()); }
  const normalizedKey = key => String(key || '').startsWith('file:')
    ? String(key).replace(/\\/g, '/').toLowerCase() : String(key || '');
  function snapshot(catalog, history) {
    const items = Array.isArray(catalog) ? catalog.filter(row => row && typeof row.id === 'string') : [];
    const bySource = new Map();
    for (const item of items) for (const source of [item.source, ...(item.episodes || []).map(ep => ep?.source)]) {
      if (!source) continue;
      const key = source.watchKey || (source.value ? `${source.type === 'local' ? 'file' : 'browser'}:${source.value}` : '');
      if (key && !bySource.has(normalizedKey(key))) bySource.set(normalizedKey(key), item);
    }
    const seen = new Set();
    const watch = (Array.isArray(history) ? history : []).filter(row => {
      if (!row || typeof row.key !== 'string' || seen.has(row.key)) return false;
      seen.add(row.key); return true;
    }).map(row => {
      const catalogItem = bySource.get(normalizedKey(row.key));
      return catalogItem ? { ...row, id: catalogItem.id, hasPoster: catalogItem.hasPoster, synopsis: catalogItem.synopsis, year: catalogItem.year } : row;
    }).sort((a, b) => number(b.lastWatched) - number(a.lastWatched));
    return { items, watch, continuing: watch.filter(row => progress(row).resume) };
  }
  return Object.freeze({ progress, medium, matches, snapshot });
});
