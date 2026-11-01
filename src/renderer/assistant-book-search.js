(function(root,factory){if(typeof module==='object')module.exports=factory(require('../assistant-retrieval'));else root.AssistantBookSearch=factory(root.AssistantRetrieval);})(typeof window==='object'?window:globalThis,retrieval=>{
 'use strict';
 async function scan({total,getText,query,start=1,current=()=>true,title='',sourceId='',sourceRevision='',itemId=''}){
  if(!Number.isInteger(total)||total<1||total>100000||!Number.isInteger(start)||start<1||start>total)throw Error('Invalid book search range.');
  const rows=[],parents=[],truncatedPages=[],end=Math.min(total,start+39);let scanned=0;
  for(let page=start;page<=end;page++){
   if(!current())throw Error('Book source changed or search stopped / Kitap kaynağı değişti veya arama durdu.');
   const full=String(await getText(page)||'');if(full.length>200000)truncatedPages.push(page);const text=full.slice(0,200000);if(!current())throw Error('Book source changed.');
   // Every text chunk is searched; only matching excerpts leave the renderer.
   const parentId='chapter-'+page,childIds=[];
   for(let offset=0;offset<text.length;offset+=1800){const id='B'+page+'-'+offset;childIds.push(id);rows.push({id,page,title,offset,text:text.slice(offset,offset+2200),parentId,sourceId,sourceRevision,itemId});}
   parents.push({id:parentId,page,text,childIds,sourceId,sourceRevision,itemId});
   scanned++;await new Promise(resolve=>setTimeout(resolve,0));
  }
  const scope={sourceIds:[sourceId],itemIds:[itemId],revisions:{[sourceId]:sourceRevision}};
  const result=retrieval.multiSearch(rows,[query],{limit:10,current,scope});
  const matches=result.matches.map(hit=>({...hit,id:'B'+hit.page+'-'+hit.offset}));
  return {status:'completed',scope:'Only the reported page/chapter batch was searched. Bounded lexical retrieval, not semantic or exhaustive whole-book search.',scanned,from:start,to:end,total,truncatedPages,complete:end===total&&!truncatedPages.length,next:end<total?end+1:null,matches,method:result.method,parentContexts:retrieval.parentContexts(matches,parents,{scope}),groups:retrieval.groupEvidence(matches).map(group=>({...group,matches:group.matches.map(hit=>hit.id)}))};
 }
 return Object.freeze({scan});
});
