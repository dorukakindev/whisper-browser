'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const {buildSourcePlan}=require('../src/dub-source-plan');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-source-plan-'));
const appRoot=path.join(__dirname,'..');
const child=()=>{const p=new EventEmitter();p.exitCode=null;p.signalCode=null;p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdout.setEncoding=p.stderr.setEncoding=()=>{};return p;};
(async()=>{try {
  const srt=path.join(root,'source.srt');fs.writeFileSync(srt,'1\n00:00:01,000 --> 00:00:03,000\nTürkçe konuşma.\n');
  let owned;
  const options={srt,grouping:'satir',range:null,python:process.env.WHISPER_TEST_PYTHON||'python',appRoot,spawn,
    environment:process.env,onProcess:p=>{owned=p;},terminate:p=>p.kill()};
  const plan=await buildSourcePlan(options);
  assert.equal(plan.sourceHash,createHash('sha256').update(fs.readFileSync(srt)).digest('hex'));
  assert.equal(plan.groups[0].text,'Türkçe konuşma.');assert.equal(owned.exitCode,0);
  await assert.rejects(buildSourcePlan({...options,isCancelled:()=>true}),error=>error.code==='DUB_START_CANCELLED');
  const malformed=child();
  await assert.rejects(buildSourcePlan({...options,spawn:()=>{queueMicrotask(()=>{
    malformed.stdout.emit('data',JSON.stringify({sourceHash:'a'.repeat(64),groups:[{key:'1',text:'bad',seconds:0}]}));
    malformed.exitCode=0;malformed.emit('close',0);
  });return malformed;}}),/Invalid source plan/);
  const large=child();let terminated=false;
  await assert.rejects(buildSourcePlan({...options,spawn:()=>{queueMicrotask(()=>large.stdout.emit('data','x'.repeat(4_000_001)));return large;},
    terminate:p=>{terminated=true;p.exitCode=1;p.emit('close',1);return true;}}),/output limit/);
  assert(terminated);
  const stuck=child();
  await assert.rejects(buildSourcePlan({...options,spawn:()=>{queueMicrotask(()=>stuck.stdout.emit('data','x'.repeat(4_000_001)));return stuck;},
    terminate:()=>false}),error=>error.processActive===true);
  console.log('dub-source-plan: actual model-free planner; valid identities; cancellation, bounded output, and retained active-process ownership');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
