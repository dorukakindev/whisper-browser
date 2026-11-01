'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {describe}=require('../src/assistant-flow-state');

test('Completed partial artifacts request inspection; streaming partial alone is not an incomplete result',()=>{
 const row={jobId:'exact',waiting:true,expires:1000};
 const completed={id:'exact',state:'completed',partial:true,result:{artifacts:[{role:'source',total:12,completed:12,failed:0,partial:false},{role:'translation',total:12,completed:11,failed:1,partial:true}]}};
 const info=describe(row,[completed],0);assert.equal(info.state,'partial');assert.equal(info.partial,true);assert.equal(info.ready,true);
 for(const artifacts of [undefined,[{role:'translation',total:12,completed:12,failed:0,partial:false}]]){
  assert.equal(describe(row,[{...completed,result:{artifacts}}],0).state,'ready');
 }
 assert.equal(describe(row,[{...completed,state:'running'}],0).ready,false);
});
test('Only the exact completed job makes a continuation ready; running never resends a model request',()=>{
 const row={jobId:'exact',waiting:true,expires:1000};
 assert.equal(describe(row,[{id:'other',state:'completed'}],0).ready,false);
 const running=describe(row,[{id:'exact',state:'running',percent:40}],0);assert.equal(running.waiting,true);assert.equal(running.ready,false);assert.equal(running.percent,40);
 assert.equal(describe(row,[{id:'exact',state:'completed'}],0).ready,true);
 for(const state of ['failed','stopped','cancelling'])assert.equal(describe(row,[{id:'exact',state}],0).ready,false);
 assert.equal(describe(row,[{id:'exact',state:'completed'}],1000).state,'expired');
 assert.equal(describe({expires:1000,waiting:false},[],0).ready,true);
});

test('Only a failed exact job offers stage retry; stopped and missing jobs stay closed',()=>{const row={jobId:'exact',waiting:true,expires:1000};for(const state of ['failed','stopped','running','cancelling','completed'])assert.equal(describe(row,[{id:'exact',state}],0).retryable===true,state==='failed');assert.equal(describe(row,[{id:'other',state:'failed'}],0).retryable===true,false);});
