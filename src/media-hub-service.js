'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils');
const {run}=require('./browser-media-tools');
const {canonicalWatchKey}=require('./watch-library-store');
const video=/\.(mp4|mkv|webm|avi|mov|m4v|ts|m2ts|wmv)$/i;
function versionKey(name){
 const dir=path.dirname(name),stem=path.basename(name,path.extname(name));
 const title=stem.replace(/[ ._-]+(?:2160p|1080p|1080i|720p|480p|4k|bluray|blu-ray|web-dl|webrip|bdrip|x264|x265|hevc)(?:[ ._-].*)?$/i,'').replace(/[._]+/g,' ').trim();
 return path.join(dir,title||stem).toLowerCase();
}
function registerMediaHub({app,ipcMain,authorized,dialog,owner,inspectMedia,authorizeMedia,grantMedia,catalogStore,ffmpeg,ffprobe,relinkHistory,safeStorage,prepareAudio,sourceHeaders=()=>[]}){
 const relinkUndos=new Map();
 const audioGrants=new Map();let audioPreparation=null;
 const audioError=code=>Object.assign(Error({AUDIO_SOURCE:'Reopen the current network source before preparing audio.',AUDIO_UNSUPPORTED:'Audio preparation requires a direct public HTTPS media file.',AUDIO_BUSY:'Audio preparation is already running.',BAD_REQUEST:'Invalid audio request.',AUDIO_CANCELLED:'Audio preparation cancelled.'}[code]||'Audio could not be prepared. Existing playback and subtitles were kept.'),{code});
 function networkAudioSource(url,key,event){
  const kind=url.protocol!=='https:'?'insecure':/\.(?:m3u8|mpd)$/i.test(url.pathname)?'adaptive':'ready';
  // A newly selected network address retires extraction work from the old source.
  if(audioPreparation&&audioPreparation.sender===event.sender)audioPreparation.controller.abort();
  const token=kind==='ready'?randomUUID():'';
  if(token){audioGrants.set(token,{key,url:url.href,sender:event.sender,at:Date.now()});while(audioGrants.size>24)audioGrants.delete(audioGrants.keys().next().value);}
  return {whisperAudio:kind,audioSource:{owner:'mediaHub',key,token}};
 }
 async function prepareNetworkAudio(event,input){
  const grant=audioGrants.get(input.token);
  if(!grant||grant.sender!==event.sender||grant.key!==input.key||Date.now()-grant.at>6*3600*1000)throw audioError('AUDIO_SOURCE');
  if(typeof prepareAudio!=='function')throw audioError('AUDIO_UNSUPPORTED');
  if(typeof input.requestId!=='string'||!/^[a-z0-9_-]{1,80}$/i.test(input.requestId))throw audioError('BAD_REQUEST');
  if(audioPreparation)throw audioError('AUDIO_BUSY');
  const job={id:input.requestId,sender:event.sender,controller:new AbortController(),progress:{phase:'checking',seconds:null}};audioPreparation=job;
  try{
   const result=await prepareAudio({url:grant.url,headers:sourceHeaders(grant.url),signal:job.controller.signal,onProgress:progress=>{
    job.progress={phase:progress?.phase==='extracting'?'extracting':'checking',seconds:Number.isFinite(progress?.seconds)&&progress.seconds>=0?progress.seconds:null};
   }});
   if(job.controller.signal.aborted){await prepareAudio.discard?.(result.path);throw audioError('AUDIO_CANCELLED');}
   if(!result||typeof result.path!=='string'||!result.path)throw audioError('AUDIO_FAILED');
   return {ok:true,path:result.path,key:grant.key,requestId:job.id};
  }catch(error){throw audioError(job.controller.signal.aborted||error?.code==='AUDIO_CANCELLED'?'AUDIO_CANCELLED':/^STREAM_AUDIO_[A-Z_]+$/.test(error?.code||'')?error.code:'AUDIO_FAILED');}
  finally{if(audioPreparation===job)audioPreparation=null;}
 }
 const sourceVault=new (require('./secret-store').SafeSecretStore)({filePath:path.join(app.getPath('userData'),'stream-sources.safe.json'),fields:['sources'],safeStorage});
 const streamSources=new Map();let sourcesLoaded=false,vaultWritable=false;
 function loadSources(){if(sourcesLoaded)return;sourcesLoaded=true;const saved=sourceVault.load();if(!saved.ok)return;try{const data=JSON.parse(saved.secrets.sources||'{}');if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length>2000)return;for(const [key,value]of Object.entries(data)){if(!/^stream:[a-f0-9]{64}$/.test(key)||typeof value!=='string')return;streamUrl(value);}vaultWritable=true;for(const [key,value]of Object.entries(data))streamSources.set(key,value);}catch(_){}}
 function streamUrl(raw){const url=new URL(String(raw||'').trim());if(!['https:','http:','rtsp:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)throw Error('Use an HTTP/HTTPS/RTSP media URL without embedded credentials.');return url;}
 function rememberStream(input){
  const raw=String(input.url||'').trim(),url=streamUrl(raw),hash=value=>'stream:'+createHash('sha256').update(value).digest('hex'),key=input.key||hash(url.href);
  loadSources();if(key!==hash(raw)&&key!==hash(url.href)&&streamSources.get(key)!==url.href)throw Error('Stream identity does not match its source.');
  if(!streamSources.has(key)&&streamSources.size>=2000)return {ok:true,key,persistent:false};
  streamSources.set(key,url.href);const saved=vaultWritable?sourceVault.save({sources:JSON.stringify(Object.fromEntries(streamSources))}):{ok:false};return {ok:true,key,persistent:!!saved.ok};
 }

 let metadataBusy=false;
 let relinkBusy=false;
 const sourceAt=(item,episodeId)=>episodeId?item?.episodes?.find(ep=>ep.id===episodeId)?.source:item?.source;
 function replaceSource(store,id,episodeId,source){
  const item=store.get(id);
  if(!item||(episodeId&&!item.episodes?.some(ep=>ep.id===episodeId)))throw Error('The reviewed catalog title or episode no longer exists.');
  const patch=episodeId?{id,episodes:item.episodes.map(ep=>ep.id===episodeId?{...ep,source}:ep)}:{id,source};
  store.upsertMany([patch]);
 }
 const index=()=>path.join(app.getPath('userData'),'media-folder-watches.json');let folders=[],error='';const watchers=new Map(),timers=new Map(),files=new Map(),plans=new Map();
 try{if(fs.existsSync(index())){if(fs.statSync(index()).size>200000)throw Error('Folder watch index too large.');folders=JSON.parse(fs.readFileSync(index(),'utf8'));if(!Array.isArray(folders)||folders.length>30)throw Error('Invalid folder watch index.');}}catch(e){folders=[];error=e.message;}
 const persist=()=>atomicWriteFileSync(index(),JSON.stringify(folders));
 const beneath=(file,root)=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
 async function scan(folder){
  const rows=[];const previousMetadata=new Map((files.get(folder.id)||[]).map(row=>[row.id,row.metadata]));const root=await fsp.realpath(folder.path);
  const skipped=[];
  async function walk(dir,depth){if(depth>12||rows.length>=10000)return;let entries;try{entries=await fsp.readdir(dir,{withFileTypes:true});}catch(e){if(dir===root)throw e;skipped.push({name:path.relative(root,dir),code:e.code||'read'});return;}for(const entry of entries){if(rows.length>=10000)break;if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file,depth+1);else if(entry.isFile()&&video.test(file)){let stat;try{stat=await fsp.stat(file);}catch(e){skipped.push({name:path.relative(root,file),code:e.code||'stat'});continue;}const id=createHash('sha256').update(file).digest('hex').slice(0,24);rows.push({id,path:file,name:path.relative(root,file),size:stat.size,mtime:stat.mtimeMs,...(previousMetadata.get(id)?.stamp===stat.size+':'+stat.mtimeMs?{metadata:previousMetadata.get(id)}:{})});}}}
  await walk(root,0);files.set(folder.id,rows);folder.count=rows.length;folder.scannedAt=Date.now();folder.skipped=skipped.slice(0,100);folder.error=skipped.length?skipped.length+' unreadable entries skipped / okunamayan girdi atlandı':'';return rows;
 }
 function watch(folder){if(watchers.has(folder.id))return;try{const watcher=fs.watch(folder.path,{recursive:true},()=>{clearTimeout(timers.get(folder.id));timers.set(folder.id,setTimeout(()=>scan(folder).catch(e=>{folder.error=e.message;}),1500));});watcher.on('error',e=>{folder.error=e.message;watcher.close();watchers.delete(folder.id);});watchers.set(folder.id,watcher);}catch(e){folder.error=e.message;}}
 const publicFolder=folder=>({...folder,files:(files.get(folder.id)||[]).slice(0,10000).map(row=>{
  const {metadata,...file}=row;
  return {...file,...(metadata?.stamp===row.size+':'+row.mtime?metadata:{}),versionGroup:versionKey(row.name)};
 })});
 const handle=async(event,input={})=>{if(!authorized(event))return {ok:false,error:'Unauthorized request.'};try{
  if(error)throw Error(error+' Original folder index was preserved.');
  if(input.action==='v3-export'){
   const extensions={csv:'csv',json:'json',markdown:'md',html:'html'};
   if(!Object.hasOwn(extensions,input.format)||typeof input.content!=='string'||Buffer.byteLength(input.content)>1024*1024)throw Error('Invalid comparison export.');
   const extension=extensions[input.format];
   const outputName=['dossier','timeline'].includes(input.kind)?'whisper-'+input.kind:'whisper-comparison';
   const picked=await dialog.showSaveDialog(owner(),{defaultPath:outputName+'.'+extension,filters:[{name:'Whisper output',extensions:[extension]}]});
   if(picked.canceled||!picked.filePath)return {ok:true,canceled:true};
   if(path.extname(picked.filePath).toLowerCase()!=='.'+extension)throw Error('Choose the matching comparison extension.');
   atomicWriteFileSync(picked.filePath,input.content);
   return {ok:true};
  }
  if(input.action==='v3-maintenance'){
   const titles={},exists={},roots=[];
   const beneathFolder=(folder,file)=>{const relative=path.relative(folder.path,file);return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
   for(const folder of folders.filter(f=>f.enabled)){
    const info=await fsp.stat(folder.path).catch(()=>null);
    roots.push({rootId:folder.id,accessible:info?.isDirectory()===true});
   }
   const library=catalogStore().list();
   const catalog=library.slice(0,1000).map(item=>{
    titles[item.id]=item.title;
    const source=(s,id)=>{
     if(s?.type!=='local'||s.imported===true)return null;
     const root=folders.find(f=>f.enabled&&beneathFolder(f,s.value));
     return {sourceId:id,path:s.value,rootId:root?.id||''};
    };
    const episodes=(item.episodes||[]).map(ep=>({episodeId:ep.id,sourcePath:source(ep.source,ep.id)?.path}));
    const sources=[source(item.source,item.id),...(item.episodes||[]).map(ep=>source(ep.source,ep.id))].filter(Boolean);
    return {workId:item.id,type:item.kind,title:item.title,year:item.year,episodes,sources};
   });
   const sources=catalog.flatMap(item=>item.sources);
   for(const row of sources.slice(0,1000)){
    if(!roots.some(root=>root.rootId===row.rootId&&root.accessible))continue;
    try{await fsp.stat(row.path);exists[row.path]=true;}catch(error){if(error.code==='ENOENT')exists[row.path]=false;}
   }
   const preview=require('./catalog-maintenance-model').buildMaintenancePreview({catalog,roots,exists});
   return {ok:true,preview,titles,rootChecks:roots,untrackedSources:catalog.flatMap(item=>item.sources.filter(source=>!source.rootId).map(source=>({workId:item.workId,path:source.path}))),partial:library.length>catalog.length||sources.length>1000};
  }
  if(input.action==='folders'){for(const folder of folders)if(folder.enabled){watch(folder);if(!files.has(folder.id))await scan(folder).catch(e=>{folder.error=e.message;});}return {ok:true,folders:folders.map(publicFolder)};}
  if(input.action==='folder-add'){const picked=await dialog.showOpenDialog(owner(),{properties:['openDirectory']});if(picked.canceled)return {ok:true,canceled:true};const real=await fsp.realpath(picked.filePaths[0]);let folder=folders.find(r=>r.path.toLowerCase()===real.toLowerCase());if(!folder){if(folders.length>=30)throw Error('Folder watch limit reached.');folder={id:randomUUID(),path:real,enabled:true};folders.push(folder);persist();}folder.enabled=true;persist();await scan(folder);watch(folder);return {ok:true,folder:publicFolder(folder)};}
  const folder=folders.find(r=>r.id===input.folderId);
  if(input.action==='folder-scan'){if(!folder)throw Error('Folder not found.');folder.enabled=true;persist();await scan(folder);watch(folder);return {ok:true,folder:publicFolder(folder)};}
  if(input.action==='folder-enabled'){
   if(!folder||typeof input.enabled!=='boolean')throw Error('Choose a folder and an enabled state.');
   folder.enabled=input.enabled;persist();
   if(folder.enabled){watch(folder);if(!files.has(folder.id))await scan(folder);}
   else{watchers.get(folder.id)?.close();watchers.delete(folder.id);clearTimeout(timers.get(folder.id));timers.delete(folder.id);}
   return {ok:true,folder:publicFolder(folder)};
  }
  if(input.action==='folder-remove'){if(!folder)throw Error('Folder not found.');watchers.get(folder.id)?.close();watchers.delete(folder.id);clearTimeout(timers.get(folder.id));files.delete(folder.id);folders=folders.filter(r=>r!==folder);persist();return {ok:true};}
  if(input.action==='folder-metadata'){
   if(!folder||!ffprobe||!Array.isArray(input.ids)||input.ids.length>20||input.ids.some(id=>typeof id!=='string'))throw Error('Choose up to 20 scanned files.');
   if(metadataBusy)throw Error('Metadata reading is already running.');
   metadataBusy=true;
   try{
    const selected=[...new Set(input.ids)].map(id=>(files.get(folder.id)||[]).find(row=>row.id===id));
    if(selected.some(row=>!row))throw Error('Rescan the folder before reading metadata.');
    const root=await fsp.realpath(folder.path),results=[];
    for(const row of selected){
     try{
      const real=await fsp.realpath(row.path);
      if(!beneath(real,root))throw Error('File left the selected folder.');
      const before=await fsp.stat(real),stamp=before.size+':'+before.mtimeMs;
      if(row.metadata?.stamp===stamp&&!input.retry){results.push({id:row.id,ok:!row.metadata.metadataError,error:row.metadata.metadataError});continue;}
      const probe=JSON.parse(await run(ffprobe(),['-v','error','-show_entries','format=duration:stream=codec_type:stream_tags=language','-of','json',inspectMedia(real)],null,null,10000));
      const after=await fsp.stat(real);
      if(after.size+':'+after.mtimeMs!==stamp)throw Error('Media changed while reading metadata.');
      const duration=Number(probe.format?.duration);
      const languages=[...new Set((probe.streams||[]).filter(stream=>stream.codec_type==='audio').map(stream=>String(stream.tags?.language||'').toLowerCase()).filter(code=>/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code)&&code!=='und'))].slice(0,32);
      row.size=after.size;row.mtime=after.mtimeMs;
      row.metadata={stamp,metadataRead:true,durationSeconds:Number.isFinite(duration)&&duration>0?duration:null,language:languages.length===1?languages[0]:null,spokenLanguages:languages};
      results.push({id:row.id,ok:true});
     }catch(error){
      const message=String(error.message).slice(0,300);
      row.metadata={stamp:row.size+':'+row.mtime,metadataRead:true,metadataError:message,durationSeconds:null,language:null,spokenLanguages:[]};
      results.push({id:row.id,ok:false,error:message});
     }
    }
    return {ok:true,results,folder:publicFolder(folder)};
   }finally{metadataBusy=false;}
  }
  if(input.action==='folder-play'){if(!folder)throw Error('Folder not found.');const row=files.get(folder.id)?.find(r=>r.id===input.id);if(!row)throw Error('Rescan the folder before opening this item.');const real=await fsp.realpath(row.path),root=await fsp.realpath(folder.path);if(!beneath(real,root))throw Error('File left the selected folder.');const file=inspectMedia(real);grantMedia(file);return {ok:true,path:file};}
  if(input.action==='relink-preview'){if(!folder)throw Error('Choose a folder first.');await scan(folder);const rows=files.get(folder.id)||[],patches=[];for(const item of catalogStore().list()){const all=[{source:item.source,id:item.id},...(item.episodes||[]).map(ep=>({source:ep.source,id:item.id,episodeId:ep.id}))];for(const row of all)if(row.source?.type==='local'&&row.source.imported!==true&&!fs.existsSync(row.source.value)){const hits=rows.filter(file=>path.basename(file.path).toLowerCase()===path.basename(row.source.value).toLowerCase());if(hits.length===1)patches.push({...row,old:row.source.value,next:hits[0].path,title:item.title});}}const token=randomUUID();plans.clear();plans.set(token,{patches,folderPath:folder.path,sender:event.sender.id,at:Date.now()});return {ok:true,token,patches};}
  if(input.action==='relink-apply'||input.action==='relink-undo'){
   if(relinkBusy)throw Error('A relink operation is already running.');
   relinkBusy=true;
   try{
   if(input.action==='relink-apply'){
   const plan=plans.get(input.token);if(!plan||plan.sender!==event.sender.id||Date.now()-plan.at>600000)throw Error('Relink preview expired.');
   const selected=input.selectedIndices;
   if(selected!==undefined&&(!Array.isArray(selected)||!selected.length||selected.length>plan.patches.length||new Set(selected).size!==selected.length||selected.some(index=>!Number.isSafeInteger(index)||index<0||index>=plan.patches.length)))throw Error('Choose valid, unique relink candidates from this preview.');
   const patches=selected===undefined?plan.patches:selected.map(index=>plan.patches[index]);
   // Check every source before writing. Each record remains usable if a later record fails.
   const verified=patches.map(row=>{const item=catalogStore().get(row.id),old=row.episodeId?item?.episodes.find(ep=>ep.id===row.episodeId)?.source:item?.source;if(old?.value!==row.old||old.imported===true||fs.existsSync(row.old))throw Error('The source changed after preview; scan again.');
    const root=fs.realpathSync(plan.folderPath),next=fs.realpathSync(row.next);
    if(!beneath(next,root))throw Error('The replacement left the reviewed folder.');
    return {...row,file:inspectMedia(next)};});
   plans.delete(input.token);
   const completed=[];
   let warning='';
   for(const row of verified){
    const store=catalogStore(),old=sourceAt(store.get(row.id),row.episodeId);
    if(!old||old.value!==row.old){warning='The source changed after preview.';break;}
    const source={...old,value:row.file,watchKey:canonicalWatchKey('file:'+row.file)};
    try{
     replaceSource(store,row.id,row.episodeId,source);
     let historyUndo;
     try{historyUndo=await relinkHistory?.(canonicalWatchKey('file:'+row.old),row.file);}
     catch(error){replaceSource(store,row.id,row.episodeId,old);throw error;}
     completed.push({id:row.id,episodeId:row.episodeId,old,expected:sourceAt(store.get(row.id),row.episodeId),historyUndo});
     grantMedia(row.file);
    }catch(error){warning=error.message;break;}
   }
   if(!completed.length&&warning)throw Error(warning);
   const undoToken=randomUUID();
   relinkUndos.set(undoToken,{rows:completed,sender:event.sender.id,at:Date.now()});
   while(relinkUndos.size>20)relinkUndos.delete(relinkUndos.keys().next().value);
   return {ok:true,count:completed.length,warning,undoToken};
  }
  {
   const undo=relinkUndos.get(input.token);
   if(!undo||undo.sender!==event.sender.id||Date.now()-undo.at>600000)throw Error('Relink undo expired.');
   const store=catalogStore();
   for(const row of undo.rows){
    if(JSON.stringify(sourceAt(store.get(row.id),row.episodeId))!==JSON.stringify(row.expected))
      throw Error('The source changed after relinking.');
    row.historyUndo?.check();
   }
   let count=0;
   while(undo.rows.length){
    const row=undo.rows.at(-1);
    if(JSON.stringify(sourceAt(store.get(row.id),row.episodeId))!==JSON.stringify(row.expected))
     return {ok:false,error:count+' links restored before a reviewed source changed.'};
    replaceSource(store,row.id,row.episodeId,row.old);
    try{await row.historyUndo?.apply();}
    catch(error){
     replaceSource(store,row.id,row.episodeId,row.expected);
     return {ok:false,error:count+' links restored before the operation stopped. '+error.message};
    }
    undo.rows.pop();count++;
   }
   relinkUndos.delete(input.token);
   return {ok:true,count};
  }
   }finally{relinkBusy=false;}
  }
  if(input.action==='remember-stream')return rememberStream(input);
  if(input.action==='network'){loadSources();const stored=input.key?streamSources.get(input.key):null;if(input.key&&!stored)throw Error('Saved stream address is unavailable; open a fresh source.');const url=streamUrl(stored||input.url),key=input.key||'stream:'+createHash('sha256').update(url.href).digest('hex');return {ok:true,url:url.href,key,title:url.pathname.split('/').pop()||url.hostname,...networkAudioSource(url,key,event)};}
  if(input.action==='audio-prepare')return await prepareNetworkAudio(event,input);
  if(input.action==='audio-cancel'){const own=audioPreparation&&audioPreparation.sender===event.sender&&audioPreparation.id===input.requestId;if(own)audioPreparation.controller.abort();return {ok:true,cancelled:!!own};}
  if(input.action==='audio-status'){const own=audioPreparation&&audioPreparation.sender===event.sender&&audioPreparation.id===input.requestId;return {ok:true,active:!!own,progress:own?{...audioPreparation.progress}:null};}
  if(input.action==='scenes'){const file=await authorizeMedia(input.path);const duration=Number(input.duration);if(!Number.isFinite(duration)||duration<=0||duration>604800)throw Error('Invalid video duration.');const out=path.join(app.getPath('temp'),'whisper-scenes-'+randomUUID());await fsp.mkdir(out,{recursive:true});const rows=[];try{for(let i=0;i<12;i++){const at=Math.max(0,Math.min(duration-.05,duration*(i+.5)/12)),target=path.join(out,`${i}.jpg`);await run(ffmpeg(),['-hide_banner','-loglevel','error','-ss',String(at),'-i',file,'-frames:v','1','-vf','scale=240:-2','-q:v','5',target],undefined,undefined,15000);const bytes=await fsp.readFile(target);if(bytes.length>500000)throw Error('Preview image too large.');rows.push({at,image:'data:image/jpeg;base64,'+bytes.toString('base64')});}return {ok:true,rows};}finally{for(const name of await fsp.readdir(out).catch(()=>[]))await fsp.unlink(path.join(out,name)).catch(()=>{});await fsp.rmdir(out).catch(()=>{});}}
  throw Error('Unsupported media operation.');
 }catch(e){return {ok:false,error:e.message,...(typeof e.code==='string'&&/^(?:AUDIO_[A-Z_]+|STREAM_AUDIO_[A-Z_]+|BAD_REQUEST)$/.test(e.code)?{code:e.code}:{})};}};
 ipcMain.handle('media-hub:request',handle);app.on('before-quit',()=>{audioPreparation?.controller.abort();audioGrants.clear();for(const w of watchers.values())w.close();for(const timer of timers.values())clearTimeout(timer);});return {handle};
}
module.exports={registerMediaHub,versionKey};
