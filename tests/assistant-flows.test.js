'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createFlows}=require('../src/assistant-flows'),{createJobs}=require('../src/assistant-jobs');
const owner={kind:'video',owner:'source',thread:'thread',tabId:'A',generation:1,pageKey:'page',range:null};

test('A continuation lease is exclusive, rolls back failures and commits exactly once',()=>{
 const flows=createFlows(),flow=flows.start(7,owner,'Goal'),r=flows.record(flow,'open_settings',{}, {status:'completed'});
 const claim=()=>flows.resume(r.continuationId,7,owner,{deferCommit:true});
 const first=claim();assert.throws(claim,/already running/);assert.equal(flow.count,0);
 first.settle(false);first.settle(true);assert.equal(flow.count,0);
 const second=claim();second.settle(true);second.settle(true);assert.equal(flow.count,1);assert.throws(claim,/expired/);
});

test('A failed continuation retry preserves original goal and exact completed job evidence',()=>{
 const jobs=createJobs(),flows=createFlows({getJobs:jobs.snapshot}),flow=flows.start(7,owner,'Translate then narrate'),job=jobs.start({}),r=flows.record(flow,'start_whisper',{}, {status:'accepted'},job);
 assert(flows.resume(r.continuationId,7,owner,{deferCommit:true}).waiting);jobs.update(job,{type:'done'});
 const first=flows.resume(r.continuationId,7,owner,{deferCommit:true});first.settle(false);
 assert.throws(()=>flows.resume(r.continuationId,7,{...owner,thread:'other'},{deferCommit:true}),/changed/);
 const second=flows.resume(r.continuationId,7,owner,{deferCommit:true});assert.equal(second.flow.question,'Translate then narrate');assert.equal(second.flow.steps[0].status,'completed');second.settle(true);
});
test('Only real same-source single-use receipts resume; duplicate steps and expiry are bounded',()=>{let clock=0;const flows=createFlows({now:()=>clock}),flow=flows.start(7,owner,'Original goal'),r=flows.record(flow,'open_settings',{section:'general'},{status:'completed',note:'Opened'});assert(flows.repeated(flow,'open_settings',{section:'general'}));assert.throws(()=>flows.resume(r.continuationId,8,owner));assert.throws(()=>flows.resume(r.continuationId,7,{...owner,generation:2}));assert.equal(flows.resume(r.continuationId,7,owner).flow.question,'Original goal');assert.throws(()=>flows.resume(r.continuationId,7,owner));const next=flows.record(flow,'open_settings',{section:'ai'},{status:'completed'});clock=600001;assert.throws(()=>flows.resume(next.continuationId,7,owner));});
test('Accepted jobs wait for the exact ledger ID; another completed job is insufficient',()=>{const jobs=createJobs(),flows=createFlows({getJobs:jobs.snapshot}),flow=flows.start(7,owner,'Goal'),id=jobs.start({});const r=flows.record(flow,'start_whisper',{}, {status:'accepted'},id);const other=jobs.start({});jobs.update(other,{type:'done'});assert.equal(flows.resume(r.continuationId,7,owner).waiting,true);jobs.update(id,{type:'done'});assert.equal(flows.resume(r.continuationId,7,owner).flow.steps[0].status,'completed');});
test('Failed/stopped jobs, uncorrelated acceptance and failed actions never advance',()=>{for(const type of ['error','cancelled']){const jobs=createJobs(),flows=createFlows({getJobs:jobs.snapshot}),flow=flows.start(7,owner,'Goal'),id=jobs.start({}),r=flows.record(flow,'start_whisper',{}, {status:'accepted'},id);jobs.update(id,{type});assert.throws(()=>flows.resume(r.continuationId,7,owner));}const flows=createFlows(),flow=flows.start(7,owner,'Goal');assert.equal(flows.record(flow,'start',{}, {status:'accepted'}).continuationId,undefined);assert.equal(flows.record(flow,'start',{}, {status:'failed'}).continuationId,undefined);});
test('Continuation evidence strips private keys and bounds large results',()=>{const flows=createFlows(),flow=flows.start(7,owner,'Goal');flows.record(flow,'tool',{analysis:'x'.repeat(12000)},{status:'completed',path:'private',apiKey:'secret',rows:Array(100).fill({text:'x'.repeat(12000)})});const data=flows.evidence(flow);assert.equal(data[0].truncated,true);assert(JSON.stringify(data).length<6000);assert(!JSON.stringify(data).includes('private'));assert(!JSON.stringify(data).includes('secret'));});

test('Flow steps and outstanding continuations stay bounded',()=>{const flows=createFlows(),flow=flows.start(7,owner,'Goal');for(let i=0;i<8;i++){const r=flows.record(flow,'step',{i},{status:'completed'});if(i<7)assert(flows.resume(r.continuationId,7,owner).flow===flow);else{assert.equal(r.continuationState,'limit');assert.equal(r.continuationId,undefined);}}for(let i=0;i<70;i++)flows.record(flows.start(7,owner,'Goal'),'step',{}, {status:'completed'});assert.equal(flows.tokens.size,50);});
