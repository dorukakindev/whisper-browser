'use strict';

const { browserSiteOrigin } = require('./browser-site-profiles');

const MAX_SITE_TERMINOLOGY_SCOPES = 200;
const MAX_SITE_TERMS = 60;

function clean(value, max) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max); }

function siteTerminologyScope(rawUrl, targetLanguage) {
  const origin = browserSiteOrigin(rawUrl);
  const language = clean(targetLanguage, 24).toLowerCase();
  // Birden çok alt etiketli BCP-47 kodları (zh-hans-cn) profil tarafında
  // kabul görüp burada sessizce düşüyordu — alt etiket sayısını sınırlama.
  return origin && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ? `${origin}|${language}` : '';
}

function normalizeSiteTermRows(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map((row) => ({
    source: clean(row?.source, 80), target: clean(row?.target, 120),
    count: Math.max(2, Math.min(9999, Math.trunc(Number(row?.count) || 2))),
  })).filter((row) => {
    const key = row.source.normalize('NFC').toLocaleLowerCase('tr-TR');
    if (!row.source || !row.target || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, MAX_SITE_TERMS);
}

function normalizeBrowserSiteTerminology(raw) {
  const output = {};
  for (const [scope, rows] of Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})) {
    const split = scope.lastIndexOf('|');
    const normalizedScope = split > 0 ? siteTerminologyScope(scope.slice(0, split), scope.slice(split + 1)) : '';
    const normalizedRows = normalizeSiteTermRows(rows);
    if (!normalizedScope || !normalizedRows.length || output[normalizedScope]) continue;
    output[normalizedScope] = normalizedRows;
    if (Object.keys(output).length >= MAX_SITE_TERMINOLOGY_SCOPES) break;
  }
  return output;
}

function seedSiteTerminology(map, rows) {
  if (!map || !(map.terms instanceof Map)) return 0;
  let added = 0;
  for (const row of normalizeSiteTermRows(rows)) {
    const key = row.source.normalize('NFC').toLocaleLowerCase('tr-TR');
    const current = map.terms.get(key);
    if (!current || Number(current.count) < row.count) {
      map.terms.set(key, { source: row.source, target: row.target, count: row.count, cueIds: [] });
      added++;
    }
  }
  return added;
}

module.exports = { MAX_SITE_TERMS, normalizeBrowserSiteTerminology, normalizeSiteTermRows,
  seedSiteTerminology, siteTerminologyScope };
