'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/browser-subtitle-sync');
const T=require('../src/browser-transcript-search');
const R=require('../src/media-relink-matcher');
const P=require('../src/playback-policy');
const H=require('../src/job-timing-helpers');
const Score=require('../src/translation-model-score');
const Skip=require('../src/browser-skip-segments');
const context={mediaId:'m',variantId:'v',sourceHash:'h',cueId:'c',sourceCueHash:'ch'};
test('490-01 invalid transcript timestamps cannot become AI evidence',()=>{
 const cues=[{start:Infinity,end:Infinity,text:'invalid'},{start:null,end:2,text:'missing'},{start:3,end:4,text:'valid'}];
 assert.equal(T.buildTranscriptEvidence(cues,'valid',{scope:'full'}).totalCues,1);
});
test('490-02 infinite watched position cannot expose unwatched transcript',()=>{
 const r=T.buildTranscriptEvidence([{start:100,end:101,text:'future spoiler'}],'spoiler',{scope:'watched',position:Infinity});
 assert.equal(r.evidence.length,0);
});
test('490-03 time conversion rejects absent times instead of mapping zero',()=>{
 for(const time of [null,'',false]){assert.throws(()=>S.sourceToVideoTime(time,{}));assert.throws(()=>S.videoToSourceTime(time,{}));}
});
test('490-04 subtitle export rejects blank and boolean cue timestamps',()=>{
 assert.throws(()=>S.transformCuesForExport([{start:'',end:2,text:'bad'}],{}));
 assert.throws(()=>S.transformCuesForExport([{start:false,end:2,text:'bad'}],{}));
});
test('490-05 reapplying an edit preserves model base and original timing',()=>{
 const record=S.createEditRecord({...context,hasOverride:true,userOverride:'user',timingOverride:{start:5,end:7}});
 const once=S.applyEditRecord({start:1,end:3,text:'model'},record,context);
 const twice=S.applyEditRecord(once,record,context);
 assert.equal(twice.baseTranslation,'model');assert.equal(twice.sourceStart,1);assert.equal(twice.sourceEnd,3);
 assert.equal(S.applyEditRecord(twice,S.createEditRecord({...context,hasOverride:false}),context).text,'model');
});
test('490-06 future sync and edit schemas cannot silently match current media',()=>{
 const sync={version:99,mediaId:'m',sourceTrackId:'t',sourceHash:'h'};
 assert.equal(S.syncRecordMatches(sync,{mediaId:'m',sourceTrackId:'t',sourceHash:'h'}),false);
 assert.equal(S.editRecordMatches({...context,version:99},context),false);
});
test('490-07 duplicate scan entries do not create fake relink ambiguity',()=>{
 const c={path:'C:/new/movie.mp4',sizeBytes:42};
 assert.equal(R.selectRelinkCandidates({localPath:'C:/old/movie.mp4',sizeBytes:42},[c,c]).status,'unique');
});
test('490-08 POSIX bulk relink preserves case-sensitive root boundaries',()=>{
 assert.equal(R.planBulkRelink([{key:'file:x',localPath:'/Media/movie.mp4'}],{oldPrefix:'/media',newPrefix:'/new'}).rows.length,0);
 assert.equal(R.planBulkRelink([{key:'file:x',localPath:'C:/Media/Movie.mp4'}],{oldPrefix:'c:/media',newPrefix:'D:/New'}).rows[0].candidate,'D:/New/Movie.mp4');
});
test('490-09 bulk relink rejects traversal outside old root and relative destinations',()=>{
 assert.equal(R.planBulkRelink([{key:'file:x',localPath:'C:/old/../outside.mp4'}],{oldPrefix:'C:/old',newPrefix:'C:/new'}).rows.length,0);
 assert.equal(R.planBulkRelink([{key:'file:x',localPath:'C:/old/a.mp4'}],{oldPrefix:'C:/old',newPrefix:'relative'}).rows.length,0);
});
test('490-10 nonfinite sizes cannot prove duplicate media identity',()=>{
 const rows=['a','b'].map(x=>({key:'file:'+x,localPath:`/${x}/movie.mp4`,sizeBytes:Infinity}));
 assert.equal(R.findLibraryDuplicates(rows).length,0);
});
test('490-11 missing previous playback measurement cannot trigger automatic pause',()=>{
 const r=P.playbackLearningAction([{start:0,end:.5,text:'hello'}],.6,null,'normal',{autoPause:true});
 assert.equal(r.type,'set-rate');
});
test('490-12 explicit zero skip lead seeks exactly to the next cue',()=>{
 assert.equal(P.playbackLearningAction([{start:10,end:12,text:'next'}],1,0,'skip-gaps',{lead:0}).time,10);
});
test('490-13 pending immediate queue rerun retains priority over later requests',async()=>{
 const {createSingleFlightScheduler}=require('../src/renderer/queue-lifecycle');
 const timers=[];let release;const gate=new Promise(r=>release=r);
 const scheduler=createSingleFlightScheduler(()=>gate,(fn,delay)=>timers.push({fn,delay}));
 scheduler.request();const active=timers.shift().fn();scheduler.request(0);scheduler.request(100);release();await active;
 assert.equal(timers[0].delay,0);
});
test('490-14 missing GPU samples stay absent rather than creating zero spikes',()=>{
 const rows=H.appendResourceSample([],{t:1,gpuMemMb:null});
 assert.equal(rows[0].gpuMemMb,null);assert.equal(H.resourceSparkPoints([{t:1,gpuMemMb:null},{t:2,gpuMemMb:null}],'gpuMemMb'),'');
});
test('490-15 workspace fallback cannot place the same tab in both split panes',()=>{
 const {sanitizePlaces}=require('../src/browser-session-package');
 const w=sanitizePlaces({workspaces:[{name:'w',tabs:[{id:'t',url:'https://example.test'}],activeTabId:'missing',splitSecondaryTabId:'t'}]}).workspaces[0];
 assert.equal(w.activeTabId,'t');assert.equal(w.splitSecondaryTabId,'');
});
test('490-16 prototype-named model remains a normal own score entry',()=>{
 const r=Score.recordRun({}, {model:'__proto__',batches:4,invalid_batches:1},1);
 assert.equal(Object.hasOwn(r,'__proto__'),true);assert.equal(Object.getPrototypeOf(r),Object.prototype);
});
test('490-17 nonfinite batch events cannot persist unrecoverable model scores',()=>{
 assert.equal(Object.hasOwn(Score.recordRun({},{model:'bad',batches:Infinity},1),'bad'),false);
});
test('490-18 null optional places section cannot abort portable session export',()=>{
 const {createBrowserSessionPackage}=require('../src/browser-session-package');
 assert.equal(createBrowserSessionPackage({places:null}).payload.places.history.length,0);
});
test('490-19 a full skip list keeps the newly added intro across normalization',()=>{
 const row=i=>({id:String(i),scope:'media',scopeKey:'m',kind:'intro',start:1,end:2});
 const r=Skip.upsertRecord(Array.from({length:500},(_,i)=>row(i)),row(500));
 assert.ok(r.records.length<=500);assert.ok(Skip.normalizeRecords(r.records).some(x=>x.id==='500'));
});
test('490-20 tolerated audio rounding cannot cause discontinuity at sync segment end',()=>{
 const M=require('../src/renderer/dub-sync-map');const sync=M.validate({version:1,videoDuration:10,audioDuration:9.98,segments:[{v0:0,v1:10,a0:0,a1:9.98}]});
 assert.ok(Math.abs(M.at(sync,9.999999).time-M.at(sync,10).time)<.00001);
 const tiny=M.validate({version:1,smooth:true,videoDuration:.04,audioDuration:.01,segments:[{v0:0,v1:.04,a0:0,a1:.01}]});
 assert.ok(M.at(tiny,.03).time>M.at(tiny,.02).time);
});
