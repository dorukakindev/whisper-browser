'use strict';
// Versioned source locators for production runs ("go back to the source").
//
// A run record used to keep only an opaque source identity (a digest of whatever string the renderer named). That is enough
// to compare "is this the same media", never enough to reopen a different one. A locator is the missing piece: a small,
// versioned record that names the library/Podcast record the run was started from. Rules:
//   * It is derived HERE, from main-owned records. The renderer may only name a record id; it cannot supply a path, a URL,
//     a token or a title, and the claim is refused unless it is corroborated by the very source string the run is bound to.
//   * It carries ids and versions only: no signed URL, no access token, no session, no key and no personal absolute path.
//   * Nothing is guessed. A title, a file name or a similarity never produces a locator; an older record without one keeps
//     the old, explained limit. Unknown versions are preserved untouched and simply not used.
//   * Resolving is read-only and re-validates the record at open time. The open itself is done by the existing owners
//     (Podcast open path in the renderer); a ticket lets the renderer confirm the record is still the same afterwards.
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const session = require('./podcast-session');
const { identity: fileIdentity } = require('./dub-source-identity');

const VERSION = 1;
const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const HEX = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^[a-f0-9]{24}$/;
const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
const sha = value => createHash('sha256').update(value).digest('hex');
const msg = (en, tr) => en + ' / ' + tr;

const REASONS = {
  'no-locator': msg('This older record keeps only an opaque source identity, so it cannot reopen a source on its own.', 'Bu eski kayıt yalnız opak bir kaynak kimliği tutar; kaynağı kendi başına yeniden açamaz.'),
  unsupported: msg('The source information in this record was written by a different version of the app, so it is not used.', 'Bu kayıttaki kaynak bilgisi uygulamanın farklı bir sürümünce yazılmış; kullanılmıyor.'),
  'source-missing': msg('The recorded source is no longer in the library.', 'Kayıtlı kaynak artık kütüphanede yok.'),
  'source-changed': msg('The library record now points to different content than this run used.', 'Kütüphane kaydı artık bu çalışmanın kullandığından farklı bir içeriğe işaret ediyor.'),
  'version-changed': msg('The source changed since this run (its audio source version or file contents are different).', 'Kaynak bu çalışmadan sonra değişti (ses kaynağı sürümü veya dosya içeriği farklı).'),
  'needs-confirmation': msg('This library source was imported from a package and must first be confirmed with the file picker in the library.', 'Bu kütüphane kaynağı bir paketten içe aktarılmış; önce kütüphanede dosya seçiciyle doğrulanmalı.'),
  'file-missing': msg('The recorded file is missing or cannot be read.', 'Kayıtlı dosya yok veya okunamıyor.'),
  'file-changed': msg('The file changed while it was being opened.', 'Dosya açılırken değişti.'),
  'unknown-run': msg('This run is no longer in the list.', 'Bu çalışma artık listede yok.')
};
const NEXTS = {
  'no-locator': msg('Open the original episode or file yourself, then start a new generation; the saved result and quotes stay as they are.', 'Özgün bölümü veya dosyayı kendin aç, sonra yeni üretim başlat; kayıtlı sonuç ve alıntılar olduğu gibi kalır.'),
  unsupported: msg('Open the original source yourself; this record stays unchanged.', 'Özgün kaynağı kendin aç; bu kayıt değişmeden kalır.'),
  'source-missing': msg('Add the episode back to the library, or open another copy, then start a new generation. The record and its audio are kept.', 'Bölümü kütüphaneye yeniden ekle veya başka bir kopyayı aç, sonra yeni üretim başlat. Kayıt ve sesi korunur.'),
  'source-changed': msg('Open the episode you mean yourself. Nothing was opened.', 'Kastettiğin bölümü kendin aç. Hiçbir şey açılmadı.'),
  'version-changed': msg('You can open the current version for reference; it is not the version this run used. Starting a new generation uses the current one.', 'Başvuru için güncel sürümü açabilirsin; bu çalışmanın kullandığı sürüm değildir. Yeni üretim güncel sürümü kullanır.'),
  'needs-confirmation': msg('Open the file from the library once so it is confirmed, then try again. Nothing was opened.', 'Dosyayı kütüphaneden bir kez açıp doğrula, sonra yeniden dene. Hiçbir şey açılmadı.'),
  'file-missing': msg('Relink the file in the library or open another copy, then start a new generation. The record and its audio are kept.', 'Dosyayı kütüphanede yeniden bağla veya başka bir kopyayı aç, sonra yeni üretim başlat. Kayıt ve sesi korunur.'),
  'file-changed': msg('Try again; nothing was confirmed as this run\'s source.', 'Yeniden dene; hiçbir şey bu çalışmanın kaynağı olarak doğrulanmadı.'),
  'unknown-run': msg('Refresh the list.', 'Listeyi yenile.')
};
const refuse = (code, extra = {}) => ({ ok: false, code, error: REASONS[code] || REASONS.unsupported, next: NEXTS[code] || NEXTS.unsupported, ...extra });

// ---- schema ---------------------------------------------------------------------------------------------------
// -> {state:'none'} (nothing recorded) | {state:'ok', locator} | {state:'unsupported'} (present but not usable here).
function clean(raw) {
  if (raw === undefined || raw === null) return { state: 'none' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== VERSION) return { state: 'unsupported' };
  if (raw.kind === 'podcast') {
    if (![raw.entryId, raw.episodeIdentity].every(value => typeof value === 'string' && ID.test(value)) || typeof raw.sourceVersion !== 'string' || !HEX.test(raw.sourceVersion)) return { state: 'unsupported' };
    return { state: 'ok', locator: { v: VERSION, kind: 'podcast', entryId: raw.entryId, episodeIdentity: raw.episodeIdentity, sourceVersion: raw.sourceVersion } };
  }
  if (raw.kind === 'catalog') {
    if (typeof raw.itemId !== 'string' || !ID.test(raw.itemId) || typeof raw.sourceId !== 'string' || !SOURCE_ID.test(raw.sourceId) || typeof raw.fileIdentity !== 'string' || !HEX.test(raw.fileIdentity)) return { state: 'unsupported' };
    return { state: 'ok', locator: { v: VERSION, kind: 'catalog', itemId: raw.itemId, sourceId: raw.sourceId, fileIdentity: raw.fileIdentity } };
  }
  if (raw.kind === 'youtube') {
    if (typeof raw.videoId !== 'string' || !VIDEO_ID.test(raw.videoId)) return { state: 'unsupported' };
    return { state: 'ok', locator: { v: VERSION, kind: 'youtube', videoId: raw.videoId } };
  }
  return { state: 'unsupported' };
}
const fingerprint = locator => sha(JSON.stringify(Object.keys(locator).sort().map(key => [key, locator[key]])));
// What the renderer and the assistant may see: a state and a kind, never an id.
function view(raw, hasIdentity) {
  const found = clean(raw);
  if (found.state === 'ok') return { state: 'recorded', kind: found.locator.kind };
  if (found.state === 'unsupported') return { state: 'unsupported', kind: null };
  return { state: hasIdentity ? 'legacy' : 'none', kind: null };
}

const samePath = (a, b) => { const norm = value => { const r = path.resolve(String(value)); return process.platform === 'win32' ? r.toLowerCase() : r; }; return norm(a) === norm(b); };
// A video id only from an https/http address on an allow-listed YouTube host; nothing else from the address is kept.
function youtubeId(value) {
  try {
    const url = new URL(String(value));
    if (!['https:', 'http:'].includes(url.protocol) || !YOUTUBE_HOSTS.includes(url.hostname)) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
    return id && VIDEO_ID.test(id) ? id : null;
  } catch (_) { return null; }
}
const streamKey = url => { try { return 'stream:' + sha(new URL(url).href); } catch (_) { return null; } };

function createSourceLocator({ podcasts = null, catalog = null, now = Date.now, ttl = 120000, token = () => randomBytes(16).toString('hex') } = {}) {
  const tickets = new Map();
  const store = () => { const value = typeof podcasts?.store === 'function' ? podcasts.store() : null; if (!value) throw Error('Podcast records are unavailable.'); return value; };
  const prune = () => { const time = now(); for (const [key, row] of tickets) if (row.expires <= time) tickets.delete(key); while (tickets.size > 64) tickets.delete(tickets.keys().next().value); };

  // The claim must be corroborated by the exact source string the run is bound to: the first audio enclosure's stream key,
  // or the verified downloaded copy of that same episode. Naming an episode while dubbing something else pins nothing.
  async function corroborates(entry, source) {
    if (typeof source !== 'string' || !source) return false;
    const first = (entry.enclosures || []).find(item => /^audio\//.test(item?.type || ''));
    if (first && streamKey(first.url) === source) return true;
    if (typeof podcasts?.exactAudio === 'function') {
      try { const exact = await podcasts.exactAudio(entry); if (exact?.available && typeof exact.path === 'string' && samePath(exact.path, source)) return true; } catch (_) {}
    }
    return false;
  }

  const catalogStore = () => { const value = typeof catalog?.store === 'function' ? catalog.store() : null; if (!value) throw Error('Library records are unavailable.'); return value; };
  // Library media is found by the exact local path among main-owned catalog sources; none or several matches means nothing is pinned.
  function pinCatalog(request) {
    if (typeof request.source !== 'string' || !path.isAbsolute(request.source) || typeof catalog?.sources !== 'function') return null;
    const matches = [];
    for (const item of catalogStore().list()) for (const row of catalog.sources(item)) {
      if (row.type !== 'local' || row.source?.imported === true || typeof row.source?.value !== 'string') continue;
      if (samePath(row.source.value, request.source)) matches.push({ item, row });
    }
    if (matches.length !== 1) return null;
    const digest = fileIdentity(request.source);
    if (!digest) return null;
    return { v: VERSION, kind: 'catalog', itemId: matches[0].item.id, sourceId: matches[0].row.id, fileIdentity: digest };
  }
  // Never throws: any doubt means "no locator" and the run keeps the old, explained limit.
  async function pin(request) {
    try {
      const ref = request?.sourceRef;
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
      if (ref.kind === 'podcast') {
        if (typeof ref.entryId !== 'string' || !ID.test(ref.entryId) || typeof ref.sourceVersion !== 'string') return null;
        const entry = store().entry(ref.entryId);
        if (entry?.kind !== 'podcast') return null;
        const version = session.sourceVersion(entry);
        if (version !== ref.sourceVersion) return null;
        if (!(await corroborates(entry, request.source))) return null;
        return { v: VERSION, kind: 'podcast', entryId: entry.id, episodeIdentity: session.episodeIdentity(entry), sourceVersion: version };
      }
      if (ref.kind === 'catalog') return pinCatalog(request);
      if (ref.kind === 'youtube') {
        // The renderer names a video; main re-derives it from the bound address and requires both to agree.
        const id = youtubeId(request.source);
        return id && ref.videoId === id ? { v: VERSION, kind: 'youtube', videoId: id } : null;
      }
    } catch (_) {}
    return null;
  }

  // Read-only. Returns the exact open target for the existing owner, or a refusal with a reason and a safe next step.
  function resolve(raw, options = {}) {
    const found = clean(raw);
    if (found.state === 'none') return refuse('no-locator');
    if (found.state === 'unsupported') return refuse('unsupported');
    const locator = found.locator;
    if (locator.kind === 'podcast') {
      let entry;
      try { entry = store().entry(locator.entryId); } catch (_) { return refuse('source-missing'); }
      if (entry?.kind !== 'podcast') return refuse('source-missing');
      if (session.episodeIdentity(entry) !== locator.episodeIdentity) return refuse('source-changed');
      const current = session.sourceVersion(entry), same = current === locator.sourceVersion;
      if (!same && options.allowChanged !== true) return refuse('version-changed', { canOpenCurrent: true });
      return { ok: true, kind: 'podcast', target: { kind: 'podcast', entryId: entry.id, view: 'podcast' }, label: String(entry.title || '').slice(0, 300),
        versionMatches: same, expectedVersion: current, fingerprint: fingerprint(locator) };
    }
    if (locator.kind === 'catalog') {
      let item; try { item = catalogStore().get(locator.itemId); } catch (_) { return refuse('source-missing'); }
      if (!item) return refuse('source-missing');
      const row = catalog.sources(item).find(entry => entry.id === locator.sourceId);
      if (!row || row.type !== 'local' || typeof row.source?.value !== 'string') return refuse('source-changed');
      if (row.source.imported === true) return refuse('needs-confirmation');
      const file = row.source.value, current = fileIdentity(file);
      if (!current) return refuse('file-missing');
      const same = current === locator.fileIdentity;
      if (!same && options.allowChanged !== true) return refuse('version-changed', { canOpenCurrent: true });
      return { ok: true, kind: 'catalog', target: { kind: 'catalog', itemId: item.id, sourceId: row.id }, label: String(item.title || '').slice(0, 300), versionMatches: same,
        fingerprint: fingerprint(locator), verify: () => (fileIdentity(file) === current ? null : 'file-changed') };
    }
    if (locator.kind === 'youtube') return { ok: true, kind: 'youtube', target: { kind: 'youtube', videoId: locator.videoId }, label: '', versionMatches: true, fingerprint: fingerprint(locator) };
    return refuse('unsupported');
  }

  // A ticket ties one resolved open to its run and to the app window that asked. Confirming consumes it and re-reads the
  // record: if the run was deleted or its locator changed in between, the open is reported as unconfirmed, never as a success.
  function issue({ runId, sender, fingerprint: print, verify = null }) { prune(); const id = token(); tickets.set(id, { runId, sender, fingerprint: print, verify, expires: now() + ttl }); return id; }
  function confirm(id, { sender, current }) {
    prune();
    const row = typeof id === 'string' ? tickets.get(id) : null;
    if (!row || row.sender !== sender) return { ok: false, code: 'expired' };
    tickets.delete(id);
    let print = null; try { print = current(row.runId); } catch (_) {}
    if (!print) return { ok: false, code: 'record-gone', runId: row.runId };
    if (print !== row.fingerprint) return { ok: false, code: 'record-changed', runId: row.runId };
    // Kind-specific proof that what was opened is still what was resolved (e.g. the file did not change while opening).
    let problem = null; try { problem = row.verify ? row.verify() : null; } catch (_) { problem = 'file-changed'; }
    if (problem) return { ok: false, code: problem, runId: row.runId, error: REASONS[problem], next: NEXTS[problem] };
    return { ok: true, runId: row.runId };
  }
  return { pin, resolve, issue, confirm, view, clean, fingerprint, tickets, unknownRun: () => refuse('unknown-run') };
}

module.exports = { createSourceLocator, clean, fingerprint, view, youtubeId, VERSION, REASONS, NEXTS };
