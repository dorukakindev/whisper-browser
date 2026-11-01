'use strict';
const fs=require('node:fs');
const {normalize}=require('./dub-pronunciation');
const {atomicWriteFileSync}=require('./fsync-utils');
function createStore(file){
 const validKey=key=>{if(typeof key!=='string'||!/^\w+-[a-f0-9]{64}$/.test(key))throw Error('Invalid pronunciation scope.');};
 function read(){
  if(!fs.existsSync(file))return {version:1,sources:{}};
  if(fs.statSync(file).size>1000000)throw Error('Pronunciation collection exceeds 1 MB.');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.version!==1||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources)||Object.keys(data.sources).length>200)throw Error('Pronunciation collection is damaged; original file preserved.');
  for(const [key,entries]of Object.entries(data.sources)){validKey(key);normalize(entries);}
  return data;
 }
 function resolve(key,globalEntries=[]){
  validKey(key);const data=read(),entries=data.sources[key]||[];
  const merged=new Map(normalize(globalEntries).map(row=>[row.from,row]));
  for(const row of normalize(entries))merged.set(row.from,row);
  return {entries:normalize(entries),pronunciations:normalize([...merged.values()]),scope:'source'};
 }
 function save(key,entries,globalEntries=[]){
  validKey(key);const normalized=normalize(entries),data=read();
  if(normalized.length)data.sources[key]=normalized;else delete data.sources[key];
  if(Object.keys(data.sources).length>200)throw Error('Use at most 200 source dictionaries.');
  const merged=new Map(normalize(globalEntries).map(row=>[row.from,row]));for(const row of normalized)merged.set(row.from,row);normalize([...merged.values()]);
  const json=JSON.stringify(data);if(Buffer.byteLength(json)>1000000)throw Error('Pronunciation collection exceeds 1 MB.');
  atomicWriteFileSync(file,json,{encoding:'utf8'});return resolve(key,globalEntries);
 }
 return {resolve,save};
}
module.exports={createStore};
