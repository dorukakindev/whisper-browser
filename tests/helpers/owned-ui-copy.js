"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),{JSDOM}=require("jsdom");
module.exports=function ownedCopy(html){
 const copy=require("./timeline-localized-copy")(html),dom=new JSDOM(html,{runScripts:"outside-only"}),w=dom.window;
 try{
  let locale="en";Object.assign(w,{UiLocale:{get:()=>locale},PdfTextSearch:{},player:{pdfReader:null},interfaceChoice:(tr,en)=>locale==="en"?en:tr});
  const fields=[["pdfFindOpen","aria-label","Find in this PDF (Ctrl+F)","PDF içinde ara (Ctrl+F)"],["pdfFindText","placeholder","Search this PDF…","PDF içinde ara…"],["pdfFindText","aria-label","Search this PDF…","PDF içinde ara…"],["pdfFindSubmit",null,"Find","Bul"],["pdfFindPrevious","aria-label","Previous match","Önceki eşleşme"],["pdfFindNext","aria-label","Next match","Sonraki eşleşme"],["pdfFindClose","aria-label","Close search","Aramayı kapat"]];
  const read=([id,attr])=>{const n=w.document.getElementById(id);assert(n);return attr?n.getAttribute(attr):n.textContent;};
  const original=fields.map(read);
  w.eval(fs.readFileSync(require.resolve("../../src/renderer/pdf-reader-search.js"),"utf8"));
  fields.forEach((field,i)=>{assert.equal(read(field),field[2]);copy.set(original[i],field[2]);});
  locale="tr";w.document.dispatchEvent(new w.Event("ui-locale-change"));fields.forEach(field=>assert.equal(read(field),field[3]));
  const renderer=fs.readFileSync(require.resolve("../../src/renderer/renderer.js"),"utf8"),start=renderer.indexOf("function localizeProduct609(){"),end=renderer.indexOf("\ndocument.addEventListener('ui-locale-change',localizeProduct609)",start);assert(start>=0&&end>start);
  const nodes=[...w.document.querySelectorAll(".timeline-product-panel [data-en]")],before=nodes.map(n=>n.textContent.trim());assert(nodes.length);
  locale="en";w.eval(renderer.slice(start,end)+";localizeProduct609();");nodes.forEach((n,i)=>{assert.equal(n.textContent,n.dataset.en);copy.set(before[i],n.dataset.en);});
  locale="tr";w.localizeProduct609();nodes.forEach(n=>assert.equal(n.textContent,n.dataset.tr));
  return copy;
 }finally{w.close();}
};
