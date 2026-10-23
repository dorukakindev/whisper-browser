const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {terminateProcessTreeAndWait}=require('../src/process-lifecycle');
(async()=>{
 const p=new EventEmitter();p.pid=1;p.exitCode=0;p.signalCode=null;
 p.stdout={destroyed:false};p.stderr={destroyed:false};
 let resolved=false;
 const waiting=terminateProcessTreeAndWait(p,{waitMs:100}).then(result=>{resolved=true;return result;});
 await new Promise(setImmediate);
 assert.equal(resolved,false,'exitCode does not prove inherited stdio has closed');
 p.stdout.destroyed=p.stderr.destroyed=true;p.emit('close',0);
 assert.equal(await waiting,true);
 assert.equal(await terminateProcessTreeAndWait(p,{waitMs:5}),true,'an observed close remains confirmed');
 const hanging=new EventEmitter();hanging.exitCode=0;hanging.signalCode=null;
 assert.equal(await terminateProcessTreeAndWait(hanging,{waitMs:5}),false,'no close event means Stop was not confirmed');
 console.log('report522-lifecycle: exit/close distinction and bounded closure passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
