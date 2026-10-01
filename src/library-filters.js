(function exposeLibraryFilters(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibraryFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  // Madde 32 — kütüphane filtre birleştirici (saf fonksiyon).
  // Koleksiyon + dil + izleme durumu + altyazı varlığı filtreleri birlikte
  // çalışır; girdi sırası korunur (store zaten lastWatched DESC, id ASC
  // sıralı verir — filtreleme sırayı değiştirmediği için sonuç sırası
  // kararlıdır).

  /**
   * @param items    watchLibrary kayıtları
   * @param filters  {watchState, language, subs}
   *   watchState: 'all' | 'continue' | 'completed' | 'has-notes' | 'collection:<ad>'
   *   language:   'all' | <dil kodu> — medyanın kayıtlı altyazı dillerinde ara
   *   subs:       'all' | 'yes' | 'no' — altyazı varlığı
   * @param deps     {watchProgress: (item)=>number}
   */
  function applyLibraryFilters(items, filters, deps = {}) {
    const list = Array.isArray(items) ? items : [];
    const f = filters || {};
    const progress = typeof deps.watchProgress === 'function' ? deps.watchProgress : () => 0;
    const language = f.language && f.language !== 'all' ? String(f.language).toLowerCase() : null;
    const wantSubs = f.subs === 'yes' ? true : f.subs === 'no' ? false : null;
    const state = typeof f.watchState === 'string' ? f.watchState : 'all';
    const collection = state.startsWith('collection:') ? state.slice(11) : null;

    return list.filter((item) => {
      if (!item) return false;
      if (collection !== null && !(item.collections || []).includes(collection)) return false;
      if (state === 'continue' && (item.completed || progress(item) <= 0)) return false;
      if (state === 'completed' && !item.completed) return false;
      if (state === 'has-notes'
          && !(item.hasNotes || (item.matches || []).some((m) => m && m.annotationType))) return false;
      if (language !== null
          && !(item.subLangs || []).some((l) => String(l).toLowerCase() === language)) return false;
      if (wantSubs !== null && Boolean(item.hasSubs) !== wantSubs) return false;
      return true;
    });
  }

  // Medya kayıtlarından seçilebilir dil listesi (deterministik sıra).
  function libraryLanguages(items) {
    const set = new Set();
    for (const item of items || []) {
      for (const lang of (item && item.subLangs) || []) {
        const l = String(lang || '').trim();
        if (l) set.add(l);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  return { applyLibraryFilters, libraryLanguages };
});
