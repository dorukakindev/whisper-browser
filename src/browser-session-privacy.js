// Electron clearData'nın origin-bazlı desteklediği site verisi türleri.
// 'downloads' bilinçli dışarıda: kullanıcı dosyası, site verisi değil.
// 'cache' ve 'backgroundFetch' de bilinçli dışarıda: Electron'da bu
// dataType'lar origin filtresini uygulamaz — site temizliği tüm oturumun
// HTTP cache'ini/arka plan fetch kayıtlarını siler ve diğer siteleri
// bozardı. Tam temizlik ancak 'session reset' yolunda yapılır (B83-35 notu).
const SITE_DATA_TYPES = Object.freeze([
  'cookies',
  'fileSystems',
  'indexedDB',
  'localStorage',
  'serviceWorkers',
  'webSQL',
]);

function browserHttpOrigin(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || '')); } catch (_) { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
  return { origin: parsed.origin, host: parsed.hostname };
}

async function flushCookies(browserSession) {
  if (browserSession?.cookies && typeof browserSession.cookies.flushStore === 'function') {
    await browserSession.cookies.flushStore();
  }
}

async function closeBrowserSessionConnections(browserSession) {
  if (!browserSession || typeof browserSession.closeAllConnections !== 'function') {
    throw new Error('Tarayıcı oturumu bağlantıları kapatılamıyor.');
  }
  await browserSession.closeAllConnections();
}

async function clearBrowserSiteData(browserSession, rawUrl) {
  const parsed = browserHttpOrigin(rawUrl);
  if (!parsed) return { ok: false, error: 'Site verilerini temizlemek için geçerli bir http/https adresi gerekli.' };
  if (!browserSession || typeof browserSession.clearData !== 'function'
      || typeof browserSession.clearStorageData !== 'function') {
    throw new Error('Tarayıcı oturumu kullanılamıyor.');
  }

  // Temizlik tamamlandıktan sonra uçuş hâlindeki bir yanıtın Set-Cookie veya
  // storage yazımıyla veriyi geri getirmesini engelle.
  await closeBrowserSessionConnections(browserSession);
  await browserSession.clearData({
    origins: [parsed.origin],
    dataTypes: [...SITE_DATA_TYPES],
    originMatchingMode: 'origin-in-all-contexts',
  });

  // clearData'nın Electron sözleşmesi Cache Storage'ı ayrı bir veri türü
  // olarak sunmuyor. HTTP cache'e dokunmadan yalnız hedef origin'in Cache
  // Storage alanını eski, dar API ile ayrıca temizle.
  let cacheStorageCleared = true;
  try {
    await browserSession.clearStorageData({
      origin: parsed.origin,
      storages: ['cachestorage'],
    });
  } catch (_) {
    cacheStorageCleared = false;
  }
  // HTTP Basic/Digest kimlik önbelleği clearData kapsamında değil ve
  // clearAuthCache origin-bazlı filtre sunmadığından burada çağrılmıyor:
  // tek-origin temizliği diğer sitelerin kimlik önbelleğini de silmez.
  // Oturum genelindeki kimlik temizliği yalnız resetBrowserSessionData'da
  // yapılır (R83-35).
  await flushCookies(browserSession);
  return {
    ok: cacheStorageCleared,
    partial: !cacheStorageCleared,
    error: cacheStorageCleared ? '' : 'Site verilerinin Cache Storage bölümü temizlenemedi. HTTP önbelleği bu işlem kapsamında değildir.',
    host: parsed.host,
    origin: parsed.origin,
    removed: null,
    failed: cacheStorageCleared ? 0 : 1,
    total: null,
  };
}

async function clearAllBrowserCookies(browserSession) {
  if (!browserSession || typeof browserSession.clearData !== 'function') {
    throw new Error('Tarayıcı oturumu kullanılamıyor.');
  }
  await closeBrowserSessionConnections(browserSession);
  // cookies.get() bütün değerleri ana sürece taşır. Sayaç uğruna oturum
  // belirteçlerini okumadan Chromium'un veri temizleyicisini kullan.
  await browserSession.clearData({ dataTypes: ['cookies'] });
  await flushCookies(browserSession);
  return { ok: true, removed: null, failed: 0, total: null };
}

function destroyBrowserSessionWindows(windows, browserSession, excludedWindow = null) {
  let destroyed = 0;
  let failed = 0;
  for (const window of Array.isArray(windows) ? windows : []) {
    if (!window || window === excludedWindow) continue;
    let matchesSession = false;
    try {
      if (typeof window.isDestroyed === 'function' && window.isDestroyed()) continue;
      matchesSession = !!window.webContents && window.webContents.session === browserSession;
      if (!matchesSession) continue;
      window.destroy();
      destroyed++;
    } catch (_) {
      if (matchesSession) failed++;
    }
  }
  return { destroyed, failed };
}

async function resetBrowserSessionData(browserSession) {
  await closeBrowserSessionConnections(browserSession);
  await browserSession.clearStorageData();
  await browserSession.clearCache();
  if (typeof browserSession.clearAuthCache === 'function') {
    await browserSession.clearAuthCache();
  }
  await flushCookies(browserSession);
}

async function shutdownBrowserSession(browserSession, {
  activeReset = null,
  activeMutation = null,
  destroyView = () => true,
  listWindows = () => [],
  excludedWindow = null,
} = {}) {
  if (activeReset) {
    try {
      await activeReset;
      return { resetCompleted: true, viewClosed: true, destroyedWindows: 0, failedWindows: 0 };
    } catch (_) {}
  } else if (activeMutation) {
    try { await activeMutation; } catch (_) {}
  }

  let viewClosed = false;
  try { viewClosed = destroyView() !== false; } catch (_) {}
  let popupResult = { destroyed: 0, failed: 0 };
  try {
    popupResult = destroyBrowserSessionWindows(listWindows(), browserSession, excludedWindow);
  } catch (_) {
    popupResult.failed = 1;
  }
  if (!browserSession || typeof browserSession.flushStorageData !== 'function') {
    throw new Error('Tarayıcı oturumu diske yazılamıyor.');
  }
  await closeBrowserSessionConnections(browserSession);
  browserSession.flushStorageData();
  await flushCookies(browserSession);
  return {
    resetCompleted: false,
    viewClosed,
    destroyedWindows: popupResult.destroyed,
    failedWindows: popupResult.failed,
  };
}

module.exports = {
  SITE_DATA_TYPES,
  browserHttpOrigin,
  clearAllBrowserCookies,
  clearBrowserSiteData,
  closeBrowserSessionConnections,
  destroyBrowserSessionWindows,
  resetBrowserSessionData,
  shutdownBrowserSession,
};
