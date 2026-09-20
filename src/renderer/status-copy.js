(function initStatusCopy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StatusCopy = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const pick = (locale, tr, en) => String(locale || '').toLowerCase() === 'tr' ? tr : en;
  const clock = (seconds) => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };

  function subtitleSearch(locale, state = {}) {
    if (state.failed) {
      return pick(locale,
        'Arama tamamlanamadı — ayrıntı üstteki durumda. Yeniden deneyebilirsiniz.',
        'Search failed — see the status above for details. You can try again.');
    }
    const visible = Math.max(0, Number(state.visibleCount) || 0);
    if (!visible) {
      return pick(locale,
        'Eşleşen altyazı bulunamadı. Başlığı veya dili değiştirin.',
        'No matching subtitles found. Try another title or language.');
    }
    const total = Math.max(visible, Number(state.totalCount) || visible);
    const partialTr = total > visible ? ` (toplam ${total} sonucun ilk bölümü — aramayı daraltın)` : '';
    const partialEn = total > visible ? ` (showing the first results from ${total} — narrow your search)` : '';
    const hashTr = state.hashMatch ? ' Dosya parmak izi eşleşenler en üstte.' : '';
    const hashEn = state.hashMatch ? ' File fingerprint matches appear first.' : '';
    return pick(locale,
      `${visible} aday${partialTr} · puan yalnız başlık, bölüm, dil ve sürüm bilgilerinin eşleşmesidir.${hashTr}`,
      `${visible} candidates${partialEn} · the score only reflects title, episode, language, and release matching.${hashEn}`);
  }

  function burnIn(locale, event = {}) {
    switch (event.type) {
      case 'idle': return pick(locale, 'Gömülüyor… 0%', 'Embedding… 0%');
      case 'cancel': return pick(locale, 'İptal ediliyor…', 'Cancelling…');
      case 'start': return pick(locale, 'Gömme hazırlanıyor…', 'Preparing subtitle embed…');
      case 'done': return pick(locale, 'Tamamlandı ✓', 'Completed ✓');
      case 'progress': {
        const percent = Number.isFinite(Number(event.percent)) ? Number(event.percent).toFixed(0) : '0';
        if (Number(event.total) > 0) {
          return pick(locale,
            `Gömülüyor… ${percent}% · ${clock(event.current)} / ${clock(event.total)}`,
            `Embedding… ${percent}% · ${clock(event.current)} / ${clock(event.total)}`);
        }
        return pick(locale, `Gömülüyor… ${clock(event.current)}`, `Embedding… ${clock(event.current)}`);
      }
      default: return '';
    }
  }

  return Object.freeze({ burnIn, clock, subtitleSearch });
}));
