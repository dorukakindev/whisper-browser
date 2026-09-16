(function providerApiKeysModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.WhisperProviderApiKeys = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function providerApiKeysFactory() {
  'use strict';

  const HOST_SCOPES = Object.freeze({
    'api.shuaiapi.com': 'shuaiapi',
    'cdn.shuaiapi.com': 'shuaiapi',
    'oai.sb': 'shuaiapi',
    'api.oai.sb': 'shuaiapi',
    'codecraftapi.com': 'codecraftapi',
    '4sapi.com': '4sapi',
    '4sapi.org': '4sapi',
    '4sapi.cn': '4sapi',
    '4sapi.net': '4sapi',
    '4sapi.ai': '4sapi',
    '4stoken.com': '4sapi',
    'api.openai.com': 'openai',
    'generativelanguage.googleapis.com': 'gemini',
    'api.deepseek.com': 'deepseek',
    'openrouter.ai': 'openrouter',
    'api.groq.com': 'groq',
  });
  const MAX_PROFILES = 32;
  const UNSAFE_PROFILE_SCOPES = new Set(['__proto__', 'prototype', 'constructor']);

  function providerCredentialScope(preset, customBaseUrl = '', inheritedPreset = '', inheritedCustomBaseUrl = '') {
    let selected = String(preset || '').trim();
    let custom = String(customBaseUrl || '').trim();
    if (!selected || selected === 'inherit') {
      selected = String(inheritedPreset || '').trim();
      custom = String(inheritedCustomBaseUrl || '').trim();
    }
    const raw = selected === 'custom' ? custom : selected;
    if (!raw) return '';
    try {
      const url = new URL(raw);
      const known = HOST_SCOPES[url.hostname.toLowerCase()];
      if (known) return `provider:${known}`;
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      return `endpoint:${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}`.slice(0, 600);
    } catch (_) {
      return `custom:${raw.replace(/\s+/g, ' ').slice(0, 500)}`;
    }
  }

  function normalizeProviderKeyProfiles(value) {
    let parsed = value;
    if (typeof value === 'string') {
      if (!value.trim()) return {};
      try { parsed = JSON.parse(value); } catch (_) { return {}; }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [rawScope, rawKey] of Object.entries(parsed).slice(0, MAX_PROFILES)) {
      const scope = String(rawScope || '').trim().slice(0, 600);
      const apiKey = typeof rawKey === 'string' ? rawKey.trim().slice(0, 10000) : '';
      if (scope && apiKey && !UNSAFE_PROFILE_SCOPES.has(scope)) clean[scope] = apiKey;
    }
    return clean;
  }

  function serializeProviderKeyProfiles(value) {
    const clean = normalizeProviderKeyProfiles(value);
    return JSON.stringify(Object.fromEntries(Object.entries(clean).sort(([left], [right]) => left.localeCompare(right))));
  }

  function updateProviderKeyProfile(profiles, scope, visibleValue, edited = false) {
    const clean = normalizeProviderKeyProfiles(profiles);
    const id = String(scope || '').trim();
    if (!id || UNSAFE_PROFILE_SCOPES.has(id)) return clean;
    const value = String(visibleValue || '').trim();
    if (value) clean[id] = value;
    else if (edited) delete clean[id];
    return clean;
  }

  function providerKeyForScope(profiles, scope) {
    const id = String(scope || '').trim();
    if (!id || UNSAFE_PROFILE_SCOPES.has(id)) return '';
    return normalizeProviderKeyProfiles(profiles)[id] || '';
  }

  return {
    MAX_PROFILES,
    normalizeProviderKeyProfiles,
    providerCredentialScope,
    providerKeyForScope,
    serializeProviderKeyProfiles,
    updateProviderKeyProfile,
  };
}));
