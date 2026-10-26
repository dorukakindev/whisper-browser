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
