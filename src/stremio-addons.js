'use strict';
// Stremio eklenti protokolü istemcisi (saf mantık + sınırlı ağ okuması).
// Kapsam: manifest doğrulama, kaynak/altyazı/katalog/meta çağrıları ve yanıt normalizasyonu.
// Güvenlik sözleşmesi:
//  - Eklenti adresi gizli sayılır (debrid anahtarı adres yolunda taşınabilir): gösterimde yalnız ana makine.
//  - Eklentiden gelen her URL (poster, altyazı, akış) ayrı doğrulanır; özel/loopback hedefler yalnız
//    eklentinin kendisi de aynı özel makinedeyse (yerel eklenti) kabul edilir.
//  - Yanıtlar bayt ve süre sınırlıdır, yönlendirmeler elle ve her sıçramada yeniden doğrulanarak izlenir.
const { createHash } = require('node:crypto');
const { isPrivateHost } = require('./podcast-transcript');

const LIMITS = Object.freeze({
  manifestBytes: 262144, jsonBytes: 4_000_000, timeoutMs: 12000, redirects: 3,
  maxStreams: 400, maxSubtitles: 400, maxCatalogItems: 200, maxVideos: 5000, maxTrackers: 20,
  urlLength: 8192, textLength: 4000,
});
const USER_AGENT = 'WhisperBrowser StremioAddonClient/1';
const TYPE_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const ID_PATTERN = /^[A-Za-z0-9_.:~+-]{1,200}$/;
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;

class AddonError extends Error {
  constructor(message, code = 'ADDON_ERROR') { super(message); this.name = 'AddonError'; this.code = code; }
}
const fail = (message, code) => new AddonError(message, code);

const text = (value, limit = LIMITS.textLength) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit) : '');
const isLoopbackHost = (host) => {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
};

/** stremio:// → https://, https zorunlu; yalnız loopback için http. Kimlik bilgisi ve parça reddedilir. */
function normalizeAddonUrl(input) {
  let raw = String(input == null ? '' : input).trim();
  if (!raw || raw.length > 2048) throw fail('Eklenti adresi boş veya çok uzun.', 'BAD_URL');
  if (/^stremio:\/\//i.test(raw)) raw = 'https://' + raw.slice('stremio://'.length);
  let url;
  try { url = new URL(raw); } catch { throw fail('Geçerli bir eklenti adresi gir (https://… veya stremio://…).', 'BAD_URL'); }
  if (url.username || url.password) throw fail('Adres kimlik bilgisi içeremez.', 'BAD_URL');
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === 'http:' && !loopback) throw fail('Eklenti adresi https olmalı (yalnız yerel eklentiler http olabilir).', 'BAD_URL');
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw fail('Yalnız https eklenti adresleri desteklenir.', 'BAD_URL');
  if (!loopback && isPrivateHost(url.hostname)) throw fail('Özel ağ adresleri eklenti olarak eklenemez.', 'BAD_URL');
  url.hash = '';
  let path = url.pathname;
  if (/\/manifest\.json$/i.test(path)) path = path.replace(/manifest\.json$/i, 'manifest.json');
  else if (path.endsWith('/')) path += 'manifest.json';
  else if (/\.json$/i.test(path)) throw fail('Adres bir manifest.json olmalı.', 'BAD_URL');
  else path += '/manifest.json';
  url.pathname = path;
  const manifestUrl = url.href;
  const base=new URL(url);base.pathname=base.pathname.slice(0,-'/manifest.json'.length);const baseUrl=base.href.replace(/\/$/,'');
  return { manifestUrl, baseUrl, host: url.hostname.toLowerCase(), loopback, key: addonKey(manifestUrl) };
}
/** Standard addon configuration endpoint; never expose this secret-bearing URL in renderer lists. */
function addonConfigureUrl(manifestUrl) {
  const parsed=normalizeAddonUrl(manifestUrl),url=new URL(parsed.manifestUrl);
  url.pathname=url.pathname.replace(/\/manifest\.json$/i,'/configure');
  return url.href;
}
const addonKey = (manifestUrl) => createHash('sha256').update(String(manifestUrl)).digest('hex').slice(0, 16);
/** Gösterim için: yol (gizli anahtar taşıyabilir) asla gösterilmez. */
const publicLabel = (manifestUrl) => { try { return new URL(manifestUrl).host + '/…'; } catch { return ''; } };

/** İzinli uzak görsel: https, kimlik yok, genel ad. */
function safeImage(value, addonHost) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (isPrivateHost(url.hostname) && url.hostname.toLowerCase() !== addonHost) return '';
    return url.href;
  } catch { return ''; }
}
function safeHttpUrl(value, addonHost, { allowHttp = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.urlLength) return '';
  let url;
  try { url = new URL(value); } catch { return ''; }
  if (url.username || url.password) return '';
  const secure = url.protocol === 'https:';
  if (!secure && !(allowHttp && url.protocol === 'http:')) return '';
  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host) && host !== addonHost) return '';
  return url.href;
}

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('Eklenti manifest\u2019i geçersiz.', 'BAD_MANIFEST');
  const id = text(raw.id, 200), name = text(raw.name, 120), version = text(String(raw.version ?? ''), 40);
  if (!id || !name || !version) throw fail('Manifest id, name ve version alanlarını içermeli.', 'BAD_MANIFEST');
  if (!Array.isArray(raw.resources) && !Array.isArray(raw.catalogs)) throw fail('Manifest kaynak veya katalog tanımlamıyor.', 'BAD_MANIFEST');
  const types = (Array.isArray(raw.types) ? raw.types : []).filter((v) => typeof v === 'string' && TYPE_PATTERN.test(v)).slice(0, 32);
  const topPrefixes = (Array.isArray(raw.idPrefixes) ? raw.idPrefixes : []).filter((v) => typeof v === 'string' && v.length <= 40).slice(0, 40);
  const resources = [];
  for (const entry of (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 40)) {
    const item = typeof entry === 'string' ? { name: entry } : entry;
    if (!item || typeof item.name !== 'string' || !NAME_PATTERN.test(item.name)) continue;
    resources.push({
      name: item.name,
      types: (Array.isArray(item.types) ? item.types : types).filter((v) => typeof v === 'string' && TYPE_PATTERN.test(v)).slice(0, 32),
      idPrefixes: (Array.isArray(item.idPrefixes) ? item.idPrefixes : topPrefixes).filter((v) => typeof v === 'string' && v.length <= 40).slice(0, 40),
    });
  }
  const catalogs = [];
  for (const entry of (Array.isArray(raw.catalogs) ? raw.catalogs : []).slice(0, 80)) {
    if (!entry || typeof entry.type !== 'string' || !TYPE_PATTERN.test(entry.type) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) continue;
    const extra = [];
    for (const field of (Array.isArray(entry.extra) ? entry.extra : []).slice(0, 12)) {
      if (!field || typeof field.name !== 'string' || !NAME_PATTERN.test(field.name)) continue;
      extra.push({ name: field.name, isRequired: field.isRequired === true,
        options: (Array.isArray(field.options) ? field.options : []).filter((v) => typeof v === 'string').map((v) => text(v, 80)).slice(0, 80) });
    }
    // Eski biçim: extraSupported / extraRequired
    if (!extra.length && Array.isArray(entry.extraSupported)) {
      const required = new Set(Array.isArray(entry.extraRequired) ? entry.extraRequired : []);
      for (const name of entry.extraSupported.slice(0, 12)) if (typeof name === 'string' && NAME_PATTERN.test(name)) extra.push({ name, isRequired: required.has(name), options: [] });
    }
    catalogs.push({ type: entry.type, id: entry.id, name: text(entry.name, 120) || entry.id, extra });
  }
  const hints = raw.behaviorHints && typeof raw.behaviorHints === 'object' ? raw.behaviorHints : {};
  return {
    id, name, version, description: text(raw.description, 600), types, resources, catalogs, idPrefixes: topPrefixes,
    logo: typeof raw.logo === 'string' ? raw.logo : '', background: typeof raw.background === 'string' ? raw.background : '',
    configurable: hints.configurable === true, configurationRequired: hints.configurationRequired === true,
    adult: hints.adult === true, p2p: hints.p2p === true,
  };
}

/** Eklenti verilen kaynak/tür/kimliği destekliyor mu? */
function supports(manifest, resource, type, id = '') {
  if (!manifest) return false;
  return manifest.resources.some((entry) => {
    if (entry.name !== resource) return false;
    if (type && entry.types.length && !entry.types.includes(type)) return false;
    if (id && entry.idPrefixes.length && !entry.idPrefixes.some((prefix) => String(id).startsWith(prefix))) return false;
    return true;
  });
}

const encodeSegment = (value) => encodeURIComponent(String(value)).replace(/%3A/gi, ':');
function extraSegment(extra) {
  if (!extra || typeof extra !== 'object') return '';
  const parts = [];
  for (const [key, value] of Object.entries(extra).slice(0, 12)) {
    if (!NAME_PATTERN.test(key) || value == null || value === '') continue;
    const v = String(value);
    if (v.length > 200) continue;
    parts.push(`${key}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}
function buildResourceUrl(baseUrl, resource, type, id, extra) {
  if (!NAME_PATTERN.test(resource)) throw fail('Geçersiz kaynak adı.', 'BAD_REQUEST');
  if (!TYPE_PATTERN.test(String(type))) throw fail('Geçersiz içerik türü.', 'BAD_REQUEST');
  if (!ID_PATTERN.test(String(id))) throw fail('Geçersiz içerik kimliği.', 'BAD_REQUEST');
  const tail = extraSegment(extra);
  const url=new URL(baseUrl);url.pathname=url.pathname.replace(/\/$/,'')+`/${resource}/${encodeURIComponent(type)}/${encodeSegment(id)}${tail ? '/' + tail : ''}.json`;return url.href;
}

async function readBounded(response, maxBytes) {
  const declared = Number(response?.headers?.get?.('content-length') || 0);
  if (declared > maxBytes) throw fail('Eklenti yanıtı çok büyük.', 'TOO_LARGE');
  if (!response?.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw fail('Eklenti yanıtı çok büyük.', 'TOO_LARGE');
    return bytes;
  }
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value ? value.byteLength : 0;
      if (total > maxBytes) { await reader.cancel().catch(() => {}); throw fail('Eklenti yanıtı çok büyük.', 'TOO_LARGE'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock?.(); }
  return Buffer.concat(chunks, total);
}

/** Sınırlı gövde okuma. assertUrl: her sıçramada (DNS dahil) hedefi doğrulayan isteğe bağlı kanca. */
async function fetchBuffer(url, { fetch: fetchImpl = globalThis.fetch, signal, timeoutMs = LIMITS.timeoutMs, maxBytes = LIMITS.jsonBytes, assertUrl, accept = 'application/json', fresh = false } = {}) {
  if(signal?.aborted)throw fail('İstek iptal edildi.','ABORTED');
  if (typeof fetchImpl !== 'function') throw fail('Ağ erişimi kullanılamıyor.', 'NETWORK');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  try {
    let target = url, response;
    for (let hop = 0; hop <= LIMITS.redirects; hop++) {
      if (assertUrl) await assertUrl(target);
      try {
        response = await fetchImpl(target, { method: 'GET', redirect: 'manual', signal: controller.signal,
          ...(fresh === true ? { cache: 'no-store' } : {}),
          headers: { Accept: accept, 'User-Agent': USER_AGENT, ...(fresh === true ? { 'Cache-Control': 'no-cache' } : {}) } });
      } catch (error) {
        if (controller.signal.aborted) throw fail(signal?.aborted ? 'İstek iptal edildi.' : 'Eklenti zamanında yanıt vermedi.', signal?.aborted ? 'ABORTED' : 'TIMEOUT');
        throw fail('Eklentiye ulaşılamadı.', 'NETWORK');
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (hop === LIMITS.redirects) throw fail('Eklenti çok fazla yönlendirdi.', 'REDIRECT');
      const location = response.headers.get('location');
      if (!location) throw fail('Yönlendirme hedefi eksik.', 'REDIRECT');
      let next;
      try { next = new URL(location, target); } catch { throw fail('Yönlendirme hedefi geçersiz.', 'REDIRECT'); }
      if (next.username || next.password || (next.protocol !== 'https:' && !(next.protocol === 'http:' && isLoopbackHost(next.hostname)))) throw fail('Güvensiz yönlendirme engellendi.', 'REDIRECT');
      target = next.href;
    }
    if (!response.ok) throw fail(`Eklenti hata döndürdü (HTTP ${response.status}).`, 'HTTP');
    return await readBounded(response, maxBytes);
  } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', abortFromCaller); }
}
async function fetchJson(url, options = {}) {
  const bytes = await fetchBuffer(url, options);
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw fail('Eklenti yanıtı okunamadı (geçersiz JSON).', 'BAD_JSON'); }
}

/* ---- Dil kodları: Stremio altyazıları ISO 639-2 (eng, tur…) kullanır ---- */
const LANG2 = Object.freeze({
  eng: 'en', tur: 'tr', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', pob: 'pt-br', rus: 'ru',
  ara: 'ar', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', zht: 'zh-tw', dut: 'nl', nld: 'nl', pol: 'pl', swe: 'sv', nor: 'no', dan: 'da',
  fin: 'fi', gre: 'el', ell: 'el', heb: 'he', hin: 'hi', hun: 'hu', cze: 'cs', ces: 'cs', rum: 'ro', ron: 'ro', ukr: 'uk', bul: 'bg',
  hrv: 'hr', srp: 'sr', slv: 'sl', slo: 'sk', slk: 'sk', ind: 'id', may: 'ms', msa: 'ms', tha: 'th', vie: 'vi', per: 'fa', fas: 'fa',
  cat: 'ca', eus: 'eu', baq: 'eu', glg: 'gl', lit: 'lt', lav: 'lv', est: 'et', alb: 'sq', sqi: 'sq', mac: 'mk', mkd: 'mk', ice: 'is', isl: 'is', ben: 'bn', urd: 'ur',
});
function normalizeLanguage(code) {
  const raw = String(code == null ? '' : code).trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return '';
  if (LANG2[raw]) return LANG2[raw];
  if (/^[a-z]{2}(-[a-z0-9]{2,8})*$/.test(raw)) return raw;
  const base = raw.split('-')[0];
  return LANG2[base] ? LANG2[base] : '';
}
const languageMatches = (wanted, actual) => {
  const w = normalizeLanguage(wanted), a = normalizeLanguage(actual);
  if (!w || !a) return false;
  return a === w || a.split('-')[0] === w.split('-')[0];
};

/* ---- Akışlar ---- */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function normalizeInfoHash(value) {
  const raw = String(value == null ? '' : value).trim();
  if (/^[0-9a-f]{40}$/i.test(raw)) return raw.toLowerCase();
  if (/^[A-Za-z2-7]{32}$/.test(raw)) {
    let bits = ''; for (const ch of raw.toUpperCase()) bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
    let hex = ''; for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex.length === 40 ? hex : '';
  }
  return '';
}
function trackersFrom(sources) {
  const out = [];
  for (const entry of Array.isArray(sources) ? sources : []) {
    if (typeof entry !== 'string') continue;
    const value = entry.startsWith('tracker:') ? entry.slice(8) : entry;
    if (!/^(udp|https?|wss?):\/\//i.test(value) || value.length > 512) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length >= LIMITS.maxTrackers) break;
  }
  return out;
}
function buildMagnet({ infoHash, trackers = [], name = '' }) {
  const hash = normalizeInfoHash(infoHash);
  if (!hash) throw fail('Geçersiz torrent kimliği.', 'BAD_REQUEST');
  const parts = [`xt=urn:btih:${hash}`];
  const dn = text(name, 200).replace(/[\r\n]+/g, ' ').trim();
  if (dn) parts.push('dn=' + encodeURIComponent(dn));
  for (const tracker of trackers.slice(0, LIMITS.maxTrackers)) parts.push('tr=' + encodeURIComponent(tracker));
  const magnet = 'magnet:?' + parts.join('&');
  if (magnet.length > 15000) return 'magnet:?' + parts.slice(0, 2).join('&');
  return magnet;
}
const SIZE_UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
function parseStreamText(...fragments) {
  const joined = fragments.filter((v) => typeof v === 'string').join('\n');
  const info = {};
  const res = /\b(2160p|4k|uhd|1440p|1080p|720p|576p|480p|360p)\b/i.exec(joined);
  if (res) { const v = res[1].toLowerCase(); info.resolution = v === '4k' || v === 'uhd' ? '2160p' : v; }
  const seeds = /(?:👤|seeders?\s*[:=]?)\s*(\d{1,7})/iu.exec(joined); if (seeds) info.seeders = Number(seeds[1]);
  const size = /(?:💾|size\s*[:=]?)\s*([\d]+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\b/iu.exec(joined);
  if (size) info.sizeBytes = Math.round(Number(size[1].replace(',', '.')) * SIZE_UNITS[size[2].toUpperCase()]);
  const provider = /⚙️?\s*([^\n]{1,60})/u.exec(joined); if (provider) info.provider = provider[1].trim();
  const codec = /\b(hevc|x265|h\.?265|av1|x264|h\.?264)\b/i.exec(joined); if (codec) info.codec = codec[1].toLowerCase().replace('.', '');
  const hdr = /\b(dolby[ .-]?vision|dv|hdr10\+?|hdr)\b/i.exec(joined); if (hdr) info.hdr = /dolby|dv/i.test(hdr[1]) ? 'DV' : hdr[1].toUpperCase();
  const source = /\b(blu-?ray|remux|web-?dl|web-?rip|hdtv|dvdrip|cam|telesync)\b/i.exec(joined); if (source) info.source = source[1].toLowerCase().replace('-', '');
  const flags = [...joined.matchAll(/[\u{1F1E6}-\u{1F1FF}]{2}/gu)].map((m) => String.fromCodePoint(...[...m[0]].map((ch) => ch.codePointAt(0) - 0x1F1E6 + 97)));
  if (flags.length) info.flags = [...new Set(flags)].slice(0, 8);
  if (/\b(multi|dual)[ -]?(audio)?\b/i.test(joined)) info.multiAudio = true;
  const audio = /\b(atmos|truehd|dts[ .-]?hd(?:[ .-]?ma)?|dts[ .-]?x|dts|ddp|dd\+|eac3|e-ac-3|ac3|dd5\.1|aac|flac|opus)\b/i.exec(joined);
  if (audio) { const a = audio[1].toLowerCase().replace(/[ .-]/g, ''); info.audio = a === 'ddp' || a === 'dd+' || a === 'eac3' || a === 'eac-3' ? 'ddp' : a.startsWith('dtshd') ? 'dtshd' : a === 'dd51' ? 'ac3' : a; }
  const ch = /\b([257]\.[01])\b/.exec(joined); if (ch) info.channels = ch[1];
  if (/\b10[ -]?bit\b/i.test(joined)) info.tenBit = true;
  const group = /-([A-Za-z0-9]{2,14})(?:\.[a-z0-9]{2,4})?\s*$/m.exec(joined.split('\n').find((line) => /\.(mkv|mp4|avi)\s*$/i.test(line)) || ''); if (group) info.group = group[1];
  return info;
}

/** `behaviorHints.proxyHeaders.request` için güvenli başlık listesi. Tek bir izinsiz ad/değer varsa boş döner (kaynak oynatılmaz). */
const HEADER_ALLOW = /^(?:referer|origin|user-agent|authorization|cookie|accept|accept-language|x-[a-z0-9-]{1,60})$/i;
function sanitizeRequestHeaders(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  const entries = Object.entries(source);
  if (!entries.length || entries.length > 10) return [];
  const out = [];
  for (const [name, value] of entries) {
    if (typeof value !== 'string' || !HEADER_ALLOW.test(name) || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) return [];
    out.push([name, value]);
  }
  return out;
}

/** Kaynak puanı (0–100) ve dilden bağımsız etiket/uyarı kodları; arayüz kodları çevirir. */
function scoreStream(row) {
  if (!row.playable) return { score: 0, tags: [], warns: [] };
  const tags = [], warns = [];
  let score = { '2160p': 40, '1440p': 34, '1080p': 30, '720p': 20, '576p': 12 }[row.resolution] ?? 8;
  if (row.kind === 'torrent') {
    const seeds = row.seeders;
    if (seeds == null) score += 6; else { score += Math.min(25, Math.round(Math.log10(seeds + 1) * 9)); if (seeds < 5) warns.push('lowseed'); if (seeds >= 100) tags.push('fast'); }
  } else {
    score += 20;
    if (row.availability === 'cached') tags.push('instant');
    else if (row.availability === 'download') warns.push('debrid-download');
  }
  const src = row.source || '';
  if (src === 'remux') score += 10, tags.push('remux'); else if (/^blu/.test(src)) score += 8, tags.push('bluray'); else if (src === 'webdl') score += 7, tags.push('webdl'); else if (src === 'webrip') score += 5; else if (src === 'hdtv') score += 2;
  else if (src === 'cam' || src === 'telesync') score -= 40, warns.push('cam');
  if (row.hdr === 'DV') tags.push('dv'); else if (row.hdr) tags.push('hdr');
  if (row.audio === 'atmos' || row.audio === 'truehd' || row.audio === 'dtshd') score += 3, tags.push(row.audio === 'atmos' ? 'atmos' : 'hdaudio');
  if (row.tenBit) tags.push('10bit');
  if (/hevc|x265|h265/.test(row.codec || '')) { tags.push('hevc'); if (row.notWebReady || row.hdr) { score -= 4; warns.push('native'); } } else if (row.codec === 'av1') tags.push('av1');
  if (row.multiAudio) score += 3, tags.push('multi');
  if (row.subtitles?.length) score += 2, tags.push('subs');
  if (row.sizeBytes && row.sizeBytes > 60 * 1073741824) warns.push('huge');
  return { score: Math.max(0, Math.min(100, Math.round(score))), tags: [...new Set(tags)], warns: [...new Set(warns)] };
}

/** Tek bir ham Stremio akışını güvenli, düz ve oynatılabilirlik bilgili bir satıra çevirir. */
function normalizeStream(raw, addon = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const host = String(addon.host || '').toLowerCase();
  const hints = raw.behaviorHints && typeof raw.behaviorHints === 'object' ? raw.behaviorHints : {};
  const name = text(raw.name, 200), description = text(raw.description || raw.title, 1200);
  // Provider labels are hints, never a claim that every direct URL is already cached.
  const availabilityLabel = name + '\n' + description;
  const availability = /\[(?:TB|TorBox|RD|AD|PM|DL|ED|OC|P2P)[ -]+download\]/i.test(availabilityLabel) ? 'download'
    : /\[(?:TB|TorBox|RD|AD|PM|DL|ED|OC)\+\]/i.test(availabilityLabel) ? 'cached' : 'unknown';
  const parsed = parseStreamText(name, description, text(hints.filename, 300));
  const row = {
    addonKey: addon.key || '', addonName: text(addon.name, 120), name: name.split('\n')[0] || text(addon.name, 120),
    label: name.replace(/\n+/g, ' · ').slice(0, 200), title: description.split('\n')[0].slice(0, 300), description,
    filename: text(hints.filename, 300), sizeBytes: Number.isFinite(Number(hints.videoSize)) && Number(hints.videoSize) > 0 ? Number(hints.videoSize) : (parsed.sizeBytes || null),
    resolution: parsed.resolution || '', seeders: Number.isFinite(parsed.seeders) ? parsed.seeders : null, provider: parsed.provider || '',
    codec: parsed.codec || '', hdr: parsed.hdr || '', source: parsed.source || '', flags: parsed.flags || [], multiAudio: parsed.multiAudio === true,
    notWebReady: hints.notWebReady === true, bingeGroup: text(hints.bingeGroup, 200), subtitles: [], audio: parsed.audio || '', channels: parsed.channels || '', tenBit: parsed.tenBit === true, group: parsed.group || '',
    availability, kind: 'unsupported', playable: false, reason: 'unsupported', url: '', infoHash: '', fileIdx: null, trackers: [], externalUrl: '', ytId: '',
  };
  const headerSource = hints.proxyHeaders?.request && Object.keys(hints.proxyHeaders.request).length ? hints.proxyHeaders.request : hints.headers;
  const needsHeaders = !!(headerSource && typeof headerSource === 'object' && Object.keys(headerSource).length);
  const requestHeaders = needsHeaders ? sanitizeRequestHeaders(headerSource) : [];
  if (typeof raw.url === 'string' && raw.url) {
    const url = safeHttpUrl(raw.url, host, { allowHttp: addon.loopback === true });
    if (url) {
      row.kind = 'url'; row.url = url; row.requestHeaders = requestHeaders;
      // Güvenli listede olan başlıklar oynatma sırasında yalnız bu adrese eklenir; listede olmayan başlık varsa kaynak oynatılmaz.
      const usable = !needsHeaders || requestHeaders.length > 0;
      row.playable = usable; row.reason = usable ? '' : 'needs-headers'; row.usesHeaders = needsHeaders && usable;
    } else row.reason = 'unsafe-url';
  } else if (raw.infoHash) {
    const hash = normalizeInfoHash(raw.infoHash);
    if (hash) {
      row.kind = 'torrent'; row.infoHash = hash; row.trackers = trackersFrom(raw.sources);
      row.fileIdx = Number.isSafeInteger(raw.fileIdx) && raw.fileIdx >= 0 ? raw.fileIdx : null;
      row.playable = true; row.reason = '';
    } else row.reason = 'bad-hash';
  } else if (typeof raw.ytId === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(raw.ytId)) {
    row.kind = 'youtube'; row.ytId = raw.ytId; row.playable = false; row.reason = 'youtube';
  } else if (typeof raw.externalUrl === 'string') {
    const external = safeHttpUrl(raw.externalUrl, host);
    if (external) { row.kind = 'external'; row.externalUrl = external; row.reason = 'external'; }
  }
  if (raw.subtitles && Array.isArray(raw.subtitles)) {
    row.subtitles = raw.subtitles.slice(0, 40).map((entry) => normalizeSubtitle(entry, addon)).filter(Boolean);
  }
  Object.assign(row, (() => { const r = scoreStream(row); return { score: r.score, tags: r.tags, warns: r.warns }; })());
  row.id = createHash('sha256').update(JSON.stringify([row.addonKey, row.kind, row.url, row.infoHash, row.fileIdx, row.ytId, row.externalUrl, row.filename, row.label])).digest('hex').slice(0, 20);
  return row;
}

const RESOLUTION_RANK = { '2160p': 5, '1440p': 4, '1080p': 3, '720p': 2, '576p': 1, '480p': 1, '360p': 0 };
/** Varsayılan 'Önerilen' sırası: oynatılabilir önce, sonra çözünürlük, sonra seeder; eşitlikte eklenti sırası korunur. */
function rankStreams(rows) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const pa = a.row.playable ? 1 : 0, pb = b.row.playable ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ra = RESOLUTION_RANK[a.row.resolution] ?? -1, rb = RESOLUTION_RANK[b.row.resolution] ?? -1;
    if (ra !== rb) return rb - ra;
    const sa = a.row.seeders ?? -1, sb = b.row.seeders ?? -1;
    if (sa !== sb) return sb - sa;
    return a.index - b.index;
  }).map((entry) => entry.row);
}

/** Torrent içinden doğru videoyu seçer: fileIdx → bölüm eşleşmesi → en büyük video. */
function chooseTorrentFile(files, stream = {}, episode = null) {
  const videos = (Array.isArray(files) ? files : []).filter((file) => file && file.video);
  if (!videos.length) return null;
  if (Number.isSafeInteger(stream.fileIdx)) {
    const exact = videos.find((file) => file.index === stream.fileIdx);
    return exact||null;
  }
  if (episode && Number.isInteger(episode.season) && Number.isInteger(episode.episode)) {
    const s = episode.season, e = episode.episode;
    const patterns = [
      new RegExp(`(?:^|[^a-z0-9])s0*${s}[ ._-]?e0*${e}(?![0-9])`, 'i'),
      new RegExp(`(?:^|[^a-z0-9])0*${s}x0*${e}(?![0-9])`, 'i'),
      new RegExp(`season[ ._-]?0*${s}[^a-z0-9]+(?:.*[^a-z0-9])?(?:episode|ep|e)[ ._-]?0*${e}(?![0-9])`, 'i'),
    ];
    const hit = videos.filter((file) => patterns.some((pattern) => pattern.test(String(file.name))));
    if (hit.length) return hit.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    // Episode-only anime names are safe only in an unambiguous first-season
    // pack; explicit season folders must agree with the requested season.
    const bare=new RegExp('(?:episode|ep)[ ._-]?0*'+e+'(?![0-9])|(?:^|[ ._-])-[ ._-]*0*'+e+'(?:[ ._\\[]|$)','i');
    const episodeOnly=videos.filter(file=>{const name=String(file.name),folder=/\b(?:season[ ._-]*|s)0*(\d+)(?:[\\/ ._-]|$)/i.exec(name);return (folder?Number(folder[1])===s:s===1)&&bare.test(name);});
    if(episodeOnly.length===1)return episodeOnly[0];
    if(videos.length>1)return null;
  }
  return [...videos].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
}

/* ---- Altyazılar ---- */
function normalizeSubtitle(raw, addon = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const url = safeHttpUrl(raw.url, String(addon.host || '').toLowerCase(), { allowHttp: addon.loopback === true });
  if (!url) return null;
  const lang = text(raw.lang, 24);
  const language = normalizeLanguage(lang);
  return {
    id: createHash('sha256').update(url + '|' + (addon.key || '')).digest('hex').slice(0, 20),
    addonKey: addon.key || '', addonName: text(addon.name, 120), url, lang, language,
    label: text(raw.label || raw.title, 160) || lang || 'subtitle', release: text(raw.release || raw.m?.release, 300),
  };
}

/* ---- Meta / katalog ---- */
function normalizeMetaPreview(raw, addon = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = text(raw.id, 200), type = text(raw.type, 32), name = text(raw.name, 300);
  if (!ID_PATTERN.test(id) || !TYPE_PATTERN.test(type) || !name) return null;
  const host = String(addon.host || '').toLowerCase();
  const yearMatch = /(\d{4})/.exec(String(raw.releaseInfo || raw.year || ''));
  return {
    id, type, name, poster: safeImage(raw.poster, host), background: safeImage(raw.background, host), logo: safeImage(raw.logo, host),
    description: text(raw.description, 2000), year: yearMatch ? Number(yearMatch[1]) : null, releaseInfo: text(String(raw.releaseInfo ?? ''), 40),
    imdbRating: Number.isFinite(Number(raw.imdbRating)) ? Number(raw.imdbRating) : null,
    genres: (Array.isArray(raw.genres) ? raw.genres : []).filter((v) => typeof v === 'string').map((v) => text(v, 40)).slice(0, 12),
    runtime: text(String(raw.runtime ?? ''), 40), addonKey: addon.key || '',
  };
}
function metadataEpisodeNumber(value) {
  // Number(null/false/[]) is 0, but missing metadata is not an actual special.
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
function normalizeMeta(raw, addon = {}) {
  const base = normalizeMetaPreview(raw, addon);
  if (!base) return null;
  const videos = [];
  for (const video of (Array.isArray(raw.videos) ? raw.videos : []).slice(0, LIMITS.maxVideos)) {
    if (!video || typeof video !== 'object') continue;
    const id = text(video.id, 200);
    if (!ID_PATTERN.test(id)) continue;
    const season = metadataEpisodeNumber(video.season);
    const episode = metadataEpisodeNumber(video.episode ?? video.number);
    const released = typeof video.released === 'string' && !Number.isNaN(Date.parse(video.released)) ? new Date(video.released).toISOString() : '';
    videos.push({ id, title: text(video.title || video.name, 300), season, episode, released,
      ...(typeof video.available === 'boolean' ? { available: video.available } : {}),
      thumbnail: safeImage(video.thumbnail, String(addon.host || '').toLowerCase()), overview: text(video.overview || video.description, 1200) });
  }
  const defaultId = raw.behaviorHints?.defaultVideoId;
  return { ...base, videos, defaultVideoId: typeof defaultId === 'string' && ID_PATTERN.test(defaultId) ? defaultId : '',
    cast: (Array.isArray(raw.cast) ? raw.cast : []).filter((v) => typeof v === 'string').map((v) => text(v, 80)).slice(0, 20),
    director: (Array.isArray(raw.director) ? raw.director : []).filter((v) => typeof v === 'string').map((v) => text(v, 80)).slice(0, 6),
    writer: (Array.isArray(raw.writer) ? raw.writer : []).filter((v) => typeof v === 'string').map((v) => text(v, 80)).slice(0, 6),
    awards: text(raw.awards, 300), country: text(raw.country, 120), language: text(raw.language, 120), released: typeof raw.released === 'string' && !Number.isNaN(Date.parse(raw.released)) ? new Date(raw.released).toISOString().slice(0, 10) : '',
    trailers: (Array.isArray(raw.trailers) ? raw.trailers : []).filter((v) => v && /^[A-Za-z0-9_-]{6,20}$/.test(String(v.source || v.ytId || ''))).map((v) => ({ ytId: String(v.source || v.ytId), title: text(v.type || v.title || 'Trailer', 60) })).slice(0, 4) };
}
const videoKey = (video) => (video && video.season != null && video.episode != null ? `${video.season}:${video.episode}` : String(video?.id || ''));
function parseEpisodeId(id) {
  const match = /^(.+):(\d{1,4}):(\d{1,5})$/.exec(String(id || ''));
  return match ? { seriesId: match[1], season: Number(match[2]), episode: Number(match[3]) } : null;
}
const episodeId = (seriesId, season, episode) => `${seriesId}:${season}:${episode}`;

module.exports = {
  sanitizeRequestHeaders, scoreStream,
  LIMITS, AddonError, isLoopbackHost, normalizeAddonUrl, addonConfigureUrl, addonKey, publicLabel, safeImage, safeHttpUrl, validateManifest, supports,
  buildResourceUrl, fetchJson, fetchBuffer, normalizeLanguage, languageMatches, normalizeInfoHash, buildMagnet, parseStreamText,
  normalizeStream, rankStreams, chooseTorrentFile, normalizeSubtitle, normalizeMetaPreview, normalizeMeta, parseEpisodeId, episodeId, videoKey,
};
