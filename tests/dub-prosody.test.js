const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareProsody}=require('../src/dub-prosody');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-'));
let child,call,proc,status=[];
const options={source:'source.mp4',srt:'captions.srt',output:path.join(folder,'delivery.json'),range:{start:300,end:600},
  sample:true,grouping:'akici',strength:'balanced',appRoot:folder,python:'python',ffmpeg:'ffmpeg',
  environment:()=>({}),terminate:async()=>true,isCancelled:()=>false,onProcess:value=>{proc=value;},status:value=>status.push(value),
  spawn:(exe,args,opts)=>{
    call={exe,args,opts}; child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
    child.stdout.setEncoding=()=>{};child.stderr.resume=()=>{};return child;
  }};
(async()=>{
  const pending=prepareProsody(options);
  assert.equal(proc,child);assert.equal(call.opts.windowsHide,true);
  assert.deepEqual(call.args.slice(call.args.indexOf('--start')),['--start','300','--end','600','--sample']);
  child.stdout.emit('data','DUB_PRO');child.stdout.emit('data','SODY 1/3\n');
  assert.deepEqual(status,['1/3']);
  fs.writeFileSync(options.output,'{}');child.emit('close',0);await pending;assert.equal(proc,null);
  fs.unlinkSync(options.output);
  const failed=prepareProsody(options);child.stdout.emit('data','DUB_PROSODY_ERROR MULTIPLE_AUDIO_TRACKS\n');
  child.emit('close',1);await assert.rejects(failed,error=>error.code==='MULTIPLE_AUDIO_TRACKS');
  let cancelled=false;
  const stopped=prepareProsody({...options,isCancelled:()=>cancelled});cancelled=true;
  fs.writeFileSync(options.output,'{}');child.emit('close',0);await assert.rejects(stopped);
  assert.equal(proc,null);
  console.log('dub-prosody: clip/sample argv, progress, failure and cancelled completion passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(folder,{recursive:true,force:true}));
