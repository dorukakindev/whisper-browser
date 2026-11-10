 'use strict';
// Optional provenance for generated local subtitle files. Old/mutated records fail closed.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&(process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function seconds(raw){if(typeof raw==='number')return Number.isFinite(raw)?raw:NaN;const t=String(raw??'').trim();if(!/^\d+(?:\.\d+)?$|^\d+:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(t))return NaN;const p=t.split(':').map(Number);if(p.length>1&&(p.at(-1)>=60||p.length===3&&p[1]>=60))return NaN;return p.reduce((sum,x)=>sum*60+x,0)}
function range(meta){const start=seconds(meta.clipStart||0),end=seconds(meta.clipEnd);return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=86400?{start,end}:null}
function snapshot(file){try{const s=fs.statSync(file);return s.isFile()?{size:s.size,mtimeMs:s.mtimeMs}:null}catch{return null}}
function subtitleSnapshot(file){
 const stat=snapshot(file);
 if(!stat||stat.size>32*1024*1024)throw Error('Subtitle input is unavailable or too large / Kaynak altyazı kullanılamıyor veya çok büyük.');
 return {path:file,hash:digest(fs.readFileSync(file))};
}
function build(meta,event){
 if(meta.translateOnly){if(!meta.subtitlePlayback)return [];meta=meta.subtitlePlayback;}
 if(meta.source!=='local'||!path.isAbsolute(meta.input||''))return [];
 const selected=range(meta);if(!selected)return [];
 if(meta.subtitleInputs){try{if(meta.subtitleInputs.some(input=>subtitleSnapshot(input.path).hash!==input.hash))return [];}catch{return []}}
 try{const stat=fs.statSync(meta.input);if(!stat.isFile()||meta.inputStat&&(stat.size!==meta.inputStat.size||stat.mtimeMs!==meta.inputStat.mtimeMs))return [];
  return (event.outputs||[]).filter(x=>x&&typeof x.path==='string'&&/\.(srt|vtt|ass|ssa)$/i.test(x.path)).slice(0,30).flatMap(x=>{try{const st=fs.statSync(x.path);if(!st.isFile()||st.size>32*1024*1024)return [];const bytes=fs.readFileSync(x.path);return [{path:x.path,subtitleHash:digest(bytes),mediaPath:path.resolve(meta.input),mediaSize:stat.size,mediaMtimeMs:stat.mtimeMs,range:selected}]}catch{return []}});
 }catch{return []}
}
function read(history,file,bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>32*1024*1024)return null;const hash=digest(bytes);
 for(const job of (Array.isArray(history)?history:[]).slice(0,500))for(const row of (Array.isArray(job?.subtitleContexts)?job.subtitleContexts:[]).slice(0,30)){
  if(!row||!same(row.path,file)||row.subtitleHash!==hash||!path.isAbsolute(row.mediaPath||'')||!range({clipStart:row.range?.start,clipEnd:row.range?.end}))continue;
  try{const stat=fs.statSync(row.mediaPath);if(stat.isFile()&&stat.size===row.mediaSize&&stat.mtimeMs===row.mediaMtimeMs)return {subtitlePath:path.resolve(file),mediaPath:path.resolve(row.mediaPath),range:{...row.range},mediaStat:{size:stat.size,mtimeMs:stat.mtimeMs}}}catch{}
 }
 return null;
}
function translationSnapshot(options,authorize){
 const request=options.subtitlePlayback;
 if(request==null)return null;
 if(options.translateOnly!==true||options.youtube||!request||typeof request!=='object'||Array.isArray(request)||typeof request.mediaPath!=='string')throw Error('Invalid subtitle playback context / Geçersiz altyazı oynatma bağlamı.');
 const selected=range({clipStart:request.range?.start,clipEnd:request.range?.end});
 const parts=typeof options.translateCueRange==='string'?options.translateCueRange.split(':').map(Number):[];
 const repair=options.translateRetryOnly===true&&!options.translateCueRange;
 if(!selected||(!repair&&(parts.length!==2||!parts.every(Number.isFinite)||parts[0]!==selected.start||parts[1]!==selected.end)))throw Error('Invalid subtitle playback range / Geçersiz altyazı oynatma aralığı.');
 const file=authorize(request.mediaPath),stat=snapshot(file);
 if(!path.isAbsolute(file)||!stat)throw Error('Subtitle playback media is unavailable / Altyazının videosu kullanılamıyor.');
 if(request.mediaStat&&(stat.size!==request.mediaStat.size||stat.mtimeMs!==request.mediaStat.mtimeMs))throw Error('Subtitle playback media changed; review again / Altyazının videosu değişti; yeniden inceleyin.');
 const subtitleInputs=[...new Set([options.input,options.translateExisting].filter(Boolean))].map(subtitleSnapshot);
 return {source:'local',input:file,inputStat:stat,clipStart:selected.start,clipEnd:selected.end,subtitleInputs};
}
function repairPlaybackProof(file,bytes,mediaPath,authorize,selectedRange=null){
 const media=authorize(mediaPath),stat=snapshot(media);
 if(!path.isAbsolute(media)||!stat||!path.isAbsolute(file)||!Buffer.isBuffer(bytes)||bytes.length>32*1024*1024)throw Error('Repair source is unavailable / Onarım kaynağı kullanılamıyor.');
 return {subtitlePath:path.resolve(file),subtitleHash:digest(bytes),mediaPath:path.resolve(media),mediaStat:stat,range:selectedRange};
}
function verifyRepairPlayback(proof,mediaPath,file,bytes,authorize){
 if(!proof||!same(proof.subtitlePath,file)||!same(proof.mediaPath,mediaPath)||!Buffer.isBuffer(bytes)||digest(bytes)!==proof.subtitleHash)throw Error('Repair source changed / Onarım kaynağı değişti.');
 const stat=snapshot(authorize(mediaPath));
 if(!stat||stat.size!==proof.mediaStat?.size||stat.mtimeMs!==proof.mediaStat?.mtimeMs)throw Error('Repair media changed / Onarımın medyası değişti.');
 return proof.range||null;
}
module.exports={build,read,range,snapshot,translationSnapshot,repairPlaybackProof,verifyRepairPlayback};
