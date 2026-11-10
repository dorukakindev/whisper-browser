'use strict';
const fs=require('node:fs'),{createHash}=require('node:crypto');
const {safeTarget}=require('./workspace-safe-path'),{atomicWriteFileSync}=require('./fsync-utils');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&!v.includes('\0');
const blocked=e=>e.spoiler==='marked'&&!e.spoilerAllowed;
function validate(d){
 if(d?.version!==1||!Array.isArray(d.items)||!Array.isArray(d.places)||d.items.length>1000||d.places.length>1000||Buffer.byteLength(JSON.stringify(d))>2000000)throw Error('Invalid feed reading workspace. / Geçersiz RSS okuma alanı.');
 for(const rows of [d.items,d.places]){if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate reading record.');for(const r of rows){if(!text(r.id,64)||!text(r.entryId,240)||!text(r.sourceRevision,100)||!Number.isSafeInteger(r.at)||r.at<0)throw Error('Invalid reading source.');}}
 for(const r of d.places)if(r.id!==hash([r.entryId,r.sourceRevision])||!Number.isFinite(r.position)||r.position<0||r.position>1)throw Error('Invalid reading place.');
 for(const r of d.items)if(r.id!==hash([hash([r.entryId,r.sourceRevision]),r.start,r.end])||!text(r.quote,4000)||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||r.end-r.start!==r.quote.length)throw Error('Invalid source passage.');
}
function create({root,entry,now=Date.now}){
 const file=()=>safeTarget(typeof root==='function'?root():root,'feed-reading.json');
 function read(){if(!fs.existsSync(file()))return {version:1,places:[],items:[]};if(fs.statSync(file()).size>2000000)throw Error('RSS reading limit.');const d=JSON.parse(fs.readFileSync(file(),'utf8'));validate(d);return d;}
 function get(e){const d=read(),place=d.places.find(p=>p.entryId===e.id&&p.sourceRevision===e.revision);return {revision:hash(d),position:blocked(e)?null:place?.position??null,items:blocked(e)?[]:d.items.filter(p=>p.entryId===e.id).map(p=>({...p,stale:p.sourceRevision!==e.revision})),counts:{places:d.places.length,passages:d.items.length},limit:1000};}
 function save(input){const e=entry(input.entryId),d=read();if(input.revision!==hash(d)||input.sourceRevision!==e.revision)throw Error('Reading source or workspace changed; reload. / Okuma kaynağı veya alanı değişti; yenile.');if(blocked(e))throw Error('Reveal the source first. / Önce kaynağı göster.');
  if(!Number.isFinite(input.position)||input.position<0||input.position>1)throw Error('Invalid reading place.');
  const id=hash([e.id,e.revision]),place={id,entryId:e.id,sourceRevision:e.revision,position:input.position,at:now()},i=d.places.findIndex(p=>p.id===id);if(i<0)d.places.push(place);else d.places[i]=place;
  if(input.quote!==undefined){const source=e.text||e.summary||'';if(!text(input.quote,4000)||!Number.isSafeInteger(input.start)||!Number.isSafeInteger(input.end)||input.start<0||input.end<=input.start||source.slice(input.start,input.end)!==input.quote)throw Error('Passage must match the source text. / Kesit kaynak metniyle eşleşmeli.');const item={id:hash([id,input.start,input.end]),entryId:e.id,sourceRevision:e.revision,start:input.start,end:input.end,quote:input.quote,at:now()};if(!d.items.some(p=>p.id===item.id))d.items.push(item);}
  validate(d);atomicWriteFileSync(file(),JSON.stringify(d));return get(e);
 }
 function remove(input){const e=entry(input.entryId),d=read();if(input.revision!==hash(d)||input.sourceRevision!==e.revision||blocked(e))throw Error('Reading source or workspace changed; reload.');const item=d.items.find(p=>p.id===input.id&&p.entryId===e.id);if(!item)throw Error('Saved passage changed; reload.');d.items=d.items.filter(p=>p!==item);validate(d);atomicWriteFileSync(file(),JSON.stringify(d));return get(e);}
 return {get,save,remove,references(){const d=read();return [...new Set([...d.places,...d.items].map(r=>r.entryId))];}};
}
module.exports={create,validate};
