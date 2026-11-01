'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const M=require('./catalog-library-model'),{sourceOf}=require('./media-catalog-store'),folders=require('./catalog-folder-diff');
function createCatalogLibrary({store,dialog,owner,inspectMedia,sourceKey,visible,pythonPath,dialogText}){
 const uiText=(en,tr)=>dialogText?dialogText(tr,en):en;
 const errors={
  'Library title no longer exists.':'Katalog yapımı artık yok.',
  'Preview expired; scan again.':'Önizleme sona erdi; yeniden tarayın.',
  'Library title changed; review it again.':'Katalog yapımı değişti; yeniden inceleyin.',
  'This file is already attached to this title.':'Bu dosya zaten bu yapıma bağlı.',
  'Unsupported local media path.':'Desteklenmeyen yerel medya yolu.',
  'Choose the edition before adding a part.':'Parça eklemeden önce sürümü seçin.',
  'Choose a physical NFO file up to 2 MB.':'En fazla 2 MB fiziksel bir NFO dosyası seçin.',
  'NFO title type does not match this library title.':'NFO yapım türü bu katalog kaydıyla eşleşmiyor.',
  'NFO provider identity conflicts with this work. Choose a matching NFO; nothing was changed.':'NFO sağlayıcı kimliği bu yapımla çakışıyor. Eşleşen bir NFO seçin; hiçbir şey değişmedi.',
  'The scan is incomplete or files are still changing. Wait, then scan again.':'Tarama eksik veya dosyalar hâlâ değişiyor. Bekleyip yeniden tarayın.',
  'Folder changed since preview. Scan again.':'Klasör önizlemeden sonra değişti. Yeniden tarayın.',
  'NFO document types and entities are not allowed.':'NFO içinde belge türü ve dış varlık tanımları kabul edilmez.',
  'NFO exceeds 2 MB.':'NFO 2 MB sınırını aşıyor.',
  'Unsupported NFO root.':'NFO belge türü desteklenmiyor.',
  'Conflicting NFO provider identities.':'NFO içinde çakışan sağlayıcı kimlikleri var.',
  'Choose an accessible physical library folder.':'Erişilebilir fiziksel bir kütüphane klasörü seçin.',
 };
 const previews=new Map(),item=id=>{const row=store().get(id);if(!row)throw Error('Library title no longer exists.');return row;};
 const remember=(event,row)=>{for(const [key,p]of previews)if(Date.now()-p.created>900000)previews.delete(key);if(previews.size>=8)previews.delete(previews.keys().next().value);const token=randomUUID();previews.set(token,{...row,sender:event.sender.id,created:Date.now()});return token;};
 const take=(event,token,type)=>{const row=previews.get(token);if(!row||row.sender!==event.sender.id||row.type!==type||Date.now()-row.created>900000)throw Error('Preview expired; scan again.');return row;};
 const unchanged=(before)=>{const current=item(before.id);if(JSON.stringify(current)!==JSON.stringify(before))throw Error('Library title changed; review it again.');return current;};
 async function pick(title,extensions,properties=['openFile']){const result=await dialog.showOpenDialog(owner(),{title,properties,filters:extensions?[{name:title,extensions}]:undefined});return result.canceled?null:result.filePaths?.[0]||null;}
 function media(file,current){const value=inspectMedia(file),source=sourceOf({type:'local',value});if(!source)throw Error('Unsupported local media path.');if(M.allSources(current).some(row=>sourceKey(row)===sourceKey(source)))throw Error('This file is already attached to this title.');return {...source,watchKey:sourceKey(source)};}
 return async function handle(event,input){
  if(!String(input.action||'').startsWith('library-'))return null;
  try { switch(input.action){
   case 'library-cancel':{const row=previews.get(input.token);if(row?.sender===event.sender.id)previews.delete(input.token);return {ok:true};}
   case 'library-field-locks':{const current=item(input.id);if(!Array.isArray(input.fields)||input.fields.some(key=>!M.FIELD_LOCKS.includes(key)))throw Error('Unknown metadata field lock.');return {ok:true,item:visible(store().upsert({id:current.id,fieldLocks:input.fields}))};}
   case 'library-add-edition':
   case 'library-add-part':
   case 'library-add-extra':{
    const before=item(input.id);if(before.kind!=='film')throw Error('Edition and movie-part controls apply to films.');const file=await pick(uiText('Choose local edition, part or extra','Sürüm, parça veya ek video seç'),['mp4','mkv','webm','avi','mov','m4v','ts']);if(!file)return {ok:false,canceled:true};const current=unchanged(before),source=media(file,current),id=randomUUID(),label=String(input.label||path.basename(file)).trim().slice(0,160);let patch;
    if(input.action==='library-add-edition')patch={editions:[...(current.editions||[]),{id,label,cut:String(input.cut||'').slice(0,160),source,parts:[]}]};
    else if(input.action==='library-add-extra')patch={extras:[...(current.extras||[]),{id,title:label,kind:M.EXTRA_KINDS.includes(input.kind)?input.kind:'other',source}]};
    else {if(!current.editions.some(row=>row.id===input.editionId))throw Error('Choose the edition before adding a part.');patch={editions:current.editions.map(row=>row.id===input.editionId?{...row,parts:[...row.parts,{id,label,source}]}:row)};}
    return {ok:true,item:visible(store().upsert({id:current.id,...patch}))};
   }
   case 'library-remove-source':{
    const current=item(input.id),key=input.sourceId,editions=current.editions.filter(row=>row.id!==key).map(row=>({...row,parts:row.parts.filter(part=>part.id!==key)})),extras=current.extras.filter(row=>row.id!==key);return {ok:true,item:visible(store().upsert({id:current.id,editions,extras,selectedEditionId:current.selectedEditionId===key?'':current.selectedEditionId}))};
   }
   case 'library-move-part':{const current=item(input.id),edition=current.editions.find(row=>row.id===input.editionId);if(!edition)throw Error('Edition not found.');const parts=[...edition.parts],at=parts.findIndex(row=>row.id===input.partId),to=at+(input.direction===-1?-1:1);if(at<0||to<0||to>=parts.length)throw Error('Part cannot move there.');[parts[at],parts[to]]=[parts[to],parts[at]];return {ok:true,item:visible(store().upsert({id:current.id,editions:current.editions.map(row=>row.id===edition.id?{...row,parts}:row)}))};}
   case 'library-select-edition':{const current=item(input.id);return {ok:true,item:visible(store().upsert({id:current.id,selectedEditionId:input.editionId||''}))};}
   case 'library-nfo-preview':{
    const before=item(input.id),file=await pick(uiText('Preview local NFO','Yerel NFO önizle'),['nfo']);if(!file)return {ok:false,canceled:true};unchanged(before);const stat=fs.lstatSync(file),real=fs.realpathSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>2000000||path.dirname(real).toLowerCase()!==fs.realpathSync(path.dirname(file)).toLowerCase())throw Error('Choose a physical NFO file up to 2 MB.');
    const xml=fs.readFileSync(real,'utf8'),{run}=require('./browser-media-tools'),data=JSON.parse(await run(pythonPath(),[path.join(__dirname,'../backend/catalog_nfo.py')],JSON.stringify({xml}),null,10000));unchanged(before);if(data.error)throw Error(data.error);if(data.kind!==before.kind)throw Error('NFO title type does not match this library title.');
    const conflicts=['imdbId','tmdbId'].filter(key=>before[key]&&data.patch[key]&&before[key]!==data.patch[key]);const fields=Object.keys(data.patch).map(key=>({key,before:before[key],after:data.patch[key],locked:before.fieldLocks.includes(key)}));return {ok:true,fields,conflicts,warnings:data.warnings||[],token:remember(event,{type:'nfo',before,patch:data.patch,conflicts}),sourceName:path.basename(real)};
   }
   case 'library-nfo-apply':{const data=take(event,input.token,'nfo'),current=unchanged(data.before);if(data.conflicts.length)throw Error('NFO provider identity conflicts with this work. Choose a matching NFO; nothing was changed.');if(!Array.isArray(input.fields))throw Error('Choose metadata fields.');const patch=Object.fromEntries(input.fields.filter(key=>M.FIELD_LOCKS.includes(key)&&Object.hasOwn(data.patch,key)).map(key=>[key,data.patch[key]]));const saved=store().upsert({id:current.id,...M.lockedPatch(current,patch)});previews.delete(input.token);return {ok:true,item:visible(saved)};}
   case 'library-folder-preview':{const root=await pick(uiText('Compare library folder','Kütüphane klasörünü karşılaştır'),null,['openDirectory']);if(!root)return {ok:false,canceled:true};const current=await folders.inventory(root),previous=store().folderSnapshot(current.root);return {ok:true,...current,...folders.diff(previous?.rows,current),firstScan:!previous,token:remember(event,{type:'folder',snapshot:current})};}
   case 'library-folder-accept':{const data=take(event,input.token,'folder'),snapshot=data.snapshot;if(snapshot.incomplete||snapshot.rows.some(row=>row.unstable))throw Error('The scan is incomplete or files are still changing. Wait, then scan again.');const current=await folders.inventory(snapshot.root);const signature=rows=>JSON.stringify(rows.map(({unstable,...row})=>row));if(current.incomplete||signature(current.rows)!==signature(snapshot.rows))throw Error('Folder changed since preview. Scan again.');store().saveFolderSnapshot(snapshot.root,snapshot.rows);previews.delete(input.token);return {ok:true};}
   default:throw Error('Unknown library action.');
  }} catch(error) { let message=error.message;try{message=JSON.parse(message).error||message;}catch(_){}throw Error(uiText(message,errors[message]||message)); }
 };
}
module.exports={createCatalogLibrary};
