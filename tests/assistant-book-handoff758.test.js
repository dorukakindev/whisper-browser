const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 let owner={kind:'book',owner:'reader',thread:'one'},sourceId='pdf',cancelled=0;
 Object.assign(w,{UiLocale:{get:()=> 'en'},AssistantContextManifest:require('../src/assistant-context-manifest'),AssistantAppActions:{snapshot:()=>({...owner}),current:o=>JSON.stringify(o)===JSON.stringify(owner)},AssistantWorkspace:{actionResult(){}},globalAssistantContext:()=>({id:sourceId}),updateAiChatActions(){},api:{assistantAgentRun(){},onAssistantAgentEvent:()=>()=>{},assistantAgentCancel:async()=>{cancelled++;return {ok:true};}}});
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'));
 return {w,owner:()=>({...owner}),cancelled:()=>cancelled,change:(id)=>{sourceId=id;owner={kind:'book',owner:id,thread:'one'};w.document.dispatchEvent(new w.Event('media-context-changed'));},close:()=>w.close()};
}
test('Only the exact prepared project context can be adopted by the applying action',async()=>{
 const h=fixture();try{h.w.api.assistantAgentApply=async()=>{await h.w.AssistantAgentUI.bookPreparation(h.owner(),'prepared',0,async()=>{h.change('prepared:0');assert.equal(h.cancelled(),0);});return {ok:true,result:{status:'completed'}};};await h.w.AssistantAgentUI.apply({proposalId:'prepare'});assert.equal(h.cancelled(),0);assert.equal(h.w.AssistantAgentUI.busy(),false);}finally{h.close();}
});
test('An unrelated source change during preparation still cancels',async()=>{
 const h=fixture();try{h.w.api.assistantAgentApply=async()=>{await h.w.AssistantAgentUI.bookPreparation(h.owner(),'prepared',0,async()=>h.change('other:0'));return {ok:false,error:'changed'};};await assert.rejects(h.w.AssistantAgentUI.apply({proposalId:'prepare'}));assert.equal(h.cancelled(),1);}finally{h.close();}
});
test('Explicit cancellation is never overridden by a prepared-context match',async()=>{
 const h=fixture();try{h.w.api.assistantAgentApply=async()=>{await h.w.AssistantAgentUI.bookPreparation(h.owner(),'prepared',0,async()=>{await h.w.AssistantAgentUI.cancel();h.change('prepared:0');});return {ok:false,error:'cancelled'};};await assert.rejects(h.w.AssistantAgentUI.apply({proposalId:'prepare'}));assert.equal(h.cancelled(),1);}finally{h.close();}
});
test('Handoff is single use; a later source change cancels normally',async()=>{
 const h=fixture();try{h.w.api.assistantAgentApply=async()=>{await h.w.AssistantAgentUI.bookPreparation(h.owner(),'prepared',0,async()=>{h.change('prepared:0');h.change('other:0');});return {ok:false,error:'changed'};};await assert.rejects(h.w.AssistantAgentUI.apply({proposalId:'prepare'}));assert.equal(h.cancelled(),1);}finally{h.close();}
});
