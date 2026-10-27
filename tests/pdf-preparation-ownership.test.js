'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('A replaced PDF can prepare immediately; late old failure cannot alter new status or unlock its controls',async()=>{
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id),pending=[];
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 const reader=id=>({pdfHash:id,currentPage:1,pages:new Map(),pdf:{numPages:2}});
 Object.assign(w,{player:{pdfReader:reader('one')},UiLocale:{get:()=> 'en'},extractPdfReaderPage:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),MediaWorkflowsUI:{openProject:async()=>{}},api:{mediaWorkflows:async()=>({ok:true,project:{id:'project'}})}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/pdf-reader-experience.js'),'utf8'));
 const tick=()=>new Promise(setImmediate);
 try{w.PdfReaderExperience.opened();el('pdfVoicePrepare').click();await tick();assert.equal(pending.length,1);assert(el('pdfVoicePrepare').disabled);
 w.player.pdfReader=reader('two');w.PdfReaderExperience.opened();assert.equal(el('pdfVoicePrepare').disabled,false);el('pdfVoicePrepare').click();await tick();assert.equal(pending.length,2);
 pending[0].reject(Error('OLD DOCUMENT FAILURE'));await tick();assert(el('pdfVoicePrepare').disabled);assert(!el('pdfVoiceStatus').textContent.includes('OLD'));
 pending[1].resolve([{source:'Current page text'}]);await tick();assert.equal(el('pdfVoicePrepare').disabled,false);assert.match(el('pdfVoiceStatus').textContent,/Review voice settings/);
 w.PdfReaderExperience.closed();assert.equal(el('pdfVoiceAudio').ontimeupdate,null);
 }finally{dom.window.close();}
});
