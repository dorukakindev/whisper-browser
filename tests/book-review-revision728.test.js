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
test('an old review cannot approve regenerated audio with the same group key',async t=>{
 const f=await fixture(t),bytes=fs.readFileSync(f.wav);bytes[bytes.length-1]=1;fs.writeFileSync(f.wav,bytes);const next=await f.capture();assert.notEqual(next.output,f.first.output);
 const stale=await f.call('book-approve',{id:f.id,chapter:0,key:'1',outputId:f.first.output,textHash:f.first.textHash});
 assert.equal(stale.ok,false,'The audio listened to was an older output');
 assert.equal((await f.call('book-open',{id:f.id})).project.chapters[0].groups[0].status,'review');
 const fresh=await f.call('book-approve',{id:f.id,chapter:0,key:'1',outputId:next.output,textHash:next.textHash});assert(fresh.ok,fresh.error);
});
test('audio changed outside the app cannot acquire a fresh manual approval',async t=>{
 const f=await fixture(t),listened=await f.call('book-listen',{id:f.id,chapter:0});assert(listened.ok);
 const bytes=fs.readFileSync(listened.path);bytes[bytes.length-1]=2;fs.writeFileSync(listened.path,bytes);
 const approval=await f.call('book-approve',{id:f.id,chapter:0,key:'1',outputId:f.first.output,textHash:f.first.textHash});
 assert.equal(approval.ok,false,'An unchanged filename is not evidence of unchanged speech');
 assert.equal((await f.call('book-open',{id:f.id})).project.chapters[0].groups[0].manualApproval,undefined);
});
test('approval without the listened output revision is rejected',async t=>{
 const f=await fixture(t),approval=await f.call('book-approve',{id:f.id,chapter:0,key:'1'});
 assert.equal(approval.ok,false);assert.match(approval.error,/audio changed|ses değişti/);
});
