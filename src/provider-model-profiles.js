'use strict';

(function exposeProviderModelProfiles(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WhisperProviderModels = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const MAX_PROVIDERS = 32;
  const MAX_MODELS_PER_PROVIDER = 64;

  function cleanModel(value) {
    const model = String(value || '').normalize('NFC').trim();
    if (!model || model.length > 300 || /[\u0000-\u001f\u007f]/u.test(model)) return '';
    return model;
  }

  function cleanScope(value) {
    const scope = String(value || '').normalize('NFC').trim();
    if (!scope || scope.length > 600 || DANGEROUS_KEYS.has(scope)
        || /[\u0000-\u001f\u007f]/u.test(scope)) return '';
    return scope;
  }

  function normalizeProviderModelProfiles(raw, { strict = false } = {}) {
    let parsed = raw;
    if (typeof parsed === 'string') {
      if (!parsed.trim()) return {};
      try { parsed = JSON.parse(parsed); }
      catch (_) {
        if (strict) throw new TypeError('Sağlayıcı model listesi geçerli JSON değil.');
        return {};
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      if (strict) throw new TypeError('Sağlayıcı model listesi nesne olmalıdır.');
      return {};
    }
    const entries = Object.entries(parsed);
    if (strict && entries.length > MAX_PROVIDERS) {
      throw new TypeError(`En fazla ${MAX_PROVIDERS} sağlayıcı model listesi saklanabilir.`);
    }
    const clean = {};
    for (const [rawScope, rawModels] of entries.slice(0, MAX_PROVIDERS)) {
      const scope = cleanScope(rawScope);
      if (!scope || !Array.isArray(rawModels)) {
        if (strict) throw new TypeError('Sağlayıcı model listesi geçersiz.');
        continue;
      }
      if (strict && rawModels.length > MAX_MODELS_PER_PROVIDER) {
        throw new TypeError(`Bir sağlayıcıda en fazla ${MAX_MODELS_PER_PROVIDER} model saklanabilir.`);
      }
      const seen = new Set();
      const models = [];
      for (const rawModel of rawModels.slice(0, MAX_MODELS_PER_PROVIDER)) {
        const model = cleanModel(rawModel);
        if (!model) {
          if (strict) throw new TypeError('Model adı boş, çok uzun veya geçersiz karakter içeriyor.');
          continue;
        }
        if (!seen.has(model)) {
          seen.add(model);
          models.push(model);
        }
      }
      if (models.length) clean[scope] = models;
    }
    return clean;
  }

  function serializeProviderModelProfiles(raw) {
    return JSON.stringify(normalizeProviderModelProfiles(raw));
  }

  function providerModelsForScope(raw, scope) {
    const safeScope = cleanScope(scope);
    if (!safeScope) return [];
    return [...(normalizeProviderModelProfiles(raw)[safeScope] || [])];
  }

  function addProviderModel(raw, scope, value) {
    const profiles = normalizeProviderModelProfiles(raw);
    const safeScope = cleanScope(scope);
    const model = cleanModel(value);
    if (!safeScope) throw new TypeError('Sağlayıcı seçilmedi.');
    if (!model) throw new TypeError('Geçerli bir model adı girin.');
    const models = [...(profiles[safeScope] || [])];
    if (!models.includes(model)) models.push(model);
    if (models.length > MAX_MODELS_PER_PROVIDER) {
      throw new TypeError(`Bir sağlayıcıda en fazla ${MAX_MODELS_PER_PROVIDER} model saklanabilir.`);
    }
    return { ...profiles, [safeScope]: models };
  }

  function removeProviderModel(raw, scope, value) {
    const profiles = normalizeProviderModelProfiles(raw);
    const safeScope = cleanScope(scope);
    const model = cleanModel(value);
    if (!safeScope || !model || !profiles[safeScope]) return profiles;
    const models = profiles[safeScope].filter((item) => item !== model);
    const next = { ...profiles };
    if (models.length) next[safeScope] = models;
    else delete next[safeScope];
    return next;
  }

  return {
    MAX_PROVIDERS,
    MAX_MODELS_PER_PROVIDER,
    cleanModel,
    normalizeProviderModelProfiles,
    serializeProviderModelProfiles,
    providerModelsForScope,
    addProviderModel,
    removeProviderModel,
  };
});
