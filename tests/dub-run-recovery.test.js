'use strict';
// Real registerDubService (fake worker process) over one userData folder, started twice like a restart.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {voiceStorage}=require('../src/voice-storage');
const {world,wav,outputOf,sha}=require('./dub-run-world');
test('a run is recorded with pinned options and an instance lease; a worker that finished but whose app died is recovered after restart without starting anything',async()=>{
 const w=world();try{
  const first=w.boot();assert.equal((await first.call('dub:start',w.request('run-a'))).ok,true);
  const [record]=w.records();
  assert.deepEqual([record.id,record.result,record.version],['run-a','running',2]);
  assert.equal(record.pinned.subtitleHash,sha('fixture'),'the exact track digest is pinned at start');assert.deepEqual([record.pinned.timingMode,record.pinned.verification,record.pinned.profile],['clip','fast','quality']);
  assert.doesNotMatch(JSON.stringify(record),/Users|desktop|Türkçe\.srt|\.venv/,'no personal path is stored in the record');
  assert(fs.existsSync(path.join(w.logs,'instances',record.instanceId+'.json')),'a lease proves which app instance owns the run');
  // the worker finishes writing and reports completion, then the app dies before the terminal record
  const output=outputOf(w.spawns[0]);fs.writeFileSync(output,wav(2));w.spawns[0].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
  assert.equal(w.records()[0].workerCompleted,true,'completion evidence is written durably the moment the worker reports it');
  // restart: a second service over the same folders; the first instance's process is gone
  const leaseFile=path.join(w.logs,'instances',record.instanceId+'.json'),lease=JSON.parse(fs.readFileSync(leaseFile,'utf8'));fs.writeFileSync(leaseFile,JSON.stringify({...lease,pid:2147483000}));
  const spawnsBefore=w.spawns.length,second=w.boot();
  const listing=await second.call('dub:runs',{action:'list'});
  assert.deepEqual([listing.runs[0].id,listing.runs[0].state,listing.runs[0].recoverable,listing.runs[0].output.state],['run-a','interrupted',true,'valid']);
  assert.equal(w.spawns.length,spawnsBefore,'reopening the app never starts a production');assert.equal(w.records()[0].result,'running','listing wrote nothing');
  const recovered=await second.call('dub:runs',{action:'recover',runId:'run-a'});assert.equal(recovered.ok,true,JSON.stringify(recovered));
  const latest=await second.call('dub:latest','run-a');assert.equal(latest.output?.id,'run-a','the recovered result is found through the existing saved-output lookup');
  assert.equal(path.resolve(latest.output.path),path.resolve(output));
  // a late event from the dead instance's worker cannot rewrite the finished record
  w.spawns[0].proc.emit('close',1);assert.equal(w.records()[0].result,'done');assert.equal(w.records()[0].recovered,true);
 }finally{w.close();}
});

test('a retry reuses the pinned options and the stored input, previews separately, starts once, and keeps the previous valid output when it fails',async()=>{
 const w=world();try{
  const svc=w.boot();assert.equal((await svc.call('dub:start',{...w.request('run-b'),profile:'fast'})).ok,true);
  w.spawns[0].proc.stderr.emit('data','boom');w.spawns[0].proc.exitCode=1;w.spawns[0].proc.emit('close',1);
  assert.equal(w.records().find(r=>r.id==='run-b').result,'error');
  const earlier=path.join(w.out,'run-b.wav');fs.writeFileSync(earlier,wav(1));const earlierBytes=fs.readFileSync(earlier);
  // settings change afterwards; the pinned preview still carries the original profile and the current one is a separate preview
  fs.writeFileSync(path.join(w.root,'dub-settings.json'),JSON.stringify({timingMode:'clip',profile:'quality',keepEngine:false}));
  const pinned=await svc.call('dub:runs',{action:'retry-preview',runId:'run-b',settings:'pinned'});assert.equal(pinned.ok,true,JSON.stringify(pinned));assert.equal(pinned.pinned.profile,'fast');
  const today=await svc.call('dub:runs',{action:'retry-preview',runId:'run-b',settings:'current'});assert.equal(today.ok,true);assert.notEqual(today.token,pinned.token);
  assert(today.differences.some(row=>row.field==='profile'));
  assert.equal((await svc.call('dub:runs',{action:'retry-preview',runId:'../x'}).catch(error=>({ok:false,error:error.message}))).ok,false,'a run id is validated, a path is never accepted');
  const spawnsBefore=w.spawns.length;
  const [one,two]=await Promise.all([svc.call('dub:runs',{action:'retry-approve',token:pinned.token}),svc.call('dub:runs',{action:'retry-approve',token:pinned.token})]);
  assert.equal([one,two].filter(r=>r.ok===true).length,1,JSON.stringify([one,two]));assert(['pending','busy'].includes([one,two].find(r=>!r.ok).code),'the concurrent duplicate is refused, not started');assert.equal(w.spawns.length,spawnsBefore+1,'one approval starts exactly one generation');
  const again=await svc.call('dub:runs',{action:'retry-approve',token:pinned.token});assert.deepEqual([again.ok,again.replayed],[true,true]);assert.equal(w.spawns.length,spawnsBefore+1);
  const started=[one,two].find(r=>r.ok);const retry=w.records().find(r=>r.id===started.runId);
  assert.deepEqual([retry.retryOf,retry.attempt,retry.pinned.profile],['run-b',2,'fast'],'the new run carries the pinned profile, not today\'s');
  assert.equal(w.spawns.at(-1).args[w.spawns.at(-1).args.indexOf('--steps')+1],'10','the fast profile really reached the worker');
  assert.match(w.spawns.at(-1).args[1],new RegExp(started.runId),'the worker reads the new run\'s own copy of the stored input');
  // the retry fails: it cleans only its own files, the earlier valid output is untouched, and the old record is unchanged
  const bad=w.spawns.at(-1);bad.proc.exitCode=1;bad.proc.emit('close',1);
  assert.equal(w.records().find(r=>r.id===started.runId).result,'error');assert.deepEqual(fs.readFileSync(earlier),earlierBytes,'a failed retry never touches the previous output');
  assert.equal(w.records().find(r=>r.id==='run-b').result,'error');
  // the input copy is verified by hash: tampering refuses the approval and starts nothing
  const third=await svc.call('dub:runs',{action:'retry-preview',runId:'run-b',settings:'pinned'});fs.writeFileSync(path.join(voiceStorage(w.app).input,'run-b','Türkçe.srt'),'tampered');
  const refused=await svc.call('dub:runs',{action:'retry-approve',token:third.token});assert.deepEqual([refused.ok,refused.code],[false,'source-changed']);assert.equal(w.spawns.length,spawnsBefore+1);
 }finally{w.close();}
});

test('HARD C1: a worker that reported completion and then exited with an error is never a clean success (already correct in the service; recorded as evidence)',async()=>{
 const w=world();try{
  const svc=w.boot();assert.equal((await svc.call('dub:start',w.request('run-x'))).ok,true);
  const output=outputOf(w.spawns[0]);fs.writeFileSync(output,wav(2));w.spawns[0].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
  w.spawns[0].proc.exitCode=1;w.spawns[0].proc.emit('close',1);
  const record=w.records().find(r=>r.id==='run-x'),row=(await svc.call('dub:runs',{action:'list'})).runs.find(r=>r.id==='run-x');
  assert.deepEqual([record.result,record.exitCode],['error',1],'the service already reports an error, not a success');assert.match(record.error,/motor hata verdi/);
  assert.deepEqual([row.state,row.recoverable,row.output.state],['failed',true,'valid'],'the valid audio stays recoverable, explicitly, and is not called completed');
  assert.match(row.error,/motor hata verdi/,'the real error text reaches the list');
 }finally{w.close();}
});

test('HARD C2: output changed between verification and use is never served: recovery verifies, a later truncation is caught by the saved-output lookup',async()=>{
 const w=world();try{
  const first=w.boot(),index=w.spawns.length;assert.equal((await first.call('dub:start',w.request('run-y'))).ok,true);
  const output=outputOf(w.spawns[index]);fs.writeFileSync(output,wav(2));w.spawns[index].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
  for(const name of fs.readdirSync(path.join(w.logs,'instances'))){const f=path.join(w.logs,'instances',name),lease=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...lease,pid:2147483000}));}
  const second=w.boot();assert.equal((await second.call('dub:runs',{action:'recover',runId:'run-y'})).ok,true);
  assert.equal((await second.call('dub:latest','run-y')).output?.id,'run-y');
  fs.writeFileSync(output,wav(2).subarray(0,3000));                       // changed after verification
  assert.equal((await second.call('dub:latest','run-y')).output,null,'a truncated file is not served');
  const review=await second.call('dub:runs',{action:'review',runId:'run-y'});assert.deepEqual([review.ok,review.code],[false,'output-changed']);
 }finally{w.close();}
});

test('HARD C3: a live run whose heartbeat is late is never recovered from under its owner, and its own result still lands',async()=>{
 const w=world();try{
  const a=w.ledger('LIVE',process.pid),file=path.join(w.logs,'run-live-1.json'),fs_=fs;
  a.begin({summaryPath:file,id:'run-live',startedAt:new Date().toISOString(),label:'Canlı',pinned:{profile:'quality',subtitleHash:sha('fixture')}});a.mark(file,{workerCompleted:true});
  fs_.mkdirSync(w.out,{recursive:true});fs_.writeFileSync(path.join(w.out,'run-live.wav'),wav(2));
  const lease=path.join(w.logs,'instances','LIVE.json'),data=JSON.parse(fs_.readFileSync(lease,'utf8'));fs_.writeFileSync(lease,JSON.stringify({...data,heartbeatAt:Date.now()-120000}));   // pid answers, heartbeat is late
  const other=w.ledger('OTHER',process.pid),row=other.list().runs.find(r=>r.id==='run-live');
  assert.deepEqual([row.state,row.recoverable,row.retryable],['uncertain',false,false],'late heartbeat: not interrupted, not recoverable, not retryable');
  assert.equal(other.recover('run-live').ok,false);assert.equal(JSON.parse(fs_.readFileSync(file,'utf8')).result,'running','the live run\'s record was not touched');
  a.settle(file,{id:'run-live',result:'done',startedAt:new Date().toISOString(),quality:{groups:[{status:'ok'}]}});
  const saved=JSON.parse(fs_.readFileSync(file,'utf8'));assert.deepEqual([saved.result,saved.recovered,saved.quality.groups.length],['done',undefined,1],'the owner\'s real result with its quality data is what remains');
 }finally{w.close();}
});

test('HARD C4: two surfaces recovering the same record at once end with one consistent record',async()=>{
 const w=world();try{
  const first=w.boot(),index=w.spawns.length;await first.call('dub:start',w.request('run-z'));const output=outputOf(w.spawns[index]);fs.writeFileSync(output,wav(2));w.spawns[index].proc.stdout.emit('data','Tamamlandi: '+output+'\n');
  for(const name of fs.readdirSync(path.join(w.logs,'instances'))){const f=path.join(w.logs,'instances',name),lease=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...lease,pid:2147483000}));}
  const one=w.boot(),two=w.boot();const results=await Promise.all([one.call('dub:runs',{action:'recover',runId:'run-z'}),two.call('dub:runs',{action:'recover',runId:'run-z'}),one.call('dub:runs',{action:'recover',runId:'run-z'})]);
  assert(results.every(r=>r.ok===true),JSON.stringify(results));assert.equal(w.records().filter(r=>r.id==='run-z').length,1,'one record');
  const record=w.records().find(r=>r.id==='run-z');assert.deepEqual([record.result,record.recovered,path.basename(record.path)],['done',true,'run-z.wav']);
 }finally{w.close();}
});

test('HARD C5: a failed retry of a finished (partial) result keeps that result, its record and its audio untouched',async()=>{
 const w=world();try{
  const crafted=w.ledger('X',1),file=path.join(w.logs,'run-p-1.json'),{voiceStorage}=require('../src/voice-storage');
  crafted.begin({summaryPath:file,id:'run-p',startedAt:new Date().toISOString(),label:'Kısmi',pinned:{profile:'fast',verification:'fast',timingMode:'clip',autoFit:false,naturalSpeech:false,subtitleHash:sha('fixture'),range:undefined,sourceIdentity:'media-p'}});
  crafted.settle(file,{id:'run-p',startedAt:new Date().toISOString(),result:'done',path:'x',quality:{groups:[{status:'ok'},{status:'failed'}]}});crafted.end('run-p');
  fs.mkdirSync(w.out,{recursive:true});fs.writeFileSync(path.join(w.out,'run-p.wav'),wav(2));const inputDir=path.join(voiceStorage(w.app).input,'run-p');fs.mkdirSync(inputDir,{recursive:true});fs.writeFileSync(path.join(inputDir,'Türkçe.srt'),'fixture');
  const audioBefore=fs.readFileSync(path.join(w.out,'run-p.wav')),recordBefore=fs.readFileSync(file,'utf8');
  const svc=w.boot(),plan=await svc.call('dub:runs',{action:'retry-preview',runId:'run-p',settings:'pinned'});assert.equal(plan.ok,true,JSON.stringify(plan));
  const approved=await svc.call('dub:runs',{action:'retry-approve',token:plan.token});assert.equal(approved.ok,true);
  const proc=w.spawns.at(-1).proc;fs.writeFileSync(outputOf(w.spawns.at(-1)),wav(1));proc.exitCode=1;proc.emit('close',1);                 // the new attempt fails
  assert.equal(w.records().find(r=>r.id===approved.runId).result,'error');assert.deepEqual(fs.readFileSync(path.join(w.out,'run-p.wav')),audioBefore);assert.equal(fs.readFileSync(file,'utf8'),recordBefore,'the earlier record is byte-identical');
  assert.equal(fs.existsSync(path.join(w.out,approved.runId+'.wav')),false,'the failed attempt cleaned only its own output');
 }finally{w.close();}
});
