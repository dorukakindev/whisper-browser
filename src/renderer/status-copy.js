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

  // Teknik/sistem hata metinlerini kullanıcı dostu dile çevirir; tanınmayan
  // mesajlar olduğu gibi geçer. Ham ayrıntı kısaltılarak parantezde korunur
  // (teşhis için) — kullanıcı önce anlaşılır cümleyi görür.
  const SYSTEM_ERROR_RULES = [
    [/\benoent\b|no such file or directory|cannot find the file/i,
      'Dosya veya komut bulunamadı.', 'File or command not found.'],
    [/\beacces\b|\beperm\b|permission denied|access is denied/i,
      'İzin yetersiz — dosya veya klasör erişimi engellendi.', 'Permission denied — the file or folder is not accessible.'],
    [/\benospc\b|no space left/i,
      'Diskte yer kalmadı.', 'No space left on disk.'],
    [/\betimedout\b|timed out|timeout/i,
      'Bağlantı zaman aşımına uğradı.', 'The connection timed out.'],
    [/\beconnrefused\b|connection refused/i,
      'Bağlantı reddedildi — hedef servis kapalı olabilir.', 'Connection refused — the target service may be down.'],
    [/\beconnreset\b|\bepipe\b|connection reset|broken pipe/i,
      'Bağlantı karşı tarafça kesildi.', 'The connection was dropped by the other side.'],
    [/\benotfound\b|\beai_again\b|name_not_resolved|getaddrinfo|err_name/i,
      'Alan adı çözümlenemedi — internet bağlantısını kontrol edin.', 'Could not resolve the host — check your internet connection.'],
    [/\benetdown\b|\benetunreach\b|\behostunreach\b|network.?unreachable|err_internet_disconnected|err_network/i,
      'Ağ erişilemez durumda — internet bağlantısını kontrol edin.', 'The network is unreachable — check your internet connection.'],
    [/certificate|self.signed|unable to verify|err_cert/i,
      'Güvenlik sertifikası doğrulanamadı.', 'The security certificate could not be verified.'],
    [/err_address|eaddrnotavail|eaddrinuse/i,
      'Adres kullanılamıyor veya zaten kullanımda.', 'The address is unavailable or already in use.'],
    [/spawn\s+\S+\s+enoent|command not found|is not recognized as/i,
      'Gerekli program bulunamadı veya kurulu değil.', 'A required program is missing or not installed.'],
  ];

  function systemError(locale, raw) {
    const message = String(raw || '').trim();
    if (!message) return pick(locale, 'Bilinmeyen hata.', 'Unknown error.');
    for (const [pattern, tr, en] of SYSTEM_ERROR_RULES) {
      if (pattern.test(message)) {
        const detail = message.length > 160 ? `${message.slice(0, 157)}…` : message;
        return `${pick(locale, tr, en)} (${detail})`;
      }
    }
    return message;
  }

  return Object.freeze({ burnIn, clock, subtitleSearch, systemError });
}));
