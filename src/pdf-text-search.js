(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./book-text-search'));else root.PdfTextSearch=factory(root.BookTextSearch);})(typeof globalThis!=='undefined'?globalThis:this,bookSearch=>{
 'use strict';
 async function search(document,query,{isCurrent=()=>true,onProgress=()=>{},limit=80,maxPages=1000,maxChars=4000000}={}){
  if(!Number.isInteger(document?.numPages)||document.numPages<1||document.numPages>100000||typeof document.getText!=='function')throw Error('Invalid PDF source.');
  if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(maxPages)||maxPages<1||maxPages>1000||!Number.isInteger(maxChars)||maxChars<1||maxChars>4000000)throw Error('Invalid PDF search budget.');
  const result={matches:[],scanned:0,total:document.numPages,failedPages:[],truncated:false,cancelled:false};
  if(String(query||'').trim().length<2)return result;
  let characters=0;
  for(let page=1;page<=Math.min(document.numPages,maxPages);page++){
   if(!isCurrent())return {...result,matches:[],cancelled:true};
   let text;
   try{text=await document.getText(page);}catch(error){if(!isCurrent())return {...result,matches:[],cancelled:true};result.failedPages.push(page);result.scanned=page;result.truncated=page===maxPages&&page<document.numPages;onProgress({...result,matches:result.matches.slice()});continue;}
   if(!isCurrent())return {...result,matches:[],cancelled:true};
   if(typeof text!=='string')throw Error('Invalid PDF page text.');
   const remaining=maxChars-characters,source=text.slice(0,remaining);characters+=source.length;
   const found=await bookSearch.search([{text:source}],query,{limit:limit-result.matches.length,isCurrent});
   if(found.cancelled||!isCurrent())return {...result,matches:[],cancelled:true};
   result.matches.push(...found.matches.map(({start,end,excerpt})=>({page,start,end,excerpt})));result.scanned=page;
   result.truncated=found.truncated||source.length<text.length||characters>=maxChars&&page<document.numPages||page===maxPages&&page<document.numPages;
   onProgress({...result,matches:result.matches.slice()});
   if(result.truncated||result.matches.length>=limit){result.truncated||=page<document.numPages;break;}
  }
  return result;
 }
 return Object.freeze({search});
});
