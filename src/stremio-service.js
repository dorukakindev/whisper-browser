'use strict';
// Stremio eklenti servisi: kalıcı eklenti listesi, akış/altyazı/katalog toplama, oynatma köprüsü ve
// "kaldığın yerden devam" kaydı. Liste oturumları main'de kalır; renderer aktif oynatma
// URI'sini alır. Kalıcı kaynak gizliliği MediaHub güvenli depoda korunur.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const A = require('./stremio-addons');

const MAX_ADDONS = 40, MAX_PROGRESS = 2000, SESSION_LIMIT = 12, PREVIEW_TTL = 600000;
const err = (message, code) => new A.AddonError(message, code);
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const int = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' ? Number(v) : null);

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    if (fs.statSync(file).size > 8_000_000) throw new Error('too large');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if(!value||value.version!==1)throw Error('Invalid saved data');return value;
  } catch { throw err('Saved Stremio data could not be read; existing file was kept.', 'STORAGE_READ'); }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, JSON.stringify(value));
  try { fs.chmodSync(file, 0o600); } catch { /* Windows: ACL kullanıcıya özel profilde */ }
}

/** WebVTT → SRT: dublaj ve çeviri hatları yalnız .srt kabul eder; Stremio altyazıları sıklıkla VTT gelir. */
function vttToSrt(text) {
  const body = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n+/, '').replace(/^(?:NOTE|STYLE|REGION)\b[\s\S]*?\n\n/gm, '');
  const cues = []; let n = 0;
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.length), at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const m = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/.exec(lines[at]); if (!m) continue;
    const fix = (v) => { const [a, ms = '0'] = v.replace(',', '.').split('.'); const parts = a.split(':'); while (parts.length < 3) parts.unshift('0'); return parts.map((x, i) => (i === 0 ? x.padStart(2, '0') : x.padStart(2, '0'))).join(':') + ',' + ms.padEnd(3, '0').slice(0, 3); };
    const text = lines.slice(at + 1).join('\n').replace(/<\/?(?:c|v|lang|ruby|rt)[^>]*>/g, '').trim(); if (!text) continue;
    cues.push(`${++n}\n${fix(m[1])} --> ${fix(m[2])}\n${text}`);
  }
  return cues.join('\n\n') + (cues.length ? '\n' : '');
}

function createStremioService({ root, fetch: fetchImpl = globalThis.fetch, assertUrl, torrents, searchSubtitles, downloadSubtitle, decodeSubtitle, grantSubtitle = () => {}, configureAddon, now = Date.now } = {}) {
  const addonsFile = () => path.join(root(), 'stremio-addons.json');
  const progressFile = () => path.join(root(), 'stremio-progress.json');
  const previews = new Map(), streamSessions = new Map(), subtitleSessions = new Map(), headerGrants = new Map();
  const GRANT_TTL = 6 * 3600 * 1000, GRANT_LIMIT = 24;
  // Yalnız oynatma için seçilen tam adrese eklenecek başlıklar (ana süreçte kalır; renderer değerleri görmez).
  function grantHeaders(url, headers) {
    headerGrants.delete(url); headerGrants.set(url, { at: now(), headers });
    while (headerGrants.size > GRANT_LIMIT) headerGrants.delete(headerGrants.keys().next().value);
  }
  function headersFor(url) {
    const grant = headerGrants.get(String(url || ''));
    if (!grant) return [];
    if (now() - grant.at > GRANT_TTL) { headerGrants.delete(url); return []; }
    return grant.headers.map(([name, value]) => [name, value]);
  }
  const remember = (map, key, value, limit = SESSION_LIMIT) => { map.set(key, value); while (map.size > limit) map.delete(map.keys().next().value); };

  const loadAddons = () => readJson(addonsFile(), { version: 1, addons: [] });
  const saveAddons = (data) => writeJson(addonsFile(), data);
  const loadProgress = () => readJson(progressFile(), { version: 1, entries: {} });
  const libraryFile = () => path.join(root(), 'stremio-library.json');
  const loadLibrary = () => readJson(libraryFile(), { version: 1, items: [] });
  const libraryRow = (i) => ({ type: i.type, id: i.id, name: i.name, poster: i.poster || '', year: i.year ?? null, imdbRating: i.imdbRating ?? null, addedAt: i.addedAt });
  const ratingsFile = () => path.join(root(), 'stremio-ratings.json');
  const loadRatings = () => readJson(ratingsFile(), { version: 1, entries: {} });
  const STATUSES = new Set(['', 'planned', 'watching', 'watched', 'dropped']);
  const ratingKey = (type, id) => `${type}:${id}`;
  function ratingGet({ type, id }) { return { rating: loadRatings().entries[ratingKey(str(type, 32), str(id, 200))] || null }; }
  function ratingSet(input) {
    const type = str(input.type, 32), id = str(input.id, 200);
    if (!/^[a-z0-9_-]{1,32}$/i.test(type) || !/^[A-Za-z0-9_.:~+-]{1,200}$/.test(id)) throw err('Geçersiz içerik kimliği.', 'BAD_REQUEST');
    const score = Math.max(0, Math.min(10, Math.round(Number(input.score) || 0))), note = str(input.note, 2000).trim(), status = STATUSES.has(input.status) ? input.status : '';
    const data = loadRatings(), key = ratingKey(type, id);if(!data.entries[key]&&Object.keys(data.entries).length>=2000&&(score||note||status))throw err('Rating capacity reached; existing records kept.','CAPACITY');
    if (!score && !note && !status) { delete data.entries[key]; writeJson(ratingsFile(), data); return { rating: null }; }
    data.entries[key] = { type, id, name: str(input.name, 300) || data.entries[key]?.name || id, poster: A.safeImage(input.poster, '') || data.entries[key]?.poster || '', year: int(input.year), score, note, status, updatedAt: now() };

    writeJson(ratingsFile(), data); return { rating: data.entries[key] };
  }
  function ratingList() { return { items: Object.values(loadRatings().entries).sort((a, b) => b.updatedAt - a.updatedAt) }; }
  function historyList() {
    const rows = Object.values(loadProgress().entries).sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 400);
    const day = 86400000, nowMs = now(), watchedSeconds = Object.values(loadProgress().entries).reduce((sum, e) => sum + (e.completed ? e.duration : e.position), 0);
    const titles = new Set(Object.values(loadProgress().entries).map((e) => e.type + ':' + e.id));
    const days = new Set(rows.map((e) => Math.floor(e.lastWatched / day)));
    let streak = 0; for (let d = Math.floor(nowMs / day); days.has(d) || (streak === 0 && days.has(d - 1)); d--) { if (days.has(d)) streak++; else if (streak === 0) continue; else break; }
    return { items: rows, stats: { titles: titles.size, episodes: Object.values(loadProgress().entries).filter((e) => e.completed).length, hours: Math.round(watchedSeconds / 360) / 10, thisWeek: rows.filter((e) => nowMs - e.lastWatched < 7 * day).length, streak } };
  }
  function libraryList() { return { items: loadLibrary().items.map(libraryRow) }; }
  function libraryHas({ type, id }) { return { saved: loadLibrary().items.some((i) => i.type === type && i.id === id) }; }
  function libraryToggle(input) {
    const type = str(input.type, 32), id = str(input.id, 200);
    if (!/^[a-z0-9_-]{1,32}$/i.test(type) || !/^[A-Za-z0-9_.:~+-]{1,200}$/.test(id)) throw err('Geçersiz içerik kimliği.', 'BAD_REQUEST');
    const data = loadLibrary(), i = data.items.findIndex((x) => x.type === type && x.id === id);
    if (i >= 0) data.items.splice(i, 1);
    else {
      if(data.items.length>=500)throw err('Library capacity reached; existing records kept.','CAPACITY');
      data.items.unshift({ type, id, name: str(input.name, 300) || id, poster: A.safeImage(input.poster, ''), year: int(input.year), imdbRating: Number.isFinite(Number(input.imdbRating)) ? Number(input.imdbRating) : null, addedAt: now() });

    }
    writeJson(libraryFile(), data); return { saved: i < 0, items: data.items.map(libraryRow) };
  }

  const guard = (addon) => async(url) => {const target=new URL(url);if(A.isLoopbackHost(target.hostname)){if(!addon.loopback||target.hostname.toLowerCase()!==addon.host)throw err('Cross-host private redirect refused.','BAD_URL');return;}if(assertUrl)await assertUrl(url);};
  const ctx = (record) => {
    const parsed = A.normalizeAddonUrl(record.manifestUrl);
    return { key: record.key, name: record.manifest.name, host: parsed.host, loopback: parsed.loopback, baseUrl: parsed.baseUrl };
  };
  const call = (addon, url, options = {}) => A.fetchJson(url, { fetch: fetchImpl, assertUrl: guard(addon), ...options });

  function publicAddon(record) {
    const m = record.manifest, parsed = A.normalizeAddonUrl(record.manifestUrl);
    return {
      key: record.key, label: A.publicLabel(record.manifestUrl), name: m.name, version: m.version, description: m.description,
      logo: A.safeImage(m.logo, parsed.host), enabled: record.enabled !== false, types: m.types, resources: [...new Set(m.resources.map((r) => r.name))],
      catalogs: m.catalogs.length, configurationRequired: m.configurationRequired, configurable: m.configurable, configurationUnknown:typeof m.configurable!=='boolean', p2p: m.p2p, adult: m.adult,
      installedAt: record.installedAt,
    };
  }
  const enabledFor = (resource, type, id) => loadAddons().addons.filter((r) => r.enabled !== false && A.supports(r.manifest, resource, type, id));

  async function fanOut(records, task) {
    const settled = await Promise.all(records.map(async (record) => {
      const addon = ctx(record);
      try { return { addon, value: await task(record, addon) }; }
      catch (error) { return { addon, error: { message: error.message, code: error.code || 'ERROR' } }; }
    }));
    return settled;
  }

  /* ---- Eklenti yönetimi ---- */
  async function addonPreview({ url }, signal, replacement = null) {
    const parsed = A.normalizeAddonUrl(url);
    const data = loadAddons();
    if (data.addons.length >= MAX_ADDONS && !replacement && !data.addons.some(r=>r.key===parsed.key)) throw err(`En fazla ${MAX_ADDONS} eklenti eklenebilir.`, 'LIMIT');
    const raw = await A.fetchJson(parsed.manifestUrl, { fetch: fetchImpl, assertUrl: guard(parsed), maxBytes: A.LIMITS.manifestBytes, signal });
    const manifest = A.validateManifest(raw);
    if(replacement&&manifest.id!==replacement.manifestId)throw err('The configured addon identity changed; existing settings were kept.','CONFIG_ID');
    const token = randomUUID();
    remember(previews, token, { at: now(), manifestUrl: parsed.manifestUrl, key: parsed.key, manifest, replacement }, 8);
    const names = new Set(manifest.resources.map((r) => r.name));
    return {
      token, alreadyInstalled: data.addons.some((r) => r.key === parsed.key), name: manifest.name, version: manifest.version,
      description: manifest.description, logo: A.safeImage(manifest.logo, parsed.host), label: A.publicLabel(parsed.manifestUrl),
      types: manifest.types, resources: [...names], catalogs: manifest.catalogs.length,
      provides: { streams: names.has('stream'), subtitles: names.has('subtitles'), catalog: manifest.catalogs.length > 0, meta: names.has('meta') },
      configurable: manifest.configurable, configurationRequired: manifest.configurationRequired, replacing:!!replacement, p2p: manifest.p2p, adult: manifest.adult,
    };
  }
  async function addonConfigure({key,token}) {
    if(typeof configureAddon!=='function')throw err('Addon configuration is unavailable.','CONFIG_UNAVAILABLE');
    let record,replacement=null;
    if(key){record=loadAddons().addons.find(r=>r.key===key);if(!record)throw err('Addon not found.','NOT_FOUND');replacement={key:record.key,url:record.manifestUrl,manifestId:record.manifest.id};}
    else {const plan=previews.get(token);if(!plan||now()-plan.at>PREVIEW_TTL)throw err('Addon preview expired.','EXPIRED');record=plan;replacement=plan.replacement;if(!replacement){const installed=loadAddons().addons.find(r=>r.key===plan.key);if(installed)replacement={key:installed.key,url:installed.manifestUrl,manifestId:installed.manifest.id};}}
    // Old saved manifests may predate capability flags. Recheck only the selected
    // addon, without writing its saved state or guessing an unsupported page.
    if(typeof record.manifest.configurable!=='boolean'){
      let fresh;
      try{const parsed=A.normalizeAddonUrl(record.manifestUrl);fresh=A.validateManifest(await A.fetchJson(parsed.manifestUrl,{fetch:fetchImpl,assertUrl:guard(parsed),maxBytes:A.LIMITS.manifestBytes,signal:AbortSignal.timeout(60000)}));}
      catch(_){throw err('Could not verify addon settings support; existing settings were kept.','CONFIG_VALIDATION');}
      if(fresh.id!==record.manifest.id)throw err('The addon identity changed; existing settings were kept.','CONFIG_ID');
      record={...record,manifest:fresh};
    }
    if(!record.manifest.configurable&&!record.manifest.configurationRequired)throw err('This addon does not advertise configuration.','NOT_CONFIGURABLE');
    const original=A.normalizeAddonUrl(record.manifestUrl);let result;
    try{result=await configureAddon({url:A.addonConfigureUrl(record.manifestUrl),expectedOrigin:new URL(original.manifestUrl).origin});}
    catch(error){throw err('Could not open addon configuration; existing settings were kept.',['CONFIG_ORIGIN','CONFIG_LOAD'].includes(error?.code)?error.code:'CONFIG_OPEN');}
    if(result?.cancelled)return {cancelled:true};
    let configured;try{configured=A.normalizeAddonUrl(result?.manifestUrl);}catch(_){throw err('Invalid configured addon response.','CONFIG_VALIDATION');}
    if(new URL(configured.manifestUrl).origin!==new URL(original.manifestUrl).origin)throw err('Configuration returned a different host; existing settings were kept.','CONFIG_ORIGIN');
    const expectedId=record.manifest.id;
    try{
      const preview=await addonPreview({url:configured.manifestUrl},AbortSignal.timeout(60000),replacement||{manifestId:expectedId});
      const plan=previews.get(preview.token);
      if(plan.manifest.id!==expectedId){previews.delete(preview.token);throw err('Configured addon identity changed.','CONFIG_ID');}
      if(!replacement){plan.replacement=null;preview.replacing=false;}
      preview.configured=true;return preview;
    }catch(error){if(error.code==='CONFIG_ID'||error.code==='LIMIT')throw error;throw err('Could not validate configured addon; existing settings were kept.','CONFIG_VALIDATION');}
  }
  function addonInstall({ token }) {
    const plan = previews.get(token);
    if (!plan || now() - plan.at > PREVIEW_TTL) throw err('Eklenti önizlemesinin süresi doldu; adresi yeniden gir.', 'EXPIRED');
    if (plan.manifest.configurationRequired) throw err('Bu eklenti önce yapılandırılmalı. Eklentinin yapılandırma sayfasından oluşturduğun adresi ekle.', 'NEEDS_CONFIG');
    const data = loadAddons(), existing = data.addons.find((r) => r.key === plan.key);
    if(plan.replacement){
      const index=data.addons.findIndex(r=>r.key===plan.replacement.key),previous=data.addons[index];
      if(!previous||previous.manifestUrl!==plan.replacement.url||previous.manifest.id!==plan.replacement.manifestId)throw err('Addon changed while configuring; reopen settings.','CONFIG_STALE');
      if(existing&&existing!==previous)throw err('This configured addon is already installed; existing entries were kept.','CONFIG_CONFLICT');
      data.addons[index]={...previous,key:plan.key,manifestUrl:plan.manifestUrl,manifest:plan.manifest};
    }else if(existing){existing.manifest=plan.manifest;existing.enabled=true;}
    else {if(data.addons.length>=MAX_ADDONS)throw err(`En fazla ${MAX_ADDONS} eklenti eklenebilir.`,'LIMIT');data.addons.push({key:plan.key,manifestUrl:plan.manifestUrl,installedAt:now(),enabled:true,manifest:plan.manifest});}
    saveAddons(data); previews.delete(token);
    return { addons: data.addons.map(publicAddon) };
  }
  function addonMutate(input, apply) {
    const data = loadAddons(), index = data.addons.findIndex((r) => r.key === input.key);
    if (index < 0) throw err('Eklenti bulunamadı.', 'NOT_FOUND');
    apply(data, index); saveAddons(data);
    return { addons: data.addons.map(publicAddon) };
  }
  async function addonRefresh({ key }, signal) {
    const record = loadAddons().addons.find((r) => r.key === key);
    if (!record) throw err('Eklenti bulunamadı.', 'NOT_FOUND');
    const addon = ctx(record);
    const manifest = A.validateManifest(await call(addon, record.manifestUrl, { maxBytes: A.LIMITS.manifestBytes, signal }));
    return addonMutate({ key }, (data, i) => { data.addons[i].manifest = manifest; });
  }

  /* ---- Katalog / meta / arama ---- */
  function catalogList() {
    const rows = [];
    for (const record of loadAddons().addons.filter((r) => r.enabled !== false)) {
      for (const catalog of record.manifest.catalogs) {
        const required = catalog.extra.filter((f) => f.isRequired).map((f) => f.name);
        const searchOnly = required.length === 1 && required[0] === 'search';
        if (required.length && !searchOnly) continue;
        rows.push({ addonKey: record.key, addonName: record.manifest.name, type: catalog.type, id: catalog.id, name: catalog.name,
          searchable: catalog.extra.some((f) => f.name === 'search'), searchOnly, genres: (catalog.extra.find((f) => f.name === 'genre')?.options || []).slice(0, 40),
          paged: catalog.extra.some((f) => f.name === 'skip') });
      }
    }
    return rows;
  }
  async function catalog({ addonKey, type, catalogId, extra = {} }, signal) {
    const record = loadAddons().addons.find((r) => r.key === addonKey && r.enabled !== false);
    const definition = record?.manifest.catalogs.find((c) => c.type === type && c.id === catalogId);
    if (!definition) throw err('Katalog bulunamadı.', 'NOT_FOUND');
    const allowed = new Set(definition.extra.map((f) => f.name)), clean = {};
    for (const [k, v] of Object.entries(extra || {})) if (allowed.has(k) && v != null && v !== '') clean[k] = String(v).slice(0, 200);
    const addon = ctx(record);
    const payload = await call(addon, A.buildResourceUrl(addon.baseUrl, 'catalog', type, catalogId, clean), { signal });
    const items = (Array.isArray(payload?.metas) ? payload.metas : []).slice(0, A.LIMITS.maxCatalogItems).map((m) => A.normalizeMetaPreview(m, addon)).filter(Boolean);
    return { items, hasMore: items.length >= 20 && allowed.has('skip') };
  }
  async function search({ query, types }, signal) {
    const q = str(query, 120).trim();
    if (!q) return { items: [], errors: [] };
    const wanted = Array.isArray(types) && types.length ? new Set(types) : null;
    const targets = catalogList().filter((c) => c.searchable && (!wanted || wanted.has(c.type))).slice(0, 8);
    const records = loadAddons().addons;
    const results = await Promise.all(targets.map(async (target) => {
      try { return { items: (await catalog({ addonKey: target.addonKey, type: target.type, catalogId: target.id, extra: { search: q } }, signal)).items }; }
      catch (error) { return { error: { addon: records.find((r) => r.key === target.addonKey)?.manifest.name || '', message: error.message } }; }
    }));
    const seen = new Set(), items = [];
    for (const r of results) for (const item of r.items || []) { const k = item.type + ':' + item.id; if (!seen.has(k)) { seen.add(k); items.push(item); } }
    return { items: items.slice(0, 120), errors: results.filter((r) => r.error).map((r) => r.error) };
  }
  async function meta({ type, id }, signal) {
    const records = enabledFor('meta', type, id);
    let last = null;
    for (const record of records) {
      const addon = ctx(record);
      try {
        const payload = await call(addon, A.buildResourceUrl(addon.baseUrl, 'meta', type, id), { signal });
        const value = A.normalizeMeta(payload?.meta, addon);
        if (value) { value.progress = progressFor(type, id); return { meta: value, addonName: addon.name }; }
      } catch (error) { last = error; }
    }
    throw last || err('Bu yapım için ayrıntı veren etkin bir eklenti yok. Cinemeta gibi bir katalog eklentisi ekle.', 'NO_META');
  }

  /* ---- Akışlar ---- */
  const videoIdFor = (type, id, season, episode) => (type === 'series' && season != null && episode != null ? A.episodeId(id, season, episode) : id);
  const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
  async function streams({ type, id, season = null, episode = null }, signal) {
    const videoId = videoIdFor(type, id, int(season), int(episode));
    const records = enabledFor('stream', type, videoId);
    if (!records.length) throw err('Kaynak sağlayan etkin bir eklenti yok. Eklentiler sayfasından Torrentio gibi bir eklenti ekle.', 'NO_ADDONS');
    const settled = await fanOut(records, async (record, addon) => {
      const payload = await call(addon, A.buildResourceUrl(addon.baseUrl, 'stream', type, videoId), { signal, timeoutMs: 15000 });
      return (Array.isArray(payload?.streams) ? payload.streams : []).slice(0, A.LIMITS.maxStreams).map((s) => A.normalizeStream(s, addon)).filter(Boolean);
    });
    const rows = settled.flatMap((s) => s.value || []);
    const ranked = A.rankStreams(rows);
    const token = randomUUID();
    remember(streamSessions, token, { at: now(), type, id, videoId, season: int(season), episode: int(episode), rows: new Map(ranked.map((r) => [r.id, r])) });
    return {
      token, videoId,
      groups: settled.map((s) => ({ addonKey: s.addon.key, addonName: s.addon.name, count: (s.value || []).length, error: s.error || null })),
      streams: ranked.map((r) => ({
        id: r.id, addonKey: r.addonKey, addonName: r.addonName, name: r.name, label: r.label, title: r.title, description: r.description.slice(0, 600),
        kind: r.kind, playable: r.playable, reason: r.reason, resolution: r.resolution, seeders: r.seeders, sizeBytes: r.sizeBytes, provider: r.provider,
        codec: r.codec, hdr: r.hdr, source: r.source, flags: r.flags, multiAudio: r.multiAudio, notWebReady: r.notWebReady, usesHeaders: r.usesHeaders === true, bingeGroup: r.bingeGroup || '', score: r.score, tags: r.tags, warns: r.warns, audio: r.audio, channels: r.channels, group: r.group, filename: r.filename,
        host: r.kind === 'url' ? hostOf(r.url) : r.kind === 'external' ? hostOf(r.externalUrl) : '', embeddedSubtitles: r.subtitles.length,
      })),
    };
  }
  const sessionFor = (token) => {
    const session = streamSessions.get(token);
    if (!session || now() - session.at > 6 * 3600 * 1000) throw err('Kaynak listesinin süresi doldu; yeniden getir.', 'EXPIRED');
    return session;
  };
  async function play({ token, streamId, title = '' }, event) {
    const session = sessionFor(token), row = session.rows.get(streamId);
    if (!row) throw err('Kaynak bulunamadı; listeyi yenile.', 'NOT_FOUND');
    if (!row.playable) throw err(row.reason === 'needs-headers' ? 'Bu kaynak, güvenli listede olmayan özel istek başlıkları gerektiriyor; oynatılamaz.' : 'Bu kaynak türü uygulama içinde oynatılamıyor.', 'UNPLAYABLE');
    const position = progressFor(session.type, session.id, session.season, session.episode);
    // Work identity comes from the token-owned catalog context, never from a stream URL/title.
    const workScope=session.type==='movie'?[session.type,session.id]:Number.isInteger(session.season)&&session.season>=0&&Number.isInteger(session.episode)&&session.episode>=0?[session.type,session.id,session.season,session.episode]:null;
    const workKey=workScope?'work:stremio:'+createHash('sha256').update(JSON.stringify(workScope)).digest('hex'):'';
    const base = { ok: true, workKey, streamToken: token, streamId, meta: { type: session.type, id: session.id, season: session.season, episode: session.episode },
      resume: position && !position.completed && position.position > 5 ? { position: position.position, duration: position.duration } : null,
      notWebReady: row.notWebReady, filename: row.filename };
    if (row.kind === 'url') {
      if (row.requestHeaders?.length) grantHeaders(row.url, row.requestHeaders);
      const result = { ...base, usesHeaders: !!row.requestHeaders?.length, url: row.url, title: str(title, 300) || row.filename || row.title || row.name,
        key: 'stream:' + createHash('sha256').update(row.url).digest('hex') };
      return result;
    }
    if (row.kind === 'torrent') {
      if (!torrents?.handler) throw err('Torrent desteği bu yapıda kullanılamıyor.', 'NO_TORRENTS');
      const status = await torrents.handler(event, { action: 'status' });
      if (!status?.ok) throw err(status?.error || 'Torrent motoru okunamadı.', 'TORRENT');
      if (!status.installed) throw err('Torrent kaynağı oynatmak için torrent motorunu kurman gerekiyor (Medya merkezi → Torrentler).', 'NEEDS_TORRENT_ENGINE');
      const magnet = A.buildMagnet({ infoHash: row.infoHash, trackers: row.trackers, name: row.filename || row.title });
      const preview = await torrents.handler(event, { action: 'preview', magnet });
      if (!preview?.ok) throw err(preview?.error || 'Torrent bilgileri alınamadı.', 'TORRENT');
      const file = A.chooseTorrentFile(preview.files, row, session.season != null ? { season: session.season, episode: session.episode } : null);
      if (!file) throw err('Bu torrentte oynatılabilir video yok.', 'NO_VIDEO');
      const played = await torrents.handler(event, { action: 'play', token: preview.token, index: file.index });
      if (!played?.ok) throw err(played?.error || 'Torrent oynatılamadı.', 'TORRENT');
      return { ...base, url: played.url, title: str(title, 300) || played.title, key: played.key, hash: played.hash, index: played.index, torrentFile: file.name };
    }
    throw err('Bu kaynak türü desteklenmiyor.', 'UNPLAYABLE');
  }

  /* ---- Altyazılar ---- */
  async function subtitles({ type, id, season = null, episode = null, filename = '', videoSize = null, videoHash = '', title = '', language = '', streamToken = '', streamId = '' }, signal) {
    const videoId = videoIdFor(type, id, int(season), int(episode));
    const extra = {};
    if (filename) extra.filename = str(filename, 300);
    if (Number.isSafeInteger(Number(videoSize)) && Number(videoSize) > 0) extra.videoSize = String(Number(videoSize));
    if (/^[0-9a-f]{16}$/i.test(String(videoHash))) extra.videoHash = String(videoHash).toLowerCase();
    const records = enabledFor('subtitles', type, videoId);
    const settled = await fanOut(records, async (record, addon) => {
      const payload = await call(addon, A.buildResourceUrl(addon.baseUrl, 'subtitles', type, videoId, extra), { signal });
      return (Array.isArray(payload?.subtitles) ? payload.subtitles : []).slice(0, A.LIMITS.maxSubtitles).map((s) => A.normalizeSubtitle(s, addon)).filter(Boolean);
    });
    let rows = settled.flatMap((s) => s.value || []);
    try { // seçili kaynağın kendi gömülü altyazıları
      const row = streamToken && streamId ? streamSessions.get(streamToken)?.rows.get(streamId) : null;
      if (row?.subtitles?.length) rows = [...row.subtitles, ...rows];
    } catch { /* oturum yoksa yok say */ }
    const seen = new Set(); rows = rows.filter((r) => (seen.has(r.url) ? false : seen.add(r.url)));
    const sessionRows = new Map(rows.map((r) => [r.id, { kind: 'addon', ...r }]));
    let fallback = false, fallbackError = null;
    const wanted = A.normalizeLanguage(language);
    const matching = wanted ? rows.filter((r) => A.languageMatches(wanted, r.language)) : rows;
    if (!matching.length && typeof searchSubtitles === 'function' && title) {
      fallback = true;
      try {
        const imdb = /^tt\d{5,10}$/i.test(id) ? id : '';
        const found = await searchSubtitles({ query: str(title, 280), imdbId: imdb || undefined, season: type === 'series' ? int(season) ?? undefined : undefined,
          episode: type === 'series' ? int(episode) ?? undefined : undefined, language: wanted || undefined, release: str(filename, 280) || undefined }, {}, { signal });
        for (const [i, item] of (found.results || []).slice(0, 60).entries()) {
          const rowId = createHash('sha256').update(`fb|${item.provider}|${item.fileId}|${item.url}|${i}`).digest('hex').slice(0, 20);
          sessionRows.set(rowId, { kind: 'fallback', id: rowId, provider: item.provider, fileId: item.fileId, url: item.url, language: A.normalizeLanguage(item.language), lang: item.language,
            label: item.release || item.fileName || item.title, addonName: item.provider === 'stremio' ? 'OpenSubtitles (Stremio)' : 'OpenSubtitles', hearingImpaired: item.hearingImpaired === true });
        }
      } catch (error) { fallbackError = error.message; }
    }
    const token = randomUUID();
    remember(subtitleSessions, token, sessionRows, 12);
    const pick = [...sessionRows.values()];
    return {
      token, fallback, fallbackError, groups: settled.map((s) => ({ addonKey: s.addon.key, addonName: s.addon.name, count: (s.value || []).length, error: s.error || null })),
      subtitles: pick.map((r) => ({ id: r.id, label: String(r.label || '').slice(0, 160), language: r.language || '', lang: r.lang || '', addonName: r.addonName, source: r.kind, hearingImpaired: r.hearingImpaired === true,
        preferred: !!wanted && A.languageMatches(wanted, r.language) })).sort((a, b) => (b.preferred - a.preferred) || a.addonName.localeCompare(b.addonName) || a.label.localeCompare(b.label)),
    };
  }
  async function subtitleSave({ token, id }, signal) {
    const row = subtitleSessions.get(token)?.get(id);
    if (!row) throw err('Altyazı bulunamadı; listeyi yenile.', 'NOT_FOUND');
    let text, format, fileName;
    if (row.kind === 'addon') {
      const owner = loadAddons().addons.find((r) => r.key === row.addonKey);
      const host = new URL(row.url).hostname;
      const loopback = owner ? ctx(owner).loopback : false;
      const bytes = await A.fetchBuffer(row.url, { fetch: fetchImpl, assertUrl: loopback && host === ctx(owner).host ? undefined : assertUrl, maxBytes: 3_000_000, signal, accept: '*/*' });
      if (typeof decodeSubtitle !== 'function') throw err('Altyazı çözümleyici kullanılamıyor.', 'NO_DECODER');
      text = decodeSubtitle(bytes, row.language); format = /^\s*WEBVTT/i.test(text) ? 'vtt' : 'srt'; fileName = (row.label || 'subtitle').replace(/[^\w.-]+/g, '_').slice(0, 80);
    } else {
      if (typeof downloadSubtitle !== 'function') throw err('Altyazı indirme kullanılamıyor.', 'NO_DOWNLOADER');
      const out = await downloadSubtitle({ fileId: row.fileId, url: row.url, provider: row.provider, language: row.lang }, {}, { signal });
      text = out.text; format = out.format; fileName = out.fileName;
    }
    if (format === 'vtt') { const converted = vttToSrt(text); if (converted) { text = converted; format = 'srt'; } }
    if (!text || text.length < 10) throw err('Altyazı dosyası boş geldi.', 'EMPTY');
    const dir = path.join(root(), 'stremio-subtitles');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, createHash('sha256').update(text).digest('hex').slice(0, 24) + (format === 'vtt' ? '.vtt' : '.srt'));
    atomicWriteFileSync(filePath, text);
    grantSubtitle(filePath);
    return { filePath, fileName: fileName || path.basename(filePath), language: row.language || '', label: row.label || fileName, addonName: row.addonName };
  }

  /* ---- Devam kaydı ---- */
  const progressKey = (type, id, season, episode) => (type === 'series' && season != null ? A.episodeId(id, season, episode) : id);
  function progressFor(type, id, season = null, episode = null) {
    const data = loadProgress();
    if (type === 'series' && season == null) {
      const rows = Object.values(data.entries).filter((e) => e.type === 'series' && e.id === id);
      return rows.sort((a, b) => b.lastWatched - a.lastWatched)[0] || null;
    }
    return data.entries[progressKey(type, id, season, episode)] || null;
  }
  function progressSave(input) {
    const type = str(input.type, 32), id = str(input.id, 200);
    if (!/^[a-z0-9_-]{1,32}$/i.test(type) || !/^[A-Za-z0-9_.:~+-]{1,200}$/.test(id)) throw err('Geçersiz içerik kimliği.', 'BAD_REQUEST');
    const season = type === 'series' ? int(input.season) : null, episode = type === 'series' ? int(input.episode) : null;
    const duration = Number(input.duration), position = Number(input.position);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position) || position < 0) throw err('Geçersiz konum.', 'BAD_REQUEST');
    const completed = input.completed === true || position >= duration * 0.92 || (duration - position <= 90 && duration > 600);
    const data = loadProgress(), key = progressKey(type, id, season, episode);if(!data.entries[key]&&Object.keys(data.entries).length>=MAX_PROGRESS)throw err('History capacity reached; existing records kept.','CAPACITY');
    const next = input.next && int(input.next.season) != null && int(input.next.episode) != null
      ? { season: int(input.next.season), episode: int(input.next.episode), title: str(input.next.title, 200) } : null;
    data.entries[key] = { type, id, season, episode, name: str(input.name, 300), episodeTitle: str(input.episodeTitle, 300), poster: A.safeImage(input.poster, ''),
      position: Math.round(position), duration: Math.round(duration), completed, lastWatched: now(), sourceLabel: str(input.sourceLabel, 160), next };
    writeJson(progressFile(), data);
    return { saved: data.entries[key] };
  }
  function progressTitle({ type, id }) {
    const entries = Object.values(loadProgress().entries).filter((e) => e.type === type && e.id === id).sort((a, b) => b.lastWatched - a.lastWatched);
    return { entries, last: entries[0] || null };
  }
  function continueList() {
    const byTitle = new Map();
    for (const e of Object.values(loadProgress().entries)) {
      const k = e.type + ':' + e.id, cur = byTitle.get(k);
      if (!cur || e.lastWatched > cur.lastWatched) byTitle.set(k, e);
    }
    const rows = [];
    for (const e of byTitle.values()) {
      if (e.completed && (e.type !== 'series' || !e.next)) continue;
      rows.push(e);
    }
    return rows.sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 24);
  }
  function progressClear({ type, id, season = null, episode = null }) {
    const data = loadProgress(), s = int(season), e2 = int(episode);
    for (const [k, e] of Object.entries(data.entries)) if (e.type === type && e.id === id && (s == null || (e.season === s && e.episode === e2))) delete data.entries[k];
    writeJson(progressFile(), data);
    return {};
  }

  async function handle(event, input = {}) {
    const signal = AbortSignal.timeout(60000);
    switch (input.action) {
      case 'status': return { addons: loadAddons().addons.map(publicAddon) };
      case 'addon-preview': return addonPreview(input, signal);
      case 'addon-install': return addonInstall(input);
      case 'addon-configure': return addonConfigure(input);
      case 'addon-remove': return addonMutate(input, (d, i) => { d.addons.splice(i, 1); });
      case 'addon-toggle': return addonMutate(input, (d, i) => { d.addons[i].enabled = input.enabled === true; });
      case 'addon-move': return addonMutate(input, (d, i) => { const j = i + (input.direction === 'up' ? -1 : 1); if (j >= 0 && j < d.addons.length) [d.addons[i], d.addons[j]] = [d.addons[j], d.addons[i]]; });
      case 'addon-refresh': return addonRefresh(input, signal);
      case 'catalogs': return { catalogs: catalogList() };
      case 'catalog': return catalog(input, signal);
      case 'search': return search(input, signal);
      case 'meta': return meta(input, signal);
      case 'streams': return streams(input, signal);
      case 'play': return play(input, event);
      case 'subtitles': return subtitles(input, signal);
      case 'subtitle-save': return subtitleSave(input, signal);
      case 'progress-save': return progressSave(input);
      case 'progress-title': return progressTitle(input);
      case 'progress-clear': return progressClear(input);
      case 'continue-list': return { items: continueList() };
      case 'library-list': return libraryList();
      case 'history-list': return historyList();
      case 'rating-get': return ratingGet(input);
      case 'rating-set': return ratingSet(input);
      case 'rating-list': return ratingList();
      case 'library-has': return libraryHas({ type: str(input.type, 32), id: str(input.id, 200) });
      case 'library-toggle': return libraryToggle(input);
      default: throw err('Desteklenmeyen Stremio işlemi.', 'BAD_REQUEST');
    }
  }
  return { handle, headersFor, _internals: { previews, streamSessions, subtitleSessions, headerGrants } };
}

function registerStremio({ ipcMain, authorized, ...options }) {
  const service = createStremioService(options);
  ipcMain.handle('stremio:request', async (event, input) => {
    if (!authorized(event)) return { ok: false, error: 'Unauthorized request.' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid request.' };
    try { return { ok: true, ...(await service.handle(event, input)) }; }
    catch (error) { return { ok: false, error: error.message || 'Stremio hatası', code: error.code || 'ERROR' }; }
  });
  return service;
}

module.exports = { createStremioService, registerStremio, vttToSrt };
