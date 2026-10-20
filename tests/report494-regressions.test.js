'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),turn=()=>new Promise(setImmediate);
const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const {safeShortening}=require('../src/dub-text-guard');
const Scheduler=require('../src/browser-translation-scheduler');
test('494-02: shortening preserves numeric relationships, not just a sorted bag of digits',()=>{
 assert.equal(safeShortening('Karışım oranı 1:2 olmalı.','Oran 2:1 olmalı.'),false);
 assert.equal(safeShortening('Tarih 12/05 olarak belirlendi.','Tarih 05/12 seçildi.'),false);
 assert.equal(safeShortening('Karışım oranı 1:2 olmalı.','Oran 1:2 olmalı.'),true);
});
test('494-03: English voice rewrites cannot add/remove negation',()=>{
 assert.equal(safeShortening('You should not do that today.','You should do that.'),false);
 assert.equal(safeShortening('We can leave here tomorrow.','We cannot leave.'),false);
});
test('494-04: source-language choice changes translation cache identity',()=>{
 const sentence={text:'Gift',pieces:[{text:'Gift',start:0,end:1}]};
 assert.notEqual(Scheduler.translationCacheKey(sentence,{sourceLanguage:'en'}),Scheduler.translationCacheKey(sentence,{sourceLanguage:'de'}));
});
test('494-05: production page scheduler context separates provider endpoints',()=>{
 const start=source.indexOf("promptVersion: 'browser-page-v2'"),end=source.indexOf('\n  };',start);
 function context(endpoint){const scope={session:{config:{endpoint,model:'same',targetLanguage:'tr',sourceLanguage:'en',glossary:[]}},
  safeTranslationEndpoint:v=>v,createHash:require('node:crypto').createHash,terminologyPrompt:()=>''};
  return vm.runInNewContext('({'+source.slice(start,end)+'})',scope);}
 const sentence={text:'A whole sentence.',pieces:[]};
 assert.notEqual(Scheduler.translationCacheKey(sentence,context('https://first.test/v1')),Scheduler.translationCacheKey(sentence,context('https://second.test/v1')));
});
test('494-06: PDF language/model variants survive separately on disk',()=>{
 const P=require('../src/pdf-translate');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pdf494-'));
 try{
  const variants=[['tr','m1'],['en','m1'],['tr','m2']];
  for(const [targetLanguage,model] of variants){const state=P.createPdfTranslationState({pdfHash:'fixture',endpoint:'https://provider.test',targetLanguage,model});
   state.pages[1]=[{id:'a',source:'Text',translation:'Translated '+targetLanguage+model,status:'translated'}];
   fs.writeFileSync(path.join(dir,P.pdfTranslationStateFileStem(state.pdfHash,state.endpoint,state.model,state.targetLanguage)+'.json'),JSON.stringify(state));}
  assert.equal(fs.readdirSync(dir).length,3);
  for(const [targetLanguage,model] of variants)assert.equal(P.loadPdfTranslationState(dir,{pdfHash:'fixture',endpoint:'https://provider.test',targetLanguage,model}).pages[1][0].translation,'Translated '+targetLanguage+model);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('494-10: library browser keys retain distinct SPA videos and redact route tokens',()=>{
 const W=require('../src/watch-library-store');
 assert.notEqual(W.canonicalWatchKey('browser:https://example.test/#/watch/1'),W.canonicalWatchKey('browser:https://example.test/#/watch/2'));
 assert.equal(W.canonicalBrowserUrl('https://example.test/#/watch/1?token=private&id=2'),'https://example.test/#/watch/1?id=2');
});
test('494-11: paused playback cannot seek across subtitle gaps',()=>{
 const P=require('../src/playback-policy');
 assert.notEqual(P.playbackLearningAction([{id:'a',start:10,end:12,text:'Speech'}],0,0,'skip-gaps',{paused:true}).type,'seek');
});
test('494-12: a natural four-times-speed tick still reaches loop/auto-pause boundaries',()=>{
 const P=require('../src/playback-policy'),cues=[{id:'a',start:0,end:3,text:'Speech'}];
 assert.equal(P.playbackLearningAction(cues,4.5,.5,'loop-cue',{playbackRate:4}).type,'loop-cue');
 assert.equal(P.playbackLearningAction(cues,4.5,.5,'normal',{playbackRate:4,autoPause:true}).type,'pause-at-cue-end');
 assert.notEqual(P.playbackLearningAction(cues,4.5,.5,'loop-cue',{playbackRate:1}).type,'loop-cue');
});
test('494-13: media identity never persists matrix or SPA credentials',()=>{
 const M=require('../src/browser-media-identity');
 const url='https://example.test/player;jsessionid=SECRET#/watch/1?x-api-ticket=SECRET&id=2';
 assert.doesNotMatch(M.canonicalMediaIdentity(url).canonicalUrl,/SECRET/);
 assert.equal(M.canonicalMediaIdentity(url).key,M.canonicalMediaIdentity('https://example.test/player#/watch/1?id=2').key);
 assert.doesNotMatch(M.normalizeStreamIdentityUrl('https://example.test/v;jsessionid=SECRET.m3u8?x-api-ticket=SECRET'),/SECRET/);
});
test('494-14: long known-service content slugs cannot collapse to the same video',()=>{
 const M=require('../src/browser-media-identity'),base='https://www.hulu.com/watch/'+ 'a'.repeat(200);
 assert.notEqual(M.canonicalMediaIdentity(base+'one').key,M.canonicalMediaIdentity(base+'two').key);
});
test('494-15: manual replacement audio restores original sound before/after its playable interval',async()=>{
 const Dub=require('../src/renderer/browser-dub-audio');const c={mode:'player',tabId:'player-video',mediaKey:'fixture',priorMuted:false};let muted=false;
 const audio={duration:10,readyState:4,currentTime:0,paused:true,addEventListener(){},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},load(){},removeAttribute(){}};
 const dub=new Dub({audio,context:()=>c,mute:async(_id,value)=>{muted=value;return {ok:true};},now:()=>10000});
 try{await dub.attach({url:'fixture.wav'},c);dub.update({currentTime:11,paused:false});await turn();await turn();assert.equal(muted,false);
  dub.offset=5;dub.update({currentTime:2,paused:false});await turn();assert.equal(muted,false);
  dub.update({currentTime:8,paused:false});await turn();await turn();assert.equal(muted,true);
 }finally{await dub.remove();}
});
test('494-16: workspace media failure stops every layer and reports failure',()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);
 try{
  w.DubWorkspaceModel=require('../src/renderer/dub-workspace-model');w.api={};w.BrowserDubAudioUI={context:()=>({}),stop(){}};
  w.HTMLMediaElement.prototype.load=()=>{};w.HTMLMediaElement.prototype.pause=function(){this.stopped=true;};
  w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-workspace-ui.js'),'utf8'));
  el('dubGeneratedPreview').dispatchEvent(new w.Event('error'));
  assert.equal(el('dubMixMusicAudio').stopped,true);assert.match(el('dubWorkspaceStatus').textContent,/başlatılamadı/);
 }finally{w.close();}
});
test('494-19: missing quality manifest cannot automatically attach a possibly partial WAV',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);let event,request,attached=0;
 try{
  w.HTMLMediaElement.prototype.load=w.HTMLMediaElement.prototype.pause=()=>{};w.syncBrowserOcclusion=()=>{};
  w.BrowserDubAudioUI={context:()=>({mode:'player',tabId:'p',mediaKey:'fixture',visible:true,hasMedia:true}),attachGenerated:async()=>{attached++;return true;}};
  w.api={dubConfig:async()=>({ok:true,ready:true}),latestDub:async()=>({ok:true}),selectFile:async()=>'fixture.srt',onDubEvent:fn=>event=fn,startDub:async r=>{request=r;return {ok:true};}};
  el('dubGeneratorDialog').showModal=()=>{};
  w.eval(fs.readFileSync(path.join(root,'src/renderer/dub-generator-ui.js'),'utf8'));
  el('dubMainOpen').click();await turn();el('dubChooseSrt').click();await turn();el('dubGeneratorStart').click();await turn();
  event({type:'done',id:request.id,url:'file:///voice.wav',quality:null,qualityUnavailable:true});await turn();assert.equal(attached,0);
 }finally{w.close();}
});
test('494-20: a manual PDF translation completes a failed block and survives retry',()=>{
 const P=require('../src/pdf-translate');let state=P.createPdfTranslationState({pdfHash:'fixture'});
 state=P.recordPdfPageTranslation(state,1,[{id:'a',source:'Text',status:'failed',error:'provider failed'}]);
 P.applyPdfBlockEdit(state,1,'a','Reviewed translation');assert.deepEqual(P.pendingPdfPages([1],state),[]);
 state=P.recordPdfPageTranslation(state,1,[{id:'a',source:'Text',status:'failed',error:'provider failed'}]);
 assert.equal(state.pages[1][0].userText,'Reviewed translation');assert.deepEqual(P.pendingPdfPages([1],state),[]);
 P.applyPdfBlockEdit(state,1,'a','');assert.deepEqual(P.pendingPdfPages([1],state),[1]);
});
