const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {prepareBackground}=require('../src/dub-background');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-background-'));
fs.mkdirSync(path.join(root,'backend/separator-venv/Scripts'),{recursive:true});fs.writeFileSync(path.join(root,'backend/separator-venv/Scripts/python.exe'),'fixture');
(async()=>{
  let child,args,owned;const stages=[];
  const options={source:'video.mp4',srt:'test.srt',range:{start:600,end:1200},output:path.join(root,'out.wav'),appRoot:root,userData:root,
    downloadPython:'python.exe',ffmpeg:'ffmpeg.exe',environment:()=>({}),isCancelled:()=>false,status:s=>stages.push(s),onProcess:p=>{owned=p;},
    spawn:(_exe,a)=>{args=a;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=child.stderr.setEncoding=()=>{};return child;}};
  const ready=prepareBackground(options);
  assert.equal(args[args.indexOf('--start')+1],'600');assert.equal(args[args.indexOf('--end')+1],'1200');assert.equal(owned,child);
  child.stdout.emit('data','DUB_BACKGROUND separate_gpu\n');assert.deepEqual(stages,['separate_gpu']);
  fs.writeFileSync(options.output,'audio');child.emit('close',0);assert.equal(await ready,options.output);assert.equal(owned,null);
  const stopped=prepareBackground(options);child.emit('close',1);await assert.rejects(stopped,/ayrıştırılamadı/);assert.equal(owned,null);
  assert.throws(()=>prepareBackground({...options,isCancelled:()=>true}),/İptal/);
  console.log('dub-background: bounded range, GPU status and process ownership passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
