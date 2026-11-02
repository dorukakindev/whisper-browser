(function(root,factory){if(typeof module==='object')module.exports=factory();else root.DubExperienceModel=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function pronunciationCandidates(rows,saved=[]){
  const ignored=new Set(('This That These Those When Where Which What There Their They Then With From Have Just Some More Only Also Well After Before Because Would Could Should About Into Your You The And But For Not Bir Biri Bu Bunu Buna Bunun Ben Bana Biz Bize Sen Sana Siz Size Olan Olarak Onun Onlar Onlara Sonra Daha Çok Her Hiç Şimdi Eğer Ama Fakat Ancak Nasıl Neden Çünkü Yani İşte Evet Hayır').split(' ').map(w=>w.toLocaleLowerCase('tr')));
  const existing=new Set((Array.isArray(saved)?saved:[]).map(r=>r.from)),terms=new Map();
  for(const row of rows){for(const match of row.text.matchAll(/(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ][\p{L}]{2,31}(?![\p{L}\p{N}])/gu)){
   const word=match[0];if(ignored.has(word.toLocaleLowerCase('tr'))||existing.has(word))continue;
   const item=terms.get(word)||{term:word,count:0,groups:new Set()};item.count++;item.groups.add(row.key);terms.set(word,item);
  }}
  return [...terms.values()].filter(r=>r.count>=2&&r.groups.size>=2).sort((a,b)=>b.count-a.count||a.term.localeCompare(b.term,'tr')).slice(0,20).map(({term,count})=>({term,count}));
 }
 function preflight(groups,{edits={},reference=null,timingMode='video',targetLanguage='tr',pronunciations=[]}={}){
  const rows=groups.map(g=>{const edited=Object.hasOwn(edits,g.key),text=String((edited?edits[g.key]:g.text)??''),seconds=Number(g.seconds),words=(text.match(/\S+/g)||[]).length;
   const estimated=Math.max(words/2.6,text.length/15),load=seconds>0?estimated/seconds:null;
   const issues=[];if(!text.trim())issues.push('empty');
   if(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))issues.push('damaged-text');
   if(/\[(?:untranslated|translation failed|çevirilemedi)\]/iu.test(text))issues.push('translation-marker');
   // Advisory only: names and short quotations must not be treated as translation failures.
   const english=text.toLowerCase().match(/\b(?:the|this|that|which|with|would|because|they|their|have|were|will|from)\b/g)||[];
   if(targetLanguage==='tr'&&words>=10&&english.length>=4&&new Set(english).size>=3&&!/[çğıöşüÇĞİÖŞÜ]/u.test(text))issues.push('possible-source-language');
   return {key:g.key,text,seconds,estimated:Math.round(estimated*10)/10,load,dense:load!==null&&load>1.25,long:text.length>450,edited,issues};});
  return {rows,dense:rows.filter(r=>r.dense).length,long:rows.filter(r=>r.long).length,flagged:rows.filter(r=>r.issues.length).length,pronunciations:pronunciationCandidates(rows,pronunciations),referenceWarnings:Array.isArray(reference?.warnings)?reference.warnings.filter(w=>['quiet','clipping','silence','short','downmix-cancellation'].includes(w)):[],referenceChecked:Number.isFinite(reference?.seconds)&&reference.seconds>0,timingMode};
 }
 function coverage(source,groups,edits={},range=null){
  const target=cueIndex(groups.map(g=>({start:g.start/1000,end:g.end/1000,text:String(Object.hasOwn(edits,g.key)?edits[g.key]:g.text),key:g.key}))),original=cueIndex(source),issues=[],missing=[];
  if(!target.rows.length||!original.rows.length)return {checked:false,issues,missing,limited:false};
  const begin=range?.start??0,end=range?.end??Infinity;
  for(const cue of original.rows){if(cue.end<=begin||cue.start>=end)continue;const hits=indexedOverlap(target,cue.start,cue.end);if(!hits.text&&!hits.limited)missing.push({start:cue.start,end:cue.end,text:cue.text});}
  const normalize=t=>String(t).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  for(const g of groups){const match=indexedOverlap(original,g.start/1000,g.end/1000);if(match.limited||!match.text)continue;const text=String(Object.hasOwn(edits,g.key)?edits[g.key]:g.text),english=match.text.match(/\b(?:the|which|would|because|their|they|have|from)\b/gi)||[];
   if(text.length>=18&&english.length>=2&&normalize(text)===normalize(match.text))issues.push({key:g.key,issue:'source-copy'});
   const numbers=difference(match.text,text).removedNumbers;if(numbers.length)issues.push({key:g.key,issue:'number-check',numbers});
  }
  return {checked:true,issues,missing:missing.slice(0,100),limited:original.limited||target.limited||missing.length>100};
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
  const union=base.rows.slice();
  for(const key of ['normal','source'])for(const cue of indexes[key].rows)if(!indexedOverlap(base,cue.start,cue.end).text&&!union.some(row=>row.start===cue.start&&row.end===cue.end))union.push(cue);
  union.sort((a,b)=>a.start-b.start||a.end-b.end);
  const rows=union.map(cue=>{const a=indexedOverlap(indexes.normal,cue.start,cue.end),b=indexedOverlap(indexes.speech,cue.start,cue.end),limited=a.limited||b.limited;
   const unmatchedSpeech=!!a.text&&!b.text&&indexes.speech.rows.length>0;
   const diff=!limited&&a.text&&(b.text||unmatchedSpeech)?difference(a.text,b.text):null;return {cue,unmatchedSpeech,changed:diff?.changed===true,missingNumbers:diff?.removedNumbers||[],limited};});
  return {rows,indexes,limited:Object.values(indexes).some(index=>index.limited)};
 }
 function continuity(raw){
  if(!raw||raw.status!=='measured'||!Number.isFinite(raw.levelDb)||raw.levelDb < -150||raw.levelDb>40||!Number.isFinite(raw.wordsPerSecond)||raw.wordsPerSecond<0||raw.wordsPerSecond>100||!Number.isFinite(raw.gainDb)||Math.abs(raw.gainDb)>2.01)return null;
  return {status:'measured',levelDb:raw.levelDb,wordsPerSecond:raw.wordsPerSecond,gainDb:raw.gainDb,warnings:Array.isArray(raw.warnings)?raw.warnings.filter(w=>['long-edge-pause','level-jump','pace-jump','level-correction-unavailable'].includes(w)).slice(0,4):[]};
 }
 function readability(value){
  const text=String(value||'').trim(),sentences=text.split(/(?<=[.!?…])\s+/u).filter(Boolean),words=text.match(/\S+/gu)||[];
  const longest=sentences.reduce((n,part)=>Math.max(n,(part.match(/\S+/gu)||[]).length),0);
  return {words:words.length,longestSentence:longest,long:longest>35,fragment:words.length>0&&words.length<=4&&/(?:…|\.\.\.)$/.test(text)};
 }
 return Object.freeze({readability,preflight,coverage,locate,difference,overlap,cueIndex,indexedOverlap,comparisonRows,continuity});
});
