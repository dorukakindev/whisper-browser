// Persistent, bounded analysis results. Audio and expiring/file URLs are not stored here.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./fsync-utils');
const VERSION='music-workspace-1',LIMIT=5000,MAX=4_000_000,TOTAL=512*1024*1024;
const transient=new Set(['sourceId','referenceId','referenceUrl','url','file','path']);
function clean(value,depth=0){
 if(depth>12)return null;
 if(Array.isArray(value))return value.slice(0,12000).map(v=>clean(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!transient.has(k)&&k!=='__proto__').map(([k,v])=>[k,clean(v,depth+1)]));
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return value.slice(0,3000);
 return typeof value==='boolean'||value===null?value:null;
}
function create(userData,revision){
 const dir=()=>path.join(userData(),'music-workspaces');
 const file=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid analysis fingerprint');return path.join(dir(),key+'.json');};
 function read(key){try{const p=file(key);if(fs.statSync(p).size>MAX)return null;const row=JSON.parse(fs.readFileSync(p,'utf8'));return row.version===VERSION&&row.revision===revision&&row.modes&&typeof row.modes==='object'?row:null;}catch{return null;}}
 function save(key,mode,result,context={}){
  if(!['analyze','tags','search','online'].includes(mode))return;
  const row=read(key)||{version:VERSION,revision,modes:{}};
  row.savedAt=Date.now();row.modes[mode]={savedAt:row.savedAt,result:clean(result),multiReference:context.multiReference===true,catalog:clean(context.catalog||[]),request:clean(context.request||{})};
  const data=JSON.stringify(row);if(Buffer.byteLength(data)>MAX)throw Error('Analysis result is too large to save');
  fs.mkdirSync(dir(),{recursive:true});
  const target=file(key),files=fs.readdirSync(dir()).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));
  const existing=files.includes(key+'.json'),used=files.reduce((sum,name)=>sum+fs.statSync(path.join(dir(),name)).size,0),oldSize=existing?fs.statSync(target).size:0;
  // These are saved results, not a disposable cache: never silently evict older tracks.
  if(!existing&&files.length>=LIMIT||used-oldSize+Buffer.byteLength(data)>TOTAL)throw Error('Saved analysis storage is full');
  atomicWriteFileSync(target,data);
 }
 return {read,save};
}
module.exports={create,clean,VERSION};
