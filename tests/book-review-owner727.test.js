'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture({bookGate,configGate,approvalGate,saveGate,extraChapter=false}={}){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;let context;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const project=id=>({id,title:id,format:'txt',chapters:[{id:0,title:'Chapter '+id,text:'Actual text '+id,output:'chapter.wav',status:'review',groups:[{key:'1',text:'Actual text '+id,start:0,end:1,status:'review'}]}],selectedChapters:[0]});
 w.api={mediaWorkflows:async r=>r.action==='book-approve'?approvalGate.promise:r.action==='book-open'?bookGate?.(r.id)||{ok:true,project:extraChapter&&r.id==='one'?{...project(r.id),chapters:[...project(r.id).chapters,{id:1,title:'Second chapter',text:'Second chapter text',status:'idle'}]}:project(r.id)}:r.action==='book-save'?saveGate?.(r)||{ok:true,project:project(r.id)}:r.action==='book-list'?{ok:true,projects:[{id:'one',title:'one'},{id:'two',title:'two'}]}:{ok:true},dubConfig:()=>typeof configGate==='function'?configGate():configGate?.promise||Promise.resolve({}),listVoiceReferences:async()=>({ok:true,references:[]})};
 w.syncBrowserOcclusion=async()=>{};w.globalAssistantContext=()=>context;
 w.MediaExperience={setContext:(_owner,next)=>context=next,bindPassage:()=>()=>{},context:()=>context};
 w.BookWorkflowStatus=require('../src/book-workflow-status');
 w.BookTextSearch=require('../src/book-text-search');
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

for(const leave of ['new-selection','external-open','close'])test(`late saved-book selection cannot reclaim view after ${leave}`,async t=>{
 const first=gate(),second=gate();let delayed=false;
 const f=fixture({bookGate:id=>delayed&&id==='two'?first.promise:delayed&&id==='one'?second.promise:undefined});
 t.after(()=>f.dom.window.close());await f.w.MediaWorkflowsUI.openProject('one');delayed=true;
 const choose=f.w.document.querySelector('select[aria-label="Saved book projects"]');assert(choose);
 choose.value='two';const initial=choose.onchange();await tick();
 if(leave==='new-selection'){
  choose.value='one';const newer=choose.onchange();await tick();second.resolve({ok:true,project:f.project('one')});await newer;
 }else if(leave==='external-open'){
  delayed=false;await f.w.MediaWorkflowsUI.openProject('one');
 }else{f.w.document.querySelector('.mw-dialog').close();await new Promise(r=>setTimeout(r,5));}
 first.resolve({ok:true,project:f.project('two')});await initial;await tick();
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,leave==='close'?undefined:'one');
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.projectId,leave==='close'?undefined:'one');
});

test('late chapter navigation cannot replace externally opened book chapter',async t=>{
 const save=gate();let saves=0;
 const f=fixture({extraChapter:true,saveGate:r=>++saves===1?save.promise:undefined});t.after(()=>f.dom.window.close());
 await f.w.MediaWorkflowsUI.openProject('one');
 const text=f.w.document.querySelector('textarea[data-chapter]');text.value='Edited original chapter';text.dispatchEvent(new f.w.Event('input',{bubbles:true}));
 const link=[...f.w.document.querySelectorAll('.mw-chapter button')].find(b=>b.textContent==='Second chapter');assert(link);
 const pending=link.onclick();await tick();assert.equal(saves,1);
 await f.w.MediaWorkflowsUI.openProject('two');
 save.resolve({ok:true,project:f.project('one')});await pending;await tick();
 const current=f.w.document.querySelector('textarea[data-chapter]');assert(current,'New book editor must remain rendered');
 assert.equal(current.dataset.projectId,'two');assert.equal(current.dataset.chapter,'0');
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,'two');
});

test('late passage search navigation cannot reclaim a reopened same book',async t=>{
 const save=gate();let saves=0;
 const f=fixture({extraChapter:true,saveGate:r=>++saves===1?save.promise:undefined});t.after(()=>f.dom.window.close());
 await f.w.MediaWorkflowsUI.openProject('one');
 const form=f.w.document.querySelector('.mw-search-form');assert(form);form.querySelector('input').value='Second';
 await form.onsubmit({preventDefault(){}});
 const hit=f.w.document.querySelector('.mw-search-hit');assert(hit);
 const text=f.w.document.querySelector('textarea[data-chapter]');text.value='Edited before search navigation';text.dispatchEvent(new f.w.Event('input',{bubbles:true}));
 const pending=hit.onclick();await tick();assert.equal(saves,1);
 await f.w.MediaWorkflowsUI.openProject('one');
 save.resolve({ok:true,project:f.project('one')});await pending;await tick();
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.chapter,'0','Old search hit cannot select a chapter in the reopened session');
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.currentChapter,1);
});
