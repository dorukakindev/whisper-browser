'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id),jumps=[];
 const reader={pdf:{numPages:3,getPage:async page=>({getTextContent:async()=>({items:[{str:page===2?'A unique search target.':'Other text'}]})})},pages:new Map()};
 Object.assign(w,{player:{pdfReader:reader},UiLocale:{get:()=> 'en'},PdfTextSearch:require('../src/pdf-text-search'),PdfReaderExperience:{context:()=>w.player.pdfReader?{}:null},matchMedia:()=>({matches:true}),renderPdfReaderPage:async()=>{}});
 el('pdfReaderPage').addEventListener('change',()=>{jumps.push(el('pdfReaderPage').value);});w.eval(fs.readFileSync(require.resolve('../src/renderer/pdf-reader-search.js'),'utf8'));
 return {w,el,reader,jumps,close:()=>w.close()};
}
test('PDF search opens with Ctrl+F, goes to the matching original page, and Escape closes only search',async()=>{
 const h=setup();try{h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}));assert(!h.el('pdfFindPanel').classList.contains('hidden'));assert.equal(h.w.document.activeElement,h.el('pdfFindText'));
 h.el('pdfFindText').value='unique';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,30));assert.deepEqual(h.jumps,['2']);assert.match(h.el('pdfFindStatus').textContent,/page 2/);assert.match(h.el('pdfFindExcerpt').textContent,/unique/);
 h.w.document.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert(h.el('pdfFindPanel').classList.contains('hidden'));assert(h.w.player.pdfReader);assert.equal(h.w.document.activeElement,h.el('pdfFindOpen'));
 }finally{h.close();}
});
test('Closing a pending search suppresses late results and replacement resets the source text',async()=>{
 const h=setup();try{let release;h.reader.pdf.getPage=()=>new Promise(done=>release=done);h.w.PdfReaderSearchUI.open();h.el('pdfFindText').value='unique';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));h.w.PdfReaderSearchUI.reset();release({getTextContent:async()=>({items:[{str:'unique'}]})});await new Promise(setImmediate);assert.equal(h.el('pdfFindStatus').textContent,'');assert.equal(h.el('pdfFindText').value,'');assert.deepEqual(h.jumps,[]);}finally{h.close();}
});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
async function searchReady(h){const end=Date.now()+2000;while(h.el('pdfFindNext').disabled&&Date.now()<end)await settle();assert.equal(h.el('pdfFindNext').disabled,false);}
test('A failed old PDF jump cannot overwrite a new search or closed panel',async()=>{
 for(const replace of [false,true]){
  const h=setup();try{
   h.w.PdfReaderSearchUI.open();h.el('pdfFindText').value='unique';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await searchReady(h);
   let rejectOld;h.w.renderPdfReaderPage=()=>new Promise((_,reject)=>{rejectOld=reject;});h.el('pdfFindNext').click();assert.equal(typeof rejectOld,'function');
   h.w.PdfReaderSearchUI.reset();
   if(replace){h.w.renderPdfReaderPage=async()=>{};h.w.PdfReaderSearchUI.open();h.el('pdfFindText').value='Other';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await searchReady(h);}
   const current=h.el('pdfFindStatus').textContent;rejectOld(Error('old page rendering failed'));await settle();assert.equal(h.el('pdfFindStatus').textContent,current,'stale navigation failure must be discarded');
  }finally{h.close();}
 }
});

test('Current PDF jump failures are localized and a later result remains usable',async()=>{
 const h=setup();try{
  let locale='en';h.w.UiLocale.get=()=>locale;h.w.PdfReaderSearchUI.open();h.el('pdfFindText').value='unique';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await searchReady(h);
  h.w.renderPdfReaderPage=async()=>{throw Error('private path must not leak');};
  for(const [language,message]of [['en','Could not open this match'],['tr','Bu eşleşme açılamadı']]){locale=language;h.el('pdfFindNext').click();await settle();assert(h.el('pdfFindStatus').textContent.startsWith(message));assert(!h.el('pdfFindStatus').textContent.includes('private'));assert.equal(h.el('pdfFindNext').disabled,false);}
  h.w.renderPdfReaderPage=async()=>{};h.el('pdfFindNext').click();await settle();assert.match(h.el('pdfFindExcerpt').textContent,/unique/);
 }finally{h.close();}
});
test('A newer match navigation owns failures within the same PDF query',async()=>{
 const h=setup();try{
  h.w.PdfReaderSearchUI.open();h.el('pdfFindText').value='Other';h.el('pdfFindForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await searchReady(h);
  let rejectOld;h.w.renderPdfReaderPage=()=>new Promise((_,reject)=>{rejectOld=reject;});h.el('pdfFindNext').click();
  h.w.renderPdfReaderPage=async()=>{};h.el('pdfFindNext').click();await settle();const latest=h.el('pdfFindStatus').textContent;
  rejectOld(Error('previous match failed'));await settle();assert.equal(h.el('pdfFindStatus').textContent,latest);assert.match(h.el('pdfFindExcerpt').textContent,/Other/);
 }finally{h.close();}
});
