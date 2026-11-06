'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const manifest=require('../src/assistant-context-manifest'),registry=require('../src/assistant-capabilities');
function setup(){
 let effects=0,opened;const player={workspaceMode:'browser',browserPageUrl:'https://www.youtube.com/watch?v=fixture',browserPageTitle:'Test',browserTime:3,browserTracks:[],cues:[],browserWhisperRange:null};
 const sandbox={window:{AssistantContextManifest:manifest,AssistantCapabilities:{get:registry.get,validate:(n,a,c)=>registry.validate(n,JSON.parse(JSON.stringify(a)),c)},UiLocale:{get:()=> 'en'},AssistantWorkspace:{activeId:()=> 'thread',toolContext:()=>({rows:[]})},AssistantSourceContext:{pageKey:()=> 'page'},AppSettingsUI:{open:async(...args)=>{effects++;opened=args;}}},document:{getElementById:()=>null},player,state:{},globalAssistantContext:()=>null,browserTabState:()=>({id:'A',generation:1}),currentBrowserYoutubeUrl:()=>player.browserPageUrl,aiSourceScope:()=> 'scope',currentBrowserWhisperRange:()=>player.browserWhisperRange};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-app-actions'),'utf8'),sandbox);
 return {sandbox,player,actions:sandbox.window.AssistantAppActions,effects:()=>effects,opened:()=>opened};
}

test('An explicit Whisper range is job-local and keeps the assistant source owner valid',async()=>{
 const h=setup();h.player.browserWhisperRange={start:0,end:60};const owner=h.actions.snapshot();let request;
 h.sandbox.validateBrowserWhisperRange=(_enabled,start,end)=>({range:{start:Number(start),end:Number(end)}});
 h.sandbox.startBrowserYoutubeWhisper=async(_translate,config)=>{request=config;return {ok:true,jobId:'job'};};
 const result=await h.actions.execute('start_whisper',{translate:true,start:5,end:25},owner);
 assert.equal(result.status,'accepted');assert.deepEqual(JSON.parse(JSON.stringify(request.clipRange)),{start:5,end:25});
 assert.deepEqual(h.player.browserWhisperRange,{start:0,end:60},'The action must not invalidate its own proposal/continuation owner');
 assert.equal(h.actions.current(owner),true);assert.equal(request.isCancelled(),false);
 h.player.browserWhisperRange={start:1,end:61};assert.equal(request.isCancelled(),true,'A later human scope change still cancels the pending start');
});

test('Voice preparation cannot report completed when its existing window failed to open',async()=>{
 const h=setup();h.sandbox.window.MediaExperience={openVoice:async()=>false};
 await assert.rejects(h.actions.execute('open_voice_preparation',{},h.actions.snapshot()),/not.*open|could not.*open/i);
 h.sandbox.document.getElementById=id=>id==='dubGeneratorDialog'?{open:true}:null;
 h.sandbox.window.MediaExperience.openVoice=async()=>undefined;
 assert.equal((await h.actions.execute('open_voice_preparation',{},h.actions.snapshot())).status,'completed');
});
test('AppActions checks source and range before dispatching a real adapter',async()=>{
 const h=setup(),owner=h.actions.snapshot();
 await h.actions.execute('open_settings',{section:'general'},owner);assert.equal(h.effects(),1);assert.equal(h.opened()[1].preserveAssistantContext,true);
 await assert.rejects(h.actions.execute('open_settings',{section:'general'},owner,{deadline:1}),/expired/);assert.equal(h.effects(),1);
 h.player.browserWhisperRange={start:5,end:20};
 await assert.rejects(h.actions.execute('open_settings',{section:'general'},owner),/changed/);assert.equal(h.effects(),1);
 await assert.rejects(h.actions.execute('open_settings',{section:'general',token:'forbidden'},h.actions.snapshot()),/Unknown action field/);assert.equal(h.effects(),1);
});
test('Agent UI pagehide unsubscribes and its idle state does not occupy media state',()=>{
 const listeners={},window={api:{assistantAgentRun:()=>{},onAssistantAgentEvent:()=>()=>{window.unsubscribed=true;}},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'),{window,document:{addEventListener:()=>{}}});
 assert.equal(window.AssistantAgentUI.busy(),false);assert.equal(window.AssistantAgentUI.status(),null);listeners.pagehide();assert.equal(window.unsubscribed,true);
});


test('using a job subtitle requires exact registered backend ID, role, source and explicit partial permission',async()=>{
 const h=setup(),owner=h.actions.snapshot();let loaded=0;h.sandbox.useBrowserTrack=async(_x,id)=>{loaded++;h.player.subPath='fixture.srt';return {ok:true};};
 h.player.browserTracks=[{id:'track',path:'fixture.srt',backendJobId:'external-A',role:'translation',status:'partial',failed:1}];
 await assert.rejects(h.actions.execute('use_job_subtitles',{job_id:'external-B',role:'translation'},owner),/exact job output/);
 await assert.rejects(h.actions.execute('use_job_subtitles',{job_id:'external-A',role:'translation'},owner),/partial/);assert.equal(loaded,0);
 assert.equal((await h.actions.execute('use_job_subtitles',{job_id:'external-A',role:'translation',allow_partial:true},owner)).track.partial,true);assert.equal(loaded,1);
});

test('A secondary subtitle replacement invalidates an approved subtitle action even when cue contents are identical',async()=>{
 const h=setup();h.player.cues2=[{start:1,end:2,text:'Same text'}];h.player.sub2Path='original-secondary.srt';let reads=0,seeks=0;
 h.sandbox.window.AssistantWorkspace.searchSubtitleContext=()=>{reads++;return {status:'completed'};};
 h.sandbox.window.AssistantWorkspace.subtitleById=()=>({start:1,end:2,text:'Same text'});h.sandbox.browserCommand=async()=>{seeks++;return {ok:true};};
 const owner=h.actions.snapshot();h.player.sub2Path='replacement-secondary.srt';
 await assert.rejects(h.actions.execute('get_current_subtitle',{},owner),/subtitle track changed/i);
 await assert.rejects(h.actions.execute('seek_to_time',{source_id:'U1'},owner),/subtitle track changed/i);assert.equal(reads,0);assert.equal(seeks,0);
});

test('An approved podcast passage can change playback context but cannot seek after the chat changes', async () => {
 const h = setup(), owner = h.actions.snapshot();
 h.sandbox.window.api = {mediaShelf:async () => ({ok:true,row:{token:'locator',episodeTitle:'Episode'}})};
 const apply = () => h.actions.execute('open_saved_podcast_passage',{passage_id:'P1'},owner,
  {expectedSettings:{kind:'podcast-passage',locator:{token:'locator'}}});
 h.sandbox.openPodcastResearchResult = async (_row, options) => {
  h.player.browserPageUrl = '';
  assert.equal(options.isCancelled(), false);
  await options.beforeSeek();
  h.sandbox.window.AssistantWorkspace.activeId = () => 'next-thread';
  assert.equal(options.isCancelled(), true);
  return false;
 };
 await assert.rejects(apply(), /could not be opened/);
});
