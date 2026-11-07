'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {createRunLedger,pinOptions}=require('../src/dub-run-ledger');
const sha=value=>createHash('sha256').update(value).digest('hex');
function wav(seconds=1){const data=Buffer.alloc(24000*2*seconds),head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+data.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(24000,24);head.writeUInt32LE(48000,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(data.length,40);return Buffer.concat([head,data]);}
function lab(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-ledger-')),dirs={logsDir:path.join(root,'logs'),outputDir:path.join(root,'out'),inputDir:path.join(root,'in')};
 for(const dir of Object.values(dirs))fs.mkdirSync(dir,{recursive:true});
 const clock={t:5_000_000},alive=new Set([1111,2222]),now=()=>clock.t;
 const make=(instanceId,pid)=>createRunLedger({...dirs,instanceId,pid,now,pidAlive:p=>alive.has(p),heartbeatMs:5000});
 const srt=Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nHello\n');
 const base={profile:'quality',verification:'detailed',timingMode:'video',grouping:'akici',expression:'reference',deliveryStrength:'balanced',resultMode:'natural',concurrency:4,autoFit:true,naturalSpeech:true,followDelivery:false,
  range:{start:0,end:60},sourceIdentity:'media-abc',subtitleHash:sha(srt),referenceFingerprint:'voice-A',pronunciations:[{from:'Newton',to:'Nyutin'}],sourceDuration:600,forceGroups:[]};
 const start=(ledger,id,extra={})=>{const summaryPath=path.join(dirs.logsDir,`${id}-${clock.t}.json`);ledger.begin({summaryPath,id,startedAt:new Date(clock.t).toISOString(),pinned:{...base,...extra.pinned},retryOf:extra.retryOf,attempt:extra.attempt});
  if(extra.input!==false){fs.mkdirSync(path.join(dirs.inputDir,id),{recursive:true});fs.writeFileSync(path.join(dirs.inputDir,id,'Türkçe.srt'),srt);}return summaryPath;};
 const snapshot=()=>JSON.stringify([dirs.logsDir,dirs.outputDir,dirs.inputDir].map(dir=>{const rows=[];(function walk(d){for(const name of fs.readdirSync(d)){const f=path.join(d,name),st=fs.statSync(f);if(st.isDirectory())walk(f);else rows.push([f,st.size,st.mtimeMs,sha(fs.readFileSync(f))]);}})(dir);return rows.sort();}));
 return {root,...dirs,clock,alive,make,start,srt,base,snapshot,wav,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const stateOf=(ledger,id,extra)=>ledger.list(extra).runs.find(row=>row.id===id)?.state;

test('a restart never leaves an old running record running forever, and reading never writes',()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-1');
  assert.equal(stateOf(a,'run-1',{activeRunId:'run-1'}),'running','the owning instance sees its live run');
  const b=l.make('B',2222);assert.equal(stateOf(b,'run-1'),'running-elsewhere','a second instance must not mark another instance\'s live run as interrupted');
  l.alive.delete(1111);const before=l.snapshot();
  assert.equal(stateOf(b,'run-1'),'interrupted','the instance is confirmed gone');assert.equal(b.list().runs[0].reason.code,'instance-gone');
  assert.equal(l.snapshot(),before,'listing wrote nothing (no marker, no lease cleanup, no record change)');
 }finally{l.close();}
});

test('neither a PID alone nor a record age decides: reused PID, stale heartbeat, sleeping machine and legacy records stay uncertain',()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-1');const b=l.make('B',2222);
  l.clock.t+=3600_000;assert.equal(stateOf(b,'run-1'),'uncertain','an hour old record whose PID still answers (reuse or sleep) is not declared interrupted');assert.equal(b.list().runs[0].reason.code,'heartbeat-stale');
  assert.equal(b.list().runs[0].retryable,false,'an uncertain run cannot be retried or recovered as if it were dead');
  a.heartbeat('run-1');assert.equal(stateOf(b,'run-1'),'running-elsewhere','a fresh heartbeat proves it is alive again');
  fs.writeFileSync(path.join(l.logsDir,'old-1.json'),JSON.stringify({id:'old',startedAt:'2020-01-01T00:00:00Z',result:'running'}));
  const legacy=b.list().runs.find(row=>row.id==='old');assert.deepEqual([legacy.state,legacy.reason.code,legacy.legacy],['uncertain','legacy-record',true],'a legacy "running" record is never shown as running');
  const mine=l.make('A',1111);l.start(mine,'run-2');assert.equal(stateOf(mine,'run-2'),'running');mine.end('run-2');
  assert.equal(stateOf(mine,'run-2'),'uncertain','same instance, no active run and no terminal record: unsettled, not running');
 }finally{l.close();}
});

test('a half-written or unreadable record never hides the valid runs and is never deleted',()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-ok');a.settle(path.join(l.logsDir,fs.readdirSync(l.logsDir).find(n=>n.startsWith('run-ok'))),{id:'run-ok',result:'cancelled',startedAt:new Date().toISOString()});a.end('run-ok');
  fs.writeFileSync(path.join(l.logsDir,'torn-1.json'),'{"id":"torn","result":"run');fs.writeFileSync(path.join(l.logsDir,'array-1.json'),'[1,2]');fs.writeFileSync(path.join(l.logsDir,'badid-1.json'),JSON.stringify({id:'../x',result:'done'}));
  const before=l.snapshot(),listing=a.list();
  assert.deepEqual(listing.runs.map(row=>row.id),['run-ok']);assert.equal(listing.unreadable.length,3);assert.equal(l.snapshot(),before);
  assert(fs.existsSync(path.join(l.logsDir,'torn-1.json')),'the unreadable file is preserved for inspection');
 }finally{l.close();}
});

test('first terminal result wins: late, duplicated or contradicting events never change a finished run, and pinned options survive settlement',()=>{
 const l=lab();try{
  const a=l.make('A',1111),file=l.start(a,'run-1');
  assert.equal(a.settle(file,{id:'run-1',result:'done',path:'x'}).ignored,undefined);
  assert.equal(a.settle(file,{id:'run-1',result:'error',error:'late'}).ignored,true);assert.equal(a.settle(file,{id:'run-1',result:'cancelled'}).ignored,true);
  assert.equal(a.mark(file,{workerCompleted:true}),false,'a late marker cannot touch a finished record');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.result,'done');assert.equal(saved.pinned.subtitleHash,l.base.subtitleHash);assert.equal(saved.instanceId,'A');
 }finally{l.close();}
});

test('pinned options keep the exact source, track digest, range, profile and dictionary, and store no paths, keys or voice content',()=>{
 const pinned=pinOptions({...{profile:'fast',verification:'balanced',range:{start:5,end:50},subtitleHash:'a'.repeat(64),sourceIdentity:'media-1',pronunciations:[{from:'a',to:'b'}],referenceFingerprint:'secret-recipe',concurrency:8},srt:'C:\\Users\\me\\video.srt',apiKey:'sk-secret',cookie:'x',path:'D:\\x.wav'});
 const raw=JSON.stringify(pinned);assert.doesNotMatch(raw,/Users|sk-secret|cookie|D:\\|secret-recipe/);
 assert.deepEqual([pinned.profile,pinned.range,pinned.subtitleHash,pinned.sourceIdentity,pinned.pronunciations,pinned.concurrency],['fast',{start:5,end:50},'a'.repeat(64),'media-1',[{from:'a',to:'b'}],8]);
 assert.equal(pinned.referenceFingerprint,sha('secret-recipe'),'the voice is pinned only as a digest');
 assert.deepEqual(pinOptions({profile:'turbo',concurrency:3,range:{start:9,end:1}}).profile,undefined);assert.equal(pinOptions({range:{start:9,end:1}}).range,undefined);
});

test('a valid output whose completion record was lost is found safely; partial, unproven and ownerless audio is never treated as success',()=>{
 const l=lab();try{
  const a=l.make('A',1111);
  // 1) worker reported completion durably, the app died before the terminal record
  const f1=l.start(a,'run-done');a.mark(f1,{workerCompleted:true});fs.writeFileSync(path.join(l.outputDir,'run-done.wav'),l.wav(2));fs.writeFileSync(path.join(l.outputDir,'run-done.sync.json'),JSON.stringify({version:1}));
  // 2) a valid-looking file without any completion evidence
  l.start(a,'run-maybe');fs.writeFileSync(path.join(l.outputDir,'run-maybe.wav'),l.wav(1));
  // 3) truncated audio even with the marker
  const f3=l.start(a,'run-cut');a.mark(f3,{workerCompleted:true});fs.writeFileSync(path.join(l.outputDir,'run-cut.wav'),l.wav(2).subarray(0,3000));
  // 4) audio with no record at all
  fs.writeFileSync(path.join(l.outputDir,'stray.wav'),l.wav(1));fs.writeFileSync(path.join(l.outputDir,'run-done-background.wav'),l.wav(1));
  l.alive.delete(1111);const b=l.make('B',2222),listing=b.list(),row=id=>listing.runs.find(item=>item.id===id);
  assert.deepEqual([row('run-done').state,row('run-done').recoverable,row('run-done').output.state],['interrupted',true,'valid']);
  assert.deepEqual([row('run-maybe').recoverable,row('run-maybe').unconfirmedOutput],[false,true],'no worker evidence: shown, never recoverable as a result');
  assert.deepEqual([row('run-cut').recoverable,row('run-cut').output.state],[false,'invalid'],'truncated audio is not a success');
  assert.deepEqual(listing.orphans.map(item=>item.id),['stray'],'only the ownerless file; the background stem of a known run is not an orphan');assert(listing.orphanNote);
  assert.equal(b.recover('stray').code,'unknown-run','an ownerless file cannot be attached to a section or timeline');
  assert.equal(b.recover('run-cut').ok,false);assert.equal(b.recover('run-maybe').ok,false);
  const before=fs.readFileSync(path.join(l.outputDir,'run-done.wav'));
  const recovered=b.recover('run-done');assert.deepEqual([recovered.ok],[true]);
  const saved=JSON.parse(fs.readFileSync(b.find('run-done').file,'utf8'));
  assert.deepEqual([saved.result,saved.recovered,saved.path,saved.subtitleHash,saved.sourceIdentity,saved.range],['done',true,path.join(l.outputDir,'run-done.wav'),l.base.subtitleHash,'media-abc',{start:0,end:60}],'the result keeps the source binding that was pinned at start');
  assert.deepEqual(fs.readFileSync(path.join(l.outputDir,'run-done.wav')),before,'recovery never rewrites the audio');
  assert.equal(b.recover('run-done').replayed,true);assert.equal(stateOf(b,'run-done'),'completed');assert.equal(b.list().runs.find(item=>item.id==='run-done').recovered,true);
 }finally{l.close();}
});

test('a completed record whose audio disappeared is reported as missing, a partial-quality result as partial; cancelled and failed stay distinct',()=>{
 const l=lab();try{
  const a=l.make('A',1111),at=id=>path.join(l.logsDir,fs.readdirSync(l.logsDir).find(n=>n.startsWith(id)));
  for(const [id,summary] of [['r-done',{result:'done',quality:{groups:[{status:'ok'}]}}],['r-miss',{result:'done'}],['r-part',{result:'done',quality:{groups:[{status:'ok'},{status:'failed'}]}}],['r-can',{result:'cancelled'}],['r-err',{result:'error',error:'boom'}]]){
   l.start(a,id);a.settle(at(id),{id,startedAt:new Date().toISOString(),...summary});if(id!=='r-miss')fs.writeFileSync(path.join(l.outputDir,id+'.wav'),l.wav(1));
  }
  a.end('r-err');const states=Object.fromEntries(a.list().runs.map(row=>[row.id,row.state]));
  assert.deepEqual(states,{'r-done':'completed','r-miss':'output-missing','r-part':'partial','r-can':'cancelled','r-err':'failed'});
 }finally{l.close();}
});

test('retry uses the pinned options, shows today\'s settings as a separate preview, refuses unverifiable input with a reason and a next step',()=>{
 const l=lab();try{
  const a=l.make('A',1111),file=l.start(a,'run-1');l.alive.delete(1111);const b=l.make('B',2222);
  const current={...l.base,profile:'fast',referenceFingerprint:'voice-A'};
  const pinnedPlan=b.plan('run-1',{settings:'pinned',current});
  assert.equal(pinnedPlan.ok,true);assert.equal(pinnedPlan.mode,'pinned');assert.deepEqual(pinnedPlan.differences,[{field:'profile',pinned:'quality',current:'fast'}]);assert.equal(pinnedPlan.pinned.profile,'quality');assert.match(pinnedPlan.note,/NEW generation/);assert.equal(pinnedPlan.attempt,2);
  const currentPlan=b.plan('run-1',{settings:'current',current});assert.equal(currentPlan.mode,'current');assert.notEqual(currentPlan.token,pinnedPlan.token,'today\'s settings are a separate preview and approval');
  // the voice changed
  const voice=b.plan('run-1',{settings:'pinned',current:{...current,referenceFingerprint:'voice-B'}});assert.deepEqual([voice.ok,voice.code],[false,'voice-changed']);assert.match(voice.next,/current voice/);
  assert.equal(b.plan('run-1',{settings:'current',current:{...current,referenceFingerprint:'voice-B'}}).ok,true,'with today\'s settings the voice change is shown, not hidden');
  // source verification
  fs.writeFileSync(path.join(l.inputDir,'run-1','Türkçe.srt'),'changed');assert.equal(b.plan('run-1',{current}).code,'source-changed');
  fs.rmSync(path.join(l.inputDir,'run-1'),{recursive:true});assert.deepEqual([b.plan('run-1',{current}).code,!!b.plan('run-1',{current}).next],['source-missing',true]);
  // legacy, active, chapter, selection
  fs.writeFileSync(path.join(l.logsDir,'legacy-1.json'),JSON.stringify({id:'legacy',result:'error',startedAt:'2020-01-01T00:00:00Z'}));assert.equal(b.plan('legacy',{current}).code,'legacy-record');
  const live=l.make('C',1111);l.alive.add(1111);l.start(live,'run-live');assert.equal(b.plan('run-live',{current}).code,'not-retryable');
  l.start(a,'run-book',{pinned:{narration:true}});l.alive.delete(1111);assert.equal(b.plan('run-book',{current}).code,'chapter-run');
  l.start(a,'run-takes',{pinned:{groupTakesCount:2}});assert.equal(b.plan('run-takes',{current}).code,'selection-unrecoverable');
  assert.equal(b.plan('nope',{current}).code,'unknown-run');
 }finally{l.close();}
});

test('a retry approval starts exactly one generation: double click, concurrent approval, lost reply, a newer preview and changed settings',async()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-1');l.alive.delete(1111);const b=l.make('B',2222);const current={...l.base};
  const started=[];let release;const gate=new Promise(resolve=>{release=resolve;});
  const start=async(request,trusted)=>{started.push({request,trusted});await gate;return {ok:true};};
  const p1=b.plan('run-1',{current}),first=b.approve(p1.token,{newId:'run-2',start,current}),second=b.approve(p1.token,{newId:'run-3',start,current});
  assert.deepEqual(await second,{ok:false,code:'pending',pending:true,error:(await second).error});assert.equal(started.length,1,'the concurrent duplicate never reaches the start');
  release();const done=await first;assert.deepEqual([done.ok,done.runId,done.retryOf,done.attempt],[true,'run-2','run-1',2]);
  const again=await b.approve(p1.token,{newId:'run-4',start,current});assert.deepEqual([again.ok,again.replayed,again.runId],[true,true,'run-2']);assert.equal(started.length,1,'a lost reply and repeat start nothing');
  // what was started: pinned options and a trusted input that the renderer never supplied
  assert.deepEqual([started[0].request.profile,started[0].request.id,started[0].request.range,started[0].trusted.retryOf,started[0].trusted.sourceIdentity,started[0].trusted.pronunciations],['quality','run-2',{start:0,end:60},'run-1','media-abc',[{from:'Newton',to:'Nyutin'}]]);
  assert.equal(path.basename(started[0].trusted.srt),'Türkçe.srt');assert.doesNotMatch(JSON.stringify(started[0].request),/Users|\.srt/);
  // a newer preview invalidates the older approval
  const older=b.plan('run-1',{current}),newer=b.plan('run-1',{current});
  assert.equal((await b.approve(older.token,{newId:'run-5',start,current})).code,'expired');assert.equal(started.length,1);
  // settings changed after the preview
  const outdated=await b.approve(newer.token,{newId:'run-6',start,current:{...current,profile:'fast'}});assert.deepEqual([outdated.ok,outdated.code],[false,'preview-outdated']);assert.equal(started.length,1);
  // a failed start consumes the approval: it may have left a partial run, so a new preview is required
  const failing=b.plan('run-1',{current}),failed=await b.approve(failing.token,{newId:'run-7',start:async()=>({ok:false,error:'busy'}),current});assert.deepEqual([failed.ok,failed.code],[false,'start-failed']);
  assert.equal((await b.approve(failing.token,{newId:'run-8',start,current})).code,'expired');assert.equal(started.length,1);
  // the source changing between preview and approval refuses at the boundary
  const late=b.plan('run-1',{current});fs.writeFileSync(path.join(l.inputDir,'run-1','Türkçe.srt'),'edited');
  assert.equal((await b.approve(late.token,{newId:'run-9',start,current})).code,'source-changed');assert.equal(started.length,1);
 }finally{l.close();}
});

test('two service instances over one record store: before close, after close, torn records and repeated events',()=>{
 const l=lab();try{
  const a=l.make('A',1111),file=l.start(a,'run-1');
  const b=l.make('B',2222);assert.equal(stateOf(b,'run-1'),'running-elsewhere');
  a.end('run-1');assert.equal(stateOf(b,'run-1'),'uncertain','a clean end without a terminal record is unsettled, not running and not interrupted');
  a.settle(file,{id:'run-1',result:'cancelled',startedAt:new Date().toISOString()});assert.equal(stateOf(b,'run-1'),'cancelled');
  a.settle(file,{id:'run-1',result:'running'});assert.equal(stateOf(b,'run-1'),'cancelled','a repeated start event after the end changes nothing');
  assert.equal(fs.existsSync(path.join(l.logsDir,'instances','A.json')),false,'a clean end removes the instance lease');
  assert.deepEqual(fs.readdirSync(l.logsDir).filter(n=>n.endsWith('.tmp')),[],'no temporary files are left behind');
 }finally{l.close();}
});

test('pinned and current previews coexist; approving one closes its sibling so a second click cannot start another attempt',async()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-1');l.alive.delete(1111);const b=l.make('B',2222),current={...l.base,profile:'fast'};
  const pinned=b.plan('run-1',{settings:'pinned',current}),today=b.plan('run-1',{settings:'current',current});
  let starts=0;const start=async()=>{starts++;return {ok:true};};
  assert.equal((await b.approve(pinned.token,{newId:'n1',start,current})).ok,true);
  assert.equal((await b.approve(today.token,{newId:'n2',start,current})).code,'expired');assert.equal(starts,1);
 }finally{l.close();}
});

test('being busy refuses a new approval without consuming it, while a settled approval still replays',async()=>{
 const l=lab();try{
  const a=l.make('A',1111);l.start(a,'run-1');l.alive.delete(1111);const b=l.make('B',2222),current={...l.base};
  const plan=b.plan('run-1',{current});let busy=true,starts=0;const start=async()=>{starts++;return {ok:true};};
  assert.equal((await b.approve(plan.token,{newId:'n1',start,current,busy:()=>busy})).code,'busy');assert.equal(starts,0);
  busy=false;assert.equal((await b.approve(plan.token,{newId:'n1',start,current,busy:()=>busy})).ok,true);busy=true;
  assert.equal((await b.approve(plan.token,{newId:'n2',start,current,busy:()=>busy})).replayed,true,'replay does not need a free slot');assert.equal(starts,1);
 }finally{l.close();}
});

test('a done record that carries a non-zero worker exit is partial with its reason, never a clean completion',()=>{
 const l=lab();try{
  const a=l.make('A',1111),file=l.start(a,'run-1');a.settle(file,{id:'run-1',startedAt:new Date().toISOString(),result:'done',exitCode:3,quality:{groups:[{status:'ok'}]}});a.end('run-1');fs.writeFileSync(path.join(l.outputDir,'run-1.wav'),l.wav(1));
  const row=a.list().runs[0];assert.deepEqual([row.state,row.reason?.code],['partial','exit-after-complete']);
  assert(a.detail('run-1').why.some(item=>item.code==='exit-after-complete'));
 }finally{l.close();}
});

test('Assistant run facts never forward raw worker errors containing private paths or credentials',()=>{
 const {createVoiceRunsApi}=require('../src/assistant-voice-runs');
 const item={id:'run-a',state:'failed',label:'Episode',pinned:{},output:{state:'missing'},error:'EACCES: C:/private-personal-path/file.wav Authorization: Bearer PRIVATE_TOKEN'};
 const api=createVoiceRunsApi({ledger:{list:()=>({runs:[item],unreadable:[],orphans:[]}),sourceIdentityOf:()=>null}});
 const facts=api.list();const text=JSON.stringify(facts);assert(!text.includes('private-personal-path'));assert(!text.includes('PRIVATE_TOKEN'));assert.equal(facts.runs[0].error.code,'EACCES');assert(item.error.includes('PRIVATE_TOKEN'),'the original local record is preserved');
});
