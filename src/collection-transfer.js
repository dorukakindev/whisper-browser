'use strict';
const C=require('./personal-collection');
const fields=['title','rating','status','progress','volumes','total','totalVolumes','format','startDate','finishDate','note','tags'];
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function preview(root,incoming){
 const data=C.read(root),seen=new Set();
 const rows=incoming.map(source=>{
  if(seen.has(source.id))throw Error('Duplicate source identity; choose one export. / Yinelenen kaynak kimliği; tek dışa aktarım seç.');seen.add(source.id);
  const old=C.target(data.rows,source),blocked=!old&&data.rows.some(r=>r.id===source.id),next=C.merged(old,source,0);
  return {id:source.id,targetId:old?.id||null,title:source.title,domain:source.domain,kind:blocked?'blocked':old?'existing':'new',changes:fields.filter(k=>Object.hasOwn(source,k)&&!same(old?.[k],source[k])).map(key=>({key,current:old?.[key]??null,incoming:source[key]??null,defaultSource:!old||same(next[key],source[key]),conflict:!!old&&old[key]!=null&&!same(next[key],source[key])}))};
 });
 return {revision:C.hash(data),rows,count:rows.length,added:rows.filter(r=>r.kind==='new').length,conflicts:rows.filter(r=>r.changes.some(c=>c.conflict)).length};
}
function apply(root,incoming,plan,decisions,now=Date.now()){
 const data=C.read(root);if(C.hash(data)!==plan.revision)throw Error('Collection changed; preview again. / Koleksiyon değişti; yeniden önizle.');
 const previous=structuredClone(data),changes=[];
 if(!Array.isArray(decisions)||decisions.length!==plan.rows.length||new Set(decisions.map(d=>d.id)).size!==decisions.length)throw Error('Review every import row. / Her aktarım kaydını incele.');
 let added=0,updated=0,skipped=0;
 for(const p of plan.rows){
  const choice=decisions.find(d=>d.id===p.id);if(!choice||!['merge','skip'].includes(choice.action)||!Array.isArray(choice.sourceFields)||choice.sourceFields.some(k=>!p.changes.some(c=>c.key===k)))throw Error('Invalid import choice. / Geçersiz aktarım seçimi.');
  if(choice.action==='skip'){skipped++;continue;}if(p.kind==='blocked')throw Error('Corrected identity collision; skip this row. / Düzeltilmiş kimlik çakışması; bu kaydı atla.');
  const source=incoming.find(r=>r.id===p.id),old=C.target(data.rows,source),row=C.merged(old,source,now);
  const before=old?structuredClone(old):null;
  if(old){
   for(const f of p.changes){row[f.key]=choice.sourceFields.includes(f.key)?source[f.key]:old[f.key];if(row[f.key]===undefined)delete row[f.key];}
   for(const key of ['rating','status','progress'])if(!same(old[key],row[key]))row.activity=require('./personal-history').append(row.activity,key,old[key],row[key],now);
   if(!same(old.rating,row.rating))row.ratedAt=now;
   if(old.status!==row.status){row.statusMarkedAt=now;if(row.status==='completed')row.completedMarkedAt=now;}
   data.rows[data.rows.indexOf(old)]=row;updated++;
  }else{data.rows.push(row);added++;}
  // Even a later keep-current decision is evidence that the later import retained it.
  row._fieldVersions={...(row._fieldVersions||{})};for(const key of fields)if(Object.hasOwn(source,key))row._fieldVersions[key]=(row._fieldVersions[key]||0)+1;
  changes.push({id:row.id,before});
 }
 let importId=null;
 if(added||updated){
  C.stamp(data,previous);importId=require('node:crypto').randomUUID();
  const entries=changes.map(change=>{const after=data.rows.find(r=>r.id===change.id);return {id:change.id,title:after.title,created:!change.before,afterHash:C.hash(after),fields:change.before?Object.fromEntries([...new Set([...Object.keys(change.before),...Object.keys(after)])].filter(k=>k!=='_fieldVersions'&&C.hash([change.before[k]])!==C.hash([after[k]])).map(k=>[k,{before:change.before[k],existed:Object.hasOwn(change.before,k),after:after[k],version:after._fieldVersions[k]}])):{}};});
  data.imports=[...(data.imports||[]),{id:importId,at:now,source:incoming[0]?.source||'import',entries}].slice(-40);C.write(root,data);
 }
 return {added,updated,skipped,total:data.rows.length,importId};
}
const versionFields=[...fields,'providerId','domain','kind','sourceReadAt'];
function versions(root,id){const row=C.read(root).rows.find(r=>r.id===id);if(!row)throw Error('Record unavailable. / Kayıt yok.');return {id,title:row.title,current:Object.fromEntries(versionFields.map(k=>[k,k==='rating'?C.ratingOf(row):row[k]??null])),variants:(row.variants||[]).map((r,index)=>({index,source:r.source||'unknown',values:Object.fromEntries(versionFields.map(k=>[k,k==='rating'?C.ratingOf(r):r[k]??null]))}))};}
function history(root){return (C.read(root).imports||[]).map(r=>({id:r.id,at:r.at,source:r.source,count:r.entries.length,undoneAt:r.undoneAt||null})).reverse();}
function undoPlan(data,id){
 const receipt=(data.imports||[]).find(r=>r.id===id);if(!receipt||receipt.undoneAt)throw Error('Import cannot be undone. / Aktarım geri alınamıyor.');
 const rows=receipt.entries.map(e=>{const row=data.rows.find(r=>r.id===e.id);if(!row)return {id:e.id,title:e.title,action:'missing',restore:[],preserve:[]};
  if(e.created)return {id:e.id,title:e.title,action:C.hash(row)===e.afterHash?'remove':'preserve',restore:[],preserve:[]};
  const restore=[],preserve=[];for(const [key,f]of Object.entries(e.fields)){if(row._fieldVersions?.[key]===f.version&&C.hash([row[key]])===C.hash([f.after]))restore.push(key);else preserve.push(key);}
  // A retained personal value also owns its marking date and activity context.
  const dependencies={rating:['ratedAt','activity'],status:['statusMarkedAt','completedMarkedAt','activity'],progress:['activity']};
  for(const key of [...preserve])for(const dependent of dependencies[key]||[]){const index=restore.indexOf(dependent);if(index>=0){restore.splice(index,1);preserve.push(dependent);}}
  return {id:e.id,title:e.title,action:'fields',restore,preserve};
 });return {revision:C.hash(data),id,rows};
}
function undoPreview(root,id){return undoPlan(C.read(root),id);}
function undo(root,{id,revision},now=Date.now()){
 const data=C.read(root),plan=undoPlan(data,id);if(plan.revision!==revision)throw Error('Collection changed; preview again. / Koleksiyon değişti; yeniden önizle.');
 const receipt=data.imports.find(r=>r.id===id);let removed=0,restored=0,preserved=0;
 for(const p of plan.rows){const row=data.rows.find(r=>r.id===p.id),entry=receipt.entries.find(e=>e.id===p.id);if(p.action==='remove'){data.rows=data.rows.filter(r=>r.id!==p.id);removed++;}else if(p.action==='fields'){for(const key of p.restore){const f=entry.fields[key];if(f.existed)row[key]=f.before;else delete row[key];restored++;}preserved+=p.preserve.length;}else preserved++;}
 receipt.undoneAt=now;C.write(root,data);return {removed,restored,preserved};
}
const semantics={rating:'0–10; null = unrated. MAL source 0 without an explicit personal ratedAt is unrated.',progress:'Anime episodes, manga chapters, books pages/chapters, podcasts seconds. Unit is explicit per row.',dates:'startDate/finishDate are source calendar dates, not import times. importedAt/ratedAt/statusMarkedAt are epoch milliseconds; missing means unknown.',pauseNotes:'Personal paused/dropped context only; does not change rating, status or progress and is not preference evidence.',scope:'Personal collection, catalogue and saved book/podcast progress; no media files, credentials or playback URLs. JSON includes source variants, manual collections, catalogue label presentation and pause reasons; CSV summarizes selected record membership and reasons, not a restorable backup.'};
function portable(row,origin){
 const domain=row.tasteDomain||row.domain||require('./media-domains').domainOf(row),score=origin==='catalog'?row.ratings?.personal:row.rating,sourceIdentities=require('./metadata-evidence').identities(row,origin==='catalog'?'catalog':'collection');
 return {sourceIdentities,malId:sourceIdentities.nodes.mal?.id||null,anilistId:sourceIdentities.nodes.anilist?.id||null,imdbId:sourceIdentities.nodes.imdb?.id||null,tmdbId:sourceIdentities.nodes.tmdb?.id||null,metadataOverrides:row.metadataOverrides||{},metadataEvidence:row.metadataEvidence||null,schemaVersion:1,ratingSemantics:'0-10; null/empty = unrated',dateSemantics:'startDate/finishDate = source calendar date; *At = epoch milliseconds; empty = unknown',id:row.id,origin,domain,kind:row.kind,title:row.title,provider:row.provider||null,providerId:row.providerId||row.imdbId||null,metadata:origin==='collection'?row.metadata||null:null,rating:origin==='collection'?C.ratingOf(row):score==null||String(score).trim()===''?null:Number(score),ratingScale:10,status:row.watchStatus||row.status||'unspecified',progress:row.progress??null,total:row.total??null,progressUnit:row.progressUnit||(domain==='anime'?'episodes':domain==='manga'?'chapters':domain==='podcast'?'seconds':domain==='book'?'unknown':null),volumes:row.volumes??null,totalVolumes:row.totalVolumes??null,startDate:row.startDate||null,finishDate:row.finishDate||null,importedAt:row.importedAt||null,ratedAt:row.ratedAt||null,statusMarkedAt:row.statusMarkedAt||null,completedMarkedAt:row.completedMarkedAt||null,note:row.note||'',tags:row.tags||'',activity:row.activity||[],variants:row.variants||[],identityHistory:row.identityHistory||[]};
}
function exportArchive(rows,{format='json',domain=''}={},context={}){
 if(!['json','csv'].includes(format)||domain&&!require('./media-domains').DOMAINS.includes(domain))throw Error('Choose JSON/CSV and a valid pool. / JSON/CSV ve geçerli havuz seç.');
 const selected=rows.filter(r=>!domain||r.domain===domain);let text;
 if(format==='json')text=JSON.stringify({schema:'whisper-personal-library',version:1,exportedAt:new Date().toISOString(),semantics,collections:context.collections||[],pauseNotes:context.pauseNotes||[],rows:selected},null,2);
 else{
  const keys=['schemaVersion','ratingSemantics','dateSemantics','id','origin','domain','kind','title','provider','providerId','malId','anilistId','imdbId','tmdbId','rating','ratingScale','status','progress','progressUnit','total','volumes','totalVolumes','startDate','finishDate','importedAt','ratedAt','statusMarkedAt','completedMarkedAt','note','tags','collections','pauseContext','pauseReason'];
  const cell=v=>{let s=v==null?'':String(v);if(/^[\s\uFEFF]*[=+@-]/u.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  text='\uFEFF'+[keys.map(cell).join(','),...selected.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
 }
 if(Buffer.byteLength(text)>32000000)throw Error('Export exceeds 32 MB. / Dışa aktarım 32 MB sınırını aşıyor.');
 return {text,count:selected.length,filename:'whisper-personal-library.'+format,semantics};
}
module.exports={preview,apply,portable,exportArchive,versions,history,undoPreview,undo};
