'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { canonicalWatchKey } = require('./watch-library-store');

const STATUSES = new Set(['planned', 'watching', 'completed', 'unspecified']);
const MAX_ITEMS = 10000;
function fail(message) { throw new Error(message); }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function localPath(value) {
  const raw = text(value, 2048);
  return (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) && !raw.includes('\0') ? raw : '';
}
function posterPath(value) {
  const raw = localPath(value);
  return /\.(?:png|jpe?g|webp|avif)$/i.test(raw) ? raw : '';
}
function ratingsOf(raw, old = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const previous = old && typeof old === 'object' ? old : {};
  const value = (key) => {
    const selected = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : previous[key];
    const clean = String(selected ?? '').trim().slice(0, 24);
    return clean && !/^(?:-|n\/?a|none|null|belirtilmedi)$/i.test(clean) ? clean : null;
  };
  return { imdb: value('imdb'), letterboxd: value('letterboxd'), personal: value('personal') };
}
function imdbIdOf(value) {
  const raw = text(value, 40).toLowerCase();
  return /^tt\d{7,10}$/.test(raw) ? raw : '';
}
function tmdbIdOf(value, kind) {
  const raw = text(value, 40).toLowerCase();
  const match = /^(?:(movie|tv):)?(\d+)$/.exec(raw);
  if (!match) return '';
  const scope = kind === 'series' ? 'tv' : 'movie';
  if (match[1] && match[1] !== scope) return '';
  const numeric = BigInt(match[2]);
  return numeric > 0n ? `${scope}:${numeric}` : '';
}
function sourceOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'local' ? 'local' : raw.type === 'browser' ? 'browser' : '';
  const value = type === 'local' ? localPath(raw.value) : text(raw.value, 2048);
  if (!type || !value) return null;
  if (type === 'browser') {
    try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null; }
    catch { return null; }
  }
  const watchKey = text(raw.watchKey, 2048) || canonicalWatchKey(type === 'local' ? `file:${value}` : `browser:${value}`);
  return { type, value, watchKey };
}
function episodeOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const season = Number(raw.season), number = Number(raw.number);
  if (!Number.isSafeInteger(season) || season < 0 || season > 1000 ||
      !Number.isSafeInteger(number) || number < 1 || number > 10000) return null;
  const id = text(raw.id, 120) || `s${season}e${number}`;
  return { id, season, number, title: text(raw.title, 300),
    watchStatus: STATUSES.has(raw.watchStatus) ? raw.watchStatus : 'unspecified', source: sourceOf(raw.source) };
}
function itemOf(raw, old = null) {
  if (!raw || typeof raw !== 'object') fail('Katalog kaydı geçersiz.');
  const kind = raw.kind ?? old?.kind;
  if (!['film', 'series'].includes(kind)) fail('Eser türü film veya dizi olmalı.');
  const title = text(raw.title ?? old?.title, 300);
  if (!title) fail('Eser adı gerekli.');
  const yearRaw = raw.year ?? old?.year;
  const year = yearRaw == null || yearRaw === '' ? null : Number(yearRaw);
  if (year !== null && (!Number.isSafeInteger(year) || year < 1880 || year > 2200)) fail('Yıl geçersiz.');
  const episodesRaw = raw.episodes ?? old?.episodes ?? [];
  if (!Array.isArray(episodesRaw) || episodesRaw.length > 1000) fail('Bölüm listesi geçersiz.');
  const episodes = episodesRaw.map(episodeOf);
  if (episodes.some((episode) => !episode)) fail('Bölüm sezon/numara bilgisi geçersiz.');
  const ids = new Set(episodes.map((episode) => episode.id));
  if (ids.size !== episodes.length) fail('Bölüm kimlikleri tekrarlanıyor.');
  const positions = new Set(episodes.map((episode) => `${episode.season}:${episode.number}`));
  if (positions.size !== episodes.length) fail('Aynı sezon ve bölüm birden çok kez girilmiş.');
  const incomingSource = Object.prototype.hasOwnProperty.call(raw, 'source') ? sourceOf(raw.source) : old?.source || null;
  return { id: text(raw.id ?? old?.id, 120) || randomUUID(), kind, title, year,
    originalTitle: text(raw.originalTitle ?? old?.originalTitle, 300),
    synopsis: text(raw.synopsis ?? old?.synopsis, 4000),
    imdbId: imdbIdOf(raw.imdbId ?? old?.imdbId), tmdbId: tmdbIdOf(raw.tmdbId ?? old?.tmdbId, kind),
    watchStatus: STATUSES.has(raw.watchStatus) ? raw.watchStatus : old?.watchStatus || 'unspecified',
    favorite: typeof raw.favorite === 'boolean' ? raw.favorite : old?.favorite || false,
    posterPath: posterPath(raw.posterPath ?? old?.posterPath),
    ratings: ratingsOf(raw.ratings, old?.ratings),
    source: incomingSource, episodes,
    importRef: text(raw.importRef ?? old?.importRef, 120),
  };
}
function titleKey(item) { return `${item.kind}|${item.title.toLocaleLowerCase('tr').replace(/\s+/g, ' ')}|${item.year || ''}`; }
function sameId(a, b) {
  return !!((imdbIdOf(a.imdbId) && imdbIdOf(a.imdbId) === imdbIdOf(b.imdbId)) ||
    (tmdbIdOf(a.tmdbId, a.kind) && tmdbIdOf(a.tmdbId, a.kind) === tmdbIdOf(b.tmdbId, b.kind)));
}
function resolveImport(existing, incoming) {
  const imported = existing.filter((item) => item.importRef && item.importRef === incoming.importRef);
  if (imported.length === 1) {
    const target = imported[0];
    if (target.kind !== incoming.kind) return { conflict: 'Aynı içe aktarım kimliğinde eser türü değişmiş.' };
    if ((imdbIdOf(target.imdbId) && imdbIdOf(incoming.imdbId) && imdbIdOf(target.imdbId) !== imdbIdOf(incoming.imdbId)) ||
        (tmdbIdOf(target.tmdbId, target.kind) && tmdbIdOf(incoming.tmdbId, incoming.kind) &&
          tmdbIdOf(target.tmdbId, target.kind) !== tmdbIdOf(incoming.tmdbId, incoming.kind)))
      return { conflict: 'Aynı içe aktarım kaydının IMDb/TMDB kimliği değişmiş.' };
    return { target, reason: 'importRef' };
  }
  if (imported.length > 1) return { conflict: 'Birden çok kayıt aynı içe aktarım kimliğini taşıyor.' };
  const identified = existing.filter((item) => sameId(item, incoming));
  if (identified.length > 1) return { conflict: 'IMDb/TMDB kimliği birden çok eserle eşleşiyor.' };
  if (identified.length === 1) {
    const target = identified[0];
    if (target.kind !== incoming.kind) return { conflict: 'Sağlayıcı kimliği film ve dizi arasında çakışıyor.' };
    if ((imdbIdOf(target.imdbId) && imdbIdOf(incoming.imdbId) && imdbIdOf(target.imdbId) !== imdbIdOf(incoming.imdbId)) ||
        (tmdbIdOf(target.tmdbId, target.kind) && tmdbIdOf(incoming.tmdbId, incoming.kind) &&
          tmdbIdOf(target.tmdbId, target.kind) !== tmdbIdOf(incoming.tmdbId, incoming.kind)))
      return { conflict: 'IMDb/TMDB kimlikleri birbiriyle çelişiyor.' };
    return { target, reason: 'providerId' };
  }
  if (existing.some((item) => titleKey(item) === titleKey(incoming)))
    return { conflict: 'Aynı başlık ve yılda kimliği belirsiz eser var.' };
  return {};
}
function mergeRecord(target, incoming) {
  const episodes = target.episodes.map((episode) => ({ ...episode }));
  for (const episode of incoming.episodes) {
    const at = episodes.findIndex((current) => current.id === episode.id ||
      (current.season === episode.season && current.number === episode.number));
    if (at < 0) episodes.push(episode);
    else episodes[at] = { ...episode, id: episodes[at].id,
      watchStatus: episodes[at].watchStatus, source: episodes[at].source || episode.source };
  }
  return itemOf({ ...target, title: target.title || incoming.title,
    originalTitle: target.originalTitle || incoming.originalTitle,
    synopsis: target.synopsis || incoming.synopsis,
    imdbId: imdbIdOf(target.imdbId) || incoming.imdbId,
    tmdbId: tmdbIdOf(target.tmdbId, target.kind) || incoming.tmdbId,
    posterPath: target.posterPath || incoming.posterPath,
    ratings: Object.fromEntries(['imdb', 'letterboxd', 'personal'].map((key) => [key,
      target.ratings?.[key] || incoming.ratings?.[key] || null])),
    source: target.source || incoming.source,
    importRef: target.importRef || incoming.importRef,
    episodes, watchStatus: target.watchStatus, favorite: target.favorite }, target);
}
function createMediaCatalogStore({ filePath }) {
  if (!filePath) fail('Katalog dosya yolu gerekli.');
  let cache;
  function read() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed.version !== 1 || !Array.isArray(parsed.items) || parsed.items.length > MAX_ITEMS)
        fail('Katalog dosyası geçersiz; veri korunuyor.');
      cache = parsed;
    } catch (error) {
      if (error.code === 'ENOENT') cache = { version: 1, items: [] };
      else if (error instanceof SyntaxError) fail('Katalog dosyası okunamadı; veri korunuyor.');
      else throw error;
    }
    return cache;
  }
  function commit(items) {
    if (items.length > MAX_ITEMS) fail('Katalog kapasitesi doldu.');
    const next = { version: 1, items };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, filePath); cache = next;
    } finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function list() { return structuredClone(read().items); }
  function get(id) { const item = read().items.find((entry) => entry.id === id); return item ? structuredClone(item) : null; }
  function upsert(patch) {
    const items = list(), index = items.findIndex((entry) => entry.id === patch?.id);
    const item = itemOf(patch, index >= 0 ? items[index] : null);
    if (index < 0) items.push(item); else items[index] = item;
    commit(items); return structuredClone(item);
  }
  function remove(id) {
    const items = list(), next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    commit(next); return true;
  }
  function planImport(rawItems, { selectedIds } = {}) {
    if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) fail('İçe aktarım listesi geçersiz.');
    const selected = selectedIds == null ? null : new Set(selectedIds);
    const items = list(), report = { added: [], updated: [], conflicts: [], skipped: [] };
    for (const raw of rawItems) {
      const id = text(raw?.importRef || raw?.id, 120);
      if (selected && !selected.has(id)) { report.skipped.push({ id, reason: 'Seçilmedi.' }); continue; }
      let incoming;
      try { incoming = itemOf(raw); }
      catch (error) { report.skipped.push({ id, reason: error.message }); continue; }
      const match = resolveImport(items, incoming);
      if (match.conflict) { report.conflicts.push({ id, title: incoming.title, reason: match.conflict }); continue; }
      if (match.target) {
        const index = items.findIndex((item) => item.id === match.target.id);
        items[index] = mergeRecord(items[index], incoming);
        report.updated.push({ id, catalogId: items[index].id, reason: match.reason });
      } else {
        if (items.length >= MAX_ITEMS) { report.skipped.push({ id, reason: 'Katalog kapasitesi doldu.' }); continue; }
        items.push(incoming); report.added.push({ id, catalogId: incoming.id });
      }
    }
    return { items, report };
  }
  function previewImport(items, options) { return planImport(items, options).report; }
  function mergeImport(items, options) {
    const planned = planImport(items, options);
    if (planned.report.added.length || planned.report.updated.length) commit(planned.items);
    return planned.report;
  }
  return { list, get, upsert, remove, previewImport, mergeImport };
}
module.exports = { createMediaCatalogStore, itemOf, sourceOf, posterPath, ratingsOf, imdbIdOf, tmdbIdOf };
