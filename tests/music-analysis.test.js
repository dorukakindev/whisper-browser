'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {selection,createService,register}=require('../src/music-analysis-service');
test('range validation rejects out of track and unbounded requests',()=>{
  assert.deepEqual(selection({start:3,end:7},10),{start:3,end:7});
  for(const input of [{start:-1},{start:8,end:7},{end:5000},{start:'abc'},{end:0}])assert.throws(()=>selection(input,10));
  assert.throws(()=>selection({},NaN));assert.throws(()=>selection({},2000));
});
test('exact selected file, stage ownership, cache reuse and real cancellation contract',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-service-test-'));
  const file=path.join(root,'Türkçe şarkı.wav');fs.writeFileSync(file,'fixture');
  let block=false,calls=0;
  const measured={version:'music-dsp-1',points:[{time:0,db:-12}],waveform:[[-.2,.2]],duration:4};
  const runner=async(exe,args,input,signal)=>{
    calls++;
    if(signal.aborted)throw Error('aborted');
    if(block)await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
    if(exe==='probe')return JSON.stringify({format:{duration:10}});
    if(exe==='ffmpeg'){fs.writeFileSync(args.at(-1),'fake pcm');return '';}
    return JSON.stringify(measured);
  };
  const service=createService({userData:()=>root,ffprobe:()=> 'probe',ffmpeg:()=> 'ffmpeg',python:()=> 'python',run:runner});
  try{
    await assert.rejects(()=>service.start({sourceId:'invented'}));
    const source=service.remember(file);assert(source.url.includes('%C3%BC'));
    await assert.rejects(()=>service.start({mode:'search',sourceId:source.id,references:[{id:'invented',range:[0,2]}]}),/Reference expired/);
    await assert.rejects(()=>service.start({mode:'search',sourceId:source.id,references:Array(4).fill({id:source.id,range:[0,2]})}),/1–3/);
    await assert.rejects(()=>service.start({mode:'search',sourceId:source.id,references:[{id:source.id,range:[0,2]},{id:source.id,range:[0,2]}]}),/Duplicate/);
    assert.equal(service.status().state,'idle');
    const wait=async()=>{for(let n=0;n<100&&service.status().state==='running';n++)await new Promise(r=>setTimeout(r,10));assert.notEqual(service.status().state,'running');};
    await service.start({sourceId:source.id,start:2,end:6});
    await assert.rejects(()=>service.start({sourceId:source.id}));await wait();
    assert.equal(service.status().state,'completed');assert.deepEqual(service.status().result.range,{start:2,end:6});assert.equal(calls,3);
    await service.start({sourceId:source.id,start:2,end:6});await wait();assert.equal(calls,4);assert.equal(service.status().result.cached,true);
    fs.appendFileSync(file,'changed');await service.start({sourceId:source.id,start:2,end:6});await wait();assert.equal(calls,7);
    block=true;await service.start({sourceId:source.id});service.cancel();await service.close();assert.equal(service.status().state,'cancelled');
  }finally{await service.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('music IPC rejects unauthorized sender before reading paths or constructing sessions',async()=>{
  let handler;register({ipcMain:{handle:(name,fn)=>{assert.equal(name,'music-analysis:request');handler=fn;}},app:{on(){}},authorized:()=>false});
  assert.deepEqual(await handler({sender:{}},{action:'library',id:'x'}),{ok:false,error:'Unauthorized'});
});
