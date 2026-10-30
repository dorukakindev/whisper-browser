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
 function continuity(raw){
  if(!raw||raw.status!=='measured'||!Number.isFinite(raw.levelDb)||raw.levelDb < -150||raw.levelDb>40||!Number.isFinite(raw.wordsPerSecond)||raw.wordsPerSecond<0||raw.wordsPerSecond>100||!Number.isFinite(raw.gainDb)||Math.abs(raw.gainDb)>2.01)return null;
  return {status:'measured',levelDb:raw.levelDb,wordsPerSecond:raw.wordsPerSecond,gainDb:raw.gainDb,warnings:Array.isArray(raw.warnings)?raw.warnings.filter(w=>['long-edge-pause','level-jump','pace-jump','level-correction-unavailable'].includes(w)).slice(0,4):[]};
 }
 return Object.freeze({preflight,locate,difference,overlap,continuity});
});
