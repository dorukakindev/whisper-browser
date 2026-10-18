'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
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
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
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
  const temporary = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await fileSystem.writeFile(temporary, buffer);
    await fileSystem.rename(temporary, cachePath);
  } finally {
    await fileSystem.unlink(temporary).catch(() => {});
  }
}

function fetchWithTimeout(fetchImpl, timeoutMs) {
  return async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Filtre listesi zaman aşımına uğradı.')), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (response.ok === false) throw new Error(`Filtre indirme HTTP ${response.status}`);
      // Ghostery consumes text after fetch resolves. Keep the timeout alive
      // through the body too; a stalled body must not hang the entire engine.
      const body = typeof response.text === 'function' ? await response.text() : null;
      return body === null ? response : { ok: true, text: async () => body };
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
      return { engine: Blocker.deserialize(cached.buffer), source: 'cache', stale: false,
        updatedAt: now - cached.ageMs };
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
    return { engine, source: 'network', stale: false, updatedAt: now };
  } catch (error) {
    if (cached) {
      try {
        return { engine: Blocker.deserialize(cached.buffer), source: 'cache', stale: true,
          updatedAt: now - cached.ageMs };
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
  let updatedAt = 0;
  let refreshTimer = null;
  let refreshPromise = null;
  let firstActivation = true;
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
    updatedAt,
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
        const frame = event?.senderFrame;
        // Do not turn a late preload message into an injection in a new page.
        const allowed=()=>requested && !paused({url,webContentsId:event?.sender?.id,resourceType:'cosmetic'})
          && (!frame || (!frame.isDestroyed?.() && frame.url === url));
        if(!allowed()||!event?.sender||event.sender.isDestroyed())return;
        const sender=new Proxy(event.sender,{get(target,key){
          // WebContents.executeJavaScript waits for did-stop-loading. A
          // scriptlet which wraps fetch/JSON must run in its sending frame
          // while the document is loading, before later player requests.
          if(key==='executeJavaScript')return (script,...args)=> {
            // Resource dependencies declare functions/classes (e.g. JSONPath).
            // A separate lexical scope prevents redeclarations and proxy
            // recursion when several scriptlets use the same helper names.
            const isolated = `(function () {\n${script}\n})();`;
            if(typeof frame?.executeJavaScript!=='function')return schedule(target,key,[isolated,...args],allowed);
            return Promise.resolve().then(()=>allowed() ? frame.executeJavaScript(isolated,...args) : undefined)
              .catch((failure)=>reportCosmeticFailure(target,url,failure,
                'Reklam engelleyici betiği bu sayfada uygulanamadı.'));
          };
          if(key==='insertCSS' && frame)return (...args)=>
            Promise.resolve().then(()=>allowed() ? target.insertCSS(...args) : undefined)
              .catch((failure)=>reportCosmeticFailure(target,url,failure,
                'Reklam engelleyici görsel filtresi bu sayfada uygulanamadı.'));
          if(key==='insertCSS')return (...args)=>schedule(target,key,args,allowed);
          const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
        }});
        return Promise.resolve(original({sender,senderFrame:frame,frameId:event.frameId,processId:event.processId},url,message))
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
        updatedAt = result.updatedAt;
        installSiteBypass();
        bindEvents();
        return engine;
      }).finally(() => { loadPromise = null; });
    }
    return loadPromise;
  };

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (!requested || !enabled) return;
    const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const delay = stale ? 30 * 60 * 1000 : Math.max(60000, updatedAt + ttl - Date.now());
    refreshTimer = setTimeout(() => { void refresh(); }, delay);
    refreshTimer.unref?.();
  };

  const refresh = async () => {
    if (!requested || !enabled) return snapshot(false);
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const result = await loadEngine({ ...options, cacheTtlMs: -1 });
        if (!requested || !enabled) return snapshot(false);
        if (result.stale) { stale = true; return snapshot(false); }
        const previous = engine;
        const targetSession = browserSession;
        previous.disableBlockingInSession(targetSession);
        try {
          engine = result.engine;
          eventBound = false;
          siteBypassInstalled = false;
          installSiteBypass();
          bindEvents();
          engine.enableBlockingInSession(targetSession);
        }
        catch (failure) {
          try { engine.disableBlockingInSession(targetSession); } catch (_) {}
          engine = previous;
          previous.enableBlockingInSession(targetSession);
          throw failure;
        }
        source = result.source;
        updatedAt = result.updatedAt;
        stale = false;
        return snapshot(true);
      } catch (failure) {
        stale = true;
        options.logger?.warn?.(`Reklam filtreleri yenilenemedi: ${safeErrorMessage(failure)}`);
        return snapshot(false);
      }
    })();
    try {
      const result = await refreshPromise;
      try { options.onStateChanged?.(result); } catch (_) {}
      return result;
    } finally { refreshPromise = null; scheduleRefresh(); }
  };

  const setEnabled = async (session, nextEnabled) => {
    if (session) browserSession = session;
    requested = nextEnabled !== false;
    if (!requested) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
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
        // Registering a session preload only affects future documents. A cold
        // filter download may finish after the user's first page has opened.
        if (firstActivation) {
          firstActivation = false;
          for (const page of options.getOpenPages?.() || []) {
            try {
              const url = page.getURL();
              if (!/^https?:\/\//i.test(url)) continue;
              void Promise.resolve(loaded.onInjectCosmeticFilters?.({ sender: page,
                senderFrame: page.mainFrame }, url)).catch(() => {});
            } catch (_) {}
          }
        }
        scheduleRefresh();
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
    refresh,
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
