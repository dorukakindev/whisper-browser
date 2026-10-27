"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerMediaWorkflows}=require('../src/media-workflows');
test('An incomplete or unavailable quality report cannot approve an audiobook chapter from a ready subset',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'book-quality-scope-')),app=new EventEmitter(),sender={id:91},handlers={};app.getPath=()=>root;
 const source=path.join(root,'kitap.pdf'),wav=path.join(root,'çıktı.wav');fs.writeFileSync(source,'controlled source');fs.writeFileSync(wav,require('./helpers/wav-fixture')());
 const service=registerMediaWorkflows({app,ipcMain:{handle:(name,fn)=>handlers[name]=fn},authorized:e=>e.sender===sender,owner:()=>null,resolvePdf:()=>({filePath:source,numPages:1,title:'Scope'}),grantSubtitle(){},grantMedia(){}});
 const call=(action,args={})=>handlers['media-workflows:request']({sender},{action,...args});
 try{
  for(const flag of ['qualityIncomplete','qualityUnavailable']){
   const imported=await call('book-from-reader',{pdfHash:'fixture',numPages:1,pages:[{pageNumber:1,text:'Bu bölümün tamamının dinlenmesi gerekir.'}]});assert(imported.ok,imported.error);const id=imported.project.id;
   const prep=await call('book-prepare',{id,chapter:0});assert(prep.ok,prep.error);
   service.capture({id:prep.request.id,path:wav,[flag]:true,quality:{groups:[{key:'0',text:'Sadece bir parça.',audioStart:0,audioEnd:.1,status:'ready'}]}});
   const c=(await call('book-open',{id})).project.chapters[0];assert(c.output,'Completed audio remains accessible');assert.equal(c.status,'review',flag+' must not approve a ready subset');assert.equal(c.qualityMissing,true);assert.equal(c.groups.length,1);assert.equal(c.groups[0].text,c.text);assert.equal(c.groups[0].status,'review');
   assert.equal((await call('book-export-preview',{id,chapters:[0]})).ok,false,'Unreviewed full chapter cannot export');
   const retry=await call('book-prepare',{id,chapter:0,retryGroup:{key:c.groups[0].key,output:path.basename(c.output)}});assert(retry.ok,retry.error);assert.equal(retry.retryWholeChapter,true,'A whole-chapter review marker cannot force only its synthetic group key');assert.deepEqual(retry.request.forceGroups,[]);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
