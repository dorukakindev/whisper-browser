'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createJobs}=require('../src/assistant-jobs');
test('Production caption scheduler observer owns exact stop, partial failure and replacement IDs',async()=>{
 const main=fs.readFileSync(require.resolve('../src/main'),'utf8'),start=main.indexOf('function observeAssistantCaptionJob('),end=main.indexOf('function sendEvent(',start),jobs=createJobs();
 const box={assistantJobs:jobs};vm.runInNewContext(main.slice(start,end)+';this.observe=observeAssistantCaptionJob',box);
 let aStops=0,bStops=0;const a={cancelAll:()=>aStops++},b={cancelAll:()=>bStops++},tab={translationScheduler:a};
 box.observe(tab,a,{total:4,completed:0,failed:0,pending:1});const old=jobs.snapshot().jobs[0].id;
 await jobs.cancel(old);await new Promise(resolve=>setImmediate(resolve));assert.equal(aStops,1);assert.equal(jobs.snapshot().jobs[0].state,'stopped');
 tab.translationScheduler=b;box.observe(tab,b,{total:4,completed:0,failed:0,queued:4});assert.equal((await jobs.cancel(old)).ok,false);assert.equal(bStops,0);
 box.observe(tab,b,{total:4,completed:3,failed:1,pending:0,queued:0,retrying:0});assert.equal(jobs.snapshot().jobs[0].state,'failed');assert(jobs.snapshot().jobs[0].partial);
});
