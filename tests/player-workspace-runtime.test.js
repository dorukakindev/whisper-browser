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
window.PlayerUiKit=require('../src/renderer/player-ui-kit');
window.PlayerWorkspaceUI=require('../src/renderer/player-workspace-ui');
window.UiLocale={get:()=> 'tr'};window.AssistantSourceContext={conversation:()=> 'stable-source'};
let native=false;window.NativePlayerUI={active:()=>native};
const context=vm.createContext({window,document,player,performance:{now:()=>now},MutationObserver:window.MutationObserver,Event:window.Event,structuredClone,
 PlayerUiKit:window.PlayerUiKit,PlayerWorkspaceUI:window.PlayerWorkspaceUI,PlayerTranscriptModel:require('../src/renderer/player-transcript-model'),PlayerWorkspaceModel:require('../src/renderer/player-workspace-model'),
 browserSubtitleRoleCues:()=>({source:player.cues}),currentSubtitleMode:()=> 'both',cueSignature:cue=>cue.text,
 stopAmbient(){player.ambientTimer=null;},startAmbient(){},setAmbient(on){player.ambientOn=on;},
 cueTextSearchIndex:rows=>({query:()=>new Set(rows.map((_,i)=>i))}),foldQuery:x=>x,
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
 assert.equal((await integration.seekEvidence({sourceKey:'wrong',time:1,text:cues[0].text},anchor)).code,'source-changed');
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:1,text:'An old transcript'},anchor)).code,'source-changed');
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:2,text:cues[0].text},anchor)).ok,true);assert.equal(video.currentTime,2);
 document.querySelector('.pw-panel-close').click();native=false;document.documentElement.dataset.cinemaMotion='reduced';now=3000;intervals[0]();assert.equal(paints,2,'reduced motion stops ambient sampling');
 delete document.documentElement.dataset.cinemaMotion;focused=false;now=3500;window.dispatchEvent(new window.Event('blur'));intervals[0]();assert.equal(paints,2,'native minimize can blur without document.hidden; sampling still stops');
 focused=true;now=4000;window.dispatchEvent(new window.Event('focus'));assert.equal(paints,3,'restoring native focus resumes bounded sampling');
 Object.defineProperty(document,'hidden',{value:true,configurable:true});now=4500;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(paints,3,'hidden page stops ambient sampling');
 player.generation++;
 assert.equal((await integration.seekEvidence({sourceKey:'stable-source',time:1,text:cues[0].text},anchor)).code,'source-changed');
 dom.window.close();console.log('player-workspace-runtime: sampling limit, native honesty, single overlay, stable stage/chat and stale evidence guard OK');
})().catch(error=>{console.error(error);process.exitCode=1;dom.window.close();});
