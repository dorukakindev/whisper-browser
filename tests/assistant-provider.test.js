'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../src/assistant-provider');
const owner={kind:'video',hasSubtitles:false,owner:'private-owner',thread:'thread',tracks:[]};
const event=delta=>'data: '+JSON.stringify({choices:[{delta,finish_reason:null}]})+'\n\n';
const sse=(body)=>new Response(body+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
const json=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const config={endpoint:'https://provider.fixture/v1',model:'fixture',apiKey:'fixture-only'};

test('Streamed tool loop retains cumulative names and opaque fields, returns a real proposal, and excludes settings',async()=>{
 const requests=[],calls=[],deltas=[];
 const responses=[sse(event({tool_calls:[{index:0,id:'call1',function:{name:'start_',arguments:'{"translate":'},extra_content:{google:{thought_signature:'signature'}}}]})+event({tool_calls:[{index:0,id:'call1',function:{name:'start_whisper',arguments:'false}'}}]})+event({tool_calls:[{index:0,id:'call1',function:{name:'start_whisper',arguments:''}}]})),sse(event({content:'Öneri hazır.'}))];
 const result=await run({question:'Prepare subtitles',owner,context:{settings:{apiKey:'secret-value'},note:'source'},config,onDelta:text=>deltas.push(text),execute:async(name,args)=>{calls.push({name,args});return {status:'proposed'};},fetchImpl:async(_,request)=>{requests.push(JSON.parse(request.body));return responses.shift();}});
 assert.equal(result.text,'Öneri hazır.');assert.deepEqual(calls,[{name:'start_whisper',args:{translate:false}}]);
 const forwarded=requests[1].messages.find(row=>row.role==='assistant').tool_calls[0];assert.equal(forwarded.id,'call1');assert.equal(forwarded.extra_content.google.thought_signature,'signature');
 assert.equal(requests[1].messages.at(-1).role,'tool');assert.equal(result.capabilities.tools,'supported');
 assert(!JSON.stringify(requests).includes('secret-value'));assert(!JSON.stringify(requests).includes('private-owner'));assert(requests[0].tools.some(row=>row.function.name==='start_whisper'));
});
test('Unsupported tools fall back once with an explicit no-action instruction; no tool executes',async()=>{
 const requests=[];let executions=0;
 const result=await run({question:'Hello',owner,config,execute:async()=>executions++,fetchImpl:async(_,request)=>{requests.push(JSON.parse(request.body));return requests.length===1?new Response('{"error":"tools unsupported"}',{status:400}):sse(event({content:'Text only.'}));}});
 assert.equal(result.capabilities.tools,'unsupported');assert.equal(executions,0);assert.equal(requests[1].tools,undefined);assert.match(requests[1].messages[0].content,/never claim an action was executed/);
});
test('A disconnected answer is kept as partial by the caller and is never retried',async()=>{
 let requests=0,text='';
 await assert.rejects(run({question:'Hello',owner,config,onDelta:part=>text+=part,execute:async()=>{},fetchImpl:async()=>{requests++;return new Response(event({content:'Keep this'}),{headers:{'content-type':'text/event-stream'}});}}),/before completion/);
 assert.equal(requests,1);assert.equal(text,'Keep this');
});
test('JSON-only tool calling works after a stream rejection and cannot execute an unknown tool',async()=>{
 let count=0,executed=false;
 const result=await run({question:'Do it',owner,config,execute:async()=>{executed=true;},fetchImpl:async(_,request)=>{
  count++;const body=JSON.parse(request.body);
  if(count===1)return new Response('{"error":"stream unsupported"}',{status:400});
  assert.equal(body.stream,false);
  if(count===2)return json({role:'assistant',content:null,tool_calls:[{id:'x',type:'function',function:{name:'shell',arguments:'{}'}}]});
  assert.match(body.messages.at(-1).content,/unavailable/);return json({role:'assistant',content:'Unavailable.'});
 }});
 assert.equal(result.text,'Unavailable.');assert.equal(executed,false);assert.equal(result.capabilities.stream,'unsupported');
});

test('Every DeepInfra compatibility attempt and subsequent tool round retains Flex',async()=>{
 const deep=require('../src/assistant-settings'),requests=[];let round=0;
 const result=await run({question:'Help',owner,config:{...config,endpoint:deep.ENDPOINT,model:deep.MODEL},execute:async()=>({status:'completed'}),fetchImpl:async(url,request)=>{assert.equal(url,deep.ENDPOINT+'/chat/completions');const body=JSON.parse(request.body);requests.push(body);if(++round===1)return new Response('{"error":"stream unsupported"}',{status:400});if(round===2)return json({role:'assistant',tool_calls:[{id:'help',type:'function',function:{name:'app_help',arguments:'{}'}}]});return json({role:'assistant',content:'Ready.'});}});
 assert.equal(result.text,'Ready.');assert.equal(requests.length,3);assert(requests.every(row=>row.service_tier==='flex'));
});

test('Planning data gets one bounded contract repair; tool prefaces are replaced and no mutation is auto-executed',async()=>{
 const replies=[json({role:'assistant',content:"I'll plan it.",tool_calls:[{id:'plan',function:{name:'plan_library_collection',arguments:'{"name":"Space","ids":"catalog:one"}'}}]}),json({role:'assistant',content:'The card is ready.'}),json({role:'assistant',tool_calls:[{id:'card',function:{name:'apply_library_collection',arguments:'{"plan_id":"real-plan"}'}}]}),json({role:'assistant',content:'Gerçek kart önerildi; uygulanmadı.'})],requests=[],calls=[];let visible='';
 const result=await run({question:'Plan and offer a real card',owner:{...owner,kind:'library'},config,onDelta:text=>visible+=text,onReplace:text=>visible=text,execute:async(name,args)=>{calls.push(name);return name==='plan_library_collection'?{status:'completed',plan:{id:'real-plan'}}:{status:'proposed',proposalId:'real-card'};},fetchImpl:async(_,request)=>{requests.push(JSON.parse(request.body));return replies.shift();}});
 assert.deepEqual(calls,['plan_library_collection','apply_library_collection']);assert.equal(requests.length,4);assert.equal(visible,result.text);assert(!visible.includes("I'll"));assert(!visible.includes('The card is ready'));assert(requests[2].messages.some(row=>row.content?.includes('Application contract check')));
});
test('Plan-only remains data, repair is bounded, cancellation does not resend or apply',async()=>{
 let count=0,executions=0;const result=await run({question:'Only plan, no card',owner:{...owner,kind:'library'},config,execute:async()=>{executions++;return {status:'completed',plan:{id:'only-plan'}};},fetchImpl:async()=>++count===1?json({role:'assistant',tool_calls:[{id:'plan',function:{name:'plan_library_collection',arguments:'{"name":"Space","ids":"catalog:one"}'}}]}):json({role:'assistant',content:'Yalnız plan verisi; kart yok.'})});assert.equal(count,3);assert.equal(executions,1);assert.match(result.text,/kart yok/);
 const c=new AbortController();await assert.rejects(run({question:'Plan',owner:{...owner,kind:'library'},config,signal:c.signal,execute:async()=>{c.abort();return {status:'completed',plan:{id:'cancelled'}};},fetchImpl:async()=>json({role:'assistant',tool_calls:[{id:'p',function:{name:'plan_library_collection',arguments:'{"name":"Space","ids":"catalog:one"}'}}]})}),/abort/i);
});

test('Preparation intent is explicitly distinguished from generation in the model contract',async()=>{
 let body;await run({question:'Seslendirmeye hazırla',owner,config,execute:async()=>{},fetchImpl:async(_,request)=>{body=JSON.parse(request.body);return json({role:'assistant',content:'Hazırlık ekranını açabilirim.'});}});assert(body.messages[0].content.includes('Preparation is not generation'));assert(body.messages[0].content.includes('even when ready'));const start=body.tools.find(row=>row.function.name==='start_voice_generation');assert.match(start.function.description,/NOT generation/);
});

test('Completion endpoint canonicalization removes only the trailing slash',()=>{const endpoint=require('../src/assistant-provider').endpoint;assert.equal(endpoint('https://api.deepinfra.com/v1/openai/chat/completions/'),'https://api.deepinfra.com/v1/openai/chat/completions');assert.equal(endpoint('https://fixture.example/v1/'),'https://fixture.example/v1/chat/completions');assert.throws(()=>endpoint('https://user:secret@fixture.example/v1'));});

test('Standard tier omits Flex through compatibility retries and reasoning signals never expose raw reasoning',async()=>{
 const requests=[],phases=[],text=[];let count=0;
 await run({question:'Hello',owner,config:{...config,endpoint:'https://api.deepinfra.com/v1/openai',serviceTier:'standard'},onProgress:p=>phases.push(p),onDelta:t=>text.push(t),execute:async()=>{},fetchImpl:async(_,r)=>{requests.push(JSON.parse(r.body));return ++count===1?new Response('{"error":"tools unsupported"}',{status:400}):sse(event({reasoning_content:'private provider metadata'})+event({content:'Done'}));}});
 assert(requests.every(r=>!Object.hasOwn(r,'service_tier')));assert.deepEqual(phases,['reasoning','writing']);assert.deepEqual(text,['Done']);
});
