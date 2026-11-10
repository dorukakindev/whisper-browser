'use strict';
const path=require('node:path');
const library=require('./workspace-library-data');
const NAMES=new Set(['media-daily.json','film-watch.json','media-title-relations.json',...library.NAMES]);
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v,n=500,empty=false)=>typeof v==='string'&&v.length<=n&&!v.includes('\0')&&(empty||!!v.length);
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function check(ok){if(!ok)throw Error('Invalid personal media package schema.');}
function fields(row,allowed){check(object(row)&&Object.keys(row).every(k=>allowed.includes(k)));}
function rows(value,max){check(Array.isArray(value)&&value.length<=max);return value;}
function titleKey(value,legacyOnly=false){
 if(!str(value,1000))return false;let a;try{a=JSON.parse(value);}catch{return false;}
 if(!Array.isArray(a))return false;
 if(a.length===3&&['film','series'].includes(a[0]))return str(a[1],500)&&(a[2]===null||Number.isInteger(a[2]));
 if(legacyOnly)return false;
 return a.length===4&&a[0]==='catalog'&&str(a[1],120)&&['film','series'].includes(a[2])&&str(a[3],500,true)||a.length===3&&a[0]==='provider'&&['film','series'].includes(a[1])&&str(a[2],500);
}
function localPath(value,extension){
 check(str(value,4000)&&!/[\\/](?:\.\.?)(?:[\\/]|$)/.test(value)&&!/^https?:\/\//i.test(value));
 // Windows native paths use backslashes; reject network/device paths separately.
 check(!/^(?:[\\/]{2}|\\[?.]\\)/.test(value)&&extension.test(value));
 check(path.isAbsolute(value)||path.win32.isAbsolute(value)||value.startsWith('{{ROOT}}/')||value.startsWith('{{VIDEO}}/'));
}
function validate(name,data){
 if(library.NAMES.has(name))return library.validate(name,data);
 if(!NAMES.has(name))return;
 check(object(data)&&data.version===1);
 check(Buffer.byteLength(JSON.stringify(data))<=(name==='media-title-relations.json'?16_000_000:8_000_000));
 const flag=value=>value===undefined||typeof value==='boolean';
 if(name==='media-daily.json'){
  fields(data,['version','queue','journal','preferences','assets']);check(object(data.queue));
  for(const [key,row]of Object.entries(data.queue)){check(titleKey(key));fields(row,['bucket','order']);check(['soon','together','later'].includes(row.bucket)&& (row.order===undefined||number(row.order)));}
  for(const row of rows(data.journal,5000)){fields(row,['id','titleKey','title','date','note','rating','at']);check(str(row.id,120)&&titleKey(row.titleKey)&&str(row.title)&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&str(row.note,2000,true)&&(row.rating===null||number(row.rating)&&row.rating<=10)&&number(row.at));}
  for(const row of rows(data.preferences,100)){fields(row,['id','kind','value','title','at']);check(str(row.id,120)&&['genre-less','director-more'].includes(row.kind)&&str(row.value,120)&&str(row.title)&&number(row.at));}
  for(const row of rows(data.assets||[],2000)){fields(row,['id','titleKey','role','path','at','imported']);check(str(row.id,120)&&titleKey(row.titleKey)&&['subtitle','voice'].includes(row.role)&&number(row.at)&&flag(row.imported));localPath(row.path,row.role==='subtitle'?/\.(srt|vtt|ass|ssa)$/i:/\.(wav|mp3|flac|m4a|ogg)$/i);}
 }else if(name==='film-watch.json'){
  fields(data,['version','collections','alternatives','viewingChoices']);check(object(data.collections));
  for(const [name,row]of Object.entries(data.collections)){check(str(name,80));fields(row,['description','order']);check(str(row.description,2000,true));const order=rows(row.order,10000);check(order.every(id=>str(id,120))&&new Set(order).size===order.length);}
  for(const row of rows(data.alternatives||[],2000)){fields(row,['id','titleKey','episodeId','label','source']);check(str(row.id,120)&&titleKey(row.titleKey)&&str(row.episodeId,120,true)&&str(row.label));fields(row.source,['type','value','watchKey','imported']);check(row.source.type==='local'&&str(row.source.watchKey,4100)&&row.source.watchKey.startsWith('file:')&&flag(row.source.imported));localPath(row.source.value,/\.(mp4|mkv|webm|avi|mov|m4v|ts)$/i);}
  for(const row of rows(data.viewingChoices||[],2000)){fields(row,['titleKey','sourceId','subtitleId','voiceId']);check(titleKey(row.titleKey)&&str(row.sourceId,120)&&str(row.subtitleId,120,true)&&str(row.voiceId,120,true));}
 }else{
  fields(data,['version','bindings']);check(object(data.bindings));
  for(const [key,value]of Object.entries(data.bindings)){check(titleKey(key,true));if(value===null)continue;check(titleKey(value)&&JSON.parse(value)[0]==='catalog');const old=JSON.parse(key),owner=JSON.parse(value);check(old[0]===owner[2]&&old[1]===(owner[3]||owner[1]));}
 }
}
function mapPaths(name,data,transform){
 const result=structuredClone(data);
 if(name==='media-daily.json')for(const row of result.assets||[])row.path=transform(row.path,row.imported===true);
 if(name==='film-watch.json')for(const row of result.alternatives||[]){row.source.value=transform(row.source.value,row.source.imported===true);row.source.watchKey=transform(row.source.watchKey,row.source.imported===true);}
 return result;
}
function embedded(value,data){
 if(typeof value!=='string'||!value.startsWith('{{ROOT}}/'))return false;
 const relative=value.slice(9);return !relative.includes('\\')&&!relative.split('/').some(p=>!p||p==='.'||p==='..')&&(data.files||[]).some(f=>f.name===relative);
}
function validateReferences(name,data,bundle){
 const values=name==='media-daily.json'?(data.assets||[]).map(row=>row.path):name==='film-watch.json'?(data.alternatives||[]).map(row=>row.source.value):[];
 for(const value of values)if(value.startsWith('{{ROOT}}/')){const relative=value.slice(9);check(!relative.includes('\\')&&!relative.includes(':')&&!relative.split('/').some(p=>!p||p==='.'||p==='..'));}
}
function sanitize(name,before,after,bundle){
 if(name==='media-daily.json')for(let i=0;i<(after.assets||[]).length;i++)after.assets[i].imported=before.assets[i].imported===true||!embedded(before.assets[i].path,bundle);
 if(name==='film-watch.json')for(const row of after.alternatives||[])row.source.imported=true;
 return after;
}
function reconcileChoices(before,after){
 const watch=after.get('film-watch.json');if(!watch)return;
 const {sources}=require('./film-watch-service'),R=require('./media-title-relations'),{canonicalWatchKey}=require('./watch-library-store'),{createHash}=require('node:crypto'),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24),sourceIds=new Map(),pathsByOwner=new Map(),historyOwners=new Map();
 const addPath=(keys,oldPath,newPath,role)=>{for(const key of new Set(keys.filter(Boolean))){const pairs=pathsByOwner.get(key)||[];pairs.push([oldPath,newPath,role]);pathsByOwner.set(key,pairs);}};
 const oldItems=before.get('media-catalog.json')?.items||[],newItems=new Map((after.get('media-catalog.json')?.items||[]).map(i=>[i.id,i]));
 const legacyOwners=new Map(),ambiguous=new Set(),aliases=before.get('media-title-relations.json')?.bindings||{};
 for(const item of oldItems){const key=R.legacyKey(item);if(legacyOwners.has(key)){legacyOwners.delete(key);ambiguous.add(key);}else if(!ambiguous.has(key))legacyOwners.set(key,R.titleKey(item));const next=newItems.get(item.id);if(!next)continue;const oldSources=sources(item),newSources=sources(next);for(let i=0;i<oldSources.length;i++){if(newSources[i])sourceIds.set(oldSources[i].id,newSources[i].id);const watch=canonicalWatchKey(oldSources[i].key),owners=historyOwners.get(watch)||[];owners.push(R.titleKey(item),R.legacyKey(item));historyOwners.set(watch,owners);}}
 const oldAssets=before.get('media-daily.json')?.assets||[],newAssets=after.get('media-daily.json')?.assets||[];
 for(let i=0;i<oldAssets.length;i++)if(newAssets[i]){const row=oldAssets[i];addPath([row.titleKey,Object.hasOwn(aliases,row.titleKey)?aliases[row.titleKey]:legacyOwners.get(row.titleKey)],row.path,newAssets[i].path,row.role);}
 const history=value=>Array.isArray(value)?value:[...(value?.items||[]),...(value?.overflowItems||[])],oldHistory=history(before.get('watch-library.json')),newHistory=history(after.get('watch-library.json'));
 for(let i=0;i<oldHistory.length;i++)for(let j=0;j<(oldHistory[i].subtitlePaths||[]).length;j++)if(newHistory[i]?.subtitlePaths?.[j])addPath(historyOwners.get(canonicalWatchKey(oldHistory[i].key))||[],oldHistory[i].subtitlePaths[j],newHistory[i].subtitlePaths[j],'subtitle');
 const originals=before.get('film-watch.json')?.viewingChoices||[],assetIds=new Map();
 for(let i=0;i<(watch.viewingChoices||[]).length;i++){const row=watch.viewingChoices[i],old=originals[i];if(!old)continue;row.sourceId=sourceIds.get(old.sourceId)||row.sourceId;let ids=assetIds.get(old.titleKey);if(!ids){ids=new Map((pathsByOwner.get(old.titleKey)||[]).map(([from,to,role])=>[hash([old.titleKey,from,role]),hash([row.titleKey,to,role])]));assetIds.set(old.titleKey,ids);}for(const field of ['subtitleId','voiceId'])row[field]=ids.get(old[field])||row[field];}
}
module.exports={NAMES,validate,mapPaths,validateReferences,sanitize,embedded,reconcileChoices};
