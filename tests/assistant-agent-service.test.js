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
