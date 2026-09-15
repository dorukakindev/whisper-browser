'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { sourceOf, posterPath, ratingsOf, imdbIdOf, tmdbIdOf } = require('./media-catalog-store');

const MAX_BYTES = 32 * 1024 * 1024;
function watchStatus(raw) {
  const value = String(raw || '').trim().toLocaleLowerCase('tr');
  if (value === 'izlenecek') return 'planned';
  if (value === 'izleniyor') return 'watching';
  if (value === 'izlendi') return 'completed';
  return 'unspecified';
}
function episodeFromName(filename) {
  const match = /(?:^|[\s._-])s(?:eason)?\s*(\d{1,3})[\s._-]*e(?:pisode)?\s*(\d{1,4})(?:[\s._-]|$)/i.exec(String(filename || ''));
  return match ? { season: Number(match[1]), number: Number(match[2]) } : null;
}
function mapWorks(payload, { namespace = 'fixture' } = {}) {
  if (!payload || !Array.isArray(payload.works) || payload.works.length > 10000)
    throw new Error('nMDB katalog önizlemesi geçersiz.');
  const items = [], warnings = [];
  for (const raw of payload.works) {
    const ref = `nmdb:${namespace}:work:${Number(raw.work_id)}`;
    if (!Number.isSafeInteger(Number(raw.work_id)) || Number(raw.work_id) <= 0) { warnings.push('Kimliği geçersiz bir eser atlandı.'); continue; }
    const title = String(raw.title || raw.original_title || '').trim();
    if (!title) { warnings.push(`${ref}: Başlık yok; eser atlandı.`); continue; }
    const kind = /dizi|series|tv/i.test(`${raw.kind || ''} ${raw.tmdb_id || ''}`) ? 'series' : 'film';
    const imdbId = imdbIdOf(raw.imdb_id), tmdbId = tmdbIdOf(raw.tmdb_id, kind);
    if (String(raw.imdb_id || '').trim() && !imdbId) warnings.push(`${ref}: Geçersiz veya boş IMDb kimliği atlandı.`);
    if (String(raw.tmdb_id || '').trim() && !tmdbId) warnings.push(`${ref}: Geçersiz veya boş TMDB kimliği atlandı.`);
    const media = Array.isArray(raw.media_files) ? raw.media_files.slice(0, 1000) : [];
    const valid = media.map((entry) => ({ entry, source: sourceOf({ type: 'local', value: entry.path }) }))
      .filter((entry) => entry.source);
    if (media.length > valid.length) warnings.push(`${ref}: Geçersiz dosya yolları atlandı.`);
    if (kind === 'film' && valid.length > 1) warnings.push(`${ref}: Birden fazla dosya var; ilk geçerli kaynak seçildi.`);
    const episodes = [];
    if (kind === 'series') {
      for (const { entry, source } of valid) {
        const parsed = episodeFromName(entry.filename || path.basename(source.value));
        if (!parsed) { warnings.push(`${ref}: Bölümü anlaşılmayan dosya katalog bölümüne eklenmedi.`); continue; }
        const id = `s${parsed.season}e${parsed.number}`;
        if (episodes.some((episode) => episode.id === id)) { warnings.push(`${ref}: Aynı sezon/bölüm için birden fazla dosya var; ilk kaynak seçildi.`); continue; }
        episodes.push({ id, ...parsed, title: '', watchStatus: 'unspecified', source });
      }
    }
    const year = /^\d{4}$/.test(String(raw.year || '')) ? Number(raw.year) : null;
    const poster = posterPath(raw.poster_yolu);
    if (raw.poster_yolu && !poster) warnings.push(`${ref}: Güvenli yerel poster yolu bulunamadı.`);
    items.push({ id: ref, importRef: ref, kind, title: title.slice(0, 300), year,
      originalTitle: String(raw.original_title || '').trim().slice(0, 300),
      synopsis: String(raw.konu_ozeti || '').trim().slice(0, 4000),
      ratings: ratingsOf({ imdb: raw.imdb_puani, letterboxd: raw.lb_puani, personal: raw.kisisel_puan }),
      imdbId, tmdbId,
      watchStatus: watchStatus(raw.izleme_durumu), favorite: Boolean(raw.favori),
      posterPath: poster, source: kind === 'film' ? valid[0]?.source || null : null, episodes });
  }
  return { items, warnings, count: items.length };
}

async function previewNmdbImport({ dbPath, pythonPath, signal } = {}) {
  if (typeof dbPath !== 'string' || !dbPath.trim() || typeof pythonPath !== 'string' || !pythonPath.trim())
    throw new Error('nMDB dosyası ve Python yolu gerekli.');
  const script = path.join(__dirname, '..', 'backend', 'nmdb_catalog_import.py');
  const raw = await new Promise((resolve, reject) => {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
    delete env.WHISPER_HF_TOKEN; delete env.WHISPER_LLM_API_KEY;
    const child = spawn(pythonPath, [script, '--db', dbPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    const chunks = []; let size = 0, stderr = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => { child.kill(); finish(new Error('nMDB önizlemesi iptal edildi.')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('nMDB önizlemesi zaman aşımına uğradı.')); }, 30000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', () => finish(new Error('nMDB okuma aracı başlatılamadı.')));
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-300); });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) { child.kill(); finish(new Error('nMDB önizlemesi boyut sınırını aştı.')); }
      else chunks.push(chunk);
    });
    child.on('close', (code) => {
      const output = Buffer.concat(chunks);
      if (code === 0) { finish(null, output); return; }
      try {
        const response = JSON.parse(output.toString('utf8'));
        finish(new Error(String(response.error || stderr || 'nMDB önizlemesi okunamadı.').slice(0, 300)));
      } catch { finish(new Error(stderr || 'nMDB önizlemesi okunamadı.')); }
    });
  });
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch { throw new Error('nMDB önizlemesi geçerli JSON döndürmedi.'); }
  if (parsed.error) throw new Error(String(parsed.error).slice(0, 300));
  const namespace = createHash('sha256').update(path.resolve(dbPath).toLocaleLowerCase('en-US')).digest('hex').slice(0, 16);
  return mapWorks(parsed, { namespace });
}
module.exports = { previewNmdbImport, mapWorks, watchStatus, episodeFromName };
