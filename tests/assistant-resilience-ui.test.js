'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(){
 const dom=new JSDOM('<body><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'}),w=dom.window;
 let onEvent,settle,requests=0,locale='tr';const runs=[];const owner={owner:'source-A',thread:'thread-A'};
 Object.assign(w,{UiLocale:{get:()=>locale},AssistantAppActions:{snapshot:()=>owner,current:()=>true},AssistantContextManifest:require('../src/assistant-context-manifest'),AssistantWorkspace:{begin(){},finish(){},partial(){}},api:{onAssistantAgentEvent:fn=>{onEvent=fn;return ()=>{};},assistantAgentRun:packet=>{requests++;runs.push(packet);return new Promise(resolve=>settle=resolve);},assistantAgentCancel:async()=>({ok:true})},player:{},updateAiChatActions(){},autoGrowChatBox(){},saveAppSettings:async()=>true,renderAiText:(bubble,text)=>bubble.textContent=text,aiChatAdd:(role,text)=>{const n=w.document.createElement('div');n.textContent=text;w.document.body.append(n);return n;}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'));
 return {w,ui:w.AssistantAgentUI,event:value=>onEvent(value),settle:value=>settle(value),requests:()=>requests,runs,locale:value=>locale=value,close:()=>w.close()};
}
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
