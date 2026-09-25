const { isSensitiveKey, startsWithSensitivePrefix } = require('./browser-sensitive-keys');

function redactSensitiveAssignment(match, key) {
  const sensitive = isSensitiveKey(key) || startsWithSensitivePrefix(key)
    || /^(?:token|sig(?:nature)?|jwt|key|api[-_]?key|client[-_]?secret|secret|session(?:id)?|sid)$/i.test(key);
  const generic = /^(?:code|state|pass|exp|expires?|policy|auth)$/i.test(key);
  return sensitive && !generic ? `${key}=[gizlendi]` : match;
}

// Katalog iki dilli tutulur: label/message Türkçe, labelEn/messageEn İngilizce.
// Renderer UiLocale'e göre seçer; ana süreç yalnız alanları kopyalar.
const DIAGNOSTIC_CATALOG = Object.freeze({
  'cdm-component-unavailable': {
    label: 'Widevine bileşen API’si yok', labelEn: 'Widevine component API missing', confidence: 'yüksek',
    message: 'Bu Electron derlemesinde Widevine bileşen API’si bulunamadı. Korumalı video oynatılamayabilir.',
    messageEn: 'This Electron build has no Widevine component API. Protected video may not play.',
  },
  'cdm-initialization-failed': {
    label: 'Widevine hazırlanamadı', labelEn: 'Widevine could not initialize', confidence: 'yüksek',
    message: 'Widevine bileşeni hazırlanamadı. Ağ erişimini ve uygulamanın DRM kurulumunu denetleyin.',
    messageEn: 'The Widevine component could not be initialized. Check network access and the app’s DRM setup.',
  },
  'eme-api-unavailable': {
    label: 'EME API kullanılamıyor', labelEn: 'EME API unavailable', confidence: 'yüksek',
    message: 'Sayfa bağlamında Encrypted Media Extensions API’si yok. Bu, coğrafi engel veya lisans reddi değildir.',
    messageEn: 'The page context has no Encrypted Media Extensions API. This is not a geo block or license rejection.',
  },
  'capability-probe-failed': {
    label: 'Oynatma yetenekleri ölçülemedi', labelEn: 'Playback capabilities could not be measured', confidence: 'düşük',
    message: 'Sayfa bağlamı EME ve codec ölçümünü tamamlayamadı. Bu sonuç Widevine, codec, lisans veya bölge hakkında kesin kanıt değildir.',
    messageEn: 'The page context could not complete the EME and codec probe. This result is not conclusive about Widevine, codec, license, or region.',
  },
  'key-system-unavailable': {
    label: 'Widevine yapılandırması kullanılamıyor', labelEn: 'Widevine configuration unavailable', confidence: 'orta',
    message: 'Tarayıcı istenen Widevine yapılandırmasını sağlayamadı. Codec desteği ayrı ölçüldü; CDM, güvenlik politikası veya yapılandırma etkili olabilir ve bu sonuç coğrafi engel anlamına gelmez.',
    messageEn: 'The browser could not provide the requested Widevine configuration. Codec support was measured separately; CDM, security policy, or configuration may be involved — this does not mean a geo block.',
  },
  'codec-unsupported': {
    label: 'Codec desteklenmiyor', labelEn: 'Codec not supported', confidence: 'yüksek',
    message: 'İstenen ses veya video codec’i bu Chromium yapılandırmasında desteklenmiyor. Bu sonuç Widevine ya da bölge engeli değildir.',
    messageEn: 'The requested audio or video codec is not supported by this Chromium build. This is not a Widevine or region block.',
  },
  'license-dns-error': {
    label: 'Lisans sunucusu DNS hatası', labelEn: 'License server DNS error', confidence: 'yüksek',
    message: 'DRM lisans sunucusunun adı çözümlenemedi. Bu bir ağ/DNS hatasıdır; lisansın reddedildiğini göstermez.',
    messageEn: 'The DRM license server name could not be resolved. This is a network/DNS error; it does not show a license rejection.',
  },
  'license-timeout': {
    label: 'Lisans sunucusu zaman aşımı', labelEn: 'License server timeout', confidence: 'yüksek',
    message: 'DRM lisans isteği zaman aşımına uğradı. Ağ bağlantısını denetleyip tekrar deneyin; bu sonuç lisans reddi değildir.',
    messageEn: 'The DRM license request timed out. Check the network connection and retry; this is not a license rejection.',
  },
  'license-access-denied': {
    label: 'Lisans isteğine erişim verilmedi', labelEn: 'License request denied', confidence: 'orta',
    message: 'Lisans isteği HTTP 401/403 ile karşılandı. Oturum, abonelik, cihaz politikası veya bölge etkili olabilir; tek başına Widevine eksikliği ya da coğrafi engel kanıtlanmış değildir.',
    messageEn: 'The license request was met with HTTP 401/403. Session, subscription, device policy, or region may be involved; a missing Widevine or a geo block is not proven by this alone.',
  },
  'license-rejected': {
    label: 'Lisans işlemi başarısız', labelEn: 'License exchange failed', confidence: 'orta',
    message: 'Site lisans aşamasında bir hata bildirdi. Bilinen DNS/timeout kodu görülmedi; mesaj tek başına diğer ağ sorunlarını, aboneliği, cihaz politikasını ve sunucu reddini ayıramıyor.',
    messageEn: 'The site reported an error during the license phase. No known DNS/timeout code was seen; the message alone cannot separate other network issues, subscription, device policy, or server rejection.',
  },
  'geo-restricted': {
    label: 'Coğrafi erişim engeli', labelEn: 'Geo access block', confidence: 'yüksek',
    message: 'Sunucu HTTP 451 veya açık bir bölge kısıtı kanıtı bildirdi. VPN/DRM atlatma denenmeden servis erişimi doğrulanmalıdır.',
    messageEn: 'The server reported HTTP 451 or explicit region-restriction evidence. Service access should be verified before any VPN/DRM workaround is tried.',
  },
  'authentication-required': {
    label: 'Oturum açma gerekiyor', labelEn: 'Sign-in required', confidence: 'yüksek',
    message: 'İstek HTTP 401 ile karşılandı. Oturum yenilemek gerekebilir; bu Widevine veya coğrafi engel değildir.',
    messageEn: 'The request was met with HTTP 401. A session refresh may be needed; this is not a Widevine or geo block.',
  },
  'http-access-denied': {
    label: 'İstek reddedildi', labelEn: 'Request denied', confidence: 'orta',
    message: 'İstek HTTP 403 ile karşılandı. Oturum, bot koruması, abonelik veya bölge olasıdır; yalnız bu kodla kesin neden söylenemez.',
    messageEn: 'The request was met with HTTP 403. Session, bot protection, subscription, or region are possible; this code alone cannot prove the cause.',
  },
  'service-throttled': {
    label: 'Servis istekleri sınırladı', labelEn: 'Service throttled the requests', confidence: 'yüksek',
    message: 'Oynatma servisi HTTP 429 döndürdü. Kısa süre bekleyip normal oturumla tekrar deneyin.',
    messageEn: 'The service returned HTTP 429. Wait briefly and retry with a normal session.',
  },
  'service-unavailable': {
    label: 'Oynatma servisi hatası', labelEn: 'Service error', confidence: 'yüksek',
    message: 'Oynatma veya lisans servisi HTTP 5xx hatası döndürdü. Bu genellikle geçici sunucu hatasıdır.',
    messageEn: 'The playback or license service returned an HTTP 5xx error. This is usually a temporary server error.',
  },
  // R120-B2: Ana sayfa belgesinin 5xx yanıtı bir oynatma veya lisans
  // sorunu değildir; kullanıcı yanlış yere (DRM/oturum) yönlendirilmesin.
  'page-server-error': {
    label: 'Site sunucusu hatası', labelEn: 'Site server error', confidence: 'yüksek',
    message: 'Site sayfa isteğine sunucu hatasıyla (HTTP 5xx) yanıt verdi. Birazdan yeniden yükleyin; bu bir oynatma veya DRM sorunu değildir.',
    messageEn: 'The site answered the page request with a server error (HTTP 5xx). Reload in a moment; this is not a playback or DRM problem.',
  },
  'dns-error': {
    label: 'DNS hatası', labelEn: 'DNS error', confidence: 'yüksek',
    message: 'Oynatma adresinin alan adı çözümlenemedi. DNS ve ağ bağlantısını denetleyin.',
    messageEn: 'The playback address hostname could not be resolved. Check DNS and the network connection.',
  },
  'network-timeout': {
    label: 'Ağ zaman aşımı', labelEn: 'Network timeout', confidence: 'yüksek',
    message: 'Oynatma isteği zaman aşımına uğradı. Ağ bağlantısını denetleyip tekrar deneyin.',
    messageEn: 'The playback request timed out. Check the network connection and retry.',
  },
  'network-unreachable': {
    label: 'Ağ bağlantısı kurulamadı', labelEn: 'Network connection failed', confidence: 'yüksek',
    message: 'Oynatma sunucusuna ağ bağlantısı kurulamadı. DNS, güvenlik duvarı, proxy ve bağlantı durumunu denetleyin.',
    messageEn: 'Could not establish a network connection to the playback server. Check DNS, firewall, proxy, and connection state.',
  },
  'tls-error': {
    label: 'Güvenli bağlantı hatası', labelEn: 'Secure connection error', confidence: 'yüksek',
    message: 'Oynatma sunucusunun TLS/sertifika doğrulaması başarısız oldu. Sistem saatini ve güvenli bağlantı zincirini denetleyin.',
    messageEn: 'TLS/certificate verification failed for the playback server. Check the system clock and the secure connection chain.',
  },
  'media-network-error': {
    label: 'Medya ağ hatası', labelEn: 'Media network error', confidence: 'yüksek',
    message: 'HTML medya öğesi veriyi ağdan alamadı. Bu hata DRM, codec ve coğrafi erişimden ayrı değerlendirilmelidir.',
    messageEn: 'The HTML media element could not fetch data from the network. Evaluate separately from DRM, codec, and geo access.',
  },
  'media-decode-error': {
    label: 'Medya çözme hatası', labelEn: 'Media decode error', confidence: 'yüksek',
    message: 'HTML medya öğesi aldığı veriyi çözemedi. Codec ve GPU video çözme durumunu denetleyin.',
    messageEn: 'The HTML media element could not decode the data it received. Check codec and GPU video decode state.',
  },
  'media-source-unsupported': {
    label: 'Medya kaynağı desteklenmiyor', labelEn: 'Media source unsupported', confidence: 'yüksek',
    message: 'HTML medya öğesi kaynak biçimini desteklemedi. Bu sonuç tek başına Widevine veya bölge engeli değildir.',
    messageEn: 'The HTML media element did not support the source format. This alone is not a Widevine or region block.',
  },
  'gpu-decode-limited': {
    label: 'GPU video çözme sınırlı', labelEn: 'GPU video decode limited', confidence: 'orta',
    message: 'Chromium GPU video çözme özelliğini etkin göstermiyor. Video yine yazılımla oynayabilir; bu tek başına siyah ekran nedeni değildir.',
    messageEn: 'Chromium does not report GPU video decode as enabled. Video may still play in software; this alone is not the cause of a black screen.',
  },
  'black-video': {
    label: 'Video karesi üretilemiyor', labelEn: 'Video frames not produced', confidence: 'orta',
    message: 'Video zamanı ilerlerken çözülen kare sayısı artmadı. Sayfayı yenileyin; sürerse codec, GPU ve DRM kanıtlarını birlikte denetleyin.',
    messageEn: 'The decoded frame count did not increase while video time advanced. Reload the page; if it persists, check codec, GPU, and DRM evidence together.',
  },
  'stalled-player': {
    label: 'Oynatıcı takıldı', labelEn: 'Player stalled', confidence: 'orta',
    message: 'Video oynuyor görünmesine rağmen ilerlemedi ve yükleme belirtisi sürdü. Sayfayı yenileyin; gerekirse yalnız bu sitenin çerezlerini temizleyin.',
    messageEn: 'Video appeared to be playing but did not advance and the loading indicator persisted. Reload the page; if needed, clear cookies for this site only.',
  },
  'protected-playback-failed': {
    label: 'Korumalı oynatma hatası', labelEn: 'Protected playback error', confidence: 'düşük',
    message: 'Site korumalı oynatma hatası bildirdi. Hata kodu tek başına Widevine, lisans, codec veya bölge nedenini ayırmıyor.',
    messageEn: 'The site reported a protected playback error. The error code alone cannot separate Widevine, license, codec, or region causes.',
  },
});

function redactDiagnosticText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"']+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        return `${url.origin}${url.pathname}`;
      } catch (_) {
        return '[bağlantı gizlendi]';
      }
    })
    // Konsol ve bileşen hataları bazen istek başlıklarını metne gömer. Bearer
    // değerini yalnız ilk boşluğa kadar silmek tokenın geri kalanını sızdırır;
    // header satırının kalanını gizlemek burada ayrıntı kaybından daha güvenlidir.
    .replace(/\b(?:set-cookie|cookie)\s*[:=]\s*[^\r\n]*/gi, 'cookie=[gizlendi]')
    .replace(/\b(?:proxy-)?authorization\s*[:=]\s*[^\r\n,;]*/gi, 'authorization=[gizlendi]')
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*/gi, 'kimlik=[gizlendi]')
    .replace(/\b[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, 'jwt=[gizlendi]')
    // Ortak hassas-anahtar sözlüğü camelCase OAuth adlarını da yakalar
    // (idToken/accessToken/clientId gibi). Genel İngilizce sözcükler
    // (code/state/exp gibi) tanı değeri taşıdığı için redaksiyon dışı bırakılır.
    // '=' ayracı önce işlenir: 'error: idToken=x' metninde ':' ayracının
    // sonraki key=value çiftini yutması engellenir.
    .replace(/\b([a-z0-9_-]{2,32})\s*=\s*[^\s,;]+/gi, redactSensitiveAssignment)
    .replace(/\b([a-z0-9_-]{2,32})\s*:\s*[^\s,;=]+/gi, redactSensitiveAssignment)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function inferPlaybackResource(details = {}) {
  const url = String(details.url || '');
  const type = String(details.resourceType || details.type || '').toLowerCase();
  const mime = String(details.mimeType || '').toLowerCase();
  let path = url.toLowerCase();
  let host = '';
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    host = parsed.hostname.toLowerCase();
  } catch (_) {}
  // Lisans alışverişi Chromium'da XHR/other olarak görünür. Yolunda
  // "license" geçen resim/belgeyi lisans endpoint'i saymak 401/403 nedenini
  // yanlış kesinleştirir; buna karşılık license.* / .../wv yaygın gerçek şekildir.
  const requestLike = !type || /^(xhr|fetch|other|websocket)$/.test(type);
  const licenseHost = /(?:^|[.-])(?:license|licence|widevine|drm)(?:[.-]|$)/i.test(host);
  const licensePath = /(?:^|[\/_-])(?:license|licence|widevine|drm)(?:[\/_?&=.-]|$)|(?:^|\/)(?:getlicense|acquirelicense|wv|cdm)(?:[\/_?&=.-]|$)/i.test(path);
  if (requestLike && (licenseHost || licensePath)) return 'license';
  if (/^(mainframe|document)$/.test(type)) return 'document';
  if (type === 'subframe' && /(?:^|[\/_-])(?:embed|player|playback|stream|video|watch)(?:[\/_?&=.-]|$)/i.test(path)) {
    return 'document';
  }
  if (type === 'media' || /^(video|audio)\//.test(mime)
      || /\.(?:mpd|m3u8|mp4|m4s|webm|ts)(?:[?#]|$)/i.test(url)) return 'media';
  if (/^(xhr|fetch)$/.test(type)
      && /playback|manifest|stream|entitlement|authorize|session|video/i.test(path)) return 'playback-api';
  return 'other';
}

function isRelevantPlaybackRequest(details = {}) {
  const kind = details.resourceKind || inferPlaybackResource(details);
  return kind !== 'other';
}

function installPlaybackWebRequestDiagnostics(webRequest, onEvidence, options = {}) {
  if (!webRequest || typeof webRequest.onCompleted !== 'function'
      || typeof webRequest.onErrorOccurred !== 'function' || typeof onEvidence !== 'function') return false;
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  const acceptDetails = typeof options.acceptDetails === 'function' ? options.acceptDetails : null;
  const accepted = (details) => {
    try { return !acceptDetails || acceptDetails(details) !== false; } catch (_) { return false; }
  };
  webRequest.onCompleted(filter, (details) => {
    if (!accepted(details) || !isRelevantPlaybackRequest(details) || Number(details.statusCode) < 400) return;
    const evidence = {
      kind: 'http',
      status: Number(details.statusCode),
      resourceKind: inferPlaybackResource(details),
    };
    if (classifyPlaybackEvidence(evidence)) onEvidence(evidence);
  });
  webRequest.onErrorOccurred(filter, (details) => {
    if (!accepted(details) || !isRelevantPlaybackRequest(details)) return;
    const evidence = {
      kind: 'network',
      error: String(details.error || ''),
      canceled: !!details.canceled,
      resourceKind: inferPlaybackResource(details),
    };
    if (classifyPlaybackEvidence(evidence)) onEvidence(evidence);
  });
  return true;
}

function isPlaybackProbeContextCurrent(expected = {}, current = {}) {
  const expectedId = Number(expected.webContentsId);
  const currentId = Number(current.webContentsId);
  return Number.isFinite(expectedId) && expectedId > 0
    && expectedId === currentId
    && Number(expected.generation) === Number(current.generation)
    && String(expected.url || '') === String(current.url || '')
    && current.destroyed !== true;
}

function makeDiagnostic(code, evidence, extra = {}) {
  const base = DIAGNOSTIC_CATALOG[code];
  if (!base) return null;
  return {
    code,
    label: base.label,
    labelEn: base.labelEn,
    confidence: base.confidence,
    message: base.message,
    messageEn: base.messageEn,
    evidence: redactDiagnosticText(evidence),
    ...extra,
  };
}

function networkDiagnostic(errorText, resourceKind) {
  const raw = String(errorText || '');
  if (!raw || /ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/i.test(raw)) return null;
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return resourceKind === 'license' ? 'license-dns-error' : 'dns-error';
  }
  if (/ERR_(?:CONNECTION_)?TIMED_OUT|ETIMEDOUT|timeout/i.test(raw)) {
    return resourceKind === 'license' ? 'license-timeout' : 'network-timeout';
  }
  // DRM "server certificate" işlemleri TLS sertifika zinciri değildir. Yalnız
  // Chromium ağ kodu veya açık TLS/SSL doğrulama ifadesi güvenli kanıttır.
  if (/ERR_(?:CERT|SSL|TLS)_|SSL_ERROR|TLS\s+(?:handshake|certificate|connection)|SSL\s+certificate|certificate (?:verify|verification) failed/i.test(raw)) return 'tls-error';
  if (/ERR_(?:INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_REFUSED|CONNECTION_CLOSED|ADDRESS_UNREACHABLE|PROXY_CONNECTION_FAILED)/i.test(raw)) {
    return 'network-unreachable';
  }
  return null;
}

function classifyPlaybackEvidence(evidence = {}) {
  const kind = String(evidence.kind || '');
  const resourceKind = evidence.resourceKind || inferPlaybackResource(evidence);

  if (kind === 'component') {
    if (evidence.available === false) return makeDiagnostic('cdm-component-unavailable', evidence.detail || 'components API yok');
    if (evidence.ready === false && evidence.failed === true) {
      return makeDiagnostic('cdm-initialization-failed', evidence.detail || 'Widevine hazırlama hatası');
    }
    return null;
  }

  if (kind === 'gpu') {
    const status = String(evidence.videoDecode || 'bilinmiyor');
    if (/^(?:bilinmiyor|unknown|unavailable)$/i.test(status)) return null;
    return /^enabled/i.test(status) ? null : makeDiagnostic('gpu-decode-limited', `video_decode=${status}`);
  }

  if (kind === 'codec') {
    if (evidence.videoSupported === false || evidence.audioSupported === false) {
      return makeDiagnostic('codec-unsupported', `video=${evidence.videoSupported}; audio=${evidence.audioSupported}`);
    }
    return null;
  }

  if (kind === 'eme') {
    if (evidence.probeFailed === true) {
      return makeDiagnostic('capability-probe-failed', evidence.reason || 'sayfa bağlamı ölçülemedi');
    }
    if (evidence.apiAvailable === false) return makeDiagnostic('eme-api-unavailable', evidence.reason || 'requestMediaKeySystemAccess yok');
    if (evidence.supported === false) {
      if (evidence.videoSupported === false || evidence.audioSupported === false) {
        return makeDiagnostic('codec-unsupported', `EME ${evidence.reason || 'NotSupportedError'}; codec desteklenmiyor`);
      }
      return makeDiagnostic('key-system-unavailable', evidence.reason || 'NotSupportedError');
    }
    return null;
  }

  if (kind === 'http') {
    const status = Number(evidence.status || evidence.statusCode);
    if (status === 451) return makeDiagnostic('geo-restricted', `HTTP ${status}`, { status, resourceKind });
    // 401/403 belge sözleşmesi mevcut testlerde tanımlı (authentication-required / http-access-denied).
    if (resourceKind === 'document' && status >= 500 && status <= 599) {
      return makeDiagnostic('page-server-error', `HTTP ${status}`, { status, resourceKind });
    }
    if (status === 401) {
      return makeDiagnostic(resourceKind === 'license' ? 'license-access-denied' : 'authentication-required', `HTTP ${status}`, { status, resourceKind });
    }
    if (status === 403) {
      return makeDiagnostic(resourceKind === 'license' ? 'license-access-denied' : 'http-access-denied', `HTTP ${status}`, { status, resourceKind });
    }
    if (status === 429) return makeDiagnostic('service-throttled', `HTTP ${status}`, { status, resourceKind });
    if (status >= 500 && status <= 599) return makeDiagnostic('service-unavailable', `HTTP ${status}`, { status, resourceKind });
    return null;
  }

  if (kind === 'network') {
    if (evidence.canceled === true) return null;
    const code = networkDiagnostic(evidence.error || evidence.errorText, resourceKind);
    return code ? makeDiagnostic(code, evidence.error || evidence.errorText, { resourceKind }) : null;
  }

  if (kind === 'media') {
    const code = Number(evidence.errorCode || evidence.code);
    if (code === 2) return makeDiagnostic('media-network-error', evidence.errorMessage || 'MEDIA_ERR_NETWORK');
    if (code === 3) return makeDiagnostic('media-decode-error', evidence.errorMessage || 'MEDIA_ERR_DECODE');
    if (code === 4) return makeDiagnostic('media-source-unsupported', evidence.errorMessage || 'MEDIA_ERR_SRC_NOT_SUPPORTED');
    return null;
  }

  if (kind === 'paint') {
    if (evidence.state === 'black') return makeDiagnostic('black-video', evidence.detail || 'kare sayısı ilerlemedi');
    if (evidence.state === 'stalled') return makeDiagnostic('stalled-player', evidence.detail || 'oynatma ilerlemedi');
    return null;
  }

  if (kind === 'console') {
    const text = String(evidence.message || '');
    const lower = text.toLowerCase();
    const licenseSignal = /widevine|media\s*key|key\s*system|license|licence|\bcdm\b|encrypted\s*media|waitingforkey/i.test(text);
    const networkCode = networkDiagnostic(text, licenseSignal ? 'license' : resourceKind);
    if (networkCode) return makeDiagnostic(networkCode, text, { resourceKind: licenseSignal ? 'license' : resourceKind });
    const explicitGeo = /not available in (?:your|this) (?:country|region|location|territory)|geo(?:graphic)?(?:ally)?[-_ ]+(?:blocked|restricted)|(?:content|video|title|playback).{0,48}(?:region|country|territory|location).{0,32}(?:blocked|restricted|unavailable|denied)/i.test(lower);
    const neutralGeoUi = /(?:restriction|region|country|territory|location).{0,24}(?:setting|selector|configuration|metadata|rule).{0,24}(?:loaded|opened|disabled|ready)/i.test(lower);
    if (explicitGeo && !neutralGeoUi) {
      return makeDiagnostic('geo-restricted', text, { resourceKind });
    }
    if (/2312400/.test(text)) return makeDiagnostic('protected-playback-failed', text, { resourceKind: 'license' });
    // "failover" bir hata değildir; sayfa gezinmesiyle iptal edilen lisans
    // isteği de sunucu reddi sayılmaz. Hata sözcüklerini tam kelime olarak ara.
    const failure = /\b(?:error|fail(?:ed|ure)?|denied|reject(?:ed|ion)?|unsupported)\b|\bnot\s+(?:supported|allowed)\b/i.test(text);
    if (licenseSignal && failure) return makeDiagnostic('license-rejected', text, { resourceKind: 'license' });
    return null;
  }

  return null;
}

function createPlaybackDiagnosticTracker(options = {}) {
  const limit = Math.max(4, Number(options.limit) || 24);
  const dedupeMs = Math.max(0, Number(options.dedupeMs) || 5000);
  const dedupeLimit = Math.max(limit, Number(options.dedupeLimit) || 256);
  let recent = [];
  let counts = {};
  let capabilities = {};
  let lastSeen = new Map();
  let lastSample = null;
  let stalledSince = 0;
  let frameStagnantSince = 0;
  // Yeniden emisyon üstel gerileme sayaçları — sabit koşul sürerse 8/12 sn'de
  // bir özdeş fingerprint'ler `recent` (24 kayıt) listesini doldurup ayırt
  // edici olayları düşürüyordu (B83-12).
  let stalledEmits = 0;
  let frameStagnantEmits = 0;
  // Tavan aşıldıktan sonra bir sonraki emisyonun tabanı: aksi halde 'since'
  // sabit kalır ve sınır geçildikten sonra her örnekleme yeni kayıt üretir
  // (R86-04). Emisyon gerçekleşince güncellenir; durum düzelince sıfırlanır.
  let stalledLastEmitAt = 0;
  let frameStagnantLastEmitAt = 0;

  function record(evidence, at = Date.now()) {
    const diagnostic = classifyPlaybackEvidence(evidence);
    if (!diagnostic) return null;
    const fingerprint = `${diagnostic.code}:${diagnostic.evidence}`;
    const previousAt = lastSeen.get(fingerprint);
    if (previousAt !== undefined && at - previousAt < dedupeMs) return null;
    if (previousAt !== undefined) lastSeen.delete(fingerprint);
    lastSeen.set(fingerprint, at);
    while (lastSeen.size > dedupeLimit) lastSeen.delete(lastSeen.keys().next().value);
    const entry = { ...diagnostic, at };
    counts[entry.code] = (counts[entry.code] || 0) + 1;
    recent.unshift(entry);
    recent = recent.slice(0, limit);
    return entry;
  }

  function observeMediaSample(sample = {}, at = Date.now()) {
    const emitted = [];
    // Aynı HTMLMediaElement.error her 500 ms örneklemede kalır. Dedupe süresi
    // doldukça aynı hatayı yeniden yayınlamak yerine yalnız hata geçişini kaydet;
    // hata temizlenip yeniden oluşursa tekrar görünür.
    const errorCode = Number(sample.errorCode) || 0;
    const previousErrorCode = lastSample ? Number(lastSample.errorCode) || 0 : 0;
    const mediaError = errorCode && errorCode !== previousErrorCode
      ? record({ kind: 'media', errorCode, errorMessage: sample.errorMessage }, at) : null;
    if (mediaError) emitted.push(mediaError);
    const active = sample.paused === false && Number(sample.area) > 0;
    if (!active) {
      stalledSince = 0;
      frameStagnantSince = 0;
      stalledEmits = 0;
      frameStagnantEmits = 0;
      stalledLastEmitAt = 0;
      frameStagnantLastEmitAt = 0;
      lastSample = { ...sample, at };
      return emitted;
    }
    const currentTime = Number(sample.currentTime) || 0;
    const priorTime = lastSample ? Number(lastSample.currentTime) || 0 : currentTime;
    const progressed = currentTime > priorTime + 0.08;
    const visualVideo = Number(sample.videoWidth) > 0 && Number(sample.videoHeight) > 0;
    const frames = sample.totalVideoFrames === null || sample.totalVideoFrames === undefined
      ? NaN : Number(sample.totalVideoFrames);
    const priorFrames = !lastSample || lastSample.totalVideoFrames === null || lastSample.totalVideoFrames === undefined
      ? NaN : Number(lastSample.totalVideoFrames);

    if (progressed) {
      stalledSince = 0;
      stalledEmits = 0;
      stalledLastEmitAt = 0;
      if (visualVideo && Number.isFinite(frames) && Number.isFinite(priorFrames) && frames <= priorFrames) {
        if (!frameStagnantSince) { frameStagnantSince = lastSample.at || at; frameStagnantEmits = 0; frameStagnantLastEmitAt = 0; }
      } else {
        frameStagnantSince = 0;
        frameStagnantEmits = 0;
        frameStagnantLastEmitAt = 0;
      }
    } else if (Number(sample.readyState) < 3 || sample.spinnerVisible === true) {
      if (!stalledSince) { stalledSince = lastSample ? lastSample.at : at; stalledEmits = 0; stalledLastEmitAt = 0; }
    } else {
      stalledSince = 0;
      stalledEmits = 0;
      stalledLastEmitAt = 0;
    }

    // 'since' sıfırlanmaz — detay birikimli süreyi gösterir; eşik üstel
    // büyür (8→16→32→64→128 sn, 12→24→… sn) ki aynı koşul logu sellemesin.
    const frameThreshold = 8000 * (2 ** Math.min(frameStagnantEmits, 4));
    if (frameStagnantSince && at - frameStagnantSince >= frameThreshold
      && (frameStagnantEmits < 5 || at - frameStagnantLastEmitAt >= 8000 * 16)) {
      const item = record({ kind: 'paint', state: 'black', detail: `${Math.round((at - frameStagnantSince) / 1000)} sn kare yok` }, at);
      if (item) emitted.push(item);
      frameStagnantEmits += 1;
      frameStagnantLastEmitAt = at;
    }
    const stallThreshold = 12000 * (2 ** Math.min(stalledEmits, 4));
    if (stalledSince && at - stalledSince >= stallThreshold
      && (stalledEmits < 5 || at - stalledLastEmitAt >= 12000 * 16)) {
      const item = record({ kind: 'paint', state: 'stalled', detail: `${Math.round((at - stalledSince) / 1000)} sn ilerleme yok` }, at);
      if (item) emitted.push(item);
      stalledEmits += 1;
      stalledLastEmitAt = at;
    }
    lastSample = { ...sample, at };
    return emitted;
  }

  return {
    record,
    observeMediaSample,
    reset({ clearCapabilities = false } = {}) {
      recent = [];
      counts = {};
      lastSeen = new Map();
      lastSample = null;
      stalledSince = 0;
      frameStagnantSince = 0;
      stalledEmits = 0;
      frameStagnantEmits = 0;
      stalledLastEmitAt = 0;
      frameStagnantLastEmitAt = 0;
      if (clearCapabilities) capabilities = {};
    },
    setCapabilities(patch) {
      capabilities = { ...capabilities, ...(patch && typeof patch === 'object' ? patch : {}) };
    },
    snapshot() {
      return {
        classCount: Object.keys(DIAGNOSTIC_CATALOG).length,
        dedupeEntries: lastSeen.size,
        counts: { ...counts },
        capabilities: JSON.parse(JSON.stringify(capabilities)),
        recent: recent.map((entry) => ({ ...entry })),
      };
    },
  };
}

module.exports = {
  DIAGNOSTIC_CATALOG,
  classifyPlaybackEvidence,
  createPlaybackDiagnosticTracker,
  inferPlaybackResource,
  installPlaybackWebRequestDiagnostics,
  isPlaybackProbeContextCurrent,
  isRelevantPlaybackRequest,
  redactDiagnosticText,
};
