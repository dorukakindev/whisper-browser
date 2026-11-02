'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{EventEmitter}=require('node:events'),{JSDOM}=require('jsdom');
const {scan}=require('../src/renderer/assistant-book-search'),{register}=require('../src/assistant-agent-service'),{ToolResults}=require('../src/assistant-tool-results');

async function readerResult(total){
 const dom=new JSDOM('<main id="book"></main>',{runScripts:'outside-only'}),w=dom.window;
 const source={id:'01234567-89ab-cdef-0123-456789abcdef:0',type:'book-chapter',title:'A Synthetic Book',chapter:'One',text:'needle '+'word '.repeat(179)};
 try{w.globalAssistantContext=()=>source;w.eval(fs.readFileSync(require.resolve('../src/renderer/book-assistant-ui'),'utf8'));
  w.BookAssistantUI.mount(w.document.getElementById('book'),{getSource:()=>source,isCurrent:()=>true,t:en=>en,onNavigate:()=>{},onSearch:(args,current)=>scan({total,query:args.query,current,title:source.title,getText:async()=>source.text})});
  return await w.BookAssistantUI.assistant.search({query:'needle'},()=>false);
 }finally{w.close();}
}

async function throughMain(result){
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),foreign=new EventEmitter(),rendererCalls=[],toolResults=[],parts=[];
 sender.id=848;sender.isDestroyed=()=>false;foreign.id=849;foreign.isDestroyed=()=>false;
 const event={sender},owner={kind:'book',owner:'synthetic-book',thread:'synthetic-thread'};
 const invoke=(name,input,e=event)=>handlers.get('assistant:'+name)(e,input);let foreignReply,round=0;
 sender.send=(_channel,packet)=>{if(packet.type==='action')queueMicrotask(()=>{rendererCalls.push(packet.name);foreignReply=invoke('agentResult',{callId:packet.callId,result},{sender:foreign});invoke('agentResult',{callId:packet.callId,result});});};
 register({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:e=>e.sender===sender,validateOwner:()=>true,getConfig:()=>({endpoint:'https://fixture.invalid/v1',model:'fixture'}),fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body),last=body.messages.at(-1);let name,args;
  if(++round===1){name='search_book';args={query:'needle'};}
  else if(last.role==='tool'){
   const value=JSON.parse(last.content);toolResults.push(value);
   if(value.stored_result){name='read_tool_result';args={result_id:value.stored_result,offset:0};}
   else if(value.result_id){parts.push(value.text);if(value.next!==null){name='read_tool_result';args={result_id:value.result_id,offset:value.next};}}
  }
  const message=name?{role:'assistant',tool_calls:[{id:'call-'+round,type:'function',function:{name,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'The bounded book search result was inspected.'};
  return new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
 }});
 try{return {answer:await invoke('agentRun',{requestId:'book-search',question:'Find needle in this book.',owner}),toolResults,parts,rendererCalls,foreignReply};}finally{app.emit('will-quit');}
}

test('R848-03 actual book scanner and reader reach main/provider, preserving all IDs through stored-result paging',async()=>{
 for(const count of [3,10]){
  const result=await readerResult(count),encoded=JSON.stringify(result);assert.equal(result.matches.length,count);
  const route=await throughMain(result);assert.equal(route.answer.ok,true,route.answer.error);assert.equal(route.foreignReply.ok,false);assert.deepEqual(route.rendererCalls,['search_book']);assert.equal(route.toolResults[0].status,'completed');
  if(count===3){assert(encoded.length<12000);assert.deepEqual(route.toolResults[0],JSON.parse(encoded));}
  else{assert(encoded.length>16000);const stored=route.toolResults[0];assert(stored.stored_result);assert.equal(stored.total_characters,encoded.length);assert.equal(stored.truncated,true);assert.equal(route.parts.join(''),encoded);assert.deepEqual(JSON.parse(route.parts.join('')).matches.map(hit=>[hit.id,hit.sourceId,hit.page]),result.matches.map(hit=>[hit.id,hit.sourceId,hit.page]));assert.equal(route.answer.bookCitations.length,10);}
 }
});

test('Renderer results above the existing compactor per-result budget are still rejected by main',async()=>{
 const route=await throughMain({status:'completed',text:'x'.repeat(512000)});assert.equal(route.toolResults[0].status,'failed');assert.equal(route.toolResults[0].error,'Invalid application result.');assert.equal(route.parts.length,0);assert.equal(route.toolResults.some(row=>row.stored_result),false);
});

test('ToolResults retains per-result and accumulated turn limits without slicing stored source IDs',()=>{
 const store=new ToolResults(),result={status:'completed',sourceId:'exact-source-id',text:'x'.repeat(360000)};
 const first=JSON.parse(store.encode(result)),second=JSON.parse(store.encode(result));assert(first.stored_result);assert(second.stored_result);
 assert.equal(JSON.parse(store.encode(result)).status,'failed');assert.equal(JSON.parse(store.encode({status:'completed',text:'x'.repeat(512000)})).status,'failed');
 let offset=0,text='';do{const piece=store.read({result_id:first.stored_result,offset});text+=piece.text;offset=piece.next;}while(offset!==null);assert.deepEqual(JSON.parse(text),result);assert.throws(()=>new ToolResults().read({result_id:first.stored_result}),/Unknown/);
});
