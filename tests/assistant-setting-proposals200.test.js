 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {register}=require('../src/assistant-agent-service');
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
function harness(name,args,initial){
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),actions=[],cards=[],packets=[];let turn=0,state=initial,mutations=0,mutationResult={status:'completed'};
 sender.id=99;sender.isDestroyed=()=>false;
 const event={sender},owner={kind:'video',owner:'source-A',thread:'thread-A',tabId:'A',generation:1,tracks:[]};
 const call=(n,input)=>handlers.get('assistant:'+n)(event,input);
 sender.send=(channel,packet)=>{if(packet.type==='proposal')cards.push(packet.action);if(packet.type==='action'){actions.push(packet.name);packets.push(packet);queueMicrotask(()=>{if(packet.name===name){mutations++;call('agentResult',{callId:packet.callId,result:mutationResult});}else call('agentResult',{callId:packet.callId,result:state});});}};
 const service=register({app,ipcMain:{handle:(n,fn)=>handlers.set(n,fn)},authorized:e=>e.sender===sender,getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),fetchImpl:async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'settings',function:{name,arguments:JSON.stringify(args)}}]}):reply({role:'assistant',content:'Review card'})});
 return {owner,service,actions,cards,packets,call,set:v=>state=v,result:v=>mutationResult=v,mutations:()=>mutations,close:()=>app.emit('will-quit')};
}
for(const [name,args,first,changed]of [
 ['set_app_preferences',{theme:'light'},{status:'completed',preferences:{theme:'dark',language:'en',sponsorMode:'ask'}},{status:'completed',preferences:{theme:'system',language:'en',sponsorMode:'ask'}}],
 ['configure_voice_generation',{profile:'fast'},{status:'completed',voice:{settings:{profile:'quality'}}},{status:'completed',voice:{settings:{profile:'fast'}}}],
 ['configure_workflow',{domain:'translation',changes_json:'{"forSpeech":true}'},{status:'completed',values:{forSpeech:false,refine:false,lenient:true}},{status:'completed',values:{forSpeech:false,refine:true,lenient:true}}]
])test(name+' stale apply refuses mutation; explicit refresh creates an unapplied replacement and rejects replay',async()=>{
 const h=harness(name,args,first);try{
  assert((await h.call('agentRun',{requestId:'settings-first',question:'Change settings',owner:h.owner})).ok);
  const card=h.cards[0];assert(card);assert.match(card.summary,/→/);
  h.set(changed);const stale=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(stale.ok,false);assert.equal(stale.stale,true);assert.equal(stale.refreshable,true);assert.equal(h.mutations(),0);
  assert.equal((await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner})).ok,false);
  assert.equal((await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:{...h.owner,thread:'other'}})).ok,false);
  const fresh=await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner});assert.equal(fresh.ok,true);assert.notEqual(fresh.action.proposalId,card.proposalId);assert.equal(h.mutations(),0);
  assert.equal((await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner})).ok,false);
  assert.equal((await h.call('agentApply',{proposalId:fresh.action.proposalId,owner:h.owner})).ok,true);assert.equal(h.mutations(),1);
 }finally{h.close();}
});
test('summaries expose effective speech overrides even when stored refine and lenient are unchanged',()=>{
 const m=require('../src/assistant-workflow-settings'),summary=m.summary('translation','{"forSpeech":true,"refine":false,"lenient":true}','en',{values:{forSpeech:false,refine:false,lenient:true}});
 assert.match(summary,/Effective Refine translation: Off → On/);assert.match(summary,/Effective Lenient quality gate: On → Off/);
});
test('snapshots are bounded to approved relevant values and reject unavailable voice state',()=>{
 const m=require('../src/assistant-setting-proposals');
 assert.equal(m.snapshot('set_app_preferences',{theme:'light'},{status:'completed',preferences:{theme:'dark',apiKey:'must-not-copy'}}),'{"theme":"dark"}');
 assert.throws(()=>m.snapshot('configure_voice_generation',{profile:'fast'},{status:'completed',voice:{sourceChanged:true,settings:{profile:'quality'}}}),/unavailable/);
 assert.throws(()=>m.snapshot('set_app_preferences',{theme:'light'},{status:'failed'}),/unavailable/);
});

test('failed refresh retains the consumed original for retry and never creates or applies a replacement',async()=>{
 const h=harness('set_app_preferences',{theme:'light'},{status:'completed',preferences:{theme:'dark'}});try{
  await h.call('agentRun',{requestId:'refresh-retry',question:'Change theme',owner:h.owner});const card=h.cards[0];
  h.set({status:'completed',preferences:{theme:'system'}});assert((await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner})).stale);
  h.set({status:'failed',error:'Read failed'});const failed=await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner});assert.equal(failed.ok,false);assert.equal(h.service.proposals.size,0);assert.equal(h.mutations(),0);
  h.set({status:'completed',preferences:{theme:'system'}});const retry=await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner});assert.equal(retry.ok,true);assert.match(retry.action.summary,/System/);assert.equal(h.mutations(),0);
 }finally{h.close();}
});
test('preference approval ignores unrelated settings while guarding requested fields',async()=>{
 const h=harness('set_app_preferences',{theme:'light'},{status:'completed',preferences:{theme:'dark',language:'en'}});try{
  await h.call('agentRun',{requestId:'unrelated-edit',question:'Change theme',owner:h.owner});h.set({status:'completed',preferences:{theme:'dark',language:'tr'}});
  assert.equal((await h.call('agentApply',{proposalId:h.cards[0].proposalId,owner:h.owner})).ok,true);assert.equal(h.mutations(),1);
 }finally{h.close();}
});

test('approved before-values travel with the mutation, separately from model args, and renderer stale refusal can refresh',async()=>{
 const h=harness('set_app_preferences',{theme:'light'},{status:'completed',preferences:{theme:'dark',language:'en',apiKey:'not-captured'}});try{
  await h.call('agentRun',{requestId:'transport-gap',question:'Change theme',owner:h.owner});const card=h.cards[0];
  h.result({status:'failed',stale:true,error:'Settings changed at dispatch'});
  const rejected=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(rejected.ok,false);assert.equal(rejected.stale,true);assert.equal(rejected.refreshable,true);
  const packet=h.packets.find(p=>p.name==='set_app_preferences');assert.deepEqual(packet.expectedSettings,{kind:'preferences',values:{theme:'dark'}});assert.deepEqual(packet.args,{theme:'light'});
  assert(h.packets.filter(p=>p.name==='get_app_preferences').every(p=>!p.expectedSettings));
  h.set({status:'completed',preferences:{theme:'system'}});const refresh=await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner});assert(refresh.ok);
  h.result({status:'completed'});assert((await h.call('agentApply',{proposalId:refresh.action.proposalId,owner:h.owner})).ok);
  assert.deepEqual(h.packets.filter(p=>p.name==='set_app_preferences').at(-1).expectedSettings,{kind:'preferences',values:{theme:'system'}});
 }finally{h.close();}
});

test('first voice range can be proposed from disabled selection and still detects a later manual range',async()=>{
 for(const manual of [false,true]){
  const h=harness('configure_voice_generation',{start:5,end:25},{status:'completed',voice:{settings:{profile:'quality'},range:null}});try{
   assert((await h.call('agentRun',{requestId:'first-range',question:'Set a voice range',owner:h.owner})).ok);const card=h.cards[0];assert(card);assert.match(card.summary,/Start \(seconds\): Not set \u2192 5/);assert.match(card.summary,/End \(seconds\): Not set \u2192 25/);
   if(manual)h.set({status:'completed',voice:{settings:{profile:'quality'},range:{start:10,end:30}}});
   const result=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(result.ok,!manual);assert.equal(h.mutations(),manual?0:1);
   if(!manual)assert.deepEqual(h.packets.find(p=>p.name==='configure_voice_generation').expectedSettings,{kind:'voice',values:{end:null,start:null}});
  }finally{h.close();}
 }
});
test('null before-values are restricted to explicitly disabled voice ranges and enum labels are localized',()=>{
 const m=require('../src/assistant-setting-proposals');
 assert.throws(()=>m.snapshot('configure_voice_generation',{profile:'fast'},{status:'completed',voice:{settings:{profile:null},range:null}}),/valid current value/);
 assert.throws(()=>m.snapshot('configure_voice_generation',{start:5,end:25},{status:'completed',voice:{settings:{},range:{start:null,end:25}}}),/valid current value/);
 const identity=m.snapshot('configure_voice_generation',{start:5,end:25},{status:'completed',voice:{range:null}});assert.match(m.summary('configure_voice_generation',{start:5,end:25},identity,'tr'),/Se\u00e7ilmedi/);
 assert.equal(m.summary('set_app_preferences',{theme:'light'},'{"theme":"dark"}','tr'),'Tema: Koyu \u2192 A\u00e7\u0131k');
 assert.match(m.summary('configure_voice_generation',{profile:'fast'},'{"profile":"quality"}','tr'),/Kaliteli \u2192 H\u0131zl\u0131/);
});

test('preference undo binds exact approved destination even when current values return to the same state',async()=>{
 const h=harness('undo_app_preferences',{}, {status:'completed',preferences:{theme:'dark',language:'en',sponsorMode:'ask'},canUndo:true,undoChanges:{theme:'light'}});try{
  assert((await h.call('agentRun',{requestId:'undo-target',question:'Undo the preference change',owner:h.owner})).ok);const card=h.cards[0];assert(card);assert.equal(card.summary,'Theme: Dark \u2192 Light');
  h.set({status:'completed',preferences:{theme:'dark',language:'en',sponsorMode:'ask'},canUndo:true,undoChanges:{theme:'system'}});
  const old=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(old.ok,false);assert.equal(old.stale,true);assert.equal(h.mutations(),0);
  const refresh=await h.call('agentApply',{mode:'refresh',proposalId:card.proposalId,owner:h.owner});assert.equal(refresh.ok,true);assert.equal(refresh.action.summary,'Theme: Dark \u2192 System');assert.equal(h.mutations(),0);
  assert((await h.call('agentApply',{proposalId:refresh.action.proposalId,owner:h.owner})).ok);
  assert.deepEqual(h.packets.find(p=>p.name==='undo_app_preferences').expectedSettings,{kind:'preferences',values:{theme:'dark'},canUndo:true,undoChanges:{theme:'system'}});
 }finally{h.close();}
});
test('preference undo refuses missing or non-whitelisted restoration destinations before a card exists',async()=>{
 for(const state of [
  {status:'completed',preferences:{theme:'dark'},canUndo:false},
  {status:'completed',preferences:{theme:'dark'},canUndo:true,undoChanges:{}},
  {status:'completed',preferences:{theme:'dark',apiKey:'hidden'},canUndo:true,undoChanges:{apiKey:'injected'}},
  {status:'completed',preferences:{theme:'dark'},canUndo:true,undoChanges:{theme:'arbitrary'}}
 ]){
  const h=harness('undo_app_preferences',{},state);try{const result=await h.call('agentRun',{requestId:'invalid-undo',question:'Undo settings',owner:h.owner});assert(result.ok);assert.equal(h.cards.length,0);assert.equal(result.execution.blockedOrFailed,1);assert.equal(h.mutations(),0);}finally{h.close();}
 }
});
