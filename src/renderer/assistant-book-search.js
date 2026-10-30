(function(root,factory){if(typeof module==='object')module.exports=factory(require('../assistant-retrieval'));else root.AssistantBookSearch=factory(root.AssistantRetrieval);})(typeof window==='object'?window:globalThis,retrieval=>{
 'use strict';
 async function scan({total,getText,query,start=1,current=()=>true,title=''}){
  if(!Number.isInteger(total)||total<1||total>100000||!Number.isInteger(start)||start<1||start>total)throw Error('Invalid book search range.');
  const rows=[],truncatedPages=[],end=Math.min(total,start+39);let scanned=0;
  for(let page=start;page<=end;page++){
   if(!current())throw Error('Book source changed or search stopped / Kitap kaynağı değişti veya arama durdu.');
   const full=String(await getText(page)||'');if(full.length>200000)truncatedPages.push(page);const text=full.slice(0,200000);if(!current())throw Error('Book source changed.');
   // Every text chunk is searched; only matching excerpts leave the renderer.
   for(let offset=0;offset<text.length;offset+=1800)rows.push({id:'B'+page+'-'+offset,page,title,offset,text:text.slice(offset,offset+2200)});
   scanned++;await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {status:'completed',scope:'Only the reported page/chapter batch was searched. Keyword retrieval, not a semantic or exhaustive whole-book claim.',scanned,from:start,to:end,total,truncatedPages,complete:end===total&&!truncatedPages.length,next:end<total?end+1:null,matches:retrieval.search(rows,query,{limit:10})};
 }
 return Object.freeze({scan});
});
