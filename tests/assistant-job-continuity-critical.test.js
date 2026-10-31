'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createJobs}=require('../src/assistant-jobs');
const tick=()=>new Promise(setImmediate);
const row=(jobs,id)=>jobs.snapshot().jobs.find(job=>job.id===id);

test('late native stop rejection cannot revive completed old job or change replacement cancellation',async()=>{
 const jobs=createJobs();let rejectOld,oldCalls=0,newCalls=0;
 const old=jobs.start({cancel:()=>{oldCalls++;return new Promise((_,reject)=>rejectOld=reject);}});
 assert.equal((await jobs.cancel(old)).status,'accepted');await tick();
 jobs.update(old,{type:'done'});
 const replacement=jobs.start({cancel:async()=>{newCalls++;return {ok:true};}});
 assert.equal((await jobs.cancel(old)).ok,false);assert.equal((await jobs.cancel(replacement)).status,'accepted');
 rejectOld(Error('Old native stop failed late'));await tick();
 assert.equal(row(jobs,old).state,'completed');assert.equal(row(jobs,old).stopFailed,false);
 assert.equal(row(jobs,replacement).state,'cancelling');assert.equal(row(jobs,replacement).stopFailed,false);assert.equal(oldCalls,1);assert.equal(newCalls,1);
 jobs.update(replacement,{type:'exit',cancelled:true});assert.equal(row(jobs,replacement).state,'stopped');
});

test('overlapping stop requests reach one exact callback and retry reaches only that job',async()=>{
 const jobs=createJobs();let rejectStop,calls=0,otherCalls=0;
 const exact=jobs.start({cancel:()=>{calls++;return new Promise((_,reject)=>rejectStop=reject);}}),other=jobs.start({cancel:async()=>{otherCalls++;return {ok:true};}});
 const [first,duplicate]=await Promise.all([jobs.cancel(exact),jobs.cancel(exact)]);assert.equal(first.status,'accepted');assert.equal(duplicate.ok,false);assert.equal(calls,1);
 rejectStop(Error('Native stop not confirmed'));await tick();assert.equal(row(jobs,exact).state,'running');assert.equal(row(jobs,exact).stopFailed,true);assert.equal(row(jobs,other).state,'running');
 assert.equal((await jobs.cancel(exact)).status,'accepted');assert.equal(calls,2);assert.equal(otherCalls,0);assert.equal(row(jobs,exact).stopFailed,false);
 jobs.update(exact,{type:'cancelled'});rejectStop(Error('Late failure after real exit'));await tick();assert.equal(row(jobs,exact).state,'stopped');assert.equal(row(jobs,other).state,'running');
});

test('late output from stopped job never completes replacement or exposes stale artifacts',async()=>{
 const jobs=createJobs(),old=jobs.start({cancel:async()=>({ok:true})});await jobs.cancel(old);jobs.update(old,{type:'exit',cancelled:true});
 const next=jobs.start({kind:'voice',cancel:async()=>({ok:true})});
 jobs.update(old,{type:'done',outputs:[{path:'C:/private/old.srt',role:'translation',language:'tr',total:1,completed:1,failed:0}]});jobs.update(old,{type:'progress',percent:100});
 assert.equal(row(jobs,old).state,'stopped');assert.equal(row(jobs,old).result,null);assert.equal(row(jobs,next).state,'running');assert.equal(row(jobs,next).percent,null);assert.equal(row(jobs,next).result,null);
});
