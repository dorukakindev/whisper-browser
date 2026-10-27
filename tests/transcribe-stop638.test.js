"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createIdempotentCancel}=require('../src/pipeline-job');const main=fs.readFileSync(require.resolve('../src/main'),'utf8');
test('Simultaneous cancel shares one attempt, but a failed or thrown attempt can be retried',async()=>{
 let calls=0;const cancel=createIdempotentCancel(async()=>{calls++;return {ok:calls>1};});const a=cancel(),b=cancel();assert.equal(a,b);assert.equal((await a).ok,false);assert.equal((await cancel()).ok,true);assert.equal(calls,2);assert.equal((await cancel()).ok,true);assert.equal(calls,2);
 let failures=0;const thrown=createIdempotentCancel(async()=>{if(++failures===1)throw Error('Stop rejected');return {ok:true};});await assert.rejects(thrown(),/rejected/);assert.equal((await thrown()).ok,true);
});
test('Normal and assistant transcription cancellation await the same confirmed stop and report still-running failure',async()=>{
 const job={},box={activeJob:job,activeJobLatch:{requestCancel(){}},spawn(){},sendEvent(){},activeJobCancel:async()=>({ok:false,running:true,error:'Stop not confirmed'})};vm.createContext(box);
 const start=main.indexOf('function killActiveJob()'),end=main.indexOf('// ---- Kalıcı ayarlar',start);vm.runInContext(main.slice(start,end),box);
 let handler;box.ipcMain={handle:(name,fn)=>handler=fn};box.authorizedBrowserSender=()=>true;const a=main.indexOf("ipcMain.handle('transcribe:cancel'");const b=main.indexOf('browserExtras =',a);vm.runInContext(main.slice(a,b),box);
 const result=await handler({});assert.equal(result.ok,false);assert.equal(result.running,true);
});
test('The renderer keeps a live failed-stop job owned, suppresses late output and leaves Stop available',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8'),a=source.indexOf("$('cancelBtn').addEventListener('click'"),b=source.indexOf('function finishRun(',a);let callback,finished=0;
 const nodes=new Map(),node=id=>{if(!nodes.has(id)){const hidden=new Set(id==='startBtn'?['hidden']:[]);nodes.set(id,{textContent:'',classList:{add:x=>hidden.add(x),remove:x=>hidden.delete(x),contains:x=>hidden.has(x)},addEventListener:(_name,fn)=>callback=fn});}return nodes.get(id);};
 const state={running:true,queueRunning:false,aiJob:false,cancelled:false},player={job:{running:true,kind:'translate',cancelled:false}};
 const box={state,player,$:node,window:{api:{cancelTranscribe:async()=>({ok:false,running:true,error:'Stop not confirmed'})},UiLocale:{get:()=> 'en'}},logLine(){},setStatus(){},finishRun(){finished++;state.running=false;},playerJobEvent(){player.job=null;}};vm.createContext(box);vm.runInContext(source.slice(a,b),box);await callback();
 assert.equal(finished,0);assert.equal(state.running,true);assert.equal(player.job.cancelled,true);assert.equal(node('cancelBtn').classList.contains('hidden'),false);assert.equal(node('startBtn').classList.contains('hidden'),true);
 let reply;box.window.api.cancelTranscribe=()=>new Promise(resolve=>reply=resolve);state.activeJobId='old';const pending=callback();state.activeJobId='replacement';state.cancelled=false;player.job={running:true,kind:'translate',cancelled:false};reply({ok:false,running:true});await pending;assert.equal(state.cancelled,false);assert.equal(player.job.cancelled,false,'A late old stop response cannot cancel a replacement job');assert.equal(finished,0);

});
