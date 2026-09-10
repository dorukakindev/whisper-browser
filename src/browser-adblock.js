'use strict';

const fs = require('fs');
const path = require('path');
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

function safeErrorMessage(error) {
  return String(error?.message || error || 'Bilinmeyen hata').replace(/\s+/g, ' ').trim().slice(0, 500);
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
  let eventBound = false;

  const snapshot = (changed = false) => ({
    ok: state !== 'error',
    requested,
    enabled,
    state,
    error,
    source,
    stale,
    blocked,
    changed,
    engine: 'Ghostery',
  });

  const bindEvents = () => {
    if (!engine || eventBound || typeof engine.on !== 'function') return;
    engine.on('request-blocked', () => { blocked += 1; });
    eventBound = true;
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
  createBrowserAdblock,
  fetchWithTimeout,
  loadEngine,
  readEngineCache,
  safeErrorMessage,
  writeEngineCache,
};
