'use strict';
const P=require('./personal-media-state');
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./fsync-utils');

const provider=item=>item.imdbId||item.providerId||item.tmdbId||'';
const legacyKey=item=>JSON.stringify([item.kind,provider(item)||item.id,item.year||null]);
// An exact library copy owns its own files and choices. Year/title are metadata.
const titleKey=item=>item.id&&!item.id.startsWith('discovery:')
 ?JSON.stringify(['catalog',item.id,item.kind,provider(item)])
 :JSON.stringify(['provider',item.kind,provider(item)||item.id]);
const providerKey=item=>JSON.stringify([item.kind,provider(item)||item.id]);
const isLegacy=value=>{try{const row=JSON.parse(value);return Array.isArray(row)&&row.length===3&&['film','series'].includes(row[0])&&typeof row[1]==='string'&&(row[2]===null||Number.isInteger(row[2]));}catch{return false;}};
function readJson(file,io=fs){
 let raw;try{raw=io.readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(Buffer.byteLength(raw)>16_000_000)throw Error('Personal relationship data exceeds its size limit.');
 return JSON.parse(raw.replace(/^\uFEFF/,''));
}
function readBindings(root,io=fs){
 const data=readJson(path.join(root,'media-title-relations.json'),io);
 if(!data)return {};
 if(data.version!==1||!data.bindings||typeof data.bindings!=='object'||Array.isArray(data.bindings)||Object.entries(data.bindings).some(([key,value])=>!isLegacy(key)||(value!==null&&typeof value!=='string')))throw Error('Personal relationship ownership is invalid; original preserved.');
 return data.bindings;
}
function createMatcher(root,items,{allowUnbound=true}={}){
 const byProvider=new Map(),byLegacy=new Map(),byWork=new Map(),current=new Set(items.map(titleKey));let bindings;
 for(const item of items){const group=byProvider.get(providerKey(item))||[];group.push(item);byProvider.set(providerKey(item),group);byLegacy.set(legacyKey(item),item);}
 for(const group of byProvider.values())if(group.length===1)byWork.set(JSON.stringify(['provider',group[0].kind,provider(group[0])||group[0].id]),titleKey(group[0]));
 const aliases=()=>bindings||(bindings=root?readBindings(root):{});
 const ownerOf=stored=>{
  if(current.has(stored))return stored;
  if(isLegacy(stored)){
   if(Object.hasOwn(aliases(),stored))return current.has(aliases()[stored])?aliases()[stored]:null;
   const item=byLegacy.get(stored);return allowUnbound&&item&&byProvider.get(providerKey(item)).length===1?titleKey(item):null;
  }
  return byWork.get(stored)||null;
 };
 const matches=(stored,item)=>{
  if(stored===titleKey(item))return true;
  if(allowUnbound&&isLegacy(stored)&&!Object.hasOwn(aliases(),stored)&&stored===legacyKey(item)&&!current.has(titleKey(item)))return !byProvider.has(providerKey(item));
  return ownerOf(stored)===titleKey(item);
 };
 matches.ownerOf=ownerOf;return matches;
}
const matchesKey=(stored,item,items,root)=>createMatcher(root,items)(stored,item);
// Capture only ownership proofs, never copy/change personal records or paths.
// Called before catalog replacement while the exact OLD records still exist.
function captureLegacyOwners(root,items,nextItems,io=fs){
 if(!items.length)return;
 const topology=rows=>JSON.stringify(rows.map(item=>[item.id,item.kind,provider(item),item.year||null]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(topology(items)===topology(nextItems))return;
 const keys=new Set();
 for(const name of ['media-daily.json','film-watch.json']){
  const data=readJson(path.join(root,name),io);if(!data)continue;
  for(const field of ['journal','assets','alternatives','viewingChoices'])for(const row of Array.isArray(data[field])?data[field]:[])if(isLegacy(row.titleKey))keys.add(row.titleKey);
  for(const key of Object.keys(data.queue||{}))if(isLegacy(key))keys.add(key);
 }
 if(!keys.size)return;
 const bindings=readBindings(root,io),byLegacy=new Map(),providerCounts=new Map();let changed=false;
 for(const item of items){const legacy=legacyKey(item),group=byLegacy.get(legacy)||[];group.push(item);byLegacy.set(legacy,group);const key=providerKey(item);providerCounts.set(key,(providerCounts.get(key)||0)+1);}
 for(const stored of keys){
  if(Object.hasOwn(bindings,stored))continue;
  const owners=byLegacy.get(stored);if(!owners?.length)continue;
  const unique=owners.length===1&&providerCounts.get(providerKey(owners[0]))===1;
  bindings[stored]=unique?titleKey(owners[0]):null;changed=true;
 }
 if(changed)atomicWriteFileSync(path.join(root,'media-title-relations.json'),JSON.stringify({version:1,bindings}),{io});
}

// Provider identity may share work metadata, never choose a physical local copy.
function resolveSelection(catalog,selected,input={}){
 if(input.itemId&&!String(input.itemId).startsWith('discovery:')){
  const exact=catalog.get(input.itemId);
  if(!exact||exact.id!==selected.id)throw Error('Library selection changed. Choose the exact title again.');
  return exact;
 }
 const matches=catalog.list().filter(row=>P.providerMatch(row,selected));
 if(matches.length>1)throw Error('Multiple library records match. Choose an exact library title.');
 return matches[0]||selected;
}
function queueLookup(data,items,root,matches=createMatcher(root,items)){const owned=new Map();for(const [stored,value]of Object.entries(data.queue)){const owner=matches.ownerOf(stored);if(owner&&(!owned.has(owner)||stored===owner))owned.set(owner,value);}return item=>owned.get(titleKey(item));}
const queueFor=(item,data,items,root)=>queueLookup(data,items,root)(item);
module.exports={resolveSelection,titleKey,legacyKey,matchesKey,createMatcher,captureLegacyOwners,queueFor,queueLookup};
