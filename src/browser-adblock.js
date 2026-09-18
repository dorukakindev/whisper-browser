'use strict';

const fs = require('fs');
const path = require('path');
const { isSensitiveKey, startsWithSensitivePrefix } = require('./browser-sensitive-keys');
function electronBlockerClass() {
  // Paket modül yüklenirken ELECTRON_DISABLE_SECURITY_WARNINGS değerini değiştirir.
  // Bu yan etkiyi yalnız sınıfı alacak kadar kısa tut; uygulamanın güvenlik
  // uyarılarını küresel olarak susturma.
  const key = 'ELECTRON_DISABLE_SECURITY_WARNINGS';
  const previous = process.env[key];
  try {
    return require('@ghostery/adblocker-electron').ElectronBlocker;
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
}
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_RECENT_BLOCKED = 30;

function safeErrorMessage(error) {
  return String(error?.message || error || 'Bilinmeyen hata').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function safeBlockedUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 500);
  } catch (_) {
    return '';
  }
}

function safeFilterRule(value) {
  return String(value || '')
    // Ortak hassas-anahtar sözlüğü camelCase OAuth adlarını da kapsar.
    .replace(/([?&])([a-z0-9_-]{1,64})=[^&\s|]+/gi, (match, sep, key) =>
      (isSensitiveKey(key) || startsWithSensitivePrefix(key) || /^key$/i.test(key))
        ? `${sep}${key}=[gizlendi]` : match)
    .replace(/\b(bearer)\s+[a-z0-9._~+\/-]+/gi, '$1 [gizlendi]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function blockedRequestEntry(request, result, now = Date.now()) {
  const url = safeBlockedUrl(request?.url);
  const type = String(request?.type || 'other').slice(0, 40);
  let rawRule = '';
  try { rawRule = result?.filter?.getFilter?.() || ''; } catch (_) {}
  const rule = safeFilterRule(rawRule);
  const subtitleLike = type === 'texttrack' || type === 'manifest'
    || /(?:caption|subtitle|timedtext|webvtt|ttml|\.srt(?:$|[/?])|\.vtt(?:$|[/?])|\.m3u8(?:$|[/?])|\.mpd(?:$|[/?]))/i.test(url);
  return { at: Number(now) || Date.now(), url, type, rule, subtitleLike };
}

async function readEngineCache(cachePath, fileSystem = fs.promises, now = Date.now()) {
  try {
    const stat = await fileSystem.stat(cachePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CACHE_BYTES) return null;
    return {
      buffer: new Uint8Array(await fileSystem.readFile(cachePath)),
      ageMs: Math.max(0, now - Number(stat.mtimeMs || 0)),
    };
  } catch (_) {
    return null;
  }
}

async function writeEngineCache(cachePath, buffer, fileSystem = fs.promises) {
  await fileSystem.mkdir(path.dirname(cachePath), { recursive: true });
  await fileSystem.writeFile(cachePath, buffer);
}

function fetchWithTimeout(fetchImpl, timeoutMs) {
  return async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Filtre listesi zaman aşımına uğradı.')), timeoutMs);
    timer.unref?.();
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

async function loadEngine({
  cachePath,
  blockerClass,
  fetchImpl = globalThis.fetch,
  fileSystem = fs.promises,
  now = Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  fetchTimeoutMs = 10000,
  logger = console,
} = {}) {
  if (!cachePath) throw new Error('Reklam filtresi önbellek yolu eksik.');
  if (typeof fetchImpl !== 'function') throw new Error('Reklam filtresi için fetch kullanılamıyor.');
  const Blocker = blockerClass || electronBlockerClass();
  const cached = await readEngineCache(cachePath, fileSystem, now);
  if (cached && cached.ageMs <= cacheTtlMs) {
    try {
      return { engine: Blocker.deserialize(cached.buffer), source: 'cache', stale: false };
    } catch (_) {
      // Sürüm değişmiş veya yarım kalmış önbellek yeniden oluşturulur.
    }
  }

  try {
    const engine = await Blocker.fromPrebuiltAdsOnly(fetchWithTimeout(fetchImpl, fetchTimeoutMs));
    try {
      await writeEngineCache(cachePath, engine.serialize(), fileSystem);
    } catch (error) {
      logger.warn?.(`Reklam filtresi önbelleği yazılamadı: ${safeErrorMessage(error)}`);
    }
    return { engine, source: 'network', stale: false };
  } catch (error) {
    if (cached) {
      try {
        return { engine: Blocker.deserialize(cached.buffer), source: 'cache', stale: true };
      } catch (_) {}
    }
    throw error;
  }
}

function createBrowserAdblock(options = {}) {
  let browserSession = null;
  let engine = null;
  let loadPromise = null;
  let enablePromise = null;
  let requested = options.initialEnabled !== false;
  let enabled = false;
  let state = requested ? 'loading' : 'disabled';
  let error = '';
  let source = '';
  let stale = false;
  let blocked = 0;
  let allowedBySite = 0;
  let recentBlocked = [];
  let recentAllowed = [];
  let eventBound = false;
  let siteBypassInstalled = false;
  const cosmeticWarnings = new WeakMap();
  const reportCosmeticFailure = (sender, url, failure, message) => {
    const { isBrowserScriptContextLoss } = require('./browser-script-execution');
    if (!sender || sender.isDestroyed?.() || isBrowserScriptContextLoss(failure)) return;
    const page = safeBlockedUrl(url || sender.getURL?.()) || 'unknown-page';
    if (cosmeticWarnings.get(sender) === page) return;
    cosmeticWarnings.set(sender, page);
    options.logger?.warn?.(message);
  };

  const snapshot = (changed = false) => ({
    ok: state !== 'error',
    requested,
    enabled,
    state,
    error,
    source,
    stale,
    blocked,
    allowedBySite,
    recentBlocked: recentBlocked.map((entry) => ({ ...entry })),
    recentAllowed: recentAllowed.map((entry) => ({ ...entry })),
    changed,
    engine: 'Ghostery',
  });

  const bindEvents = () => {
    if (!engine || eventBound || typeof engine.on !== 'function') return;
    engine.on('request-blocked', (request, result) => {
      blocked += 1;
      const entry = blockedRequestEntry(request, result);
      recentBlocked = [entry, ...recentBlocked].slice(0, MAX_RECENT_BLOCKED);
      try { options.onBlocked?.({ ...entry }); } catch (callbackError) {
        options.logger?.warn?.(`Engellenen istek tanısı aktarılamadı: ${safeErrorMessage(callbackError)}`);
      }
    });
    eventBound = true;
  };

  const installSiteBypass = () => {
    if (!engine || siteBypassInstalled || typeof options.isSitePaused !== 'function') return;
    const paused = (...args) => {
      try { return options.isSitePaused(...args) === true; } catch (_) { return false; }
    };
    if (typeof engine.onBeforeRequest === 'function') {
      const original = engine.onBeforeRequest.bind(engine);
      engine.onBeforeRequest = (details, callback) => {
        if (!paused(details)) return original(details, callback);
        const entry = { at: Date.now(), url: safeBlockedUrl(details?.url),
          type: String(details?.resourceType || 'other').slice(0, 40), decision: 'allowed-by-site-switch' };
        allowedBySite += 1;
        recentAllowed = [entry, ...recentAllowed].slice(0, MAX_RECENT_BLOCKED);
        try { options.onAllowed?.({ ...entry }); } catch (_) {}
        callback({});
      };
    }
    if (typeof engine.onHeadersReceived === 'function') {
      const original = engine.onHeadersReceived.bind(engine);
      engine.onHeadersReceived = (details, callback) => paused(details) ? callback({}) : original(details, callback);
    }
    if (typeof engine.onInjectCosmeticFilters === 'function') {
      const original = engine.onInjectCosmeticFilters.bind(engine);
      const schedule=require('./browser-cosmetic-executor').createCosmeticExecutor((failure, context)=>{
        reportCosmeticFailure(context?.webContents, context?.url, failure,
          'Reklam engelleyici görsel filtresi bu sayfada uygulanamadı.');
      });
      engine.onInjectCosmeticFilters = (event, url, message) => {
        const allowed=()=>!paused({url,webContentsId:event?.sender?.id,resourceType:'cosmetic'});
        if(!allowed()||!event?.sender||event.sender.isDestroyed())return;
        const sender=new Proxy(event.sender,{get(target,key){
          if(key==='executeJavaScript'||key==='insertCSS')return (...args)=>schedule(target,key,args,allowed);
          const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
        }});
        return Promise.resolve(original({sender,frameId:event.frameId,processId:event.processId},url,message))
          .catch((failure)=>reportCosmeticFailure(event.sender, url, failure,
            'Reklam engelleyici görsel filtre isteği tamamlanamadı.'));
      };
    }
    siteBypassInstalled = true;
  };

  const ensureLoaded = async () => {
    if (engine) return engine;
    if (!loadPromise) {
      state = 'loading';
      error = '';
      loadPromise = loadEngine(options).then((result) => {
        engine = result.engine;
        source = result.source;
        stale = result.stale;
        installSiteBypass();
        bindEvents();
        return engine;
      }).finally(() => { loadPromise = null; });
    }
    return loadPromise;
  };

  const setEnabled = async (session, nextEnabled) => {
    if (session) browserSession = session;
    requested = nextEnabled !== false;
    if (!requested) {
      const changed = enabled;
      if (enabled && engine && browserSession) {
        try { engine.disableBlockingInSession(browserSession); } catch (_) {}
      }
      enabled = false;
      state = 'disabled';
      error = '';
      return snapshot(changed);
    }
    if (!browserSession) {
      state = 'error';
      error = 'Tarayıcı oturumu hazırlanamadı.';
      return snapshot(false);
    }
    if (enabled) return snapshot(false);
    if (enablePromise) {
      await enablePromise;
      return snapshot(false);
    }
    enablePromise = (async () => {
      try {
        const loaded = await ensureLoaded();
        if (!requested) return snapshot(false);
        try {
          loaded.enableBlockingInSession(browserSession);
        } catch (enableError) {
          // Ghostery context'i dinleyiciler tamamen kurulmadan kaydetmiş olabilir.
          // Kısmi kurulumu temizle ki sonraki deneme etkin görünmesin.
          try { loaded.disableBlockingInSession(browserSession); } catch (_) {}
          throw enableError;
        }
        enabled = true;
        state = 'enabled';
        error = '';
        return snapshot(true);
      } catch (loadError) {
        enabled = false;
        state = 'error';
        error = `Reklam filtreleri hazırlanamadı: ${safeErrorMessage(loadError)}`;
        options.logger?.warn?.(error);
        return snapshot(false);
      }
    })();
    try {
      return await enablePromise;
    } finally {
      enablePromise = null;
    }
  };

  return {
    getState: () => snapshot(false),
    setEnabled,
    waitUntilReady: async () => {
      if (requested && !enabled && state !== 'error') await setEnabled(browserSession, true);
      return snapshot(false);
    },
  };
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  MAX_CACHE_BYTES,
  MAX_RECENT_BLOCKED,
  blockedRequestEntry,
  createBrowserAdblock,
  fetchWithTimeout,
  loadEngine,
  readEngineCache,
  safeErrorMessage,
  safeBlockedUrl,
  safeFilterRule,
  writeEngineCache,
};
