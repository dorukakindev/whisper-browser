/* V3-T02 — Koşullu katalog uzantısı: özgün dil, yapım ülkesi, yönetmen kimliği.
   Dil ve ülke AYRI alanlardır; oyuncu filmi yönetmen rotasında yoktur; kırpılmış (provider-truncated) liste
   tam filmografi değildir; bilinmeyen alan 'unknown' kalır ve 'yes' sayılmaz. Saf, ağ yok. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatalogConditions = api;
})(globalThis, () => {
  'use strict';

  const lang = (v) => {
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/_/g, '-').toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(t)) return null;
    try {
      // ICU maps ISO 639 aliases (tur/tr, eng/en, fra/fr) consistently.
      // "und" means undetermined; it is missing metadata, not a language fact.
      const primary = Intl.getCanonicalLocales(t)[0].split('-')[0].toLowerCase();
      return primary === 'und' ? null : primary;
    } catch { return null; }
  };
  const country = (v) => { const t = String(v == null ? '' : v).trim().toUpperCase(); return /^[A-Z]{2}$/.test(t) ? t : null; };
  const uniq = (a) => Array.from(new Set(a));

  /** Yalnız mevcut metadata'dan; tahmin yok. */
  function normalizeCatalogFacts(item) {
    const it = item || {};
    const ol = lang(it.originalLanguage);
    const cs = Array.isArray(it.productionCountries) ? uniq(it.productionCountries.map(country).filter(Boolean)) : null;
    const crew = Array.isArray(it.crew) ? it.crew : null;
    const directors = Array.isArray(it.directorIds) ? uniq(it.directorIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))
      : crew ? uniq(crew.filter(c => c && /^director$/i.test(String(c.job || '')) && typeof c.personId === 'string' && c.personId).map(c => c.personId)) : null;
    return {
      itemId: String(it.itemId ?? it.id ?? ''),
      originalLanguage: ol, productionCountries: cs && cs.length ? cs : (cs ? [] : null),
      directorIds: directors, crewTruncated: !!(it.crewTruncated || it.directorsTruncated),
      audioLanguage: lang(it.audioLanguage),
    };
  }

  function validateConditions(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['originalLanguages', 'productionCountries', 'directorIds'].includes(key))) throw Error('Unknown catalog condition.');
    const result = {};
    for (const [field, normalize] of [['originalLanguages', lang], ['productionCountries', country], ['directorIds', value => typeof value === 'string' && /^[\w:-]{1,100}$/.test(value) ? value : null]]) {
      const values = raw[field] ?? [];
      if (!Array.isArray(values) || values.length > 20 || values.some(value => !normalize(value))) throw Error('Invalid catalog condition values.');
      result[field] = uniq(values.map(normalize));
    }
    return result;
  }

  const anyOf = (selected, actual) => selected.some((s) => actual.includes(s));
  /** → 'yes' | 'no' | 'unknown'. Alanlar VE ile birleşir; herhangi biri unknown ve diğerleri yes ise unknown. */
  function matchConditions(facts, cond) {
    const c = validateConditions(cond);
    const checks = [];
    if (c.originalLanguages && c.originalLanguages.length) {
      const want = c.originalLanguages.map(lang).filter(Boolean);
      checks.push(facts.originalLanguage === null ? 'unknown' : want.includes(facts.originalLanguage) ? 'yes' : 'no');
    }
    if (c.productionCountries && c.productionCountries.length) {
      const want = c.productionCountries.map(country).filter(Boolean);
      checks.push(facts.productionCountries === null || facts.productionCountries.length === 0 ? 'unknown' : anyOf(want, facts.productionCountries) ? 'yes' : 'no');
    }
    if (c.directorIds && c.directorIds.length) {
      const want = c.directorIds.map(String);
      if (facts.directorIds === null) checks.push('unknown');
      else if (anyOf(want, facts.directorIds)) checks.push('yes');
      else checks.push(facts.crewTruncated ? 'unknown' : 'no'); // kırpılmış ekip listesi "yok" kanıtı değildir
    }
    if (checks.includes('no')) return 'no';
    if (checks.includes('unknown')) return 'unknown';
    return 'yes';
  }

  /** Kütüphane taraması: eşleşen / bilinmeyen / elenen ayrı; kapsam notları açık. */
  function filterByConditions(items, cond) {
    const matches = []; const unknown = []; const excluded = [];
    for (const item of Array.isArray(items) ? items : []) {
      const r = matchConditions(normalizeCatalogFacts(item), cond);
      (r === 'yes' ? matches : r === 'unknown' ? unknown : excluded).push(item);
    }
    const notes = [];
    if (unknown.length) notes.push('unknown-metadata');
    if ((items || []).some((i) => i && i.crewTruncated)) notes.push('provider-truncated');
    return { matches, unknown, excluded, scopeNotes: notes, complete: notes.length === 0 };
  }
  /** Kişi filmografisi: yönetmenlik ve oyunculuk ayrı rol; oyuncu kredisi Director rotasına girmez. */
  function directorRoute(personCredits, personId, { truncated = false } = {}) {
    const credits = Array.isArray(personCredits) ? personCredits : [];
    const directed = credits.filter((c) => c && String(c.personId) === String(personId) && /^director$/i.test(String(c.job || '')));
    return { items: directed, complete: !truncated, note: truncated ? 'provider-truncated' : null, actingExcluded: credits.some((c) => c && /actor|cast/i.test(String(c.job || c.role || ''))) };
  }
  /** Dublaj ses dili özgün dil sayılmaz. */
  function isDubbed(facts) { return !!facts.audioLanguage && !!facts.originalLanguage && facts.audioLanguage !== facts.originalLanguage; }

  return Object.freeze({ normalizeCatalogFacts, validateConditions, matchConditions, filterByConditions, directorRoute, isDubbed });
});
