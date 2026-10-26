'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createJobs,register}=require('../src/assistant-jobs');
test('Exact job cancellation never reaches a replacement, and exit does not overwrite completed output',async()=>{
 const jobs=createJobs();let stopsA=0,stopsB=0;
 const a=jobs.start({cancel:async()=>{stopsA++;return {ok:true};}});
 jobs.update(a,{type:'done'});jobs.update(a,{type:'exit',cancelled:true});assert.equal(jobs.snapshot().jobs[0].state,'completed');
 const b=jobs.start({cancel:async()=>{stopsB++;return {ok:true};}});
 assert.equal((await jobs.cancel(a)).ok,false);assert.equal(stopsA,0);assert.equal(stopsB,0);
 assert.equal((await jobs.cancel(b)).status,'accepted');assert.equal(stopsB,1);assert.equal(jobs.snapshot().jobs[0].state,'cancelling');
 jobs.update(b,{type:'exit',cancelled:true});assert.equal(jobs.snapshot().jobs[0].state,'stopped');assert.equal((await jobs.cancel(b)).ok,false);
});
test('Failed cancellation is retryable; partial output and bounded history exclude private values',async()=>{
 const jobs=createJobs();let calls=0;const id=jobs.start({kind:'translation',cancel:async()=>{if(++calls===1)throw Error('private path');return {ok:true};}});
 jobs.update(id,{type:'segment',text:'private text'});jobs.update(id,{type:'status',stage:'C:\\private.wav'});assert.equal((await jobs.cancel(id)).status,'accepted');await new Promise(resolve=>setImmediate(resolve));assert(jobs.snapshot().jobs[0].cancellable);assert(jobs.snapshot().jobs[0].stopFailed);
 await jobs.cancel(id);await new Promise(resolve=>setImmediate(resolve));jobs.update(id,{type:'exit',cancelled:true});assert(jobs.snapshot().jobs[0].partial);assert(!JSON.stringify(jobs.snapshot()).includes('private'));
 for(let i=0;i<70;i++){const key=jobs.start({});jobs.update(key,{type:'error'});}assert.equal(jobs.snapshot().jobs.length,50);
});
test('IPC rejects foreign sender; redundant progress does not flood events',async()=>{
 let changes=0;const jobs=createJobs({changed:()=>changes++}),id=jobs.start({});jobs.update(id,{type:'progress',percent:2.4});const count=changes;
 jobs.update(id,{type:'progress',percent:2.5});jobs.update(id,{type:'log',message:'private'});assert.equal(changes,count);
 const handlers=new Map();register({ipcMain:{handle:(n,f)=>handlers.set(n,f)},authorized:e=>e.trusted,jobs});
 assert.equal(handlers.get('assistant:jobs')({trusted:false}).ok,false);assert.equal((await handlers.get('assistant:cancelJob')({trusted:false},{id})).ok,false);
 assert.equal(handlers.get('assistant:jobs')({trusted:true}).jobs[0].percent,2);
});

 test('Reference preparation reaches a terminal state instead of leaving an orphan running row',()=>{
  const jobs=createJobs(),id=jobs.start({kind:'reference'});jobs.update(id,{type:'reference_status',stage:'transcribe'});assert.equal(jobs.snapshot().jobs[0].stage,'transcribe');
  jobs.update(id,{type:'reference_ready'});assert.equal(jobs.snapshot().jobs[0].state,'completed');assert.equal(jobs.snapshot().jobs[0].percent,100);
 });
const vm=require('node:vm'),fs=require('node:fs');
test('Renderer hydration cannot overwrite a newer main event; stop forwards only the exact ID',async()=>{
 let event,hydrate,lastId;const listeners={},window={api:{assistantJobs:()=>new Promise(resolve=>hydrate=resolve),onAssistantJobs:fn=>(event=fn,()=>{}),cancelAssistantJob:async({id})=>(lastId=id,{ok:true})},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-jobs-ui'),'utf8'),{window,document:{dispatchEvent:()=>{}},Event:class{}});
 event({revision:5,jobs:[{id:'new'}]});hydrate({ok:true,revision:1,jobs:[]});await new Promise(resolve=>setImmediate(resolve));assert.equal(window.AssistantJobsUI.snapshot().revision,5);
 await window.AssistantJobsUI.cancel('exact');assert.equal(lastId,'exact');listeners.pagehide();
});
test('Unavailable UI notifications cannot interrupt the main media job',()=>{
 const jobs=createJobs({changed:()=>{throw Error('Window closed');}});const id=jobs.start({});assert(jobs.has(id));jobs.update(id,{type:'done'});assert.equal(jobs.snapshot().jobs[0].state,'completed');
});

test('A stalled cancellation does not block chat; state stays stopping until real exit',async()=>{
 const jobs=createJobs(),id=jobs.start({cancel:()=>new Promise(()=>{})});
 assert.equal((await jobs.cancel(id)).status,'accepted');assert.equal(jobs.snapshot().jobs[0].state,'cancelling');assert.equal(jobs.snapshot().jobs[0].cancellable,false);
 jobs.update(id,{type:'exit',cancelled:true});assert.equal(jobs.snapshot().jobs[0].state,'stopped');
});
