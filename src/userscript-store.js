'use strict';
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils'),M=require('./userscript-model');
const MAX_FILE=4*1024*1024,MAX_VALUES=256*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
const identity=meta=>JSON.stringify([meta.namespace,meta.name]);
function originOf(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use an HTTP(S) site origin.');return u.origin;}
function assertJson(value,depth=0,seen=new Set()){
 if(depth>32)throw Error('Script value nesting exceeds32.');
 if(value===null||['string','boolean'].includes(typeof value))return;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Script values must contain finite JSON numbers.');return;}
 if(typeof value!=='object'||seen.has(value))throw Error('Script values must be acyclic JSON data.');
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Script values must be plain JSON objects.');
 seen.add(value);for(const key of Object.keys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Script values cannot contain accessors.');assertJson(field.value,depth+1,seen);}seen.delete(value);
}
function valuesOf(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid script value dictionary.');assertJson(raw);const json=JSON.stringify(raw);if(Buffer.byteLength(json)>MAX_VALUES)throw Error('Script value quota exceeded (256KiB).');return JSON.parse(json);}
function createUserscriptStore(filePath){
 function load(){
  if(!fs.existsSync(filePath))return {version:1,scripts:[],pausedOrigins:[]};
  if(fs.statSync(filePath).size>MAX_FILE)throw Error('Userscript store exceeds4MiB; original preserved.');
  const data=JSON.parse(fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,''));
  if(!data||data.version!==1||!Array.isArray(data.scripts)||data.scripts.length>100||!Array.isArray(data.pausedOrigins)||data.pausedOrigins.length>1000)throw Error('Invalid userscript store; original preserved.');
  const ids=new Set(),names=new Set();
  for(const row of data.scripts){
   if(!row||typeof row.id!=='string'||!/^[\w-]{1,100}$/.test(row.id)||ids.has(row.id))throw Error('Invalid userscript identity.');ids.add(row.id);
   const metadata=M.parseMetadata(row.code);if(row.revision!==metadata.hash||typeof row.enabled!=='boolean'||!Array.isArray(row.history)||row.history.length>5||!Array.isArray(row.errors)||row.errors.length>10)throw Error('Invalid userscript revision/history.');
   const key=identity(metadata);if(names.has(key))throw Error('Duplicate userscript namespace/name.');names.add(key);
   for(const old of row.history){if(!old||typeof old.revision!=='string'||M.parseMetadata(old.code).hash!==old.revision)throw Error('Invalid userscript history.');}
   if(row.errors.some(error=>!error||typeof error.message!=='string'||error.message.length>1000||!Number.isFinite(error.at)))throw Error('Invalid userscript error history.');
   row.metadata=metadata;row.values=valuesOf(row.values);
  }
  data.pausedOrigins=data.pausedOrigins.flatMap(origin=>{try{return [originOf(origin)];}catch{return [];}});return data;   // bozuk kayıt tüm motoru çökertmez, yalnız atlanır
 }
 function save(data){const json=JSON.stringify(data);if(Buffer.byteLength(json)>MAX_FILE)throw Error('Userscript store quota exceeded (4MiB); original preserved.');atomicWriteFileSync(filePath,json);return data;}
 const getRow=(data,id)=>{const row=data.scripts.find(s=>s.id===id);if(!row)throw Error('Unknown userscript ID.');return row;};
 function preview(code,options={}){
  const metadata=M.parseMetadata(code),data=load(),existing=options.id?getRow(data,options.id):data.scripts.find(s=>identity(s.metadata)===identity(metadata));
  if(data.scripts.some(s=>s.id!==existing?.id&&identity(s.metadata)===identity(metadata)))throw Error('Another script already owns this namespace/name.');
  return {script:{code,metadata,revision:metadata.hash},existingId:existing?.id||null,baseRevision:existing?.revision||null,expansion:M.expansion(existing?.metadata,metadata),identityChanged:!!existing&&identity(existing.metadata)!==identity(metadata),warnings:metadata.warnings,blocked:metadata.blocked,requiresConfirmation:true};
 }
 function install(code,options={}){
  if(options.confirm!==true)throw Error('Preview and explicitly confirm the script first.');
  const proposed=preview(code,options),data=load(),old=proposed.existingId?getRow(data,proposed.existingId):null;
  if(old&&options.expectedRevision!==old.revision)throw Error('Script changed since preview. Review the update again.');
  if(options.expectedHash&&options.expectedHash!==proposed.script.revision)throw Error('Script content changed since preview.');
  if(!old&&data.scripts.length>=100)throw Error('Userscript limit is100.');
  const stamp=Date.now(),history=old?.history||[];
  if(old&&old.revision!==proposed.script.revision)history.push({revision:old.revision,code:old.code,updatedAt:old.updatedAt});
  const blocked=proposed.blocked.length>0;
  if(blocked&&options.enabled===true)throw Error('Unsupported script requirements must be resolved before enabling.');
  const row={...old,id:old?.id||randomUUID(),code,metadata:proposed.script.metadata,revision:proposed.script.revision,enabled:!blocked&&(typeof options.enabled==='boolean'?options.enabled:old?.enabled??true),values:old?.values||{},history:history.slice(-5),errors:old?.errors||[],createdAt:old?.createdAt||stamp,updatedAt:stamp};
  if(old)data.scripts[data.scripts.indexOf(old)]=row;else data.scripts.push(row);save(data);return clone(row);
 }
 const update=(id,code,options={})=>install(code,{...options,id});
 function rollback(id,options={}){
  if(options.confirm!==true)throw Error('Explicit rollback confirmation is required.');const data=load(),row=getRow(data,id);
  if(options.expectedRevision&&options.expectedRevision!==row.revision)throw Error('Script changed since rollback preview.');
  const previous=options.revision?row.history.find(h=>h.revision===options.revision):row.history.at(-1);if(!previous)throw Error('Previous script revision is unavailable.');
  return install(previous.code,{id,confirm:true,expectedRevision:row.revision,enabled:row.enabled});
 }
 function setEnabled(id,enabled){if(typeof enabled!=='boolean')throw Error('enabled must be boolean.');const data=load(),row=getRow(data,id);if(enabled&&row.metadata.blocked.length)throw Error('Unsupported script requirements prevent execution.');row.enabled=enabled;row.updatedAt=Date.now();save(data);return clone(row);}
 function setPaused(raw,paused){if(typeof paused!=='boolean')throw Error('paused must be boolean.');const origin=originOf(raw),data=load();const next=new Set(data.pausedOrigins);paused?next.add(origin):next.delete(origin);if(next.size>1000)throw Error('Paused-origin limit is1000.');data.pausedOrigins=[...next];save(data);return {origin,paused};}
 function setValue(id,key,value){if(typeof key!=='string'||key.length>1000)throw Error('Invalid script value key.');assertJson(value);const data=load(),row=getRow(data,id);const values=valuesOf(row.values);Object.defineProperty(values,key,{value:clone(value),enumerable:true,writable:true,configurable:true});row.values=valuesOf(values);save(data);return clone(value);}
 function deleteValue(id,key){if(typeof key!=='string'||key.length>1000)throw Error('Invalid script value key.');const data=load(),row=getRow(data,id);delete row.values[key];save(data);return true;}
 function writeError(id,error){const data=load(),row=getRow(data,id);row.errors.push({at:Date.now(),message:String(error?.message??error??'Script error').replace(/\0/g,'').slice(0,1000)});row.errors=row.errors.slice(-10);save(data);return clone(row.errors);}
 function remove(id){const data=load();getRow(data,id);data.scripts=data.scripts.filter(s=>s.id!==id);save(data);return true;}
 load();
 return {preview,install,update,rollback,list:()=>clone(load().scripts),get:id=>clone(getRow(load(),id)),setValue,deleteValue,getValues:id=>clone(getRow(load(),id).values),setEnabled,setPaused,isPaused:raw=>load().pausedOrigins.includes(originOf(raw)),pausedOrigins:()=>clone(load().pausedOrigins),writeError,remove,matching:(url,options={})=>{const data=load();if(data.pausedOrigins.includes(originOf(url)))return [];return clone(data.scripts.filter(row=>row.enabled&&M.matches(row.metadata,url,options)));}};
}
module.exports={createUserscriptStore,MAX_FILE,MAX_VALUES};
