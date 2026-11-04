// Saved output UI against the real revision-validating thread/artifact services in an isolated profile.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {registerAssistantArtifacts}=require('../src/assistant-artifact-service');
const {registerAssistantThreads}=require('../src/assistant-thread-store');
const {exportArtifact}=require('../src/assistant-artifact-export');
const sourcePath=name=>path.join(__dirname,'../src/renderer',name+'.js');
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
async function setup(t,{kind='dossier',text='# A heading [T0]\n**Bold** and *emphasis* with `code`.\n- A list item\n<img src=x onerror="window.compromised=1"> [T99]',extraReply={},sourceKey='video:ui-test',snapshot={},catalogItems=[]}={}){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'saved-output-ui-'));
 const deps={app:{getPath:()=>profile},ipcMain:{handle(){}},authorized:sender=>sender==='owner'};
 const threads=registerAssistantThreads(deps).handle;
 const artifacts=registerAssistantArtifacts({...deps,catalogStore:()=>({list:()=>[]})}).handle;

 let thread={id:'thread',sourceKey,title:'A persisted question?',revision:0,headId:'answer',messages:[{id:'question',parentId:null,role:'user',status:'complete',text:'Explain.'},{id:'answer',parentId:'question',role:'assistant',status:'complete',text,evidence:[{id:'T0',start:12,end:15,text:'A real timed source.'}],...extraReply}]};
 thread=(await threads('owner',{action:'save',sourceKey,thread})).thread;
 const created=await artifacts('owner',{action:'from-message',sourceKey,threadId:'thread',messageId:'answer',kind});
 assert.equal(created.ok,true,'fixture must be accepted by actual service');
 const dom=new JSDOM('<!doctype html><button id="origin">Open</button>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 t.after(()=>{w.close();fs.rmSync(profile,{recursive:true,force:true});});
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.requestAnimationFrame=callback=>{callback(0);return 1;};
 w.HTMLElement.prototype.getAnimations=()=>[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 for(const [name,state]of [['showPopover','open'],['hidePopover','closed']])w.HTMLElement.prototype[name]=function(){const event=new w.Event('toggle');Object.defineProperty(event,'newState',{value:state});this.dispatchEvent(event);};
 const calls=[],exports=[],seeks=[],copies=[],anchor={mediaKey:sourceKey,generation:9,...snapshot};
 w.UiLocale={get:()=> 'en'};w.syncBrowserOcclusion=()=>{};
 w.PlayerWorkspaceIntegration={snapshot:()=>anchor,seekEvidence:async(source,owner)=>{seeks.push({source,owner});return {ok:true};}};
 w.AssistantArtifactExport={exportArtifact};
 w.api={copyText:async content=>{copies.push(content);return true;},mediaCatalog:async input=>input.action==='list'?{ok:true,items:catalogItems}:{ok:true,image:'data:image/png;base64,AA=='},assistantArtifacts:async input=>{calls.push(structuredClone(input));return artifacts('owner',input);},mediaHub:async input=>{exports.push(structuredClone(input));return {ok:true};}};
 w.eval(fs.readFileSync(sourcePath('player-ui-kit'),'utf8'));w.eval(fs.readFileSync(sourcePath('assistant-artifacts-ui'),'utf8'));
 w.document.getElementById('origin').focus();await w.AssistantArtifactsUI.open(created.doc.id);
 const dialog=()=>w.document.getElementById('assistantArtifactDialog');
 const findButton=(label,scope=dialog())=>[...scope.querySelectorAll('button')].find(button=>button.textContent===label||button.getAttribute('aria-label')===label||button.querySelector('.mk-menu-copy > span')?.textContent===label);
 async function click(label,scope){const node=findButton(label,scope);assert.ok(node,'button exists: '+label);node.click();await settle();}
 async function menu(label,item){const picker=[...dialog().querySelectorAll('.mk-picker')].find(node=>node.querySelector('.mk-picker-trigger')?.getAttribute('aria-label')===label);assert.ok(picker,label+' menu exists');picker.querySelector('.mk-picker-trigger').click();await click(item,picker);}
 return {w,profile,calls,exports,seeks,copies,anchor,id:created.doc.id,dialog,click,menu,artifacts,async updateReply(value){thread.messages[1].text=value;thread=(await threads('owner',{action:'save',sourceKey,thread})).thread;assert.ok(thread);}};
}

test('saved prose renders safe markdown and only real inline citations seek the captured media owner',async t=>{
 const h=await setup(t),d=h.dialog();
 assert.equal(d.querySelector('.aa-prose h2').firstChild.textContent,'A heading ');assert.equal(d.querySelector('.aa-prose h2 .aa-citation').textContent,'1');assert.equal(d.querySelector('.aa-prose > p strong').textContent,'Bold');assert.equal(d.querySelector('.aa-prose em').textContent,'emphasis');assert.equal(d.querySelector('.aa-prose code').textContent,'code');assert.equal(d.querySelectorAll('.aa-prose li').length,1);
 assert.equal(d.querySelectorAll('img,script').length,0);assert.ok(d.textContent.includes('<img src=x onerror="window.compromised=1">'));assert.equal(h.w.compromised,undefined);assert.ok(d.textContent.includes('[T99]'));
 d.querySelector('.aa-prose .aa-citation').click();await settle();assert.equal(h.seeks.length,1);assert.equal(h.seeks[0].source.time,12);assert.equal(h.seeks[0].source.sourceKind,'subtitle');assert.equal(h.seeks[0].source.sourceKey,'video:ui-test');assert.equal(h.seeks[0].owner,h.anchor);assert.equal(h.dialog(),null);
});

test('dirty edit guards Close, Escape, export, refresh and citations without losing draft',async t=>{
 const h=await setup(t);await h.click('Edit');const input=h.dialog().querySelector('textarea');input.value='Unsaved correction';
 const before=h.calls.length;await h.click('Close');assert.ok(h.dialog().open);assert.ok(h.dialog().querySelector('[role=status]').textContent.includes('Save the correction'));
 const cancel=new h.w.Event('cancel',{cancelable:true});h.dialog().dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
 await h.menu('Export','JSON');await h.menu('More actions','Refresh from reply');h.dialog().querySelector('.aa-prose .aa-citation').click();await settle();
 assert.equal(h.calls.length,before);assert.equal(h.exports.length,0);assert.equal(h.seeks.length,0);assert.equal(input.value,'Unsaved correction');
 await h.click('Cancel');assert.equal(h.dialog().querySelector('textarea'),null);await h.click('Close');assert.equal(h.dialog(),null);assert.equal(h.w.document.activeElement.id,'origin');
});

test('save, reply refresh and version restore use service revisions and preserve user correction layer',async t=>{
 const h=await setup(t);await h.click('Edit');h.dialog().querySelector('textarea').value='My correction [T0]';await h.click('Save');
 assert.ok(h.dialog().textContent.includes('User correction'));assert.ok(h.dialog().textContent.includes('My correction'));assert.equal(h.calls.find(row=>row.action==='edit').expectedRevision,1);
 await h.updateReply('Updated source reply [T0]');await h.menu('More actions','Refresh from reply');assert.equal(h.calls.find(row=>row.action==='from-message').expectedRevision,2);
 let got=await h.artifacts('owner',{action:'get',id:h.id});assert.equal(got.doc.revision,3);assert.equal(got.body.sections[0].passages[0].text,'My correction [T0]');assert.equal(got.doc.modelBody.sections[0].passages[0].text,'Updated source reply [T0]');
 await h.menu('Versions','Restore revision · 1');got=await h.artifacts('owner',{action:'get',id:h.id});assert.equal(got.doc.revision,4);assert.deepEqual(got.doc.userEdits,{});assert.equal(h.calls.find(row=>row.action==='restore').expectedRevision,3);
});

test('spoiler content and evidence stay out of the rendered DOM and all four export menu projections',async t=>{
 const h=await setup(t,{text:'Private turn of events [T0]'});await h.click('Hide spoiler');
 assert.ok(!h.dialog().textContent.includes('Private turn of events'));assert.ok(!h.dialog().textContent.includes('A real timed source.'));assert.equal(h.dialog().querySelectorAll('.aa-citation').length,0);
 for(const format of ['CSV','JSON','MARKDOWN','HTML'])await h.menu('Export',format);
 assert.deepEqual(h.exports.map(row=>row.format),['csv','json','markdown','html']);for(const row of h.exports){assert.equal(row.action,'v3-export');assert.ok(!row.content.includes('Private turn of events'));assert.ok(!row.content.includes('A real timed source.'));}
 await h.click('Reveal');assert.ok(h.dialog().textContent.includes('Private turn of events'));assert.equal(h.calls.filter(row=>row.action==='spoiler')[1].expectedRevision,2);
});

test('stale editor revision gets an explicit conflict and keeps draft available',async t=>{
 const h=await setup(t);await h.click('Edit');const input=h.dialog().querySelector('textarea');input.value='A draft';
 assert.equal((await h.artifacts('owner',{action:'edit',id:h.id,expectedRevision:1,key:'passage:p0',value:'External edit'})).ok,true);
 await h.click('Save');assert.ok(h.dialog().querySelector('[role=status]').textContent.includes('output changed'));assert.equal(h.dialog().querySelector('textarea').value,'A draft');const got=await h.artifacts('owner',{action:'get',id:h.id});assert.equal(got.body.sections[0].passages[0].text,'External edit');
});

test('actual feed and book source IDs become safe inline citation controls',async t=>{
 for(const [marker,extraReply]of [
  ['F0123456789abcdef',{feedEvidence:[{id:'F0123456789abcdef',revision:'one',url:'https://example.com/article',text:'A feed source.'}]}],
  ['B2-7',{citations:[{id:'B2-7',sourceId:'book:two',page:7,text:'A book source.'}]}]
 ]){
  const h=await setup(t,{text:'A source-backed statement ['+marker+']',extraReply});const inline=h.dialog().querySelector('.aa-prose .aa-citation');assert.ok(inline,'valid '+marker+' source should replace raw marker with a citation');assert.equal(inline.textContent,'1');assert.ok(inline.title.includes(marker));
  inline.click();await settle();assert.equal(h.seeks.length,0,'untimed source is not a seek');assert.ok(h.dialog().querySelector('[role=status]').textContent.includes('no playback timestamp'));h.w.close();
 }
});


test('timeline edits and spoilers keep their real node identity and the export menu supports keyboard focus',async t=>{
 const h=await setup(t,{kind:'timeline',text:'A timed moment [T0]'});
 assert.ok(h.dialog().querySelector('.aa-passage').textContent.includes('0:12'));
 const trigger=[...h.dialog().querySelectorAll('.mk-picker-trigger')].find(node=>node.getAttribute('aria-label')==='Export');
 trigger.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(trigger.getAttribute('aria-expanded'),'true');
 const panel=trigger.nextElementSibling,items=[...panel.querySelectorAll('[role=menuitem]')];assert.equal(h.w.document.activeElement,items[0]);
 panel.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(h.w.document.activeElement,items[1]);
 panel.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(h.w.document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');
 await h.click('Edit');h.dialog().querySelector('textarea').value='A timeline correction [T0]';await h.click('Save');assert.equal(h.calls.find(row=>row.action==='edit').key,'node:p0-T0');
 await h.click('Hide spoiler');assert.equal(h.calls.find(row=>row.action==='spoiler').key,'node:p0-T0');assert.ok(!h.dialog().textContent.includes('A timeline correction'));
});

test('header edit, local-save footer and clipboard use the real revision and redacted projection',async t=>{
 const h=await setup(t,{text:'Visible answer [T0]\n\nPrivate answer [T1]',extraReply:{evidence:[{id:'T0',start:12,end:15,text:'Visible evidence.'},{id:'T1',start:26,end:29,text:'Private evidence.'}]}});
 assert.ok(h.dialog().querySelector('.aa-footer').textContent.includes('Saved locally'));
 assert.equal(h.dialog().querySelector('.aa-edit-note'),null);
 await h.click('Edit answer');assert.equal(h.dialog().querySelector('textarea').value,'Visible answer [T0]');assert.ok(h.dialog().querySelector('.aa-edit-note').textContent.includes('Save'));
 await h.click('Copy answer');assert.deepEqual(h.copies,[],'dirty draft cannot copy a stale answer');
 h.dialog().querySelector('textarea').value='User correction [T0]';await h.click('Save');assert.equal(h.calls.find(row=>row.action==='edit').expectedRevision,1);assert.equal(h.dialog().querySelector('.aa-edit-note'),null);
 const second=h.dialog().querySelectorAll('.aa-passage')[1];await h.click('Hide spoiler',second);
 await h.click('Copy answer');assert.equal(h.copies.length,1);assert.ok(h.copies[0].includes('User correction'));assert.ok(!h.copies[0].includes('Private answer'));assert.ok(!h.copies[0].includes('Private evidence'));
 assert.ok(!h.dialog().querySelector('.aa-source-quotes').textContent.includes('Private evidence'));
});

test('provenance uses exact catalog identity and persisted save time, omitting unavailable or different media',async t=>{
 const sourceKey=JSON.stringify(['player','file:d:/media/actual.mp4']);
 const item={id:'actual',title:'Actual media',year:2024,genres:['Documentary'],hasPoster:true,source:{watchKey:'file:d:/media/actual.mp4'}};
 const h=await setup(t,{sourceKey,snapshot:{mediaKey:'file:d:/media/actual.mp4',title:'Actual filename'},catalogItems:[item]});
 const provenance=h.dialog().querySelector('.aa-provenance'),stored=await h.artifacts('owner',{action:'get',id:h.id});
 assert.ok(provenance.textContent.includes('Actual media'));assert.ok(provenance.textContent.includes('2024'));assert.ok(provenance.querySelector('img'));assert.equal(provenance.querySelector('time').getAttribute('datetime'),new Date(stored.doc.history[0].at).toISOString());assert.equal(h.dialog().querySelector('.aa-tags').textContent,'Documentary');
 await h.click('Open scene');assert.equal(h.seeks.length,1);assert.equal(h.seeks[0].source.time,12);assert.equal(h.seeks[0].owner,h.anchor);
 const mismatch=await setup(t,{sourceKey,snapshot:{mediaKey:'file:d:/media/other.mp4',title:'Different current movie'},catalogItems:[{...item,source:{watchKey:'file:d:/media/other.mp4'}}]});
 assert.ok(!mismatch.dialog().querySelector('.aa-provenance').textContent.includes('Actual media'));assert.ok(!mismatch.dialog().textContent.includes('Different current movie'));assert.equal(mismatch.dialog().querySelector('.aa-mini-film'),null);assert.equal(mismatch.dialog().querySelector('.aa-tags'),null);
 await mismatch.click('Open scene');assert.equal(mismatch.seeks.length,0,'a known different media owner never reaches seek');assert.ok(mismatch.dialog().querySelector('[role=status]').textContent.includes('source or subtitles changed'));
});

test('numeric references retain actual IDs and real quote timestamps; further sources expand safely',async t=>{
 const h=await setup(t,{text:'One [T0]\n\nTwo [T1]\n\nThree [T2]',extraReply:{evidence:[{id:'T0',start:12,end:15,text:'First actual source.'},{id:'T1',start:26,end:29,text:'Second actual source.'},{id:'T2',start:40,end:43,text:'Third <img src=x> source.'}]}});
 assert.deepEqual([...h.dialog().querySelectorAll('.aa-prose .aa-citation')].map(node=>node.textContent),['1','2','3']);
 const references=[...h.dialog().querySelectorAll('.aa-prose .aa-citation')];assert.ok(references[2].title.includes('T2'));assert.ok(references[2].title.includes('0:40'));assert.match(references[2].dataset.sourceId,/^evidence:/);
 const quotes=h.dialog().querySelector('.aa-source-quotes');assert.equal(quotes.querySelectorAll(':scope > blockquote').length,2);const extra=quotes.querySelector('.mk-accordion-content');assert.equal(extra.hidden,true);assert.ok(extra.textContent.includes('Third <img src=x> source.'));assert.equal(extra.querySelector('img'),null);
 quotes.querySelector('.mk-accordion-toggle').click();assert.equal(extra.hidden,false);
 await h.click('0:26 ↗',quotes);assert.equal(h.seeks[0].source.id,'T1');assert.equal(h.seeks[0].source.time,26);
});
