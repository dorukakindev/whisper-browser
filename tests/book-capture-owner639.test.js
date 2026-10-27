"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {EventEmitter} = require('node:events');
const {registerMediaWorkflows} = require('../src/media-workflows');

test('An older prepared book job cannot replace a newer job or its completed audio', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'book-owner-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=new EventEmitter(), handlers={}, sender={}; app.getPath=()=>root;
  const source=path.join(root,'source.pdf'), wav=path.join(root,'speech.wav');
  fs.writeFileSync(source,'fixture'); fs.writeFileSync(wav,require('./helpers/wav-fixture')());
  const service=registerMediaWorkflows({app,ipcMain:{handle:(k,f)=>handlers[k]=f},authorized:e=>e.sender===sender,owner:()=>null,resolvePdf:()=>({filePath:source,numPages:1,title:"Book"}),grantSubtitle(){},grantMedia(){}});
  const call=(action,r={})=>handlers['media-workflows:request']({sender},{action,...r});
  const imported=await call('book-from-reader',{pdfHash:'fixture',numPages:1,pages:[{pageNumber:1,text:'A complete chapter.'}]}); assert(imported.ok,imported.error);
  const id=imported.project.id;
  const output=job=>({id:job.request.id,path:wav,quality:{groups:[{key:'1',text:'A complete chapter.',audioStart:0,audioEnd:.1,status:'ready'}]}});
  for(const olderFirst of [true,false]) {
    const old=await call('book-prepare',{id,chapter:0}), current=await call('book-prepare',{id,chapter:0});
    assert(old.ok,old.error); assert(current.ok,current.error);
    if(olderFirst) {
      service.capture(output(old));
      assert.equal((await call('book-open',{id})).project.chapters[0].activeJob?.id,current.request.id,'Late old completion must not clear the newer ownership');
    }
    service.capture(output(current));
    service.capture(output(old));
    const c=(await call('book-open',{id})).project.chapters[0];
    assert.equal(c.lastOutputId,current.request.id,'Older completion must not replace the latest accepted audio');
    assert.equal(c.activeJob,null); assert.equal(c.status,'ready');
  }
});


