'use strict';
const fs = require('node:fs');
const { atomicWriteFileSync } = require('./fsync-utils');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { canonicalWatchKey } = require('./watch-library-store');

function registerMediaCatalogService({ ipcMain, dialog, owner, authorized, userData, pythonPath,
  inspectMedia, grantMedia, watchItems, nativeImage, restart, canRestore, dialogText, mediaShelf, metadataSettings = () => ({}), translateSynopsis }) {
  let catalog;
  const previews = new Map();
  const posterCache = new Map();
  const store = () => catalog ||= require('./media-catalog-store').createMediaCatalogStore({ filePath: path.join(userData(), 'media-catalog.json') });
  if (mediaShelf) require('./media-shelf-service').registerMediaShelf({
    ipcMain, dialog, owner, authorized, userData, pythonPath, inspectMedia, grantMedia, nativeImage,
    catalogStore: store, ...mediaShelf,
  });
  const discovery = mediaShelf && require('./media-discovery-service').registerMediaDiscovery({ ipcMain, authorized, userData, nativeImage, catalogStore: store, translateSynopsis });
  const sourceKey = source => source ? canonicalWatchKey(source.type === 'local'
    ? 'file:' + source.value : 'browser:' + source.value) : '';
  const historyIndex = history => new Map((Array.isArray(history) ? history : [])
    .map(item => [canonicalWatchKey(item.key), item]));
  const progress = (source, history) => {
    const found = history instanceof Map ? history.get(sourceKey(source))
      : (Array.isArray(history) ? history.find(item => canonicalWatchKey(item.key) === sourceKey(source)) : null);
    return found ? { position: Number(found.position) || 0, duration: Number(found.duration) || 0, completed: !!found.completed,
      assets: { subtitles: (found.subtitlePaths || []).length, translation: !!(found.prefs?.secondSubPath || found.prefs?.selectedSubRole === 'translation'),
        dub: !!found.prefs?.dubPlayback, speed: Number(found.prefs?.speed) || 1 } } : null;
  };
  function visible(item, history = watchItems(), titles = require('./personal-media-state').readFeedback(userData()).titles,alternates=require('./film-watch-service').additionalSourceReader(userData(),store().list())) {
    if (!item) return null;
    const { posterPath, ...row } = item;
    const personalMedia=require('./personal-media-state').personal(item,titles,history instanceof Map?[...history.values()]:history,alternates(item));
    return { ...row,personalMedia, synopsisTr:row.synopsisTrSource===require('./catalog-synopsis').synopsisHash(row.synopsis)?row.synopsisTr:'', hasPoster: !!posterPath && fs.existsSync(posterPath), progress: progress(require('./catalog-library-model').playbackSource(row).source, history),
      editions: (row.editions||[]).map(edition=>({...edition,progress:progress(edition.source,history),parts:edition.parts.map(part=>({...part,progress:progress(part.source,history)}))})),
      extras: (row.extras||[]).map(extra=>({...extra,progress:progress(extra.source,history)})),
      episodes: (row.episodes || []).map(ep => ({ ...ep, progress: progress(ep.source, history) })) };
  }
  function found(id) {
    const item = store().get(id);
    if (!item) throw new Error('Katalog kaydı bulunamadı.');
    return item;
  }
  // Yerel dosya seçici başlıkları arayüz dilini izler (EN'de TR kalıyordu).
  const chooseTitles = new Map([
    ['Oynatılacak video dosyasını seç', 'Choose the video file to play'],
    ['Afiş seç', 'Choose a poster image'],
    ['İçe aktarılan kayıt için video dosyasını doğrulayın', 'Verify a video file for the imported record'],
    ['nMDB arşiv veritabanını seç', 'Choose the nMDB archive database'],
  ]);
  async function choose(title, extensions) {
    const label = dialogText ? dialogText(title, chooseTitles.get(title) || title) : title;
    const result = await dialog.showOpenDialog(owner(), { title: label, properties: ['openFile'], filters: [{ name: label, extensions }] });
    return result.canceled ? null : result.filePaths?.[0] || null;
  }
  function imageFor(filePath, width = 240) {
    if (!filePath) return '';
    try {
      const real = fs.realpathSync(filePath), stat = fs.statSync(real);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || !/\.(png|jpe?g|webp|avif)$/i.test(real)) return '';
      const key = `${real}|${stat.mtimeMs}|${stat.size}|${width}`;
      if (posterCache.has(key)) return posterCache.get(key);
      const img = nativeImage.createFromPath(real);
      if (img.isEmpty()) return '';
      const image = img.resize({ width, quality: 'good' }).toDataURL();
      if (image.length > 2 * 1024 * 1024) return '';
      posterCache.set(key, image);
      if (posterCache.size > 100) posterCache.delete(posterCache.keys().next().value);
      return image;
    } catch { return ''; }
  }
  function removeOwnedPoster(filePath) {
    if (!filePath) return false;
    try {
      const real = fs.realpathSync(filePath);
      const folder = fs.realpathSync(path.join(userData(), 'catalog-posters'));
      if (path.dirname(real).toLowerCase() !== folder.toLowerCase()) return false;
      fs.unlinkSync(real); return true;
    } catch { return false; }
  }
  function patchSource(id, episodeId, source) {
    const item = found(id);
    if (!episodeId) return store().upsert({ id, source });
    if (!item.episodes.some(ep => ep.id === episodeId)) throw new Error('Bölüm bulunamadı.');
    return store().upsert({ id, episodes: item.episodes.map(ep => ep.id === episodeId ? { ...ep, source } : ep) });
  }
  const library = require('./catalog-library-service').createCatalogLibrary({store,dialog,owner,inspectMedia,sourceKey,visible,pythonPath,dialogText});
  const extension = require('./catalog-extensions').createCatalogExtensions({ store, userData, pythonPath, dialog, owner, visible, nativeImage, restart, canRestore, removeOwnedPoster, dialogText, metadataSettings });
  const metadataSync = require('./catalog-metadata-sync').createMetadataSync({store,settings:metadataSettings,userData,
    complete:(id,signal)=>extension({sender:{id:-1}},{action:'metadata-complete-missing',id},{automatic:true,signal})});
  const synopsisTranslation=require('./catalog-synopsis').createSynopsisTranslation({store,translate:translateSynopsis});
  const backgrounds=new Map();
  ipcMain.handle('media-catalog:request', async (event, request) => {
    if (!authorized(event)) return { ok: false, error: 'Yetkisiz istek.' };
    const input = request && typeof request === 'object' ? request : {};
    try {
      if(input.action==='synopsis-stop')return synopsisTranslation.stop(input.id,input.token);
      if(input.action==='synopsis-translate'){const result=await synopsisTranslation.start(input.id,input.token);return result.item?{...result,item:visible(result.item)}:result;}
      if(input.action==='metadata-sync')return {ok:true,...(input.mode==='cancel'?metadataSync.cancel():input.mode==='status'?metadataSync.snapshot():metadataSync.start({retry:input.retry===true}))};
      if(input.action==='backdrop'){
        const item=found(input.id);if(!item.backdrop)return {ok:true,image:''};
        if(backgrounds.has(item.backdrop))return {ok:true,image:backgrounds.get(item.backdrop)};
        const response=await fetch('https://image.tmdb.org/t/p/w1280'+item.backdrop,{signal:AbortSignal.timeout(20000),redirect:'error'});
        if(!response.ok)throw Error('Arka plan görseli alınamadı.');
        const buffer=await require('./catalog-discovery').readLimitedBytes(response,8e6,'Görsel');
        const image=nativeImage.createFromBuffer(buffer);if(image.isEmpty())throw Error('Görsel biçimi geçersiz.');
        const data=image.resize({width:1280}).toDataURL();backgrounds.set(item.backdrop,data);while(backgrounds.size>8)backgrounds.delete(backgrounds.keys().next().value);
        return {ok:true,image:data};
      }
      const libraryResult = await library(event,input); if(libraryResult)return libraryResult;
      const extra = await extension(event, input); if (extra) return extra;
      switch (input.action) {
        case 'facets': {const M=require('./media-source-mechanisms'),rows=M.filterCatalog(store().list(),input.filter||{});if(input.filter?.certification?.unknown==='separate')rows.sort((a,b)=>(M.certification(a,input.filter.certification).state==='unknown')-(M.certification(b,input.filter.certification).state==='unknown'));return {ok:true,...M.facets(rows,['genres','directors','collections']),items:rows.slice(0,100).map(row=>({...row,certificationResult:M.certification(row,input.filter?.certification||{})})),certification:input.filter?.certification||null};}
        case 'time-plan': {const M=require('./media-source-mechanisms');if(!Array.isArray(input.itemIds)||input.itemIds.length>200)throw Error('Choose up to 200 catalog titles.');const rows=input.itemIds.map(id=>found(id));return {ok:true,...M.timePlan(rows,input)};}
        case 'list': {
          const history = watchItems();
          const index = historyIndex(history);
          const titles=require('./personal-media-state').readFeedback(userData()).titles,items=store().list(),alternates=require('./film-watch-service').additionalSourceReader(userData(),items);return { ok: true, items: items.map(item => visible(item, index,titles,alternates)) };
        }
        case 'save': {
          const raw = input.item || input.patch || {};
          const previous = raw.id ? found(raw.id) : null;
          // Native seçici veya kayıtlı içe aktarım dışında renderer dosya yolu veremez.
          const patch = Object.fromEntries(['id', 'kind', 'title', 'year', 'synopsis', 'imdbId', 'tmdbId', 'watchStatus', 'favorite','genres','directors','certifications']
            .filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
          if (raw.ratings && typeof raw.ratings === 'object') patch.ratings = { ...(previous?.ratings || {}), personal: raw.ratings.personal };
          if (Array.isArray(raw.episodes)) {
            patch.episodes = raw.episodes.map(ep => ({
              id: ep.id, season: ep.season, number: ep.number, title: ep.title, watchStatus: ep.watchStatus, airDate: ep.airDate,
              // Stable episode IDs preserve an explicitly selected source when renumbered.
              source: previous?.episodes?.find(old => old.id === ep.id)?.source || null,
            }));
          }
          return { ok: true, item: visible(store().upsert(patch)) };
        }
        case 'remove': {
          const previous = found(input.id);
          store().remove(input.id);
          removeOwnedPoster(previous.posterPath);
          return { ok: true };
        }
        case 'source-file': {
          found(input.id);
          const file = await choose('Oynatılacak video dosyasını seç', ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'ts']);
          if (!file) return { ok: false, canceled: true };
          const value = inspectMedia(file);
          if(!require('./media-catalog-store').sourceOf({type:'local',value}))throw Error('This local path is not supported by the catalog. No source was changed. / Bu yerel yol katalogda desteklenmiyor; kaynak değiştirilmedi.');
          return { ok: true, item: visible(patchSource(input.id, input.episodeId, { type: 'local', value, watchKey: sourceKey({ type: 'local', value }) })) };
        }
        case 'source-url': {
          const url = new URL(String(input.url || ''));
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Geçerli bir http/https video sayfası adresi girin.');
          const key = sourceKey({ type: 'browser', value: url.href });
          const value = new URL(require('./browser-place-url').redactUrlSensitiveParams(url.href));
          return { ok: true, item: visible(patchSource(input.id, input.episodeId, { type: 'browser', value: value.href, watchKey: key })) };
        }
        case 'poster-file': {
          found(input.id);
          const file = await choose('Afiş seç', ['png', 'jpg', 'jpeg', 'webp']);
          if (!file) return { ok: false, canceled: true };
          const image = imageFor(file);
          if (!image) throw new Error('En fazla 8 MB boyutunda geçerli bir afiş seçin.');
          const folder = path.join(userData(), 'catalog-posters'); fs.mkdirSync(folder, { recursive: true });
          const previousPoster = found(input.id).posterPath; // Recheck after the asynchronous picker, before writing a file.
          const target = path.join(folder, randomUUID() + '.png');
          atomicWriteFileSync(target, nativeImage.createFromDataURL(image).toPNG(), { encoding: 'utf8' });
          try {
            const saved = store().upsert({ id: input.id, posterPath: target });
            if (previousPoster && previousPoster !== target) removeOwnedPoster(previousPoster);
            return { ok: true, item: { ...visible(saved), posterImage: image } };
          }
          catch (error) { fs.unlinkSync(target); throw error; }
        }
        case 'poster': return { ok: true, image: imageFor(found(input.id).posterPath,input.large===true?500:240) };
        case 'play': {
          const item = found(input.id);
          const episode = input.episodeId ? item.episodes.find(ep => ep.id === input.episodeId) : null;
          if (input.episodeId && !episode) throw new Error('Bölüm bulunamadı.');
          let choice = episode ? null : require('./catalog-library-model').playbackSource(item,input);
          if(choice?.editionId&&!choice.extraId&&!Object.hasOwn(input,'partId')){
            const edition=item.editions.find(row=>row.id===choice.editionId),sequence=[{id:'',source:edition.source},...edition.parts],playbackHistory=historyIndex(watchItems());
            const resume=sequence.find(row=>{const p=progress(row.source,playbackHistory);return p?.position>0&&!p.completed;})||sequence.find(row=>!progress(row.source,playbackHistory)?.completed)||sequence[0];
            if(resume.id)choice=require('./catalog-library-model').playbackSource(item,{editionId:edition.id,partId:resume.id});
          }
          let source = episode ? episode.source : choice.source;
          if (!source) throw new Error('Önce video dosyası veya browser bağlantısı ekleyin.');
          let value = source.value;
          if (source.type === 'local') {
            if (source.imported === true) {
              // Paketten gelen yol bu makinede seçilmedi: sessiz grant yerine
              // kullanıcıya dosyayı bir kez gösterip seçimini al.
              const picked = await choose('İçe aktarılan kayıt için video dosyasını doğrulayın', ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'ts']);
              if (!picked) return { ok: false, canceled: true };
              value = inspectMedia(picked);
              if(JSON.stringify(found(item.id))!==JSON.stringify(item))throw Error('Library source changed; choose it again.');
              const replacement={type:'local',value,watchKey:sourceKey({type:'local',value})};
              let patched;
              if(choice?.extraId)patched=store().upsert({id:item.id,extras:item.extras.map(row=>row.id===choice.extraId?{...row,source:replacement}:row)});
              else if(choice?.editionId)patched=store().upsert({id:item.id,editions:item.editions.map(row=>row.id!==choice.editionId?row:choice.partId?{...row,parts:row.parts.map(part=>part.id===choice.partId?{...part,source:replacement}:part)}:{...row,source:replacement})});
              else patched=patchSource(input.id,input.episodeId||null,replacement);
              source=input.episodeId?patched.episodes.find(ep=>ep.id===input.episodeId)?.source:require('./catalog-library-model').playbackSource(patched,choice).source;
            }
            value = inspectMedia(value);
            if (!grantMedia(value)) throw new Error('Video dosyası açılamadı.');
          }
          else {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Video bağlantısı geçersiz.');
          }
          const key = sourceKey({ ...source, value });
          const history = watchItems(), existing = history.find(row => canonicalWatchKey(row.key) === key);
          const resume = episode ? require('./personal-media-state').personal(item, {}, history,require('./film-watch-service').additionalSourceReader(userData(),store().list())(item)).effectiveResume : null;
          const exactManual = resume?.origin === 'manual' && resume.episodeId === episode?.id;
          return { ok: true, watchItem: { ...(existing || {}), key, type: source.type,
            ...(exactManual?{manualResumeUpdatedAt:resume.updatedAt}:{}),
            title: episode ? `${item.title} · S${episode.season} B${episode.number}` : item.title + (choice?.label?' · '+choice.label:''),
            sourceRef: value, localPath: source.type === 'local' ? value : '', position: exactManual ? resume.positionSeconds : existing?.completed ? 0 : Number(existing?.position) || 0 } };
        }
        case 'import-preview': {
          const dbPath = await choose('nMDB arşiv veritabanını seç', ['db', 'sqlite', 'sqlite3']);
          if (!dbPath) return { ok: false, canceled: true };
          const parsed = await require('./nmdb-catalog-import').previewNmdbImport({ dbPath, pythonPath: pythonPath() });
          const plan = store().previewImport(parsed.items);
          const token = randomUUID();
          for (const [id, preview] of previews) if (Date.now() - preview.created > 15 * 60 * 1000) previews.delete(id);
          if (previews.size >= 3) previews.delete(previews.keys().next().value);
          previews.set(token, { created: Date.now(), sender: event.sender.id, items: parsed.items });
          const history = watchItems(),titles=require('./personal-media-state').readFeedback(userData()).titles,alternates=require('./film-watch-service').additionalSourceReader(userData(),store().list());
          return { ok: true, token, items: parsed.items.map(item=>visible(item,history,titles,alternates)), conflicts: plan.conflicts || [],
            warnings: parsed.warnings || [], summary: plan };
        }
        case 'import-apply': {
          const preview = previews.get(input.token);
          if (!preview || preview.sender !== event.sender.id || Date.now() - preview.created > 15 * 60 * 1000) throw new Error('İçe aktarım önizlemesi sona erdi; yeniden dosya seçin.');
          if (!Array.isArray(input.ids) || !input.ids.length) throw new Error('En az bir kayıt seçin.');
          const result = store().mergeImport(preview.items, { selectedIds: input.ids });
          previews.delete(input.token);
          return { ok: true, summary: result };
        }
        case 'import-cancel': {
          const preview = previews.get(input.token);
          if (preview?.sender === event.sender.id) previews.delete(input.token);
          return { ok: true };
        }
        default: throw new Error('Bilinmeyen katalog işlemi.');
      }
    } catch (error) {
      const message = error.code === 'ENOENT' ? 'Dosya bulunamadı. Oynatma kaynağını yeniden bağlayın.'
        : ['EACCES', 'EPERM'].includes(error.code) ? 'Dosyaya erişilemiyor. Dosyanın açık ve erişilebilir olduğunu kontrol edin.'
        : error.code === 'ERR_INVALID_URL' ? 'Geçerli bir http/https video sayfası adresi girin.'
        : error.message || 'Katalog işlemi tamamlanamadı.';
      return { ok: false, error: message };
    }
  });
  return {store,metadataSync,discovery};
}
module.exports = { registerMediaCatalogService };
