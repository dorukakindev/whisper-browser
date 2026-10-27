'use strict';
const { readLimitedBytes } = require('./catalog-discovery');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const { classify: discoveryErrorCode } = require('./renderer/media-discovery-errors');
const GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
const text = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function imageUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && ['images.metahub.space', 'image.tmdb.org'].includes(url.hostname) ? url.href : ''; }
  catch { return ''; }
}
function normalizeMeta(row, kind) {
  if (!row || !/^tt\d{7,12}$/.test(row.id || '') || !text(row.name)) return null;
  return { providerId: row.id, kind: kind === 'series' ? 'series' : 'film', title: text(row.name),
    year: /^\d{4}/.test(String(row.releaseInfo || '')) ? Number(String(row.releaseInfo).slice(0, 4)) : null,
    poster: imageUrl(row.poster), backdrop: imageUrl(row.background), synopsis: text(row.description, 4000),
    genres: (Array.isArray(row.genres) ? row.genres : []).slice(0, 20).map(value => text(value, 80)),
    cast: (Array.isArray(row.cast) ? row.cast : []).slice(0, 15).map(value => text(value, 120)),
    directors: (Array.isArray(row.director)?row.director:typeof row.director==='string'?[row.director]:[]).slice(0,10).map(value=>text(value,120)),
    rating: Number.isFinite(Number(row.imdbRating)) && Number(row.imdbRating) > 0 && Number(row.imdbRating) <= 10 ? Number(row.imdbRating) : null,
    runtime: Number.parseInt(row.runtime, 10) > 0 ? Math.min(10000, Number.parseInt(row.runtime, 10)) : null };
}
function recommendationSeeds(items) {
  return items.filter(item => item.favorite || Number(item.ratings?.personal) >= 3.5).slice(0, 20);
}
function registerMediaDiscovery({ ipcMain, authorized, catalogStore, userData, nativeImage, translateSynopsis, fetchImpl = fetch, now = () => Date.now() }) {
  const cache = new Map(), loading = new Map();
  const previews = new Map(), cancelledPreviews = new Set();
  const previewTranslation = require('./catalog-synopsis').createSynopsisTranslation({
    store: () => ({get: id => previews.get(id), upsert: patch => {
      const item = {...previews.get(patch.id), ...patch}; previews.set(patch.id, item); return item;
    }}), translate: translateSynopsis,
  });
  const feedbackFile = () => path.join(userData(), 'media-discovery-feedback.json');
  function feedback() {
    if (!userData || !fs.existsSync(feedbackFile())) return {};
    if (fs.statSync(feedbackFile()).size > 2_000_000) throw Error('Discovery preferences are too large.');
    const value = JSON.parse(fs.readFileSync(feedbackFile(), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid discovery preferences.');
    return value;
  }
  let active = 0;
  async function officialFetch(url, hosts, timeout = 15000) {
    const signal = AbortSignal.timeout(timeout);
    for (let hop = 0; hop < 4; hop++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || !hosts.includes(target.hostname)) throw Error('Unsupported discovery redirect.');
      const response = await fetchImpl(target.href, { redirect: 'manual', credentials: 'omit', signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw Error('Invalid discovery redirect.');
      url = new URL(location, target).href;
    }
    throw Error('Too many discovery redirects.');
  }
  async function request(route) {
    const cached = cache.get(route);
    if (cached && now() - cached.at < 600000) return cached.data;
    if (loading.has(route)) return loading.get(route);
    if (active >= 6) throw Error('Discovery is busy; try again shortly.');
    active++;
    const pending = (async () => {
      const response = await officialFetch('https://v3-cinemeta.strem.io/' + route, ['v3-cinemeta.strem.io', 'cinemeta-catalogs.strem.io']);
      if (!response.ok) throw Error(response.status === 429 ? 'Discovery request limit reached; try again later.' : `Discovery HTTP ${response.status}`);
      const data = JSON.parse((await readLimitedBytes(response, 4_000_000, 'Discovery')).toString('utf8'));
      cache.set(route, { at: now(), data });
      while (cache.size > 24) cache.delete(cache.keys().next().value);
      return data;
    })();
    loading.set(route, pending);
    try { return await pending; } finally { active--; loading.delete(route); }
  }
  async function list(input) {
    const kind = input.kind === 'series' ? 'series' : 'movie';
    const mode = ['top', 'imdbRating', 'year'].includes(input.mode) ? input.mode : 'top';
    const skip = Number(input.skip || 0);
    if (!Number.isSafeInteger(skip) || skip < 0 || skip > 2000) throw Error('Invalid discovery page.');
    const limit=input.limit===undefined?100:Number(input.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid discovery limit.');
    const params = new URLSearchParams();
    if (mode === 'year') {
      const year = Number(input.year || new Date(now()).getUTCFullYear());
      if (!Number.isInteger(year) || year < 1920 || year > new Date(now()).getUTCFullYear() + 1) throw Error('Invalid release year.');
      params.set('genre', String(year));
    } else if (input.genre) { if (!GENRES.includes(input.genre)) throw Error('Invalid discovery genre.'); params.set('genre', input.genre); }
    if (text(input.query, 200)) { if (mode !== 'top') throw Error('Search uses the popular catalog.'); params.set('search', text(input.query, 200)); }
    params.set('skip', String(skip));
    const extras = params.size ? '/' + params.toString() : '';
    const data = await request(`catalog/${kind}/${mode}${extras}.json`);
    const raw = Array.isArray(data.metas) ? data.metas : [];
    const rows = raw.slice(0, limit).map(row => normalizeMeta(row, kind)).filter(Boolean);
    return { rows, nextSkip: raw.length && skip+Math.min(raw.length,limit)<=2000 ? skip + Math.min(raw.length,limit) : null };
  }
  const handle = async (event, input = {}) => {
    if (!authorized(event)) return { ok: false, error: 'Unauthorized request.', errorCode: 'unauthorized' };
    try {
      if (input.action === 'feedback-list') return { ok: true, rows: Object.values(feedback()).slice(-2000).reverse(), nextSkip: null };
      if (input.action === 'feedback') {
        if (!/^tt\d{7,12}$/.test(input.id || '') || !['film','series'].includes(input.kind) || !['hidden','watched','none'].includes(input.state)) throw Error('Invalid discovery preference.');
        const rows = feedback(), key = `${input.kind}:${input.id}`;
        if (input.state === 'none') delete rows[key];
        else rows[key] = { providerId:input.id, kind:input.kind, title:text(input.title,500) || input.id, feedback:input.state, at:now() };
        if (Object.keys(rows).length > 2000) throw Error('Discovery preference limit reached.');
        atomicWriteFileSync(feedbackFile(), JSON.stringify(rows));
        return { ok:true };
      }
      if (input.action === 'list') {
        const result = await list(input);
        const preferences = feedback();
        const owned = new Map(catalogStore().list().filter(row => row.imdbId).map(row => [row.imdbId, row.id]));
        return { ok: true, ...result, rows: result.rows.filter(row => !preferences[`${row.kind}:${row.providerId}`]).map(row => ({ ...row, catalogId: owned.get(row.providerId) || null })), genres: GENRES };
      }
      if (input.action === 'personal') {
        const library = catalogStore().list(), seeds = recommendationSeeds(library), owned = new Set(library.map(item => item.imdbId).filter(Boolean));
        const aliases = { 'Bilim-Kurgu': 'Sci-Fi', 'Bilim Kurgu': 'Sci-Fi', 'Dram': 'Drama', 'Komedi': 'Comedy', 'Aksiyon': 'Action', 'Gerilim': 'Thriller', 'Korku': 'Horror', 'Belgesel': 'Documentary', 'Animasyon': 'Animation', 'Macera': 'Adventure', 'Romantik': 'Romance' };
        const selected = new Map();
        let genreProfile=[];
        try{const file=path.join(userData(),'media-shelf.json');if(fs.existsSync(file)&&fs.statSync(file).size<=16_000_000){const shelf=JSON.parse(fs.readFileSync(file,'utf8'));genreProfile=require('./media-taste').profile(shelf.diary||[],library,shelf.tasteProfile||{}).genres;}}catch{/* Existing favorites remain a fallback when the optional profile is unavailable. */}
        for(const row of genreProfile.filter(row=>row.average>=3.5&&row.count>=2).sort((a,b)=>b.count*(b.average-2.5)-a.count*(a.average-2.5))){const genre=aliases[row.name]||row.name;if(GENRES.includes(genre))selected.set(genre,{genre:row.name,count:row.count,average:row.average});}
        for (const seed of seeds) for (const name of seed.genres || []) { const genre = aliases[name] || name; if (GENRES.includes(genre) && !selected.has(genre)) selected.set(genre, seed.title); }
        if (!selected.size) return { ok: true, rows: [], needsRatings: true };
        const results = await Promise.allSettled([...selected].slice(0, 3).map(async ([genre, seed]) => ({ seed, rows: (await list({ kind: input.kind, genre })).rows })));
        const seen = new Set(), rows = [], preferences = feedback();
        for (const result of results) if (result.status === 'fulfilled') for (const row of result.value.rows) {
          const key = `${row.kind}:${row.providerId}`;
          if (!owned.has(row.providerId) && !seen.has(key) && !preferences[key]) { seen.add(key); rows.push({ ...row, ...(typeof result.value.seed==='string'?{because:result.value.seed}:{profileBecause:result.value.seed}) }); }
        }
        if (results.every(row => row.status === 'rejected')) throw Error('Personal recommendations are temporarily unavailable.');
        return { ok: true, rows: rows.slice(0, 60), needsRatings: false };
      }
      if (input.action === 'detail' || input.action === 'add' || input.action === 'synopsis-translate' || input.action === 'synopsis-stop') {
        if (!/^tt\d{7,12}$/.test(input.id || '') || !['film', 'series'].includes(input.kind)) throw Error('Invalid title identity.');
        const previewId = `${input.kind}:${input.id}`;
        const requestKey = `${previewId}:${input.token}`;
        if (input.action === 'synopsis-stop') {
          if(typeof input.token!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(input.token))throw Error('Invalid translation token.');
          cancelledPreviews.add(requestKey);while(cancelledPreviews.size>100)cancelledPreviews.delete(cancelledPreviews.values().next().value);
          return previewTranslation.stop(previewId, input.token);
        }
        const kind = input.kind === 'series' ? 'series' : 'movie';
        const data = await request(`meta/${kind}/${input.id}.json`), row = normalizeMeta(data.meta, kind);
        if (!row) throw Error('Title metadata is unavailable.');
        const catalog = catalogStore();
        const existing = catalog.list().find(item => item.imdbId === row.providerId && item.kind === row.kind);
        if (input.action === 'synopsis-translate') {
          if(cancelledPreviews.has(requestKey))return {ok:false,canceled:true};
          if (previews.get(previewId)?.synopsis !== row.synopsis) previews.set(previewId, {...row, id: previewId});
          while (previews.size > 24) previews.delete(previews.keys().next().value);
          return await previewTranslation.start(previewId, input.token);
        }
        if (input.action === 'detail') return { ok: true, item: row, catalogId: existing?.id || null };
        if (existing) return { ok: true, item: existing, existing: true };
        let posterBytes = null;
        if (row.poster && nativeImage && userData) try {
          const response = await officialFetch(row.poster, ['images.metahub.space', 'image.tmdb.org', 'm.media-amazon.com'], 10000);
          if (response.ok) { const image = nativeImage.createFromBuffer(await readLimitedBytes(response, 2_000_000, 'Poster')); if (!image.isEmpty()) posterBytes = image.resize({ width: 400 }).toPNG(); }
        } catch { /* Metadata remains useful if the poster service is temporarily down. */ }
        const latest = catalog.list().find(item => item.imdbId === row.providerId && item.kind === row.kind);
        if (latest) return { ok: true, item: latest, existing: true };
        let posterPath;
        if (posterBytes) { posterPath = path.join(userData(), 'catalog-posters', randomUUID() + '.png'); atomicWriteFileSync(posterPath, posterBytes); }
        let saved;
        const translatedPreview=previews.get(previewId),translation=translatedPreview?.synopsis===row.synopsis&&translatedPreview.synopsisTr
          ? {synopsisTr:translatedPreview.synopsisTr,synopsisTrSource:translatedPreview.synopsisTrSource}:{};
        try { saved = catalog.upsert({ kind: row.kind, title: row.title, year: row.year, synopsis: row.synopsis, ...translation, imdbId: row.providerId, genres: row.genres, cast: row.cast, directors:row.directors,runtime: row.runtime, ratings: { imdb: row.rating === null ? null : String(row.rating) }, watchStatus: 'planned', ...(posterPath ? { posterPath } : {}) }); }
        catch (error) { if (posterPath) { try { fs.unlinkSync(posterPath); } catch {} } throw error; }
        return { ok: true, item: saved, existing: false };
      }
      throw Error('Unsupported discovery action.');
    } catch (error) { return { ok: false, error: error.message, errorCode: discoveryErrorCode(error) }; }
  };
  ipcMain.handle('media-discovery:request',handle);
  return {handle};
}
module.exports = { registerMediaDiscovery, normalizeMeta, recommendationSeeds, GENRES };
