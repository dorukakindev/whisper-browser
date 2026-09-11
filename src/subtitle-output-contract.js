'use strict';

// Backend `done` olayındaki dosyalarin anlamsal rolunu tek yerde yorumlar.
// Dosya adindaki `.tr`, `.en` gibi ekler kanit degildir: kullanici dosyayi
// yeniden adlandirabilir veya yalniz ceviri ciktisi uretilmis olabilir.
(function expose(factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.SubtitleOutputContract = api;
})(function buildContract() {
  const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa)$/i;
  const ROLES = new Set(['source', 'translation', 'dual']);

  function cleanDescriptor(value) {
    if (!value || typeof value !== 'object') return null;
    const path = typeof value.path === 'string' ? value.path.trim() : '';
    const role = typeof value.role === 'string' ? value.role.toLowerCase() : '';
    if (!path || !SUBTITLE_EXT.test(path) || !ROLES.has(role)) return null;
    const total = Math.max(0, Number(value.total) || 0);
    const completed = Math.max(0, Math.min(total || Infinity, Number(value.completed) || 0));
    const failed = Math.max(0, Number(value.failed) || 0);
    const status = value.status === 'partial' || failed > 0 ? 'partial' : 'complete';
    return {
      path,
      role,
      language: typeof value.language === 'string' ? value.language : '',
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : '',
      sourceHash: typeof value.sourceHash === 'string' ? value.sourceHash : '',
      status,
      total,
      completed,
      failed,
      lastError: typeof value.lastError === 'string' ? value.lastError : '',
    };
  }

  function outputDescriptors(event) {
    if (!event || !Array.isArray(event.outputs)) return [];
    const seen = new Set();
    const result = [];
    for (const raw of event.outputs) {
      const item = cleanDescriptor(raw);
      if (!item || seen.has(item.path)) continue;
      seen.add(item.path);
      result.push(item);
    }
    return result;
  }

  function legacyDescriptors(event, fallbackRole = 'source') {
    if (!event || !Array.isArray(event.files) || !ROLES.has(fallbackRole)) return [];
    return [...new Set(event.files.filter((path) => typeof path === 'string' && SUBTITLE_EXT.test(path)))]
      .map((path) => ({ path, role: fallbackRole, language: '', sourceId: '', sourceHash: '',
        status: 'complete', total: 0, completed: 0, failed: 0, lastError: '', legacy: true }));
  }

  function selectOutputs(event, options = {}) {
    const explicit = outputDescriptors(event);
    let items = explicit.length ? explicit : legacyDescriptors(event, options.fallbackRole || 'source');
    const sourceIds = [...new Set(items.map((item) => item.sourceId).filter(Boolean))];
    if (sourceIds.length > 1) items = items.filter((item) => !item.sourceId || item.sourceId === sourceIds[0]);
    return {
      explicit: explicit.length > 0,
      source: items.find((item) => item.role === 'source') || null,
      translation: items.find((item) => item.role === 'translation') || null,
      dual: items.find((item) => item.role === 'dual') || null,
      items,
    };
  }

  function outputLabel(item) {
    if (!item) return '';
    const role = item.role === 'translation' ? 'Çeviri' : item.role === 'dual' ? 'Çift dilli' : 'Kaynak';
    const language = item.language ? ` · ${item.language}` : '';
    const progress = item.status === 'partial' && item.total
      ? ` · ${item.completed}/${item.total} hazır` : '';
    const failure = item.status === 'partial' && item.lastError ? ` · ${errorLabel(item.lastError)}` : '';
    return `${role}${language}${progress}${failure}`;
  }

  function errorLabel(code) {
    return ({
      quota: 'kota dolu', authentication: 'API anahtarı/izin hatası', rate_limit: 'hız sınırı',
      timeout: 'zaman aşımı', invalid_response: 'bozuk yanıt', empty_response: 'boş yanıt',
      server_error: 'sağlayıcı sunucu hatası', network_error: 'ağ hatası',
      untranslated_source: 'kaynak metin çevrilmemiş', empty_translation: 'çeviri boş',
      timeline_mismatch: 'zaman çizelgesi uyuşmuyor',
      client_missing: 'API istemcisi eksik', api_key_missing: 'API anahtarı eksik',
      api_failure: 'API hatası',
    })[code] || 'çeviri hatası';
  }

  return { outputDescriptors, selectOutputs, outputLabel, errorLabel };
});
