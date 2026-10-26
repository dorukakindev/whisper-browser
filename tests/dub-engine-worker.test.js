 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');const {createDubEngineWorker}=require('../src/dub-engine-worker');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(idleMs=10000){const hosts=[];const spawn=(exe,args)=>{const proc=new EventEmitter();Object.assign(proc,{pid:100+hosts.length,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough()});proc.requests=[];proc.stdin.on('data',b=>proc.requests.push(JSON.parse(String(b))));hosts.push(proc);return proc;};const terminate=async proc=>{proc.exitCode=1;proc.emit('close',1,null);return true;};return {hosts,worker:createDubEngineWorker({spawn,terminate,idleMs})};}
test('Sequential runs reuse the owned worker, parse split boundaries and isolate output',async()=>{const {hosts,worker}=setup();const options={cwd:'engine',env:{VOXCPM_ROOT:'engine'}};let first=await worker.start('python',['/repo/altyazi_oku.py','a.srt'],options),output='';first.stdout.on('data',b=>output+=b);await tick();assert.equal(hosts[0].requests[0].args[0],'a.srt');const end=new Promise(r=>first.on('close',r));hosts[0].stdout.write('DUB_STAGE {}\nDUB_WORKER_DO');hosts[0].stdout.write('NE '+JSON.stringify({id:first.workerId,code:0})+'\n');assert.equal(await end,0);assert.match(output,/DUB_STAGE/);assert(!output.includes('DONE'));const second=await worker.start('python',['/repo/altyazi_oku.py','Çıktı/Örnek ses.srt'],options);second.on('error',()=>{});await tick();assert.equal(hosts.length,1);assert.equal(hosts[0].requests[1].args[0],'Çıktı/Örnek ses.srt');assert.equal(first.kill(),false,'completed run cannot kill the next run on the same warm process');const closed=new Promise(r=>second.on('close',r));await worker.release();assert.equal(await closed,1);assert(!worker.running());});
test('Worker crash closes the active run and the next run starts clean; idle release stops only its own process',async(t)=>{t.mock.timers.enable({apis:['setTimeout']});const {hosts,worker}=setup(15),options={cwd:'engine',env:{}};const first=await worker.start('python',['/r/altyazi_oku.py','a'],options);await tick();const closed=new Promise(r=>first.once('close',r));hosts[0].emit('close',9,null);assert.equal(await closed,9);const second=await worker.start('python',['/r/altyazi_oku.py','b'],options);await tick();assert.equal(hosts.length,2);hosts[1].stdout.write('DUB_WORKER_DONE '+JSON.stringify({id:second.workerId,code:0})+'\n');t.mock.timers.tick(15);await tick();assert.equal(worker.running(),false);});


test('missing native Python executable reports a subscribed job error and close instead of uncaught ENOENT',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 const workerPath=require.resolve('../src/dub-engine-worker');
 const script=`const {createDubEngineWorker}=require(${JSON.stringify(workerPath)});const {spawn}=require('node:child_process');
 const w=createDubEngineWorker({spawn,terminate:async()=>true});
 (async()=>{const r=await w.start('missing-whisper-voice-executable-556',[${JSON.stringify(path.join(process.cwd(),'missing','altyazi_oku.py'))}],{cwd:process.cwd(),env:process.env});r.on('error',e=>console.log('JOB_ERROR '+e.code));r.on('close',c=>{console.log('JOB_CLOSE '+c);process.exit(c===1?0:2);});})();
 setTimeout(()=>process.exit(4),2000);`;
 const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:4000,windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/JOB_ERROR ENOENT/);assert.match(result.stdout,/JOB_CLOSE 1/);
});

test('retired worker callbacks and old run kill cannot affect the replacement worker',async()=>{
 const {hosts,worker}=setup(),options={cwd:'engine',env:{}};
 const a=await worker.start('python',['/r/altyazi_oku.py','old'],options);await tick();
 hosts[0].stdout.write('DUB_WORKER_DONE '+JSON.stringify({id:a.workerId,code:0})+'\n');
 await worker.release();
 const b=await worker.start('python',['/r/altyazi_oku.py','new'],options);let error='',closed=false;
 b.stderr.on('data',chunk=>error+=chunk);b.on('error',()=>assert.fail('old process error reached new run'));b.once('close',()=>closed=true);
 hosts[1].kill=()=>{assert.fail('old run killed new host');};assert.equal(a.kill(),false);
 hosts[0].stderr.write('retired stderr');hosts[0].emit('error',Error('late retired error'));hosts[0].stdin.emit('error',Error('late EPIPE'));
 await tick();assert.equal(error,'');assert.equal(closed,false);assert.equal(worker.running(),true);
 const done=new Promise(resolve=>b.once('close',resolve));await worker.release();await done;
});

test('idle timer never shuts down a new run started by the completion callback',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {hosts,worker}=setup(15),options={cwd:'engine',env:{}};
 const a=await worker.start('python',['/r/altyazi_oku.py','a'],options);await tick();let next;
 a.once('close',()=>{next=worker.start('python',['/r/altyazi_oku.py','b'],options);});
 hosts[0].stdout.write('DUB_WORKER_DONE '+JSON.stringify({id:a.workerId,code:0})+'\n');const b=await next;await tick();
 t.mock.timers.tick(20);await tick();assert.equal(b.exitCode,null);assert.equal(worker.running(),true);
 const done=new Promise(resolve=>b.once('close',resolve));await worker.release();await done;
});

test('synchronous request pipe failure becomes a terminal job failure, preserving cleanup ownership',async()=>{
 const {hosts,worker}=setup(),options={cwd:'engine',env:{}};
 const run=await worker.start('python',['/r/altyazi_oku.py','a'],options);const errors=[];run.on('error',e=>errors.push(e.message));
 hosts[0].stdin.write=()=>{throw Error('controlled broken pipe');};
 const closed=new Promise(resolve=>run.once('close',resolve));assert.equal(await closed,1);assert.deepEqual(errors,['controlled broken pipe']);assert.equal(worker.running(),false);
});


test('Only one start can reserve the engine while a previous release is pending',async()=>{
 const {hosts,worker}=setup();
 const first=await worker.start('python',['/r/altyazi_oku.py','a'],{cwd:'engine',env:{}});await tick();
 hosts[0].stdout.write('DUB_WORKER_DONE '+JSON.stringify({id:first.workerId,code:0})+'\n');
 // Change runtime settings so start must await an asynchronous release.
 const pending=worker.start('python',['/r/altyazi_oku.py','b'],{cwd:'engine',env:{CUDA_VISIBLE_DEVICES:'1'}});
 await assert.rejects(()=>worker.start('python',['/r/altyazi_oku.py','c'],{cwd:'engine',env:{}}),/busy/);
 const second=await pending;await tick();assert.equal(hosts.length,2);assert.notEqual(first.pid,second.pid);await worker.release();
});

test('A confirmed stop settles active work even if close arrives after terminate resolves',async()=>{
 let host;const worker=createDubEngineWorker({spawn:()=>{host=new EventEmitter();Object.assign(host,{pid:5,exitCode:null,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough()});return host;},terminate:async()=>true});
 const run=await worker.start('python',['/r/altyazi_oku.py'],{cwd:'engine',env:{}});let closes=0;run.on('close',()=>closes++);await tick();
 await worker.release();assert.equal(closes,1);host.emit('close',1,null);await tick();assert.equal(closes,1);assert.equal(worker.running(),false);
});
