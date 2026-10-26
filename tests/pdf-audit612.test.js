'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const PT=require('../src/pdf-translate');
test('narrow justified PDF gutters preserve column order; numeric/name hyphens survive',()=>{
 const items=require('./fixtures/pdf-column612.json');const text=PT.mergePdfTextItems(items,{pageNumber:1,pageWidth:612,pageHeight:792}).map(p=>p.text).join('\n');
 assert(text.indexOf('LEFT09')<text.indexOf('RIGHT00'));assert(text.includes('RIGHT09'));
 const single=PT.mergePdfTextItems(items.filter(i=>i.transform[4]<306),{pageNumber:1,pageWidth:612,pageHeight:792});assert.equal(single.length,1,'ordinary spaces in a single column must not create columns');
 for(const [a,b,want] of [['1990-','2000','1990-2000'],['COVID-','19','COVID-19'],['North-','South','North-South'],['inter-','national','international'],['well-','known','well-known']]){
  const row=(str,y)=>({str,width:100,height:10,transform:[1,0,0,10,60,y]});assert.equal(PT.mergePdfTextItems([row(a,700),row(b,686)],{pageNumber:1,pageWidth:612,pageHeight:792})[0].text,want);
 }
});
test('reader prepares adjacent pages for repeated margins and keeps only requested page',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8');const start=main.indexOf('function preparePdfPageRequests(');let end=start,depth=0,began=false;for(;end<main.length;end++){if(main[end]==='{'){depth++;began=true;}else if(main[end]==='}'&&--depth===0&&began){end++;break;}}
 const prepare=new Function('mapPdfItemsThroughViewport','buildPdfParagraphPages',main.slice(start,end)+';return preparePdfPageRequests;')(PT.mapPdfItemsThroughViewport,PT.buildPdfParagraphPages);
 const item=(str,y)=>({str,width:200,height:10,transform:[1,0,0,10,60,y],hasEOL:true});const page=n=>({getTextContent:async()=>({items:[item('Running header',780),item('Body page '+n,500),item('Confidential draft',15)]}),getViewport:()=>({width:612,height:792})});
 const reader={pdfHash:'fixture',pages:new Map(),pdf:{numPages:3,getPage:async n=>page(n)}};let sent;
 const sandbox={player:{pdfReader:reader},window:{api:{preparePdfText:async request=>{sent=request.pages;return{ok:true,pages:prepare(request.pages)};}}},pdfReaderSetStatus(){},interfaceChoice:(_tr,en)=>en};
 const helpers=fs.readFileSync(require.resolve('../src/renderer/renderer-helpers'),'utf8'),a=helpers.indexOf('async function extractPdfReaderPage('),b=helpers.indexOf('async function ocrPdfPage(',a);vm.createContext(sandbox);vm.runInContext(helpers.slice(a,b)+';globalThis.extract=extractPdfReaderPage',sandbox);
 const blocks=await sandbox.extract(2);assert.equal(sent.length,3);const text=blocks.map(b=>b.source).join(' ');assert.equal(text,'Body page 2');assert.equal(reader.pages.has(1),false);assert.equal(reader.pages.has(2),true);
});
