'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {register}=require('../src/assistant-agent-service');
function fixture(fetchImpl){
 const ipcMain=new EventEmitter(),handlers=new Map(),app=new EventEmitter(),events=[];
 ipcMain.handle=(name,fn)=>handlers.set(name,fn);
 const sender=new EventEmitter();sender.id=7;sender.isDestroyed=()=>false;sender.send=(name,value)=>events.push({name,value});
 const event={sender,senderFrame:'main'},state={valid:true};
 const service=register({app,ipcMain,authorized:e=>e.sender===sender&&e.senderFrame==='main',getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),validateOwner:()=>state.valid,fetchImpl});
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
