'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerFeeds}=require('../src/feed-service');
const session=require('../src/podcast-session');
function fixture(translate,extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-prose-')),app=new EventEmitter(),event={sender:{id:1}};
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>dir,autoStart:false,translateText:translate,...extra});
 const parsed=require('../src/feed-parser').parseFeed('<rss version="2.0"><channel><title>Publisher</title><item><guid>episode</guid><title>Episode</title><link>https://publisher.example/episode</link><enclosure url="https://publisher.example/audio.mp3" type="audio/mpeg" length="1000"/></item></channel></rss>','https://publisher.example/rss');
 service.store.subscribe({...parsed,url:'https://publisher.example/rss'},parsed.entries);
 const entry=service.store.entries({kind:'podcast'}).rows[0],version=session.sourceVersion(entry);
 const save=text=>service.store.podcastWorkspace(entry.id,version,{transcript:{state:'untimed',format:'plain',text,provenance:'publisher',status:'complete'}});
 save('First paragraph.\n\nSecond paragraph.');
 const request=(more={})=>service.handle(event,{action:'podcast-translate-text',entryId:entry.id,sourceVersion:version,expectedTranscriptText:service.store.entry(entry.id).podcastWorkspace.transcript.text,requestId:'text-job',...more});
 return {...service,dir,event,entry,version,save,request,close(){service.dispose();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('untimed publisher translation uses existing service and saves no fake timing or materialized files',async()=>{
 const calls=[],f=fixture(async text=>{calls.push(text);return 'Birinci paragraf.\n\nİkinci paragraf.';});
 try{const before=f.store.entry(f.entry.id).podcastWorkspace.transcript;const result=await f.request();assert.equal(result.ok,true,result.error);assert.equal(calls.length,1);assert.equal(result.translation.state,'untimed');assert.equal(result.translation.format,'plain');assert.deepEqual(f.store.entry(f.entry.id).podcastWorkspace.transcript,before);assert.equal(f.store.entry(f.entry.id).podcastWorkspace.translation.text,result.translation.text);assert(!fs.existsSync(path.join(f.dir,'podcast-transcripts')));assert.equal(result.translation.start,undefined);}finally{f.close();}
});
test('cancel and changed source preserve previous translation and original text',async()=>{
 for(const mode of ['cancel','change']){let release,entered;const ready=new Promise(r=>entered=r),f=fixture(async()=>{entered();return new Promise(r=>release=r);});
 try{f.store.podcastWorkspace(f.entry.id,f.version,{translation:{state:'untimed',format:'plain',text:'Önceki çeviri',provenance:'user'}});const pending=f.request();await ready;if(mode==='cancel')await f.handle(f.event,{action:'cancel',requestId:'text-job'});else f.save('New publisher revision.');release('Late translation');const result=await pending;assert.equal(result.ok,false);const workspace=f.store.entry(f.entry.id).podcastWorkspace;assert.equal((mode==='change'?workspace.previous:workspace).translation.text,'Önceki çeviri');if(mode==='change')assert.equal(workspace.translation,undefined);assert.equal(f.store.entry(f.entry.id).podcastWorkspace.transcript.text,mode==='change'?'New publisher revision.':'First paragraph.\n\nSecond paragraph.');}finally{f.close();}}
});
test('chunks freeze one provider snapshot and reject partial, stale and oversized inputs before API use',async()=>{
 let factories=0,calls=0;const f=fixture(null,{createTextTranslator:()=>{const provider=++factories;return async text=>{calls++;return provider+': '+text;};}});
 try{f.save(('Small paragraph with words. '.repeat(100))+'\n\nLast paragraph.');const result=await f.request();assert.equal(result.ok,true,result.error);assert(calls>1);assert.equal(factories,1);const n=calls;assert.equal((await f.request({sourceVersion:'stale'})).ok,false);assert.equal((await f.request({expectedTranscriptText:'stale'})).ok,false);f.store.podcastWorkspace(f.entry.id,f.version,{transcript:{state:'untimed',format:'plain',text:'Partial',provenance:'asr',status:'partial'}});assert.equal((await f.request()).ok,false);f.save('x'.repeat(50001));assert.equal((await f.request()).ok,false);assert.equal(calls,n);}finally{f.close();}
});


test('podcast prose provider prompt respects the selected language instead of forcing Turkish',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/main.js'),'utf8'),start=source.indexOf('  const targetBaseLanguage ='),end=source.indexOf('  const requestController =',start);
 for(const language of ['tr','de']){const context={config:{targetLanguage:language,register:'natural prose'},pageMode:false,articleMode:true,synopsisMode:false,sentenceRequest:{},glossary:'',accumulatedTerminology:''};vm.runInNewContext(source.slice(start,end)+';globalThis.prompt=system;',context);assert(context.prompt.includes('Hedef dil: '+language));if(language==='de')assert(!context.prompt.includes('doğal Türkçeye çevir'));}
});
