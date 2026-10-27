'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {store}=require('../src/music-listening');
test('blind listening saves only current validated choices without audio paths and rejects stale/duplicate trials',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-listening-'));try{
 const s=store(()=>dir),job={id:'job1',mode:'search',state:'completed',result:{intent:'gentle music',results:[{id:'x',title:'X',score:.7,matchedRange:[1,11],url:'file:///private.wav'},{id:'y',title:'Y',score:.6,matchedRange:[2,12]}]}};
 assert.deepEqual(s.read(),[]);assert.throws(()=>s.save(job,{jobId:'old',ids:['x','y'],choice:'a'}));assert.throws(()=>s.save(job,{jobId:'job1',ids:['x','x'],choice:'a'}));assert.throws(()=>s.save(job,{jobId:'job1',ids:['x','z'],choice:'a'}));assert.throws(()=>s.save(job,{jobId:'job1',ids:['x','y'],choice:'auto'}));assert.equal(s.read().length,0);
 const row=s.save(job,{jobId:'job1',ids:['y','x'],choice:'b'});assert.deepEqual(row.ids,['y','x']);assert.equal(s.read()[0].choice,'b');assert(!JSON.stringify(s.read()).includes('private.wav'));assert.throws(()=>s.save(job,{jobId:'job1',ids:['x','y'],choice:'tie'}));
 fs.writeFileSync(path.join(dir,'music-listening.json'),'broken');assert.throws(()=>s.read());assert.throws(()=>s.save({...job,id:'job2'},{jobId:'job2',ids:['x','y'],choice:'tie'}));assert.equal(fs.readFileSync(path.join(dir,'music-listening.json'),'utf8'),'broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
