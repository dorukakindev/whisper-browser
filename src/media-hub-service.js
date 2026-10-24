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
 const index=()=>path.join(app.getPath('userData'),'media-folder-watches.json');let folders=[],error='';const watchers=new Map(),timers=new Map(),files=new Map(),plans=new Map();
 try{if(fs.existsSync(index())){if(fs.statSync(index()).size>200000)throw Error('Folder watch index too large.');folders=JSON.parse(fs.readFileSync(index(),'utf8'));if(!Array.isArray(folders)||folders.length>30)throw Error('Invalid folder watch index.');}}catch(e){folders=[];error=e.message;}
 const persist=()=>atomicWriteFileSync(index(),JSON.stringify(folders));
 const beneath=(file,root)=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
 async function scan(folder){
  const rows=[];const root=await fsp.realpath(folder.path);
  async function walk(dir,depth){if(depth>12||rows.length>=10000)return;for(const entry of await fsp.readdir(dir,{withFileTypes:true})){if(rows.length>=10000)break;if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file,depth+1);else if(entry.isFile()&&video.test(file)){const stat=await fsp.stat(file);const id=createHash('sha256').update(file).digest('hex').slice(0,24);rows.push({id,path:file,name:path.relative(root,file),size:stat.size,mtime:stat.mtimeMs});}}}
  await walk(root,0);files.set(folder.id,rows);folder.count=rows.length;folder.scannedAt=Date.now();folder.error='';return rows;
 }
 function watch(folder){if(watchers.has(folder.id))return;try{const watcher=fs.watch(folder.path,{recursive:true},()=>{clearTimeout(timers.get(folder.id));timers.set(folder.id,setTimeout(()=>scan(folder).catch(e=>{folder.error=e.message;}),1500));});watcher.on('error',e=>{folder.error=e.message;watcher.close();watchers.delete(folder.id);});watchers.set(folder.id,watcher);}catch(e){folder.error=e.message;}}
 const publicFolder=folder=>({...folder,files:(files.get(folder.id)||[]).slice(0,10000).map(row=>({...row,versionGroup:versionKey(row.name)}))});
 const handle=async(event,input={})=>{if(!authorized(event))return {ok:false,error:'Unauthorized request.'};try{
  if(error)throw Error(error+' Original folder index was preserved.');
  if(input.action==='folders'){for(const folder of folders)if(folder.enabled){watch(folder);if(!files.has(folder.id))await scan(folder).catch(e=>{folder.error=e.message;});}return {ok:true,folders:folders.map(publicFolder)};}
  if(input.action==='folder-add'){const picked=await dialog.showOpenDialog(owner(),{properties:['openDirectory']});if(picked.canceled)return {ok:true,canceled:true};const real=await fsp.realpath(picked.filePaths[0]);let folder=folders.find(r=>r.path.toLowerCase()===real.toLowerCase());if(!folder){if(folders.length>=30)throw Error('Folder watch limit reached.');folder={id:randomUUID(),path:real,enabled:true};folders.push(folder);persist();}await scan(folder);watch(folder);return {ok:true,folder:publicFolder(folder)};}
  const folder=folders.find(r=>r.id===input.folderId);
  if(input.action==='folder-scan'){if(!folder)throw Error('Folder not found.');await scan(folder);return {ok:true,folder:publicFolder(folder)};}
  if(input.action==='folder-remove'){if(!folder)throw Error('Folder not found.');watchers.get(folder.id)?.close();watchers.delete(folder.id);clearTimeout(timers.get(folder.id));files.delete(folder.id);folders=folders.filter(r=>r!==folder);persist();return {ok:true};}
  if(input.action==='folder-play'){if(!folder)throw Error('Folder not found.');const row=files.get(folder.id)?.find(r=>r.id===input.id);if(!row)throw Error('Rescan the folder before opening this item.');const real=await fsp.realpath(row.path),root=await fsp.realpath(folder.path);if(!beneath(real,root))throw Error('File left the selected folder.');const file=inspectMedia(real);grantMedia(file);return {ok:true,path:file};}
  if(input.action==='relink-preview'){if(!folder)throw Error('Choose a folder first.');await scan(folder);const rows=files.get(folder.id)||[],patches=[];for(const item of catalogStore().list()){const all=[{source:item.source,id:item.id},...(item.episodes||[]).map(ep=>({source:ep.source,id:item.id,episodeId:ep.id}))];for(const row of all)if(row.source?.type==='local'&&!fs.existsSync(row.source.value)){const hits=rows.filter(file=>path.basename(file.path).toLowerCase()===path.basename(row.source.value).toLowerCase());if(hits.length===1)patches.push({...row,old:row.source.value,next:hits[0].path,title:item.title});}}const token=randomUUID();plans.clear();plans.set(token,{patches,at:Date.now()});return {ok:true,token,patches};}
  if(input.action==='relink-apply'){
   const plan=plans.get(input.token);if(!plan||Date.now()-plan.at>600000)throw Error('Relink preview expired.');
   // Check every source before writing. Each record remains usable if a later record fails.
   const verified=plan.patches.map(row=>{const item=catalogStore().get(row.id),old=row.episodeId?item?.episodes.find(ep=>ep.id===row.episodeId)?.source:item?.source;if(old?.value!==row.old||fs.existsSync(row.old))throw Error('The source changed after preview; scan again.');return {...row,file:inspectMedia(row.next)};});
   let applied=0;
   try{for(const row of verified){
    const store=catalogStore(),item=store.get(row.id),old=row.episodeId?item.episodes.find(ep=>ep.id===row.episodeId).source:item.source;
    const source={...old,value:row.file,watchKey:canonicalWatchKey('file:'+row.file)};
    const patch=row.episodeId?{id:item.id,episodes:item.episodes.map(ep=>ep.id===row.episodeId?{...ep,source}:ep)}:{id:item.id,source};
    const rollback=row.episodeId?{id:item.id,episodes:item.episodes}:{id:item.id,source:old};
    store.upsertMany([patch]);
    try{if(relinkHistory)await relinkHistory(canonicalWatchKey('file:'+row.old),row.file);grantMedia(row.file);}
    catch(e){store.upsertMany([rollback]);throw e;}
    applied++;
   }}catch(e){throw Error(`${applied} sources updated; remaining links were preserved. ${e.message}`);}
   plans.delete(input.token);return {ok:true,count:applied};
  }
  if(input.action==='network'){const url=new URL(String(input.url||'').trim());if(!['https:','http:','rtsp:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)throw Error('Use an HTTP/HTTPS/RTSP media URL without embedded credentials.');return {ok:true,url:url.href,key:'stream:'+createHash('sha256').update(url.href).digest('hex'),title:url.pathname.split('/').pop()||url.hostname};}
  if(input.action==='scenes'){const file=await authorizeMedia(input.path);const duration=Number(input.duration);if(!Number.isFinite(duration)||duration<=0||duration>604800)throw Error('Invalid video duration.');const out=path.join(app.getPath('temp'),'whisper-scenes-'+randomUUID());await fsp.mkdir(out,{recursive:true});const rows=[];try{for(let i=0;i<12;i++){const at=Math.max(0,Math.min(duration-.05,duration*(i+.5)/12)),target=path.join(out,`${i}.jpg`);await run(ffmpeg(),['-hide_banner','-loglevel','error','-ss',String(at),'-i',file,'-frames:v','1','-vf','scale=240:-2','-q:v','5',target],undefined,undefined,15000);const bytes=await fsp.readFile(target);if(bytes.length>500000)throw Error('Preview image too large.');rows.push({at,image:'data:image/jpeg;base64,'+bytes.toString('base64')});}return {ok:true,rows};}finally{for(const name of await fsp.readdir(out).catch(()=>[]))await fsp.unlink(path.join(out,name)).catch(()=>{});await fsp.rmdir(out).catch(()=>{});}}
  throw Error('Unsupported media operation.');
 }catch(e){return {ok:false,error:e.message};}};
 ipcMain.handle('media-hub:request',handle);app.on('before-quit',()=>{for(const w of watchers.values())w.close();for(const timer of timers.values())clearTimeout(timer);});return {handle};
}
module.exports={registerMediaHub,versionKey};
