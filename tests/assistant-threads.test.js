'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerAssistantThreads,cleanThread}=require('../src/assistant-thread-store');
const thread=(id='one',sourceKey='source-A')=>({id,sourceKey,title:'İstanbul',headId:'answer',messages:[{id:'question',parentId:null,role:'user',text:'Merhaba'},{id:'answer',parentId:'question',role:'assistant',text:'Partial',status:'streaming'}],revision:0});
test('Persistent threads preserve partial output, source isolation, conflict rejection and disk integrity',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-threads-'));
 try{
  const {handle}=registerAssistantThreads({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:event=>event==='owner'});
  assert.equal((await handle('foreign',{action:'save',sourceKey:'source-A',thread:thread()})).ok,false);
  const saved=await handle('owner',{action:'save',sourceKey:'source-A',thread:thread()});assert(saved.ok);assert.equal(saved.thread.revision,1);
  const reopen=await handle('owner',{action:'list',sourceKey:'source-A'});assert.equal(reopen.threads[0].messages[1].status,'stopped');assert.equal(reopen.threads[0].messages[1].text,'Partial');
  assert.equal((await handle('owner',{action:'list',sourceKey:'source-B'})).threads.length,0);
  assert.equal((await handle('owner',{action:'save',sourceKey:'source-B',thread:{...saved.thread,sourceKey:'source-B'}})).ok,false);
  assert.equal((await handle('owner',{action:'save',sourceKey:'source-A',thread:thread()})).ok,false,'Stale revision cannot overwrite newer text');
  const file=path.join(dir,'assistant-conversations.json'),before=fs.readFileSync(file,'utf8');
  assert.equal((await handle('owner',{action:'delete',sourceKey:'source-B',id:'one'})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);
  fs.writeFileSync(file,'broken fixture');assert.equal((await handle('owner',{action:'save',sourceKey:'source-A',thread:thread('two')})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),'broken fixture','Corrupt file is not silently replaced');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Parent ordering, branch references and cycle rejection preserve a valid history',()=>{
 const t=thread();t.messages.reverse();assert.equal(cleanThread(t).messages[0].id,'question');
 t.messages[1].parentId='answer';assert.throws(()=>cleanThread(t),/cycle|parent/);
 const duplicate=thread();duplicate.messages[1].id='question';assert.throws(()=>cleanThread(duplicate));
});
test('Workspace backup includes conversations and rejects a malformed archive before changing originals',()=>{
 const {exportPackage,readPackage,restorePackage,describePackage}=require('../src/workspace-package');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-backup-'));
 try{
  const rawThread=thread();rawThread.brief={goal:'Protected goal',domain:'book',responsePreferences:'Concise',sourceRevision:'source-v1'};rawThread.messages[1].scopeReceipt=[{tool:'search_book',status:'completed',scope:'Page 1 only',count:1,ids:['B1-0']}];const file=path.join(dir,'assistant-conversations.json'),original=JSON.stringify({version:1,threads:[cleanThread(rawThread)]});fs.writeFileSync(file,original);
  const notes=new (require('../src/browser-note-store').BrowserNoteStore)(path.join(dir,'browser-notes.json'));notes.upsert({id:'comparison',mediaId:'comparison-source',type:'note',timed:false,source:'Quoted snapshot',note:'AI interpretation',comparisonSources:[{id:'B1-0',kind:'book',revision:'source-v1',title:'Book',text:'Quoted snapshot',translation:'Saved translation',personalNote:'Personal note',locator:{sourceId:'book-id',page:1},role:'source'}]});

  const output=path.join(dir,'fixture.wbp');exportPackage(dir,output);const data=readPackage(output);assert.equal(describePackage(data).assistantConversations,1);
  const broken=structuredClone(data);broken.files.find(row=>row.name==='assistant-conversations.json').data=Buffer.from('{"version":1,"threads":[{}]}').toString('base64');
  assert.throws(()=>restorePackage(dir,broken));assert.equal(fs.readFileSync(file,'utf8'),original);
  fs.writeFileSync(file,JSON.stringify({version:1,threads:[]}));restorePackage(dir,data);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).threads[0].title,'İstanbul');assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).threads[0].brief.responsePreferences,'Concise');const restoredNotes=new (require('../src/browser-note-store').BrowserNoteStore)(path.join(dir,'browser-notes.json'));assert.equal(restoredNotes.get('comparison').comparisonSources[0].locator.page,1);assert.equal(restoredNotes.get('comparison').note,'AI interpretation');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('persisted book citations keep bounded original page identities',()=>{
 const t=thread();t.messages[1].citations=[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',text:'quote'},{id:'forged',page:999,sourceId:'other'}];
 const cleaned=cleanThread(t);assert.deepEqual(cleaned.messages[1].citations,[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',text:'quote'}]);
 assert.deepEqual(cleanThread(cleaned).messages[1].citations,cleaned.messages[1].citations);
});

test('thread persistence keeps valid saved-podcast source cards and drops malformed ones or unexpected fields',()=>{
 const id=n=>'P'+String(n).repeat(8)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(12);
 const card=(n,extra={})=>({id:id(n),kind:'podcast',usage:'cited',show:'Coastal',episode:'Episode',role:'source',timed:false,seconds:null,end:null,quote:'The lighthouse.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry',token:'c'.repeat(64)},scope:{limit:6,more:true},...extra});
 const base=thread(),rows=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',citations:[
  card(1),card(2,{id:'P-bad'}),card(3,{locator:{...card(3).locator,token:'short'}}),card(4,{role:'narrator'}),card(5,{quote:' '}),
  card(6,{html:'<script>x</script>',url:'file:///c:/secret',locator:{...card(6).locator,path:'C:\\secret',url:'https://evil.example'}})]}]}).messages[1].citations;
 assert.deepEqual(rows.map(row=>row.id),[id(1),id(6)]);
 assert.equal(rows[1].html,undefined);assert.equal(rows[1].url,undefined);assert.deepEqual(Object.keys(rows[1].locator).sort(),['action','episode','query','token']);
 assert.deepEqual(rows[0].scope,{limit:6,more:true});
});

test('thread persistence keeps an unknown approval result and its note',()=>{
 const base=thread(),action={kind:'app_action',proposalId:'proposal-1',tool:'open_settings',label:'Open settings',summary:'x',resultStatus:'unknown',resultText:'Check the current state.'};
 const row=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',actions:[action]}]}).messages[1].actions[0];
 assert.deepEqual([row.resultStatus,row.resultText],['unknown','Check the current state.']);
});

test('thread persistence keeps a bounded count of unverified references',()=>{
 const base=thread(),rows=cleanThread({...base,messages:[base.messages[0],{id:'answer',parentId:'question',role:'assistant',text:'x',status:'complete',basis:{unverified:2,extra:'x'}},{id:'two',parentId:'answer',role:'assistant',text:'y',basis:{unverified:-4}}]}).messages;
 assert.deepEqual(rows[1].basis,{unverified:2});assert.equal(rows[2].basis,null);
});

test('R31 continued reply keeps the ninth live card and rejects capacity overflow without rewriting the archive',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-cards-'));try{const service=registerAssistantThreads({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:()=>true}),t=thread(),card=i=>({kind:'app_action',proposalId:'card-'+i,tool:'navigate_workspace',label:'Card '+i,resultStatus:i<9?'stopped':''});t.messages[1].actions=Array.from({length:9},(_,i)=>card(i+1));let r=await service.handle({},{action:'save',sourceKey:t.sourceKey,thread:t});assert.equal(r.ok,true,r.error);const listed=await service.handle({},{action:'list',sourceKey:t.sourceKey});assert.equal(listed.threads[0].messages[1].actions.at(-1).proposalId,'card-9');assert.equal(listed.threads[0].messages[1].actions.length,9);const before=fs.readFileSync(path.join(dir,'assistant-conversations.json'),'utf8');r.thread.messages[1].actions=Array.from({length:65},(_,i)=>card(i+1));const over=await service.handle({},{action:'save',sourceKey:t.sourceKey,thread:r.thread});assert.equal(over.ok,false);assert.match(over.error,/capacity|limit|sınır/i);assert.equal(fs.readFileSync(path.join(dir,'assistant-conversations.json'),'utf8'),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('R853 historical brief, source-bound action options and scope receipts survive disk restart without restoring authority',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-brief-'));try{const init=()=>registerAssistantThreads({app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:()=>true});let service=init();const value=thread();value.brief={goal:'Compare selected sources',domain:'podcast',humanDecisions:'No production',responsePreferences:'Short replies',sourceRevision:'version-one',updatedAt:100};value.messages[1].actions=[{kind:'app_action',proposalId:'proposal',tool:'start_whisper',label:'ASR',summary:'Selected clip',sourceBasis:{kind:'video',title:'Exact episode',range:{start:1,end:5},audioKey:'private'},reviewedOptions:'{"translate":false}',resultStatus:'accepted',jobId:'job-one',token:'must-not-return'}];value.messages[1].scopeReceipt=[{tool:'search_book',status:'failed',scope:'Page read failed',count:0,total:40,truncated:true,ids:['B1-0']}];const saved=await service.handle('owner',{action:'save',sourceKey:'source-A',thread:value});assert(saved.ok,saved.error);service=init();const restored=(await service.handle('owner',{action:'list',sourceKey:'source-A'})).threads[0];assert.equal(restored.brief.responsePreferences,'Short replies');assert.equal(restored.messages[1].actions[0].jobId,'job-one');assert(!JSON.stringify(restored).includes('must-not-return'));assert(!JSON.stringify(restored).includes('private'));assert.equal(restored.messages[1].scopeReceipt[0].status,'failed');const records=require('../src/assistant-work-records');assert.equal(records.plan({kind:'book'},'Compare',restored.messages[1].actions).recordedReceipts[0].status,'accepted');const stamp=records.contextStamp({kind:'book',owner:'private-path',generation:1});assert(!stamp.includes('private-path'));assert.notEqual(stamp,records.contextStamp({kind:'book',owner:'private-path',generation:2}));const changedPlan=records.plan({kind:'book'},'Translate',restored.messages[1].actions,[],{goal:'Compare'});assert.equal(changedPlan.steps.find(s=>s.id==='produce').state,'invalidated');assert.equal(changedPlan.recordedReceipts[0].status,'accepted');const changed=await service.handle('owner',{action:'save',sourceKey:'source-A',thread:{...restored,brief:null}});assert(changed.ok);assert.equal((await service.handle('owner',{action:'list',sourceKey:'source-A'})).threads[0].brief,null);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('R853 mixed evidence preview revalidates every owner, refuses changed sources and saves a confirmed draft once',async()=>{
 const manifest=require('../src/assistant-context-manifest'),owner=manifest.clean({kind:'studio',owner:'source',thread:'thread'});let revision='one',writes=0,current=true;const store=require('../src/assistant-evidence-workbench').create({manifest,validateOwner:()=>current,notes:{save:raw=>(writes++,{ok:true,annotation:raw})},resolve:async(_,__,card)=>({id:card.id,kind:'podcast',title:'Evidence',revision,text:'Exact quotation',translation:'',personalNote:'Separate personal note',role:'translation'})});const cards=[{id:'real-card'}];const preview=await store.handle(1,{action:'mixed-preview',owner,cards,text:'Draft interpretation'});assert.equal(writes,0);revision='two';await assert.rejects(store.handle(1,{action:'mixed-save',owner,token:preview.token,text:preview.text}),/changed/);assert.equal(writes,0);const fresh=await store.handle(1,{action:'mixed-preview',owner,cards,text:'Edited interpretation'}),result=await store.handle(1,{action:'mixed-save',owner,token:fresh.token,text:fresh.text});assert(result.ok);assert.equal(result.annotation.comparisonSources[0].role,'translation');assert.equal(result.annotation.note,'Edited interpretation');assert((await store.handle(1,{action:'mixed-save',owner,token:fresh.token,text:fresh.text})).replayed);assert.equal(writes,1);current=false;await assert.rejects(store.handle(1,{action:'mixed-inspect',owner,cards}),/changed/);
});

test('R853 evidence desk inspects selected sources, invalidates edited previews and saves only explicit confirmation',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<textarea id="aiChatText"></textarea>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.UiLocale={get:()=> 'en'};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};const owner={kind:'studio',owner:'source',thread:'thread'},card={id:'Nsource',kind:'research-note',noteId:'note',revision:'v1',title:'Real source',text:'Original quotation'},manifest=require('../src/assistant-context-manifest');let writes=0;const service=require('../src/assistant-evidence-workbench').create({manifest,validateOwner:()=>true,notes:{save:raw=>(writes++,{ok:true,annotation:raw})},resolve:async()=>({id:card.id,kind:card.kind,title:card.title,revision:card.revision,text:card.text,translation:'Saved translation',personalNote:'Personal comment'})});w.AssistantAppActions={snapshot:()=>owner,current:()=>true};w.AssistantWorkspace={key:()=> 'source-key',snapshot:()=>({current:{id:'thread',messages:[]}})};w.api={assistantThreads:async()=>({ok:true,rows:[{card,threadTitle:'Source chat'}],total:1,nextOffset:null,revision:'inventory'}),assistantResearchNotes:input=>service.handle(1,input)};w.eval(fs.readFileSync('src/renderer/assistant-workbench-ui.js','utf8'));await w.AssistantWorkbenchUI.open();const find=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text),flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};const selected=w.document.querySelector('input[type=checkbox]');selected.checked=true;selected.dispatchEvent(new w.Event('change'));find('Inspect chosen sources').click();await flush();assert(w.document.querySelector('dialog').textContent.includes('Personal comment'));const editor=w.document.querySelector('dialog textarea');editor.value='My reviewed AI interpretation';find('Preview this exact draft').click();await flush();const save=find('Confirm & save new comparison note');assert.equal(save.hidden,false);assert.equal(writes,0);editor.value+=' edited';editor.dispatchEvent(new w.Event('input'));assert.equal(save.hidden,true);find('Preview this exact draft').click();await flush();save.click();await flush();assert.equal(writes,1);assert(save.hidden);assert(editor.readOnly);w.document.querySelector('dialog').close();let stored=null;const threadState={id:'thread',messages:[],brief:null};w.AssistantWorkRecords=require('../src/assistant-work-records');w.AssistantWorkspace={snapshot:()=>({current:threadState}),summaryDraft:()=> 'Historical human request; no approval.',saveBrief:async value=>{stored=value;threadState.brief=value;}};await w.AssistantWorkbenchUI.editBrief();const fields=w.document.querySelectorAll('dialog textarea');fields[0].value='My goal';fields[4].value='Short replies';find('Save reviewed brief').click();await flush();assert.equal(stored.goal,'My goal');assert.equal(stored.responsePreferences,'Short replies');assert.equal(writes,1);find('Delete saved brief').click();await flush();assert.equal(stored,null);
});

test('Fable AST-02: fresh service reopens durable receipts without reviving executable approvals',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-receipt-restart-'));
 try {
  const deps={app:{getPath:()=>dir},ipcMain:{handle(){}},authorized:e=>e==='owner'},first=registerAssistantThreads(deps),raw=thread();
  raw.messages[1].actions=['accepted','completed','unknown','applying'].map((resultStatus,i)=>({kind:'app_action',proposalId:'proposal-'+i,tool:'start_whisper',label:'Fixture receipt',resultStatus,jobId:'job-'+i,executionToken:'must-not-survive'}));
  assert((await first.handle('owner',{action:'save',sourceKey:'source-A',thread:raw})).ok);
  const fresh=registerAssistantThreads(deps),reopened=await fresh.handle('owner',{action:'list',sourceKey:'source-A'}),actions=reopened.threads[0].messages[1].actions;
  assert.deepEqual(actions.map(a=>a.resultStatus),['accepted','completed','unknown','applying']);assert.equal(actions[0].jobId,'job-0');assert(!JSON.stringify(reopened).includes('must-not-survive'));
  const plan=require('../src/assistant-work-records').plan({kind:'studio',owner:'same-source'},'Inspect',actions);assert(plan.recordedReceipts.every(r=>r.verification==='historical-owner-check-required'));
  const receipts=require('../src/assistant-receipts').createReceipts();for(const action of actions)assert.equal(receipts.get(action.proposalId),null,'historical result is not a live approval receipt');
  assert.equal((await fresh.handle('foreign',{action:'list',sourceKey:'source-A'})).ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
