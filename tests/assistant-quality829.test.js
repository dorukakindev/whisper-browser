'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const plans=require('../src/assistant-workflow-plan'),registry=require('../src/assistant-capabilities');
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const source={kind:'video',owner:'source-A',thread:'thread-A',tabId:'A',generation:1,title:'Current video',range:{start:10,end:40},tracks:[{id:'captured-A',role:'source',language:'en'}]};
function harness(options={}){
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),cards=[],actions=[],results=[];let calls=[],turn=0;
 sender.id=829;sender.isDestroyed=()=>false;const event={sender};
 const call=(name,input)=>handlers.get('assistant:'+name)(event,input);
 sender.send=(_channel,packet)=>{if(packet.type==='proposal')cards.push(packet.action);if(packet.type==='action'){actions.push(packet);queueMicrotask(()=>call('agentResult',{callId:packet.callId,result:options.rendererResult||{status:'completed'}}));}};
 require('../src/assistant-agent-service').register({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),fetchImpl:async(_url,request)=>{const body=JSON.parse(request.body);if(++turn%2===1)return reply({role:'assistant',tool_calls:calls.map(([name,args],i)=>({id:'tool-'+i,function:{name,arguments:JSON.stringify(args)}}))});results.push(...body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)));return reply({role:'assistant',content:'Checked evidence.'});},...options});
 return {cards,actions,results,call,close:()=>app.emit('will-quit'),run:async(next,question='Read evidence',owner=source)=>{calls=next;return call('agentRun',{requestId:'run-'+turn,question,owner,locale:'en'});}};
}
test('Q16 ordered plan carries the exact source/range and never implies readiness or execution',async()=>{
 const h=harness();try{const result=await h.run([['get_workflow_plan',{goal:'dubbing'}]]);assert(result.ok);const plan=h.results[0];assert.equal(plan.execution,'plan_only');assert.deepEqual(plan.source.range,{start:10,end:40});assert.equal(plan.source.title,'Current video');assert(!Object.hasOwn(plan.source,'owner'));assert(plan.steps.every(step=>step.state==='planned'));assert(plan.steps.findIndex(row=>row.tool==='get_job_result')<plan.steps.findIndex(row=>row.tool==='use_job_subtitles'));assert.equal(h.cards.length,0);assert.equal(h.actions.length,0);}finally{h.close();}
});
test('Q18 bare translation requests cannot let a model pick page, captured, probed or Whisper routes',async()=>{
 for(const [tool,args] of [['translate_page',{}],['translate_captions',{track_id:'captured-A'}],['translate_video_captions',{caption_id:'guessed'}],['start_whisper',{translate:true}]]){
  const h=harness();try{const result=await h.run([[tool,args]],'Bunu çevir');assert(result.ok);assert.equal(h.cards.length,0);assert.equal(h.actions.length,0);assert.equal(h.results[0].status,'blocked');assert.match(h.results[0].note,/does not select a translation source/);}finally{h.close();}
 }
 for(const text of ['Translate this please','Bunu çevirir misin?','Bunu türkçeye çevir','Translate this into Turkish','Bunu cevir'])assert(plans.ambiguousTranslation(text,source));
 for(const text of ['Sayfayı çevir','Altyazıyı çevir','Whisper ile çevir','Bunu çevirme','"bunu çevir" ne demek?'])assert(!plans.ambiguousTranslation(text,source));
 assert(!plans.ambiguousTranslation('Translate this',{kind:'page'}));
});
test('Q19–20 a batched settings preview explains next-job effects without changing stored settings',()=>{
 const settings=require('../src/assistant-setting-proposals'),before={profile:'quality',grouping:'cumle',keepBackground:false},after={profile:'fast',grouping:'anlatim',keepBackground:true};
 const identity=settings.snapshot('configure_voice_generation',after,{status:'completed',voice:{settings:before}}),preview=settings.summary('configure_voice_generation',after,identity,'en');
 for(const text of ['Quality → Fast','Sentences → Sentence flow','Off → On','next generation','music and ambience','Generation does not start'])assert(preview.includes(text),text);
 assert.deepEqual(before,{profile:'quality',grouping:'cumle',keepBackground:false});
 const workflow=require('../src/assistant-workflow-settings').summary('translation','{"forSpeech":true,"refine":false,"lenient":true}','tr',{values:{forSpeech:false,refine:false,lenient:true}});
 assert.match(workflow,/Etkin/);assert.match(workflow,/kuyruğa eklenmiş/);assert.match(workflow,/İş başlatılmaz/);
});
test('Q21 another page can inspect the original job source without acquiring its output',async()=>{
 const job={id:'job-main',state:'running',kind:'transcription'};
 const h=harness({getJobs:()=>({revision:1,jobs:[job]}),resolveJobId:id=>id==='backend-1'?'job-main':null,rendererResult:{status:'accepted',jobId:'backend-1'}});
 try{assert((await h.run([['start_whisper',{translate:false}]],'Start Whisper')).ok);assert((await h.call('agentApply',{proposalId:h.cards[0].proposalId,owner:source})).ok);
  const other={kind:'page',owner:'source-B',thread:'thread-B',tabId:'B',generation:2,title:'Other page'};
  assert((await h.run([['get_job_status',{}]],'Check my running job',other)).ok);const status=h.results.at(-1).jobs[0];assert.equal(status.id,'job-main');assert.equal(status.sourceMatches,false);assert.equal(status.startedSource.title,'Current video');assert.deepEqual(status.startedSource.range,source.range);assert(!JSON.stringify(status.startedSource).includes('source-A'));assert.equal(h.cards.length,1);
 }finally{h.close();}
});
test('Q22 context tools expose real alternatives while preserving domain restrictions',()=>{
 assert(registry.list(source).some(row=>row.name==='get_workflow_plan'));
 assert(!registry.list({kind:'page'}).some(row=>row.name==='start_whisper'));
 assert(!registry.list({kind:'book'}).some(row=>row.name==='translate_page'));
 assert(plans.translationChoices(source).some(row=>row.track_id==='captured-A'));
 assert(plans.translationChoices(source).find(row=>row.route==='whisper').requiresExplicitWhisper);
 assert(!plans.translationChoices({...source,tracks:[{id:'translated',role:'translation'}]}).some(row=>row.track_id));
 const existing=plans.build({...source,tracks:[{id:'translated',role:'translation'}]},'dubbing');
 assert(!existing.steps.some(row=>row.tool==='translate_selected_source'));
 assert(existing.steps.some(row=>row.tool==='review_attached_translation'));
 assert(!existing.translationChoices.some(row=>row.route==='page'));
});
test('Q17/Q23 provider research keeps sourced synthesis separate from page excerpts; empty evidence fails',async()=>{
 for(const result of [{text:'Provider sourced synthesis',sources:[{url:'https://example.org/article',title:'External source'}]}, {status:'failed',text:'Guess',sources:[{url:'https://example.org/article'}]}, {text:'Unsafe',sources:[{url:'http://localhost/private'}]},{}]){
  const h=harness({researchWeb:async()=>result});try{assert((await h.run([['research_web',{query:'Public facts'}]])).ok);const evidence=h.results[0];if(result.text==='Provider sourced synthesis'){assert.equal(evidence.status,'completed');assert.equal(evidence.text,result.text);assert.equal(evidence.sourceKind,'provider_synthesis');assert.deepEqual(evidence.passages,[]);assert.match(evidence.scope,/separate from the attached open page/);}else assert.equal(evidence.status,'failed');}finally{h.close();}
 }
});

test('watch itinerary uses a reviewed opening card with the exact route snapshot',async()=>{
 const route={items:[{itemId:'film-a',title:'Saved fixture',runtimeMinutes:85}],totalMinutes:85,breaksMinutes:0,budgetMinutes:150};
 const h=harness({rendererResult:{status:'completed',route}});
 try{
  const args={budget_minutes:150,break_minutes:10};
  assert((await h.run([['plan_watch_itinerary',args],['open_watch_itinerary',args]],'I have two and a half hours. Include a break.')).ok);
  assert.equal(h.cards.length,1);
  assert.match(h.cards[0].summary,/Saved fixture/);
  assert.equal(h.actions.filter(action=>action.name==='open_watch_itinerary').length,0);
  assert((await h.call('agentApply',{proposalId:h.cards[0].proposalId,owner:source})).ok);
  assert.equal(h.actions.at(-1).expectedSettings?.revision,JSON.stringify(route));
 }finally{h.close();}
});
