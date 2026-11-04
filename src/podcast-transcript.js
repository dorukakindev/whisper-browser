/* Podcast transcript tanımlayıcıları: normalizasyon + zamanlılık sınıfı + güvenli getirme politikası (saf).
   Ağ çağrısı bu dosyada YOK: gerçek fetch main sürecinde, redirect başına host/IP doğrulamasıyla yapılır.
   Kaynak: Podcasting 2.0 podcast:transcript (url/type/language/rel). RSS açıklaması transcript değildir. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PodcastTranscript = api;
})(globalThis, () => {
  'use strict';

  /** Önerilen sınırlar; mevcut daha sıkı limitleri gevşetmez (daha sıkıysa o kullanılır). */
  const FETCH_LIMITS = Object.freeze({ maxRedirects: 5, timeoutMs: 20000, maxBytes: 5 * 1024 * 1024 });
  const TIMED_YES = new Set(['text/vtt', 'application/x-subrip', 'text/srt', 'application/srt']);
  const TIMED_NO = new Set(['text/plain', 'text/html']);
  const TIMED_CONDITIONAL = new Set(['application/ttml+xml', 'application/xml', 'text/xml']);

  const mimeOf = (type) => String(type == null ? '' : type).split(';')[0].trim().toLowerCase();
  const langOf = (tag) => {
    const t = String(tag == null ? '' : tag).trim().replace(/_/g, '-').toLowerCase();
    return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(t) ? t : null;
  };

  /** Özel/loopback/link-local IP veya yerel ad: SSRF'e karşı ilk, yalnız sözdizimsel kapı. */
  function isPrivateHost(host) {
    const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      const [a, b] = v4.slice(1).map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
    return false;
  }
  /** Yalnız https, kimlik bilgisi yok, genel ad. DNS sonucu ayrıca main'de doğrulanır. */
  function isSafeTranscriptUrl(value) {
    let u;
    try { u = new URL(String(value)); } catch (_) { return false; }
    return u.protocol === 'https:' && !u.username && !u.password && !isPrivateHost(u.hostname);
  }

  function timedSupport(mime) {
    if (TIMED_YES.has(mime)) return 'yes';
    if (TIMED_NO.has(mime)) return 'no';
    if (TIMED_CONDITIONAL.has(mime)) return 'conditional';
    return 'unknown'; // application/json dahil: şema doğrulanmadan zamanlı işaretlenmez
  }

  /** → { descriptors, rejected } ; descriptors TranscriptDescriptor[] (d.ts). */
  function normalizeDetailed(raw, feedLanguage) {
    const descriptors = []; const rejected = []; const seen = new Set();
    const fallback = langOf(feedLanguage);
    for (const item of Array.isArray(raw) ? raw : []) {
      const url = item && typeof item.url === 'string' ? item.url.trim() : '';
      if (!url) { rejected.push({ reason: 'missing-url', url: '' }); continue; }
      if (!isSafeTranscriptUrl(url)) { rejected.push({ reason: 'unsafe-url', url }); continue; }
      const mime = mimeOf(item.type);
      if (!mime) { rejected.push({ reason: 'missing-type', url }); continue; }
      const key = url + '|' + mime;
      if (seen.has(key)) continue;
      seen.add(key);
      descriptors.push({
        url, mime, language: langOf(item.language) || fallback || null, timed: timedSupport(mime),
        relation: String(item.rel || '').toLowerCase() === 'captions' ? 'captions' : 'transcript', provenance: 'publisher',
      });
    }
    return { descriptors, rejected };
  }
  function normalizePodcastTranscripts(raw, feedLanguage) { return normalizeDetailed(raw, feedLanguage).descriptors; }

  /** İçeriğe bakarak biçim: WEBVTT / SRT / düz metin. Zaman damgası yoksa timed:'no'. */
  function sniffTranscriptFormat(content) {
    const text = String(content == null ? '' : content).replace(/^\uFEFF/, '');
    if (/^WEBVTT(\s|$)/.test(text)) return { format: 'vtt', timed: 'yes' };
    if (/(^|\n)\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text)) return { format: 'srt', timed: 'yes' };
    if (/^\s*</.test(text)) return { format: 'markup', timed: 'unknown' };
    return { format: 'plain', timed: 'no' };
  }

  /** HTTP sonucunu ayrı sınıflara ayırır; 403/429/503 boş başarı sayılmaz. */
  function classifyTranscriptResponse({ descriptor, status, contentType, byteLength, retryAfterSeconds }) {
    if (status === 429) return { ok: false, code: 'rate-limited', retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null };
    if (status === 403) return { ok: false, code: 'forbidden' };
    if (status === 404 || status === 410) return { ok: false, code: 'not-found' };
    if (status === 503 || status === 502 || status === 504) return { ok: false, code: 'unavailable' };
    if (!(status >= 200 && status < 300)) return { ok: false, code: 'http-error', status };
    if (byteLength > FETCH_LIMITS.maxBytes) return { ok: false, code: 'too-large' };
    const got = mimeOf(contentType);
    if (descriptor && got && got !== descriptor.mime && !(TIMED_NO.has(got) && TIMED_NO.has(descriptor.mime))) {
      return { ok: false, code: 'mime-mismatch', expected: descriptor.mime, got };
    }
    return { ok: true };
  }

  /** UI için en iyi aday: zamanlı > koşullu > bilinmeyen > zamansız; tercih edilen dil önce. */
  function pickBestTranscript(descriptors, { preferLanguages = [] } = {}) {
    const rank = { yes: 0, conditional: 1, unknown: 2, no: 3 };
    const prefs = preferLanguages.map(langOf).filter(Boolean);
    const langRank = (d) => { const i = prefs.findIndex((p) => d.language && (d.language === p || d.language.startsWith(p + '-'))); return i < 0 ? prefs.length : i; };
    return (descriptors || []).slice().sort((a, b) => langRank(a) - langRank(b) || rank[a.timed] - rank[b.timed]
      || (a.relation === b.relation ? 0 : a.relation === 'captions' ? -1 : 1) || (a.url < b.url ? -1 : 1))[0] || null;
  }
  /** Seek/kelime etkileşimi yeteneği: zamansız metin satırlara yapay zaman üretmez. */
  function transcriptCapability(descriptor) {
    if (!descriptor) return { support: 'no', reason: 'no-transcript' };
    if (descriptor.timed === 'yes') return { support: 'yes' };
    if (descriptor.timed === 'no') return { support: 'no', reason: 'untimed' };
    return { support: 'unknown', reason: 'format-unverified' };
  }

  return Object.freeze({ FETCH_LIMITS, normalizePodcastTranscripts, normalizeDetailed, isSafeTranscriptUrl, isPrivateHost,
    sniffTranscriptFormat, classifyTranscriptResponse, pickBestTranscript, transcriptCapability, mimeOf });
});
