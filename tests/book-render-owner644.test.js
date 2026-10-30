'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture({bookGate,configGate}={}){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;let context;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const project=id=>({id,title:id,format:'txt',chapters:[{id:0,title:'Chapter '+id,text:'Actual text '+id,status:'pending'}],selectedChapters:[0]});
 w.api={mediaWorkflows:async r=>r.action==='book-open'?bookGate?.(r.id)||{ok:true,project:project(r.id)}:r.action==='book-save'?{ok:true,project:project(r.id)}:r.action==='book-list'?{ok:true,projects:[{id:'one',title:'one'},{id:'two',title:'two'}]}:{ok:true},dubConfig:()=>typeof configGate==='function'?configGate():configGate?.promise||Promise.resolve({}),listVoiceReferences:async()=>({ok:true,references:[]})};
 w.syncBrowserOcclusion=async()=>{};w.globalAssistantContext=()=>context;
 w.MediaExperience={setContext:(_owner,next)=>context=next,bindPassage:()=>()=>{},context:()=>context};
 w.BookWorkflowStatus=require('../src/book-workflow-status');
 w.eval(fs.readFileSync(require.resolve('../src/renderer/media-workflows-ui.js'),'utf8'));
 return {w,dom,project};
}

test('Opening a book does not acknowledge completion before its editor has rendered',async t=>{
 const config=gate(),f=fixture({configGate:config});t.after(()=>f.dom.window.close());let settled=false;
 const pending=f.w.MediaWorkflowsUI.openProject('one').then(()=>settled=true);
 await tick();await tick();assert.equal(settled,false,'A pending reference/config read must not be reported as an open editor');
 config.resolve({});await pending;
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.projectId,'one');
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,'one');
});

test('The newest open request wins even when an older book reply arrives last',async t=>{
 const slow=gate(),f=fixture({bookGate:id=>id==='one'?slow.promise:null});t.after(()=>f.dom.window.close());
 const a=f.w.MediaWorkflowsUI.openProject('one').catch(e=>e);await tick();
 await f.w.MediaWorkflowsUI.openProject('two');await tick();
 slow.resolve({ok:true,project:f.project('one')});await a;await tick();
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.projectId,'two');
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,'two');
});

test('A late render cannot append duplicate editors after a project selection clears the same body',async t=>{
 const config=gate();let calls=0;const f=fixture({configGate:()=>++calls===1?config.promise:Promise.resolve({})});t.after(()=>f.dom.window.close());
 const pending=f.w.MediaWorkflowsUI.openProject('one').catch(e=>e);await tick();await tick();
 const choose=f.w.document.querySelector('select[aria-label="Saved book projects"]');assert(choose);
 choose.value='two';choose.dispatchEvent(new f.w.Event('change'));await tick();await tick();
 assert.equal(f.w.document.querySelector('textarea[data-chapter]')?.dataset.projectId,'two');
 config.resolve({});await pending;await tick();
 assert.equal(f.w.document.querySelectorAll('textarea[data-chapter]').length,1,'Retired render must not append into the current shared body');
 assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,'two');
});

test('Closing during preparation rejects the pending opening and cannot recreate its context',async t=>{
 const config=gate(),f=fixture({configGate:config});t.after(()=>f.dom.window.close());
 const pending=f.w.MediaWorkflowsUI.openProject('one').catch(e=>e);await tick();await tick();
 f.w.document.querySelector('dialog').close();await new Promise(r=>setTimeout(r,5));config.resolve({});
 const error=await pending;assert.match(error.message,/replaced|closed/);assert.equal(f.w.document.querySelector('dialog'),null);assert.equal(f.w.MediaWorkflowsUI.assistant.state(),null);
});

test('A queued close event cannot dispose the newer book assistant mount',async t=>{
 const f=fixture(),disposed=[];t.after(()=>f.dom.window.close());
 f.w.BookAssistantUI={mount:(edit)=>{const id=edit.querySelector('textarea[data-chapter]').dataset.projectId;return ()=>disposed.push(id);}};
 await f.w.MediaWorkflowsUI.openProject('one');await f.w.MediaWorkflowsUI.openProject('two');await new Promise(r=>setTimeout(r,5));
 assert.deepEqual(disposed,['one']);assert.equal(f.w.MediaWorkflowsUI.assistant.state()?.id,'two');
});

test('A failed editor preparation returns its real failure rather than a completed receipt',async t=>{
 const f=fixture({configGate:()=>Promise.reject(Error('Controlled settings unavailable'))});t.after(()=>f.dom.window.close());
 await assert.rejects(f.w.MediaWorkflowsUI.openProject('one'),/Controlled settings unavailable/);
 assert.equal(f.w.document.querySelector('textarea[data-chapter]'),null);
});

test('An assistant open action cannot report completed after its book view was closed during rendering',async t=>{
 const config=gate();let calls=0;const f=fixture({configGate:()=>++calls===1?Promise.resolve({}):config.promise});t.after(()=>f.dom.window.close());
 await f.w.MediaWorkflowsUI.openProject('one');
 const pending=f.w.MediaWorkflowsUI.assistant.execute('book_chapter',{chapter:1,operation:'open'},()=>false).catch(e=>e);
 await tick();f.w.document.querySelector('dialog').close();await new Promise(r=>setTimeout(r,5));config.resolve({});
 const result=await pending;assert.match(result.message||'',/Book changed/);assert.notEqual(result.status,'completed');
});

test('explicit chapter handoff focuses the rendered editor without requiring a second click',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());await f.w.MediaWorkflowsUI.openProject('one',{chapter:0,selectChapter:true});
 const editor=f.w.document.querySelector('textarea[data-chapter]');assert(editor);assert.equal(f.w.document.activeElement,editor);assert.equal(editor.value,'Actual text one');
});

test('chapter handoff saves the exact dirty origin before focusing another book',async t=>{
 const f=fixture();t.after(()=>f.dom.window.close());const calls=[],original=f.w.api.mediaWorkflows;f.w.api.mediaWorkflows=async r=>{calls.push({...r});return original(r);};
 await f.w.MediaWorkflowsUI.openProject('one');const input=f.w.document.querySelector('textarea[data-chapter]');input.value='User revised paragraph.';
 await f.w.MediaWorkflowsUI.openProject('two',{chapter:0,selectChapter:true});
 const saved=calls.find(r=>r.action==='book-save'&&r.id==='one');assert(saved);assert.equal(saved.text,'User revised paragraph.');assert.equal(saved.chapter,0);
 assert(calls.indexOf(saved)<calls.findIndex(r=>r.action==='book-open'&&r.id==='two'));assert.equal(f.w.document.activeElement.dataset.projectId,'two');
});
