const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body><section id="playerLayer"><div class="player-body"><div id="playerStage"><video id="playerVideo" src="file:///test.mp4"></video></div><i id="sideResizer"></i><aside id="playerSide"><div id="aiChat"></div></aside></div></section><span id="playerTitle">Gerçek video</span><select id="playerSpeed"><option>1</option></select></body>',{pretendToBeVisual:true});
const {window}=dom;let focused=true;window.document.hasFocus=()=>focused;global.document=window.document;global.window=window;global.Node=window.Node;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.Element.prototype.getAnimations=()=>[];
let now=1000,paints=0;window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){paints++;},getImageData:()=>({data:new Uint8ClampedArray([100,120,140,255])})});
const video=document.getElementById('playerVideo');
for(const [key,value]of Object.entries({duration:120,paused:false,readyState:4,videoWidth:1920,videoHeight:1080,currentTime:1,playbackRate:1,volume:.6}))Object.defineProperty(video,key,{value,writable:true,configurable:true});
const intervals=[],timers=[];const cues=[{id:'a',start:0,end:4,text:'A real source line'}];
const player={mediaKey:'local:test',generation:1,workspaceMode:'player',cues,cues2:[],offset:0,offset2:0,subPath:'a.srt',sub2Path:'',subLang:'en',sub2Lang:'',localPath:'test.mp4',savedCues:[],playlist:[],playlistIndex:-1,abA:null,abB:null,ambientOn:true,ambientTimer:null};
window.TimelineIssueScan=require('../src/renderer/timeline-issue-scan');
window.PlayerUiKit=require('../src/renderer/player-ui-kit');
window.PlayerWorkspaceUI=require('../src/renderer/player-workspace-ui');
window.UiLocale={get:()=> 'tr'};window.AssistantSourceContext={conversation:()=> 'stable-source'};
let native=false;window.NativePlayerUI={active:()=>native};
const context=vm.createContext({window,document,player,performance:{now:()=>now},MutationObserver:window.MutationObserver,Event:window.Event,structuredClone,
 PlayerUiKit:window.PlayerUiKit,PlayerWorkspaceUI:window.PlayerWorkspaceUI,PlayerTranscriptModel:require('../src/renderer/player-transcript-model'),PlayerWorkspaceModel:require('../src/renderer/player-workspace-model'),
 browserSubtitleRoleCues:()=>({source:player.cues}),currentSubtitleMode:()=> 'both',cueSignature:cue=>cue.text,
 stopAmbient(){player.ambientTimer=null;},startAmbient(){},setAmbient(on){player.ambientOn=on;},
 cueTextSearchIndex:rows=>({query:q=>new Set(rows.flatMap((row,i)=>row.text.toLowerCase().includes(q)?[i]:[]))}),foldQuery:x=>x,
 setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout(fn,ms){timers.push([fn,ms]);return timers.length;},clearTimeout(){},
 globalAssistantContext:()=>({}),setSideTab(){},toggleCueSaved(){},saveCueNote(){},aiSourceScope:()=>({}),aiChatSend(){},setSubtitleMode(){},
});
vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/player-workspace-integration'),'utf8'),context);
const integration=window.PlayerWorkspaceIntegration,stage=document.getElementById('playerStage');
assert.equal(document.querySelectorAll('video').length,1);assert.equal(paints,1);
now=1250;intervals[0]();assert.equal(paints,1,'sampling is bounded to 500ms');
now=1500;intervals[0]();assert.equal(paints,2);
native=true;now=2000;intervals[0]();assert.equal(paints,2,'native mode never samples an empty HTML decoder or captures disk PNG');
assert.equal(document.querySelector('.pw-ambient').dataset.sample,'native-frame-unavailable');
Object.defineProperty(window,'innerWidth',{value:940,writable:true});document.querySelector('.pw-open-panel').click();
assert.equal(document.querySelectorAll('.pw-panel').length,1);assert.equal(document.querySelector('.pw-panel').getAttribute('aria-modal'),'true');
assert.equal(document.querySelector('.pw-panel').getAttribute('data-pw-occludes-native'),'true');
document.querySelector('.pw-panel-close').click();assert.equal(document.querySelector('.pw-panel').hasAttribute('aria-modal'),false);
integration.refresh(true);assert.equal(document.getElementById('playerStage'),stage);assert.equal(document.querySelectorAll('#aiChat').length,1);
const anchor=integration.snapshot();
(async()=>{
 const directOwner=integration.snapshot(),beforeDirect=video.currentTime;
 assert.equal((await integration.executeExisting({type:'seek',mediaKey:directOwner.mediaKey,generation:directOwner.generation,time:-1})).code,'invalid-range','public podcast adapter must keep the shared command validation');
 assert.equal(video.currentTime,beforeDirect,'rejected public command must not move playback');
 assert.equal((await integration.executeExisting({type:'seekCue',mediaKey:directOwner.mediaKey,generation:directOwner.generation,trackId:'replaced-track',trackRevision:'old',cueId:'a'})).code,'stale-track');
 assert.equal((await integration.seekEvidence({sourceKey:'wrong',time:1,text:cues[0].text},anchor)).code,'source-changed');
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:1,text:'An old transcript'},anchor)).code,'source-changed');
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:2,text:cues[0].text},anchor)).ok,true);assert.equal(video.currentTime,2);
 document.querySelector('.pw-panel-close').click();native=false;document.documentElement.dataset.cinemaMotion='reduced';now=3000;intervals[0]();assert.equal(paints,2,'reduced motion stops ambient sampling');
 delete document.documentElement.dataset.cinemaMotion;focused=false;now=3500;window.dispatchEvent(new window.Event('blur'));intervals[0]();assert.equal(paints,2,'native minimize can blur without document.hidden; sampling still stops');
 focused=true;now=4000;window.dispatchEvent(new window.Event('focus'));assert.equal(paints,3,'restoring native focus resumes bounded sampling');
 Object.defineProperty(document,'hidden',{value:true,configurable:true});now=4500;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(paints,3,'hidden page stops ambient sampling');
// E09 actual UI -> integration -> existing quality scanner; no subtitle writes.
cues.push({id:'fast',start:5,end:5.5,text:'rapid '.repeat(8)},{id:'blank',start:7,end:9,text:''});integration.refresh(true);
const unchanged=JSON.stringify(player.cues),filter=()=>document.querySelector('.pw-issue-filter select');
filter().value='fast';filter().dispatchEvent(new window.Event('change'));
assert.equal(document.querySelectorAll('.pw-cue').length,1);assert.match(document.querySelector('.pw-cue').textContent,/rapid/);
let query=document.querySelector('.pw-panel__tools input');query.value='absent';query.dispatchEvent(new window.Event('input'));
assert.equal(document.querySelectorAll('.pw-cue').length,0);assert.match(document.querySelector('.pw-transcript').textContent,/Bu filtrelerde eşleşen satır yok/);assert.doesNotMatch(document.querySelector('.pw-transcript').textContent,/Henüz konuşma dökümü yok/);assert.match(document.querySelector('.pw-issue-filter small').textContent,/0.*0.*3/);
assert(document.querySelector('.pw-issue-filter button'),'active cue outside combined filters has explicit return');
document.querySelector('.pw-issue-filter button').click();assert.equal(filter().value,'all');assert.equal(document.querySelector('.pw-panel__tools input').value,'');
assert.equal(document.querySelectorAll('.pw-cue').length,3);assert.equal(JSON.stringify(player.cues),unchanged);
filter().value='empty';filter().dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('.pw-cue').length,1);
player.generation++;integration.refresh(true);assert.equal(filter().value,'all','a new source generation clears the review selection');
cues.length=1;integration.refresh(true);
// E02: actual native-panel UI -> frozen integration owner -> session-only choice.
player.cues2=[{id:'tr1',start:0,end:4,text:'First candidate'},{id:'tr2',start:0,end:4,text:'Second candidate'}];integration.refresh(true);
context.openAppDialog=async()=>true;const edits=[];context.openCueEditor=(secondary,target)=>edits.push({secondary,target});
const candidates=[...document.querySelectorAll('.pw-pair-candidate')];assert.equal(candidates.length,2);const beforePair=JSON.stringify([player.cues,player.cues2]);
candidates[1].querySelectorAll('button')[1].click();assert.equal(edits[0].secondary,true);assert.equal(edits[0].target.index,1);
const staleButton=candidates[0].querySelector('button');candidates[1].querySelector('button').click();await new Promise(setImmediate);
assert.match(document.querySelector('.pw-cue__sec').textContent,/Second candidate/);assert.equal(document.querySelectorAll('.pw-pair-review').length,0);assert.equal(JSON.stringify([player.cues,player.cues2]),beforePair);
player.generation++;integration.refresh(true);staleButton.click();await new Promise(setImmediate);assert.equal(document.querySelectorAll('.pw-pair-review').length,1,'new revision discards the old display choice and ignores stale buttons');
player.cues2=[];integration.refresh(true);

 player.generation++;
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:1,text:cues[0].text},anchor)).code,'source-changed');
 dom.window.close();console.log('player-workspace-runtime: sampling limit, native honesty, single overlay, stable stage/chat and stale evidence guard OK');
})().catch(error=>{console.error(error);process.exitCode=1;dom.window.close();});
