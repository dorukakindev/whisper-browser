'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const { run } = require('./browser-media-tools');
const { readLimitedBytes } = require('./catalog-discovery');
const { safePlaceUrl } = require('./browser-place-url');
const text = (v, n = 500) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const audio = /\.(mp3|wav|m4a|m4b|aac|flac|ogg|opus|wma)$/i;
const fileKey = file => createHash('sha256').update(process.platform === 'win32' ? file.toLowerCase() : file).digest('hex').slice(0, 32);
function urlOf(value) {
  const url = new URL(text(value, 4096));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use an HTTP/HTTPS address without credentials.');
  const safe = safePlaceUrl(url.href);
  if (!safe || safe !== url.href) throw Error('Signed/private URLs cannot be saved as public stations or feeds.');
  return safe;
}
function csvPlan(rows, items) {
  const fold = v => require('./text-fold').search(v).trim();
  const planned = [], ambiguous = [], added = [];
  const groups = new Map();
  for (const item of items) {
    for(const name of new Set([item.title,item.originalTitle].filter(Boolean).map(fold))){const key=`${name}|${item.year||''}`;const group=groups.get(key)||[];group.push(item);groups.set(key,group);}
  }
  // Ratings export may repeat titles. One last non-empty rating wins; diary dates are retained separately.
  const unique = new Map();
  for (const row of rows) {
    const key = `${fold(row.title)}|${row.year || ''}`, old = unique.get(key);
    unique.set(key, { ...old, ...row, watched:!!row.watched||!!old?.watched,watchedDate:row.watchedDate||old?.watchedDate||'', rating: row.rating ?? old?.rating ?? null });
  }
  for (const row of unique.values()) {
    const targets = (row.year ? groups.get(`${fold(row.title)}|${row.year}`) || [] : items.filter(item => [item.title,item.originalTitle].some(name=>name&&fold(name)===fold(row.title)))).filter(item => item.kind !== 'series');
    if (targets.length > 1) { ambiguous.push(row.title); continue; }
    if (targets[0]) planned.push({ id: targets[0].id, title: row.title, rating: row.rating, watched:!!row.watched||!!row.watchedDate,preserved: !!targets[0].ratings?.personal });
    else added.push(row);
  }
  return { planned, added, ambiguous };
}
function registerMediaShelf({ ipcMain, dialog, owner, authorized, userData, pythonPath, ffprobePath, inspectMedia, grantMedia, grantPdf, nativeImage, catalogStore, fetchImpl = fetch, musicRun = run }) {
  let active = null;
  const imports = new Map();
  const stateFile = () => path.join(userData(), 'media-shelf.json');
  function load() {
    if (!fs.existsSync(stateFile())) return { version: 1, music: [], books: [], stations: [], podcasts: [], playlists: [], diary: [] };
    if (fs.statSync(stateFile()).size > 16_000_000) throw Error('Media shelf exceeds 16 MB; export/recover it before editing.');
    const data = JSON.parse(fs.readFileSync(stateFile(), 'utf8').replace(/^\uFEFF/, ''));
    if (data.version !== 1 || ['music', 'books', 'stations', 'podcasts', 'playlists', 'diary'].some(key => !Array.isArray(data[key]))) throw Error('Media shelf is damaged; original file was preserved.');
    return data;
  }
  function save(data) {
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > 16_000_000) throw Error('Media shelf exceeds 16 MB; remove unused entries first.');
    atomicWriteFileSync(stateFile(), json);
  }
  const parser = async (request, signal) => JSON.parse(await run(pythonPath(), [path.join(__dirname, '../backend/media_shelf.py')], JSON.stringify(request), signal, 30000));
  const choose = async (extensions, multiple = false) => {
    const result = await dialog.showOpenDialog(owner(), { properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: extensions.join(', '), extensions }] });
    return result.canceled ? [] : result.filePaths || [];
  };
  const found = (data, field, id) => {
    const row = data[field].find(row => row.id === id);
    if (!row) throw Error('Library item not found.');
    return row;
  };
  function publicState(data) {
    const { diary, reviews:privateReviews, ...rest } = data;
    return { ...rest, taste: require('./media-taste').profile(diary,catalogStore().list(),data.tasteProfile || {},Array.isArray(data.reviews)?data.reviews:[]) };
  }
  async function importMusic(input) {
    if (active) throw Error('An import is already running.');
    const controller = new AbortController(); active = controller;
    try {
      let files;
      if (input.folder) {
        const result = await dialog.showOpenDialog(owner(), { properties: ['openDirectory'] });
        if (result.canceled) return { ok: false, canceled: true };
        files = [];
        const walk = async (dir, depth) => {
          if (depth > 12 || controller.signal.aborted) return;
          for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
            if (files.length >= 500) throw Error('Folder exceeds 500 audio files; select a smaller folder.');
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(file, depth + 1);
            else if (entry.isFile() && audio.test(file)) files.push(file);
          }
        };
        await walk(result.filePaths[0], 0);
      } else files = await choose(['mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'opus', 'wma'], true);
      if (!files.length) return { ok: false, canceled: true };
      if (files.length > 500) throw Error('Select at most 500 files per import.');
      const rows = [], warnings = []; let index = 0;
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
        while (index < files.length && !controller.signal.aborted) {
          const file = files[index++];
          try {
            const real = inspectMedia(file);
            if (!audio.test(real)) throw Error('Unsupported audio format.');
            const probe = JSON.parse(await run(ffprobePath(), ['-v', 'error', '-show_format', '-of', 'json', real], '', controller.signal, 15000));
            const tags = Object.fromEntries(Object.entries(probe.format?.tags || {}).map(([key, value]) => [key.toLowerCase(), value]));
            rows.push({ id: fileKey(real), path: real, title: text(tags.title) || path.basename(real, path.extname(real)), artist: text(tags.artist), album: text(tags.album), track: text(tags.track, 30), duration: Number(probe.format?.duration) || 0 });
          } catch (error) { if (!controller.signal.aborted) warnings.push(`${path.basename(file)}: ${error.message}`); }
        }
      }));
      if (controller.signal.aborted) return { ok: false, canceled: true };
      const data = load(), mapped = new Map(data.music.map(row => [row.id, row]));
      rows.forEach(row => mapped.set(row.id, { ...mapped.get(row.id), ...row }));
      if (mapped.size > 5000) throw Error('Music library is limited to 5,000 files.');
      data.music = [...mapped.values()]; save(data);
      return { ok: true, added: rows.length, warnings: warnings.slice(0, 50) };
    } finally { if (active === controller) active = null; }
  }
  const spotify=require('./spotify-import').create({fetchImpl,run:musicRun,python:pythonPath});
  ipcMain.handle('media-shelf:request', async (event, input = {}) => {
    if (!authorized(event)) return { ok: false, error: 'Unauthorized request.' };
    try {
      switch (input.action) {
        case 'spotify-read': return {ok:true,...await spotify.read(input.url,event.sender?.id||0)};
        case 'spotify-match': return {ok:true,...await spotify.match(input.token,input.index,event.sender?.id||0)};
        case 'spotify-cancel': spotify.cancel();return {ok:true};
        case 'spotify-forget': spotify.forget(input.token,event.sender?.id||0);return {ok:true};
        case 'spotify-save': {
          const prepared=spotify.selection(input.token,input.choices,event.sender?.id||0),data=load(),name=text(input.name,120)||prepared.name;
          data.linkedPlaylists=data.linkedPlaylists||[];if(!Array.isArray(data.linkedPlaylists)||data.linkedPlaylists.length>=100)throw Error('Linked playlist limit: 100');
          const row={id:randomUUID(),name,source:'spotify',sourceUrl:prepared.sourceUrl,tracks:prepared.tracks};data.linkedPlaylists.push(row);save(data);spotify.forget(input.token);return {ok:true,id:row.id,count:row.tracks.length};
        }
        case 'spotify-remove': {const data=load();if(!Array.isArray(data.linkedPlaylists)||!data.linkedPlaylists.some(p=>p.id===input.id))throw Error('Playlist missing');data.linkedPlaylists=data.linkedPlaylists.filter(p=>p.id!==input.id);save(data);return {ok:true};}
        case 'spotify-preview': {const p=spotify.selection(input.token,[{index:input.index,videoId:input.videoId}],event.sender?.id||0);return {ok:true,...await spotify.stream(p.tracks[0].youtubeUrl)};}
        case 'spotify-play': {
          const data=load(),row=data.linkedPlaylists?.find(p=>p.id===input.playlistId)?.tracks.find(t=>t.id===input.id);if(!row)throw Error('Saved Spotify match missing');
          return {ok:true,...await spotify.stream(row.youtubeUrl)};
        }
        case 'list': return { ok: true, ...publicState(load()) };
        case 'cancel': active?.abort(); return { ok: true };
        case 'music-import': return await importMusic(input);
        case 'music-play': {
          const row = found(load(), 'music', input.id), real = inspectMedia(row.path); grantMedia(real);
          return { ok: true, path: real, title: row.title };
        }
        case 'playlist-rename': {
          const data=load(),name=text(input.name,120);if(!name)throw Error('Enter a playlist name / Çalma listesi adı yaz.');
          if(!['local','spotify'].includes(input.kind))throw Error('Invalid playlist type');
          const row=(input.kind==='spotify'?data.linkedPlaylists||[]:data.playlists).find(r=>r.id===input.id);if(!row)throw Error('Playlist missing');row.name=name;save(data);return {ok:true};
        }
        case 'playlist-save': {
          const data = load(), name = text(input.name, 120);
          if (!name) throw Error('Enter a playlist name.');
          if(!Array.isArray(input.ids)||input.ids.length>5000||input.ids.some(id=>typeof id!=='string'))throw Error('Invalid playlist selection.');
          const tracks = [...new Set(input.ids)],known=new Set(data.music.map(row=>row.id));
          if(tracks.some(id=>!known.has(id)))throw Error('Playlist selection changed; review the tracks again.');
          if (!tracks.length) throw Error('Select at least one audio file.');
          if (data.playlists.length >= 100) throw Error('Playlist limit reached.');
          const playlist={id:randomUUID(),name,tracks};data.playlists.push(playlist);save(data);return {ok:true,id:playlist.id};
        }
        case 'music-cover': {
          const row=found(load(),'music',input.id),real=inspectMedia(row.path),folder=path.dirname(real);
          for(const name of ['cover.jpg','cover.png','folder.jpg','folder.png','Cover.jpg','Cover.png']){
            const candidate=path.join(folder,name);try{const target=fs.realpathSync(candidate);if(path.dirname(target)!==folder||fs.statSync(target).size>3000000)continue;const image=nativeImage.createFromPath(target);if(image.isEmpty())continue;return {ok:true,cover:image.resize({width:240,height:240,quality:'good'}).toDataURL()};}catch{}
          }
          return {ok:true,cover:''};
        }
        case 'music-favorite':
        case 'music-played': {
          const data=load();let row;
          if(input.kind==='music')row=found(data,'music',input.id);
          else if(input.kind==='spotify')row=data.linkedPlaylists?.find(p=>p.id===input.playlistId)?.tracks.find(t=>t.id===input.id);
          if(!row)throw Error('Unknown music track / Müzik parçası bulunamadı.');
          if(input.action==='music-favorite'){if(typeof input.favorite!=='boolean')throw Error('Invalid favorite');row.favorite=input.favorite;}
          else {row.lastPlayedAt=Date.now();row.playCount=Math.min(1000000,(Number.isSafeInteger(row.playCount)?row.playCount:0)+1);}
          save(data);return {ok:true,favorite:!!row.favorite,lastPlayedAt:row.lastPlayedAt||0,playCount:row.playCount||0};
        }
        case 'listen-progress': {
          const data = load();
          if (!['music', 'podcasts', 'stations'].includes(input.kind)) throw Error('Invalid audio kind.');
          let row = found(data, input.kind, input.id);
          if (input.kind === 'podcasts') { row = row.episodes.find(row => row.url === input.url); if (!row) throw Error('Episode not found.'); }
          if (!Number.isFinite(input.position) || input.position < 0 || input.position > 31_536_000 || !Number.isFinite(input.duration) || input.duration < 0 || input.duration > 31_536_000) throw Error('Invalid listening position.');
          row.position = input.position; if (input.duration) row.duration = input.duration;
          save(data); return { ok: true };
        }
        case 'book-import': {
          const files = await choose(['epub', 'pdf', 'txt']);
          if (!files.length) return { ok: false, canceled: true };
          const real = fs.realpathSync(files[0]), book = await parser({ action: 'book', path: real });
          const data = load(), id = fileKey(real), existing = data.books.find(row => row.id === id);
          if (!existing && data.books.length >= 300) throw Error('Book library is limited to 300 titles.');
          let cover = '';
          if (book.cover) { const image = nativeImage.createFromDataURL(book.cover); if (!image.isEmpty()) cover = image.resize({ width: 180 }).toDataURL(); }
          const row = { ...existing, id, path: real, title: text(book.title), author: text(book.author), format: book.format, cover, chapter: existing?.chapter || 0, scroll: existing?.scroll || 0, bookmarks: existing?.bookmarks || [] };
          data.books = [...data.books.filter(row => row.id !== id), row]; save(data);
          if (book.format === 'pdf') grantPdf(real);
          return { ok: true, id };
        }
        case 'book-open': {
          const row = found(load(), 'books', input.id);
          if (path.extname(row.path).slice(1).toLowerCase() !== row.format) throw Error('Book format changed; re-import it.');
          const before = fs.statSync(row.path);
          if (input.expectedSource && (input.expectedSource.sourceSize !== before.size || input.expectedSource.sourceMtime !== before.mtimeMs)) throw Error('Source book changed; reopen it / Kaynak kitap değişti; yeniden açın.');
          const book = await parser({ action: 'book', path: row.path });
          const after = fs.statSync(row.path);
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('Source book changed while opening; try again / Kaynak kitap açılırken değişti; yeniden deneyin.');
          if (row.format === 'pdf') grantPdf(row.path);
          return { ok: true, ...row, chapters: book.chapters, sourceSize: after.size, sourceMtime: after.mtimeMs };
        }
        case 'book-progress': {
          const data = load(), row = found(data, 'books', input.id);
          if (!Number.isInteger(input.chapter) || input.chapter < 0 || input.chapter > 1000 || !Number.isFinite(input.scroll) || input.scroll < 0 || input.scroll > 1) throw Error('Invalid reading position.');
          row.chapter = input.chapter; row.scroll = input.scroll;
          if (input.bookmark) {
            const quote = text(input.quote, 2000);
            const mark = { chapter: input.chapter, scroll: input.scroll, quote, at: Date.now() };
            row.bookmarks = [...(row.bookmarks || []), mark].slice(-100);
          }
          save(data); return { ok: true };
        }
        case 'radio-save': {
          const data = load(), url = urlOf(input.url), title = text(input.title) || new URL(url).hostname;
          if (data.stations.length >= 100 && !data.stations.some(row => row.url === url)) throw Error('Station limit reached.');
          if (!data.stations.some(row => row.url === url)) data.stations.push({ id: randomUUID(), title, url });
          save(data); return { ok: true };
        }
        case 'podcast-add': {
          const url = urlOf(input.url);
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), credentials: 'omit' });
          if (!response.ok) throw Error(`Feed HTTP ${response.status}`);
          const bytes = await readLimitedBytes(response, 2_000_000, 'Podcast');
          const parsed = await parser({ action: 'rss', data: bytes.toString('base64') });
          const data = load();
          if (data.podcasts.length >= 100 && !data.podcasts.some(row => row.url === url)) throw Error('Podcast limit reached.');
          const previous = data.podcasts.find(row => row.url === url);
          const episodes = parsed.episodes.flatMap(ep => {
            try { const url = urlOf(ep.url), old = previous?.episodes.find(row => row.url === url); return [{ ...ep, url, position: old?.position || 0, duration: old?.duration || 0 }]; } catch { return []; }
          });
          if (!episodes.length) throw Error('No public audio enclosure URLs could be saved.');
          const row = { id: previous?.id || randomUUID(), url, title: parsed.title, episodes, updated: Date.now() };
          data.podcasts = [...data.podcasts.filter(row => row.url !== url), row]; save(data); return { ok: true };
        }
        case 'remove': {
          if (!['books', 'music', 'stations', 'podcasts', 'playlists'].includes(input.kind)) throw Error('Invalid library type.');
          const data = load(); data[input.kind] = data[input.kind].filter(row => row.id !== input.id);
          if (input.kind === 'music') data.playlists.forEach(row => { row.tracks = row.tracks.filter(id => id !== input.id); });
          save(data); return { ok: true }; // Source files are never removed.
        }
        case 'letterboxd-preview': {
          const files = await choose(['csv','zip']); if (!files.length) return { ok: false, canceled: true };
          const parsed = await parser({ action: 'letterboxd', path: files[0] });
          const catalog = catalogStore();
          const plan = csvPlan(parsed.rows, catalog.list()), token = randomUUID();
          imports.clear(); imports.set(token, { rows: parsed.rows, reviews:parsed.reviews || parsed.rows.filter(row=>row.review),diary:parsed.diary||parsed.rows,expires: Date.now() + 600000 });
          return { ok: true, token, count: parsed.rows.length, reviews:(parsed.reviews || parsed.rows.filter(row=>row.review)).length,matches: plan.planned.length, newTitles: plan.added.length, ambiguous: plan.ambiguous, preserved: plan.planned.filter(row => row.preserved).length };
        }
        case 'letterboxd-apply': {
          const prepared = imports.get(input.token); imports.delete(input.token);
          if (!prepared || prepared.expires < Date.now()) throw Error('Import preview expired; choose the CSV again.');
          const catalog = catalogStore();
          const plan = csvPlan(prepared.rows, catalog.list());
          const patches = plan.planned.map(row => ({ id: row.id, ratings: { personal: row.preserved ? catalog.get(row.id).ratings.personal : row.rating === null ? null : String(row.rating) },...(row.watched&&catalog.get(row.id).watchStatus==='unspecified'?{watchStatus:'completed'}:{}) }));
          // Preserve existing personal scores. New ratings belong to the user, not the site's aggregate.
          const data = load();
          const catalogPatches=[...patches, ...plan.added.map(row => ({ kind: 'film', title: row.title, year: row.year || null, watchStatus: row.watchedDate||row.watched ? 'completed' : 'unspecified', ratings: { personal: row.rating === null ? null : String(row.rating) } }))];
          const diaryKey=row=>JSON.stringify([require('./text-fold').search(row.title),row.year||'',row.watchedDate||'',row.rewatchIndex||0]);const merged = new Map(data.diary.map(row => [diaryKey(row), row]));
          (prepared.diary||prepared.rows).forEach(row => { const key = diaryKey(row), old = merged.get(key); merged.set(key, { ...old, ...row, review:row.review || old?.review || '',rating: row.rating ?? old?.rating ?? null, watchedDate: row.watchedDate || old?.watchedDate || '' }); });
          data.diary = [...merged.values()].slice(-10000);
          const reviews=new Map((Array.isArray(data.reviews)?data.reviews:[]).map(row=>[require('./media-taste').reviewId(row),row]));
          for(const row of prepared.reviews || [])reviews.set(require('./media-taste').reviewId(row),row);
          data.reviews=[...reviews.values()].slice(-10000);
          if(Buffer.byteLength(JSON.stringify(data))>16_000_000)throw Error('Media shelf exceeds 16 MB; import a smaller review export.');
          catalog.upsertMany(catalogPatches);save(data);
          return { ok: true, matched: plan.planned.length, added: plan.added.length, skipped: plan.ambiguous.length };
        }
        case 'taste-quiz': {const data=load(),quiz=input.quiz===null?null:require('./taste-quiz').validate(input.quiz);data.tasteProfile={...data.tasteProfile,quiz};save(data);return {ok:true,taste:publicState(data).taste};}
        case 'taste-preferences': { const data=load(); data.tasteProfile={...data.tasteProfile,...require('./media-taste').preferences(input.preferences)};save(data);return {ok:true}; }
        case 'taste-analysis': { const data=load(); const analysis=require('./media-taste').validateAnalysis(input.analysis,[...data.diary,...(Array.isArray(data.reviews)?data.reviews:[])]);data.tasteProfile={...data.tasteProfile,analysis};save(data);return {ok:true,analysis}; }
        default: throw Error('Unsupported media shelf action.');
      }
    } catch (error) { const parts=String(error.message).split(' / ');return { ok: false, error:parts.length>1?(input.locale==='tr'?parts.slice(1).join(' / '):parts[0]):error.message }; }
  });
}
module.exports = { registerMediaShelf, csvPlan, urlOf };
