'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const recovery=require('../src/podcast-translation-recovery');
const hash=x=>createHash('sha256').update(x).digest('hex');
const seconds=x=>x%1000===0?x/1000+'.0':String(x/1000);
function packet(){const originals=[{startMs:12000,endMs:14000,text:'Hello there.'},{startMs:14000,endMs:16000,text:'Next sentence.'}],source='1\n00:00:12,000 --> 00:00:14,000\nHello there.\n\n2\n00:00:14,000 --> 00:00:16,000\nNext sentence.\n\n',translation=source.replace('Hello there.','Merhaba.'),bytes=Buffer.from('\uFEFF'+translation);const sourceHash=hash('['+originals.map(row=>`{"s":${seconds(row.startMs)},"e":${seconds(row.endMs)},"t":${JSON.stringify(row.text)}}`).join(',')+']');
 const metadata={version:1,role:'translation',sourceContextVersion:1,sourceHash,subtitleHash:hash(bytes),originalHash:hash(JSON.stringify(originals)),originalCues:originals,targetLanguage:'tr',forSpeech:false,total:2,completed:1,failed:1,status:'partial',cues:originals.map((row,i)=>({key:hash(`{"i":${i},"s":${seconds(row.startMs)},"e":${seconds(row.endMs)},"t":${JSON.stringify(row.text)}}`),status:i?'failed':'completed',text:i?row.text:'Merhaba.'}))};return {source,translation,bytes,metadata};}
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-retry-')),p=packet(),file=path.join(dir,'translated.srt');fs.writeFileSync(file,p.bytes);fs.writeFileSync(file+'.meta.json',JSON.stringify(p.metadata));return {dir,file,...p,close:()=>fs.rmSync(dir,{recursive:true,force:true})};}

test('explicit mixed-file repair works without a sidecar and preserves unselected text and timestamps',()=>{
 const f=fixture();try{
  fs.unlinkSync(f.file+'.meta.json');const bytes=Buffer.from(f.bytes.toString('utf8').replace('Next sentence.','The rulers of the kingdom said that they would return from Egypt.'));fs.writeFileSync(f.file,bytes);
  const input={file:f.file,bytes,directory:path.join(f.dir,'mixed')};assert.equal(recovery.repairFile(input).canRepair,false);
  const info=recovery.repairFile({...input,allowMixed:true});assert.equal(info.failed,1);assert.equal(info.mixed,true);assert.equal(fs.existsSync(input.directory),false);
  const result=recovery.repairFile({...input,allowMixed:true,prepare:true,expectedHash:info.fingerprint});
  const meta=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json'));assert.equal(meta.mixedSubtitleRepair,true);assert.deepEqual(meta.cues.map(r=>r.status),['completed','failed']);assert.equal(meta.cues[0].text,'Merhaba.');assert.equal(meta.originalCues[0].startMs,12000);assert.equal(fs.readFileSync(f.file,'utf8'),bytes.toString('utf8'));
  const again={file:result.translationPath,bytes:fs.readFileSync(result.translationPath),directory:path.join(f.dir,'again')},review=recovery.repairFile(again);assert.equal(review.mixed,true);
  const retried=recovery.repairFile({...again,prepare:true,expectedHash:review.fingerprint});assert.equal(JSON.parse(fs.readFileSync(retried.translationPath+'.meta.json')).mixedSubtitleRepair,true);
 }finally{f.close();}
});

test('file repair is read-only until approval, rejects stale approval and preserves original successful rows',()=>{
 const f=fixture();try{
  const input={file:f.file,bytes:f.bytes,directory:path.join(f.dir,'repair')},info=recovery.repairFile(input);
  assert.equal(info.failed,1);assert.equal(info.canRepair,true);assert.equal(fs.existsSync(input.directory),false);
  assert.throws(()=>recovery.repairFile({...input,prepare:true,expectedHash:'stale'}));assert.equal(fs.existsSync(input.directory),false);
  const result=recovery.repairFile({...input,prepare:true,expectedHash:info.fingerprint});
  assert.equal(result.translateRetryOnly,true);assert.equal(result.completed,1);
  assert.equal(fs.readFileSync(f.file,'utf8'),f.bytes.toString('utf8'));
  const meta=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json'));
  assert.deepEqual(meta.cues.map(r=>r.status),['completed','failed']);assert.equal(meta.cues[0].text,'Merhaba.');
  assert.equal(meta.originalCues[0].startMs,12000);
  fs.writeFileSync(f.file+'.meta.json',JSON.stringify({...f.metadata,model:'changed'}));
  assert.throws(()=>recovery.repairFile({...input,prepare:true,expectedHash:info.fingerprint}));
 }finally{f.close();}
});

test('verified failures are counted separately from likely untranslated short sentences',()=>{
 const f=fixture();try{
  const bytes=Buffer.from(f.bytes.toString('utf8').replace('Next sentence.','The rulers of the kingdom said that they would return from Egypt.'));
  fs.writeFileSync(f.file,bytes);
  fs.writeFileSync(f.file+'.meta.json',JSON.stringify({...f.metadata,subtitleHash:hash(bytes),cues:f.metadata.cues.map((row,i)=>i?{...row,text:'The rulers of the kingdom said that they would return from Egypt.'}:row)}));
  const info=recovery.repairFile({file:f.file,bytes,directory:path.join(f.dir,'repair')});
  assert.equal(info.failed,1);assert.equal(info.suspected,0);
 }finally{f.close();}
});

test('speech file repair retains the exact source speech protocol for backend validation',()=>{
 const f=fixture();try{
  fs.writeFileSync(f.file+'.meta.json',JSON.stringify({...f.metadata,forSpeech:true,speechProtocol:'speech-v18-pronoun-context-review'}));
  const input={file:f.file,bytes:f.bytes,directory:path.join(f.dir,'repair')},info=recovery.repairFile(input);
  const result=recovery.repairFile({...input,prepare:true,expectedHash:info.fingerprint});
  assert.equal(result.forSpeech,true);const meta=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json'));
  assert.equal(meta.forSpeech,true);assert.equal(meta.speechProtocol,'speech-v18-pronoun-context-review');assert.equal(meta.cues[0].text,'Merhaba.');
 }finally{f.close();}
});

test('an English paragraph marked completed is offered for repair without rewriting short shared names',()=>{
 const f=fixture();try{
  const english='This is the story that they have told from the beginning.';
  const rows=f.metadata.originalCues.map((row,i)=>({...row,text:i?english:row.text}));
  const bytes=Buffer.from(f.bytes.toString('utf8').replace('Next sentence.',english));
  const meta={...f.metadata,originalCues:rows,originalHash:hash(JSON.stringify(rows)),subtitleHash:hash(bytes),sourceHash:hash('['+rows.map(row=>'{"s":'+seconds(row.startMs)+',"e":'+seconds(row.endMs)+',"t":'+JSON.stringify(row.text)+'}').join(',')+']'),completed:2,failed:0,status:'complete',cues:rows.map((row,i)=>({key:hash('{"i":'+i+',"s":'+seconds(row.startMs)+',"e":'+seconds(row.endMs)+',"t":'+JSON.stringify(row.text)+'}'),status:'completed',text:i?english:'Merhaba.'}))};
  fs.writeFileSync(f.file,bytes);fs.writeFileSync(f.file+'.meta.json',JSON.stringify(meta));
  const input={file:f.file,bytes,directory:path.join(f.dir,'repair')},info=recovery.repairFile(input);
  assert.equal(info.canRepair,true);assert.equal(info.suspected,1);assert.equal(info.failed,1);
  const result=recovery.repairFile({...input,prepare:true,expectedHash:info.fingerprint});
  const staged=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json'));assert.deepEqual(staged.cues.map(row=>row.status),['completed','failed']);assert.equal(staged.cues[0].text,'Merhaba.');
 }finally{f.close();}
});

test('repair IPC refuses ungranted files without opening a permission dialog and grants only staged copies',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/main'),'utf8'),begin=source.indexOf("ipcMain.handle('media:repairTranslation'"),end=source.indexOf("ipcMain.handle('media:readSubtitle'",begin),handlers={},f=fixture(),grants=[];let allowed=false;
 const event={},access={inspect:value=>value,has:()=>allowed,grant:file=>grants.push(file)};
 const ctx={ipcMain:{handle:(name,handler)=>handlers[name]=handler},authorizedBrowserSender:e=>e===event,subtitleFileAccess:access,fs,path,app:{getPath:()=>f.dir},require:name=>{assert.equal(name,'./podcast-translation-recovery');return recovery;}};
 try{vm.runInNewContext(source.slice(begin,end),ctx);const handle=handlers['media:repairTranslation'];assert.equal((await handle({},{})).ok,false);assert.equal((await handle(event,{path:f.file})).ok,false);assert.equal(grants.length,0);
  allowed=true;const info=await handle(event,{path:f.file});assert.equal(info.canRepair,true);assert.equal(grants.length,0);
  const result=await handle(event,{path:f.file,prepare:true,expectedHash:info.fingerprint});assert.equal(result.ok,true);assert.deepEqual(grants,[result.sourcePath,result.translationPath]);
 }finally{f.close();}
});
test('authorized sidecar yields only bounded recovery data tied to actual output and per-cue statuses',()=>{const f=fixture();try{const result=recovery.readOutputRecovery(f.file,f.bytes);assert.equal(result.targetLanguage,'tr');assert.deepEqual(result.completed,[true,false]);assert.equal(result.sourceCues.length,2);assert.equal(result.sourceId,undefined);assert.equal(result.provider,undefined);assert.equal(result.translationTextHash,hash(f.translation));fs.writeFileSync(f.file+'.meta.json',JSON.stringify({...f.metadata,subtitleHash:'0'.repeat(64)}));assert.equal(recovery.readOutputRecovery(f.file,f.bytes),null);}finally{f.close();}});
test('retry writes matching backend fingerprints and source id without changing successful translated text',()=>{const f=fixture();try{const raw=recovery.readOutputRecovery(f.file,f.bytes),track={state:'timed',format:'srt',text:f.translation,status:'partial',targetLanguage:'tr',coverage:{start:12,end:16},recovery:raw};const result=recovery.materialize({directory:path.join(f.dir,'managed'),sourceVersion:'a'.repeat(64),source:{state:'timed',format:'srt',text:f.source,status:'complete',coverage:{start:12,end:16}},translation:track,targetLanguage:'tr',expectedTranscriptText:f.source});assert.equal(result.total,2);assert.equal(result.completed,1);assert.equal(result.failed,1);assert.deepEqual(result.coverage,{start:12,end:16});assert.match(fs.readFileSync(result.translationPath,'utf8'),/Merhaba\./);const meta=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json'));assert.equal(meta.sourceHash,f.metadata.sourceHash);assert.equal(meta.sourceId,hash(JSON.stringify({kind:'file',source:result.sourcePath,hash:meta.sourceHash})));assert.deepEqual(meta.cues.map(row=>row.status),['completed','failed']);assert.deepEqual(meta.cues.map(row=>row.key),f.metadata.cues.map(row=>row.key));}finally{f.close();}});
test('missing or changed recovery, target, timing and source fail before materializing any retry',()=>{for(const change of ['missing','target','text','timing','source','speech']){const f=fixture();try{const raw=recovery.readOutputRecovery(f.file,f.bytes),translation={state:'timed',format:'srt',text:f.translation,status:'partial',targetLanguage:'tr',recovery:raw},source={state:'timed',format:'srt',text:f.source,status:'complete'};if(change==='missing')delete translation.recovery;if(change==='target')translation.targetLanguage='de';if(change==='text')translation.text+='changed';if(change==='timing')source.text=source.text.replace('00:00:12,000','00:00:13,000');if(change==='source')source.text=source.text.replace('Hello there.','Different words.');if(change==='speech')raw.forSpeech=true;const directory=path.join(f.dir,'managed');assert.throws(()=>recovery.materialize({directory,sourceVersion:'a'.repeat(64),source,translation,targetLanguage:'tr',expectedTranscriptText:source.text}));assert.equal(fs.existsSync(directory),false,change);}finally{f.close();}}});

test('feed retry materializes only current metadata-bound partial translation and grants both files',async()=>{
 const {EventEmitter}=require('node:events'),{registerFeeds}=require('../src/feed-service'),session=require('../src/podcast-session'),f=fixture(),grants=[];
 const event={sender:{id:1}},service=registerFeeds({app:new EventEmitter(),ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>f.dir,autoStart:false,grantSubtitle:file=>{grants.push(file);return true;}});
 try{const parsed=require('../src/feed-parser').parseFeed('<rss version="2.0"><channel><title>Publisher</title><item><guid>episode</guid><title>Episode</title><enclosure url="https://publisher.example/audio.mp3" type="audio/mpeg" length="1000"/></item></channel></rss>','https://publisher.example/rss');service.store.subscribe({...parsed,url:'https://publisher.example/rss'},parsed.entries);const entry=service.store.entries({kind:'podcast'}).rows[0],version=session.sourceVersion(entry),request=input=>service.handle(event,{entryId:entry.id,sourceVersion:version,...input});
 const source=await request({action:'podcast-save-transcript',text:f.source,format:'srt',timed:true,provenance:'asr',coverage:{start:12,end:16,ignored:'not stored'}});assert.equal(source.ok,true,source.error);
 const saved=await request({action:'podcast-save-transcript',role:'translation',text:f.translation,format:'srt',timed:true,status:'partial',targetLanguage:'tr',coverage:{start:12,end:16},recovery:recovery.readOutputRecovery(f.file,f.bytes)});assert.equal(saved.ok,true,saved.error);assert.equal(saved.workspace.translation.targetLanguage,'tr');assert.deepEqual(saved.workspace.transcript.coverage,{start:12,end:16});assert.equal(saved.workspace.translation.recovery.sourceId,undefined);
 const input={action:'podcast-translation-retry',targetLanguage:'tr',expectedTranscriptText:f.source};const retry=await request(input);assert.equal(retry.ok,true,retry.error);assert.equal(retry.completed,1);assert.equal(retry.failed,1);assert.deepEqual(grants,[retry.sourcePath,retry.translationPath]);assert.equal((await request({...input,targetLanguage:'de'})).ok,false);assert.equal((await request({...input,expectedTranscriptText:'changed'})).ok,false);assert.equal((await request({...input,sourceVersion:'0'.repeat(64)})).ok,false);
 const bad=await request({action:'podcast-save-transcript',role:'translation',text:f.translation,format:'srt',timed:true,status:'partial',targetLanguage:'tr',recovery:{version:1,completed:[true,true]}});assert.equal(bad.ok,false);assert.equal(service.store.entry(entry.id).podcastWorkspace.translation.recovery.completed[1],false);
 }finally{service.dispose();f.close();}
});

test('recovery eligibility returns stable safe counts and explains unsupported speech without paths',()=>{const f=fixture();try{const raw=recovery.readOutputRecovery(f.file,f.bytes),source={state:'timed',text:f.source,status:'complete'},translation={state:'timed',text:f.translation,status:'partial',targetLanguage:'tr',recovery:raw};assert.deepEqual(recovery.recoveryInfo(source,translation),{canRetry:true,total:2,completed:1,failed:1});assert.equal(recovery.recoveryInfo(source,{...translation,recovery:null}).reason,'missing-recovery');assert.equal(recovery.recoveryInfo(source,{...translation,recovery:{...raw,forSpeech:true}}).reason,'for-speech-unsupported');}finally{f.close();}});

test('CRLF generated bytes and decoded subtitle text share the same recovery digest without exposing metadata paths',()=>{const f=fixture();try{const bytes=Buffer.from(f.bytes.toString('utf8').replace(/\n/g,'\r\n')),metadata={...f.metadata,subtitleHash:hash(bytes),sourceId:'private-output-path-marker',provider:'https://secret.example/key',model:'private-model',apiKey:'not-a-real-key'};fs.writeFileSync(f.file,bytes);fs.writeFileSync(f.file+'.meta.json',JSON.stringify(metadata));const decoded=require('../src/browser-textutil').decodeSubtitleBuffer(bytes).text,result=recovery.readOutputRecovery(f.file,bytes);assert(result);assert.equal(result.translationTextHash,hash(decoded));assert(!JSON.stringify(result).includes('private-output'));assert(!JSON.stringify(result).includes('secret.example'));assert(!JSON.stringify(result).includes('apiKey'));}finally{f.close();}});

test('verified all-failed completion mask remains retryable without inferring success from text',()=>{const f=fixture();try{const metadata={...f.metadata,completed:0,failed:2,cues:f.metadata.cues.map(row=>({...row,status:'failed'}))};fs.writeFileSync(f.file+'.meta.json',JSON.stringify(metadata));const raw=recovery.readOutputRecovery(f.file,f.bytes),source={state:'timed',text:f.source,status:'complete'},translation={state:'timed',text:f.translation,status:'partial',targetLanguage:'tr',recovery:raw};assert.deepEqual(recovery.recoveryInfo(source,translation),{canRetry:true,total:2,completed:0,failed:2});const result=recovery.materialize({directory:path.join(f.dir,'managed'),sourceVersion:'a'.repeat(64),source,translation,targetLanguage:'tr',expectedTranscriptText:f.source});assert.equal(result.completed,0);assert.equal(result.failed,2);assert.equal(result.translateRetryOnly,true);const materialized=JSON.parse(fs.readFileSync(result.translationPath+'.meta.json','utf8'));assert(materialized.cues.every(row=>row.status==='failed'));}finally{f.close();}});
