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

test('Podcast studio so-far requests use only frozen finished episode lines across context, history and subtitle tools',async()=>{
 let turn=0;const bodies=[];
 const call=(id,name,args)=>({role:'assistant',tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
 const h=fixture(async(_url,options)=>{const body=JSON.parse(options.body);bodies.push(JSON.stringify(body.messages));
  return reply(++turn===1?call('context','get_source_context',{}):turn===2?call('subtitles','search_subtitles',{query:'alpha'}):{role:'assistant',content:'Done.'});
 });
 const rows=[{id:'T1',start:0,end:5,text:'HEARD_PODCAST alpha'},{id:'T2',start:6,end:15,text:'UNFINISHED_PODCAST alpha'},{id:'T3',start:20,end:25,text:'FUTURE_PODCAST alpha'}];
 try{
  const result=await h.call('agentRun',{requestId:'podcast-studio-cutoff',question:'Bu ana kadar alpha hakkında ne anlatıldı?',owner:{...h.owner,kind:'studio',time:10},context:{workspace:'podcast',title:'Episode',evidence:rows,watched_cutoff:10},pool:[{id:'U1',start:0,end:4,text:'UNRELATED_HIDDEN_PLAYER alpha'}],history:[{role:'assistant',content:'OLD_HISTORY_FUTURE'}]});
  assert.equal(result.ok,true,result.error);const all=bodies.join('\n');
  assert(all.includes('HEARD_PODCAST'));
  for(const marker of ['UNFINISHED_PODCAST','FUTURE_PODCAST','UNRELATED_HIDDEN_PLAYER','OLD_HISTORY_FUTURE'])assert(!all.includes(marker),marker+' must not reach the provider');
  assert(h.events.some(row=>row.value.type==='evidence'&&row.value.evidence.some(e=>e.text==='HEARD_PODCAST alpha')));
 }finally{h.app.emit('will-quit');}
});

test('R844-01 translation ambiguity uses the latest delivered human intent, never concatenated history or source text',async()=>{
 const explicit='Mevcut English altyazı izini Türkçeye çevir; sayfayı çevirme.';
 for(const mode of ['steer','followup'])for(const initialAmbiguous of [true,false]){
  let turn=0,rendererCalls=0;const initial=initialAmbiguous?'bunu çevir':explicit,latest=initialAmbiguous?explicit:'bunu çevir';
  const h=fixture(async()=>{
   if(++turn===1){assert.equal(h.call('agentMessage',{requestId:'intent',owner:h.owner,mode,text:latest}).ok,true);return reply({role:'assistant',content:'Current answer.'});}
   if(turn===2)return reply({role:'assistant',tool_calls:[{id:'translate',function:{name:'translate_captions',arguments:'{"track_id":"english","target_language":"tr"}'}}]});
   return reply({role:'assistant',content:'Observed result.'});
  });h.owner.tracks=[{id:'english',role:'source',language:'en'}];
  const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')rendererCalls++;};
  try{const result=await h.call('agentRun',{requestId:'intent',question:initial,owner:h.owner});assert.equal(result.ok,true,result.error);
   const cards=h.events.filter(e=>e.value.type==='proposal');assert.equal(cards.length,initialAmbiguous?1:0,mode+' latest human request determines ambiguity');assert.equal(rendererCalls,0,'Creating a card never starts translation');assert.equal(result.runtime.intentRevision,1);
  }finally{h.app.emit('will-quit');}
 }
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'translate',function:{name:'translate_captions',arguments:'{"track_id":"english","target_language":"tr"}'}}]}):reply({role:'assistant',content:'Source remains ambiguous.'}));h.owner.tracks=[{id:'english',role:'source',language:'en'}];
 try{const result=await h.call('agentRun',{requestId:'source-not-intent',question:'bunu çevir',owner:h.owner,context:{note:explicit}});assert.equal(result.ok,true);assert.equal(h.events.filter(e=>e.value.type==='proposal').length,0,'Source text cannot clarify or authorize human intent');}finally{h.app.emit('will-quit');}
});

test('R844-02 original audio restore needs approval but not translated subtitles; generation keeps that prerequisite',async()=>{
 for(const tool of ['restore_original_audio','start_voice_generation']){
  let turn=0,writes=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'voice',function:{name:tool,arguments:'{}'}}]}):reply({role:'assistant',content:'Observed result.'}),{getJobs:()=>({jobs:[{id:'translated-job',state:'completed',finishedAt:Date.now(),result:{artifacts:[{role:'translation',partial:false}]}}]})});
  const flow=h.service.flows.start(h.sender.id,h.owner,'Translate the captions, then restore original audio.');
  const receipt=h.service.flows.record(flow,'translate_captions',{track_id:'english',target_language:'tr'},{status:'accepted'},'translated-job');
  const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')queueMicrotask(()=>{assert.equal(packet.name,'restore_original_audio');writes++;h.call('agentResult',{callId:packet.callId,result:{status:'completed'}});});};
  try{const result=await h.call('agentRun',{requestId:'restore',question:'Asıl sesi geri getir.',owner:h.owner,continuationId:receipt.continuationId});assert.equal(result.ok,true,result.error);const cards=h.events.filter(e=>e.value.type==='proposal');assert.equal(cards.length,tool==='restore_original_audio'?1:0);assert.equal(writes,0,'Restore must still wait for human Apply');
   if(cards.length){const applied=await h.call('agentApply',{proposalId:cards[0].value.action.proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert.equal(writes,1);}
  }finally{h.app.emit('will-quit');}
 }
});

test('R844-02 an unapplied translation card cannot block an independent original-audio restore card',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'translate',function:{name:'translate_captions',arguments:'{"track_id":"english","target_language":"tr"}'}},{id:'restore',function:{name:'restore_original_audio',arguments:'{}'}}]}):reply({role:'assistant',content:'Review the separate actions.'}));h.owner.tracks=[{id:'english',role:'source',language:'en'}];
 try{assert.equal((await h.call('agentRun',{requestId:'pending-and-restore',question:'Translate the English captions and restore original audio.',owner:h.owner})).ok,true);assert.deepEqual(h.events.filter(e=>e.value.type==='proposal').map(e=>e.value.action.tool),['translate_captions','restore_original_audio']);assert.equal(h.events.filter(e=>e.value.type==='action').length,0);}finally{h.app.emit('will-quit');}
});

test('R844-02 failed translation continuation permits reviewed audio recovery while production remains retry-bound',async()=>{
 for(const nextTool of ['restore_original_audio','start_voice_generation']){
  const jobs=require('../src/assistant-jobs').createJobs();let jobId,phase='translation',turn=0,restores=0;
  const h=fixture(async()=>{
   if(++turn!==1)return reply({role:'assistant',content:'Observed result.'});
   return reply({role:'assistant',tool_calls:[{id:'step',function:{name:phase==='translation'?'translate_captions':nextTool,arguments:phase==='translation'?'{"track_id":"english","target_language":"tr"}':'{}'}}]});
  },{getJobs:jobs.snapshot,resolveJobId:external=>external==='translation-backend'?jobId:null});h.owner.tracks=[{id:'english',role:'source',language:'en'}];
  const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')queueMicrotask(()=>{
   let result;if(packet.name==='translate_captions'){jobId=jobs.start({kind:'captions'});result={status:'accepted',jobId:'translation-backend'};}else{assert.equal(packet.name,'restore_original_audio');restores++;result={status:'completed'};}
   h.call('agentResult',{callId:packet.callId,result});
  });};
  try{
   assert.equal((await h.call('agentRun',{requestId:'translate-then-fail',question:'Translate the English captions, then restore original audio.',owner:h.owner})).ok,true);
   const original=h.events.find(e=>e.value.type==='proposal').value.action;
   const accepted=await h.call('agentApply',{proposalId:original.proposalId,owner:h.owner});assert.equal(accepted.ok,true,accepted.error);assert(accepted.result.continuationId);
   jobs.update(jobId,{type:'error',error:'Controlled translation failure'});assert.equal(jobs.snapshot().jobs[0].state,'failed');
   phase='recovery';turn=0;h.events.length=0;
   const resumed=await h.call('agentRun',{requestId:'recover-after-failure',question:'Restore original audio.',owner:h.owner,continuationId:accepted.result.continuationId});assert.equal(resumed.ok,true,resumed.error);
   const cards=h.events.filter(e=>e.value.type==='proposal');assert.equal(cards.length,nextTool==='restore_original_audio'?1:0);assert.equal(restores,0,'Recovery is still only an unapplied proposal');
   if(cards.length){const id=cards[0].value.action.proposalId;assert.equal((await h.call('agentApply',{proposalId:id,owner:{...h.owner,thread:'foreign-thread'}})).ok,false);assert.equal(restores,0);const applied=await h.call('agentApply',{proposalId:id,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert.equal(restores,1);const again=await h.call('agentApply',{proposalId:id,owner:h.owner});assert.deepEqual([again.ok,again.replayed],[true,true]);assert.equal(restores,1,'the repeated approval is replayed, never executed twice');}
  }finally{h.app.emit('will-quit');}
 }
});

test('Whisper → exact translated track → failed voice retry → attachment retains completed stages and requires each approval',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs();let textId,voiceId,turn=0,phase="start",phaseTurn=0,subtitleLoaded=false,voiceStarts=0,attached=false;
 const tool=(name,args={})=>reply({role:'assistant',tool_calls:[{id:'step-'+turn,function:{name,arguments:JSON.stringify(args)}}]});
 const goal='Whisper the first five minutes, translate for speech, then dub and attach.';
 const h=fixture(async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.messages.filter(m=>m.role==='user').at(-1).content,goal);turn++;phaseTurn++;
  if(phase==='start'&&phaseTurn===1)return tool('start_whisper',{translate:true,forSpeech:true,target_language:'tr',start:0,end:300});
  if(phase==='load'&&phaseTurn===1)return tool('start_voice_generation'); // Deliberately premature: old subtitles exist.
  if(phase==='load'&&phaseTurn===2){assert.match(body.messages.at(-1).content,/Load this exact job output/);return tool('use_job_subtitles',{job_id:textId,role:'translation'});}
  if(phase==='retry'&&phaseTurn===1)return reply({role:'assistant',tool_calls:[{id:'restart',function:{name:'start_whisper',arguments:JSON.stringify({translate:true,forSpeech:true,target_language:'tr',start:0,end:300})}},{id:'attach-partial',function:{name:'use_generated_voice',arguments:'{"output_id":"voice-output"}'}},{id:'change-range',function:{name:'start_voice_generation',arguments:'{"sample":true}'}},{id:'retry-stage',function:{name:'start_voice_generation',arguments:'{}'}}]});
  if(phase==='voice'&&phaseTurn===1)return tool('start_voice_generation');
  if(phase==='attach'&&phaseTurn===1)return tool('use_generated_voice',{output_id:'voice-output'});
  return reply({role:'assistant',content:'Review the next real action.'});
 },{getJobs:jobs.snapshot,resolveJobId:external=>external==='text-backend'?textId:external==='voice-backend'?voiceId:null});
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>{
  let result;
  if(value.name==='start_whisper'){textId=jobs.start({kind:'transcription'});result={status:'accepted',jobId:'text-backend'};}
  if(value.name==='use_job_subtitles'){subtitleLoaded=true;assert.equal(value.args.job_id,'text-backend');result={status:'completed',track:{id:'new-tr',role:'translation',partial:false}};}
  if(value.name==='get_voice_status')result={status:'completed',voice:{busy:false,subtitleReady:true,engineAndReferenceReady:true,output:voiceId?{id:'voice-output',sample:false,syncInvalid:false}:null}};
  if(value.name==='start_voice_generation'){assert(subtitleLoaded);voiceStarts++;voiceId=jobs.start({kind:'voice'});result={status:'accepted',jobId:'voice-backend'};}
  if(value.name==='use_generated_voice'){assert.equal(jobs.snapshot().jobs.find(j=>j.id===voiceId).state,'completed');attached=true;result={status:'completed'};}
  assert(result,'Unexpected renderer action '+value.name);h.call('agentResult',{callId:value.callId,result});
 });};
 let token;
 async function run(nextPhase){phase=nextPhase;phaseTurn=0;h.events.length=0;const result=await h.call('agentRun',{requestId:'chain-'+turn,question:goal,owner:h.owner,...(token?{continuationId:token}:{})});assert(result.ok);return h.events.filter(e=>e.value.type==='proposal').map(e=>e.value.action);}
 async function apply(card){const result=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert(result.ok);token=result.result.continuationId;assert(token);}
 try{
  let cards=await run('start');assert.equal(cards.length,1);assert.equal(cards[0].tool,'start_whisper');await apply(cards[0]);
  assert((await h.call('agentRun',{requestId:'waiting',question:goal,owner:h.owner,continuationId:token})).waiting);assert.equal(turn,2);
  jobs.update(textId,{type:'done',outputs:[{path:'C:/synthetic/tr.srt',role:'translation',language:'tr',total:12,completed:12,failed:0}]});
  cards=await run('load');assert.equal(cards.length,1);assert.equal(cards[0].tool,'use_job_subtitles');assert.equal(voiceStarts,0);await apply(cards[0]);
  cards=await run('voice');assert.equal(cards[0]?.tool,'start_voice_generation');await apply(cards[0]);assert.equal(voiceStarts,1);
  const beforeWaiting=turn;assert((await h.call('agentRun',{requestId:'voice-wait',question:goal,owner:h.owner,continuationId:token})).waiting);assert.equal(attached,false);assert.equal(turn,beforeWaiting);
  jobs.update(voiceId,{type:'error'});cards=await run('retry');assert.equal(cards.length,1);assert.equal(cards[0].tool,'start_voice_generation');assert.equal(voiceStarts,1,'Retry review must not generate audio');assert.equal(attached,false);assert.equal(h.events.filter(e=>e.value.type==='tool-step'&&e.value.step.state==='blocked').length,3);await apply(cards[0]);assert.equal(voiceStarts,2);
  jobs.update(voiceId,{type:'done'});cards=await run('attach');assert.equal(cards[0].tool,'use_generated_voice');await apply(cards[0]);assert(attached);
 }finally{h.app.emit('will-quit');}
});

test('Book cards reject impossible source ranges, blank pages and empty production selections before offering an action',async()=>{
 const page={reader:{canPrepare:true,source:{type:'book-page',totalPages:5,text:'Readable'}}},chapter={reader:{canPrepare:true,source:{type:'book-chapter',chapterNumber:2,text:'Readable'}}};
 for(const [name,args,state,expected] of [
  ['prepare_book_narration',{from:1,to:6},page,false],['prepare_book_narration',{from:1,to:5},page,true],['prepare_book_narration',{from:1,to:101},{reader:{canPrepare:true,source:{type:'book-page',totalPages:200,text:'Readable'}}},false],
  ['prepare_book_narration',{from:1,to:1},{reader:{canPrepare:true,source:{type:'book-page',text:' '}}},false],
  ['prepare_book_narration',{from:1,to:2},chapter,false],['prepare_book_narration',{from:2,to:2,text:'translation'},chapter,false],['prepare_book_narration',{from:2,to:2},chapter,true],
  ['start_book_narration',{}, {production:{busy:false,selectedCount:0,total:3}},false],['book_chapter',{chapter:4,operation:'regenerate'},{production:{busy:false,total:3}},false]
 ]){let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'book',function:{name,arguments:JSON.stringify(args)}}]}):reply({role:'assistant',content:'Checked'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',...state}}));};assert((await h.call('agentRun',{requestId:'book-bounds',question:'Prepare',owner:{...h.owner,kind:'book'}})).ok);assert.equal(h.events.some(row=>row.value.type==='proposal'),expected,JSON.stringify([name,args]));h.app.emit('will-quit');}
});

test('Cancelling a continuation releases its lease while keeping the original completed action',async()=>{
 let turn=0;const h=fixture(async(_,options)=>{turn++;if(turn===1)return reply({role:'assistant',tool_calls:[{id:'one',function:{name:'open_settings',arguments:'{"section":"general"}'}}]});if(turn===2)return reply({role:'assistant',content:'Apply'});if(turn===3)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));return reply({role:'assistant',content:'Resumed'});});
 await h.call('agentRun',{requestId:'initial',question:'Open settings then explain',owner:h.owner});const proposal=h.events.find(e=>e.value.type==='proposal').value.action;
 const action=h.call('agentApply',{proposalId:proposal.proposalId,owner:h.owner});await new Promise(setImmediate);await h.call('agentResult',{callId:h.events.find(e=>e.value.type==='action').value.callId,result:{status:'completed'}});const token=(await action).result.continuationId;
 const input={requestId:'cancel-continuation',question:'Continue',continuationId:token,owner:h.owner},pending=h.call('agentRun',input);await new Promise(setImmediate);await h.call('agentCancel',{requestId:input.requestId});assert((await pending).cancelled);assert(h.service.flows.tokens.has(token));assert((await h.call('agentRun',{...input,requestId:'retry-continuation'})).ok);assert.equal(h.events.filter(e=>e.value.type==='action').length,1);h.app.emit('will-quit');
});

test('A renderer failed read is counted as failed evidence, never an applied action',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'one',function:{name:'get_voice_status',arguments:'{}'}}]}):reply({role:'assistant',content:'Read failed'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'failed',error:'Panel unavailable'}}));};
 const r=await h.call('agentRun',{requestId:'failed-read',question:'Voice status',owner:h.owner});assert(r.ok);assert.equal(r.execution.blockedOrFailed,1);assert.equal(r.execution.appliedActions,0);h.app.emit('will-quit');
});

test('Failed continuation can retry, reuses pending cards and consumes only a successful response',async()=>{
 let turn=0;const tool=section=>({id:'card-'+turn,function:{name:'open_settings',arguments:JSON.stringify({section})}});
 const h=fixture(async()=>{turn++;if(turn===1)return reply({role:'assistant',tool_calls:[tool('general')]});if(turn===2)return reply({role:'assistant',content:'Apply first'});if(turn===3||turn===5)return reply({role:'assistant',tool_calls:[tool('metadata')]});if(turn===4)throw Error('network interrupted');return reply({role:'assistant',content:'Ready'});});
 await h.call('agentRun',{requestId:'first',question:'Original goal',owner:h.owner});const p=h.events.find(row=>row.value.type==='proposal').value.action;
 const applying=h.call('agentApply',{proposalId:p.proposalId,owner:h.owner});await new Promise(setImmediate);const a=h.events.find(row=>row.value.type==='action').value;await h.call('agentResult',{callId:a.callId,result:{status:'completed'}});const receipt=await applying,token=receipt.result.continuationId;
 const input={requestId:'continue-one',question:'Continue',continuationId:token,owner:h.owner};assert.equal((await h.call('agentRun',input)).ok,false);assert(h.service.flows.tokens.has(token));
 const next=h.events.filter(row=>row.value.type==='proposal').at(-1).value.action.proposalId;
 assert((await h.call('agentRun',{...input,requestId:'continue-two'})).ok);assert.equal(h.events.filter(row=>row.value.type==='proposal').at(-1).value.action.proposalId,next);assert.equal(h.service.proposals.size,1);assert(!h.service.flows.tokens.has(token));assert.equal((await h.call('agentRun',{...input,requestId:'replay'})).ok,false);h.app.emit('will-quit');assert.equal(h.service.flows.tokens.size,0);
});

test('Web results are source-owned and multiple searches keep distinct safe citations',async()=>{
 let turn=0;const h=fixture(async()=>++turn<=2?reply({role:'assistant',tool_calls:[{id:'web'+turn,function:{name:'research_web',arguments:JSON.stringify({query:'question '+turn})}}]}):reply({role:'assistant',content:'Answer'}),{researchWeb:async query=>({text:'fact',sources:[null,{title:query,url:'https://example.com/'+query.slice(-1)},{title:'duplicate',url:'https://example.com/1'}]})});
 const r=await h.call('agentRun',{requestId:'web-multiple',question:'Compare sources',owner:h.owner});assert(r.ok);assert(r.text.includes('https://example.com/1'));assert(r.text.includes('https://example.com/2'));assert.equal((r.text.match(/https:\/\/example.com\/1/g)||[]).length,1);h.app.emit('will-quit');
 let stale;stale=fixture(async()=>reply({role:'assistant',tool_calls:[{id:'web',function:{name:'research_web',arguments:'{"query":"source"}'}}]}),{researchWeb:async()=>{stale.state.valid=false;return {text:'late',sources:[]};}});
 assert.equal((await stale.call('agentRun',{requestId:'web-stale',question:'Research',owner:stale.owner})).ok,false);assert(!stale.events.some(row=>row.value.type==='proposal'));stale.app.emit('will-quit');
});
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
 assert.equal((await apply).result.status,'accepted');const replay=await h.call('agentApply',{proposalId:action.proposalId,owner:h.owner});assert.deepEqual([replay.ok,replay.replayed,replay.result.status],[true,true,'accepted']);assert.equal(h.events.filter(row=>row.value.type==='action').length,1,'a repeated approval replays the real result and is never dispatched again');
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
  const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:value.name==='list_voice_references'?{status:'completed',selectionIdentity:'selection-A',references:[{id:'voice-A',name:'My voice',selectionToken:'native-A'}]}:{status:'completed',voice:{busy:false,subtitleReady:true,ready:true,groups:[{id:'g1',number:1}],output:{id:'out-A',sample:false,syncInvalid:false}}}}));};
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


test('An accepted exact linked job waits without provider calls and keeps failed-stage evidence for reviewed retry',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs();let turn=0,linked;
 const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'page',function:{name:'translate_page',arguments:'{}'}}]}):reply({role:'assistant',content:'Proposed.'}),{getJobs:jobs.snapshot,resolveJobId:external=>external==='backend-exact'?linked:null});
 await h.call('agentRun',{requestId:'accepted-flow',question:'Translate then explain',owner:h.owner});const p=h.events.find(row=>row.value.type==='proposal').value.action;const apply=h.call('agentApply',{proposalId:p.proposalId,owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(row=>row.value.type==='action').value;linked=jobs.start({});await h.call('agentResult',{callId:action.callId,result:{status:'accepted',jobId:'backend-exact'}});const receipt=await apply;assert(receipt.result.continuationId);
 const waiting=await h.call('agentRun',{requestId:'waiting-flow',question:'Continue',continuationId:receipt.result.continuationId,owner:h.owner});assert(waiting.waiting);assert.equal(turn,2);jobs.update(linked,{type:'error'});assert.equal((await h.call('agentRun',{requestId:'failed-flow',question:'Continue',continuationId:receipt.result.continuationId,owner:h.owner})).ok,true);assert.equal(turn,3);h.app.emit('will-quit');
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


test('Renderer read timeout sends one cancellation and refuses its late receipt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'read',function:{name:'get_voice_status',arguments:'{}'}}]}):reply({role:'assistant',content:'Read timed out.'}));
 try{const run=h.call('agentRun',{requestId:'read-timeout',question:'Voice status',owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(r=>r.value.type==='action').value;t.mock.timers.tick(30000);assert((await run).ok);assert.equal(h.events.filter(r=>r.value.type==='action-cancel'&&r.value.callId===action.callId).length,1);assert.equal((await h.call('agentResult',{callId:action.callId,result:{status:'completed',voice:{}}})).ok,false);assert.equal(h.sender.listenerCount('destroyed'),0);}finally{h.app.emit('will-quit');}
});
test('Session deadline is retryable failure, while explicit stop remains cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let turn=0;const h=fixture(async(_,opts)=>++turn===1?new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})):reply({role:'assistant',content:'Next request works.'}));
 try{const run=h.call('agentRun',{requestId:'deadline',question:'Explain',owner:h.owner});await new Promise(r=>setImmediate(r));t.mock.timers.tick(120000);const r=await run;assert.equal(r.ok,false);assert.equal(r.timedOut,true);assert.equal(r.cancelled,false);assert.match(r.error,/can retry/);assert.equal(h.service.sessions.size,0);assert((await h.call('agentRun',{requestId:'retry',question:'Explain',owner:h.owner})).ok);}finally{h.app.emit('will-quit');}
});
test('Closing the applying renderer releases the application lock and rejects late results',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'open',function:{name:'open_settings',arguments:'{"section":"general"}'}}]}):reply({role:'assistant',content:'Review it.'}));
 try{await h.call('agentRun',{requestId:'close-apply',question:'Open settings',owner:h.owner});const proposal=h.events.find(r=>r.value.type==='proposal').value.action;const applying=h.call('agentApply',{proposalId:proposal.proposalId,owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(r=>r.value.type==='action').value;h.sender.isDestroyed=()=>true;h.sender.emit('destroyed');assert.equal((await applying).ok,false);assert.equal(h.service.applications.size,0);assert.equal(h.sender.listenerCount('destroyed'),0);assert.equal((await h.call('agentResult',{callId:action.callId,result:{status:'completed'}})).ok,false);}finally{h.app.emit('will-quit');}
});
test('A source change invalidates a renderer receipt; progress exposes only a bounded domain',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'read',function:{name:'get_voice_status',arguments:'{}'}}]}):reply({role:'assistant',content:'Source changed.'}));
 try{const run=h.call('agentRun',{requestId:'stale-read',question:'Read voice state',owner:h.owner});await new Promise(r=>setImmediate(r));const action=h.events.find(r=>r.value.type==='action').value;h.state.valid=false;assert.equal((await h.call('agentResult',{callId:action.callId,result:{status:'completed',voice:{secret:'must not reach model'}}})).ok,false);await run;assert.equal(h.events.filter(r=>r.value.type==='action-cancel').length,1);const progress=h.events.filter(r=>r.value.type==='progress').map(r=>r.value);assert.equal(progress[0].domain,'voice');assert.equal(progress[0].phase,'tool');assert.equal(progress.at(-1).phase,'thinking');assert(!JSON.stringify(progress).includes('secret'));}finally{h.app.emit('will-quit');}
});

test('A text-only provider answer is refused if its source changed before completion',async()=>{let done;const h=fixture(()=>new Promise(r=>done=r));try{const run=h.call('agentRun',{requestId:'stale-final-text',question:'Explain',owner:h.owner});await new Promise(setImmediate);h.state.valid=false;done(reply({role:'assistant',content:'Old source answer'}));const r=await run;assert.equal(r.ok,false);assert.match(r.error,/source changed/);assert.equal(h.service.sessions.size,0);}finally{h.app.emit('will-quit');}});

test('Workflow cards show exact changes and refuse a changed settings snapshot before applying',async()=>{
 for(const drift of [false,true]){
 let turn=0,model='large-v3',applied=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'configure',function:{name:'configure_workflow',arguments:JSON.stringify({domain:'transcription',changes_json:'{"model":"tiny","beamSize":3}'})}}]}):reply({role:'assistant',content:'Card ready.'}));
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>{if(value.name==='get_workflow_settings')h.call('agentResult',{callId:value.callId,result:{status:'completed',values:{model,beamSize:5}}});else{applied++;h.call('agentResult',{callId:value.callId,result:{status:'completed',note:'Saved; no job started.'}});}});};
 try{assert((await h.call('agentRun',{requestId:'workflow',question:'Set tiny with beam three',owner:h.owner})).ok);const card=h.events.find(e=>e.value.type==='proposal').value.action;assert.match(card.summary,/large-v3 → tiny/);assert.match(card.summary,/5 → 3/);if(drift)model='base';const result=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(result.ok,!drift);assert.equal(applied,drift?0:1);if(drift)assert.match(result.error,/settings changed/);
 }finally{h.app.emit('will-quit');}
 }
});

test('translation cards bind the exact configured model and reject a changed profile before dispatch',async()=>{
 for(const drift of [false,true]){let turn=0,model='deepseek-ai/DeepSeek-V4.1-Flash-1017',applied=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'transcribe',function:{name:'start_whisper',arguments:JSON.stringify({translate:true,translation_profile:'assistant',target_language:'tr'})}}]}):reply({role:'assistant',content:'Card ready.'}));const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>{if(value.name==='get_translation_profile')h.call('agentResult',{callId:value.callId,result:{status:'completed',profile:{id:'assistant',model,provider:'api.deepinfra.com'}}});else{applied++;h.call('agentResult',{callId:value.callId,result:{status:'accepted',jobId:'synthetic'}});}});};try{assert((await h.call('agentRun',{requestId:'profile',question:'Whisper then translate with DeepSeek',owner:h.owner})).ok);const card=h.events.find(e=>e.value.type==='proposal').value.action;assert.match(card.summary,/DeepSeek/);if(drift)model='changed';const result=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(result.ok,!drift);assert.equal(applied,drift?0:1);}finally{h.app.emit('will-quit');}}
});


test('completed subtitle receipt maps a real ledger ID to the original backend job and refuses another source',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs(),id=jobs.start({kind:'transcription'});let tool,args,turn=0,toolResult,applied;
 const h=fixture(async(_url,options)=>{const body=JSON.parse(options.body);if(++turn===1)return reply({role:'assistant',tool_calls:[{id:'call',function:{name:tool,arguments:JSON.stringify(args)}}]});toolResult=JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);return reply({role:'assistant',content:'Checked'});},{getJobs:()=>jobs.snapshot(),resolveJobId:external=>external==='external-job'?id:null});
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>{if(value.name==='use_job_subtitles')applied=value.args;h.call('agentResult',{callId:value.callId,result:value.name==='start_whisper'?{status:'accepted',jobId:'external-job'}:{status:'completed'}});});};
 async function run(name,values,owner=h.owner){tool=name;args=values;turn=0;h.events.length=0;const result=await h.call('agentRun',{requestId:'job-test',question:'Explicit test command',owner});assert(result.ok);return h.events.find(row=>row.value.type==='proposal')?.value.action;}
 const start=await run('start_whisper',{translate:false});assert(start);assert((await h.call('agentApply',{proposalId:start.proposalId,owner:h.owner})).ok);
 jobs.update(id,{type:'done',outputs:[{path:'C:/fixture/en.srt',role:'source',language:'en',total:1,completed:1}]});
 await run('get_job_result',{job_id:id});assert.equal(toolResult.job.sourceMatches,true);assert.equal(toolResult.job.result.artifacts[0].completed,1);assert(!JSON.stringify(toolResult).includes('C:/'));
 const card=await run('use_job_subtitles',{job_id:id,role:'source'});assert(card);assert((await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner})).ok);assert.equal(applied.job_id,'external-job');
 assert.equal(await run('use_job_subtitles',{job_id:id,role:'source'},{...h.owner,owner:'another-video'}),undefined);assert.equal(toolResult.status,'failed');h.app.emit('will-quit');
});


test('job status pages prioritize active work and remain within the model result budget',async()=>{
 const jobs=require('../src/assistant-jobs').createJobs();for(let n=0;n<20;n++){const id=jobs.start({});jobs.update(id,{type:'done',outputs:Array.from({length:12},(_,i)=>({path:'C:/fixture/'+i+'.srt',role:'source',language:'en',total:2,completed:1,failed:1}))});}const active=jobs.start({});let turn=0,toolResult;
 const h=fixture(async(_u,options)=>{const body=JSON.parse(options.body);if(++turn===1)return reply({role:'assistant',tool_calls:[{id:'jobs',function:{name:'get_job_status',arguments:'{}'}}]});toolResult=JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);return reply({role:'assistant',content:'Jobs inspected'});},{getJobs:()=>jobs.snapshot()});assert((await h.call('agentRun',{requestId:'job-page',question:'Read jobs',owner:h.owner})).ok);assert.equal(toolResult.jobs[0].id,active);assert.equal(toolResult.jobs.length,5);assert.equal(toolResult.nextOffset,5);assert(JSON.stringify(toolResult).length<16000);h.app.emit('will-quit');
});


test('workflow proposal refuses to imply a before value for an unreadable control',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'configure-missing',function:{name:'configure_workflow',arguments:JSON.stringify({domain:'transcription',changes_json:'{"beamSize":3}'})}}]}):reply({role:'assistant',content:'No settings applied.'}));
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',values:{model:'large-v3'}}}));};
 try{await h.call('agentRun',{requestId:'missing-control',question:'Change beam',owner:h.owner});assert.equal(h.events.filter(e=>e.value.type==='proposal').length,0);}finally{h.app.emit('will-quit');}
});


test('an undo card is bound to its exact restoration target even if current values return to the same snapshot',async()=>{
 let turn=0,target=5,applied=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'undo-target',function:{name:'undo_workflow_settings',arguments:JSON.stringify({domain:'transcription'})}}]}):reply({role:'assistant',content:'Undo card prepared.'}));
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>{if(value.name==='get_workflow_settings')h.call('agentResult',{callId:value.callId,result:{status:'completed',values:{beamSize:3},canUndo:true,undoChanges:{beamSize:target}}});else{applied++;h.call('agentResult',{callId:value.callId,result:{status:'completed'}});}});};
 try{await h.call('agentRun',{requestId:'undo-target',question:'Undo beam',owner:h.owner});const card=h.events.find(e=>e.value.type==='proposal').value.action;target=7;const result=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(result.ok,false);assert.equal(applied,0);}finally{h.app.emit('will-quit');}
});


test('book citations come from registered search results, not generated page claims',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'book',function:{name:'search_book',arguments:'{"query":"needle"}'}}]}):reply({role:'assistant',content:'See [B3-0], and an unsupported page 999.'}));
 const send=h.sender.send;h.sender.send=(channel,value)=>{send(channel,value);if(value.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:value.callId,result:{status:'completed',matches:[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',navigable:true,text:'Needle on page three.'}]}}));};
 const owner={...h.owner,kind:'book',owner:'pdf-hash'};const r=await h.call('agentRun',{requestId:'book-citation',question:'Find needle',owner});assert(r.ok,r.error);assert.deepEqual(r.bookCitations,[{id:'B3-0',page:3,sourceId:'pdf-hash',kind:'page',text:'Needle on page three.'}]);h.app.emit('will-quit');
});

test('Daily watchlist proposal captures its revision before approval and passes that unchanged snapshot to renderer',async()=>{
 let turn=0,writes=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'daily-1',function:{name:'set_watchlist_section',arguments:JSON.stringify({item_id:'catalog:film-a',section:'together'})}}]}):reply({role:'assistant',content:'Review the proposed list section.'}));h.owner={...h.owner,kind:'library'};
 h.sender.send=(_channel,value)=>{h.events.push({value});if(value.type==='action')queueMicrotask(()=>{let result;if(value.name==='get_title_details')result={status:'completed',item:{title:'Film A',kind:'film'},identity:'exact-title'};if(value.name==='read_daily_library')result={status:'completed',revision:'watchlist-r1',watchlist:[],series:[]};if(value.name==='set_watchlist_section'){assert.deepEqual(value.expectedSettings,{kind:'daily-queue',revision:'watchlist-r1'});writes++;result={status:'completed',section:'together'};}assert(result,value.name);h.call('agentResult',{callId:value.callId,result});});};
 try{const r=await h.call('agentRun',{requestId:'daily-proposal',question:'Put Film A in my together watchlist section',owner:h.owner});assert(r.ok);const card=h.events.find(e=>e.value.type==='proposal')?.value.action;assert(card,'A real action card must be emitted');assert.equal(writes,0);const applied=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(writes,1);}finally{h.app.emit('will-quit');}
});


test('General taste preference cards capture revision without writing and apply only the reviewed packet',async()=>{
 let turn=0;const h=fixture(async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'taste-write',function:{name:'update_taste_preferences',arguments:'{"story":5,"avoid":["pace"]}'}}]}):reply({role:'assistant',content:'Review the preference card.'}));let writes=0;const packets=[];
 const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')queueMicrotask(()=>{packets.push(packet);let result;if(packet.name==='get_taste_profile')result={status:'completed',profile:{preferencesRevision:'prefs-actual'}};else{writes++;assert.equal(packet.name,'update_taste_preferences');assert.equal(packet.expectedSettings.revision,'prefs-actual');assert.equal(packet.expectedSettings.args,JSON.stringify(packet.args));result={status:'completed'};}h.call('agentResult',{callId:packet.callId,result});});};
 try{const result=await h.call('agentRun',{requestId:'taste-change',question:'Set my global story priority to 5 and avoid pace.',owner:h.owner});assert.equal(result.ok,true,result.error);assert.equal(writes,0);const cards=h.events.filter(e=>e.value.type==='proposal');assert.equal(cards.length,1);assert.match(cards[0].value.action.summary,/Story: 5/);assert.equal(packets[0].name,'get_taste_profile');const applied=await h.call('agentApply',{proposalId:cards[0].value.action.proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert.equal(writes,1);
 }finally{h.app.emit('will-quit');}
});

test('A resumed "so far" video flow keeps the cutoff of its question on every provider channel',async()=>{
 const rows=[{id:'U1',start:590,end:595,text:'HEARD_EARLY_LINE alpha',translation:''},{id:'U2',start:596,end:612,text:'ACTIVE_LATE_LINE alpha',translation:''},{id:'U3',start:700,end:710,text:'FUTURE_LINE alpha',translation:''}];
 let phase='first',turn=0;const bodies=[],call=(id,name,args)=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
 const h=fixture(async(_url,options)=>{bodies.push({phase,text:JSON.stringify(JSON.parse(options.body).messages)});
  if(phase==='first')return reply(turn++===0?call('c1','restore_original_audio',{}):{role:'assistant',content:'Prepared.'});
  return reply(turn++===0?call('c2','search_subtitles',{query:'alpha'}):{role:'assistant',content:'Done.'});});
 h.owner.time=600;const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:packet.callId,result:{status:'completed'}}));};
 const question='Bu ana kadar ne söylendi? Sonra özgün sese dön.';
 try{
  const first=await h.call('agentRun',{requestId:'so-far',question,owner:h.owner,pool:rows,context:'FULL_TRANSCRIPT_MARKER',history:[{role:'assistant',content:'HISTORY_MARKER'}]});assert.equal(first.ok,true,first.error);
  const card=h.events.find(e=>e.value.type==='proposal').value.action,applied=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert(applied.result.continuationId);
  phase='resume';turn=0;h.events.length=0;
  const resumed=await h.call('agentRun',{requestId:'so-far-2',question,owner:{...h.owner,time:1200},pool:rows,continuationId:applied.result.continuationId});assert.equal(resumed.ok,true,resumed.error);
  const all=bodies.map(row=>row.text).join('\n'),late=bodies.filter(row=>row.phase==='resume').map(row=>row.text).join('\n');
  for(const marker of ['FUTURE_LINE','ACTIVE_LATE_LINE','FULL_TRANSCRIPT_MARKER','HISTORY_MARKER'])assert(!all.includes(marker),marker+' must never reach the provider');
  assert(late.includes('HEARD_EARLY_LINE'),'the finished line before the question moment stays available');
  assert(!JSON.stringify(h.events.filter(e=>e.value.type==='evidence')).match(/FUTURE_LINE|ACTIVE_LATE_LINE/));
 }finally{h.app.emit('will-quit');}
});

test('A resumed "so far" Podcast flow keeps the cutoff of its question on every provider channel',async()=>{
 const rows=[{id:'U1',start:590,end:595,text:'HEARD_EARLY_LINE alpha',translation:''},{id:'U2',start:596,end:612,text:'ACTIVE_LATE_LINE alpha',translation:''},{id:'U3',start:700,end:710,text:'FUTURE_LINE alpha',translation:''}];
 let phase='first',turn=0;const bodies=[],call=(id,name,args)=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
 const h=fixture(async(_url,options)=>{bodies.push({phase,text:JSON.stringify(JSON.parse(options.body).messages)});
  if(phase==='first')return reply(turn++===0?call('c1','restore_original_audio',{}):{role:'assistant',content:'Prepared.'});
  return reply(turn++===0?call('c2','search_subtitles',{query:'alpha'}):{role:'assistant',content:'Done.'});});
 h.owner.time=600;h.owner.kind='studio';h.owner.hasMedia=true;const send=h.sender.send;h.sender.send=(channel,packet)=>{send(channel,packet);if(packet.type==='action')queueMicrotask(()=>h.call('agentResult',{callId:packet.callId,result:{status:'completed'}}));};
 const question='Bu ana kadar ne söylendi? Sonra özgün sese dön.';
 try{
  const first=await h.call('agentRun',{requestId:'so-far',question,owner:h.owner,pool:[{id:'U9',start:0,end:1,text:'UNRELATED_HIDDEN_PLAYER'}],context:{workspace:'podcast',watched_cutoff:600,evidence:rows},history:[{role:'assistant',content:'HISTORY_MARKER'}]});assert.equal(first.ok,true,first.error);
  const card=h.events.find(e=>e.value.type==='proposal').value.action,applied=await h.call('agentApply',{proposalId:card.proposalId,owner:h.owner});assert.equal(applied.ok,true,applied.error);assert(applied.result.continuationId);
  phase='resume';turn=0;h.events.length=0;
  const resumed=await h.call('agentRun',{requestId:'so-far-2',question,owner:{...h.owner,time:1200},pool:rows,continuationId:applied.result.continuationId});assert.equal(resumed.ok,true,resumed.error);
  const all=bodies.map(row=>row.text).join('\n'),late=bodies.filter(row=>row.phase==='resume').map(row=>row.text).join('\n');
  for(const marker of ['FUTURE_LINE','ACTIVE_LATE_LINE','UNRELATED_HIDDEN_PLAYER','HISTORY_MARKER'])assert(!all.includes(marker),marker+' must never reach the provider');
  assert(late.includes('HEARD_EARLY_LINE'),'the finished line before the question moment stays available');
  assert(!JSON.stringify(h.events.filter(e=>e.value.type==='evidence')).match(/FUTURE_LINE|ACTIVE_LATE_LINE/));
 }finally{h.app.emit('will-quit');}
});

const settingsProvider=()=>{let turn=0;return async()=>++turn===1?reply({role:'assistant',tool_calls:[{id:'open',function:{name:'open_settings',arguments:'{"section":"general"}'}}]}):reply({role:'assistant',content:'Review it.'});};
const dispatches=h=>h.events.filter(row=>row.value.type==='action').length;
test('A repeated approval replays the one verified result, reports a running one as pending and never dispatches twice',async()=>{
 const h=fixture(settingsProvider());
 try{
  await h.call('agentRun',{requestId:'dup',question:'Open settings',owner:h.owner});
  const proposal=h.events.find(r=>r.value.type==='proposal').value.action,id=proposal.proposalId;
  const first=h.call('agentApply',{proposalId:id,owner:h.owner});await new Promise(r=>setImmediate(r));
  const request=h.events.find(r=>r.value.type==='action').value;
  const during=await h.call('agentApply',{proposalId:id,owner:h.owner});
  assert.deepEqual([during.ok,during.pending],[false,true],'a duplicate while running is a still-running state');assert.equal(dispatches(h),1);
  await h.call('agentResult',{callId:request.callId,result:{status:'completed',note:'Opened'}});
  const applied=await first;assert.equal(applied.ok,true);
  // The response was lost and the user retries the same card.
  const retry=await h.call('agentApply',{proposalId:id,owner:h.owner});
  assert.equal(retry.ok,true);assert.equal(retry.replayed,true);assert.deepEqual(retry.result,applied.result);assert.equal(dispatches(h),1);
  assert.equal((await h.call('agentApply',{proposalId:id,owner:{...h.owner,thread:'other'}})).ok,false,'a changed conversation never replays');
  assert.equal((await h.call('agentApply',{proposalId:id,owner:{...h.owner,generation:9}})).ok,false,'a changed source never replays');
  assert.equal((await h.call('agentApply',{proposalId:id,owner:h.owner},{sender:{id:8},senderFrame:'main'})).ok,false,'another window cannot read it');
  // A receipt is bounded in time: once expired it explains nothing and authorizes nothing.
  h.service.receipts.get(id).expires=Date.now()-1;
  const late=await h.call('agentApply',{proposalId:id,owner:h.owner});assert.equal(late.ok,false);assert.match(late.error,/expired/);assert.equal(h.service.receipts.size,0);assert.equal(dispatches(h),1);
 }finally{h.app.emit('will-quit');}
});
test('A window closing after dispatch leaves an unknown result that is never re-applied or reported as a plain failure',async()=>{
 const h=fixture(settingsProvider());
 try{
  await h.call('agentRun',{requestId:'lost',question:'Open settings',owner:h.owner});
  const id=h.events.find(r=>r.value.type==='proposal').value.action.proposalId;
  const applying=h.call('agentApply',{proposalId:id,owner:h.owner});await new Promise(r=>setImmediate(r));
  h.sender.isDestroyed=()=>true;h.sender.emit('destroyed');
  const lost=await applying;assert.deepEqual([lost.ok,lost.uncertain],[false,true]);assert.match(lost.error,/unknown/i);assert.match(lost.error,/Uygulama sonucu bilinmiyor/);assert(!/Another|failed/i.test(lost.error));
  h.sender.isDestroyed=()=>false;
  const again=await h.call('agentApply',{proposalId:id,owner:h.owner});
  assert.deepEqual([again.ok,again.uncertain,again.replayed],[false,true,true]);assert.equal(dispatches(h),1,'the unknown action is not dispatched again');
  assert.equal(h.service.applications.size,0);
 }finally{h.app.emit('will-quit');}
});
test('A failure before dispatch stays a certain failure and leaves no receipt',async()=>{
 const h=fixture(settingsProvider());
 try{
  await h.call('agentRun',{requestId:'pre',question:'Open settings',owner:h.owner});
  const id=h.events.find(r=>r.value.type==='proposal').value.action.proposalId;
  assert.equal((await h.call('agentApply',{proposalId:id,owner:{...h.owner,thread:'B'}})).ok,false);assert.equal(h.service.receipts.size,0);assert.equal(dispatches(h),0);
  const applying=h.call('agentApply',{proposalId:id,owner:h.owner});await new Promise(r=>setImmediate(r));
  const request=h.events.find(r=>r.value.type==='action').value;
  await h.call('agentResult',{callId:request.callId,result:{status:'failed',error:'Settings window refused.'}});
  const result=await applying;assert.equal(result.ok,true);assert.equal(result.result.status,'failed');
  assert.deepEqual((await h.call('agentApply',{proposalId:id,owner:h.owner})).result,result.result,'the real failed result is what a repeat sees');
 }finally{h.app.emit('will-quit');}
});
test('Approval receipts are bounded, expire, never prune running entries and cannot authorize',()=>{
 let clock=1000;const store=require('../src/assistant-receipts').createReceipts({ttl:50,max:3,now:()=>clock});
 store.claim('run',{sender:1,owner:{},name:'x'});
 for(const id of ['a','b','c','d']){store.claim(id,{sender:1,owner:{},name:'x'});store.settle(id,{state:'settled',result:{id}});}
 assert.equal(store.get('run').state,'applying','a running entry is never pruned');
 assert.equal(store.get('a'),null);assert.equal(store.get('b'),null);assert.equal(store.get('d').result.id,'d');assert(store.size<=3);
 clock+=51;assert.equal(store.get('d'),null,'settled entries expire');assert.equal(store.get('run').state,'applying');
 store.drop('run');assert.equal(store.size,0);
});

test('A card that is no longer active never claims it did not run, and an expired unclaimed card says nothing ran',async()=>{
 const h=fixture(settingsProvider());
 try{
  await h.call('agentRun',{requestId:'expiry',question:'Open settings',owner:h.owner});
  const id=h.events.find(r=>r.value.type==='proposal').value.action.proposalId;
  h.service.proposals.get(id).expires=Date.now()-1;
  const expired=await h.call('agentApply',{proposalId:id,owner:h.owner});
  assert.equal(expired.ok,false);assert.match(expired.error,/expired before it was applied; nothing ran/);assert.equal(expired.unconfirmed,undefined);assert.equal(dispatches(h),0);
  const unknown=await h.call('agentApply',{proposalId:'never-seen-proposal',owner:h.owner});
  assert.deepEqual([unknown.ok,unknown.unconfirmed],[false,true]);assert.match(unknown.error,/cannot be confirmed/);assert.doesNotMatch(unknown.error,/did not run|nothing ran/i);assert.equal(dispatches(h),0);
 }finally{h.app.emit('will-quit');}
});
