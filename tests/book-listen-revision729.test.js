"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerMediaWorkflows}=require('../src/media-workflows');
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'book-revision-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=new EventEmitter(),sender={id:1};app.getPath=()=>root;
 const source=path.join(root,'book.pdf'),wav=path.join(root,'voice.wav');fs.writeFileSync(source,'controlled source');fs.writeFileSync(wav,require('./helpers/wav-fixture')(24000));
 let handler;const service=registerMediaWorkflows({app,ipcMain:{handle:(_,fn)=>handler=fn},authorized:e=>e.sender===sender,owner:()=>null,resolvePdf:()=>({filePath:source,numPages:1,title:'Revision'}),grantSubtitle(){},grantMedia(){}});
 const call=(action,data={})=>handler({sender},{action,...data});
 const imported=await call('book-from-reader',{pdfHash:'revision',numPages:1,pages:[{pageNumber:1,text:'This is the reviewed passage.'}]});assert(imported.ok,imported.error);const id=imported.project.id;
 async function capture(){const prep=await call('book-prepare',{id,chapter:0});assert(prep.ok,prep.error);service.capture({id:prep.request.id,path:wav,quality:{groups:[{key:'1',text:'This is the reviewed passage.',audioStart:0,audioEnd:.5,status:'review'}]}});return (await call('book-open',{id})).project.chapters[0];}
 const first=await capture();return {call,id,wav,capture,first};
}
test('changed chapter audio cannot be opened with old text highlights',async t=>{
 const f=await fixture(t),before=await f.call('book-listen',{id:f.id,chapter:0});assert(before.ok);
 const bytes=fs.readFileSync(before.path);bytes[bytes.length-1]=3;fs.writeFileSync(before.path,bytes);
 const after=await f.call('book-listen',{id:f.id,chapter:0});
 assert.equal(after.ok,false,'A changed WAV must not be exposed with timings of the old speech');
});
test('a stale review player cannot request a newer output with old group timings',async t=>{
 const f=await fixture(t),bytes=fs.readFileSync(f.wav);bytes[bytes.length-1]=4;fs.writeFileSync(f.wav,bytes);const next=await f.capture();
 const stale=await f.call('book-listen',{id:f.id,chapter:0,outputId:f.first.output,textHash:f.first.textHash});
 assert.equal(stale.ok,false,'The old review group must not play a new revision');
 const fresh=await f.call('book-listen',{id:f.id,chapter:0,outputId:next.output,textHash:next.textHash});assert(fresh.ok,fresh.error);
});
test('a generation completed during playback hashing cannot return a retired revision',async t=>{
 const f=await fixture(t),{PassThrough}=require('node:stream'),original=fs.createReadStream;
 const gate=new PassThrough();let reading=false;
 fs.createReadStream=()=>{reading=true;return gate;};
 try {
  const pending=f.call('book-listen',{id:f.id,chapter:0});
  assert(reading,'Playback verification must stream the chapter');
  const old=fs.readFileSync(f.wav),next=Buffer.from(old);next[next.length-1]=5;fs.writeFileSync(f.wav,next);await f.capture();
  gate.end(old);const result=await pending;assert.equal(result.ok,false);
  assert.match(result.error,/Audio changed|Ses değişti/);
 } finally {fs.createReadStream=original;gate.destroy();}
});
