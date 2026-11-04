'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const { randomUUID, createHash } = require('node:crypto');
const { renameSyncResilient } = require('./fsync-utils');
const { canonicalWatchKey } = require('./watch-library-store');
const personalMedia=require('./workspace-personal-media');
function remapFileWatchKey(value, mappings) {
  if (typeof value !== 'string' || !value.startsWith('file:')) return value;
  const key = canonicalWatchKey(value);
  const candidates = mappings.map(([from, to]) => [canonicalWatchKey('file:' + from), to])
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of candidates) {
    if (key === from || key.startsWith(from + '/')) return canonicalWatchKey('file:' + to + key.slice(from.length));
  }
  return value;
}
const ROOTS = new Set(['feeds.json', 'media-catalog.json', 'watch-library.json', 'watch-library-tombstones.json', 'browser-notes.json', 'browser-session.json', 'history.json',
  'assistant-artifacts.json', 'assistant-conversations.json', 'media-shelf.json', 'media-enrichment.json', 'media-folder-watches.json', 'torrent-library.json', 'browser-subtitle-preferences.json', 'browser-series-context.json', 'browser-skip-segments.json',...personalMedia.NAMES]);
const DIRS = new Set(['catalog-posters', 'browser-subtitles', 'workspace-assets', 'subtitle-edits', 'OkumaListesi']);
const LIMIT = 256 * 1024 * 1024;
// Meşru paket JSON'ları ~10 seviye içindedir; özyinelemeli gezginlerin yığın
// sınırının çok altında, kurcalanmış girdiyi temiz hataya çeviren tavan.
const MAX_PACKAGE_JSON_DEPTH = 32;
function packageDepthError() {
  const error = new Error(`Paket içeriği çok derin (en fazla ${MAX_PACKAGE_JSON_DEPTH} seviye).`);
  error.code = 'WP_DEPTH';
  return error;
}
const STORAGE_KEYS = ['subtitleStyle', 'subtitlePos', 'browser-source-edits-v1', 'browser-source-edit-scopes-v1'];
function storageValues(values) {
  const result = {};
  for (const key of STORAGE_KEYS) if (typeof values?.[key] === 'string') {
    if (values[key].length > 8e6) throw new Error('Altyazı taslağı çok büyük.');
    JSON.parse(values[key]); result[key] = values[key];
  }
  return result;
}
function allowed(name) {
  return typeof name === 'string' && !name.includes('\\') && !name.includes(':') && !name.split('/').some(p => !p || p === '.' || p === '..') &&
    (ROOTS.has(name) || (DIRS.has(name.split('/')[0]) && /\.(srt|vtt|ass|ssa|jsonl?|png|jpg|jpeg|webp|ttf|otf|woff2?|mhtml)$/i.test(name)));
}
function rewrite(value, mappings) {
  // Yalnız bütün bir yol veya o yolun altındaki bir dosya yeniden eşlenir.
  // Serbest metin içindeki benzer alt dizileri değiştirmek kurcalanmış paketin
  // başlık, not ve altyazı metnini bozmasına izin verirdi.
  const replacements = [];
  const seen = new Set();
  for (const [rawFrom, rawTo] of mappings) {
    const from = String(rawFrom || '');
    if (!from || seen.has(from)) continue;
    seen.add(from); replacements.push([from, String(rawTo || '')]);
  }
  replacements.sort((a, b) => b[0].length - a[0].length);
  const replacePath = current => {
    if (current.startsWith('file:')) return remapFileWatchKey(current, replacements);
    for (const [from, to] of replacements) {
      if (current === from) return to;
      if (current.startsWith(from) && /[\\/]/.test(current.charAt(from.length))) {
        return to + current.slice(from.length);
      }
    }
    return current;
  };
  function visit(current, depth = 0) {
    if (typeof current === 'string') return replacePath(current);
    if (Array.isArray(current)) {
      if (depth >= MAX_PACKAGE_JSON_DEPTH) throw packageDepthError();
      return current.map((item) => visit(item, depth + 1));
    }
    if (current && typeof current === 'object') {
      if (depth >= MAX_PACKAGE_JSON_DEPTH) throw packageDepthError();
      return Object.fromEntries(Object.entries(current).map(([k, v]) => [visit(k, depth + 1), visit(v, depth + 1)]));
    }
    return current;
  }
  return visit(value);
}
function exportPackage(root, output, rendererValues = {}, externalAliases = null) {
  const files = [], mappings = [], seen = new Set(),originalJson=new Map(); let total = 0;
  function add(file, name) {
    if (seen.has(name)) return;
    const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) return;
    if (stat.size > 16e6 || (total += stat.size) > LIMIT / 1.5) throw new Error('Çalışma paketi çok büyük (en fazla 170 MB veri).');
    let buffer = fs.readFileSync(file);
    if (ROOTS.has(name)) {
      // Gömülü mutlak yollar taşınabilir {{ROOT}}/... formuna çevrilir — paket
      // paylaşıldığında kaynak makinenin kullanıcı adı/klasör düzeni ve
      // mappings/sourceRoot içindeki mutlak yollar ifşa olmaz (R83-33).
      const visit = (value, depth = 0, allowFiles = true) => {
        if (typeof value === 'string' && value.startsWith('file:')) {
          return remapFileWatchKey(value, [...(externalAliases || []), [root, '{{ROOT}}']]);
        }
        if (typeof value === 'string' && path.isAbsolute(value)) {
          // Pakete giren video kaynakları kararlı takma kimliğe çevrilir;
          // kaynak makinenin mutlak yolu hiçbir manifest alanına yazılmaz
          // (R86-01).
          if (externalAliases && externalAliases.has(value)) return externalAliases.get(value);
          const relative = path.relative(root, value).replace(/\\/g, '/');
          const underRoot = !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
          if (allowFiles && /\.(srt|vtt|ass|ssa|png|jpe?g|webp)$/i.test(value) && fs.existsSync(value)) {
            if (underRoot && allowed(relative)) { add(value, relative); return `{{ROOT}}/${relative}`; }
            const target = 'workspace-assets/' + createHash('sha256').update(value).digest('hex') + path.extname(value).toLowerCase();
            add(value, target); return `{{ROOT}}/${target}`;
          }
          if (underRoot) return `{{ROOT}}/${relative}`;
          return value;
        }
        if (Array.isArray(value)) {
          if (depth >= MAX_PACKAGE_JSON_DEPTH) throw packageDepthError();
          return value.map((item) => visit(item, depth + 1));
        }
        if (value && typeof value === 'object') {
          if (depth >= MAX_PACKAGE_JSON_DEPTH) throw packageDepthError();
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, depth + 1)]));
        }
        return value;
      };
      const parsed=JSON.parse(buffer.toString('utf8'));originalJson.set(name,parsed);personalMedia.validate(name,parsed);
      buffer = Buffer.from(JSON.stringify(personalMedia.NAMES.has(name)?personalMedia.mapPaths(name,parsed,(value,imported)=>visit(value,0,!imported)):visit(parsed)));
      seen.add(name); files.push({ name, data: buffer.toString('base64') });
      return;
    }
    seen.add(name); files.push({ name, data: buffer.toString('base64') });
  }
  for (const name of ROOTS) if (fs.existsSync(path.join(root, name))) add(path.join(root, name), name);
  function walk(dir, prefix) {
    if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      const name = prefix + '/' + ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), name); else if (allowed(name)) add(path.join(dir, ent.name), name);
    }
  }
  for (const dir of DIRS) walk(path.join(root, dir), dir);
  // sourceRoot/mappings taşınabilir tutulur: {{ROOT}} işareti içe aktarımda
  // hedef köke eşlenir, pakette mutlak kaynak yolu kalmaz.
  const portable=new Map(files.filter(f=>ROOTS.has(f.name)).map(f=>[f.name,JSON.parse(Buffer.from(f.data,'base64').toString('utf8'))]));personalMedia.reconcileChoices(originalJson,portable);
  const personalWatch=files.find(f=>f.name==='film-watch.json');if(personalWatch)personalWatch.data=Buffer.from(JSON.stringify(portable.get('film-watch.json'))).toString('base64');
  const bundle = { format: 'whisper-workspace', version: 1, created: new Date().toISOString(), sourceRoot: '{{ROOT}}', mappings, files, rendererValues: storageValues(rendererValues) };
  validate(bundle);
  const bytes = gzipSync(Buffer.from(JSON.stringify(bundle)));
  const temp = output + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); renameSyncResilient(fs, temp, output); }
  finally { try { fs.unlinkSync(temp); } catch {} }
  return { count: files.length, bytes: bytes.length };
}
function readPackage(file) {
  if (fs.statSync(file).size > LIMIT) throw new Error('Paket çok büyük.');
  const data = JSON.parse(gunzipSync(fs.readFileSync(file), { maxOutputLength: LIMIT }).toString('utf8'));
  validate(data); return data;
}
function sanitizeImportedSession(value) {
  // Oturumdaki yerel altyazı yolları dışa aktarımda silinir (browser-session-package
  // portableSessionTab). El yapımı bir paket bu alanlara keyfi yol koyup açılıştaki
  // koşulsuz grant'i kötüye kullanabilir; içe aktarımda da aynı kural uygulanır.
  if (value && typeof value === 'object' && Array.isArray(value.tabs)) {
    for (const tab of value.tabs) {
      const sel = tab && typeof tab === 'object' ? tab.subtitleSelection : null;
      if (sel && typeof sel === 'object') {
        delete sel.primaryFile;
        delete sel.secondaryFile;
      }
    }
  }
  return value;
}

function sanitizeImportedCatalog(value) {
  // İçe aktarılan katalog kayıtlarındaki yerel dosya yolları bu makinede dosya
  // seçiciyle doğrulanmadı; 'play' sırasında bir kez yeniden seçim istenir.
  for (const item of (value && Array.isArray(value.items) ? value.items : [])) {
    for(const source of require('./catalog-library-model').allSources(item))if(source.type==='local')source.imported=true;
  }
  return value;
}
function sanitizeImportedHistory(value) {
  // İçe aktarılan geçmiş kayıtlarındaki dosya yolları bu makinede doğrulanmadı.
  // İşaretlenmeyen kayıt, history:authorizeFiles yolunda onaysız altyazı erişimi
  // veriyor ve \\sunucu\paylaşım yollarına dokunarak NTLM özetini sızdırabiliyordu.
  for (const record of (Array.isArray(value) ? value : [])) {
    if (record && typeof record === 'object') record.imported = true;
  }
  return value;
}
function validate(data) {
  storageValues(data?.rendererValues);
  if (data?.format !== 'whisper-workspace' || data.version !== 1 || !Array.isArray(data.files) || data.files.length > 20000 || typeof data.sourceRoot !== 'string' || data.sourceRoot.length < 3) throw new Error('Geçerli bir çalışma paketi seçin.');
  const names = new Set();
  for (const file of data.files) {
    if (!allowed(file.name) || names.has(file.name.toLowerCase()) || typeof file.data !== 'string' || file.data.length > 24e6 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error('Paket içeriği geçersiz.');
    names.add(file.name.toLowerCase());
    if (file.name.endsWith('.json')) {
      let value = JSON.parse(Buffer.from(file.data, 'base64').toString('utf8'));
      // Validate portable source aliases against an inert absolute preview root.
      // Runtime catalog readers still reject aliases; restore resolves them before publication.
      if(file.name==='media-catalog.json')value=rewrite(value,[['{{ROOT}}',path.resolve('__portable_root__')],['{{VIDEO}}',path.resolve('__portable_video__')]]);
      require('./user-data-schema').validateStoreShape(file.name, value);
      personalMedia.validate(file.name,value);personalMedia.validateReferences(file.name,value,data);
      if (file.name === 'media-catalog.json') {
        if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 10000) throw new Error('Paket kataloğu geçersiz.');
        for (const item of value.items) require('./media-catalog-store').itemOf(item);
      }
    }
  }
  if (!Array.isArray(data.mappings) || data.mappings.some(m => !Array.isArray(m) || typeof m[0] !== 'string' || m[0].length < 3 || !allowed(m[1]))) throw new Error('Paket dosya eşleştirmeleri geçersiz.');
}
function restorePackage(root, data, videoMappings = []) {
  validate(data);
  const mappings = [...videoMappings, ...data.mappings.map(([from, relative]) => [from, path.join(root, relative)]), [data.sourceRoot, root]];
  const changes = data.files.map(file => {
    const destination = path.resolve(root, file.name);
    if (!destination.startsWith(path.resolve(root) + path.sep)) throw new Error('Paket yolu geçersiz.');
    let parent = path.dirname(destination);
    while (parent !== path.resolve(root)) { if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Yedek hedefi bağlantı içeriyor.'); parent = path.dirname(parent); }
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Yedek hedefi bağlantı içeriyor.');
    let bytes = Buffer.from(file.data, 'base64'),parsedValue;
    if (file.name.endsWith('.json')) {
      const original=JSON.parse(bytes.toString('utf8'));let parsed = file.name==='assistant-artifacts.json'?original:personalMedia.NAMES.has(file.name)?personalMedia.mapPaths(file.name,original,value=>rewrite(value,mappings)):rewrite(original,mappings);
      if(personalMedia.NAMES.has(file.name)){parsed=personalMedia.sanitize(file.name,original,parsed,data);personalMedia.validate(file.name,parsed);}
      if (file.name === 'watch-library.json') {
        const original = JSON.parse(bytes.toString('utf8'));
        const rows = Array.isArray(original) ? original : [
          ...(Array.isArray(original?.items) ? original.items : []),
          ...(Array.isArray(original?.overflowItems) ? original.overflowItems : []),
        ];
        const identities = new Map();
        for (const row of rows) {
          const before = canonicalWatchKey(row?.key);
          if (!before.startsWith('file:')) continue;
          const after = remapFileWatchKey(before, mappings);
          if (identities.has(after) && identities.get(after) !== before) {
            throw new Error('Paket dosya eşleştirmesi izleme kimliklerini çakıştırıyor.');
          }
          identities.set(after, before);
        }
      }
      if (file.name === 'browser-session.json') parsed = sanitizeImportedSession(parsed);
      if (file.name === 'media-catalog.json') parsed = sanitizeImportedCatalog(parsed);
      if (file.name === 'history.json') parsed = sanitizeImportedHistory(parsed);
      if (file.name === 'media-folder-watches.json') { if(!Array.isArray(parsed)||parsed.length>30||parsed.some(r=>!r||typeof r.id!=='string'||typeof r.path!=='string'||r.path.length>4000))throw Error('Invalid folder list.');parsed=parsed.map(row=>({...row,enabled:false})); }
      if (file.name === 'media-shelf.json') {
        if(parsed.version!==1||['music','books','stations','podcasts','playlists','diary'].some(k=>!Array.isArray(parsed[k])||parsed[k].length>20000||parsed[k].some(r=>!r||typeof r!=='object'||Array.isArray(r))))throw Error('Invalid media shelf.');
        let episodes=0;
        for(const podcast of parsed.podcasts){
          if(!Array.isArray(podcast.episodes)||podcast.episodes.some(episode=>!episode||typeof episode!=='object'||Array.isArray(episode)))throw Error('Invalid podcast episodes.');
          episodes+=podcast.episodes.length;if(episodes>50000)throw Error('Too many podcast episodes.');
          for(const episode of podcast.episodes)if(episode.podcastWorkspace)require('./podcast-session').validateWorkspace(episode.podcastWorkspace);
        }
      }
      if(file.name==='assistant-artifacts.json')parsed=require('./assistant-artifact-service').validateEnvelope(parsed);
      if(file.name==='assistant-conversations.json')parsed=require('./assistant-thread-store').validateEnvelope(parsed);
      if (file.name === 'media-enrichment.json') {
        if(parsed.version!==1||!parsed.titles||typeof parsed.titles!=='object'||Array.isArray(parsed.titles)||Object.keys(parsed.titles).length>10000) throw Error('Invalid media notes.');
        for(const row of Object.values(parsed.titles)) {if(!row||typeof row!=='object'||row.history&&(!Array.isArray(row.history)||row.history.length>8))throw Error('Invalid title notes.');for(const entry of row.history||[]){if(!Array.isArray(entry.reviews)||entry.reviews.length>100)throw Error('Invalid saved reviews.');require('./media-tools-service').verifyDecision(entry.analysis,entry.reviews);}}
      }
      if(file.name==='torrent-library.json'){if(!Array.isArray(parsed)||parsed.length>1000||parsed.some(r=>!r||!(/^[a-f0-9]{40}$/i.test(r.hash))||!Number.isSafeInteger(r.index)||r.index<0))throw Error('Invalid torrent index.');parsed=parsed.map(r=>({...r,paused:true}));}
      bytes = Buffer.from(JSON.stringify(parsed));parsedValue=parsed;
    }
    return { name:file.name,parsed:parsedValue,destination, bytes, previous: fs.existsSync(destination) ? fs.readFileSync(destination) : null };
  });
  const before=new Map(data.files.filter(f=>ROOTS.has(f.name)).map(f=>[f.name,JSON.parse(Buffer.from(f.data,'base64').toString('utf8'))])),after=new Map(changes.filter(c=>ROOTS.has(c.name)).map(c=>[c.name,c.parsed]));personalMedia.reconcileChoices(before,after);
  const personalWatch=changes.find(c=>c.name==='film-watch.json');if(personalWatch)personalWatch.bytes=Buffer.from(JSON.stringify(personalWatch.parsed));
  // A durable pre-restore copy lets the user reverse an intentional replacement.
  exportPackage(root, path.join(root, 'before-restore-' + Date.now() + '.wbp'));
  const applied = [];
  try {
    for (const change of changes) {
      fs.mkdirSync(path.dirname(change.destination), { recursive: true });
      const temp = change.destination + '.' + randomUUID() + '.tmp';
      try { fs.writeFileSync(temp, change.bytes, { flag: 'wx', mode: 0o600 }); renameSyncResilient(fs, temp, change.destination); applied.push(change); }
      finally { try { fs.unlinkSync(temp); } catch {} }
    }
  } catch (error) {
    for (const change of applied.reverse()) { if (change.previous) fs.writeFileSync(change.destination, change.previous); else fs.unlinkSync(change.destination); }
    throw error;
  }
  return changes.length;
}
function remapRendererValues(root, data, videoMappings = []) {
  const maps = [...videoMappings, ...data.mappings.map(([from, relative]) => [from, path.join(root, relative)]), [data.sourceRoot, root]];
  const values = storageValues(data.rendererValues);
  return Object.fromEntries(STORAGE_KEYS.map(key => [key, key in values ? JSON.stringify(rewrite(JSON.parse(values[key]), maps)) : null]));
}
// Madde 33 — paket kapsamı önizlemesi: geri yüklemeden önce kullanıcı
// pakette NE olduğunu görmeli (bölüm başına dosya/bayt + kayıt sayıları).
// Güvenlik sınırı: yalnız meta sayıları döner; dosya içeriği/indeks verisi
// — hiçbir sır, yol veya metin — bu özetin dışına çıkmaz.
function describePackage(data, root = null) {
  const files = Array.isArray(data?.files) ? data.files : [];
  const sections = {};
  for (const file of files) {
    const name = typeof file.name === 'string' ? file.name : '';
    const top = name.includes('/') ? name.split('/')[0] + '/' : name;
    const section = sections[top] || (sections[top] = { files: 0, bytes: 0 });
    section.files += 1;
    section.bytes += Math.ceil(String(file.data || '').length * 3 / 4);
  }
  const summary = {
    files: files.length,
    videos: Array.isArray(data?.videos) ? data.videos.length : 0,
    created: data?.created || null,
    sections,
  };
  const json = (name) => {
    const file = files.find((f) => f.name === name);
    if (!file) return null;
    try { return JSON.parse(Buffer.from(file.data, 'base64').toString('utf8')); }
    catch (_) { return null; }
  };
  const feeds = json('feeds.json');
  if(feeds){summary.feedSubscriptions=feeds.feeds.length;summary.feedEntries=feeds.entries.length;summary.playerSourcePins=feeds.sourcePins?.length||0;summary.podcastBindings=feeds.entries.filter(e=>e.podcastWorkspace).length;summary.podcastTranscripts=feeds.entries.reduce((n,e)=>n+(e.podcastWorkspace?.transcript?1:0)+(e.podcastWorkspace?.translation?1:0),0);}
  const catalog = json('media-catalog.json');
  if (Array.isArray(catalog?.items)) {
    summary.mediaItems = catalog.items.length;
    summary.mediaEpisodes = catalog.items.reduce((n, i) => n + (Array.isArray(i?.episodes) ? i.episodes.length : 0), 0);
  }
  const watch = json('watch-library.json');
  if (Array.isArray(watch?.items)) summary.watchItems = watch.items.length;
  const notes = json('browser-notes.json');
  if (Array.isArray(notes?.annotations)) summary.notes = notes.annotations.length;
  const session = json('browser-session.json');
  if (Array.isArray(session?.tabs)) {
    summary.tabs = session.tabs.length;
    summary.syncRecords = session.tabs.reduce((n, t) =>
      n + (Array.isArray(t?.subtitleSyncRecords) ? t.subtitleSyncRecords.length : 0), 0);
  }
  if (sections['browser-subtitles/']) summary.subtitleFiles = sections['browser-subtitles/'].files;
  if (sections['subtitle-edits/']) summary.subtitleEdits = sections['subtitle-edits/'].files;
  const shelf = json('media-shelf.json');
  if(shelf) summary.shelfRecords=['music','books','stations','podcasts','playlists','diary','reviews'].reduce((n,k)=>n+(Array.isArray(shelf[k])?shelf[k].length:0),0);
  const daily=json('media-daily.json');if(daily){summary.dailyJournalEntries=daily.journal?.length||0;summary.watchlistSections=Object.keys(daily.queue||{}).length;summary.linkedMediaAssets=daily.assets?.length||0;}
  const film=json('film-watch.json');if(film){summary.filmCollections=Object.keys(film.collections||{}).length;summary.filmAlternatives=film.alternatives?.length||0;}
  const relations=json('media-title-relations.json');if(relations)summary.titleRelationAliases=Object.keys(relations.bindings||{}).length;
  const enriched=json('media-enrichment.json');if(enriched?.titles)summary.titleDecisions=Object.keys(enriched.titles).length;
  const artifacts=json('assistant-artifacts.json');if(Array.isArray(artifacts?.documents))summary.assistantArtifacts=artifacts.documents.length;
  const chats=json('assistant-conversations.json');if(Array.isArray(chats?.threads))summary.assistantConversations=chats.threads.length;
  const folders=json('media-folder-watches.json');if(Array.isArray(folders))summary.watchedFolders=folders.length;
  const torrents=json('torrent-library.json');if(Array.isArray(torrents))summary.torrents=torrents.length;
  if(root){summary.changes={added:0,changed:0,unchanged:0};for(const file of files){const target=path.join(root,file.name);let same=false;if(fs.existsSync(target)&&!fs.lstatSync(target).isSymbolicLink()&&fs.statSync(target).size<16e6)same=fs.readFileSync(target).equals(Buffer.from(file.data,'base64'));summary.changes[!fs.existsSync(target)?'added':same?'unchanged':'changed']++;}}
  return summary;
}

// Kuyruk maddesi 25 — taşıma sihirbazı: paketteki mutlak ortam yollarından
// bu bilgisayarda bulunamayanları kök bazında gruplar. Geri yükleme öncesi
// kullanıcı yeni kök seçebilir; eşleme rewrite() zincirine eklenir.
function looksLikeLocalMediaPath(value) {
  if (typeof value !== 'string' || !value || value.length > 4000) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (/^(?:[\\/]{2}|\\[?.]\\)/.test(value)) return false;
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/');
}

function missingLocalMedia(data, exists = fs.existsSync) {
  const existsFn = typeof exists === 'function' ? exists : () => false;
  const groups = new Map();
  const json = (name) => {
    const file = (data?.files || []).find((f) => f.name === name);
    if (!file) return null;
    try { return JSON.parse(Buffer.from(file.data, 'base64').toString('utf8')); }
    catch (_) { return null; }
  };
  const add = (value, unverified = false) => {
    if (!looksLikeLocalMediaPath(value)) return;
    let missing = unverified;
    if(!unverified)try { missing = !exists(value); } catch (_) { missing = true; }
    if (!missing) return;
    const parser = /^[a-zA-Z]:[\\/]/.test(value) ? path.win32 : path.posix;
    const key = parser.dirname(value);
    const row = groups.get(key) || { root: key, count: 0 };
    row.count += 1;if(unverified)row.requiresConfirmation=true;
    groups.set(key, row);
  };
  const watch = json('watch-library.json');
  for (const item of watch?.items || []) add(item?.localPath);
  const catalog = json('media-catalog.json');
  for (const item of catalog?.items || []) {
    for(const source of require('./catalog-library-model').allSources(item))if(source.type==='local')add(source.value);
  }
  for(const asset of json('media-daily.json')?.assets||[])add(asset.path,true);
  for(const alternative of json('film-watch.json')?.alternatives||[])add(alternative.source?.value,true);
  return [...groups.values()].sort((a, b) => b.count - a.count || a.root.localeCompare(b.root)).slice(0, 20);
}

module.exports = { exportPackage, readPackage, restorePackage, allowed, storageValues, STORAGE_KEYS, validate, remapRendererValues, describePackage, missingLocalMedia, looksLikeLocalMediaPath };
