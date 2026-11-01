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

 // Independent bounded implementations of the multi-query, RRF, parent-coverage
 // and metadata-grouping patterns reviewed in Haystack (Apache-2.0), pinned
 // 8e38c633190ee43b80c136b335f8c9d6c79cc5d6. No framework/model dependency.
 function variants(query,catalog=[]){
  const original=String(query||'').trim().slice(0,500),result=[original],seen=new Set([fold(original)]);
  const add=value=>{const key=fold(value);if(value&&key&&!seen.has(key)&&result.length<4){seen.add(key);result.push(value.slice(0,500));}};
  for(const item of catalog.slice(0,10000)){
   const names=[item.title,item.originalTitle].filter(value=>typeof value==='string'&&value.trim().length>=3);
   for(const name of names){const q=fold(original),at=q.indexOf(fold(name));if(at<0)continue;
    const remainder=q.slice(0,at)+' '+q.slice(at+fold(name).length);
    for(const alias of names)if(fold(alias)!==fold(name))add((alias+' '+remainder).trim());
   }
   if(result.length===4)break;
  }
  return result.filter(Boolean);
 }
 function eligible(row,scope){
  if(!scope)return true;
  if(Array.isArray(scope.itemIds)&&!scope.itemIds.includes(row.itemId))return false;
  if(Array.isArray(scope.sourceIds)&&!scope.sourceIds.includes(row.sourceId))return false;
  if(scope.revisions&&scope.revisions[row.sourceId]!==row.sourceRevision)return false;
  if(Number.isFinite(scope.before)&&(!Number.isFinite(row.end)||row.end>scope.before))return false;
  return true;
 }
 const evidenceKey=row=>JSON.stringify([row.itemId||'',row.sourceId||'',row.sourceRevision||'',row.id,row.offset||0,String(row.text||'').length]);
 function fuse(lists,{limit=12}={}){
  const merged=new Map();
  for(const [channel,rows]of lists.slice(0,4).entries()){
   const seen=new Set();
   for(const [rank,row]of rows.slice(0,Math.max(100,Math.min(10000,limit))).entries()){
    const key=evidenceKey(row);if(seen.has(key))continue;seen.add(key);
    const found=merged.get(key)||{...row,score:0,channels:[]};found.score+=1/(61+rank);found.channels.push(channel);merged.set(key,found);
   }
  }
  return [...merged.values()].sort((a,b)=>b.score-a.score||evidenceKey(a).localeCompare(evidenceKey(b))).slice(0,Math.max(1,Math.min(10000,limit)));
 }
 function multiSearch(rows,queries,{scope,limit=12,current=()=>true}={}){
  const allowed=rows.filter(row=>eligible(row,scope)),byId=new Map(allowed.map(row=>[row.id,row]));
  const queryList=[...new Set(queries.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.slice(0,500)))].slice(0,4),lists=[];
  for(const query of queryList){if(!current())throw Error('Source changed or search stopped.');
   lists.push(search(allowed,query,{limit:12}).map(hit=>{const source=byId.get(hit.id);return {...hit,...Object.fromEntries(['itemId','sourceId','sourceRevision','parentId','start','end'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]])),chunkId:source.id};}));
  }
  if(!current())throw Error('Source changed or search stopped.');
  return {queries:queryList,matches:fuse(lists,{limit}),method:'bounded-lexical-rrf'};
 }
 function groupEvidence(matches){
  const groups=new Map();
  for(const row of matches){const key=JSON.stringify([row.itemId||null,row.sourceId||null,row.sourceRevision||null,row.page??row.chapter??null]);
   if(!groups.has(key))groups.set(key,{itemId:row.itemId||null,sourceId:row.sourceId||null,sourceRevision:row.sourceRevision||null,page:row.page??null,chapter:row.chapter??null,matches:[]});
   groups.get(key).matches.push(row);
  }
  for(const group of groups.values())group.matches.sort((a,b)=>(a.start??a.offset??0)-(b.start??b.offset??0)||String(a.id).localeCompare(String(b.id)));
  return [...groups.values()];
 }
 function parentContexts(matches,parents,{scope,threshold=.5,maxChars=3600,budget=3000}={}){
  const contexts=[];let remaining=Math.max(0,Math.min(12000,budget));
  for(const parent of parents){
   if(!eligible(parent,scope)||!Array.isArray(parent.childIds)||!parent.childIds.length)continue;
   const children=matches.filter(row=>row.parentId===parent.id&&row.sourceId===parent.sourceId&&row.sourceRevision===parent.sourceRevision&&row.itemId===parent.itemId);
   const ids=new Set(children.map(row=>row.chunkId));
   if(ids.size/parent.childIds.length<=threshold)continue;
   const text=String(parent.text||'');if(!text||text.length>maxChars||text.length>remaining)continue;
   remaining-=text.length;contexts.push({parentId:parent.id,page:parent.page,sourceId:parent.sourceId,sourceRevision:parent.sourceRevision,itemId:parent.itemId,text,evidenceIds:children.map(row=>row.id),scope:'Complete bounded parent text; cite its supplied child evidence IDs.'});
  }
  return contexts;
 }
 return Object.freeze({search,terms,variants,eligible,fuse,multiSearch,groupEvidence,parentContexts});
});
