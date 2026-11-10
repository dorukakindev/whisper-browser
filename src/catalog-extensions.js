'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { scanFolder, createMetadataClient, readLimitedBytes } = require('./catalog-discovery');
const { atomicWriteFileSync } = require('./fsync-utils');
const { metadataComplete } = require('./catalog-metadata-completeness');
function createCatalogExtensions({ store, userData, pythonPath, dialog, owner, visible, nativeImage, restart, canRestore = () => true, removeOwnedPoster = () => false, dialogText, metadataSettings = () => ({}), modelRoots }) {
  const dl = dialogText || ((tr) => tr);
  const client = createMetadataClient(undefined,{language:()=>metadataSettings().language||'tr-TR'}), previews = new Map();
  let restoring=false;
  const maintenance=require('./workspace-maintenance').create({root:userData,modelRoots});
  function remember(event, data) {
    for (const [key, row] of previews) if (Date.now() - row.created > 900000) previews.delete(key);
    if (previews.size >= 4) previews.delete(previews.keys().next().value);
    const token = randomUUID(); previews.set(token, { ...data, sender: event.sender.id, created: Date.now() }); return token;
  }
  function take(event, token, type) {
    const row = previews.get(token);
    if (!row || row.sender !== event.sender.id || row.type !== type || Date.now() - row.created > 900000) throw new Error('Önizleme sona erdi; yeniden başlatın.');
    return row;
  }
  return async function handle(event, input, context = {}) {
    const signal=context.signal;signal?.throwIfAborted();
    const item = () => { const value = store().get(input.id); if (!value) throw new Error('Eser bulunamadı.'); return value; };
    switch (input.action) {
      case 'maintenance-inspect': return {ok:true,...maintenance.inspect(),recoveries:require('./workspace-restore-journal').list(userData())};
      case 'maintenance-preview': {const plan=maintenance.preview(input.scopes);return {ok:true,token:remember(event,{type:'cleanup',plan}),bytes:plan.bytes,count:plan.files.length};}
      case 'maintenance-apply': {const {plan}=take(event,input.token,'cleanup');if(!canRestore()||restoring)throw Error(dl('Önce çalışan işleri bitir.','Finish running jobs first.'));const result=maintenance.clean(plan);previews.delete(input.token);return {ok:true,...result};}
      case 'recovery-preview': {const plan=require('./workspace-restore-journal').preview(userData(),input.id);return {ok:true,token:remember(event,{type:'recovery',plan}),id:plan.id,state:plan.state,files:plan.files.map(({name,state})=>({name,state}))};}
      case 'recovery-apply': {const {plan}=take(event,input.token,'recovery');if(!canRestore()||restoring)throw Error(dl('Önce çalışan işleri bitir.','Finish running jobs first.'));const result=require('./workspace-restore-journal').recover(userData(),plan.id,plan.revision);previews.delete(input.token);restart();return {ok:true,...result};}
      case 'metadata-complete-missing':{
        const current=item(),hasPoster=!!current.posterPath&&fs.existsSync(current.posterPath);if(metadataComplete(current))return {ok:true,skipped:true,item:visible(current)};
        const credential=metadataSettings().apiKey;if(!credential)throw new Error('Önce Ayarlar → Film bilgileri ve afişler bölümüne TMDB anahtarını kaydedin.');
        const providerId=await client.resolve(current,credential,{automatic:context.automatic===true,signal});
        if(JSON.stringify(item())!==JSON.stringify(current))throw new Error('Yapım bilgileri değişti; yeniden başlatın.');
        const preview=await handle(event,{action:'metadata-preview',id:current.id,providerId,credential},context);
        const protectedFields=new Set(require('./metadata-evidence').fieldsOf(current,'catalog').filter(f=>f.protected).map(f=>f.key));
        const fields=['synopsis','genres','cast','runtime','originalTitle','originalLanguage','productionCountries','directorIds','directorPeople','directorsTruncated','year','imdbId','directors','tagline','backdrop','tmdbRating','tmdbVotes'].filter(key=>Array.isArray(current[key])?!current[key].length:!current[key]);for(let i=fields.length-1;i>=0;i--)if(protectedFields.has(fields[i]))fields.splice(i,1);if(!hasPoster&&!protectedFields.has('posterPath'))fields.push('poster');
        return handle(event,{action:'metadata-apply',token:preview.token,fields},context);
      }
      case 'folder-preview': {
        const choice = await dialog.showOpenDialog(owner(), { title: dl('Film ve dizi klasörünü seç', 'Choose a movies & series folder'), properties: ['openDirectory'] });
        if (choice.canceled || !choice.filePaths?.[0]) return { ok: false, canceled: true };
        const data = await scanFolder(choice.filePaths[0], pythonPath());
        // Kuyruk maddesi 21 — "yeni/değişen"in yanında "kaybolan" da ayrı
        // görünür: katalogda kayıtlı ama taranan kök altında artık bulunamayan
        // yerel kaynaklar. Kullanıcı isterse sonradan "Yolları yeniden
        // bağla" ile düzeltir; önizleme hiçbir şeyi silmez.
        const missing = require('./media-relink-matcher').collectMissingSources(
          store().list(), choice.filePaths[0], (value) => { try { return fs.existsSync(value); } catch (_) { return false; } });
        return { ok: true, token: remember(event, { type: 'folder', ...data }), items: data.items.map(i => visible(i)), warnings: data.warnings, summary: store().previewImport(data.items), missing };
      }
      case 'folder-apply': {
        const data = take(event, input.token, 'folder');
        if (!Array.isArray(input.ids) || !input.ids.length) throw new Error('En az bir kayıt seçin.');
        const summary = store().mergeImport(data.items, { selectedIds: input.ids }); previews.delete(input.token); return { ok: true, summary };
      }
      case 'metadata-film-extras':
      case 'metadata-film-person':{
        let selected;if(input.discovery){const d=input.discovery;if(!['film','series'].includes(d.kind)||!/^tt\d{7,12}$/.test(d.id||''))throw Error('Invalid discovery identity.');selected={kind:d.kind,imdbId:d.id};}else selected=item();
        const signature=v=>JSON.stringify([v.kind,v.tmdbId,v.imdbId,v.title,v.year]),before=signature(selected);
        const guard=()=>{if(!input.discovery&&signature(item())!==before)throw Error('Film changed during metadata loading.');};
        const extras=await client.filmExtras(selected,metadataSettings().apiKey,signal);guard();
        if(input.action==='metadata-film-extras')return {ok:true,...extras};
        if(!extras.people.some(p=>p.id===input.personId))throw Error('Person does not belong to this film.');
        const person=await client.person(input.personId,metadataSettings().apiKey,signal);guard();return {ok:true,person};
      }
      case 'metadata-watch': return {ok:true,watch:await client.watchProviders(item(),metadataSettings().apiKey,input.region||metadataSettings().watchRegion||'TR',signal,{refresh:input.refresh===true})};
      case 'metadata-images': return {ok:true,...await client.images(item(),metadataSettings().apiKey,signal)};
      case 'metadata-recommendations': return {ok:true,...await client.recommendations(item(),metadataSettings().apiKey,input.page??1,signal)};
      case 'metadata-add-recommendation':{
        if(!['film','series'].includes(input.kind)||!Number.isSafeInteger(input.providerId)||input.providerId<1)throw new Error('Öneri kimliği geçersiz.');
        const tmdbId=(input.kind==='series'?'tv':'movie')+':'+input.providerId;
        const find=()=>store().list().find(row=>row.tmdbId===tmdbId&&row.kind===input.kind);let existing=find();if(existing)return {ok:true,item:visible(existing),existing:true};
        const data=await client.detail({kind:input.kind},input.providerId,metadataSettings().apiKey,signal);existing=find();
        return {ok:true,item:visible(existing||store().upsert({...data.patch,kind:input.kind,watchStatus:'planned'})),existing:!!existing};
      }
      case 'metadata-evidence': return {ok:true,...require('./metadata-evidence').report(item(),'catalog')};
      case 'metadata-refresh-preview': {
        const current=item(),match=/^(movie|tv):([1-9]\d*)$/.exec(current.tmdbId||'');if(!match||match[1]!==(current.kind==='series'?'tv':'movie'))throw Error('Match a TMDB identity first. / Önce TMDB kimliği eşleştir.');
        const data=await client.detail(current,Number(match[2]),metadataSettings().apiKey,signal),E=require('./metadata-evidence');
        if(!data.identityConfirmed||data.patch.tmdbId!==current.tmdbId||current.imdbId&&data.patch.imdbId!==current.imdbId)throw Error('Provider identity mismatch. / Sağlayıcı kimliği uyuşmuyor.');
        if(JSON.stringify(item())!==JSON.stringify(current))throw Error('Title changed; preview again. / Kayıt değişti; yeniden önizle.');
        const fields=E.fieldsOf(current,'catalog').filter(f=>f.key!=='posterPath'&&Object.hasOwn(data.patch,f.key)&&E.digest(f.value)!==E.digest(data.patch[f.key]??null)).map(f=>({...f,incoming:data.patch[f.key]??null,defaultSource:!f.protected&&E.missing(f.value)}));
        return {ok:true,fields,evidence:data.evidence,token:remember(event,{type:'metadata',id:current.id,before:JSON.stringify(current),...data,controlled:true,allowed:fields.filter(f=>!f.protected).map(f=>f.key)})};
      }
      case 'metadata-search': return { ok: true, results: await client.search(item(), (input.credential||metadataSettings().apiKey), input.query) };
      case 'metadata-preview': {
        const current = item(), data = await client.detail(current, Number(input.providerId), (input.credential||metadataSettings().apiKey),signal);
        return { ok: true, ...data, token: remember(event, { type: 'metadata', id: current.id, before: JSON.stringify(current), ...data }) };
      }
      case 'metadata-apply': {
        const data = take(event, input.token, 'metadata'), current = store().get(data.id);
        if (JSON.stringify(current) !== data.before) throw new Error('Eser önizleme sırasında değişti; yeniden eşleştirin.');
        const fields = Array.isArray(input.fields) ? input.fields : [];
        if(data.controlled&&(!Array.isArray(input.fields)||new Set(fields).size!==fields.length||fields.some(k=>!data.allowed.includes(k))))throw Error('Choose unprotected preview fields. / Korunmayan önizleme alanlarını seç.');
        const patch = { id: current.id, tmdbId: data.patch.tmdbId };
        const locks = new Set(current.fieldLocks||[]);
        const replacing=!!current.tmdbId&&current.tmdbId!==data.patch.tmdbId;
        if(replacing&&locks.size)throw new Error(dialogText ? dl('Yapım kimliğini değiştirmeden korunan metadata alanlarının kilidini açın.','Unlock protected metadata fields before changing the work identity.') : 'Unlock protected metadata fields before changing the work identity.');
        if(replacing&&input.replaceIdentity!==true)throw new Error('Farklı yapım eşleşmesini yeniden önizleyip onaylayın.');
        if(replacing){for(const key of ['originalTitle','originalLanguage','productionCountries','directorIds','directorPeople','directorsTruncated','year','synopsis','imdbId','genres','cast','runtime','directors','tagline','backdrop','tmdbRating','tmdbVotes'])patch[key]=Array.isArray(current[key])?[]:'';patch.productionCountries=null;patch.directorIds=null;patch.directorPeople=[];patch.directorsTruncated=false;patch.ratings={...current.ratings,imdb:null,letterboxd:null};patch.posterPath='';patch.synopsisTr='';patch.synopsisTrSource='';}

        for (const key of ['title', 'originalTitle', 'originalLanguage', 'productionCountries', 'directorIds', 'directorPeople', 'directorsTruncated', 'year', 'synopsis', 'imdbId', 'genres', 'cast', 'runtime', 'directors', 'tagline', 'backdrop', 'tmdbRating', 'tmdbVotes']) if (fields.includes(key) && !locks.has(key)) patch[key] = data.patch[key];
        for(const key of locks)delete patch[key];
        if (fields.includes('poster') && data.poster && !locks.has('posterPath')) {
          const response = await fetch('https://image.tmdb.org/t/p/w500' + data.poster, { signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), redirect: 'error' });
          if (!response.ok) throw new Error('Afiş indirilemedi; seçimi kaldırıp yeniden deneyin.');
          const buffer = await readLimitedBytes(response, 8e6, 'Afiş');
          const image = nativeImage.createFromBuffer(buffer); if (image.isEmpty()) throw new Error('Afiş biçimi geçersiz.');
          const folder = path.join(userData(), 'catalog-posters'); fs.mkdirSync(folder, { recursive: true });
          patch.posterPath = path.join(folder, randomUUID() + '.png');
          // Yarım afiş kalmasın — ortak temp+fsync+rename töreni.
          atomicWriteFileSync(patch.posterPath, image.resize({ width: 500 }).toPNG());
        }
        try {
          signal?.throwIfAborted();
          if (JSON.stringify(store().get(data.id)) !== data.before) throw new Error('Eser değişti; yeniden önizleyin.');
          const previousPoster = current.posterPath;
          const E=require('./metadata-evidence'),evidence=E.clean(current.metadataEvidence);if(replacing)evidence.fields={};
          if(data.controlled)for(const f of E.fieldsOf(current,'catalog'))if(!f.protected&&data.evidence?.fields?.[f.key]&&E.digest(current[f.key])===E.digest(data.patch[f.key]))evidence.fields[f.key]=data.evidence.fields[f.key];
          for(const key of Object.keys(patch))if(E.catalogFields.includes(key)&&data.evidence?.fields?.[key])evidence.fields[key]=data.evidence.fields[key];
          if(patch.posterPath)evidence.fields.posterPath={provider:'tmdb',identity:data.patch.tmdbId,at:Date.now(),valueHash:E.digest(patch.posterPath)};
          if(data.evidence?.pair)evidence.pair=data.evidence.pair;else if(replacing)evidence.pair=null;
          patch.metadataEvidence=evidence;
          const saved = store().upsert(patch);
          if ((patch.posterPath || replacing) && previousPoster && previousPoster !== patch.posterPath) removeOwnedPoster(previousPoster);
          previews.delete(input.token); return { ok: true, item: visible(saved) };
        } catch (error) { if (patch.posterPath) { try { fs.unlinkSync(patch.posterPath); } catch {} } throw error; }
      }
      case 'season-preview': {
        const current = item(), episodes = await client.season(current, Number(input.season), (input.credential||metadataSettings().apiKey));
        return { ok: true, episodes, token: remember(event, { type: 'season', id: current.id, before: JSON.stringify(current), episodes }) };
      }
      case 'season-apply': {
        const data = take(event, input.token, 'season'), current = store().get(data.id);
        if (JSON.stringify(current) !== data.before) throw new Error('Bölümler değişti; yeniden önizleyin.');
        const episodes = [...current.episodes];
        for (const next of data.episodes) {
          const index = episodes.findIndex(ep => ep.season === next.season && ep.number === next.number);
          if (index < 0) episodes.push(next); else episodes[index] = { ...episodes[index],
            airDate: next.airDate || episodes[index].airDate, title: episodes[index].title || next.title, runtime:episodes[index].runtime||next.runtime||null };
        }
        store().upsert({ id: current.id, episodes }); previews.delete(input.token); return { ok: true };
      }
      case 'package-export': {
        const result = await dialog.showSaveDialog(owner(), { title: dl('Taşınabilir çalışma paketini kaydet', 'Save portable workspace package'), defaultPath: 'whisper-calismam.wbp', filters: [{ name: dl('Whisper çalışma paketi', 'Whisper workspace package'), extensions: ['wbp'] }] });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        const report = input.includeVideos === true
          ? await require('./workspace-video-package').exportWithVideos(userData(), result.filePath, input.rendererValues, pythonPath())
          : require('./workspace-package').exportPackage(userData(), result.filePath, input.rendererValues, null, { portable: true });
        return { ok: true, ...report };
      }
      case 'package-preview': {
        const result = await dialog.showOpenDialog(owner(), { title: dl('Çalışma paketini seç', 'Choose a workspace package'), properties: ['openFile'], filters: [{ name: dl('Whisper çalışma paketi', 'Whisper workspace package'), extensions: ['wbp'] }] });
        if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
        const data = await require('./workspace-video-package').read(result.filePaths[0], pythonPath());
        // Madde 33: geri yükleme onayından önce paket kapsamını göster —
        // bölüm/kayıt sayıları meta düzeyinde (içerik değil).
        const scope = require('./workspace-package').describePackage(data, userData());
        // Kuyruk maddesi 25 — paketteki mutlak ortam yollarından bu
        // bilgisayarda bulunamayanları kök bazında göster; kullanıcı her
        // köke yeni hedef seçebilir ve eşleme geri yüklemede uygulanır.
        const packages = require('./workspace-package');
        const missingMedia = packages.missingLocalMedia(data);
        const snapshot = packages.targetSnapshot(path.resolve(userData()), data);
        return { ok: true, token: remember(event, { type: 'package', data, snapshot }), records: snapshot.map(({name,state}) => ({name,state})), count: data.files.length, videos: data.videos?.length || 0, created: data.created, scope, missingMedia };
      }
      case 'package-apply': {
        const { data, snapshot } = take(event, input.token, 'package');
        if(restoring)throw Error(dl('Geri yükleme sürüyor.','A restore is already running.'));
        restoring=true;
        try {
        const replace = input.replaceConflicts === true;
        const names = snapshot.filter(row => row.state === 'new' || replace).map(row => row.name);
        const review = { snapshot, names };
        if (!canRestore()) throw new Error('Çalışan medya işlemini bitirin veya durdurun; ardından yeniden geri yükleyin.');
        if(require('./workspace-restore-journal').list(userData()).some(r=>!['committed','rolled-back'].includes(r.state)))throw Error(dl('Önce yarım geri yüklemeyi Yedekleme alanından incele.','Review the unfinished restore in Backup first.'));
        // Kullanıcının önizlemede seçtiği ortam-kökü eşlemeleri. Yalnız
        // mutlak yollar kabul edilir ve hedefin gerçekten var olan bir
        // klasör olması gerekir — yazım hatası kayıtları ölü yola bağlardı.
        const mediaMappings = [];
        for (const pair of Array.isArray(input.mediaMappings) ? input.mediaMappings.slice(0, 20) : []) {
          if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Ortam eşleşmesi geçersiz.');
          const [from, to] = pair;
          if (typeof from !== 'string' || from.length < 2 || from.length > 4000 ||
              typeof to !== 'string' || !to || to.length > 4000) throw new Error('Ortam eşleşmesi geçersiz.');
          if (!fs.existsSync(to) || !fs.statSync(to).isDirectory()) throw new Error(`Hedef klasör yok: ${to.slice(0, 160)}`);
          mediaMappings.push([from, to]);
        }
        const packages = require('./workspace-package');
        const videoPackage = require('./workspace-video-package');
        if (JSON.stringify(packages.targetSnapshot(path.resolve(userData()), data)) !== JSON.stringify(snapshot)) throw Error(dl('Hedef değişti. Paketi yeniden önizleyin.', 'The destination changed. Preview the package again.'));
        if (!replace && snapshot.some(row => row.state === 'conflict')) {
          previews.delete(input.token);
          return { ok: true, kept: true };
        }
        const videoFolder = await videoPackage.extract(userData(), data, pythonPath());
        const videoMappings = [...mediaMappings, ...(data.videoMappings || [])];
        if (!canRestore()) { if (videoFolder) videoPackage.clean(userData(), videoFolder); throw new Error('Yeni işlem başladı; geri yükleme iptal edildi.'); }
        let live, storageChanged = false;
        const setStorage = values => owner().webContents.executeJavaScript(`(() => {
          const values = ${JSON.stringify(values)}, previous = {};
          try { for (const [key, value] of Object.entries(values)) { previous[key] = localStorage.getItem(key); if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }
          catch (error) { for (const [key, value] of Object.entries(previous)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } throw error; }
        })()`);
        try {
          live = await owner().webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(packages.STORAGE_KEYS)}.map(key => [key, localStorage.getItem(key)]))`);
          const backup = path.join(userData(), 'before-restore-complete-' + Date.now() + '.wbp');
          packages.exportPackage(userData(), backup, live);
          const restored = packages.remapRendererValues(userData(), data, videoMappings);
          // The package can omit keys. Only explicit incoming values replace
          // live preferences or locally saved source edits.
          const incoming = Object.fromEntries(Object.entries(restored).filter(([,value])=>value!==null));
          await setStorage(incoming);
          storageChanged = true;
          if (!canRestore()) throw new Error('Yeni medya işlemi başladı; geri yükleme iptal edildi.');
          require('./workspace-package').restorePackage(userData(), data, videoMappings, review);
        } catch (error) {
          try { if (storageChanged) await setStorage(live); }
          finally { if (videoFolder) videoPackage.clean(userData(), videoFolder); }
          throw error;
        }
        previews.delete(input.token); restart(); return { ok: true };
        } finally {restoring=false;}
      }
      case 'choose-directory': {
        const pick = await dialog.showOpenDialog(owner(), { title: dl('Ortam klasörünü seç', 'Choose the media folder'), properties: ['openDirectory'] });
        if (pick.canceled || !pick.filePaths?.[0]) return { ok: false, canceled: true };
        return { ok: true, path: pick.filePaths[0] };
      }
      case 'extension-cancel': { const row = previews.get(input.token); if (row?.sender === event.sender.id) previews.delete(input.token); return { ok: true }; }
      default: return null;
    }
  };
}
module.exports = { createCatalogExtensions };
