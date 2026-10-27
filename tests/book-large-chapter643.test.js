'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {EventEmitter}=require('node:events');
const {registerMediaWorkflows}=require('../src/media-workflows');
const {findTestPython}=require('./python-runtime');
test('An accepted long Turkish chapter remains plannable, capturable and available as a voice take',async t=>{
 const python=findTestPython();assert(python,'Project Python is required for the actual model-free plan');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'book-large-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=new EventEmitter(),handlers={},sender={},errors=[];app.getPath=()=>root;app.on('media-workflow-error',e=>errors.push(e));
 const source=path.join(root,'kitap.pdf'),wav=path.join(root,'speech.wav');fs.writeFileSync(source,'fixture');fs.writeFileSync(wav,require('./helpers/wav-fixture')());
 const service=registerMediaWorkflows({app,ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:e=>e.sender===sender,owner:()=>null,resolvePdf:()=>({filePath:source,numPages:1,title:'Uzun bölüm'}),grantSubtitle(){},grantMedia(){}});
 const call=(action,r={})=>handlers['media-workflows:request']({sender},{action,...r});
 const sentence='Bu bölüm boyunca düşünceler, özgün anlatım ve anlam bütünlüğü korunarak okunmalıdır. ';
 const text=sentence.repeat(Math.floor(899000/sentence.length));assert(text.length>850000&&text.length<900000);
 const imported=await call('book-from-reader',{pdfHash:'fixture',numPages:1,pages:[{pageNumber:1,text}]});assert(imported.ok,imported.error);const id=imported.project.id;
 const planSource=await call('book-plan-source',{id,chapter:0});assert(planSource.ok,planSource.error);
 const plan=JSON.parse(cp.execFileSync(python,[path.join(__dirname,'../tools/voxcpm2/dub_plan.py'),planSource.srt,'--grouping','akici'],{encoding:'utf8',maxBuffer:5000000}));
 assert(plan.groups.length>1000&&plan.groups.length<=5000);assert(plan.groups.map(g=>g.key).join(';').length>12000,'Fixture must exceed the Windows inline force-list budget');
 assert.equal(plan.groups.map(g=>g.text).join(' '),text.trim(),'The large plan must preserve the complete accepted chapter');
 const prep=await call('book-prepare',{id,chapter:0});assert(prep.ok,prep.error);
 service.capture({id:prep.request.id,path:wav,quality:{groups:plan.groups.map((g,i)=>({key:g.key,text:g.text,audioStart:i/10000,audioEnd:(i+1)/10000,status:'ready'}))}});
 assert.deepEqual(errors,[]);const chapter=(await call('book-open',{id})).project.chapters[0];assert.equal(chapter.status,'ready');assert.equal(chapter.groups.length,plan.groups.length);
 const takes=await call('book-takes',{id,chapter:0});assert(takes.ok,takes.error);assert.equal(takes.takes.length,1);assert.equal(takes.takes[0].available,true);
 t.diagnostic(JSON.stringify({characters:text.length,srtBytes:fs.statSync(planSource.srt).size,groups:plan.groups.length,inlineForceCharacters:plan.groups.map(g=>g.key).join(';').length}));
 // The tiny WAV and controlled ready report test storage, never real speech quality.
});
