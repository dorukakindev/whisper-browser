(function(root,factory){if(typeof module==='object')module.exports=factory();else root.DubExperienceModel=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function preflight(groups,{edits={},reference=null,timingMode='video'}={}){
  const rows=groups.map(g=>{const text=edits[g.key]||g.text||'',seconds=Number(g.seconds),words=(text.match(/\S+/g)||[]).length;
   const estimated=Math.max(words/2.6,text.length/15),load=seconds>0?estimated/seconds:null;
   return {key:g.key,text,seconds,estimated:Math.round(estimated*10)/10,load,dense:load!==null&&load>1.25,long:text.length>450,edited:Object.hasOwn(edits,g.key)};});
  return {rows,dense:rows.filter(r=>r.dense).length,long:rows.filter(r=>r.long).length,referenceWarnings:Array.isArray(reference?.warnings)?reference.warnings.filter(w=>['quiet','clipping','silence','short'].includes(w)):[],referenceChecked:Number.isFinite(reference?.seconds)&&reference.seconds>0,timingMode};
 }
 function locate(rows,time){if(!Number.isFinite(time)||time<0)return null;const hits=rows.filter(r=>Number.isFinite(r.sourceStart)&&Number.isFinite(r.sourceEnd)&&time>=r.sourceStart&&time<r.sourceEnd);return hits.length===1?hits[0]:null;}
 function difference(normal,speech){
  const a=String(normal||'').split(/(\s+)/),b=String(speech||'').split(/(\s+)/);let prefix=0,suffix=0;
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  const numbers=s=>[...new Set(String(s).match(/[+-]?\d+(?:[.,]\d+)?%?/g)||[])];
  return {before:a.slice(prefix,a.length-suffix).join(''),after:b.slice(prefix,b.length-suffix).join(''),changed:normal!==speech,removedNumbers:numbers(normal).filter(n=>!numbers(speech).includes(n))};
 }
 function overlap(cues,start,end){
  let lo=0,hi=cues.length;while(lo<hi){const mid=(lo+hi)>>1;if(cues[mid].start<end)lo=mid+1;else hi=mid;}
  // Retain all overlapping source cues, not only the nearest subtitle index.
  const matches=[];for(let i=lo-1;i>=0;i--){const c=cues[i];if(c.end>start&&c.start<end)matches.push(c);}
  return matches.reverse().map(c=>c.text).join(' ');
 }
 function cueIndex(input){
  const valid=(Array.isArray(input)?input:[]).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start).slice().sort((a,b)=>a.start-b.start),rows=valid.slice(0,5000),ends=[];let maximum=-Infinity;
  for(const row of rows){maximum=Math.max(maximum,row.end);ends.push(maximum);}
  return {rows,ends,limited:valid.length>rows.length,cutoff:valid[5000]?.start??Infinity};
 }
 function indexedOverlap(index,start,end){
  let lo=0,hi=index.rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(index.rows[mid].start<end)lo=mid+1;else hi=mid;}
  const found=[];let limited=index.limited&&end>index.cutoff;for(let i=lo-1;i>=0&&index.ends[i]>start;i--){const c=index.rows[i];if(c.end>start){if(found.length>=64){limited=true;break;}found.push(String(c.text||''));}}
  const text=found.reverse().join(' ');return {text:text.slice(0,8192),limited:limited||text.length>8192};
 }
 function comparisonRows(data){
  const indexes=Object.fromEntries(['source','normal','speech'].map(key=>[key,cueIndex(data[key])])),base=indexes.speech.rows.length?indexes.speech:indexes.normal.rows.length?indexes.normal:indexes.source;
  const rows=base.rows.map(cue=>{const a=indexedOverlap(indexes.normal,cue.start,cue.end),b=indexedOverlap(indexes.speech,cue.start,cue.end),limited=a.limited||b.limited;
   const diff=!limited&&a.text&&b.text?difference(a.text,b.text):null;return {cue,changed:diff?.changed===true,missingNumbers:diff?.removedNumbers||[],limited};});
  return {rows,indexes,limited:Object.values(indexes).some(index=>index.limited)};
 }
 function continuity(raw){
  if(!raw||raw.status!=='measured'||!Number.isFinite(raw.levelDb)||raw.levelDb < -150||raw.levelDb>40||!Number.isFinite(raw.wordsPerSecond)||raw.wordsPerSecond<0||raw.wordsPerSecond>100||!Number.isFinite(raw.gainDb)||Math.abs(raw.gainDb)>2.01)return null;
  return {status:'measured',levelDb:raw.levelDb,wordsPerSecond:raw.wordsPerSecond,gainDb:raw.gainDb,warnings:Array.isArray(raw.warnings)?raw.warnings.filter(w=>['long-edge-pause','level-jump','pace-jump','level-correction-unavailable'].includes(w)).slice(0,4):[]};
 }
 return Object.freeze({preflight,locate,difference,overlap,cueIndex,indexedOverlap,comparisonRows,continuity});
});
