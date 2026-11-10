'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('final verified action cards survive missing events and deduplicate a late event',async()=>{
 const h=fixture(),seen=[];try{
  h.w.AssistantWorkspace.evidence=(_job,value)=>seen.push(value.actions.map(a=>a.proposalId));
  const action={kind:'app_action',proposalId:'verified-card',tool:'open_saved_podcast_passage',label:'Open passage',summary:'Exact saved source'};
  const run=h.ui.send('Find and open the quote',{},[],'scope');await new Promise(setImmediate);
  const requestId=h.ui.status().id;h.settle({ok:true,text:'Review the card',actions:[action,action]});await run;
  assert.deepEqual(Array.from(seen.at(-1)),['verified-card']);
  h.event({type:'proposal',requestId,action});assert.deepEqual(Array.from(seen.at(-1)),['verified-card']);
 }finally{h.close();}
});

function fixture(){
 const dom=new JSDOM('<body><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'}),w=dom.window;
 let onEvent,settle,requests=0,locale='tr';const runs=[];const owner={owner:'source-A',thread:'thread-A'};
 Object.assign(w,{UiLocale:{get:()=>locale},AssistantAppActions:{snapshot:()=>owner,current:()=>true},AssistantContextManifest:require('../src/assistant-context-manifest'),AssistantWorkspace:{begin(){},finish(){},partial(){}},api:{onAssistantAgentEvent:fn=>{onEvent=fn;return ()=>{};},assistantAgentRun:packet=>{requests++;runs.push(packet);return new Promise(resolve=>settle=resolve);},assistantAgentCancel:async()=>({ok:true})},player:{},updateAiChatActions(){},autoGrowChatBox(){},saveAppSettings:async()=>true,renderAiText:(bubble,text)=>bubble.textContent=text,aiChatAdd:(role,text)=>{const n=w.document.createElement('div');n.textContent=text;w.document.body.append(n);return n;}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'));
 return {w,ui:w.AssistantAgentUI,event:value=>onEvent(value),settle:value=>settle(value),requests:()=>requests,runs,locale:value=>locale=value,close:()=>w.close()};
}

test('send review uses the actual provider history bounds and excludes watched-only history',async()=>{
 const h=fixture();try{
  h.w.AssistantRunSteps=require('../src/assistant-run-steps');let preview;
  h.w.AssistantSendPreview={review:async({packet})=>{preview=packet;return packet;}};
  const history=Array.from({length:15},(_,i)=>({role:i%2?'assistant':'user',content:String(i).padEnd(6000,'x')}));
  let run=h.ui.send('q'.repeat(17000),{},history,'scope');await new Promise(setImmediate);
  assert.equal(preview.question.length,16000);assert.equal(preview.history.length,12);assert.equal(preview.history[0].content,history[3].content.slice(0,5000));
  assert.equal(preview.historyScope.omitted,3);assert.equal(preview.historyScope.shortened,12);
  assert.deepEqual(JSON.parse(JSON.stringify(h.runs[0].history)),JSON.parse(JSON.stringify(preview.history)));
  h.settle({ok:true,text:'Done'});await run;
  h.w.AssistantAppActions.snapshot=()=>({kind:'video',owner:'source-A',thread:'thread-A',time:10});
  run=h.ui.send('Explain so far',{},history,'scope');await new Promise(setImmediate);
  assert.equal(preview.history.length,0);assert.equal(preview.historyScope.excludedForScope,true);
  h.settle({ok:true,text:'Done'});await run;
 }finally{h.close();}
});

test('reopened receipts never gain live authority from a matching job ID and result counts deduplicate failures',()=>{
 const steps=require('../src/assistant-run-steps'),jobs=[{id:'job1',state:'completed'}];
 assert.equal(steps.actionState({jobId:'job1',resultStatus:'accepted'},jobs,false).state,'unverified');
 assert.equal(steps.actionState({jobId:'job1',resultStatus:'failed'},jobs,false).state,'failed');
 assert.equal(steps.actionState({jobId:'job1',resultStatus:'accepted'},jobs,true).state,'completed');
 assert.equal(steps.actionState({proposalId:'old'},jobs,false).requiresReview,true);
 const result=steps.review([{proposalId:'p1',state:'failed'},{proposalId:'p2',state:'accepted'}],[{id:'s1',name:'translate',state:'failed',proposalId:'p1'},{id:'s2',name:'app_help',state:'completed'}]);
 assert.equal(result.failed,1);assert.equal(result.accepted,1);assert.equal(result.completed,0);assert.equal(result.reads,1);assert.equal(steps.review([],[{id:'old-read',name:'search_library',state:'unknown'}]).unverified,1);
});

test('continuation capacity rejects before resuming, saving or calling the provider',async()=>{
 const h=fixture();try{let resumed=0;h.w.AssistantRunSteps=require('../src/assistant-run-steps');
  h.w.AssistantWorkspace.snapshot=()=>({current:{messages:[{actions:Array.from({length:57},(_,i)=>({proposalId:'p'+i}))}]}});
  h.w.AssistantWorkspace.resume=()=>{resumed++;throw Error('Must not resume');};
  await assert.rejects(h.ui.send('Continue',{},[],'scope',{proposalId:'p56',token:'old-flow'}),/capacity reached/);
  assert.equal(resumed,0);assert.equal(h.requests(),0);assert.equal(h.ui.busy(),false);
 }finally{h.close();}
});
test('approved send preview keeps its attachment and click-time clock through the real send bridge',async()=>{
 const h=fixture();try{let clock=10,approve;h.w.AssistantAppActions.snapshot=()=>({kind:'video',owner:'source-A',thread:'thread-A',time:clock,subtitleKey:'captions-1'});h.w.AssistantSendPreview={review:({packet})=>new Promise(resolve=>{approve=()=>resolve(packet);})};const context={excerpt:'Frozen passage'},run=h.ui.send('Summarize so far',context,[],'scope');assert.equal(h.requests(),0);clock=30;context.excerpt='Changed after review';approve();await new Promise(setImmediate);assert.equal(h.runs[0].owner.time,10);assert.equal(h.runs[0].context.excerpt,'Frozen passage');h.settle({ok:true,text:'Answer'});await run;h.w.document.getElementById('aiChatText').value='';h.w.AssistantSendPreview={review:async()=>null};const cancelled=await h.ui.send('Keep this draft',{},[],'scope');assert.equal(cancelled.previewCancelled,true);assert.equal(h.requests(),1);assert.equal(h.w.document.getElementById('aiChatText').value,'Keep this draft');}finally{h.close();}
});
test('Timeout retains partial reply, releases busy state and permits a deliberate retry',async()=>{
 const h=fixture();try{const run=h.ui.send('Explain',{},[],'scope');await new Promise(setImmediate);const id=h.ui.status().id;
 h.event({type:'delta',requestId:id,text:'Received partial answer'});h.event({type:'progress',requestId:id,phase:'tool',domain:'library'});
 assert.match(h.ui.status().activity,/Kütüphane/);h.locale('en');assert.match(h.ui.status().activity,/Reading library/);
 h.event({type:'progress',requestId:'stale',phase:'tool',domain:'voice'});assert.match(h.ui.status().activity,/Reading library/);
 h.settle({ok:false,timedOut:true,cancelled:false,error:'Assistant timed out; retry.'});await run;
 assert.equal(h.ui.busy(),false);assert.equal(h.ui.status(),null);assert.equal(h.ui.canRetry(),true);assert(h.w.document.body.textContent.includes('Received partial answer'));
 const retry=h.ui.retry();await new Promise(setImmediate);assert.equal(h.requests(),2);h.settle({ok:true,text:'Successful retry'});await retry;assert.equal(h.ui.canRetry(),false);assert.equal(h.ui.busy(),false);
 }finally{h.close();}
});
test('Explicit stop shows stopping and preserves text without offering automatic retry',async()=>{
 const h=fixture();try{const run=h.ui.send('Explain',{},[],'scope');await new Promise(setImmediate);const id=h.ui.status().id;h.event({type:'delta',requestId:id,text:'Kept text'});await h.ui.cancel();assert.match(h.ui.status().activity,/durduruluyor/);h.settle({ok:false,cancelled:true});await run;assert.equal(h.ui.canRetry(),false);assert(h.w.document.body.textContent.includes('Kept text'));}finally{h.close();}
});

test('A failed Continue keeps its card, retries the original flow and disappears after success',async()=>{
 const h=fixture();try{let job;h.w.AssistantFlowState=require('../src/assistant-flow-state');Object.assign(h.w,{aiChatContext:()=>({}),aiSourceScope:()=> 'scope'});
 Object.assign(h.w.AssistantWorkspace,{begin:j=>job=j,evidence(){},actionResult(){},canResume:()=>true,toolContext:()=>({}),resume:()=>({job,text:'Previous result',actions:[],evidence:[]})});
 h.w.api.assistantAgentApply=async()=>({ok:true,result:{status:'completed',continuationId:'lease',continuationState:'ready'}});
 const p={proposalId:'p',kind:'app_action'};const initial=h.ui.send('Original request',{},[],'scope');await new Promise(setImmediate);h.event({type:'proposal',requestId:h.ui.status().id,action:p});h.settle({ok:true,text:'Apply first'});await initial;await h.ui.apply(p);
 const first=h.ui.continueAction(p);await new Promise(setImmediate);h.settle({ok:false,error:'Provider failed'});await first;assert(h.ui.flowInfo(p).canContinue);assert.equal(h.ui.busy(),false);
 const next=h.ui.continueAction(p);await new Promise(setImmediate);h.settle({ok:true,text:'Continued'});await next;assert.equal(h.ui.flowInfo(p).canContinue,false);assert.equal(h.requests(),3);
 }finally{h.close();}
});

test('Continuation UI follows the exact main job without a polling model request',async()=>{const h=fixture();try{let state='running';h.w.AssistantFlowState=require('../src/assistant-flow-state');h.w.AssistantJobsUI={snapshot:()=>({jobs:[{id:'exact',state,percent:55},{id:'other',state:'completed'}]})};Object.assign(h.w.AssistantWorkspace,{evidence(){},actionResult(){},canResume:()=>true});h.w.api.assistantAgentApply=async()=>({ok:true,result:{status:'accepted',continuationId:'token',continuationState:'waiting',continuationJobId:'exact'}});const run=h.ui.send('Translate and explain',{},[],'scope');await new Promise(setImmediate);const id=h.ui.status().id,proposal={proposalId:'proposal',kind:'app_action'};h.event({type:'proposal',requestId:id,action:proposal});h.settle({ok:true,text:'Apply first.'});await run;await h.ui.apply(proposal);assert.equal(h.ui.flowInfo(proposal).waiting,true);assert.equal(h.ui.flowInfo(proposal).flowState,'running');state='completed';assert.equal(h.ui.flowInfo(proposal).waiting,false);assert.equal(h.ui.flowInfo(proposal).canContinue,true);state='failed';assert.equal(h.ui.flowInfo(proposal).canContinue,true);assert.equal(h.ui.flowInfo(proposal).retryable,true);assert.match(h.ui.flowInfo(proposal).flowNote,/başarısız/);state='stopped';assert.equal(h.ui.flowInfo(proposal).canContinue,false);assert.equal(h.requests(),1);}finally{h.close();}});


test('Pipeline activity names the exact load, dubbing and attachment stages in both interface languages',()=>{
 const h=fixture();try{h.w.AssistantRunSteps=require('../src/assistant-run-steps');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-run-card'),'utf8'));
 const steps=['start_whisper','use_job_subtitles','start_voice_generation','use_generated_voice'].map((name,i)=>({id:'stage-'+i,name,state:i===2?'failed':'completed'}));
 for(const locale of ['en','tr']){const card=h.w.AssistantRunCard.create(steps,'pipeline-'+locale,locale);assert.equal(card.querySelectorAll('li').length,4);assert.equal(card.querySelectorAll('li[data-state="failed"]').length,1);assert.equal(card.dataset.state,'failed');assert(!card.textContent.includes(locale==='tr'?'Uygulama kontrolü':'Application check'));assert.match(card.textContent,locale==='tr'?/Dublaj üret/:/Generate dubbing/);}
 }finally{h.close();}
});

test('An explicit stop wins a racing successful final reply and never publishes it as a completed answer',async()=>{
 const h=fixture();try{let state;let answers=0;h.w.AssistantWorkspace.finish=(_job,_text,value)=>{state=value;};h.w.document.addEventListener('assistant-answer',()=>answers++);
 const pending=h.ui.send('Explain',{},[],'scope');await new Promise(setImmediate);h.event({type:'delta',requestId:h.ui.status().id,text:'Received before stop'});await h.ui.cancel();h.settle({ok:true,text:'Late final success'});const result=await pending;
 assert.equal(state,'stopped');assert.equal(result.ok,false);assert.equal(result.cancelled,true);assert.equal(answers,0);assert.equal(h.w.player.chatHistory,undefined);assert(h.w.document.body.textContent.includes('Received before stop'));assert(!h.w.document.body.textContent.includes('Late final success'));assert.equal(h.ui.busy(),false);assert.equal(h.ui.canRetry(),false);
 }finally{h.close();}
});

test('Continuing a "so far" request reuses its frozen context and never rebuilds an unbounded live one',async()=>{
 const h=fixture();let job,rebuilt=0;
 try{
  h.w.AssistantFlowState=require('../src/assistant-flow-state');Object.assign(h.w,{aiSourceScope:()=> 'scope',aiChatContext:()=>{rebuilt++;return {sonraki:[{metin:'FUTURE_MARKER_CONTEXT'}]};}});
  Object.assign(h.w.AssistantWorkspace,{begin:j=>job=j,evidence(){},actionResult(){},canResume:()=>true,toolContext:()=>({}),resume:()=>({job,text:'Previous result',actions:[],evidence:[]})});
  h.w.api.assistantAgentApply=async()=>({ok:true,result:{status:'completed',continuationId:'lease',continuationState:'ready'}});
  const bounded={workspace:'podcast',transcript_evidence:{scope:'watched',position:600,evidence:[{id:'T1',metin:'HEARD_MARKER_CONTEXT',baslangic:1,bitis:2}]}};
  for(const [proposalId,question,context] of [['p1','Bu ana kadar ne söylendi?',bounded],['p2','Explain what happens up to now.',bounded]]){
   const p={proposalId,kind:'app_action'},initial=h.ui.send(question,context,[],'scope');await new Promise(setImmediate);h.event({type:'proposal',requestId:h.ui.status().id,action:p});h.settle({ok:true,text:'Apply first'});await initial;await h.ui.apply(p);
   const next=h.ui.continueAction(p);await new Promise(setImmediate);const sent=h.runs.at(-1);
   assert.equal(rebuilt,0,question);assert.match(JSON.stringify(sent.context),/HEARD_MARKER_CONTEXT/);assert.doesNotMatch(JSON.stringify(sent),/FUTURE_MARKER_CONTEXT/);h.settle({ok:true,text:'Continued'});await next;
  }
  const plain={proposalId:'p3',kind:'app_action'},start=h.ui.send('Explain the scene',{},[],'scope');await new Promise(setImmediate);h.event({type:'proposal',requestId:h.ui.status().id,action:plain});h.settle({ok:true,text:'Apply first'});await start;await h.ui.apply(plain);
  const ordinary=h.ui.continueAction(plain);await new Promise(setImmediate);assert.equal(rebuilt,1,'an ordinary question still continues with the live context');h.settle({ok:true,text:'Continued'});await ordinary;
 }finally{h.close();}
});

test('A so-far request carries the click-time cutoff to the agent owner even when playback advanced before it started',async()=>{
 const h=fixture();let played=700;
 try{
  h.w.AssistantAppActions.snapshot=()=>({owner:'source-A',thread:'thread-A',kind:'video',time:played});
  for(const [cutoff,expected] of [[600,600],[undefined,700],[900,700]]){
   const run=h.ui.send('Bu ana kadar ne söylendi?',cutoff===undefined?{}:{watched_cutoff:cutoff},[],'scope');await new Promise(setImmediate);
   assert.equal(h.runs.at(-1).owner.time,expected,'cutoff '+cutoff);h.settle({ok:true,text:'Done'});await run;
  }
 }finally{h.close();}
});


test('Podcast question owner uses its frozen audible clock even when the hidden player clock differs',async()=>{
 const h=fixture();try{
  for(const hiddenTime of [0,700]){
   h.w.AssistantAppActions.snapshot=()=>({owner:'podcast-A',thread:'thread-A',kind:'studio',time:hiddenTime});
   const context={workspace:'podcast',watched_cutoff:10,podcastAnchor:{time:10},transcript_evidence:{evidence:[{id:'T1',baslangic:1,bitis:5,metin:'Heard sentence'}]}};
   const run=h.ui.send('Bu ana kadar ne söylendi?',context,[],'scope');await new Promise(setImmediate);
   assert.equal(h.runs.at(-1).owner.time,10);assert.equal(h.runs.at(-1).context.watched_cutoff,10);assert.equal(h.runs.at(-1).context.evidence[0].end,5);
   h.settle({ok:true,text:'Done'});await run;
  }
 }finally{h.close();}
});

test('Approval UI keeps a running card pending, marks an unknown result without a retry claim and notes a replay',async()=>{
 const h=fixture();try{
  const marked=[];Object.assign(h.w.AssistantWorkspace,{evidence(){},steps(){},actionResult:(id,result)=>marked.push([id,result.status,String(result.note||result.error||'')])});
  const proposal={proposalId:'p',kind:'app_action'},initial=h.ui.send('Request',{},[],'scope');await new Promise(setImmediate);
  h.event({type:'proposal',requestId:h.ui.status().id,action:proposal});h.settle({ok:true,text:'Apply first'});await initial;
  h.w.api.assistantAgentApply=async()=>({ok:false,pending:true,error:'This action is still running / Bu işlem hâlâ sürüyor.'});
  await assert.rejects(h.ui.apply(proposal),/Bu işlem hâlâ sürüyor/);assert.deepEqual(marked,[],'a running approval is neither failed nor applied');
  h.w.api.assistantAgentApply=async()=>({ok:false,uncertain:true,error:'Result unknown. / Sonuç bilinmiyor.'});
  await assert.rejects(h.ui.apply(proposal),/Sonuç bilinmiyor/);assert.deepEqual(marked.at(-1).slice(0,2),['p','unknown']);
  h.w.api.assistantAgentApply=async()=>({ok:true,replayed:true,result:{status:'accepted',note:'Started'}});
  await h.ui.apply(proposal);assert.deepEqual(marked.at(-1).slice(0,2),['p','accepted']);assert.match(marked.at(-1)[2],/Started.*yeniden uygulanmadı/);
  assert.equal(h.ui.busy(),false);
 }finally{h.close();}
});

test('Approval UI marks an unconfirmed card unknown and shows the card that is applying',async()=>{
 const h=fixture();try{
  const marked=[];Object.assign(h.w.AssistantWorkspace,{evidence(){},steps(){},actionResult:(id,result)=>marked.push([id,result.status])});
  const proposal={proposalId:'p',kind:'app_action'},initial=h.ui.send('Request',{},[],'scope');await new Promise(setImmediate);
  h.event({type:'proposal',requestId:h.ui.status().id,action:proposal});h.settle({ok:true,text:'Apply first'});await initial;
  h.w.api.assistantAgentApply=async()=>({ok:false,unconfirmed:true,error:'Not confirmed. / Doğrulanamıyor.'});
  assert.equal(h.ui.applyingId(),null);await assert.rejects(h.ui.apply(proposal),/Doğrulanamıyor/);assert.deepEqual(marked.at(-1),['p','unknown']);
  let release;h.w.api.assistantAgentApply=()=>new Promise(resolve=>{release=resolve;});
  const running=h.ui.apply(proposal).catch(()=>{});assert.equal(h.ui.applyingId(),'p','the card being applied is known while it runs');
  release({ok:true,result:{status:'completed'}});await running;assert.equal(h.ui.applyingId(),null);
 }finally{h.close();}
});

test('connected workspace note, source focus, assistant preview and action receipt retain one owner and never replay work',async()=>{const h=fixture(),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'connected-workspace-'));try{h.locale('en');const w=h.w,books=[{id:'book',title:'Saved book',path:'/synthetic/book',format:'epub',chapter:3,bookmarks:[{chapter:2,scroll:.4,quote:'A saved source passage',at:123}]}],before=JSON.stringify(books),backend=require('../src/library-workspace').create({root:dir,books:()=>books});let owner={kind:'book',owner:'book-A',thread:'thread-A',id:'book:2',title:'Saved book',chapter:2},opened=0,focus=0,applies=0;w.AssistantAppActions={snapshot:()=>({...owner}),current:s=>s.owner===owner.owner&&s.id===owner.id};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.document.body.insertAdjacentHTML('beforeend','<div class="header-actions"></div>');w.api.mediaShelf=async q=>({ok:true,...(q.action==='workspace-notes'?backend.notes(q.query):backend.list())});w.MediaShelfUI={openBook:async(id,pos)=>{assert.equal(id,'book');assert.equal(pos.index,2);assert.equal(pos.scroll,.4);opened++;}};w.MediaExperience={context:()=>({id:'book:2',type:'book-chapter',title:'Saved book'}),revealContext:()=>{focus++;return true;},taskRows:()=>[]};w.api.assistantAgentApply=async()=>{applies++;return {ok:true,result:{status:'accepted',jobId:'existing-job'}};};w.AssistantWorkspace.actionResult=()=>{};for(const file of ['assistant-safety-ui','library-workspace-ui'])w.eval(fs.readFileSync(require.resolve('../src/renderer/'+file),'utf8'));const tick=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);},click=async label=>{const b=[...w.document.querySelectorAll('dialog button')].find(b=>b.textContent===label);assert(b,label);b.click();await tick();};await w.LibraryWorkspaceUI.open('notes');await click('Open saved source');assert.equal(opened,1);const note=backend.notes().rows[0],run=h.ui.send('Explain this saved passage',{excerpt:note.text,chapter:String(note.locator.chapter+1)},[],'book:2');assert.equal(h.requests(),0);assert.match(w.document.querySelector('dialog pre').textContent,/A saved source passage/);await click('Send this request');assert.equal(h.requests(),1);assert.equal(h.runs[0].context.chapter,'3');h.settle({ok:true,text:'Controlled answer'});await run;await h.ui.apply({proposalId:'confirmed-step',tool:'start_whisper',summary:'Approved existing job'});await w.LibraryWorkspaceUI.open('receipts');assert.match(w.document.querySelector('dialog').textContent,/accepted|Accepted/);assert.equal(applies,1);await w.LibraryWorkspaceUI.open('resume');await click('Return to open reading / title');assert.equal(focus,1);await w.LibraryWorkspaceUI.open('resume');owner={...owner,owner:'book-B',id:'book:3'};await click('Return to open reading / title');assert.equal(focus,1);assert.equal(applies,1);assert.equal(JSON.stringify(books),before);assert.equal(fs.existsSync(path.join(dir,'library-workspace.json')),false);}finally{h.close();fs.rmSync(dir,{recursive:true,force:true});}});

test('R32 an in-progress approval receipt remains applying until the exact completed replay arrives',async()=>{
 const h=fixture();try{const w=h.w;w.eval(fs.readFileSync('src/renderer/assistant-safety-ui.js','utf8'));w.AssistantWorkspace.actionResult=()=>{};const p={proposalId:'in-progress',tool:'navigate_workspace',label:'Open library'};w.api.assistantAgentApply=async()=>({ok:false,pending:true,error:'Still applying'});await assert.rejects(h.ui.apply(p),/applying|running/);assert.equal(w.AssistantActionReceipts.snapshot()[0].status,'applying');w.api.assistantAgentApply=async()=>({ok:true,replayed:true,result:{status:'completed'}});await h.ui.apply(p);assert.equal(w.AssistantActionReceipts.snapshot()[0].status,'completed');
 }finally{h.close();}
});


test('R31 actual AgentUI continuation through Workspace and disk retains the newest ninth card',async()=>{
const os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'r853-assistant-cards-'));
const tick=()=>new Promise(r=>setImmediate(r));const initial=8;
let dom;try{
 const service=require('../src/assistant-thread-store').registerAssistantThreads({app:{getPath:()=>root},ipcMain:{handle(){}},authorized:()=>true});
 dom=new JSDOM('<body><div id="aiChatLog"></div><div id="aiChatEmpty"></div><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'});const w=dom.window;
 const M=require('../src/assistant-context-manifest'),card=i=>({kind:'app_action',proposalId:'card-'+i,tool:'navigate_workspace',label:'Open page '+i,summary:'Synthetic review card'});
 let runs=0;Object.assign(w,{structuredClone,player:{source:'source-A',chatHistory:[],cues:[],cues2:[]},globalAssistantContext:()=>null,aiSourceScope:()=> 'scope-A',aiChatPreparing:null,subtitleSourceTime:v=>v,browserSubtitleRoleCues:()=>({source:[],translation:[]}),
  UiLocale:{get:()=> 'en'},AssistantSourceContext:{conversation:p=>p.source},AssistantContextManifest:M,AssistantRunSteps:require('../src/assistant-run-steps'),AssistantFlowState:require('../src/assistant-flow-state'),
  updateAiChatActions(){},autoGrowChatBox(){},saveAppSettings:async()=>true,renderAiText:(node,text)=>node.textContent=text,aiChatContext:()=>({})});
 w.AssistantAppActions={snapshot:()=>M.clean({kind:'studio',owner:'source-A',thread:w.AssistantWorkspace?.activeId()||''}),current:o=>M.same(o,w.AssistantAppActions.snapshot())};
 w.aiChatAdd=(role,text)=>{const n=w.document.createElement('div');n.className='ai-msg ai-msg-'+(role==='user'?'user':'ai');n._sourceScope=w.aiSourceScope();n._assistantThreadId=w.AssistantWorkspace.activeId();n.textContent=text;w.document.getElementById('aiChatLog').append(n);return n;};
 w.api={assistantThreads:input=>service.handle({},input),onAssistantAgentEvent:()=>()=>{},assistantAgentCancel:async()=>({ok:true}),
  assistantAgentRun:async()=>({ok:true,text:++runs===1?'Review the cards.':'A new card is ready.',actions:runs===1?Array.from({length:initial},(_,i)=>card(i+1)):[card(initial+1)]}),
  assistantAgentApply:async()=>({ok:true,result:{status:'completed',continuationId:'flow-one',continuationState:'ready',invalidatedProposalIds:Array.from({length:initial-1},(_,i)=>'card-'+(i+2))}})};
 w.eval(fs.readFileSync('src/renderer/assistant-workspace.js','utf8'));w.eval(fs.readFileSync('src/renderer/assistant-agent-ui.js','utf8'));
 await w.AssistantWorkspace.prepare();await w.AssistantAgentUI.send('Open these pages',{},[],'scope-A');await tick();
 await w.AssistantAgentUI.apply(card(1));await tick();await w.AssistantAgentUI.continueAction(card(1));await tick();
 const memory=w.AssistantWorkspace.snapshot().current,listed=await service.handle({},{action:'list',sourceKey:'source-A'}),disk=listed.threads.find(t=>t.id===memory.id);
 const live=memory.messages.at(-1).actions,stored=disk.messages.at(-1).actions;
 assert.equal(live.length,initial+1);assert.equal(live.at(-1).proposalId,'card-'+(initial+1));assert.equal(stored.length,initial+1);assert.equal(stored.at(-1).proposalId,'card-'+(initial+1));assert.equal(live.filter(a=>a.resultStatus==='completed').length,1);assert.equal(stored.filter(a=>a.resultStatus==='stopped').length,7);
 assert.equal(stored.at(-1).resultStatus,'');assert.equal(w.AssistantAgentUI.proposalLive(card(initial+1)),true);
}finally{dom?.window.close();const rel=path.relative(os.tmpdir(),root);if(rel.startsWith('..')||path.isAbsolute(rel)||!path.basename(root).startsWith('r853-assistant-cards-'))throw Error('Unsafe cleanup');fs.rmSync(root,{recursive:true,force:true});}
});


test('B01 pending assistant cards are scoped to exact tab/generation/page and settled cards are excluded',async()=>{
 const h=fixture();try{
 h.w.AssistantAppActions.snapshot=()=>({owner:'scope',thread:'thread-A',tabId:'a',generation:3,pageKey:'page-A'});
 const run=h.ui.send('Inspect',{},[],'scope');await new Promise(setImmediate);
 assert.equal(h.ui.tabStatus('a',3,'page-A').running,true);assert.equal(h.ui.tabStatus('b',3,'page-A').running,false);
 h.settle({ok:true,text:'Review',actions:[{kind:'app_action',proposalId:'one',tool:'open_saved_podcast_passage',label:'Review',summary:'Fixture'}]});await run;
 assert.equal(h.ui.tabStatus('a',3,'page-A').review,1);assert.equal(h.ui.tabStatus('a',4,'page-A').review,0);assert.equal(h.ui.tabStatus('a',3,'other-page').review,0);
 h.w.AssistantActionReceipts={snapshot:()=>[{id:'one',status:'accepted'}]};assert.equal(h.ui.tabStatus('a',3,'page-A').review,0);
 }finally{h.close();}
});
