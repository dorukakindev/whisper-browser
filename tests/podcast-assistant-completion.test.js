const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const context=require('../src/assistant-source-context');
const snap={title:'Episode',mediaKey:'p:1',episodeIdentity:'one',sourceVersion:'bytes-a',generation:7,time:10,sourceTrack:{id:'publisher',revision:'r1'}};
const track={...snap.sourceTrack,role:'source',timed:true,offsetSeconds:2,cues:[{id:'past',start:1,end:5,text:'past'},{id:'partial',start:7,end:10,text:'future tail'},{id:'future',start:20,end:25,text:'future'},{id:'bad',start:0,end:Infinity,text:'bad'}]};
test('Podcast request freezes episode, byte binding, generation, track and horizon without future cues',()=>{
 const frozen=context.freezePodcast(snap,[track]);snap.time=50;track.cues[0].text='modified';
 assert.equal(frozen.podcastAnchor.time,10);assert.deepEqual(frozen.transcript_evidence.evidence.map(c=>c.metin),['past']);
 assert(context.podcastStillValid(frozen,snap));for(const changes of [{sourceVersion:'bytes-b'},{episodeIdentity:'two'},{generation:8},{sourceTrack:{id:'publisher',revision:'r2'}}])assert.equal(context.podcastStillValid(frozen,{...snap,...changes}),false);
 assert.notEqual(context.scope({},frozen),context.scope({},{...frozen,sourceVersion:'bytes-b'}));
});
test('Untimed publisher text never becomes past or full episode timed evidence',()=>{
 for(const scope of ['watched','full']){const frozen=context.freezePodcast(snap,[{...track,timed:false,text:'unheard spoilers'}],scope);assert.deepEqual(frozen.transcript_evidence.evidence,[]);assert(frozen.transcript_evidence.limitations.includes('untimed-transcript-excluded'));assert(!JSON.stringify(frozen).includes('unheard spoilers'));}
});
test('Presentation toggle does not call source loading, play, acquisition or ASR',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/player-workspace-integration.js'),'utf8');
 const handler=source.match(/podcastEntry.onclick=\(\)=>\{([^\n]+)\}/)[1];assert.match(handler,/classList.toggle/);assert.doesNotMatch(handler,/\.play\(|\.src\s*=|feedsRequest|queuePodcast|startBrowser|download/);
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');assert.match(renderer,/shelf\?\.isPodcastMode\?\.\(\).*freezePodcast/s);assert.match(renderer,/audio\.sourceVersion===binding\.sourceVersion/);
});

test('A completed download cannot paint an unknown playing stream merely because episode and generation match',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 const start=source.indexOf('function podcastJobMatchesCurrent(job)'),end=source.indexOf('function podcastQueueOwnerCurrent(',start);
 const player={mediaKey:'p',generation:1,workspaceAudio:{entryId:'one',sourceVersion:'unknown-stream'}};const context={player};vm.runInNewContext(source.slice(start,end)+';globalThis.matches=podcastJobMatchesCurrent;',context);
 const job={mediaKey:'p',generation:1,podcastBinding:{entryId:'one',sourceVersion:'download-sha'}};assert.equal(context.matches(job),false);player.workspaceAudio.sourceVersion='download-sha';assert.equal(context.matches(job),false,'ASR output is not a publisher transcript even when versions match');Object.assign(job.podcastBinding,{outputRole:'translation',transcriptProvenance:'publisher'});assert.equal(context.matches(job),true);
});

test('Observed player/browser snapshots report explicit unknown byte identity and honest capabilities',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/player-workspace-integration.js'),'utf8');
 const start=source.indexOf('  function snapshot()'),end=source.indexOf('  function sourceRole()',start);
 const player={workspaceMode:'player',mediaKey:'local:opaque',generation:3,localPath:'private-media-path',isLive:false};
 const environment={player,video:{getAttribute:()=> 'file-source',duration:100,currentTime:12,paused:true,playbackRate:1,videoWidth:1920,videoHeight:1080},window:{},document:{getElementById:()=>({textContent:'Local episode'})},tracks:()=>[{id:'source',revision:'r1',cues:[]},{id:'second',revision:'r2',cues:[]}]};
 vm.runInNewContext(source.slice(start,end)+';globalThis.snapshot=snapshot;',environment);const snapshot=environment.snapshot();
 assert.equal(snapshot.sourceBinding.sha256,'unknown');assert.equal(snapshot.sourceBinding.etag,'unknown');assert.equal(snapshot.sourceBinding.length,'unknown');assert.equal(snapshot.sourceBinding.probe.status,'observed');assert.equal(snapshot.sourceBinding.probe.videoWidth,1920);assert.equal(snapshot.sourceVersionStatus,'unknown');assert(!JSON.stringify(snapshot).includes('private-media-path'));
 for(const name of ['play','pause','seek','rate','readTranscript','ASR','download']){assert(['yes','no','unknown'].includes(snapshot.capabilities[name].support));assert(snapshot.capabilities[name].reason);}
 assert.equal(snapshot.capabilities.ASR.support,'yes');assert.equal(snapshot.capabilities.download.support,'no');
 Object.assign(player,{workspaceMode:'browser',mediaKey:'browser:spotify',localPath:'',browserMediaSeen:true,browserPageUrl:'https://open.spotify.com/episode/opaque',browserDuration:200,browserTime:17,browserPaused:false,browserRate:1});
 const spotify=environment.snapshot();assert.equal(spotify.time,17);assert.equal(spotify.capabilities.ASR.support,'no');assert.equal(spotify.capabilities.download.support,'no');assert.equal(spotify.sourceBinding.sha256,'unknown');
});
test('A selection scope requires explicit captured selection and never expands to the whole transcript',()=>{
 const packet=context.freezePodcast(snap,[track],'selection');assert.equal(packet.transcript_evidence.evidence.length,0);assert(packet.transcript_evidence.limitations.includes('explicit-selection-required'));
});

test('Bounded podcast context declares partial coverage instead of claiming a complete summary',()=>{
 const cues=Array.from({length:45},(_,i)=>({id:String(i),start:i,end:i+1,text:'Line '+i}));
 const packet=context.freezePodcast({...snap,time:50},[{...track,cues}],'watched');
 assert.equal(packet.transcript_evidence.eligibleCues,45);assert.equal(packet.transcript_evidence.includedCues,40);assert.equal(packet.transcript_evidence.coverage,'partial');assert(packet.transcript_evidence.limitations.includes('do-not-claim-complete-summary'));
});


test('explicit so-far podcast question narrows a full UI scope and freezes its original clock',()=>{
 const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=text.indexOf('function activePodcastContext('),end=text.indexOf('function podcastContextCurrent(',start),snapshot={mediaKey:'episode',generation:1,time:10,sourceVersion:'v1',sourceTrack:{id:'s',revision:'r'}};
 const tracks=[{id:'s',revision:'r',role:'source',timed:true,cues:[{id:'past',start:0,end:5,text:'Heard evidence'},{id:'future',start:15,end:20,text:'Unheard future'}]}];
 const env={window:{AssistantSourceContext:context,MediaShelfUI:{isPodcastMode:()=>true,readSnapshot:()=>snapshot,getTranscriptTracks:()=>tracks}},$:()=>({value:'full'})};vm.runInNewContext(text.slice(start,end),env);
 assert.equal(env.activePodcastContext().transcript_evidence.evidence.length,2);
 for(const question of ['Bu ana kadar özetle','Summarize so far']){snapshot.time=10;const packet=env.activePodcastContext(undefined,question);snapshot.time=50;assert.deepEqual(packet.transcript_evidence.evidence.map(row=>row.metin),['Heard evidence']);assert.equal(packet.podcastAnchor.time,10);}
 assert.match(text,/const podcastPacket = activePodcastContext\(undefined, q\)/);
});


test('bilingual presentation retains frozen podcast evidence and source validation',()=>{
 const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=text.indexOf('function activePodcastContext('),end=text.indexOf('function globalAssistantContext(',start);
 const snapshot={mediaKey:'rss:study',episodeIdentity:'episode',generation:1,sourceVersion:'source',time:10,sourceTrack:{id:'s',revision:'r'}},tracks=[{id:'s',revision:'r',role:'source',timed:true,cues:[{id:'a',start:0,end:5,text:'Past'},{id:'b',start:20,end:25,text:'Future'}]}];
 const env={window:{AssistantSourceContext:context,CinemaSahne:{current:{o:{mode:'study'}}},PlayerWorkspaceIntegration:{isPodcastMode:()=>false,snapshot:()=>snapshot,getTranscriptTracks:()=>tracks}},$:()=>({value:'full'})};vm.runInNewContext(text.slice(start,end),env);
 const packet=env.activePodcastContext(undefined,'Bu ana kadar özetle');assert.deepEqual(packet.transcript_evidence.evidence.map(c=>c.metin),['Past']);assert(env.podcastContextCurrent(packet));snapshot.time=50;assert.equal(packet.podcastAnchor.time,10);assert(env.podcastContextCurrent(packet));snapshot.sourceVersion='changed';assert.equal(env.podcastContextCurrent(packet),false);
});

test('Browser Podcast so-far questions use the audible cutoff without taking over normal YouTube commands', () => {
 const vm=require('node:vm'), text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
 const snapshot={mediaKey:'youtube:A',episodeIdentity:'youtube:A',generation:1,sourceVersion:'tab:A',time:10,sourceTrack:{id:'s',revision:'r'}};
 const tracks=[{id:'s',revision:'r',role:'source',timed:true,cues:[
  {id:'heard',start:2,end:5,text:'Heard'},
  {id:'unheard',start:8,end:12,text:'Unheard'}
 ]}];
 const env={window:{AssistantSourceContext:context,BrowserPodcastUI:{isActive:()=>true,snapshot:()=>snapshot,getTranscriptTracks:()=>tracks}},$:()=>({value:'full'})};
 vm.runInNewContext(text.slice(text.indexOf('function activePodcastContext('),text.indexOf('function globalAssistantContext(')),env);
 assert.equal(env.activePodcastContext(undefined,'Translate this video'),null);
 const packet=env.activePodcastContext(undefined,'Summarize so far');
 assert.deepEqual(packet.transcript_evidence.evidence.map(row=>row.metin),['Heard']);
 assert.equal(env.podcastContextCurrent(packet),true);
 snapshot.generation++;
 assert.equal(env.podcastContextCurrent(packet),false);
});
