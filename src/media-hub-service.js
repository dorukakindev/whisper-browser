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
function registerMediaHub({app,ipcMain,authorized,dialog,owner,inspectMedia,authorizeMedia,grantMedia,catalogStore,ffmpeg,relinkHistory}){
 const relinkUndos=new Map();
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
  const rows=[];const root=await fsp.realpath(folder.path);
  const skipped=[];
  async function walk(dir,depth){if(depth>12||rows.length>=10000)return;let entries;try{entries=await fsp.readdir(dir,{withFileTypes:true});}catch(e){if(dir===root)throw e;skipped.push({name:path.relative(root,dir),code:e.code||'read'});return;}for(const entry of entries){if(rows.length>=10000)break;if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file,depth+1);else if(entry.isFile()&&video.test(file)){let stat;try{stat=await fsp.stat(file);}catch(e){skipped.push({name:path.relative(root,file),code:e.code||'stat'});continue;}const id=createHash('sha256').update(file).digest('hex').slice(0,24);rows.push({id,path:file,name:path.relative(root,file),size:stat.size,mtime:stat.mtimeMs});}}}
  await walk(root,0);files.set(folder.id,rows);folder.count=rows.length;folder.scannedAt=Date.now();folder.skipped=skipped.slice(0,100);folder.error=skipped.length?skipped.length+' unreadable entries skipped / okunamayan girdi atlandı':'';return rows;
 }
 function watch(folder){if(watchers.has(folder.id))return;try{const watcher=fs.watch(folder.path,{recursive:true},()=>{clearTimeout(timers.get(folder.id));timers.set(folder.id,setTimeout(()=>scan(folder).catch(e=>{folder.error=e.message;}),1500));});watcher.on('error',e=>{folder.error=e.message;watcher.close();watchers.delete(folder.id);});watchers.set(folder.id,watcher);}catch(e){folder.error=e.message;}}
 const publicFolder=folder=>({...folder,files:(files.get(folder.id)||[]).slice(0,10000).map(row=>({...row,versionGroup:versionKey(row.name)}))});
 const handle=async(event,input={})=>{if(!authorized(event))return {ok:false,error:'Unauthorized request.'};try{
  if(error)throw Error(error+' Original folder index was preserved.');
  if(input.action==='v3-export'){
   const extensions={csv:'csv',json:'json',markdown:'md',html:'html'};
   if(!Object.hasOwn(extensions,input.format)||typeof input.content!=='string'||Buffer.byteLength(input.content)>1024*1024)throw Error('Invalid comparison export.');
   const extension=extensions[input.format];
   const picked=await dialog.showSaveDialog(owner(),{defaultPath:'whisper-comparison.'+extension,filters:[{name:'Whisper comparison',extensions:[extension]}]});
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
   return {ok:true,preview,titles,partial:library.length>catalog.length||sources.length>1000};
  }
  if(input.action==='folders'){for(const folder of folders)if(folder.enabled){watch(folder);if(!files.has(folder.id))await scan(folder).catch(e=>{folder.error=e.message;});}return {ok:true,folders:folders.map(publicFolder)};}
  if(input.action==='folder-add'){const picked=await dialog.showOpenDialog(owner(),{properties:['openDirectory']});if(picked.canceled)return {ok:true,canceled:true};const real=await fsp.realpath(picked.filePaths[0]);let folder=folders.find(r=>r.path.toLowerCase()===real.toLowerCase());if(!folder){if(folders.length>=30)throw Error('Folder watch limit reached.');folder={id:randomUUID(),path:real,enabled:true};folders.push(folder);persist();}folder.enabled=true;persist();await scan(folder);watch(folder);return {ok:true,folder:publicFolder(folder)};}
  const folder=folders.find(r=>r.id===input.folderId);
  if(input.action==='folder-scan'){if(!folder)throw Error('Folder not found.');folder.enabled=true;persist();await scan(folder);watch(folder);return {ok:true,folder:publicFolder(folder)};}
  if(input.action==='folder-remove'){if(!folder)throw Error('Folder not found.');watchers.get(folder.id)?.close();watchers.delete(folder.id);clearTimeout(timers.get(folder.id));files.delete(folder.id);folders=folders.filter(r=>r!==folder);persist();return {ok:true};}
  if(input.action==='folder-play'){if(!folder)throw Error('Folder not found.');const row=files.get(folder.id)?.find(r=>r.id===input.id);if(!row)throw Error('Rescan the folder before opening this item.');const real=await fsp.realpath(row.path),root=await fsp.realpath(folder.path);if(!beneath(real,root))throw Error('File left the selected folder.');const file=inspectMedia(real);grantMedia(file);return {ok:true,path:file};}
  if(input.action==='relink-preview'){if(!folder)throw Error('Choose a folder first.');await scan(folder);const rows=files.get(folder.id)||[],patches=[];for(const item of catalogStore().list()){const all=[{source:item.source,id:item.id},...(item.episodes||[]).map(ep=>({source:ep.source,id:item.id,episodeId:ep.id}))];for(const row of all)if(row.source?.type==='local'&&row.source.imported!==true&&!fs.existsSync(row.source.value)){const hits=rows.filter(file=>path.basename(file.path).toLowerCase()===path.basename(row.source.value).toLowerCase());if(hits.length===1)patches.push({...row,old:row.source.value,next:hits[0].path,title:item.title});}}const token=randomUUID();plans.clear();plans.set(token,{patches,folderPath:folder.path,sender:event.sender.id,at:Date.now()});return {ok:true,token,patches};}
  if(input.action==='relink-apply'||input.action==='relink-undo'){
   if(relinkBusy)throw Error('A relink operation is already running.');
   relinkBusy=true;
   try{
   if(input.action==='relink-apply'){
   const plan=plans.get(input.token);if(!plan||plan.sender!==event.sender.id||Date.now()-plan.at>600000)throw Error('Relink preview expired.');
   // Check every source before writing. Each record remains usable if a later record fails.
   const verified=plan.patches.map(row=>{const item=catalogStore().get(row.id),old=row.episodeId?item?.episodes.find(ep=>ep.id===row.episodeId)?.source:item?.source;if(old?.value!==row.old||old.imported===true||fs.existsSync(row.old))throw Error('The source changed after preview; scan again.');
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
  if(input.action==='network'){const url=new URL(String(input.url||'').trim());if(!['https:','http:','rtsp:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)throw Error('Use an HTTP/HTTPS/RTSP media URL without embedded credentials.');return {ok:true,url:url.href,key:'stream:'+createHash('sha256').update(url.href).digest('hex'),title:url.pathname.split('/').pop()||url.hostname};}
  if(input.action==='scenes'){const file=await authorizeMedia(input.path);const duration=Number(input.duration);if(!Number.isFinite(duration)||duration<=0||duration>604800)throw Error('Invalid video duration.');const out=path.join(app.getPath('temp'),'whisper-scenes-'+randomUUID());await fsp.mkdir(out,{recursive:true});const rows=[];try{for(let i=0;i<12;i++){const at=Math.max(0,Math.min(duration-.05,duration*(i+.5)/12)),target=path.join(out,`${i}.jpg`);await run(ffmpeg(),['-hide_banner','-loglevel','error','-ss',String(at),'-i',file,'-frames:v','1','-vf','scale=240:-2','-q:v','5',target],undefined,undefined,15000);const bytes=await fsp.readFile(target);if(bytes.length>500000)throw Error('Preview image too large.');rows.push({at,image:'data:image/jpeg;base64,'+bytes.toString('base64')});}return {ok:true,rows};}finally{for(const name of await fsp.readdir(out).catch(()=>[]))await fsp.unlink(path.join(out,name)).catch(()=>{});await fsp.rmdir(out).catch(()=>{});}}
  throw Error('Unsupported media operation.');
 }catch(e){return {ok:false,error:e.message};}};
 ipcMain.handle('media-hub:request',handle);app.on('before-quit',()=>{for(const w of watchers.values())w.close();for(const timer of timers.values())clearTimeout(timer);});return {handle};
}
module.exports={registerMediaHub,versionKey};
