'use strict';
// Real registerDubService (fake worker process) over one userData folder, started twice like a restart.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {voiceStorage}=require('../src/voice-storage');
const {world,wav,outputOf,sha}=require('./dub-run-world');

test('asynchronous restore approval is single-flight, replays its result and blocks new production until settled',async()=>{
 const w=world(),originalCopy=fs.promises.copyFile;try{
  const granted=[];const moved=path.join(w.root,'restore-source.wav'),svc=w.boot({grantMedia:file=>granted.push(file),dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('single-restore'));const worker=w.spawns.at(-1),target=outputOf(worker);fs.writeFileSync(target,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);fs.renameSync(target,moved);granted.length=0;
  const preview=await svc.call('dub:runs',{action:'output-restore-preview',runId:'single-restore'});let reached,release,copies=0;const arrived=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  fs.promises.copyFile=async function(from,to){if(to===target){copies++;reached();await gate;}return originalCopy.apply(this,arguments);};
  const first=svc.call('dub:runs',{action:'output-restore-approve',token:preview.token});await arrived;
  const second=svc.call('dub:runs',{action:'output-restore-approve',token:preview.token});assert.equal(svc.service.running(),true);
  assert.equal((await svc.call('dub:start',w.request('must-wait'))).ok,false);await assert.rejects(svc.service.releaseIdle(),/active/);
  await svc.call('dub:runs',{action:'output-restore-cancel',token:preview.token});assert(fs.existsSync(path.join(w.out,'.restore-'+preview.token+'.wav')),'cancel does not delete an already approved in-flight source');
  let prevented=0,quit=0;w.app.quit=()=>{quit++;};w.app.emit('before-quit',{preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(quit,0);
  release();const results=await Promise.all([first,second]);assert(results.every(row=>row.ok));assert(granted.includes(target),'verified restored WAV receives its media grant');assert.equal(copies,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(quit,1);assert.equal(svc.service.running(),false);
  const replay=await svc.call('dub:runs',{action:'output-restore-approve',token:preview.token});assert.equal(replay.replayed,true);assert.equal(copies,1);assert.equal(sha(fs.readFileSync(target)),sha(fs.readFileSync(moved)));assert.equal(w.spawns.length,1);
 }finally{fs.promises.copyFile=originalCopy;w.close();}
});

test('record changes during approved asynchronous copy preserve both files and never overwrite the newer record',async()=>{
 const w=world(),originalCopy=fs.promises.copyFile;try{
  const moved=path.join(w.root,'race-source.wav'),svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('record-race'));const worker=w.spawns.at(-1),target=outputOf(worker);fs.writeFileSync(target,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);const log=svc.events.at(-1).logPath;fs.renameSync(target,moved);
  const preview=await svc.call('dub:runs',{action:'output-restore-preview',runId:'record-race'});let release,reached;const gate=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{reached=resolve;});
  fs.promises.copyFile=async function(from,to){const result=await originalCopy.apply(this,arguments);if(to===target){reached();await gate;}return result;};
  const request=svc.call('dub:runs',{action:'output-restore-approve',token:preview.token});await arrived;const updated={...JSON.parse(fs.readFileSync(log)),label:'newer user label'};fs.writeFileSync(log,JSON.stringify(updated));const record=fs.readFileSync(log);release();
  const result=await request;assert.equal(result.code,'restore-record-changed');assert.equal(result.outputPreserved,true);assert.deepEqual(fs.readFileSync(log),record);assert.equal(sha(fs.readFileSync(target)),sha(fs.readFileSync(moved)));assert.equal(svc.service.running(),false);
 }finally{fs.promises.copyFile=originalCopy;w.close();}
});

test('asynchronous identity yields to the event loop, matches the sync digest and stops on cancellation',async()=>{
 const w=world();try{
  const voice=require('../src/voice-output'),file=path.join(w.root,'async.wav');fs.writeFileSync(file,wav(30));
  const expected=voice.voiceOutputIdentity(file);let yielded=false;setImmediate(()=>{yielded=true;});
  const actual=await voice.voiceOutputIdentityAsync(file);assert(yielded);assert.deepEqual(actual,expected);assert(await voice.matchesVoiceOutputAsync(file,expected));
  let checks=0;assert.equal(await voice.voiceOutputIdentityAsync(file,{isCurrent:()=>++checks<4}),null);assert(checks>=4);fs.unlinkSync(file);
 }finally{w.close();}
});

test('an asynchronous restore copy discards its preview when the run changes during copying',async()=>{
 const w=world(),originalCopy=fs.promises.copyFile;try{
  const moved=path.join(w.root,'moved-async.wav'),svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('async-stale'));const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);const log=svc.events.at(-1).logPath;fs.renameSync(file,moved);
  let release,reached;const arrived=new Promise(resolve=>{reached=resolve;});const gate=new Promise(resolve=>{release=resolve;});
  fs.promises.copyFile=async function(from,to){const result=await originalCopy.apply(this,arguments);if(path.basename(to).startsWith('.restore-')){reached();await gate;}return result;};
  const request=svc.call('dub:runs',{action:'output-restore-preview',runId:'async-stale'});await arrived;const summary=JSON.parse(fs.readFileSync(log));summary.label='changed during async copy';fs.writeFileSync(log,JSON.stringify(summary));release();
  assert.equal((await request).ok,false);assert(!fs.existsSync(file));assert(fs.existsSync(moved));assert(!fs.readdirSync(w.out).some(name=>name.startsWith('.restore-')));
 }finally{fs.promises.copyFile=originalCopy;w.close();}
});

test('temporary file details are explicit, bounded and cannot be used to inspect arbitrary paths',async()=>{
 const w=world();try{
  const svc=w.boot();await svc.call('dub:runs',{action:'list'});const name='.restore-'+'d'.repeat(32)+'.wav',file=path.join(w.out,name);fs.writeFileSync(file,wav(1));fs.writeFileSync(path.join(w.out,'private.txt'),'must not appear');const before=sha(fs.readFileSync(file));
  const details=await svc.call('dub:runs',{action:'output-restore-files',path:path.join(w.root,'elsewhere')});assert.equal(details.folder,w.out);assert.equal(details.files.length,1);assert.equal(details.files[0].name,name);assert.equal(details.files[0].active,false);assert.equal(details.files[0].size,fs.statSync(file).size);assert(details.files[0].ageSeconds>=0);assert.equal(sha(fs.readFileSync(file)),before);assert.equal(details.truncated,false);
 }finally{w.close();}
});

test('identity reads are bounded and reject writes even when the writer restores the mtime',()=>{
 const w=world(),originalRead=fs.readSync;try{
  const file=path.join(w.root,'hash-race.wav'),voice=require('../src/voice-output');fs.writeFileSync(file,wav(30));
  let changed=false,bytesRead=0;const initial=fs.statSync(file);
  fs.readSync=function(fd,buffer,offset,length,position){const result=originalRead.apply(this,arguments);if(length>=1024*1024){bytesRead+=result;if(!changed){changed=true;const write=fs.openSync(file,'r+');fs.writeSync(write,Buffer.from([1]),0,1,44);fs.closeSync(write);fs.utimesSync(file,initial.atime,initial.mtime);}}return result;};
  assert.equal(voice.voiceOutputIdentity(file),null);assert(changed);assert(bytesRead<=initial.size);
  fs.readSync=originalRead;fs.writeFileSync(file,wav(30));changed=false;bytesRead=0;const size=fs.statSync(file).size;
  fs.readSync=function(fd,buffer,offset,length,position){const result=originalRead.apply(this,arguments);if(length>=1024*1024){bytesRead+=result;if(!changed){changed=true;fs.appendFileSync(file,Buffer.alloc(2*1024*1024));}}return result;};
  assert.equal(voice.voiceOutputIdentity(file),null);assert(changed);assert(bytesRead<=size);
 }finally{fs.readSync=originalRead;w.close();}
});

test('restore copy and record-write failures report preserved files and never claim success',async()=>{
 const w=world(),originalCopy=fs.promises.copyFile,originalRename=fs.renameSync;try{
  const moved=path.join(w.root,'chosen.wav'),svc=w.boot({dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[moved]})}});
  await svc.call('dub:start',w.request('write-failure'));const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);fs.renameSync(file,moved);
  let staged=await svc.call('dub:runs',{action:'output-restore-preview',runId:'write-failure'});
  fs.promises.copyFile=async function(from,to){if(to===file){const error=Error('Controlled disk full');error.code='ENOSPC';throw error;}return originalCopy.apply(this,arguments);};
  let refused=await svc.call('dub:runs',{action:'output-restore-approve',token:staged.token});fs.promises.copyFile=originalCopy;assert.equal(refused.code,'restore-copy-failed');assert(!fs.existsSync(file));assert(fs.existsSync(moved));
  staged=await svc.call('dub:runs',{action:'output-restore-preview',runId:'write-failure'});const log=svc.events.at(-1).logPath,recordBytes=fs.readFileSync(log);
  fs.renameSync=function(from,to){if(to===log){const error=Error('Controlled record write failure');error.code='ENOSPC';throw error;}return originalRename.apply(this,arguments);};
  refused=await svc.call('dub:runs',{action:'output-restore-approve',token:staged.token});fs.renameSync=originalRename;
  assert.equal(refused.ok,false);assert.equal(refused.code,'restore-record-write-failed');assert.equal(refused.outputPreserved,true);assert.equal(sha(fs.readFileSync(file)),sha(fs.readFileSync(moved)));assert.deepEqual(fs.readFileSync(log),recordBytes);
  assert.equal((await svc.call('dub:runs',{action:'review',runId:'write-failure'})).ok,true,'existing record still verifies the preserved copied audio');
 }finally{fs.promises.copyFile=originalCopy;fs.renameSync=originalRename;w.close();}
});

test('restore temporary copies are visible separately and listing does not delete untracked files',async()=>{
 const w=world();try{
  const svc=w.boot();await svc.call('dub:runs',{action:'list'});const file=path.join(w.out,'.restore-'+'a'.repeat(32)+'.wav');fs.writeFileSync(file,wav(1));const before=sha(fs.readFileSync(file));
  const listed=await svc.call('dub:runs',{action:'list'});assert.deepEqual(listed.temporaryCopies,{active:0,untracked:1});assert(!listed.orphans.some(row=>row.id.includes('restore')));assert.equal(sha(fs.readFileSync(file)),before);
 }finally{w.close();}
});

test('missing identified output is restored only after matching selection and explicit approval, without overwrite',async()=>{
 const w=world();try{
  let chosen='',dialogCount=0;
  const svc=w.boot({dialog:{showOpenDialog:async()=>{dialogCount++;return {canceled:false,filePaths:[chosen]};}}});
  await svc.call('dub:start',w.request('restore-one'));const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);
  chosen=path.join(w.root,'Moved voice.wav');fs.renameSync(file,chosen);const sourceHash=sha(fs.readFileSync(chosen)),spawns=w.spawns.length;
  assert.equal((await svc.call('dub:runs',{action:'detail',runId:'restore-one'})).run.restorable,true);
  const staged=await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'});assert(staged.ok,JSON.stringify(staged));assert.equal(staged.sourceName,'Moved voice.wav');assert(!fs.existsSync(file));
  assert((await svc.call('dub:runs',{action:'output-restore-approve',token:staged.token})).ok);assert.equal(sha(fs.readFileSync(file)),sourceHash);assert.equal(sha(fs.readFileSync(chosen)),sourceHash);assert.equal(w.spawns.length,spawns);
  const replay=await svc.call('dub:runs',{action:'output-restore-approve',token:staged.token});assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal((await svc.call('dub:latest','restore-one')).output.id,'restore-one');
  fs.unlinkSync(file);const pending=await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'});assert(pending.ok);
  fs.writeFileSync(file,'unrelated new file');assert.equal((await svc.call('dub:runs',{action:'output-restore-approve',token:pending.token})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),'unrelated new file');fs.unlinkSync(file);
  const canceled=await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'});assert(canceled.ok);await svc.call('dub:runs',{action:'output-restore-cancel',token:canceled.token});assert.equal((await svc.call('dub:runs',{action:'output-restore-approve',token:canceled.token})).ok,false);assert(!fs.existsSync(file));
  const snapshot=await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'});const temp=path.join(w.out,'.restore-'+snapshot.token+'.wav');fs.appendFileSync(temp,'changed');assert.equal((await svc.call('dub:runs',{action:'output-restore-approve',token:snapshot.token})).ok,false);assert(!fs.existsSync(file));
  const stale=await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'});const record=svc.events.at(-1).logPath,recordBytes=fs.readFileSync(record);fs.writeFileSync(record,JSON.stringify({...JSON.parse(recordBytes),label:'changed while awaiting approval'}));assert.equal((await svc.call('dub:runs',{action:'output-restore-approve',token:stale.token})).ok,false);assert(!fs.existsSync(file));fs.writeFileSync(record,recordBytes);
  const bytes=fs.readFileSync(chosen);bytes[bytes.length-1]^=1;fs.writeFileSync(chosen,bytes);assert.equal((await svc.call('dub:runs',{action:'output-restore-preview',runId:'restore-one'})).ok,false);assert(!fs.existsSync(file));
  assert(!fs.readdirSync(w.out).some(name=>name.startsWith('.restore-')));assert.equal(dialogCount,6);
 }finally{w.close();}
});

test('new output identity survives restart and rejects another valid WAV of the same duration',async()=>{
 const w=world();try{
  const first=w.boot();assert((await first.call('dub:start',w.request('identity-output'))).ok);
  const worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);
  const record=w.records().find(row=>row.id==='identity-output');assert.equal(record.outputIdentity.sha256,sha(fs.readFileSync(file)));assert.equal(record.outputIdentity.size,fs.statSync(file).size);
  const second=w.boot();assert.equal((await second.call('dub:latest','identity-output')).output.id,'identity-output');
  const log=first.events.at(-1).logPath,saved=fs.readFileSync(log),raw=JSON.parse(saved);
  fs.writeFileSync(log,JSON.stringify({...raw,settings:{...raw.settings,timingMode:'video'},sync:{version:1,videoDuration:3,audioDuration:3,segments:[{v0:0,v1:3,a0:0,a1:3}]},quality:{version:1,groups:[{key:'1',group:1,text:'Text',sourceStart:0,sourceEnd:4,audioStart:0,audioEnd:4,status:'ready'}]}}));
  const mismatched=await second.call('dub:latest','identity-output');assert.equal(mismatched.output.syncInvalid,true);assert.equal(mismatched.output.sync,null);assert.equal(mismatched.output.qualityUnavailable,true);assert.equal(mismatched.output.quality,null);fs.writeFileSync(log,saved);
  const bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);
  assert.equal((await second.call('dub:latest','identity-output')).output,null);
  assert.equal((await second.call('dub:runs',{action:'review',runId:'identity-output'})).ok,false,'review must not bypass saved identity verification');
  const detail=await second.call('dub:runs',{action:'detail',runId:'identity-output'});assert.equal(detail.run.output.state,'changed');assert(detail.why.some(row=>row.code==='output-changed'));
  fs.writeFileSync(file,'broken WAV');const invalid=await second.call('dub:runs',{action:'detail',runId:'identity-output'});assert.equal(invalid.run.output.state,'invalid');assert(invalid.why.some(row=>row.code==='invalid-audio'));
  fs.unlinkSync(file);const missing=await second.call('dub:runs',{action:'detail',runId:'identity-output'});assert.equal(missing.run.output.state,'missing');assert(missing.why.some(row=>row.code==='output-missing'));assert(w.records().some(row=>row.id==='identity-output'));
 }finally{w.close();}
});

test('completed audio refuses a structurally valid map for a different duration and out-of-file quality ranges',async()=>{
 const w=world();try{
  const svc=w.boot();await svc.call('dub:start',{...w.request('wrong-duration'),timingMode:'video'});
  let worker=w.spawns.at(-1),file=outputOf(worker);fs.writeFileSync(file,wav(2));
  fs.writeFileSync(file.replace(/\.wav$/,'.sync.json'),JSON.stringify({version:1,videoDuration:3,audioDuration:3,segments:[{v0:0,v1:3,a0:0,a1:3}]}));worker.proc.exitCode=0;worker.proc.emit('close',0);
  assert.equal(svc.events.at(-1).type,'error');assert.equal(svc.events.at(-1).recoverablePath,file);assert(fs.existsSync(file));
  await svc.call('dub:start',w.request('quality-outside'));worker=w.spawns.at(-1);file=outputOf(worker);fs.writeFileSync(file,wav(2));
  fs.writeFileSync(file.replace(/\.wav$/,'.quality.json'),JSON.stringify({version:1,groups:[{key:'1',group:1,text:'Text',sourceStart:0,sourceEnd:4,audioStart:0,audioEnd:4,status:'ready'}]}));worker.proc.exitCode=0;worker.proc.emit('close',0);
  assert.equal(svc.events.at(-1).type,'done');assert.equal(svc.events.at(-1).quality,null);assert.equal(svc.events.at(-1).qualityUnavailable,true);
  const reopened=await svc.call('dub:latest','quality-outside');assert.equal(reopened.output.qualityUnavailable,true);assert.equal(reopened.output.quality,null);
 }finally{w.close();}
});

test('saved delivery and background survive restart and are copied without source analysis; modified assets refuse generation',async()=>{
 const w=world();try{
  let analyses=0;
  const first=w.boot({prepareProsody:async({output})=>{analyses++;fs.writeFileSync(output,JSON.stringify({groups:[]}));},prepareBackground:async({output})=>{analyses++;fs.writeFileSync(output,wav(2));}});
  assert.equal((await first.call('dub:start',{...w.request('with-assets'),source:'media-A',resultMode:'natural',prosodySource:'original-audio',keepBackground:true})).ok,true);
  const original=w.spawns.at(-1),file=outputOf(original);fs.writeFileSync(file,wav(2));original.proc.exitCode=0;original.proc.emit('close',0);
  const record=w.records().find(r=>r.id==='with-assets');assert(record.savedAssets.delivery);assert(record.savedAssets.background);assert.equal(record.pinned.deliveryAutomatic,true);
  const second=w.boot({prepareProsody:async()=>{throw Error('must not reanalyse');},prepareBackground:async()=>{throw Error('must not separate again');}});
  const prepared=await second.call('dub:runs',{action:'edit-prepare',runId:'with-assets',srt:w.srt,source:'media-A'});assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.recipe.keepBackground,true);
  const request={...prepared.recipe,id:'edited-assets',recipeId:'with-assets',forceGroups:['1'],keepEngine:false};
  assert.equal((await second.call('dub:start',request)).ok,true);
  const retry=w.spawns.at(-1),delivery=retry.args[retry.args.indexOf('--prosody-plan')+1];assert.deepEqual(fs.readFileSync(delivery),fs.readFileSync(path.join(w.out,'with-assets-delivery.json')));assert.deepEqual(fs.readFileSync(path.join(w.out,'edited-assets-background.wav')),fs.readFileSync(path.join(w.out,'with-assets-background.wav')));assert.equal(analyses,2);
  fs.writeFileSync(outputOf(retry),wav(2));retry.proc.exitCode=0;retry.proc.emit('close',0);assert.equal(w.records().find(r=>r.id==='edited-assets').pinned.deliveryAutomatic,true);
  const before=w.spawns.length,bytes=fs.readFileSync(path.join(w.out,'with-assets-background.wav'));bytes[bytes.length-1]^=1;fs.writeFileSync(path.join(w.out,'with-assets-background.wav'),bytes);
  const refused=await second.call('dub:start',{...request,id:'tampered-assets'});assert.equal(refused.ok,false);assert.match(refused.error,/changed/);assert.equal(w.spawns.length,before);assert.equal(fs.existsSync(file),true);
  const preview=await second.call('dub:runs',{action:'edit-prepare',runId:'with-assets',srt:w.srt,source:'media-A'});assert.equal(preview.ok,false);
 }finally{w.close();}
});

test('reference heartbeat identifies the waiting stage in the main event stream',async()=>{
 const w=world();try{
  const svc=w.boot();await svc.call('dub:start',w.request('reference-stage'));
  const worker=w.spawns.at(-1);
  worker.proc.stdout.emit('data','DUB_REFERENCE_ACTIVITY '+JSON.stringify({stage:'reference_encode',state:'waiting',elapsed:10,limit:300,id:'forged',type:'done',privateData:'must not forward'})+'\n');
  assert(svc.events.some(e=>e.type==='status'&&e.stage==='reference_encode'&&e.textEn.includes('10 / 300')));
  const activity=svc.events.find(e=>e.type==='reference_activity');assert.equal(activity.id,'reference-stage');assert.equal(activity.privateData,undefined);
  worker.proc.stdout.emit('data','DUB_REFERENCE_ACTIVITY '+JSON.stringify({stage:'injected',state:'waiting',elapsed:1,limit:300})+'\n');
  assert(!svc.events.some(e=>e.stage==='injected'));
  worker.proc.exitCode=1;worker.proc.emit('close',1);
 }finally{w.close();}
});
test('reviewed group text survives an app restart and a modified saved edit refuses retry approval',async()=>{
 const w=world();try{
  const first=w.boot();
  const planning=first.call('dub:plan',{srt:w.srt,grouping:'satir'});
  for(let i=0;i<50&&!w.spawns.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(w.spawns.length,1);
  const planner=w.spawns.at(-1);
  planner.proc.stdout.emit('data',JSON.stringify({sourceHash:sha('fixture'),groups:[{key:'1',text:'Özgün cümle.',start:0,end:4000,seconds:4}]}));
  planner.proc.emit('close',0);await planning;
  const dubText={sourceHash:sha('fixture'),edits:{'1':'Düzeltilmiş cümle.'}};
  assert.equal((await first.call('dub:start',{...w.request('edited-run'),grouping:'satir',dubText})).ok,true);
  const worker=w.spawns.at(-1);
  const textPath=worker.args[worker.args.indexOf('--dub-text')+1];
  assert.deepEqual(JSON.parse(fs.readFileSync(textPath,'utf8')),dubText);
  worker.proc.exitCode=1;worker.proc.emit('close',1);
  assert(fs.existsSync(textPath),'the approved text is retained with the input after failure');
  const second=w.boot();
  const preview=await second.call('dub:runs',{action:'retry-preview',runId:'edited-run',settings:'pinned'});
  assert.equal(preview.ok,true,JSON.stringify(preview));
  assert.equal(preview.reviewedText,1);
  const configFile=path.join(w.root,'dub-settings.json'),config=fs.readFileSync(configFile);
  fs.writeFileSync(configFile,JSON.stringify({...JSON.parse(config),grouping:'cumle'}));
  const regrouped=await second.call('dub:runs',{action:'retry-preview',runId:'edited-run',settings:'current'});
  assert.equal(regrouped.code,'selection-unrecoverable','edits from the old grouping cannot be assigned to new groups');
  fs.writeFileSync(configFile,config);
  const result=await second.call('dub:runs',{action:'retry-approve',token:preview.token});assert.equal(result.ok,true,JSON.stringify(result));
  const retry=w.spawns.at(-1);
  assert.deepEqual(JSON.parse(fs.readFileSync(retry.args[retry.args.indexOf('--dub-text')+1],'utf8')),dubText);
  retry.proc.exitCode=1;retry.proc.emit('close',1);
  const stale=await second.call('dub:runs',{action:'retry-preview',runId:'edited-run',settings:'pinned'});
  fs.writeFileSync(textPath,JSON.stringify({...dubText,edits:{'1':'Başka cümle.'}}));
  const count=w.spawns.length;
  const refused=await second.call('dub:runs',{action:'retry-approve',token:stale.token});
  assert.equal(refused.code,'source-changed');assert.equal(w.spawns.length,count);
 }finally{w.close();}
});
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


test('completed output restores an edit recipe after restart without generation and rejects changed scope or voice',async()=>{
 const w=world();try{
  const first=w.boot();await first.call('dub:start',w.request('saved-edit'));
  const worker=w.spawns.at(-1);fs.writeFileSync(outputOf(worker),wav(2));worker.proc.exitCode=0;worker.proc.emit('close',0);
  const second=w.boot(),count=w.spawns.length;
  const prepared=await second.call('dub:runs',{action:'edit-prepare',runId:'saved-edit',srt:w.srt,source:''});
  assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.recipe.id,'saved-edit');assert.equal(prepared.subtitleHash,sha('fixture'));assert.equal(prepared.recipe.timingMode,'clip');assert.equal(w.spawns.length,count);
  for(const changed of [{source:'other-source'},{range:{start:1,end:2}}]){const refusal=await second.call('dub:runs',{action:'edit-prepare',runId:'saved-edit',srt:w.srt,source:'',...changed});assert.equal(refusal.ok,false);assert.match(refusal.error,/changed/);}
  fs.appendFileSync(path.join(w.engine,'anlatici_ham.wav'),'changed');
  const refused=await second.call('dub:runs',{action:'edit-prepare',runId:'saved-edit',srt:w.srt,source:''});assert.equal(refused.code,'voice-changed');assert.equal(w.spawns.length,count);
 }finally{w.close();}
});
