'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const manifest=require('../src/assistant-context-manifest');
function app(){
 const player={workspaceMode:'player',mediaKey:'fixture-media',generation:3,cues:[],browserTracks:[]},video={currentTime:600,duration:3600,playbackRate:1.5,volume:1,paused:true},media={mode:'player',mediaKey:'fixture-media',generation:3,tabId:'player-video',visible:true,hasMedia:true};let readHook;
 const w={AssistantContextManifest:manifest,AssistantSourceContext:{pageKey:s=>s},AssistantCapabilities:{get:()=>({domain:'playback'}),validate:(_n,a)=>a},AssistantWorkspace:{activeId:()=> 'thread',subtitleById:()=>null},BrowserDubAudioUI:{context:()=>({...media})}};
 const c=vm.createContext({window:w,player,document:{getElementById:id=>id==='playerVideo'?video:null},globalAssistantContext:()=>null,browserTabState:()=>({id:'tab',generation:3}),currentBrowserYoutubeUrl:()=>'',currentBrowserWhisperRange:()=>null,aiSourceScope:()=>JSON.stringify([player.mediaKey,player.generation]),subtitleSourceTime:n=>n});
 const helper='../src/assistant-playback-math';if(fs.existsSync(require.resolve('../src/assistant-context-manifest').replace('assistant-context-manifest.js','assistant-playback-math.js')))w.AssistantPlaybackMath=require(helper);
 vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/assistant-library-actions'),'utf8'),c);const read=w.AssistantLibraryActions.execute;w.AssistantLibraryActions={execute:async(...a)=>{const result=await read(...a);if(readHook)readHook();return result;}};
 vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/assistant-app-actions'),'utf8'),c);
 return {w,player,video,media,run:(args={})=>w.AssistantAppActions.execute('calculate_playback_time',args,w.AssistantAppActions.snapshot()),readHook:fn=>readHook=fn};
}
test('playback time uses actual remaining duration/rate and explicit hypothetical speed/breaks without changing playback',async()=>{
 const h=app(),actual=await h.run();assert.equal(actual.status,'completed');assert.equal(actual.remaining_media_seconds,3000);assert.equal(actual.wall_seconds,2000);assert.equal(actual.with_breaks_seconds,2000);assert.equal(actual.speed_source,'actual');assert.equal(actual.paused,true);
 const result=await h.run({speed:2,break_minutes:10});assert.equal(result.wall_seconds,1500);assert.equal(result.with_breaks_seconds,2100);assert.equal(result.speed_source,'explicit');assert.equal(h.video.playbackRate,1.5);assert.equal(h.video.currentTime,600);assert.equal(result.source_id,actual.source_id);assert.equal(result.source_revision,actual.source_revision);assert(!JSON.stringify(result).includes('fixture-media'));
});
test('unknown live duration, nonfinite position/rate, and no current visible source are unsupported',async()=>{
 for(const [field,value]of [['duration',Infinity],['duration',0],['currentTime',NaN],['currentTime',-1],['playbackRate',Infinity],['currentTime',4000]]){const h=app();h.video[field]=value;assert.equal((await h.run()).status,'unsupported',field);}
 for(const patch of [{visible:false},{hasMedia:false},{mediaKey:''},{generation:NaN}]){const h=app();Object.assign(h.media,patch);assert.equal((await h.run()).status,'unsupported');}
});
test('invalid arguments cannot inject remaining time or bypass bounds',async()=>{
 for(const args of [{remaining:1},{duration:1},{speed:0},{speed:4.1},{speed:'2'},{speed:NaN},{break_minutes:-1},{break_minutes:241},{break_minutes:Infinity}])await assert.rejects(app().run(args),/argument|speed|break/i);
});
test('a source/thread/media change during the read invalidates its receipt',async()=>{
 const h=app();h.readHook(()=>h.player.generation++);await assert.rejects(h.run(),/changed/i);
 const m=app();m.readHook(()=>m.media.mediaKey='new-source');await assert.rejects(m.run(),/changed/i);
 const s=app();const owner=s.w.AssistantAppActions.snapshot();s.player.generation++;await assert.rejects(s.w.AssistantAppActions.execute('calculate_playback_time',{},owner),/changed/i);
});
test('existing playback read remains a read with the same observation contract',async()=>{
 const h=app(),result=await h.w.AssistantAppActions.execute('get_playback_state',{},h.w.AssistantAppActions.snapshot());assert.equal(result.status,'completed');assert.equal(result.playback.position,600);assert.equal(result.playback.duration,3600);assert.equal(result.playback.rate,1.5);assert(!result.token);assert(!result.preview);
});
test('an idle prior source or a different initial media owner cannot supply timing',async()=>{
 for(const patch of [{mediaKey:'prior-media'},{generation:2},{mode:'browser'}]){const h=app();Object.assign(h.media,patch);assert.equal((await h.run()).status,'unsupported');}
});
test('browser timing requires exact current tab generation and a media ID',async()=>{
 function browser(){const h=app();Object.assign(h.player,{workspaceMode:'browser',browserPageUrl:'https://fixture.example/video',browserTime:100,browserDuration:500,browserRate:2,browserPaused:false});Object.assign(h.media,{mode:'browser',tabId:'tab',mediaId:'media-1'});return h;}
 const h=browser(),result=await h.run();assert.equal(result.remaining_media_seconds,400);assert.equal(result.wall_seconds,200);
 for(const patch of [{mediaId:''},{tabId:'other'},{generation:2}]){const bad=browser();Object.assign(bad.media,patch);assert.equal((await bad.run()).status,'unsupported');}
 const ad=browser();ad.player.browserAdPlaying=true;assert.equal((await ad.run()).status,'unsupported');
});
