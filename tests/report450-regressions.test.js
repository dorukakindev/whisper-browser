'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const security=require('../src/settings-security');
const root=path.resolve(__dirname,'..');
function temporary(fn) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'whisper-r450-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}

test('failed rollback preserves original backup and journal for later recovery',()=>temporary(dir=>{
 const a=path.join(dir,'a.json'),b=path.join(dir,'b.json');fs.writeFileSync(a,'old-a');fs.writeFileSync(b,'old-b');
 const injected={...fs,renameSync(from,to){if((from.endsWith('.tmp')&&to===b)||(from.endsWith('.bak')&&to===a))throw Object.assign(Error('fixture'),{code:'EIO'});fs.renameSync(from,to);}};
 assert.throws(()=>security.writeJsonTransaction([{filePath:a,value:{a:1}},{filePath:b,value:{b:1}}],injected,'450'));
 assert.equal(fs.readFileSync(a+'.450.bak','utf8'),'old-a');
 const journal=path.join(dir,'.whisper-settings-transaction.json');assert(fs.existsSync(journal));
 security.recoverJsonTransaction(journal);assert.equal(fs.readFileSync(a,'utf8'),'old-a');assert.equal(fs.readFileSync(b,'utf8'),'old-b');
}));
test('journal unlink failure retains commit marker across repeated recovery',()=>temporary(dir=>{
 const a=path.join(dir,'a.json'),journal=path.join(dir,'.whisper-settings-transaction.json'),marker=journal+'.450.committed';
 fs.writeFileSync(a,'new');fs.writeFileSync(marker,'committed');
 fs.writeFileSync(journal,JSON.stringify({version:1,marker,records:[{filePath:a,tmp:a+'.450.tmp',backup:a+'.450.bak',existed:false}]}));
 const injected={...fs,unlinkSync(file){if(file===journal)throw Object.assign(Error('locked'),{code:'EIO'});fs.unlinkSync(file);}};
 security.recoverJsonTransaction(journal,injected);assert(fs.existsSync(marker));
 security.recoverJsonTransaction(journal);assert.equal(fs.readFileSync(a,'utf8'),'new');
}));
test('profile secret values are removed from free text and custom endpoint path case is preserved',()=>{
 const result=security.publicSettings({translate:{apiKeyProfiles:JSON.stringify({'provider:test':'fixture-secret450'})},glossary:['fixture-secret450']});
 assert(!JSON.stringify(result).includes('fixture-secret450'));
 assert.notEqual(security.endpointIdentity({endpointPreset:'custom',customBaseUrl:'https://example.test/V1'}),security.endpointIdentity({endpointPreset:'custom',customBaseUrl:'https://example.test/v1'}));
});
test('provider scopes do not inherit Object prototype or merge insecure origins',()=>{
 const keys=require('../src/provider-api-keys');assert.equal(keys.providerKeyForScope({},'toString'),'');
 assert.notEqual(keys.providerCredentialScope('https://api.openai.com/v1'),keys.providerCredentialScope('http://api.openai.com:8080/v1'));
});
test('preload YouTube callbacks receive payload only and unsubscribe the wrapped listener',()=>{
 let api;const listeners=new Map();
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/preload.js'),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_key,value)=>api=value},webUtils:{},ipcRenderer:{on:(n,fn)=>listeners.set(n,fn),removeListener:(n,fn)=>{assert.equal(listeners.get(n),fn);listeners.delete(n);}}}),process:{env:{}}});
 for(const [method,event] of [['onYoutubeTvEvent','youtube-tv:event'],['onYoutubeEvent','youtube:event']]){
  let args;const remove=api[method]((...value)=>args=value);const payload={open:true};listeners.get(event)({sender:'private'},payload);
  assert.equal(args.length,1);assert.equal(args[0],payload);remove();assert(!listeners.has(event));
 }
});
test('drive-relative root is rejected before filesystem access on Windows',()=>{
 let accesses=0;const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/local-file-access.js'),'utf8'),{module,process:{platform:'win32'},require:name=>name==='path'?path.win32:{existsSync:()=>{accesses++;return true;},realpathSync:p=>p}});
 assert.throws(()=>module.exports.canonicalLocalPath('\\relative\\fixture.srt'));assert.equal(accesses,0);
 assert.equal(module.exports.canonicalLocalPath('C:\\fixture.srt'),'C:\\fixture.srt');
});
test('successful taskkill does not cancel the child-close watchdog',()=>{
 const {terminateProcessTree}=require('../src/process-lifecycle');const child=new EventEmitter(),killer=new EventEmitter();let timer,cleared=false,killed=0;
 Object.assign(child,{pid:42,exitCode:null,signalCode:null,kill:()=>{killed++;return true;}});
 terminateProcessTree(child,{platform:'win32',spawn:()=>killer,setTimeoutFn:fn=>{timer=fn;return{};},clearTimeoutFn:()=>{cleared=true;}});
 killer.emit('exit',0);assert.equal(cleared,false);timer();assert.equal(killed,1);
});
test('provider probe accepts IPv6 and correctly cancels oversized bodies/classifies body timeouts',async()=>{
 const probe=require('../src/translation-provider-probe');assert(probe.isSafeProbeEndpoint('http://[::1]:8000/v1'));
 let cancelled=false;const options={endpoint:'http://localhost:8000/v1',model:'fixture'};
 let result=await probe.probeTranslationProvider({...options,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>999999},body:{cancel:async()=>{cancelled=true;}}})});
 assert.equal(result.code,'invalid_response');assert.equal(cancelled,true);
 result=await probe.probeTranslationProvider({...options,fetchImpl:async()=>({ok:true,status:200,arrayBuffer:async()=>{throw Object.assign(Error('timeout'),{name:'AbortError'});}})});
 assert.equal(result.code,'timeout');
});
test('Unicode search handles combining marks and refuses excessive work without partial results',()=>{
 const search=require('../src/subtitle-find-replace');assert.deepEqual(search.literalRanges('x\u0301','x'),[{start:0,end:2}]);
 assert.throws(()=>search.literalRanges('x','x'.repeat(257)),/SEARCH_LIMIT/);
 assert.throws(()=>search.literalRanges('\uFB00'+'a'.repeat(10000),'b'.repeat(250)),/SEARCH_LIMIT/);
});
test('subtitle output metadata fails closed and mismatched source hashes cannot pair',()=>{
 const c=require('../src/subtitle-output-contract');const invalid=c.selectOutputs({outputs:[{path:'translated.srt',role:'invalid'}],files:['translated.srt']});assert.equal(invalid.source,null);
 const result=c.selectOutputs({outputs:[{path:'a.srt',role:'source',sourceId:'same',sourceHash:'a'},{path:'b.srt',role:'translation',sourceId:'same',sourceHash:'b'}]});assert.equal(result.translation,null);
});
test('grapheme boundaries, negative scaled numbers and duplicate counts are protected',()=>{
 const l=require('../src/subtitle-sentence-layout');assert.equal(l.fitTranslationParts('ก้',[{start:0,end:2},{start:2,end:4}]),null);
 assert(l.translationMeaningIssues('-5000000 people','5 milyon insan').includes('number_mismatch'));
 assert(l.translationMeaningIssues('5 cats and 5 dogs','5 kedi ve köpek').includes('number_mismatch'));
 assert.deepEqual(l.translationMeaningIssues('5 cats and 5 dogs','5 kedi ve 5 köpek'),[]);
});
test('timeline detects nested overlap, invalid timestamps and same-length content changes',()=>{
 const scan=require('../src/renderer/timeline-issue-scan');const result=scan.scan([{start:0,end:10,text:'a'},{start:1,end:2,text:'b'},{start:3,end:4,text:'c'}]);assert(result.some(x=>x.i===2&&x.kind==='overlap'));
 assert(scan.scan([{start:NaN,end:Infinity,text:'x'}]).some(x=>x.kind==='invalid'));
 assert.notEqual(scan.cueSignature([{start:0,end:1,text:'cat'}]),scan.cueSignature([{start:0,end:1,text:'dog'}]));
});
function worklet(){let Processor;const messages=[],scope={sampleRate:44100,currentTime:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_n,p)=>Processor=p};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/renderer/live-asr-worklet.js'),'utf8'),scope);const p=new Processor();p.port.onmessage({data:{type:'sync',time:0,contextTime:0,rate:1}});return{p,scope,messages};}
test('explicit worklet flush resets fractional resampler even before a complete sample',()=>{
 const {p}=worklet();p.process([[new Float32Array([.5])]]);assert(p.weight>0);p.port.onmessage({data:{type:'flush'}});assert.equal(p.weight,0);assert.equal(p.sum,0);
});
test('worklet separates missing-input intervals and preserves opposite-phase speech',()=>{
 const {p,scope}=worklet(),positive=new Float32Array(128).fill(.1),negative=new Float32Array(128).fill(-.1);
 p.process([[positive,negative]]);assert(p.peak>.09);const first=p.length;p.process([]);scope.currentTime=2;p.process([[positive]]);assert.equal(p.length,first);assert(p.offset>1.9);
});
test('configured worklet bounds transferred chunks until acknowledgement',()=>{
 const {p,messages}=worklet();p.port.onmessage({data:{type:'configure'}});
 const fill=()=>{p.samples.fill(12000);p.length=8000;p.peak=.4;p.flush();};for(let i=0;i<5;i++)fill();
 assert.equal(messages.filter(m=>m.type==='chunk').length,4);assert(messages.some(m=>m.reason==='backpressure'));
 p.port.onmessage({data:{type:'ack',id:1}});fill();assert.equal(messages.filter(m=>m.type==='chunk').length,5);
});
test('live monitor requires consecutive slow results and does not claim backlog has cleared',()=>{
 const {createLiveAsrRealtimeMonitor}=require('../src/live-asr-realtime');const m=createLiveAsrRealtimeMonitor();
 for(const rtf of [1.2,.9,1.2,.9,1.2])assert.equal(m.observe({rtf,audio_seconds:8}),null);
 m.observe({rtf:1.2,audio_seconds:8});assert(m.observe({rtf:1.2,audio_seconds:8}));
 assert(!m.observe({rtf:.7,audio_seconds:8}).message.includes('yetişti'));
});
test('interleaved duplicate chunks cannot change language evidence twice',()=>{
 const s=require('../src/live-asr-audio-switch').createLiveAsrAudioSwitch();s.observe('en','a');s.observe('tr','b');s.observe('en','c');s.observe('tr','b');assert.equal(s.snapshot().pendingCount,0);
});
test('reference timeout settles even if termination never resolves',async()=>{
 let timer;const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'src/voice-reference.js'),'utf8'),{module,require:name=>name==='node:fs'?fs:path,setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}});
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr={resume(){}};child.kill=()=>false;let owner;
 const promise=module.exports.prepareVoiceReference({source:'fixture',start:0,end:3,reference:'unused',transcript:'unused',appRoot:root,python:'fixture',ffmpeg:'fixture',spawn:()=>child,terminate:()=>new Promise(()=>{}),environment:()=>({}),onProcess:p=>owner=p,status(){},isCancelled:()=>false});
 timer();await assert.rejects(promise,error=>error.processActive===true);assert.equal(owner,child);
});

test('concurrent dub attach and remove keep exactly one owner and clean up synchronous mute failures',async()=>{
 const Dub=require('../src/renderer/browser-dub-audio');const active=new Set();let next=0;const saveSet=global.setInterval,saveClear=global.clearInterval;
 global.setInterval=()=>{active.add(++next);return next;};global.clearInterval=id=>active.delete(id);
 const c={mode:'browser',tabId:'fixture',mediaKey:'fixture',generation:1};
 const audio={readyState:4,paused:true,duration:100,currentTime:0,addEventListener(){},pause(){this.paused=true;},load(){},removeAttribute(){}};
 let mode='ok';const dub=new Dub({audio,context:()=>c,mute:()=>{if(mode==='throw')throw Error('fixture');return {ok:true};},urls:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}}});
 try{
  const result=await Promise.all([dub.attach({name:'one'},c),dub.attach({name:'two'},c)]);assert.deepEqual(result,[false,true]);assert.equal(active.size,1);
  await dub.remove();assert.equal(active.size,0);
  const pending=dub.attach({name:'cancelled'},c);await dub.remove();assert.equal(await pending,false);assert.equal(active.size,0);
  mode='throw';assert.equal(await dub.attach({name:'bad'},c),false);assert.equal(dub.session,null);assert.equal(active.size,0);
 }finally{await dub.remove();global.setInterval=saveSet;global.clearInterval=saveClear;}
});
test('completed voice migration does not resurrect files deleted from the destination',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'whisper-migration450-'));try{
  const legacy=path.join(dir,'user','Referans sesler');fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'fixture.txt'),'fixture');
  const app={getPath:n=>path.join(dir,n==='downloads'?'downloads':'user')};const {prepareVoiceStorage}=require('../src/voice-storage');
  const folders=await prepareVoiceStorage(app);const target=path.join(folders.references,'fixture.txt');fs.unlinkSync(target);await prepareVoiceStorage(app);assert.equal(fs.existsSync(target),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('late AbortError after pause/resume cannot destroy a newer play in the same dub session',async()=>{
 const Dub=require('../src/renderer/browser-dub-audio'),pending=[];
 const c={mode:'browser',tabId:'fixture',mediaKey:'fixture',generation:1};
 const audio={readyState:4,paused:true,duration:100,currentTime:0,addEventListener(){},pause(){this.paused=true;},load(){},removeAttribute(){},play(){this.paused=false;return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};
 const dub=new Dub({audio,context:()=>c,mute:()=>({ok:true}),urls:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}}});
 try{
  await dub.attach({name:'fixture'},c);dub.update({currentTime:3,paused:false});
  dub.update({currentTime:3,paused:true});dub.update({currentTime:3,paused:false});assert.equal(pending.length,2);
  pending[0].reject(Object.assign(Error('interrupted'),{name:'AbortError'}));await new Promise(setImmediate);
  assert(dub.session);assert.equal(dub.session.playPending,true);assert.equal(audio.paused,false);
  pending[1].resolve();await new Promise(setImmediate);assert.equal(dub.session.playPending,false);
 }finally{await dub.remove();}
});
