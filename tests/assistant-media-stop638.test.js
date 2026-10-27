"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{createJobs}=require('../src/assistant-jobs');
const tick=()=>new Promise(r=>setImmediate(r));
test('Failed caption download cancellation stays owned and permits the exact Stop request again',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8'),start=main.indexOf('function runMediaCommand('),end=main.indexOf('// Invidious API için',start),jobs=createJobs();
 const child=new EventEmitter();Object.assign(child,{pid:45,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough()});let attempts=0;
 const box={path,mediaJobs:{subs:null},appResourceRoot:()=>'.',resolvePython:()=> 'fixture',pythonRuntimeEnv:x=>x,spawn:()=>child,assistantJobs:jobs,createNdjsonLineBuffer:require('../src/ndjson-lines').createNdjsonLineBuffer,parseNdjsonLine:require('../src/ndjson-lines').parseNdjsonLine,sanitizeProcessDetail:x=>x,subtitleFileAccess:{grant(){}},writeJobLog(){},setTimeout,clearTimeout,terminateProcessTree:()=>false,terminateProcessTreeAndWait:async()=>{attempts++;if(attempts===1)return false;child.exitCode=1;child.emit('close',1);return true;}};
 vm.createContext(box);vm.runInContext(main.slice(start,end),box);const task=box.runMediaCommand([],null,'subs');const id=jobs.snapshot().jobs[0].id;
 try{assert.equal((await jobs.cancel(id)).status,'accepted');await tick();const failed=jobs.snapshot().jobs[0];assert.equal(failed.state,'running','A failed native stop must not be stuck cancelling');assert.equal(failed.stopFailed,true);assert.equal(box.mediaJobs.subs,child,'Still-live child stays owned');
  assert.equal((await jobs.cancel(id)).status,'accepted');await tick();assert.equal(attempts,2);assert.equal(jobs.snapshot().jobs[0].state,'stopped');assert.equal((await task).ok,false);assert.equal(box.mediaJobs.subs,null);
 }finally{if(child.exitCode===null){child.exitCode=1;child.emit('close',1);}await task;}
});

test('A timed-out close acknowledgement permits another explicit termination attempt on the same live child',async()=>{
 const {terminateProcessTreeAndWait}=require('../src/process-lifecycle');const child=new EventEmitter();let kills=0;Object.assign(child,{pid:null,exitCode:null,signalCode:null,kill(){kills++;if(kills===2)setImmediate(()=>{child.exitCode=1;child.emit('close',1);});return true;}});
 assert.equal(await terminateProcessTreeAndWait(child,{platform:'linux',waitMs:2}),false);
 assert.equal(child.exitCode,null,'Unconfirmed process remains live');
 assert.equal(await terminateProcessTreeAndWait(child,{platform:'linux',waitMs:100}),true,'A repeated explicit Stop must send another signal after a failed close acknowledgement');assert.equal(kills,2);
});

test('A late successful caption result after failed Stop remains cancelled and cannot launch the next translation step',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8'),a=main.indexOf('function runMediaCommand('),b=main.indexOf('// Invidious API için',a),jobs=createJobs(),child=new EventEmitter();Object.assign(child,{pid:99,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough()});
 const box={path,mediaJobs:{subs:null},appResourceRoot:()=>'.',resolvePython:()=> 'fixture',pythonRuntimeEnv:x=>x,spawn:()=>child,assistantJobs:jobs,...require('../src/ndjson-lines'),sanitizeProcessDetail:x=>x,subtitleFileAccess:{grant(){}},writeJobLog(){},setTimeout,clearTimeout,terminateProcessTree:()=>false,terminateProcessTreeAndWait:async()=>false};vm.createContext(box);vm.runInContext(main.slice(a,b),box);
 const task=box.runMediaCommand([],null,'subs');await jobs.cancel(jobs.snapshot().jobs[0].id);await tick();child.stdout.write(JSON.stringify({type:'subs',path:'late.srt'})+'\n');child.exitCode=0;child.emit('close',0);const result=await task;assert.equal(result.ok,false);assert.equal(result.cancelled,true);assert.equal(jobs.snapshot().jobs[0].state,'stopped');
});
