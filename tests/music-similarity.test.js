'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {modelStatus,loadTracks,execute,MODEL,REVISION}=require('../src/music-similarity');
test('missing model is a capability state; malformed music library is rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-index-'));
 try{assert.equal(modelStatus(dir).ready,false);assert.deepEqual(loadTracks(dir),[]);fs.writeFileSync(path.join(dir,'media-shelf.json'),JSON.stringify({music:{path:'arbitrary'}}));assert.throws(()=>loadTracks(dir));}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('result binding accepts only library IDs and finite scores, passes only validated files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-binding-'));let payload;
 try{
  const file=path.join(dir,'track.wav');fs.writeFileSync(file,'fixture');
  fs.writeFileSync(path.join(dir,'READY.json'),JSON.stringify({model:MODEL,revision:REVISION}));
  const fd=fs.openSync(path.join(dir,'pytorch_model.bin'),'w');fs.ftruncateSync(fd,614525833);fs.closeSync(fd);
  fs.writeFileSync(path.join(dir,'media-shelf.json'),JSON.stringify({music:[{id:'yes',path:file,title:'Known'},{id:'bad',path:path.join(dir,'missing.wav')}]}));
  let grants=0;
  const result=await execute({modelDir:()=>dir,userData:()=>dir,python:()=> 'python',ffmpeg:()=> 'ffmpeg',ffprobe:()=> 'probe',grantMedia:()=>grants++},{mode:'search',source:{file,libraryId:'ref'},request:{range:[2,8]},signal:new AbortController().signal,onProgress:()=>{},runner:async(exe,args,input)=>{payload=JSON.parse(input);return JSON.stringify({results:[{id:'yes',score:.7},{id:'invented',score:1},{id:'yes',score:2}],failed:0});}});
  assert.equal(payload.tracks.length,1);assert.deepEqual(payload.range,[2,8]);assert.equal(result.results.length,1);assert.equal(result.results[0].title,'Known');assert.equal(grants,1);assert.equal(result.failed,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
