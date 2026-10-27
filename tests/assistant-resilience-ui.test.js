'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(){
 const dom=new JSDOM('<body><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'}),w=dom.window;
 let onEvent,settle,requests=0,locale='tr';const owner={owner:'source-A',thread:'thread-A'};
 Object.assign(w,{UiLocale:{get:()=>locale},AssistantAppActions:{snapshot:()=>owner,current:()=>true},AssistantContextManifest:require('../src/assistant-context-manifest'),AssistantWorkspace:{begin(){},finish(){},partial(){}},api:{onAssistantAgentEvent:fn=>{onEvent=fn;return ()=>{};},assistantAgentRun:()=>{requests++;return new Promise(resolve=>settle=resolve);},assistantAgentCancel:async()=>({ok:true})},player:{},updateAiChatActions(){},autoGrowChatBox(){},saveAppSettings:async()=>true,renderAiText:(bubble,text)=>bubble.textContent=text,aiChatAdd:(role,text)=>{const n=w.document.createElement('div');n.textContent=text;w.document.body.append(n);return n;}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'));
 return {w,ui:w.AssistantAgentUI,event:value=>onEvent(value),settle:value=>settle(value),requests:()=>requests,locale:value=>locale=value,close:()=>w.close()};
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

test('Continuation UI follows the exact main job without a polling model request',async()=>{const h=fixture();try{let state='running';h.w.AssistantFlowState=require('../src/assistant-flow-state');h.w.AssistantJobsUI={snapshot:()=>({jobs:[{id:'exact',state,percent:55},{id:'other',state:'completed'}]})};Object.assign(h.w.AssistantWorkspace,{evidence(){},actionResult(){},canResume:()=>true});h.w.api.assistantAgentApply=async()=>({ok:true,result:{status:'accepted',continuationId:'token',continuationState:'waiting',continuationJobId:'exact'}});const run=h.ui.send('Translate and explain',{},[],'scope');await new Promise(setImmediate);const id=h.ui.status().id,proposal={proposalId:'proposal',kind:'app_action'};h.event({type:'proposal',requestId:id,action:proposal});h.settle({ok:true,text:'Apply first.'});await run;await h.ui.apply(proposal);assert.equal(h.ui.flowInfo(proposal).waiting,true);assert.equal(h.ui.flowInfo(proposal).flowState,'running');state='completed';assert.equal(h.ui.flowInfo(proposal).waiting,false);assert.equal(h.ui.flowInfo(proposal).canContinue,true);state='failed';assert.equal(h.ui.flowInfo(proposal).canContinue,false);assert.match(h.ui.flowInfo(proposal).flowNote,/başarısız/);assert.equal(h.requests(),1);}finally{h.close();}});
