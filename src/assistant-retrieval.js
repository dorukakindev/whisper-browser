'use strict';
// Independent lexical retrieval. No embeddings, model runtime or external calls.
(function(root,factory){if(typeof module==='object')module.exports=factory();else root.AssistantRetrieval=factory();})(typeof window==='object'?window:globalThis,()=>{
 const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i');
 const terms=s=>[...new Set(fold(s).match(/[\p{L}\p{N}]{2,}/gu)||[])].slice(0,30);
 function search(rows,query,{limit=8}={}){
  const keys=terms(query);if(!keys.length)return [];
  return rows.flatMap((row,index)=>{const text=String(row.text||''),hay=fold(text),title=fold(row.title);let score=0,at=-1;
   for(const key of keys){const pos=hay.indexOf(key);if(pos>=0){score+=1+Math.log1p(hay.split(key).length-1);if(at<0)at=pos;}if(title.includes(key))score+=2;}
   if(!score)return [];let originalAt=0,foldedAt=0;for(const char of text){const width=fold(char).length;if(foldedAt+width>at)break;foldedAt+=width;originalAt+=char.length;}const start=Math.max(0,originalAt-160),end=Math.min(text.length,start+900);
   return [{id:row.id||'P'+(index+1),title:String(row.title||'').slice(0,180),page:row.page,chapter:row.chapter,score:Math.round(score*100)/100,text:text.slice(start,end),offset:(Number.isInteger(row.offset)?row.offset:0)+start,truncated:start>0||end<text.length}];
  }).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id))).slice(0,Math.max(1,Math.min(12,limit)));
 }
 return Object.freeze({search,terms});
});
