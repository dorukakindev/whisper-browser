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
    // İstisna adları genel metin kurallarından önce gelir (NotAllowedError:
    // 'Permission denied' içerse bile izin engeli olarak sınıflandırılır).
    [/notallowederror|notfounderror|notreadableerror|securityerror|overconstrainederror/i,
      'İşletim sistemi veya tarayıcı izin/kaynak engeli — ayarları kontrol edin.', 'The OS or browser blocked access — check permissions and devices.'],
    [/\benoent\b|no such file or directory|cannot find the file/i,
      'Dosya veya komut bulunamadı.', 'File or command not found.'],
    [/\beacces\b|\beperm\b|permission denied|access is denied/i,
      'İzin yetersiz — dosya veya klasör erişimi engellendi.', 'Permission denied — the file or folder is not accessible.'],
    [/\benametoolong\b|name too long|path too long|file name too long/i,
      'Dosya yolu çok uzun — daha kısa bir klasör adı ya da konum deneyin.', 'The file path is too long — try a shorter folder name or location.'],
    [/\benospc\b|no space left|err_disk_full|disk full/i,
      'Diskte yer kalmadı.', 'No space left on disk.'],
    [/\betimedout\b|timed out|timeout/i,
      'Bağlantı zaman aşımına uğradı.', 'The connection timed out.'],
    [/\beconnrefused\b|connection refused/i,
      'Bağlantı reddedildi — hedef servis kapalı olabilir.', 'Connection refused — the target service may be down.'],
    [/\beconnreset\b|\bepipe\b|connection reset|broken pipe/i,
      'Bağlantı karşı tarafça kesildi.', 'The connection was dropped by the other side.'],
    [/\benotfound\b|\beai_again\b|name_not_resolved|getaddrinfo|err_name/i,
      'Alan adı çözümlenemedi — internet bağlantısını kontrol edin.', 'Could not resolve the host — check your internet connection.'],
    [/\benetdown\b|\benetunreach\b|\behostunreach\b|network.?unreachable|err_internet_disconnected|err_network_io_suspended|err_network_access_denied/i,
      'Ağ erişilemez durumda — internet bağlantısını kontrol edin.', 'The network is unreachable — check your internet connection.'],
    [/certificate|self.signed|unable to verify|err_cert/i,
      'Güvenlik sertifikası doğrulanamadı.', 'The security certificate could not be verified.'],
    [/err_address_unreachable|address unreachable/i,
      'Adrese ağ üzerinden ulaşılamadı — adresi ve bağlantıyı kontrol edin.', 'The address is unreachable over the network — check the address and connection.'],
    [/err_proxy|err_tunnel|proxy connection|tunnel connection|proxy auth|proxy_configuration/i,
      'Proxy/VPN bağlantısı kurulamadı — proxy veya VPN ayarlarını kontrol edin.', 'The proxy/VPN connection failed — check your proxy or VPN settings.'],
    [/err_ssl_|ssl protocol|ssl version|cipher mismatch|ssl handshake|bad record mac|insecure response/i,
      'Siteyle güvenli bağlantı (SSL) kurulamadı.', 'A secure (SSL) connection to the site could not be established.'],
    [/unsafe redirect|err_unsafe_redirect/i,
      'Site güvenli olmayan bir adrese yönlendirdi — bağlantı durduruldu.', 'The site tried to redirect to an unsafe address — the connection was stopped.'],
    [/too many redirects|redirect loop|err_invalid_redirect/i,
      'Site çok fazla yönlendirme yaptı — adres döngüye giriyor olabilir.', 'The site redirected too many times — the address may be looping.'],
    [/err_blocked_by_client|err_blocked_by_response|err_blocked_by_administrator|blocked by client|blocked by response|blocked by administrator/i,
      'İstek engelleyici tarafından durduruldu (reklam/izleme koruması veya yönetici ilkesi).', 'The request was blocked (ad/tracking protection or administrator policy).'],
    [/err_empty_response|empty response/i,
      'Site boş yanıt döndürdü.', 'The site returned an empty response.'],
    [/err_invalid_url|invalid url|disallowed url|unknown url scheme|unsafe url|unsafe port/i,
      'Adres geçersiz veya desteklenmeyen şema/bağlantı noktası içeriyor.', 'The address is invalid or uses a disallowed scheme/port.'],
    [/quic|http2|http3|h2_or/i,
      'QUIC/HTTP3 bağlantısı kurulamadı — VPN veya ağ denetimini kontrol edin.', 'The QUIC/HTTP3 connection failed — check VPN or network inspection.'],
    [/err_connection_closed|err_connection_aborted|network changed|err_network_changed/i,
      'Bağlantı kapandı veya ağ değişti — VPN/Wi-Fi geçişini kontrol edin.', 'The connection closed or the network changed — check VPN/Wi-Fi switching.'],
    [/err_address|eaddrnotavail|eaddrinuse/i,
      'Adres kullanılamıyor veya zaten kullanımda.', 'The address is unavailable or already in use.'],
    [/spawn\s+\S+\s+enoent|command not found|is not recognized as/i,
      'Gerekli program bulunamadı veya kurulu değil.', 'A required program is missing or not installed.'],
    [/\bebusy\b|\bebusy:|being used by another process|dosya.*kullan.*lmda/i,
      'Dosya başka bir program tarafından kullanılıyor.', 'The file is in use by another program.'],
    [/\bemfile\b|\benfile\b|too many open files/i,
      'Çok fazla açık dosya var — birkaçını kapatıp yeniden deneyin.', 'Too many open files — close some and try again.'],
    [/aborterror|err_aborted|aborted by the user/i,
      'İşlem iptal edildi.', 'The operation was cancelled.'],
    [/err_file_not_found|err_access_denied|err_upload_file_changed/i,
      'Dosyaya erişilemedi — taşınmış, silinmiş veya erişim engellenmiş olabilir.', 'The file is not accessible — it may have moved, been deleted, or blocked.'],
    [/\beio\b|i\/o error|hardware error/i,
      'Disk/aygıt okuma hatası.', 'A disk or device read error occurred.'],
  ];

  function systemError(locale, raw) {
    const message = String(raw || '').trim();
    if (!message) return pick(locale, 'Bilinmeyen hata.', 'Unknown error.');
    // Chromium kodları alt çizgili gelir (ERR_CONNECTION_TIMED_OUT); boşluklu
    // yazılmış kalıpların da yakalaması için normalize edilmiş kopya da sınanır.
    const spaced = message.replace(/_/g, ' ');
    for (const [pattern, tr, en] of SYSTEM_ERROR_RULES) {
      if (pattern.test(message) || pattern.test(spaced)) {
        const detail = message.length > 160 ? `${message.slice(0, 157)}…` : message;
        return `${pick(locale, tr, en)} (${detail})`;
      }
    }
    return message;
  }

  return Object.freeze({ burnIn, clock, subtitleSearch, systemError });
}));
