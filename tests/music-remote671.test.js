'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {create}=require('../src/music-remote-source');
test('online reference uses known catalog identity, bounded decode and removes temporary sources',async()=>{
 let args;const r=create({ffmpeg:()=> 'ffmpeg',run:async(exe,a)=>{args=a;fs.writeFileSync(a.at(-1),'decoded');}});
 const online={snapshot:ids=>{assert.deepEqual(ids,['known']);return [{id:'known',title:'Public preview',artist:'Artist'}];},samples:async(rows,folder)=>{const file=path.join(folder,'sample.mp3');fs.writeFileSync(file,'sample');return {tracks:[{path:file}]};}};
 const source=await r.prepare({kind:'deezer',id:'known'},online);assert.equal(source.metadata.origin,'deezer-preview');assert.equal(args[args.indexOf('-t')+1],'30');assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file,pipe');assert(fs.existsSync(source.file));assert(!fs.existsSync(path.join(path.dirname(source.file),'sample.mp3')));await r.release();assert(!fs.existsSync(source.file));await assert.rejects(()=>r.prepare({kind:'invented'},online));
});
test('cancelled source preparation cannot publish a partial reference',async()=>{
 let begin,folder;const ready=new Promise(r=>begin=r);const r=create({ffmpeg:()=> 'ffmpeg',run:async()=>{}}),online={snapshot:()=>[{}],samples:async(rows,dir,signal)=>{folder=dir;begin();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}};
 const pending=r.prepare({kind:'deezer',id:'known'},online);await ready;r.cancel();await assert.rejects(()=>pending);assert(!fs.existsSync(folder));
});
