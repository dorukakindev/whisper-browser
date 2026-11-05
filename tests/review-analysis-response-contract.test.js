'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{EventEmitter}=require('node:events'),{JSDOM}=require('jsdom');
const model=require('../src/renderer/media-tools-model'),provider=require('../src/assistant-provider'),{register}=require('../src/assistant-agent-service');
const item={kind:'film',title:'Forty review response fixture',year:2026,imdbId:'tt1234567'};
const evidence=model.decisionEvidence(item,Array.from({length:40},(_,i)=>({id:'R'+(i+1),authorId:'author'+i,text:`Source ${i+1}: The performances remain compelling. `+'A patient and exact source opinion. '.repeat(65)}))).evidence;
const context={type:'library-title',reviewAnalysis:JSON.stringify(evidence)},owner={kind:'library',owner:'fixture-source',thread:'fixture-thread'},config={endpoint:'https://provider.fixture/v1',model:'controlled-fixture',serviceTier:'standard'};
const analysis={summary:'The selected sample analysis is completed.',fit:'Conditional fit; no explicit personal preferences.',points:[{id:'R40',quote:'The performances remain compelling.',reason:'A source specifically praises performance.',kind:'praise'}]};
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
function native(fetchImpl){const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),events=[];sender.id=42;sender.isDestroyed=()=>false;sender.send=(name,value)=>events.push({name,value});const event={sender};register({app,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},authorized:()=>true,getConfig:()=>config,fetchImpl});return {app,events,run:input=>handlers.get('assistant:agentRun')(event,{requestId:'review-response',question:'Analyze only this selected sample.',owner,context,...input})};}
test('Explicit review response contract offers no tools, excludes history and preserves reviewer 40 through format compatibility fallback',async()=>{
 const requests=[];let executed=0;
 const result=await provider.run({question:'Analyze the selected excerpts.',responseContract:'review-analysis',context,owner,config,history:[{role:'user',content:'EARLIER_PRIVATE_HISTORY'}],execute:async()=>{executed++;},fetchImpl:async(_,request)=>{const body=JSON.parse(request.body);requests.push(body);assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);assert.doesNotMatch(JSON.stringify(body.messages),/EARLIER_PRIVATE_HISTORY/);return requests.length===1?new Response('{"error":"response_format json_object unsupported"}',{status:400}):reply({role:'assistant',content:'```json\n'+JSON.stringify(analysis)+'\n```'});}});
 assert.equal(executed,0);assert.equal(requests.length,2);assert.deepEqual(requests[0].response_format,{type:'json_object'});assert.equal(requests[1].response_format,undefined);assert.equal(requests[1].max_tokens,2400);assert(JSON.stringify(requests[1].messages).includes('R40'));assert(context.reviewAnalysis.indexOf('"id":"R40"')>8000);assert.equal(JSON.parse(result.text).points[0].quote,analysis.points[0].quote);assert.doesNotMatch(result.text,/```/);
});
test('Ordinary assistant keeps application tools and history on the identical review context',async()=>{
 let request;const result=await provider.run({question:'Show available review actions.',context,owner,config,history:[{role:'user',content:'Earlier ordinary question'}],execute:async()=>{},fetchImpl:async(_,options)=>{request=JSON.parse(options.body);return reply({role:'assistant',content:'Ordinary assistant answer.'});}});
 assert.equal(result.text,'Ordinary assistant answer.');assert(request.tools.some(tool=>tool.function.name==='preview_title_review_analysis'));assert.equal(request.tool_choice,'auto');assert.equal(request.response_format,undefined);assert(JSON.stringify(request.messages).includes('Earlier ordinary question'));
});
test('Unknown contracts, missing evidence and continuations fail before any provider call',async()=>{
 let fetches=0;for(const options of [{responseContract:'unknown'},{responseContract:null},{responseContract:'review-analysis',context:{}},{responseContract:'review-analysis',continuation:[{status:'completed'}]}])await assert.rejects(provider.run({question:'Analyze.',context,owner,config,fetchImpl:async()=>{fetches++;throw Error('Must not fetch');},...options}),/contract|valid review sample/);
 assert.equal(fetches,0);
 const h=native(async()=>{fetches++;throw Error('Must not fetch');});try{for(const input of [{responseContract:'unknown'},{responseContract:'review-analysis',context:{}},{responseContract:'review-analysis',continuationId:'blocked-continuation'},{responseContract:'review-analysis',owner:{...owner,kind:'video'}}]){const result=await h.run(input);assert.equal(result.ok,false);assert.match(result.error,/contract|valid library review sample/);}assert.equal(fetches,0);assert.equal(h.events.length,0);}finally{h.app.emit('will-quit');}
});
test('Unsolicited review tool calls never execute and prose or fabricated quotations fail visibly',async()=>{
 let executed=0;for(const message of [{role:'assistant',tool_calls:[{id:'recursive',function:{name:'preview_title_review_analysis',arguments:'{}'}}]},{role:'assistant',content:'I will analyze the sample.\n```json\n'+JSON.stringify(analysis)+'\n```'},{role:'assistant',content:JSON.stringify({...analysis,points:[{...analysis.points[0],quote:'A completely fabricated quote.'}]})}]){
  let requests=0;await assert.rejects(provider.run({question:'Analyze.',responseContract:'review-analysis',context,owner,config,execute:async()=>{executed++;},fetchImpl:async()=>{requests++;return reply(message);}}),/unexpected tool call|only a JSON object|quote could not be verified/);assert.equal(requests,message.tool_calls?1:2,'Tool calls never execute; invalid JSON/quotes receive only one correction attempt');
 }
 assert.equal(executed,0);
});
test('Native review result remains canonical quoted JSON with zero execution; generic tool footer behavior remains available',async()=>{
 let step=0;const h=native(async(_,request)=>{const body=JSON.parse(request.body);step++;if(step===1){assert.equal(body.tools,undefined);return reply({role:'assistant',content:'```json\n'+JSON.stringify(analysis)+'\n```'});}if(step===2){assert(body.tools.length);return reply({role:'assistant',tool_calls:[{id:'help',function:{name:'app_help',arguments:'{}'}}]});}return reply({role:'assistant',content:'Generic tool check completed.'});});
 try{
  const review=await h.run({responseContract:'review-analysis'});assert.equal(review.ok,true,review.error);assert.equal(JSON.parse(review.text).points[0].quote,analysis.points[0].quote);assert.deepEqual(review.execution,{cards:0,pendingPlans:0,attempted:0,blockedOrFailed:0,appliedActions:0});assert.equal(h.events.filter(event=>event.value.type==='action').length,0);assert.doesNotMatch(review.text,/Application verification:|Web sources:/);
  const generic=await h.run({requestId:'generic-response'});assert.equal(generic.ok,true,generic.error);assert.equal(generic.execution.attempted,0);assert(h.events.some(event=>event.value.step?.name==='app_help'));assert.match(generic.text,/Application verification:/);
 }finally{h.app.emit('will-quit');}
});
test('Assistant retry snapshots and retains the explicit sixth-argument response options',async()=>{
 const dom=new JSDOM('<body><textarea id="aiChatText"></textarea></body>',{runScripts:'outside-only'}),w=dom.window,requests=[];
 try{
  Object.assign(w,{UiLocale:{get:()=> 'en'},AssistantAppActions:{snapshot:()=>owner,current:()=>true},AssistantContextManifest:require('../src/assistant-context-manifest'),AssistantWorkspace:{begin(){},finish(){},partial(){}},api:{onAssistantAgentEvent:()=>()=>{},assistantAgentRun:async input=>{requests.push(input);return requests.length===1?{ok:false,error:'Controlled retryable failure.'}:{ok:true,text:JSON.stringify(analysis)};}},player:{},updateAiChatActions(){},autoGrowChatBox(){},saveAppSettings:async()=>true,renderAiText:(bubble,text)=>bubble.textContent=text,aiChatAdd:(_,text)=>{const node=w.document.createElement('div');node.textContent=text;return node;}});
  w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'));
  const options={responseContract:'review-analysis'};await w.AssistantAgentUI.send('Analyze.',context,[],'scope',undefined,options);assert.equal(w.AssistantAgentUI.canRetry(),true);options.responseContract='MUTATED_AFTER_REQUEST';await w.AssistantAgentUI.retry();assert.equal(requests.length,2);assert.equal(requests[0].responseContract,'review-analysis');assert.equal(requests[1].responseContract,'review-analysis');assert.equal(requests[1].continuationId,undefined);assert.equal(requests[1].context.reviewAnalysis,context.reviewAnalysis);assert.equal(w.AssistantAgentUI.canRetry(),false);
 }finally{w.close();}
});
test('aiChatSend forwards only an explicit fourth-argument contract to the native agent and bypasses recursive command handlers',async()=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window,calls=[];let handled=0;
 try{
  const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8'),start=source.indexOf('async function aiChatSend('),end=source.indexOf('function autoGrowChatBox()',start);assert(start>0&&end>start);
  Object.assign(w,{aiChatPreparing:null,aiSourceScope:()=> 'scope',player:{chatHistory:[]},state:{},updateAiChatActions(){},aiChatContext:()=>context,activePodcastContext:()=>null,aiTranscriptEvidence:()=>null,buildOptsFromUI:()=>({}),globalAssistantContext:()=>context,assistantProviderSelection:()=>({endpoint:'https://provider.fixture/v1',apiKey:'CONTROLLED_FIXTURE',model:'fixture'}),translationEndpointReady:()=>true,AssistantAgentUI:{busy:()=>false,send:async(...args)=>calls.push(args)},AssistantMediaCommands:{handle:async()=>{handled++;return true;}},aiChatAdd(){}});
  w.eval(source.slice(start,end));await w.aiChatSend('Analyze.',null,null,{responseContract:'review-analysis'});assert.equal(handled,0);assert.equal(calls.length,1);assert.equal(calls[0][4],undefined);assert.equal(calls[0][5].responseContract,'review-analysis');await w.aiChatSend('Ordinary question.');assert.equal(handled,1);assert.equal(calls.length,1,'Ordinary command routing remains active');
 }finally{w.close();}
});


test('Review contract states its canonical point schema and permits exactly one source-grounded validation repair',async()=>{
 for(const bad of ['Not JSON.',JSON.stringify({...analysis,points:[{reviewId:'R40',quote:analysis.points[0].quote,note:'Wrong keys.'}]}),JSON.stringify({...analysis,points:[{...analysis.points[0],quote:'Invented quotation that cannot be found.'}]})]){
  const requests=[],replaced=[];let executed=0;
  const result=await provider.run({question:'Analyze the sample.',responseContract:'review-analysis',context,owner,config,onReplace:value=>replaced.push(value),execute:async()=>{executed++;},fetchImpl:async(_,request)=>{const body=JSON.parse(request.body);requests.push(body);assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);return reply({role:'assistant',content:requests.length===1?bad:JSON.stringify(analysis)});}});
  assert.equal(requests.length,2);assert.equal(executed,0);assert.deepEqual(replaced,['']);assert.equal(JSON.parse(result.text).points[0].id,'R40');assert.equal(JSON.parse(result.text).points[0].quote,analysis.points[0].quote);
  const instructions=requests[0].messages.filter(row=>row.role==='system').map(row=>row.content).join(' ');for(const field of ['"id"','"quote"','"reason"','"kind"','quoteTr','quoteTrKind'])assert(instructions.includes(field));
  assert.match(requests[1].messages.at(-1).content,/validation failed|Correct the response once/);assert.match(requests[1].messages.at(-1).content,/original attached review evidence/);
  const sourceBefore=requests[0].messages.find(row=>row.content.startsWith('Untrusted source data')),sourceAfter=requests[1].messages.find(row=>row.content.startsWith('Untrusted source data'));assert.deepEqual(sourceAfter,sourceBefore,'Repair receives exactly the original bounded sources, not a fabricated quote replacement');
 }
});
