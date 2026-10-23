const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dub523-'));
const tick = async () => { for (let i=0; i<8; i++) await Promise.resolve(); };
const checks = [];
function load(file, timers) {
  const filename = path.resolve(__dirname, '..', file), module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'), {
    require:createRequire(filename), module, exports:module.exports, process,
    setTimeout:timers.setTimeoutFn, clearTimeout:timers.clearTimeoutFn,
  }, {filename});
  return module.exports;
}
function setup(kind) {
  let timeout, owned, kills=0, directKills=0;
  const child = new EventEmitter(); child.pid=123; child.exitCode=child.signalCode=null;
  child.stdout=new EventEmitter(); child.stderr=new EventEmitter();
  child.stdout.setEncoding=child.stderr.setEncoding=child.stderr.resume=()=>{};
  child.kill=()=>{directKills++;child.signalCode='SIGKILL';return true;};
  const stages=[];
  const timers={setTimeoutFn:fn=>{timeout=fn;return {unref(){}};},clearTimeoutFn:()=>{}};
  const options={source:'source.wav',srt:'captions.srt',start:5,end:25,range:null,sample:false,grouping:'akici',strength:'balanced',
    output:path.join(root,kind+'.wav'),reference:path.join(root,kind+'.wav'),transcript:path.join(root,kind+'.txt'),
    appRoot:root,userData:root,python:'python',downloadPython:'python',ffmpeg:'ffmpeg',
    spawn:()=>child,environment:()=>({}),onProcess:p=>{owned=p;},status:s=>stages.push(s),isCancelled:()=>false,
    terminate:async()=>{kills++;return false;},...timers};
  fs.writeFileSync(options.output,require('./helpers/wav-fixture')());
  fs.writeFileSync(options.transcript,'Reference transcript.');
  const [file,method]=kind==='reference' ? ['src/voice-reference.js','prepareVoiceReference']
    : kind==='prosody' ? ['src/dub-prosody.js','prepareProsody'] : ['src/dub-background.js','prepareBackground'];
  const pending=load(file,timers)[method](options);
  let settled=false;
  const result=pending.then(()=>{settled=true;return true;},()=>{settled=true;return false;});
  return {child,options,result,stages,timeout:()=>timeout(),get owned(){return owned;},get kills(){return kills;},
    get directKills(){return directKills;},get settled(){return settled;}};
}
fs.mkdirSync(path.join(root,'backend/separator-venv/Scripts'),{recursive:true});
fs.writeFileSync(path.join(root,'backend/separator-venv/Scripts/python.exe'),'fixture');
checks.push(['reference timeout retains ownership and delegates the whole tree stop',async()=>{
  const s=setup('reference');
  try {
    s.timeout();await tick();
    assert.equal(s.directKills,0,'never kill the parent before taskkill can find its descendants');
    assert.equal(s.kills,1);assert.equal(s.owned,s.child);assert.equal(s.settled,false);
    assert(s.stages.includes('stop_failed'),'failed stop must remain visible/retryable');
  } finally {s.child.emit('close',0);await s.result;}
  assert.equal(s.owned,null);assert.equal(await s.result,false,'expired work cannot become successful');
}]);
for (const kind of ['reference','prosody','background']) checks.push([kind+' runtime error cannot release a live worker',async()=>{
  const s=setup(kind);
  try {
    s.child.emit('error',Object.assign(new Error('kill EPERM'),{code:'EPERM',syscall:'kill'}));await tick();
    assert.equal(s.settled,false,'error is not proof that the child or its pipes have closed');
    assert.equal(s.owned,s.child);assert(fs.existsSync(s.options.output));
    s.child.emit('error',new Error('retry kill EPERM'));await tick();assert.equal(s.settled,false);
  } finally {s.child.emit('close',0);await s.result;}
  assert.equal(s.owned,null);assert.equal(await s.result,false,'a runtime failure must not become success');
}]);
for (const kind of ['reference','prosody','background']) checks.push([kind+' real spawn failure closes and releases ownership',async()=>{
  const {spawn}=require('node:child_process');let owned;
  const options={source:'s',srt:'s',start:5,end:25,output:path.join(root,'missing.wav'),reference:path.join(root,'missing.wav'),transcript:path.join(root,'missing.txt'),
    appRoot:root,userData:root,python:'missing',downloadPython:'missing',ffmpeg:'missing',environment:()=>({}),isCancelled:()=>false,
    spawn:()=>spawn(path.join(root,'nonexistent-worker.exe'),[],{windowsHide:true}),onProcess:p=>{owned=p;},status:()=>{}};
  const [file,method]=kind==='reference' ? ['../src/voice-reference','prepareVoiceReference'] : kind==='prosody' ? ['../src/dub-prosody','prepareProsody'] : ['../src/dub-background','prepareBackground'];
  await assert.rejects(require(file)[method](options));assert.equal(owned,null);
}]);
(async()=>{let failed=0;for(const [name,fn] of checks){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
  console.log(`${checks.length-failed}/${checks.length} passed`);if(failed)process.exitCode=1;
})().finally(()=>fs.rmSync(root,{recursive:true,force:true}));
