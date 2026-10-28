'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture({bookGate,configGate,approvalGate}={}){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;let context;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const project=id=>({id,title:id,format:'txt',chapters:[{id:0,title:'Chapter '+id,text:'Actual text '+id,output:'chapter.wav',status:'review',groups:[{key:'1',text:'Actual text '+id,start:0,end:1,status:'review'}]}],selectedChapters:[0]});
 w.api={mediaWorkflows:async r=>r.action==='book-approve'?approvalGate.promise:r.action==='book-open'?bookGate?.(r.id)||{ok:true,project:project(r.id)}:r.action==='book-save'?{ok:true,project:project(r.id)}:r.action==='book-list'?{ok:true,projects:[{id:'one',title:'one'},{id:'two',title:'two'}]}:{ok:true},dubConfig:()=>typeof configGate==='function'?configGate():configGate?.promise||Promise.resolve({}),listVoiceReferences:async()=>({ok:true,references:[]})};
 w.syncBrowserOcclusion=async()=>{};w.globalAssistantContext=()=>context;
 w.MediaExperience={setContext:(_owner,next)=>context=next,bindPassage:()=>()=>{},context:()=>context};
 w.BookWorkflowStatus=require('../src/book-workflow-status');
 w.eval(fs.readFileSync(require.resolve('../src/renderer/media-workflows-ui.js'),'utf8'));
 return {w,dom,project};
}

for (const leave of ['switch','close']) test(`late approval cannot reclaim a book after ${leave}`,async t=>{
 const approval=gate(),f=fixture({approvalGate:approval});t.after(()=>f.dom.window.close());
 await f.w.MediaWorkflowsUI.openProject('one');
 const approve=[...f.w.document.querySelectorAll('.mw-review-group button')].find(b=>b.textContent.includes('approve'));
 approve.click();await tick();
 const form=f.w.document.querySelector('.mw-confirm form');assert(form);
 form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
 if(leave==='switch') await f.w.MediaWorkflowsUI.openProject('two');
 else { f.w.document.querySelector('.mw-dialog').close(); await new Promise(r=>setTimeout(r,5)); }
 approval.resolve({ok:true,project:f.project('one')});await tick();await tick();
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.projectId,leave==='switch'?'two':undefined);
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,leave==='switch'?'two':undefined);
});
