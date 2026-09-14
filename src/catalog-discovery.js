'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { run } = require('./browser-media-tools');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
async function scanFolder(folder, pythonPath) {
  const parsed = JSON.parse(await run(pythonPath, [path.join(__dirname, '../backend/catalog_scan.py')], JSON.stringify({ folder }), null, 300000));
  const grouped = new Map();
  for (const row of parsed.rows) {
    const key = row.kind === 'series' ? `${row.title.toLocaleLowerCase('tr')}|${row.year || ''}` : row.path.toLowerCase();
    let item = grouped.get(key);
    if (!item) { item = { title: row.title, kind: row.kind, year: row.year || null, importRef: 'folder:' + hash(key), episodes: [] }; grouped.set(key, item); }
    const source = { type: 'local', value: row.path };
    if (row.kind === 'film') item.source = source;
    else for (const number of row.episodes) {
      if (item.episodes.some(ep => ep.season === row.season && ep.number === number)) { parsed.warnings.push(`${row.title} S${row.season} B${number}: birden fazla dosya; ilk kaynak kullanıldı.`); continue; }
      item.episodes.push({ id: `s${row.season}e${number}`, season: row.season, number, title: '', source });
    }
  }
  return { items: [...grouped.values()], warnings: parsed.warnings };
}
function createMetadataClient(fetchImpl = fetch) {
  async function request(route, token, params = {}) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('TMDB API okuma erişim belirtecini girin. Yalnız bu oturumda kullanılır.');
    const url = new URL('https://api.themoviedb.org/3/' + route);
    url.search = new URLSearchParams({ language: 'tr-TR', ...params }).toString();
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error('TMDB bağlantısı kurulamadı; yeniden deneyin.'); }
    if (!response.ok) throw new Error(response.status === 401 ? 'TMDB erişim belirteci geçersiz.' : response.status === 429 ? 'TMDB istek sınırına ulaşıldı; daha sonra deneyin.' : 'TMDB bilgileri alınamadı.');
    const text = await response.text(); if (text.length > 4e6) throw new Error('TMDB yanıtı çok büyük.');
    return JSON.parse(text);
  }
  return {
    async search(item, token, query) {
      const kind = item.kind === 'series' ? 'tv' : 'movie';
      const data = await request(`search/${kind}`, token, { query: String(query || item.title).slice(0, 200), include_adult: 'false' });
      return (data.results || []).slice(0, 20).map(row => ({ id: row.id, title: row.title || row.name,
        date: row.release_date || row.first_air_date || '', synopsis: row.overview || '' }));
    },
    async detail(item, id, token) {
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('Eser kimliği geçersiz.');
      const kind = item.kind === 'series' ? 'tv' : 'movie';
      const data = await request(`${kind}/${id}`, token, { append_to_response: 'credits,external_ids' });
      const patch = { title: data.title || data.name, originalTitle: data.original_title || data.original_name,
        year: Number(String(data.release_date || data.first_air_date || '').slice(0, 4)) || null,
        synopsis: data.overview || '', tmdbId: `${kind}:${id}`, imdbId: data.imdb_id || data.external_ids?.imdb_id || '',
        genres: (data.genres || []).map(g => g.name), cast: (data.credits?.cast || []).slice(0, 12).map(p => p.name),
        runtime: data.runtime || data.episode_run_time?.[0] || null };
      return { patch, poster: /^\/[a-zA-Z0-9._-]+$/.test(data.poster_path || '') ? data.poster_path : '',
        seasons: (data.seasons || []).map(s => ({ number: s.season_number, count: s.episode_count })) };
    },
    async season(item, number, token) {
      const match = /^tv:(\d+)$/.exec(item.tmdbId || '');
      if (!match || !Number.isSafeInteger(number) || number < 0 || number > 1000) throw new Error('Önce diziyi TMDB ile eşleştirin ve geçerli sezon seçin.');
      const data = await request(`tv/${match[1]}/season/${number}`, token);
      return (data.episodes || []).slice(0, 1000).map(ep => ({ id: `s${number}e${ep.episode_number}`, season: number, number: ep.episode_number,
        title: ep.name || '', airDate: ep.air_date || '', watchStatus: 'planned' }));
    },
  };
}
module.exports = { scanFolder, createMetadataClient };
