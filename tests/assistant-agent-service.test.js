'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {register}=require('../src/assistant-agent-service');
function fixture(fetchImpl,extras={}){
 const ipcMain=new EventEmitter(),handlers=new Map(),app=new EventEmitter(),events=[];
 ipcMain.handle=(name,fn)=>handlers.set(name,fn);
 const sender=new EventEmitter();sender.id=7;sender.isDestroyed=()=>false;sender.send=(name,value)=>events.push({name,value});
 const event={sender,senderFrame:'main'},state={valid:true};
 const service=register({app,ipcMain,authorized:e=>e.sender===sender&&e.senderFrame==='main',getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),validateOwner:()=>state.valid,fetchImpl,...extras});
 const owner={kind:'video',owner:'source-A',thread:'thread-A',tabId:'A',generation:1,tracks:[]};
 return {handlers,app,sender,event,events,state,service,owner,call:(name,data,e=event)=>handlers.get('assistant:'+name)(e,data)};
}
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
test('Model proposals do not execute until the same source applies; stale, foreign and replay requests are refused',async()=>{
 let count=0;
 const h=fixture(async()=>++count===1?reply({role:'assistant',content:null,tool_calls:[{id:'c',type:'function',function:{name:'start_whisper',arguments:'{"translate":false}'}}]}):reply({role:'assistant',content:'Proposed.'}));
 const result=await h.call('agentRun',{requestId:'request-A',question:'Make subtitles',owner:h.owner,context:{}});
 assert(result.ok);assert(!h.events.some(row=>row.value.type==='action'));
 const action=h.events.find(row=>row.value.type==='proposal').value.action;
 assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:{...h.owner,thread:'B'}})).ok,false);
 assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner},{sender:{id:8},senderFrame:'main'})).ok,false);
 const apply=h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});
 await new Promise(resolve=>setImmediate(resolve));
 const request=h.events.find(row=>row.value.type==='action').value;assert.equal(request.name,'start_whisper');
 assert.equal((await h.call('agentResult',{callId:request.callId,result:{status:'completed'}},{sender:h.sender,senderFrame:'iframe'})).ok,false);
 await h.call('agentResult',{callId:request.callId,result:{status:'accepted',note:'Started'}});
 assert.equal((await apply).result.status,'accepted');assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner})).ok,false);
 h.app.emit('will-quit');
});
test('Cancellation affects only the matching request and clears the active session',async()=>{
 let aborts=0;
 const h=fixture(async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborts++;reject(Error('aborted'));},{once:true})));
 const result=h.call('agentRun',{requestId:'request-A',question:'Explain',owner:h.owner});
 await new Promise(resolve=>setImmediate(resolve));
 await h.call('agentCancel',{requestId:'another'});assert.equal(aborts,0);
 await h.call('agentCancel',{requestId:'request-A'});assert.equal((await result).cancelled,true);assert.equal(aborts,1);assert.equal(h.service.sessions.size,0);
 h.app.emit('will-quit');
});


test('Main job tools use authoritative IDs and refuse a stale stop proposal after replacement',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs();let stops=0;
 const id=jobs.start({cancel:async()=>{stops++;return {ok:true};}});let step=0;
 const h=fixture(async()=>++step===1?reply({role:'assistant',content:null,tool_calls:[{id:'status',function:{name:'get_job_status',arguments:'{}'}},{id:'stop',function:{name:'cancel_job',arguments:JSON.stringify({job_id:id})}}]}):reply({role:'assistant',content:'Stop proposed.'}),{getJobs:jobs.snapshot,cancelJob:jobs.cancel});
 assert((await h.call('agentRun',{requestId:'status-request',question:'Stop this job',owner:h.owner})).ok);
 assert(!h.events.some(row=>row.value.type==='action'),'Status and stop are main-owned; no renderer status RPC');
 const proposal=h.events.find(row=>row.value.type==='proposal').value.action;
 jobs.update(id,{type:'done'});jobs.start({cancel:async()=>{stops++;return {ok:true};}});
 assert.equal((await h.call('agentApply',{proposalId:proposal.proposalId,owner:h.owner})).ok,false);assert.equal(stops,0);h.app.emit('will-quit');
});
test('Caption probe selects proven manual/automatic IDs and stale source cannot create an action',async()=>{
 let step=0,seen;
 const h=fixture(async(_,options)=>{seen=JSON.parse(options.body);return ++step===1?reply({role:'assistant',tool_calls:[{id:'probe',function:{name:'probe_video_captions',arguments:'{}'}}]}):step===2?reply({role:'assistant',tool_calls:[{id:'select',function:{name:'translate_video_captions',arguments:JSON.stringify({caption_id:'yt-manual:en',target_language:'de',start:5,end:25,forSpeech:true})}}]}):reply({role:'assistant',content:'Proposed manual captions.'});},{probeVideo:async()=>({ok:true,data:{subtitleLangs:[{code:'en',auto:false},{code:'ja',auto:true}]}})});
 assert((await h.call('agentRun',{requestId:'captions-A',question:'Translate captions',owner:h.owner})).ok);
 assert(seen.messages.some(row=>row.role==='tool'&&row.content.includes('yt-auto:ja')));assert.equal(h.events.filter(row=>row.value.type==='proposal').length,1);assert(!h.events.some(row=>row.value.type==='action'));
 const action=h.events.find(row=>row.value.type==='proposal').value.action;assert.equal((await h.call('agentApply',{proposalId:action.proposalId,owner:{...h.owner,generation:2}})).ok,false);h.app.emit('will-quit');
});
test('A guessed caption ID without a source probe cannot create a download card',async()=>{
 let count=0;const h=fixture(async()=>++count===1?reply({role:'assistant',tool_calls:[{id:'bad',function:{name:'translate_video_captions',arguments:'{"caption_id":"yt-manual:invented"}'}}]}):reply({role:'assistant',content:'Probe required.'}));
 assert((await h.call('agentRun',{requestId:'guess-A',question:'Translate',owner:h.owner})).ok);assert(!h.events.some(row=>row.value.type==='proposal'));h.app.emit('will-quit');
});
test('Web research returns actual sources in a canonical trailing section',async()=>{
 let count=0;const h=fixture(async()=>++count===1?reply({role:'assistant',tool_calls:[{id:'web',function:{name:'research_web',arguments:'{"query":"Who is the author?"}'}}]}):reply({role:'assistant',content:'Answer.'}),{researchWeb:async()=>({text:'Supported fact.',sources:[{title:'Official source',url:'https://example.com/fact'},{title:'private',url:'http://localhost/private'}]})});
 const result=await h.call('agentRun',{requestId:'web-A',question:'Look it up',owner:h.owner,locale:'en'});assert(result.ok);assert(result.text.includes('Web sources:\n[W1] Official source\nhttps://example.com/fact'));assert(!result.text.includes('localhost'));h.app.emit('will-quit');
});


test('Voice proposals require real reference, group and output identities before a card exists',async()=>{
 for(const [name,args,proven] of [['set_voice_reference',{reference_id:'voice-A'},true],['set_voice_reference',{reference_id:'guessed'},false],['voice_group',{group_id:'g1',operation:'listen'},true],['voice_group',{group_id:'guessed',operation:'regenerate'},false],['use_generated_voice',{output_id:'out-A'},true],['use_generated_voice',{output_id:'guessed'},false]]){
  let count=0;const h=fixture(async()=>++count===1?reply({role:'assistant',tool_calls:[{id:'voice',function:{name,arguments:JSON.stringify(args)}}]}):reply({role:'assistant',content:'Checked.'}));
  const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:value.name==='list_voice_references'?{status:'completed',references:[{id:'voice-A',name:'My voice'}]}:{status:'completed',voice:{busy:false,subtitleReady:true,ready:true,groups:[{id:'g1',number:1}],output:{id:'out-A',sample:false,syncInvalid:false}}}}));};
  assert((await h.call('agentRun',{requestId:'voice-check',question:'Use this voice',owner:h.owner})).ok);
  assert.equal(h.events.some(row=>row.value.type==='proposal'),proven,name+' '+JSON.stringify(args));assert(h.events.filter(row=>row.value.type==='action').every(row=>['list_voice_references','get_voice_status'].includes(row.value.name)));h.app.emit('will-quit');
 }
});


test('Book mutation cards require the current reader/production and do not start a job on model request',async()=>{
 for(const [name,args,context,expected] of [['prepare_book_narration',{from:2,to:3},{reader:{canPrepare:true,source:{title:'Book'}}},true],['start_book_narration',{}, {production:null},false],['start_book_narration',{}, {production:{busy:true}},false],['start_book_narration',{}, {production:{busy:false,title:'Book'}},true]]){
  let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'book',function:{name,arguments:JSON.stringify(args)}}]}):reply({role:'assistant',content:'Checked.'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',...context}}));};
  assert((await h.call('agentRun',{requestId:'book-check',question:'Narrate',owner:{...h.owner,kind:'book'}})).ok);assert.equal(h.events.some(row=>row.value.type==='proposal'),expected);assert(h.events.filter(row=>row.value.type==='action').every(row=>row.value.name==='get_book_context'));h.app.emit('will-quit');
 }
});


test('Library action cards name the proven title and refuse a later identity change before mutation',async()=>{
 let turn=0,identity='original';const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'title',function:{name:'open_library_title',arguments:'{"item_id":"catalog:real"}'}}]}):reply({role:'assistant',content:'Proposed.'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',item:{title:'Actual film'},identity}}));};
 const owner={...h.owner,kind:'library'};assert((await h.call('agentRun',{requestId:'library-check',question:'Open this film',owner})).ok);const p=h.events.find(row=>row.value.type==='proposal').value.action;assert(p.summary.includes('Actual film'));identity='changed';assert.equal((await h.call('agentApply',{proposalId:p.proposalId,owner})).ok,false);assert(h.events.filter(row=>row.value.type==='action').every(row=>row.value.name==='get_title_details'));h.app.emit('will-quit');
});


test('Continuation uses the original goal and actual receipt; siblings expire and completed mutations are not repeated',async()=>{
 let turn=0,seen=[];const tool=(id,section)=>({id,function:{name:'open_settings',arguments:JSON.stringify({section})}});
 const h=fixture(async(_,options)=>{const body=JSON.parse(options.body);seen.push(body);return ++turn===1?reply({role:'assistant',tool_calls:[tool('one','general'),tool('sibling','ai')]}):turn===2?reply({role:'assistant',content:'First proposed.'}):turn===3?reply({role:'assistant',tool_calls:[tool('repeat','general'),tool('next','metadata')]}):reply({role:'assistant',content:'Next proposed.'});});
 await h.call('agentRun',{requestId:'flow-one',question:'Original multistep goal',owner:h.owner});const proposals=h.events.filter(row=>row.value.type==='proposal').map(row=>row.value.action);
 const apply=h.call('agentApply',{proposalId:proposals[0].proposalId,owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(row=>row.value.type==='action').value;await h.call('agentResult',{callId:action.callId,result:{status:'completed',note:'Actual UI opened'}});const receipt=await apply;assert(receipt.result.continuationId);assert(receipt.result.invalidatedProposalIds.includes(proposals[1].proposalId));
 assert.equal((await h.call('agentRun',{requestId:'flow-wrong',question:'Continue',continuationId:receipt.result.continuationId,owner:{...h.owner,generation:2}})).ok,false);
 assert((await h.call('agentRun',{requestId:'flow-two',question:'Override attempt',continuationId:receipt.result.continuationId,owner:h.owner})).ok);assert.equal(seen[2].messages.at(-1).content,'Original multistep goal');assert(seen[2].messages.some(row=>row.role==='system'&&row.content.includes('Actual UI opened')));assert.equal(h.events.filter(row=>row.value.type==='proposal').length,3);assert.equal(h.events.filter(row=>row.value.type==='action').length,1);h.app.emit('will-quit');
});
test('Applying is serialized and cancellation rejects late renderer receipts',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'x',function:{name:'open_settings',arguments:'{"section":"general"}'}}]}):reply({role:'assistant',content:'Proposed.'}));await h.call('agentRun',{requestId:'apply-cancel',question:'Open settings',owner:h.owner});const p=h.events.find(row=>row.value.type==='proposal').value.action;const applying=h.call('agentApply',{proposalId:p.proposalId,owner:h.owner});await new Promise(r=>setImmediate(r));assert.equal((await h.call('agentApply',{proposalId:p.proposalId,owner:h.owner})).ok,false);const action=h.events.find(row=>row.value.type==='action').value;await h.call('agentCancel',{requestId:p.proposalId});assert.equal((await applying).ok,false);assert(h.events.some(row=>row.value.type==='action-cancel'&&row.value.callId===action.callId));assert.equal((await h.call('agentResult',{callId:action.callId,result:{status:'completed'}})).ok,false);assert.equal(h.service.applications.size,0);h.app.emit('will-quit');
});


test('An accepted exact linked job waits without provider calls and stops the flow on failure',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs();let turn=0,linked;
 const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'page',function:{name:'translate_page',arguments:'{}'}}]}):reply({role:'assistant',content:'Proposed.'}),{getJobs:jobs.snapshot,resolveJobId:external=>external==='backend-exact'?linked:null});
 await h.call('agentRun',{requestId:'accepted-flow',question:'Translate then explain',owner:h.owner});const p=h.events.find(row=>row.value.type==='proposal').value.action;const apply=h.call('agentApply',{proposalId:p.proposalId,owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(row=>row.value.type==='action').value;linked=jobs.start({});await h.call('agentResult',{callId:action.callId,result:{status:'accepted',jobId:'backend-exact'}});const receipt=await apply;assert(receipt.result.continuationId);
 const waiting=await h.call('agentRun',{requestId:'waiting-flow',question:'Continue',continuationId:receipt.result.continuationId,owner:h.owner});assert(waiting.waiting);assert.equal(turn,2);jobs.update(linked,{type:'error'});assert.equal((await h.call('agentRun',{requestId:'failed-flow',question:'Continue',continuationId:receipt.result.continuationId,owner:h.owner})).ok,false);assert.equal(turn,2);h.app.emit('will-quit');
});

test('Duplicate cards are emitted once; un-applied translation blocks dependent voice preparation',async()=>{
 let turn=0;const tool=(id,name,args)=>({id,function:{name,arguments:JSON.stringify(args)}});const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[tool('first','start_whisper',{translate:true}),tool('duplicate','start_whisper',{translate:true}),tool('dependent','open_voice_preparation',{})]}):reply({role:'assistant',content:'All done.'}));
 const r=await h.call('agentRun',{requestId:'dependent-steps',question:'Translate then prepare voice',owner:h.owner});assert(r.ok);assert.equal(h.events.filter(row=>row.value.type==='proposal').length,1);assert(!h.events.some(row=>row.value.type==='action'));assert.equal(r.execution.cards,1);assert.equal(r.execution.appliedActions,0);assert.equal(r.execution.blockedOrFailed,1);assert.match(r.text,/Application verification: 1/);h.app.emit('will-quit');
});
test('Uncreated collection card gets explicit application verification even if the model claims one',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'p',function:{name:'plan_library_collection',arguments:'{"name":"Space","ids":"catalog:one"}'}}]}):reply({role:'assistant',content:'Card ready.'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',plan:{id:'only-plan'}}}));};
 const r=await h.call('agentRun',{requestId:'no-real-card',question:'Plan only',owner:{...h.owner,kind:'library'},locale:'tr'});assert(r.ok);assert.equal(r.execution.cards,0);assert.equal(r.execution.pendingPlans,1);assert.match(r.text,/gerçek işlem kartı/);assert.match(r.text,/kartı henüz yok/);assert(!h.events.some(row=>row.value.type==='proposal'));h.app.emit('will-quit');
});

test('A text-only fictional card cannot acquire a proposal ID or hide the zero-card verification',async()=>{
 const h=fixture(async()=>reply({role:'assistant',content:'İşlem kartı hazır, iş tamamlandı.'}));const r=await h.call('agentRun',{requestId:'fictional-card',question:'Bir işlem hazırla',owner:h.owner,locale:'tr'});assert(r.ok);assert.equal(r.execution.cards,0);assert.equal(r.execution.appliedActions,0);assert.match(r.text,/0 gerçek işlem kartı/);assert.match(r.text,/transkripsiyon\/dublaj başlatmadı/);assert(!h.events.some(row=>row.value.type==='proposal'));h.app.emit('will-quit');
});
