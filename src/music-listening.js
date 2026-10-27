'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils');
function store(userData){
 const file=()=>path.join(userData(),'music-listening.json');
 function read(){if(!fs.existsSync(file()))return [];if(fs.statSync(file()).size>1000000)throw Error('Listening history too large');const d=JSON.parse(fs.readFileSync(file(),'utf8'));if(d.version!==1||!Array.isArray(d.trials)||d.trials.length>500)throw Error('Invalid listening history');if(d.trials.some(r=>!r||!Array.isArray(r.ids)||r.ids.length!==2||!['a','b','tie','neither'].includes(r.choice)||!Array.isArray(r.candidates)||r.candidates.length!==2||r.candidates.some(c=>!c||typeof c.title!=='string'||c.title.length>300)))throw Error('Invalid listening trial');return d.trials;}
 function save(job,request){
  if(job?.state!=='completed'||job.mode!=='search'||job.id!==request.jobId||!Array.isArray(job.result?.results))throw Error('Search changed; compare again / Arama değişti; yeniden karşılaştır.');
  if(!Array.isArray(request.ids)||request.ids.length!==2||new Set(request.ids).size!==2||!request.ids.every(id=>typeof id==='string'&&id.length<=128))throw Error('Select two distinct current matches');
  const pair=request.ids.map(id=>job.result.results.find(r=>r.id===id));if(pair.some(r=>!r))throw Error('Unknown comparison track');
  if(!['a','b','tie','neither'].includes(request.choice))throw Error('Invalid listening choice');
  const trials=read();if(trials.some(r=>r.jobId===job.id&&r.ids.slice().sort().join('\0')===request.ids.slice().sort().join('\0')))throw Error('This pair is already recorded / Bu çift zaten kaydedildi.');
  const row={id:randomUUID(),jobId:job.id,ids:request.ids,choice:request.choice,createdAt:new Date().toISOString(),intent:String(job.result.intent||'').slice(0,300),intentWeight:job.result.intentWeight??0,candidates:pair.map(r=>({id:r.id,title:String(r.title||'').slice(0,300),score:r.score,range:r.matchedRange,referenceRange:r.referenceRange,referenceTitle:String(r.referenceTitle||'').slice(0,300)})),references:(job.result.references||[]).map(r=>({id:r.id,range:r.range}))};
  trials.push(row);while(trials.length>500||Buffer.byteLength(JSON.stringify({version:1,trials}))>900000)trials.shift();atomicWriteFileSync(file(),JSON.stringify({version:1,trials}));return row;
 }
 return {read,save};
}
module.exports={store};
