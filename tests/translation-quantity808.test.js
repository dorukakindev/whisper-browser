'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),layout=require('../src/subtitle-sentence-layout'),{BrowserTranslationScheduler}=require('../src/browser-translation-scheduler');
test('spoken past quantities retain their sign and percent units stay hard under lenient scheduling',async()=>{
 for(const [source,target]of [['The value was -5.','Değer eksi beşti.'],['The value was 5.','Değer beşti.'],['It fell by 5%.','Yüzde beş düştü.']])assert.deepEqual(layout.translationBlockingIssues(source,target,'tr'),[]);
 for(const target of ['Değer eksi beşti.','Değer eksi 5 idi.'])assert(layout.translationBlockingIssues('The value was 5.',target,'tr').includes('number_mismatch'));
 assert(layout.translationBlockingIssues('The balance was 5000.','Bakiye eksi 5 bin idi.','tr').includes('number_mismatch'));
 assert(layout.translationBlockingIssues('It fell by 5%.','5 düştü.','tr').includes('percentage_mismatch'));
 const cache=new Map(),scheduler=new BrowserTranslationScheduler({lenient:true,maxAttempts:1,cache,translate:async()=> '5 düştü.'});scheduler.setSentences([{id:'one',start:0,end:2,text:'It fell by 5%.'}]);scheduler.completeAll();await scheduler.whenIdle();assert.equal(scheduler.snapshot().completed,0);assert.equal(cache.size,0);scheduler.cancelAll();
});

test('equal-size local overwrite changes the source digest even when metadata is coarse',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),identity=require('../src/dub-source-identity').identity,root=fs.mkdtempSync(path.join(os.tmpdir(),'source808-')),file=path.join(root,'Türkçe.mp4');fs.writeFileSync(file,'old video bytes');
 const fixed=fs.statSync(file,{bigint:true}),stat=fs.statSync,fstat=fs.fstatSync;
 try{fs.statSync=(name,...args)=>name===file?fixed:stat(name,...args);fs.fstatSync=()=>fixed;const before=identity(file);fs.writeFileSync(file,'new video bytes');const after=identity(file);assert(before&&after&&before!==after);assert(!before.includes('Türkçe'));}
 finally{fs.statSync=stat;fs.fstatSync=fstat;fs.rmSync(root,{recursive:true,force:true});}
});
