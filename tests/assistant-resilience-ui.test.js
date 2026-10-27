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
