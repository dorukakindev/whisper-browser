'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {research,decode,safeSource,register}=require('../src/assistant-web-research');
const fixture={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Kaynaklı yanıt.',annotations:[{type:'url_citation',url:'https://example.org/source',title:'Source'}]}]}]};
test('real tool completion and public citations required; no fabricated search success',()=>{
 assert.equal(decode(fixture).sources[0].url,'https://example.org/source');
 for(const value of [{...fixture,status:'incomplete'},{output:fixture.output.slice(1)},{output:[fixture.output[0],{type:'message',content:[{type:'output_text',text:'Guess.'}]}]}])assert.throws(()=>decode(value));
 for(const url of ['file:///x','javascript:alert(1)','https://user:password@example.org','https://localhost','https://10.1.2.3','https://[fd00::1]','https://[::ffff:127.0.0.1]'])assert.equal(safeSource(url),'');
});
test('request uses configured provider only, required search, bounded question and no redirect credentials',async()=>{
 let call;const result=await research('Who is this author?',{endpoint:'https://example.org/v1/chat/completions',model:'test-model',apiKey:'test-only'},{fetchImpl:async(url,options)=>{call={url,options};return {ok:true,json:async()=>fixture};}});
 assert.equal(result.text,'Kaynaklı yanıt.');assert.equal(call.url,'https://example.org/v1/responses');assert.equal(call.options.redirect,'error');const body=JSON.parse(call.options.body);assert.equal(body.tool_choice,'required');assert.deepEqual(body.tools,[{type:'web_search'}]);assert.equal(body.store,false);
 await assert.rejects(research('x'.repeat(1201),{endpoint:'https://example.org'}));
 await assert.rejects(research('question',{endpoint:'https://example.org',model:'test'},{fetchImpl:async()=>({ok:false,status:404})}),/does not support/);
});
test('IPC rejects foreign frame, prevents concurrent jobs and aborts authorized cancellation',async()=>{
 const app=new EventEmitter(),handlers=new Map(),sender=Object.assign(new EventEmitter(),{id:42});
 const original=global.fetch;let aborted=false;
 global.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true}));
 try{register({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:e=>e.trusted===true,getConfig:()=>({endpoint:'http://127.0.0.1/v1',model:'fixture'}),readJson:r=>r.json()});
 const event={sender,trusted:true};assert.equal((await handlers.get('assistant:webResearch')({sender},'x')).ok,false);
 const pending=handlers.get('assistant:webResearch')(event,'question');assert.equal((await handlers.get('assistant:webResearch')(event,'second')).ok,false);
 await handlers.get('assistant:cancelWebResearch')(event);assert.equal((await pending).ok,false);assert.equal(aborted,true);assert.equal(sender.listenerCount('destroyed'),0);
 }finally{global.fetch=original;}
});
