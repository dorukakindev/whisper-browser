'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.cwd(),out=path.resolve(process.env.R815_CEA_OUT||'tmp/audit-fixes/cea-regression');
assert(fs.existsSync(path.join(root,'src/main.js')),'Run from repository root');fs.mkdirSync(out,{recursive:true});
const S=require(path.join(root,'src/browser-subtitles')),C=require(path.join(root,'src/browser-cea-captions')),F=require(path.join(root,'src/browser-cea-full-capture')),K=require(path.join(root,'src/browser-cea-checkpoint')),T=require(path.join(root,'src/browser-cue-timeline-calibration')),P=require(path.join(root,'src/browser-capture-provenance'));
function readHead(){return 'working-tree-regression';}
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const sources=['src/main.js','src/browser-subtitles.js','src/browser-cea-captions.js','src/browser-cea-full-capture.js','src/browser-cea-checkpoint.js','src/browser-cue-timeline-calibration.js','src/browser-capture-provenance.js'];
const sourceSha256=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const fixtureDir=path.join(path.dirname(require.resolve('mux.js/package.json')),'test/segments');
const fixtures=Object.fromEntries(['dash-608-captions-init.mp4','dash-608-captions-seg.m4s','multi-channel-608-captions.ts'].map(p=>[p,fs.readFileSync(path.join(fixtureDir,p))]));
const track={instreamId:'CC1',language:'en',name:'English',standard:'cea-608'},url='https://fixture.invalid/live.m3u8';
function extract(a,b){const start=main.indexOf(a),end=main.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return main.slice(start,end);}
const code=[extract('function hlsCeaSegmentFetchKey(', 'function registerBrowserHlsCeaMatchers('),extract('async function captureBrowserHlsCeaSegment(', 'function browserConfiguredSubtitlePath('),extract('function storeBrowserTrack(', '// Doğrulanan adresi'),extract('function clearBrowserHlsCeaFullCaptureState(', 'async function runBrowserHlsCeaFullCapture('),extract('async function runBrowserHlsCeaFullCapture(', 'function startBrowserHlsCeaFullCapture('),extract('function startBrowserHlsCeaFullCapture(', 'async function prepareBrowserHlsCeaCapture(')].join('\n');
function env(label){
 const tab={id:'fixture-tab',contentDuration:480},publications=[],progress=[],s={...S,...C,...F,...K,...T,...P,Buffer,URL,console,Date,Math,Map,Set,Promise,Number,String,Error,fs,path,setTimeout,clearTimeout,
 ceaCheckpointId:K.checkpointId,app:{getPath:()=>path.join(out,label),getVersion:()=> 'fixture-build'},randomUUID:()=>crypto.randomUUID(),
 browserHlsCeaFullCaptureJob:null,browserHlsCeaActive:null,browserActiveTabId:tab.id,browserStateGeneration:1,
 browserTrackBuffers:new Map(),browserTrackPublications:new Map(),browserTrackPendingPublications:new Map(),browserTrackPublicationTimers:new Map(),
 browserHlsCeaDecoders:new Map(),browserHlsCeaDecoderRevisions:new WeakMap(),browserHlsCeaDecodeQueues:new Map(),browserHlsCeaFetchedSegments:new Set(),browserHlsCeaArrivals:new Map(),browserHlsCeaInitializations:new Map(),browserPendingResponses:new Map(),
 browserDiagnostics:null,BROWSER_CAPTURE_BODY_LIMIT:12*1024*1024,
 browserTextStability:{observe:()=>({state:'duplicate'}),cancelScope:()=>{}},
 browserTrackStreamKey:(source,lang)=>`${source}|${lang}`,isCurrentBrowserContext:()=>true,browserTabById:()=>tab,activeBrowserTab:()=>tab,
 browserEventContext:()=>({tabId:tab.id}),browserWatchMediaId:()=> 'fixture-media',
 trimInsertionCollection:()=>{},browserTrackPublicationNeedsMetadataRefresh:()=>true,
 publishBrowserTrackNow:e=>{publications.push(e);return e;},noteBrowserCapture:()=>{},

 fetchBrowserBufferWithRetry:async u=>{if(u.endsWith('init.mp4'))return fixtures['dash-608-captions-init.mp4'];return u.endsWith('.ts')?fixtures['multi-channel-608-captions.ts']:fixtures['dash-608-captions-seg.m4s'];},
 resolveBrowserHlsCeaExpectedDuration:async job=>job.expectedDuration,
 snapshotBrowserNativeTracks:async()=>[],
 saveBrowserTrackToConfiguredFolder:(_tab,cues)=>{const p=path.join(out,label,'final.srt');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,S.cuesToSrt(cues));return p;},
 scheduleBrowserHlsCeaAutoRetry:()=>false,
 sendBrowserHlsCeaFullProgress:(job,state,message)=>{job.state=state;progress.push({state,message});},
 jobResourceScheduler:{enqueue:()=> 'admitted'},
 };vm.createContext(s);vm.runInContext(code,s,{filename:'actual-main-cea-extract.js'});return {s,tab,publications,progress};
}
function job(s,tab,segments,complete=true){const j={id:'fixture-job',tab,context:{tabId:tab.id},sourceUrl:url,playlistUrl:url,tracks:[{...track}],segments,completed:new Set(),decoderProof:new Map(),failures:[],expectedDuration:segments.reduce((a,x)=>a+x.duration,0),playlistComplete:complete,resume:false,retryRound:0};j.total=segments.length;s.browserHlsCeaFullCaptureJob=j;return j;}
function playlist(sequence,count,end=true){return '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:120\n#EXT-X-MEDIA-SEQUENCE:'+sequence+'\n#EXT-X-DISCONTINUITY-SEQUENCE:'+sequence+'\n#EXT-X-MAP:URI="init.mp4"\n'+Array.from({length:count},(_,i)=>(i?'#EXT-X-DISCONTINUITY\n':'')+'#EXTINF:120,\nseg-'+(sequence+i)+'.m4s\n').join('')+(end?'#EXT-X-ENDLIST\n':'');}
(async()=>{
 const results={head:readHead(),node:process.version,sourceSha256,fixtureSha256:Object.fromEntries(Object.entries(fixtures).map(([p,b])=>[p,crypto.createHash('sha256').update(b).digest('hex')])),tests:{}};
 const old=C.buildHlsCeaSegmentMatchers(playlist(0,3,false),url,[track],url),fresh=C.buildHlsCeaSegmentMatchers(playlist(1,3),url,[track],url),merged=F.mergeCeaCaptureSegments(old,fresh);
 const a=env('sliding'),ja=job(a.s,a.tab,merged);await a.s.runBrowserHlsCeaFullCapture(ja);
 const key=`${url}|en|cea:CC1`,observed=a.s.browserTrackBuffers.get(key).map(x=>({start:x.start,end:x.end,discontinuity:x.discontinuity,text:x.text}));
 assert.deepEqual(merged.map(x=>x.start),[0,120,240,360]);assert.deepEqual(observed.map(x=>x.start),[0,120,240,360]);assert.equal(a.progress.at(-1).state,'complete');
 const b=env('non-sliding-control'),correct=C.buildHlsCeaSegmentMatchers(playlist(0,4),url,[track],url),jb=job(b.s,b.tab,correct);await b.s.runBrowserHlsCeaFullCapture(jb);
 assert.deepEqual(b.s.browserTrackBuffers.get(key).map(x=>x.start),[0,120,240,360]);assert.equal(b.progress.at(-1).state,'complete');
 results.tests.sliding={initial:old.map(x=>({sequence:x.sequence,start:x.start})),refreshed:fresh.map(x=>({sequence:x.sequence,start:x.start})),merged:merged.map(x=>({sequence:x.sequence,start:x.start})),observed,expectedStarts:[0,120,240,360],progress:a.progress,controlStarts:b.s.browserTrackBuffers.get(key).map(x=>x.start),summary:F.summarizeCeaCaptureCompleteness(merged,ja.completed,{cueCount:4,expectedDuration:480,requireExpectedDuration:true,planComplete:true})};
 const continuing=env('sliding-resume'),jc=job(continuing.s,continuing.tab,old,false);jc.expectedDuration=480;
 await continuing.s.runBrowserHlsCeaFullCapture(jc);assert.equal(continuing.progress.at(-1).state,'partial');assert.equal(jc.completed.size,3);
 jc.segments=F.mergeCeaCaptureSegments(jc.segments,fresh);jc.playlistComplete=true;jc.resume=true;jc.state='running';jc.total=4;
 await continuing.s.runBrowserHlsCeaFullCapture(jc);
 const resumed=continuing.s.browserTrackBuffers.get(key);assert.deepEqual(resumed.map(x=>x.start),[0,120,240,360]);assert.equal(continuing.progress.at(-1).state,'complete');
 results.tests.sliding.resumeObserved=resumed;results.tests.sliding.resumeProgress=continuing.progress;results.tests.sliding.resumeCompleted=[...jc.completed];
 // A genuine partial full-capture run calibrates decoded captions then persists them.
 const q=env('checkpoint'),ts=C.buildHlsCeaSegmentMatchers('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts\n',url,[track],url),jq=job(q.s,q.tab,ts,false);q.tab.contentDuration=6;
 const raw=new C.CeaCaptionDecoder().decodeTransportStream(fixtures['multi-channel-608-captions.ts']).filter(c=>c.stream==='CC1');
 const refs=T.shiftCueTimeline(raw,10);q.s.snapshotBrowserNativeTracks=async()=>[{language:'en',label:'English',cues:refs}];jq.checkpointId=K.checkpointId(url,'fixture-media',[track]);
 await q.s.runBrowserHlsCeaFullCapture(jq);assert.equal(q.progress.at(-1).state,'partial');
 const saved=K.loadCeaCheckpoint(q.s.browserCeaCheckpointRoot(),jq.checkpointId);assert(saved);assert.equal(saved.tracks[0].timeTransform.offsetSeconds,10);assert.equal(saved.tracks[0].cues.length,2);
 // Simulate process restart, with actual main startup/restore and a brand new decoder.
 const r=env('checkpoint');r.tab.contentDuration=6;r.s.browserHlsCeaActive={sourceUrl:url,playlistUrl:url,tracks:[track],segments:ts,playlistComplete:true};r.s.snapshotBrowserNativeTracks=async()=>[{language:'en',label:'English',cues:refs}];
 const actualRun=r.s.runBrowserHlsCeaFullCapture;r.s.runBrowserHlsCeaFullCapture=j=>{r.promise=actualRun(j);return r.promise;};
 const started=r.s.startBrowserHlsCeaFullCapture(r.tab);assert.equal(started.ok,true);await r.promise;
 const recovered=r.s.browserTrackBuffers.get(key);assert.equal(recovered.length,2);assert.equal(r.progress.at(-1).state,'complete');assert.equal(T.calibrateCueTimeline(refs,recovered).accepted,true);
 const c=env('zero-offset-control');c.tab.contentDuration=6;const id=K.checkpointId(url,'fixture-media',[track]);
 K.saveCeaCheckpoint(c.s.browserCeaCheckpointRoot(),id,[{...track,cues:raw.map(x=>({...x,sequence:0,discontinuity:0,captionMode:'CC1',provenance:{streamKey:key}})),timeTransform:{offsetSeconds:0,matches:2,confidence:'medium'}}],1);
 c.s.browserHlsCeaActive={sourceUrl:url,playlistUrl:url,tracks:[track],segments:ts,playlistComplete:true};const cr=c.s.runBrowserHlsCeaFullCapture;c.s.runBrowserHlsCeaFullCapture=j=>{c.promise=cr(j);return c.promise;};assert.equal(c.s.startBrowserHlsCeaFullCapture(c.tab).ok,true);await c.promise;assert.equal(c.s.browserTrackBuffers.get(key).length,2);
 results.tests.checkpoint={raw:raw.map(x=>({start:x.start,end:x.end,text:x.text})),saved:saved.tracks[0],restoredTransform:[...r.s.browserHlsCeaFullCaptureJob.timeTransforms.values()][0],observed:recovered,calibration:T.calibrateCueTimeline(refs,recovered),progress:r.progress,zeroOffsetControlCount:c.s.browserTrackBuffers.get(key).length,expectedCount:2};
 // A second accepted offset keeps all reference cues inside the actual six-second window.
 const n=env('negative-checkpoint'),jn=job(n.s,n.tab,ts,false),negativeRefs=T.shiftCueTimeline(raw,-2);n.tab.contentDuration=6;
 n.s.snapshotBrowserNativeTracks=async()=>[{language:'en',label:'English',cues:negativeRefs}];jn.checkpointId=K.checkpointId(url,'fixture-media',[track]);await n.s.runBrowserHlsCeaFullCapture(jn);
 const negativeSaved=K.loadCeaCheckpoint(n.s.browserCeaCheckpointRoot(),jn.checkpointId);assert.equal(negativeSaved.tracks[0].timeTransform.offsetSeconds,-2);
 const nr=env('negative-checkpoint');nr.tab.contentDuration=6;nr.s.browserHlsCeaActive={sourceUrl:url,playlistUrl:url,tracks:[track],segments:ts,playlistComplete:true};nr.s.snapshotBrowserNativeTracks=async()=>[{language:'en',label:'English',cues:negativeRefs}];const nrun=nr.s.runBrowserHlsCeaFullCapture;nr.s.runBrowserHlsCeaFullCapture=j=>{nr.promise=nrun(j);return nr.promise;};assert.equal(nr.s.startBrowserHlsCeaFullCapture(nr.tab).ok,true);await nr.promise;
 const negativeObserved=nr.s.browserTrackBuffers.get(key);assert.equal(negativeObserved.length,2);assert.equal(nr.progress.at(-1).state,'complete');assert.equal(T.calibrateCueTimeline(negativeRefs,negativeObserved).accepted,true);assert(negativeRefs.every(x=>x.start>=0&&x.end<=6));
 const negativeSrt=fs.readFileSync(path.join(out,'negative-checkpoint/final.srt'),'utf8');assert.equal((negativeSrt.match(/^\d+\r?$/gm)||[]).length,2);
 results.tests.checkpoint.negativeWithinDuration={finalSrt:negativeSrt,offset:-2,expected:negativeRefs,observed:negativeObserved,expectedCount:2,observedCount:2,progress:nr.progress,calibration:T.calibrateCueTimeline(negativeRefs,negativeObserved)};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({head:results.head,slidingStarts:observed.map(x=>x.start),expectedStarts:[0,120,240,360],checkpointCount:recovered.length,checkpointExpected:2,controls:'passed',output:path.join(out,'results.json')},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
