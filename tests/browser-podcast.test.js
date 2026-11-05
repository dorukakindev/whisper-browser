'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="playerLayer" class="workspace-browser"><details id="appModeMenu"><div role="menu"></div></details><div id="playerSide"><div class="bp-title"><h2></h2></div><section class="browser-study"><h3 class="browser-study-title"></h3><p class="browser-study-status"></p><div class="browser-study-actions"></div><div class="browser-study-second"></div></section></div><section class="sh-browser-study"><section class="browser-study"></section></section><video id="web"></video></div>');
const {window}=dom,{document}=window;const commands=[];let speedChange,opened=true,modeOptions,menuCloses=0;
const player={workspaceMode:'browser',browserActiveTabId:'a',mediaKey:'browser:one',generation:1,browserTime:14,browserDuration:100,browserRate:1.25,browserPaused:true,browserMediaSeen:true,cues:[{id:'a',start:0,end:4,text:'Past'},{id:'b',start:10,end:14,text:'Future'}],cues2:[{id:'x',start:1,end:5,text:'Geçmiş'}],browserTracks:[{id:'en'},{id:'tr'}],browserLoadedTrackId:'en',browserLoadedTrackId2:'tr'};
window.UiLocale={get:()=> 'tr'};window.BrowserStudy={open:options=>{opened=true;modeOptions=options;},isActive:()=>opened};
window.PlayerWorkspaceModel=require('../src/renderer/player-workspace-model');window.PlayerUiKit={select:config=>{speedChange=config.onChange;const wrap=document.createElement('span');wrap.trigger=document.createElement('button');wrap.append(wrap.trigger);return wrap;}};
let transformReads=0;
const transformFor=secondary=>{transformReads++;return {scale:2,offsetSeconds:secondary?7:5};};
const context=vm.createContext({window,document,player,queueMicrotask,MutationObserver:window.MutationObserver,subtitleVideoTransform:transformFor,
 closeBrowserToolbarMenus:()=>menuCloses++,browserSubtitleRoleCues:()=>({source:player.cues,translation:player.cues2}),subtitleVideoTime:(time,secondary,frozen)=>require('../src/browser-subtitle-sync').sourceToVideoTime(time,frozen||transformFor(secondary)),
 browserSubtitleSync:{hashText:text=>require('node:crypto').createHash('sha256').update(text).digest('hex')},currentBrowserYoutubeUrl:()=>'',
 browserCommand:async(type,value,tab)=>{commands.push({type,value,tab});return {ok:true};}});
vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/browser-podcast'),'utf8'),context);
const ui=window.BrowserPodcastUI,video=document.getElementById('web');
ui.setMode(true);assert.equal(document.querySelector('.sh-browser-study .browser-podcast-controls'),null,'legacy controls never attach to the common surface');assert.equal(modeOptions?.preservePodcast,true,'podcast entry preserves its explicit view intent');assert.equal(ui.isActive(),true);assert.equal(commands.length,0,'view switch starts no video/audio/processing');assert.equal(player.browserTime,14);assert.equal(player.browserRate,1.25);assert.equal(document.getElementById('web'),video);assert.equal(document.querySelectorAll('video').length,1);
transformReads=0;const tracks=ui.getTranscriptTracks();assert.equal(transformReads,2,'source proof resolves once per channel, not per cue endpoint');const snap=ui.snapshot();assert.equal(tracks[0].cues[1].start,25);assert.equal(tracks[1].cues[0].start,9,'independent secondary drift/offset is retained');
const evidence=require('../src/assistant-source-context').freezePodcast(snap,tracks,'watched');assert.equal(evidence.transcript_evidence.evidence.length,1);assert.equal(evidence.transcript_evidence.evidence[0].metin,'Past');assert.equal(evidence.podcastAnchor.time,14);
(async()=>{
 const command={type:'seekCue',mediaKey:snap.mediaKey,generation:snap.generation,trackId:snap.sourceTrack.id,trackRevision:snap.sourceTrack.revision,cueId:'b'};
 assert.equal((await ui.execute(command)).ok,true);assert.equal(commands.at(-1).value,25.01);
 const oldRevision=snap.sourceTrack.revision;player.cues[0].text='Edited';assert.notEqual(ui.snapshot().sourceTrack.revision,oldRevision);assert.equal((await ui.execute(command)).code,'stale-track');
 const speed=document.querySelector('.browser-podcast-speed');speed.trigger.click();player.generation++;const before=commands.length;speedChange('1.5');assert.equal(commands.length,before,'old speed menu cannot change another generation');
 player.browserActiveTabId='b';assert.equal(ui.isActive(),false);assert.equal((await ui.execute(command)).code,'stale-source');
 ui.setMode(true);player.browserPageUrl='https://open.spotify.com/episode/test';assert.equal(ui.snapshot().capabilities.ASR.support,'no');
 const previousCloses=menuCloses;ui.setMode(false);assert(menuCloses>previousCloses,'menu exit closes the originating menu too');assert.equal(ui.isActive(),false);assert.equal(document.getElementById('web'),video);dom.window.close();console.log('browser-podcast: existing owner/position/rate, mapped bilingual clocks, bounded assistant evidence, stale actions and Spotify boundary OK');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
