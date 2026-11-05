'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const { run } = require('./browser-media-tools');
const { readLimitedBytes } = require('./catalog-discovery');
const { safePlaceUrl } = require('./browser-place-url');
const text = (v, n = 500) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const M=require('./media-source-mechanisms');
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
    const uris=new Set(rows.filter(r=>fold(r.title)===fold(row.title)&&String(r.year||'')===String(row.year||'')).map(r=>r.uri).filter(Boolean));if(uris.size>1){ambiguous.push(row.title);continue;}
    const targets = (row.year ? groups.get(`${fold(row.title)}|${row.year}`) || [] : items.filter(item => [item.title,item.originalTitle].some(name=>name&&fold(name)===fold(row.title)))).filter(item => item.kind !== 'series');
    if (targets.length > 1) { ambiguous.push(row.title); continue; }
    if (targets[0]) planned.push({ id: targets[0].id, title: row.title, rating: row.rating, watched:!!row.watched||!!row.watchedDate,preserved: !!targets[0].ratings?.personal });
    else added.push(row);
  }
  return { planned, added, ambiguous };
}
function bindPodcastEpisode(podcast, episode, feedEntry) {
  const session=require('./podcast-session');
  const entry={id:episode.episodeRecordId||createHash('sha256').update(JSON.stringify([podcast.id,episode.guid||episode.url])).digest('hex'),feedId:feedEntry?.feedId||episode.sourceFeedId||podcast.id,externalId:episode.guid||'',enclosures:[{url:episode.url,type:episode.enclosureType||'audio/unknown',length:Number(episode.enclosureLength)||undefined}],podcastSourceRevision:episode.podcastSourceRevision||0,podcastAudioEvidence:episode.podcastAudioEvidence};
  delete entry.podcastAudioEvidence;entry.podcastSourceRevision=0;
  // A downloaded copy proves its own bytes, never the currently open RSS stream.
  if(feedEntry)entry.id=feedEntry.id;
  const version=session.sourceVersion(entry);
  const workspace=episode.podcastWorkspace?.sourceVersion===version?episode.podcastWorkspace:feedEntry?.podcastWorkspace?.sourceVersion===version?feedEntry.podcastWorkspace:null;
  return {...episode,...(episode.sourceVersion&&episode.sourceVersion!==version?{positionState:'needs-review'}:{}),...(workspace?{position:workspace.position,podcastWorkspace:workspace}:{}),episodeRecordId:entry.id,...(feedEntry?{feedEntryId:feedEntry.id,sourceFeedId:feedEntry.feedId,registryWorkspace:feedEntry.podcastWorkspace}:{}),episodeIdentity:session.episodeIdentity(entry),sourceBinding:session.sourceBinding(entry),sourceVersion:version};
}
function podcastTrack(episode,role='source') {
  const local=episode.podcastWorkspace?.sourceVersion===episode.sourceVersion?episode.podcastWorkspace:null,registry=episode.registryWorkspace;
  // An explicitly selected publisher source must not be silently replaced by older processing output.
  const publisher=local?.transcript?.provenance==='publisher';
  const workspace = publisher?{...local,translation:local.translation||(registry?.sourceVersion===local.sourceVersion&&registry.transcript?.text===local.transcript.text?registry.translation:undefined)}:registry?.transcript?registry:local;
  const transcript = workspace?.[role==='translation'?'translation':'transcript'];
  if(!transcript||transcript.status==='partial')return null;
  const timed=workspace.sourceVersion===episode.sourceVersion&&transcript.state==='timed';
  const cues = timed ? require('./browser-subtitles').parseSubtitlePayload(transcript.text, '', 'publisher.'+transcript.format).cues.map((cue,index)=>({...cue,id:String(index)})) : [];
  return {id:(role==='translation'?'translation:':'publisher:')+episode.episodeIdentity, revision:createHash('sha256').update(transcript.text).digest('hex'), role, offsetSeconds:0, timed, ...(workspace.sourceVersion!==episode.sourceVersion?{timingState:'needs-review'}:{}),cues, text:transcript.text, provenance:transcript.provenance};
}
function loadShelfFile(file) {
    if (!fs.existsSync(file)) return { version: 1, music: [], books: [], stations: [], podcasts: [], playlists: [], diary: [] };
    if (fs.statSync(file).size > require('./media-shelf-limits').MAX_BYTES) throw Error('Media shelf exceeds 32 MB; export/recover it before editing.');
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (data.version !== 1 || ['music', 'books', 'stations', 'podcasts', 'playlists', 'diary'].some(key => !Array.isArray(data[key]))) throw Error('Media shelf is damaged; original file was preserved.');
    // Link an already subscribed feed entry by feed URL + GUID/enclosure, never by title.
    const feedFile=path.join(path.dirname(file),'feeds.json');let feedEntries=[];
    if(fs.existsSync(feedFile)){const stat=fs.statSync(feedFile);if(stat.size<=16_000_000){try{const feeds=JSON.parse(fs.readFileSync(feedFile,'utf8'));feedEntries=Array.isArray(feeds.entries)?feeds.entries:[];}catch{/* A damaged independent feed store must not prevent shelf recovery. */}}}
    data.podcasts = data.podcasts.map(p=>({...p,episodes:p.episodes.map(e=>bindPodcastEpisode(p,e,feedEntries.find(f=>f.kind==='podcast'&&f.sourceFeed?.url===p.url&&(e.guid?f.externalId===e.guid:f.enclosures?.some(a=>a.url===e.url))))) }));
    return data;
  }
function readReviewTaste(userData,catalog=[]) {
  const data=loadShelfFile(path.join(userData,'media-shelf.json'));
  return require('./media-taste').profile(data.diary,catalog,data.tasteProfile||{},Array.isArray(data.reviews)?data.reviews:[]);
}
function registerMediaShelf({ ipcMain, dialog, owner, authorized, userData, pythonPath, ffprobePath, inspectMedia, grantMedia, grantPdf, nativeImage, catalogStore, catalogView, fetchImpl = fetch, musicRun = run, podcastRegistryBinding, transcriptFetcher = (descriptor, options) => require('./podcast-transcript-service').fetchPodcastTranscript(descriptor, {...options, ...require('./feed-service')}) }) {
  const requestTranscript=require('./podcast-transcript-service').createTranscriptRequester(transcriptFetcher);
  let active = null;
  const imports = new Map();
  const stateFile = () => path.join(userData(), 'media-shelf.json');
  const load=()=>loadShelfFile(stateFile());
  function save(data) {
    const json = JSON.stringify(data,(key,value)=>key==='registryWorkspace'?undefined:value);
    if (Buffer.byteLength(json) > require('./media-shelf-limits').MAX_BYTES) throw Error('Media shelf exceeds 32 MB; remove unused entries first.');
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
    return { ...rest, taste: tasteOf(data) };
  }
  const tasteCatalog=()=>catalogView?catalogView():catalogStore?.().list()||[];
  const tasteOf=data=>require('./media-taste').profile(data.diary,tasteCatalog(),data.tasteProfile||{},Array.isArray(data.reviews)?data.reviews:[]);
  function updateTastePreferences(data,input){
    const taste=require('./media-taste'),saved=data.tasteProfile||{};
    if(input.expectedPreferencesRevision!==undefined&&input.expectedPreferencesRevision!==taste.preferencesRevision(saved))throw Object.assign(Error('Taste preferences changed; review the current profile / Zevk tercihleri değişti; güncel profili inceleyin.'),{stale:true});
    const patch=input.patch??input.preferences;
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['weights','avoid','note'].includes(key))||!Object.keys(patch).length)throw Error('Invalid taste preferences / Geçersiz zevk tercihleri.');
    const next=taste.effectivePreferences(saved);
    if(patch.weights!==undefined){if(!patch.weights||typeof patch.weights!=='object'||Array.isArray(patch.weights)||Object.entries(patch.weights).some(([key,value])=>!taste.ASPECTS.includes(key)||!Number.isFinite(value)||value<0||value>5))throw Error('Invalid preference weights / Geçersiz tercih ağırlıkları.');next.weights={...next.weights,...patch.weights};}
    if(patch.avoid!==undefined){if(!Array.isArray(patch.avoid)||patch.avoid.length>taste.ASPECTS.length||patch.avoid.some(value=>!taste.ASPECTS.includes(value)))throw Error('Invalid avoidance preferences / Geçersiz kaçınma tercihleri.');next.avoid=[...new Set(patch.avoid)];}
    if(patch.note!==undefined){if(typeof patch.note!=='string'||patch.note.length>2000)throw Error('Invalid preference note / Geçersiz tercih notu.');next.note=patch.note;}
    data.tasteProfile={...saved,...taste.preferences(next)};
    // A note/avoid-only edit does not turn displayed default priorities into
    // priorities the person explicitly chose.
    if(patch.weights===undefined&&!Object.keys(saved.weights||{}).length){if(Object.prototype.hasOwnProperty.call(saved,'weights'))data.tasteProfile.weights=saved.weights;else delete data.tasteProfile.weights;}
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
        case 'spotify-rematch-read': {
          const row=load().linkedPlaylists?.find(p=>p.id===input.playlistId)?.tracks?.find(t=>t.id===input.id);
          if(!row)throw Error('Saved Spotify match missing / Kayıtlı Spotify eşleşmesi bulunamadı.');
          return {ok:true,...spotify.readSaved(row,event.sender?.id||0,{playlistId:input.playlistId,id:row.id,youtubeUrl:row.youtubeUrl})};
        }
        case 'spotify-rematch-save': {
          const prepared=spotify.selection(input.token,input.choices,event.sender?.id||0),target=prepared.reviewTarget;
          if(!target||prepared.tracks.length!==1)throw Error('Review one saved track first / Önce kayıtlı bir parçayı incele.');
          const data=load(),row=data.linkedPlaylists?.find(p=>p.id===target.playlistId)?.tracks?.find(t=>t.id===target.id);
          if(!row||row.youtubeUrl!==target.youtubeUrl)throw Error('Saved match changed. Review again / Kayıtlı eşleşme değişti. Yeniden incele.');
          const hit=prepared.tracks[0];Object.assign(row,{youtubeUrl:hit.youtubeUrl,youtubeTitle:hit.youtubeTitle,youtubeDuration:hit.youtubeDuration});
          save(data);spotify.forget(input.token,event.sender?.id||0);return {ok:true,id:row.id,count:1};
        }
        case 'spotify-match': return {ok:true,...await spotify.match(input.token,input.index,event.sender?.id||0)};
        case 'spotify-cancel': spotify.cancel();return {ok:true};
        case 'spotify-forget': spotify.forget(input.token,event.sender?.id||0);return {ok:true};
        case 'spotify-save': {
          const prepared=spotify.selection(input.token,input.choices,event.sender?.id||0),data=load(),name=text(input.name,120)||prepared.name;
          if(prepared.reviewTarget)throw Error('Use saved track review to replace this match.');
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
          if(!['local','spotify','queue'].includes(input.kind))throw Error('Invalid playlist type');
          const row=(input.kind==='spotify'?data.linkedPlaylists||[]:input.kind==='queue'?data.queuePlaylists||[]:data.playlists).find(r=>r.id===input.id);if(!row)throw Error('Playlist missing');row.name=name;save(data);return {ok:true};
        }
        case 'queue-playlist-save': {
          const data=load(),name=text(input.name,120);
          if(!name)throw Error('Enter a playlist name / Çalma listesi adı yaz.');
          if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>5000)throw Error('Choose 1–5000 known tracks');
          const entries=input.entries.map(entry=>{
            if(!entry||typeof entry.id!=='string'||!['music','spotify'].includes(entry.kind)||Object.keys(entry).some(k=>!['kind','id','playlistId'].includes(k)))throw Error('Invalid queue track identity');
            const known=entry.kind==='music'?data.music.find(r=>r.id===entry.id):(data.linkedPlaylists||[]).find(p=>p.id===entry.playlistId)?.tracks.find(r=>r.id===entry.id);
            if(!known)throw Error('Queued track was removed; review the queue / Kuyruktaki parça kaldırılmış; kuyruğu kontrol et.');
            return entry.kind==='music'?{kind:'music',id:entry.id}:{kind:'spotify',id:entry.id,playlistId:entry.playlistId};
          });
          const lists=data.queuePlaylists||[];if(!Array.isArray(lists)||lists.length>=100)throw Error('Playlist limit reached');
          const names=new Set([...data.playlists,...(data.linkedPlaylists||[]),...lists].map(r=>r.name));let title=name,index=2;while(names.has(title)){title=name+' ('+index+')';index++;}
          const row={id:randomUUID(),name:title,entries};data.queuePlaylists=[...lists,row];save(data);return {ok:true,id:row.id,name:title,count:entries.length};
        }
        case 'queue-playlist-remove': {
          const data=load(),lists=data.queuePlaylists||[];if(!lists.some(r=>r.id===input.id))throw Error('Playlist missing');data.queuePlaylists=lists.filter(r=>r.id!==input.id);save(data);return {ok:true};
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
          if(input.kind==='podcasts'&&input.sourceVersion&&input.sourceVersion!==row.sourceVersion)throw Error('Podcast source changed.');
          row.position = input.position; if(input.kind==='podcasts')row.positionState='observed'; if (input.duration) row.duration = input.duration;
          if(input.kind==='podcasts'){const rate=Number.isFinite(input.rate)&&input.rate>=.25&&input.rate<=4?input.rate:1;row.podcastWorkspace={...(row.podcastWorkspace?.sourceVersion===row.sourceVersion?row.podcastWorkspace:{}),sourceVersion:row.sourceVersion,position:input.position,rate};}
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
          if(input.expectedSource){const stat=fs.statSync(row.path);if(input.expectedSource.sourceSize!==stat.size||input.expectedSource.sourceMtime!==stat.mtimeMs)throw Error('Source book changed; reopen it / Kaynak kitap değişti; yeniden açın.');}
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
        case 'podcast-local-preview': {const d=load(),podcast=found(d,'podcasts',input.id),episode=podcast.episodes.find(e=>e.url===input.url);if(!episode)throw Error('Choose a podcast episode.');const files=await choose(['mp3','m4a','wav','ogg','opus','flac','mp4','webm']);if(!files.length)return {ok:false,canceled:true};const real=fs.realpathSync(files[0]),stat=fs.statSync(real);if(!stat.isFile())throw Error('Choose a media file.');let duration=0;if(ffprobePath){const probe=JSON.parse(await musicRun(ffprobePath(),['-v','quiet','-show_format','-of','json',real],null,null,15000));duration=Number(probe.format?.duration)||0;}const token=randomUUID();imports.set(token,{local:{id:podcast.id,url:episode.url,snapshot:M.hash(episode),source:{path:real,ownership:'personal',bytes:stat.size,mtimeMs:stat.mtimeMs,duration,available:true}},expires:Date.now()+600000});return {ok:true,token,episode:{title:episode.title,url:episode.url,duration:episode.duration||0},file:{name:path.basename(real),bytes:stat.size,duration},durationChanged:!!episode.duration&&!!duration&&Math.abs(episode.duration-duration)>2};}
        case 'podcast-local-confirm':{const p=imports.get(input.token);imports.delete(input.token);if(!p?.local||p.expires<Date.now())throw Error('Local file preview expired.');const d=load(),episode=found(d,'podcasts',p.local.id).episodes.find(e=>e.url===p.local.url),stat=fs.statSync(p.local.source.path);if(!episode||M.hash(episode)!==p.local.snapshot||stat.size!==p.local.source.bytes||stat.mtimeMs!==p.local.source.mtimeMs)throw Error('Episode or chosen file changed. Preview again.');episode.localSource=p.local.source;episode.localTranscriptState='needs-review';grantMedia?.(p.local.source.path);save(d);return {ok:true};}
        case 'podcast-local-play':{const episode=found(load(),'podcasts',input.id).episodes.find(e=>e.url===input.url),source=episode?.localSource;if(!source||source.ownership!=='personal')throw Error('No user-selected local source.');const real=fs.realpathSync(source.path),stat=fs.statSync(real);if(stat.size!==source.bytes||stat.mtimeMs!==source.mtimeMs)throw Error('Local file changed. Select and preview it again.');grantMedia?.(real);return {ok:true,path:real,position:episode.position||0};}
        case 'podcast-relink-preview':{const d=load(),podcast=found(d,'podcasts',input.id),from=podcast.episodes.find(e=>e.url===input.fromUrl),to=podcast.episodes.find(e=>e.url===input.toUrl);if(!from?.localSource||!to||from===to||to.localSource)throw Error('Choose a different episode without a local binding.');const token=randomUUID();imports.set(token,{podcastRelink:{id:podcast.id,fromUrl:from.url,toUrl:to.url,snapshot:M.hash([from,to])},expires:Date.now()+600000});return {ok:true,token,from:{title:from.title,url:from.url,guid:from.guid,published:from.published,duration:from.duration,position:from.position},to:{title:to.title,url:to.url,guid:to.guid,published:to.published,duration:to.duration,position:to.position},durationChanged:!!from.localSource.duration&&!!to.duration&&Math.abs(from.localSource.duration-to.duration)>2,policy:'Only the local file binding moves. Episode notes, progress and transcripts keep their original IDs; time anchors need review.'};}
        case 'podcast-relink-confirm':{const p=imports.get(input.token);imports.delete(input.token);if(!p?.podcastRelink||p.expires<Date.now())throw Error('Episode relink expired.');const d=load(),podcast=found(d,'podcasts',p.podcastRelink.id),from=podcast.episodes.find(e=>e.url===p.podcastRelink.fromUrl),to=podcast.episodes.find(e=>e.url===p.podcastRelink.toUrl);if(!from||!to||M.hash([from,to])!==p.podcastRelink.snapshot)throw Error('Episode identity changed. Preview again.');const source=from.localSource;delete from.localSource;to.localSource=source;to.localTranscriptState='needs-review';const undoToken=randomUUID();imports.set(undoToken,{podcastUndo:{id:podcast.id,fromUrl:from.url,toUrl:to.url,source},expires:Date.now()+600000});save(d);return {ok:true,undoToken};}
        case 'podcast-relink-undo':{const p=imports.get(input.token);imports.delete(input.token);if(!p?.podcastUndo||p.expires<Date.now())throw Error('Relink undo expired.');const d=load(),podcast=found(d,'podcasts',p.podcastUndo.id),from=podcast.episodes.find(e=>e.url===p.podcastUndo.fromUrl),to=podcast.episodes.find(e=>e.url===p.podcastUndo.toUrl);if(!from||!to||from.localSource||M.hash(to.localSource)!==M.hash(p.podcastUndo.source))throw Error('Local source binding changed.');from.localSource=to.localSource;delete to.localSource;save(d);return {ok:true};}
        case 'podcast-offline-status':{const d=load(),copies=d.podcasts.flatMap(p=>p.episodes.filter(e=>e.localSource).map(e=>({podcastId:p.id,url:e.url,title:e.title,ownership:e.localSource.ownership,bytes:e.localSource.bytes,available:fs.existsSync(e.localSource.path),evictable:false})));return {ok:true,copies,bytes:copies.reduce((sum,c)=>sum+c.bytes,0),managedDownloads:false};}
        case 'podcast-processing-binding': {
          const data=load(),podcast=found(data,'podcasts',input.id),episode=podcast.episodes.find(e=>e.url===input.url);
          const sameDeclaration=episode&&input.sourceBinding&&['resource','mime','declaredLength'].every(key=>input.sourceBinding[key]===episode.sourceBinding[key]);
          if(!episode||episode.sourceVersion!==input.sourceVersion&&!sameDeclaration)throw Error('Podcast source changed.');
          if(typeof podcastRegistryBinding!=='function')throw Error('Existing podcast registry is unavailable.');
          const binding=await podcastRegistryBinding({podcast:{id:podcast.id,url:podcast.url,title:podcast.title,language:podcast.language,publisher:podcast.publisher},episode:{guid:episode.guid,url:episode.url,title:episode.title,description:episode.description,date:episode.date,duration:episode.duration,enclosureType:episode.enclosureType,enclosureLength:episode.enclosureLength,transcriptDescriptors:episode.transcriptDescriptors||[]}});
          const fresh=load(),target=found(fresh,'podcasts',input.id).episodes.find(e=>e.url===input.url);
          if(!target||target.episodeIdentity!==episode.episodeIdentity&&target.feedEntryId!==binding.entryId)throw Error('Podcast source changed.');
          const output={...target,podcastWorkspace:undefined,registryWorkspace:binding.workspace};
          return {ok:true,...binding,track:podcastTrack(output),translation:podcastTrack(output,'translation')};
        }
        case 'podcast-workspace': {
          const podcast=found(load(),'podcasts',input.id), episode=podcast.episodes.find(e=>e.url===input.url);
          if(!episode)throw Error('Podcast episode changed.');
          const workspace=episode.podcastWorkspace?.sourceVersion===episode.sourceVersion?episode.podcastWorkspace:null;
          return {ok:true, episodeIdentity:episode.episodeIdentity, sourceVersion:episode.sourceVersion, track:podcastTrack(episode),translation:podcastTrack(episode,'translation'),position:workspace?.position||0,rate:workspace?.rate||1, descriptors:episode.transcriptDescriptors||[]};
        }
        case 'podcast-transcript': {
          const data=load(), podcast=found(data,'podcasts',input.id), episode=podcast.episodes.find(e=>e.url===input.url);
          if(!episode||episode.sourceVersion!==input.sourceVersion)throw Error('Podcast source changed.');
          const descriptor=episode.transcriptDescriptors?.[Number(input.descriptorIndex)||0];
          if(!descriptor)throw Error('Choose a publisher transcript.');
          if(episode.podcastWorkspace?.sourceVersion===episode.sourceVersion&&episode.podcastWorkspace.transcript?.descriptorUrl===descriptor.url)return {ok:true,cached:true,track:podcastTrack(episode)};
          const result=await requestTranscript(descriptor,{signal:AbortSignal.timeout(20000)});
          if(!result.ok)return result;
          if(result.text.length>500000)throw Error('Publisher transcript exceeds workspace limit.');
          const fresh=load(), target=found(fresh,'podcasts',input.id).episodes.find(e=>e.episodeIdentity===episode.episodeIdentity);
          if(!target||target.sourceVersion!==input.sourceVersion)throw Error('Podcast source changed.');
          const workspace={sourceVersion:target.sourceVersion,position:target.position||0,rate:target.podcastWorkspace?.rate||1,transcript:{state:result.timed==='yes'?'timed':'untimed',format:result.format,text:result.text,provenance:'publisher',descriptorUrl:descriptor.url}};
          require('./podcast-session').validateWorkspace(workspace);target.podcastWorkspace=workspace;save(fresh);
          return {ok:true,track:podcastTrack(target)};
        }
        case 'podcast-spotify-add': {
          const source=require('./podcast-link-source').spotify(input.url);if(!source)throw Error('Use a Spotify show or episode link.');
          const response=await fetchImpl('https://open.spotify.com/oembed?url='+encodeURIComponent(source.url),{signal:AbortSignal.timeout(15000),credentials:'omit',redirect:'error'});
          if(!response.ok)throw Error('Spotify HTTP '+response.status);
          const metadata=JSON.parse((await readLimitedBytes(response,200000,'Spotify')).toString('utf8'));
          const title=text(metadata.title);if(!title)throw Error('Spotify title unavailable.');
          const data=load(),previous=data.podcasts.find(row=>row.url===source.url);
          if(!previous&&data.podcasts.length>=100)throw Error('Podcast limit reached.');
          const image=/^https:\/\/[^/]*\.scdn\.co\//i.test(metadata.thumbnail_url||'')?metadata.thumbnail_url:'';
          const row={...previous,id:previous?.id||randomUUID(),url:source.url,title,image,sourceKind:'spotify',spotifyKind:source.kind,episodes:previous?.episodes||[],updated:Date.now()};
          data.podcasts=[...data.podcasts.filter(p=>p.url!==source.url),row];save(data);return {ok:true,id:row.id,title:row.title};
        }
        case 'podcast-add': {
          const url = urlOf(input.url);
          const response = fetchImpl===fetch?await require('./feed-service').fetchPublic(url,{maxBytes:6*1024*1024}):await fetchImpl(url, { signal: AbortSignal.timeout(15000), credentials: 'omit' });
          if (response.status!==200) throw Error(`Feed HTTP ${response.status}`);
          const bytes = response.buffer||await readLimitedBytes(response, 6*1024*1024, 'Podcast');
          const parsed = await parser({ action: 'rss', data: bytes.toString('base64') });
          const data = load();
          if (data.podcasts.length >= 100 && !data.podcasts.some(row => row.url === url)) throw Error('Podcast limit reached.');
          const previous = data.podcasts.find(row => row.url === url);
          const refreshed = new Set();
          const episodeLimit=previous?.episodeLimit||(Number.isInteger(input.initialEpisodeLimit)&&input.initialEpisodeLimit>=10&&input.initialEpisodeLimit<=200?input.initialEpisodeLimit:200);
          const episodes = parsed.episodes.slice(0,episodeLimit).flatMap(ep => {
            try { const url = require('./feed-parser').safeUrl(ep.url);if(!url)throw Error('Unsafe audio URL.');const old = previous?.episodes.find(row => ep.guid && row.guid === ep.guid) || previous?.episodes.find(row => row.url === url); if (old) refreshed.add(old); return [{ ...old,...ep, url, transcriptDescriptors:require('./podcast-transcript').normalizePodcastTranscripts(ep.transcriptDescriptors||[]), position: old?.position || 0, duration: ep.duration || old?.duration || 0 }]; } catch { return []; }
          });
          if (!episodes.length) throw Error('No public audio enclosure URLs could be saved.');
          // A rolling feed is not a deletion request. Keep older episode identities and their personal state.
          episodes.push(...(previous?.episodes || []).filter(episode => !refreshed.has(episode)));
          const row = { id: previous?.id || randomUUID(), url, title: parsed.title, publisher:parsed.publisher, image:parsed.image, language:parsed.language, episodes,...(episodeLimit<200?{episodeLimit}:{}), updated: Date.now() }; row.episodes=row.episodes.map(e=>{const next=bindPodcastEpisode(row,e);if(e.sourceVersion&&next.sourceVersion!==e.sourceVersion)next.positionState='needs-review';return next;});
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
          const plan = csvPlan(parsed.rows, catalog.list()), conflicts=M.ratingConflicts(parsed.rows,catalog.list()), token = randomUUID();
          imports.clear(); imports.set(token, { conflicts,sourceHistory:parsed.sourceHistory||[],rows: parsed.rows, reviews:parsed.reviews || parsed.rows.filter(row=>row.review),diary:parsed.diary||parsed.rows,expires: Date.now() + 600000 });
          return { ok: true, token, conflicts,orphaned:(parsed.sourceHistory||[]).filter(r=>r.recordState==='orphaned').length,deleted:(parsed.sourceHistory||[]).filter(r=>r.recordState==='deleted').length,count: parsed.rows.length, reviews:(parsed.reviews || parsed.rows.filter(row=>row.review)).length,matches: plan.planned.length, newTitles: plan.added.length, ambiguous: plan.ambiguous, preserved: plan.planned.filter(row => row.preserved).length };
        }
        case 'letterboxd-apply': {
          const prepared = imports.get(input.token); imports.delete(input.token);
          if (!prepared || prepared.expires < Date.now()) throw Error('Import preview expired; choose the CSV again.');
          const catalog = catalogStore();
          const choices=input.choices||{};if(!choices||typeof choices!=='object'||Array.isArray(choices)||Object.keys(choices).some(id=>!prepared.conflicts.some(c=>c.id===id)))throw Error('Invalid rating reconciliation choices.');
          const resolutions=[];for(const conflict of prepared.conflicts||[]){const choice=conflict.options.find(o=>o.id===(choices[conflict.id]||conflict.defaultChoice));if(!choice)throw Error('Unknown rating source.');if(conflict.catalogId){const item=catalog.get(conflict.catalogId);if(!item||M.hash([item.id,item.title,item.year,item.imdbId,item.tmdbId,item.ratings?.personal])!==conflict.catalogSnapshot)throw Error('Personal score changed. Preview the import again.');}resolutions.push({id:conflict.id,catalogId:conflict.catalogId,title:conflict.title,year:conflict.year,uri:conflict.uri,choice});}
          const importedRows=prepared.rows.map(row=>{const r=resolutions.find(r=>r.uri?row.uri===r.uri:r.title===row.title&&String(r.year)===String(row.year));return r&&r.choice.id!=='library'?{...row,rating:r.choice.rating}:row;});
          const plan = csvPlan(importedRows, catalog.list());
          const patches = plan.planned.map(row => ({ id: row.id, ratings: { personal: row.preserved ? catalog.get(row.id).ratings.personal : row.rating === null ? null : String(Number(row.rating)*2) },...(row.watched&&catalog.get(row.id).watchStatus==='unspecified'?{watchStatus:'completed'}:{}) }));
          for(const resolution of resolutions){if(resolution.catalogId&&resolution.choice.id!=='library'){const patch=patches.find(p=>p.id===resolution.catalogId);if(patch)patch.ratings.personal=String(resolution.choice.rating*2);}}
          // Preserve existing personal scores. New ratings belong to the user, not the site's aggregate.
          const data = load();
          const catalogPatches=[...patches, ...plan.added.map(row => ({ kind: 'film', title: row.title, year: row.year || null, watchStatus: row.watchedDate||row.watched ? 'completed' : 'unspecified', ratings: { personal: row.rating === null ? null : String(Number(row.rating)*2) } }))];
          const diaryKey=row=>JSON.stringify([require('./text-fold').search(row.title),row.year||'',row.watchedDate||'',row.rewatchIndex||0]);const merged = new Map(data.diary.map(row => [diaryKey(row), row]));
          (prepared.diary||prepared.rows).forEach(row => { const key = diaryKey(row), old = merged.get(key); merged.set(key, { ...old, ...row, review:row.review || old?.review || '',rating: row.rating ?? old?.rating ?? null, watchedDate: row.watchedDate || old?.watchedDate || '' }); });
          data.diary = [...merged.values()].slice(-10000);
          data.sourceHistory=[...new Map([...(data.sourceHistory||[]),...(prepared.sourceHistory||[])].map(r=>[r.recordId,r])).values()].slice(-10000);data.ratingResolutions={...(data.ratingResolutions||{}),...Object.fromEntries(resolutions.map(r=>[r.id,{choice:r.choice.id,at:Date.now()}]))};
          const reviews=new Map((Array.isArray(data.reviews)?data.reviews:[]).map(row=>[require('./media-taste').reviewId(row),row]));
          for(const row of prepared.reviews || [])reviews.set(require('./media-taste').reviewId(row),row);
          data.reviews=[...reviews.values()].slice(-10000);
          if(Buffer.byteLength(JSON.stringify(data))>require('./media-shelf-limits').MAX_BYTES)throw Error('Media shelf exceeds 32 MB; import a smaller review export.');
          catalog.upsertMany(catalogPatches);save(data);
          return { ok: true, matched: plan.planned.length, added: plan.added.length, skipped: plan.ambiguous.length };
        }
        case 'source-history':return {ok:true,rows:(load().sourceHistory||[]).filter(r=>r.recordState===(input.state||'orphaned')).slice(0,500)};
        case 'source-relink-preview':{const row=(load().sourceHistory||[]).find(r=>r.recordId===input.recordId&&r.recordState==='orphaned'),item=catalogStore().get(input.catalogId);if(!row||!item)throw Error('Choose an orphaned record and current catalog title.');const token=randomUUID();imports.set(token,{relink:{recordId:row.recordId,catalogId:item.id,snapshot:M.hash([item.id,item.title,item.year,item.imdbId,item.tmdbId])},expires:Date.now()+600000});return {ok:true,token,record:row,title:item.title,year:item.year};}
        case 'source-relink-confirm':{const p=imports.get(input.token);imports.delete(input.token);const item=p?.relink&&catalogStore().get(p.relink.catalogId);if(!p||p.expires<Date.now()||!item||M.hash([item.id,item.title,item.year,item.imdbId,item.tmdbId])!==p.relink.snapshot)throw Error('Relink preview expired or catalog identity changed.');const d=load(),row=d.sourceHistory.find(r=>r.recordId===p.relink.recordId&&r.recordState==='orphaned');if(!row)throw Error('Record changed.');row.linkedCatalogId=item.id;row.linkedAt=Date.now();save(d);return {ok:true};}
        case 'tag-query':{const rows=M.scopedTags(load(),catalogStore().list(),input.scope,input.name);return {ok:true,rows:rows.slice(0,500),total:rows.length,incomplete:rows.length>500};}
        case 'tag-save':{const d=load(),rows=M.scopedTags(d,catalogStore().list(),input.scope),row=rows.find(r=>r.id===input.recordId);if(!row&&input.scope!=='list')throw Error('Tagged record no longer exists.');if(!Array.isArray(input.tags)||input.tags.length>30)throw Error('Choose up to 30 tags.');const tags=[...new Set(input.tags.filter(v=>typeof v==='string').map(v=>text(v,100)).filter(Boolean))];if(input.scope==='film')catalogStore().upsert({id:row.id,collections:tags});else if(input.scope==='list'){if(!text(input.title,200))throw Error('Name the list.');d.listTags=[...(d.listTags||[]).filter(r=>r.id!==input.recordId),{id:input.recordId||randomUUID(),title:text(input.title,200),tags}].slice(-100);}else{const key=input.scope==='diary'?'diary':'reviews';const index=d[key].findIndex(r=>(r.recordId||M.hash([input.scope,r.title,r.year,r.watchedDate,r.review]))===row.id);d[key][index].tags=tags;}save(d);return {ok:true};}
        case 'taste-quiz': {const data=load(),quiz=input.quiz===null?null:require('./taste-quiz').validate(input.quiz);data.tasteProfile={...data.tasteProfile,quiz};save(data);return {ok:true,taste:publicState(data).taste};}
        case 'taste-profile':return {ok:true,taste:tasteOf(load())};
        case 'taste-recommendations':{
          if(input.kind!==undefined&&!['film','series'].includes(input.kind)||input.maxDuration!==undefined&&(!Number.isFinite(input.maxDuration)||input.maxDuration<=0||input.maxDuration>1440)||input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1||input.limit>12)||input.exploration!==undefined&&typeof input.exploration!=='boolean')throw Error('Invalid recommendation conditions / Geçersiz öneri koşulları.');
          const data=load(),items=tasteCatalog(),taste=require('./media-taste').profile(data.diary,items,data.tasteProfile||{},Array.isArray(data.reviews)?data.reviews:[]),recommendations=require('./media-taste').recommend(items,taste,{kind:input.kind,maxDuration:input.maxDuration,limit:input.limit??6,exploration:input.exploration});
          return {ok:true,recommendations,evidenceRevision:taste.evidenceRevision,preferencesRevision:taste.preferencesRevision,coverage:taste.coverage,preferencesConfigured:taste.preferencesConfigured};
        }
        case 'taste-preferences': { const data=load();updateTastePreferences(data,input);save(data);return {ok:true,taste:tasteOf(data)}; }
        case 'taste-analysis': { const data=load();if(input.expectedEvidenceRevision!==undefined&&input.expectedEvidenceRevision!==tasteOf(data).evidenceRevision)throw Object.assign(Error('Review evidence changed; prepare a new sample / Yorum kanıtları değişti; yeni bir örnek hazırlayın.'),{stale:true});const analysis=require('./media-taste').validateAnalysis(input.analysis,[...data.diary,...(Array.isArray(data.reviews)?data.reviews:[])]);data.tasteProfile={...data.tasteProfile,analysis};save(data);return {ok:true,analysis,taste:tasteOf(data)}; }
        default: throw Error('Unsupported media shelf action.');
      }
    } catch (error) { const parts=String(error.message).split(' / ');return { ok: false,...(error.stale?{stale:true}:{}), error:parts.length>1?(input.locale==='tr'?parts.slice(1).join(' / '):parts[0]):error.message }; }
  });
}
module.exports = { registerMediaShelf, csvPlan, urlOf, readReviewTaste };
