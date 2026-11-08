'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../src/assistant-provider');
const owner={kind:'video',hasSubtitles:false,owner:'private-owner',thread:'thread',tracks:[]};
const event=delta=>'data: '+JSON.stringify({choices:[{delta,finish_reason:null}]})+'\n\n';
const sse=(body)=>new Response(body+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
const json=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const config={endpoint:'https://provider.fixture/v1',model:'fixture',apiKey:'fixture-only'};

function chunkedSse(body,chunkSize=4096,splitUtf8=false){
 const bytes=new TextEncoder().encode(body+'data: [DONE]\n\n'),chunks=[];let offset=0;
 if(splitUtf8){const split=bytes.findIndex(byte=>byte>=128)+1;assert(split>0);chunks.push(bytes.slice(0,split));offset=split;}
 for(;offset<bytes.length;offset+=chunkSize)chunks.push(bytes.slice(offset,offset+chunkSize));
 return new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}}),{headers:{'content-type':'text/event-stream'}});
}

test('R846-08 schema-valid review analysis at its declared limit reaches the same tool through JSON and fragmented SSE',async()=>{
 const review={summary:'Source summary.',fit:'Qualified fit.',points:[{id:'review-a',quote:'An exact source quotation.',reason:'A quoted "observation" \\ context. '.repeat(130),kind:'praise'},{id:'review-b',quote:'A second exact quotation.',reason:'Another quoted "observation" \\ context. '.repeat(130),kind:'debate'}]};
 const base=JSON.stringify(review);assert(base.length<12000);review.summary+='s'.repeat(12000-base.length);const analysis=JSON.stringify(review);assert.equal(analysis.length,12000);
 const args={item_id:'catalog:fixture-film',analysis},library={...owner,kind:'library'};require('../src/assistant-capabilities').validate('preview_title_review_analysis',args,library);
 assert.equal(require('../src/renderer/media-tools-model').parseDecisionResponse(analysis,[{id:'review-a',text:'An exact source quotation.'},{id:'review-b',text:'A second exact quotation.'}]).points.length,2);
 const call={id:'review',type:'function',function:{name:'preview_title_review_analysis',arguments:JSON.stringify(args)}};assert(call.function.arguments.length>12000);
 for(const transport of ['json','sse']){let turn=0;const calls=[];const result=await run({question:'Preview this matched review analysis.',owner:library,config,execute:async(name,received)=>{calls.push({name,args:received});return {status:'proposed',proposalId:'unapplied-card'};},fetchImpl:async()=>{if(++turn>1)return json({role:'assistant',content:'Review the unapplied card.'});if(transport==='json')return json({role:'assistant',tool_calls:[call]});const raw=call.function.arguments;let body='';for(let i=0;i<raw.length;i+=137)body+=event({tool_calls:[{index:0,...(i===0?{id:call.id}:{}),function:{...(i===0?{name:call.function.name}:{}),arguments:raw.slice(i,i+137)}}]});return chunkedSse(body,173);}});assert.equal(result.text,'Review the unapplied card.');assert.deepEqual(calls,[{name:'preview_title_review_analysis',args}]);}
});

test('K846-01 many bounded SSE events are independent of network chunks, including split UTF-8',async()=>{
 const body=event({content:'ğ'}).repeat(3000);assert(new TextEncoder().encode(body).length>160000);
 for(const response of [sse(body),chunkedSse(body),chunkedSse(body,4095,true)]){const result=await run({question:'Read the answer.',owner,config,execute:async()=>{throw Error('No tool expected');},fetchImpl:async()=>response});assert.equal(result.text,'ğ'.repeat(3000));}
});

test('SSE bounds still reject one giant completed, unfinished or multiline event rather than many small events',async()=>{
 const {completion}=require('../src/assistant-provider'),options={streamed:true,onDelta:()=>{}};
 const frames=['data: '+JSON.stringify({padding:'x'.repeat(160001)})+'\n\n','data: '+'x'.repeat(160001),'data: {"padding":[\ndata: "'+'x'.repeat(90000)+'",\ndata: "'+'x'.repeat(90000)+'"]}\n\n'];
 for(const frame of frames)await assert.rejects(completion(chunkedSse(frame,8192),options),/SSE frame exceeded/);
});

test('JSON and SSE retain shared argument, metadata and total-response budgets',async()=>{
 const {completion}=require('../src/assistant-provider'),options={streamed:true,onDelta:()=>{}},base={id:'tool',type:'function',function:{name:'app_help',arguments:'{}'}};
 for(const call of [{...base,function:{...base.function,arguments:'x'.repeat(80001)}},{...base,extra_content:{signature:'x'.repeat(16001)}}])for(const response of [json({role:'assistant',tool_calls:[call]}),sse(event({tool_calls:[{index:0,...call}]}))])await assert.rejects(completion(response,options),/tool call.*size limit/);
 for(const response of [new Response(' '.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}}),new Response(':comment\n\n'.repeat(240000),{headers:{'content-type':'text/event-stream'}})])await assert.rejects(completion(response,options),/(response|stream) exceeded the size limit/);
});

test('A fictional prepared card gets one bounded correction turn and only a real tool result counts',async()=>{
 const requests=[],calls=[],replaced=[];
 const responses=[json({role:'assistant',content:'Sıradaki kartı önerdim.'}),json({role:'assistant',tool_calls:[{id:'real',function:{name:'start_voice_generation',arguments:'{}'}}]}),json({role:'assistant',content:'Gerçek ses üretim kartını kontrol edebilirsin.'})];
 const result=await run({question:'Üretilen altyazıyı kayıtlı sesimle seslendir.',owner,config,onReplace:t=>replaced.push(t),execute:async(name,args)=>{calls.push({name,args});return {status:'proposed',proposalId:'actual-card'};},fetchImpl:async(_,request)=>{requests.push(JSON.parse(request.body));return responses.shift();}});
 assert.equal(requests.length,3);assert(requests[1].messages.at(-1).content.includes('ZERO real review cards'));assert.equal(calls.length,1);assert.equal(calls[0].name,'start_voice_generation');assert(replaced.includes(''));assert(!result.text.includes('Sıradaki kartı önerdim.'));
 let count=0;await run({question:'Explain only',owner,config,execute:async()=>{throw Error('No mutation allowed');},fetchImpl:async()=>{count++;return json({role:'assistant',content:'Kartı hazırladım.'});}});assert.equal(count,2,'An uncooperative provider must not create an infinite repair loop');
});

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


test('Unsupported current-source duration receives one evidence correction without repeating the tool',async()=>{
 const requests=[],calls=[];let turn=0;
 const result=await run({question:'How long is left?',owner:{...owner,hasMedia:true},config,execute:async name=>{calls.push(name);return {status:'unsupported',reason:'Current media has no finite duration.'};},fetchImpl:async(_,request)=>{requests.push(JSON.parse(request.body));if(++turn===1)return json({role:'assistant',tool_calls:[{id:'time',function:{name:'calculate_playback_time',arguments:'{}'}}]});if(turn===2)return json({role:'assistant',content:'There are 30 minutes left.'});return json({role:'assistant',content:'A finite duration is unavailable, so I cannot calculate the remaining time.'});}});
 assert.deepEqual(calls,['calculate_playback_time']);assert.equal(requests.length,3);assert.match(requests[2].messages.at(-1).content,/Final evidence check.*unsupported/);assert(!result.text.includes('30 minutes'));assert.match(result.text,/cannot calculate/);
});


test('Application workflow instructions stay in valid system content, never in a message role',async()=>{
 let captured;await run({question:'Prepare a media selection',owner:{...owner,kind:'library'},config,execute:async()=>{},fetchImpl:async(_,r)=>{captured=JSON.parse(r.body);return json({role:'assistant',content:'No action requested.'});}});assert(captured.messages.every(m=>['system','user','assistant','tool'].includes(m.role)));assert(captured.messages.some(m=>m.role==='system'&&m.content.includes('For a find/compare/collection request')));assert(captured.messages.some(m=>m.role==='system'&&m.content.startsWith('Untrusted source data')));
});

// A transport can deliver headers but leave its body or cancellation unresolved.
test('Cancelling a stalled JSON or SSE body settles without waiting for transport cleanup',async()=>{
 const {completion}=require('../src/assistant-provider');
 for(const type of ['application/json','text/event-stream']){
  const controller=new AbortController();let cancelled=0;
  const response=new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}),{headers:{'content-type':type}});
  const pending=completion(response,{streamed:true,signal:controller.signal,onDelta:()=>{}});
  controller.abort(new Error('source changed'));
  let timer;try{await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('body remained pending')),120);})]),/source changed/);}finally{clearTimeout(timer);}
  assert.equal(cancelled,1);
 }
});
test('Completed SSE does not wait for an unresponsive cancellation acknowledgement',async()=>{
 const {completion}=require('../src/assistant-provider');let cancelled=0;
 const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(event({content:'Kept answer'})+'data: [DONE]\n\n'));},cancel(){cancelled++;return new Promise(()=>{});}}),{headers:{'content-type':'text/event-stream'}});
 let timer;try{const result=await Promise.race([completion(response,{streamed:true,onDelta:()=>{}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup remained pending')),120);})]);assert.equal(result.content,'Kept answer');}finally{clearTimeout(timer);}
 assert.equal(cancelled,1);
});

test('Aborting a partial answer retains delivered text and never executes a proposed tool',async()=>{
 const controller=new AbortController();let text='',executions=0,requests=0;
 const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(event({content:'Received before stopping.'})));},cancel(){return new Promise(()=>{});}}),{headers:{'content-type':'text/event-stream'}});
 const pending=run({question:'Find a passage',owner,config,signal:controller.signal,onDelta:part=>{text+=part;controller.abort(new Error('source changed'));},execute:async()=>{executions++;},fetchImpl:async()=>{requests++;return response;}});
 let timer;try{await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('partial answer remained pending')),120);})]),/source changed/);}finally{clearTimeout(timer);}
 assert.equal(text,'Received before stopping.');assert.equal(executions,0);assert.equal(requests,1);
});
test('Aborting a stalled provider error body does not retry the request',async()=>{
 const controller=new AbortController();let requests=0,cancelled=0;
 const pending=run({question:'Help',owner,config,signal:controller.signal,execute:async()=>{throw Error('No tool permitted');},fetchImpl:async()=>{requests++;queueMicrotask(()=>controller.abort(new Error('source changed')));return new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}),{status:403});}});
 let timer;try{await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('error body remained pending')),120);})]),/source changed/);}finally{clearTimeout(timer);}
 assert.equal(requests,1);assert.equal(cancelled,1);
});
