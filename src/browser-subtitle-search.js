'use strict';

const API = 'https://api.opensubtitles.com/api/v1';
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const USER_AGENT = 'WhisperBrowser v1.0';

function problem(message, code, retryAfter) {
  const error = new Error(message);
  error.code = code;
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

function credentials(config = {}) {
  const apiKey = config.apiKey || process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) throw problem('OpenSubtitles API anahtarı gerekli.', 'MISSING_API_KEY');
  return {
    apiKey,
    username: config.username || process.env.OPENSUBTITLES_USERNAME,
    password: config.password || process.env.OPENSUBTITLES_PASSWORD,
    token: config.token || process.env.OPENSUBTITLES_TOKEN,
  };
}

function apiError(response) {
  const status = response.status;
  const retryAfter = response.headers?.get?.('retry-after') || undefined;
  if (status === 401) return problem('OpenSubtitles oturumu veya kimlik bilgileri geçersiz.', 'AUTH');
  if (status === 403) return problem('OpenSubtitles erişimi reddetti; API anahtarını ve hesap yetkisini kontrol edin.', 'FORBIDDEN');
  if (status === 406 || status === 429) return problem('OpenSubtitles istek sınırına ulaşıldı; daha sonra yeniden deneyin.', 'RATE_LIMIT', retryAfter);
  if (status === 402) return problem('OpenSubtitles indirme kotası doldu.', 'QUOTA');
  if (status >= 500) return problem('OpenSubtitles hizmeti geçici olarak yanıt vermiyor.', 'PROVIDER_UNAVAILABLE');
  return problem(`OpenSubtitles isteği başarısız (HTTP ${status}).`, 'PROVIDER_ERROR');
}

async function boundedBody(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (contentLength > maxBytes) throw problem('Altyazı yanıtı izin verilen boyutu aşıyor.', 'TOO_LARGE');
  if (!response.body || !response.body.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw problem('Altyazı yanıtı izin verilen boyutu aşıyor.', 'TOO_LARGE');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw problem('Altyazı yanıtı izin verilen boyutu aşıyor.', 'TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    if (size > maxBytes) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function json(response) {
  const raw = await boundedBody(response, MAX_JSON_BYTES);
  try { return JSON.parse(new TextDecoder().decode(raw)); }
  catch { throw problem('OpenSubtitles geçersiz yanıt döndürdü.', 'INVALID_RESPONSE'); }
}

async function request(path, init, config, signal) {
  const auth = credentials(config);
  const fetcher = config.fetch || globalThis.fetch;
  const headers = {
    'Api-Key': auth.apiKey,
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    ...init.headers,
  };
  let token = auth.token;
  if (!token && auth.username && auth.password) {
    const login = await fetcher(`${API}/login`, {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Api-Key': auth.apiKey, 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: auth.username, password: auth.password }),
    });
    if (!login.ok) throw apiError(login);
    token = (await json(login)).token;
    if (!token) throw problem('OpenSubtitles oturum anahtarı döndürmedi.', 'AUTH');
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try { response = await fetcher(`${API}${path}`, { ...init, headers, redirect: 'manual', signal }); }
  catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw problem('OpenSubtitles bağlantısı kurulamadı.', 'NETWORK');
  }
  if (!response.ok) throw apiError(response);
  return json(response);
}

function normalized(value) {
  // NFKD + diakritik temizliği ASCII↔Unicode yazım çiftlerini eşleştirir
  // ('İyi Kötü ve Çirkin' ≡ 'iyi kotu ve cirkin'). I/İ/ı tek 'i'ye katlanır.
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Iİı]/g, 'i').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function scoreCandidate(candidate, target) {
  const a = candidate.attributes || {};
  const feature = a.feature_details || {};
  let score = 0;
  // B03: sağlayıcı dosya parmak izi eşleşmesini bildirdiğinde en güçlü sinyal
  if (a.moviehash_match === true) score += 100;
  const title = normalized(feature.title);
  const query = normalized(target.query);
  if (query && title === query) score += 50;
  else if (query && title && (title.includes(query) || query.includes(title))) score += 30;
  if (target.season != null && Number(feature.season_number) === Number(target.season)) score += 15;
  if (target.episode != null && Number(feature.episode_number) === Number(target.episode)) score += 15;
  if (target.language && normalized(a.language) === normalized(target.language)) score += 10;
  const targetRelease = normalized(target.release);
  const candidateRelease = normalized(a.release);
  if (targetRelease && candidateRelease === targetRelease) score += 25;
  else if (targetRelease && candidateRelease.includes(targetRelease)) score += 12;
  return score;
}

async function searchSubtitles(target, config = {}, { signal } = {}) {
  if (!target || typeof target.query !== 'string' || !target.query.trim()) throw problem('Arama başlığı gerekli.', 'INVALID_INPUT');
  if (target.query.length > 300 || String(target.release || '').length > 300 || String(target.language || '').length > 12
    || ['season', 'episode'].some(key => target[key] != null && (!Number.isInteger(Number(target[key])) || Number(target[key]) < 0 || Number(target[key]) > 10000))) {
    throw problem('Arama başlığı, dil veya bölüm bilgisi geçersiz.', 'INVALID_INPUT');
  }
  // B03: moviehash yalnızca 16-hex parmak izi; filesize isteğe bağlı bilgi.
  const moviehash = /^[0-9a-f]{16}$/i.test(String(target.moviehash || '')) ? String(target.moviehash).toLowerCase() : '';
  if (target.moviehash != null && !moviehash) throw problem('Dosya parmak izi (moviehash) geçersiz.', 'INVALID_INPUT');
  if (target.filesize != null && (!Number.isSafeInteger(Number(target.filesize)) || Number(target.filesize) < 0)) {
    throw problem('Dosya boyutu geçersiz.', 'INVALID_INPUT');
  }
  signal = AbortSignal.any([signal, AbortSignal.timeout(45000)].filter(Boolean));
  const params = new URLSearchParams({ query: target.query.trim() });
  if (moviehash) params.set('moviehash', moviehash);
  if (target.season != null) params.set('season_number', String(target.season));
  if (target.episode != null) params.set('episode_number', String(target.episode));
  if (target.language) params.set('languages', String(target.language));
  let payload = await request(`/subtitles?${params}`, { method: 'GET' }, config, signal);
  if (!Array.isArray(payload.data)) throw problem('OpenSubtitles arama yanıtı eksik.', 'INVALID_RESPONSE');
  // B03: parmak izi hiç eşleşme vermediyse salt başlık sorgusuna düş
  if (moviehash && payload.data.length === 0) {
    params.delete('moviehash');
    payload = await request(`/subtitles?${params}`, { method: 'GET' }, config, signal);
    if (!Array.isArray(payload.data)) throw problem('OpenSubtitles arama yanıtı eksik.', 'INVALID_RESPONSE');
  }
  const results = payload.data.map((item) => {
    const a = item.attributes || {};
    const feature = a.feature_details || {};
    // fileId ve fileName AYNI dosya kaydından gelmeli — files[0] ID'sizse
    // ilk geçerli kayıtla isim birbirinden ayrılıyordu (yanlış dosya adı).
    const file = a.files?.find((f) => Number.isSafeInteger(Number(f.file_id))) || a.files?.[0] || {};
    return {
      id: String(item.id || a.subtitle_id || ''),
      fileId: Number.isSafeInteger(Number(file.file_id)) ? file.file_id : null,
      title: feature.title || '',
      season: feature.season_number ?? null,
      episode: feature.episode_number ?? null,
      language: a.language || '',
      release: a.release || '',
      fileName: file.file_name || '',
      hearingImpaired: Boolean(a.hearing_impaired),
      downloadCount: Number(a.download_count) || 0,
      hashMatch: a.moviehash_match === true,
      matchScore: scoreCandidate(item, target),
    };
  }).filter((item) => item.fileId != null);
  results.sort((a, b) => b.matchScore - a.matchScore || b.downloadCount - a.downloadCount);
  return { results, totalCount: Number(payload.total_count) || results.length, page: Number(payload.page) || 1 };
}

function approvedDownloadUrl(link) {
  let url;
  try { url = new URL(link); } catch { throw problem('Geçersiz altyazı indirme bağlantısı.', 'UNSAFE_URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(host === 'opensubtitles.com' || host.endsWith('.opensubtitles.com'))) {
    throw problem('Güvensiz altyazı indirme bağlantısı engellendi.', 'UNSAFE_URL');
  }
  return url.href;
}

async function downloadSubtitle({ fileId }, config = {}, { signal } = {}) {
  if (!Number.isSafeInteger(Number(fileId)) || Number(fileId) <= 0) throw problem('Geçerli altyazı dosya kimliği gerekli.', 'INVALID_INPUT');
  signal = AbortSignal.any([signal, AbortSignal.timeout(60000)].filter(Boolean));
  const payload = await request('/download', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: Number(fileId), sub_format: 'srt' }),
  }, config, signal);
  if (!payload.link) throw problem('OpenSubtitles indirme bağlantısı döndürmedi.', 'INVALID_RESPONSE');
  const fetcher = config.fetch || globalThis.fetch;
  let url = approvedDownloadUrl(payload.link);
  let response;
  for (let redirects = 0; redirects <= 3; redirects++) {
    try { response = await fetcher(url, { method: 'GET', redirect: 'manual', signal }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw problem('Altyazı dosyası indirilemedi.', 'NETWORK');
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirects === 3) throw problem('Altyazı indirmesi çok fazla yönlendirildi.', 'UNSAFE_URL');
    const location = response.headers.get('location');
    if (!location) throw problem('Yönlendirme hedefi eksik — indirme bağlantısı geçersiz.', 'INVALID_RESPONSE');
    url = approvedDownloadUrl(new URL(location, url).href);
  }
  if (!response.ok) throw apiError(response);
  const bytes = await boundedBody(response, MAX_TEXT_BYTES);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  const fileName = String(payload.file_name || '').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
  const format = text.startsWith('WEBVTT') ? 'vtt' : 'srt';
  if (!text.trim() || /\0/.test(text)) throw problem('İndirilen dosya geçerli altyazı metni değil.', 'INVALID_SUBTITLE');
  return { text, format, fileName: fileName || `subtitle-${fileId}.${format}` };
}

module.exports = { searchSubtitles, downloadSubtitle, scoreCandidate };
