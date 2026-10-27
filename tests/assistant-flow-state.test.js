'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {describe}=require('../src/assistant-flow-state');
test('Only the exact completed job makes a continuation ready; running never resends a model request',()=>{
 const row={jobId:'exact',waiting:true,expires:1000};
 assert.equal(describe(row,[{id:'other',state:'completed'}],0).ready,false);
 const running=describe(row,[{id:'exact',state:'running',percent:40}],0);assert.equal(running.waiting,true);assert.equal(running.ready,false);assert.equal(running.percent,40);
 assert.equal(describe(row,[{id:'exact',state:'completed'}],0).ready,true);
 for(const state of ['failed','stopped','cancelling'])assert.equal(describe(row,[{id:'exact',state}],0).ready,false);
 assert.equal(describe(row,[{id:'exact',state:'completed'}],1000).state,'expired');
 assert.equal(describe({expires:1000,waiting:false},[],0).ready,true);
});
