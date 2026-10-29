'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {groups}=require('./renderer/dub-workspace-model');
const {voiceStorage}=require('./voice-storage');
const hex=/^[a-f0-9]{64}$/;
async function json(file,max=8*1024*1024){const s=await fs.stat(file);if(!s.isFile()||s.size>max)throw Error('Recording metadata is unavailable.');return JSON.parse(await fs.readFile(file,'utf8'));}
async function hash(file){const h=crypto.createHash('sha256'),handle=await fs.open(file,'r');try{for await(const b of handle.createReadStream())h.update(b);return h.digest('hex');}finally{await handle.close();}}
function createGroupTakes({app,grantMedia}){
 const tokens=new Map(),watched=new WeakSet();
 const root=()=>voiceStorage(app).output,logs=()=>path.join(app.getPath('userData'),'dub-logs');
 async function receipt(name){
  const doc=await json(path.join(logs(),name));
  if(doc.result!=='done'||! /^[a-zA-Z0-9-]{1,80}$/.test(doc.id||'')||doc.sample===true)throw Error('A completed full production is required.');
  const file=path.join(root(),doc.id+'.wav');if(path.resolve(doc.path||'')!==path.resolve(file))throw Error('Invalid recording output.');
  const manifest=await json(file.replace(/\.wav$/i,'.zamanlama.json'));
  if(!Array.isArray(manifest.segments)||manifest.segments.length>5000)throw Error('Group recording metadata is unavailable.');
  return {doc,manifest};
 }
 function segment(data,key){return data.manifest.segments.find(row=>Array.isArray(row.source_ids)&&row.source_ids.join(',')===key);}
 async function verified(sha){
  if(!hex.test(sha||''))throw Error('Invalid recording identity.');
  const file=path.join(root(),'_dub_takes_v1',sha+'.wav');
  if(path.resolve(await fs.realpath(file))!==path.resolve(file)||await hash(file)!==sha)throw Error('The saved recording changed; refresh the recording list.');
  return file;
 }
 async function list(sender,id,key){
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(id||'')||typeof key!=='string'||!/^\d+(?:,\d+)*$/.test(key)||key.length>2000)throw Error('Invalid recording request.');
  const names=(await fs.readdir(logs())).filter(n=>/^[a-zA-Z0-9-]+-\d+\.json$/.test(n)).sort((a,b)=>Number(b.match(/-(\d+)\.json$/)[1])-Number(a.match(/-(\d+)\.json$/)[1]));
  let base,baseName;for(const name of names.filter(n=>n.startsWith(id+'-'))){try{const row=await receipt(name);if(row.doc.id===id){base=row;baseName=name;break;}}catch{}}
  if(!base)throw Error('Open a completed production with saved group recordings first.');
  const original=segment(base,key);if(!hex.test(original?.cache_key||'')||!hex.test(original?.sha256||''))return {choices:[],legacy:true};
  if(!watched.has(sender)){watched.add(sender);sender.once?.('destroyed',()=>{for(const [token,row]of tokens)if(row.sender===sender)tokens.delete(token);});}
  const choices=[],seen=new Set();
  for(const name of [...new Set([baseName,...names])].slice(0,200)){
   try{
    const data=await receipt(name),s=segment(data,key);
    if(data.doc.subtitleHash!==base.doc.subtitleHash||data.doc.sourceIdentity!==base.doc.sourceIdentity||JSON.stringify(data.doc.range??null)!==JSON.stringify(base.doc.range??null)||s?.cache_key!==original.cache_key||!hex.test(s?.sha256||'')||seen.has(s.sha256))continue;
    const row=data.doc.quality?.groups?.find(g=>g.key===key);if(!row||row.text!==s.text||row.status==='failed')continue;
    const record=groups([row])[0],file=await verified(s.sha256);grantMedia(file);
    const token=crypto.randomUUID();tokens.set(token,{sender,key,subtitleHash:base.doc.subtitleHash,sourceIdentity:base.doc.sourceIdentity,range:base.doc.range??null,file,cache_key:s.cache_key,sha256:s.sha256,record});
    while(tokens.size>2000)tokens.delete(tokens.keys().next().value);
    choices.push({token,sha256:s.sha256,current:s.sha256===original.sha256,recordedAt:data.doc.finishedAt||'',status:record.status,text:record.text,url:pathToFileURL(file).href});seen.add(s.sha256);
    if(choices.length>=20)break;
   }catch{}
  }
  return {choices,legacy:false};
 }
 async function resolve(sender,value,scope,force=[]){
  if(value==null)return {};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>5000)throw Error('Invalid selected recordings.');
  const selected={};
  for(const [key,token]of Object.entries(value)){
   const row=tokens.get(token);
   if(!row||row.sender!==sender||row.key!==key||row.subtitleHash!==scope.subtitleHash||row.sourceIdentity!==scope.sourceIdentity||JSON.stringify(row.range)!==JSON.stringify(scope.range??null)||force.includes(key))throw Error('Selected recordings no longer match this job; refresh the recording list.');
   await verified(row.sha256);
   selected[key]={cache_key:row.cache_key,sha256:row.sha256,record:row.record};
  }
  return selected;
 }
 return {list,resolve};
}
module.exports={createGroupTakes};
