'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
test('B04: upper/mixed-case extensions generate valid recovery output identities',()=>{
 const {burninOutputPaths,burninRecoveryPathsMatch}=require('../src/burnin-output');for(const extension of ['mp4','MP4','mkv','MKV','MkV']){const videoPath=path.join(os.tmpdir(),'source.'+extension),output=burninOutputPaths(videoPath,'fixture');assert.equal(path.basename(output.outPath),'source.altyazili.'+(extension.toLowerCase()==='mkv'?'mkv':'mp4'));assert(burninRecoveryPathsMatch({...output,videoPath,subPath:path.join(os.tmpdir(),'source.srt'),pid:123,startedAt:1700000000000,totalSec:10}));}
});
test('B13: subtitle-search clicks seek through the primary subtitle-to-video transform',async t=>{
 const d=new JSDOM(fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),{url:'https://fixture.invalid',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};Object.assign(w,{api:{mediaHub:async()=>({ok:true}),nativePlayer:async()=>({ok:true,available:true}),mediaTorrents:async()=>({ok:true})},player:{workspaceMode:'player',cues:[{start:20,end:22,text:'Find this line'}],chapters:[]},UiLocale:{get:()=> 'en'},NativePlayerUI:{active:()=>false,state:()=>({tracks:[]})},syncBrowserOcclusion(){},subtitleVideoTime:(seconds,secondary)=>{assert.equal(secondary,false);return seconds+10;}});w.eval(fs.readFileSync(path.join(root,'src/renderer/media-hub-ui.js'),'utf8'));w.MediaHubUI.open('player');await new Promise(setImmediate);const search=[...w.document.querySelectorAll('input')].find(n=>n.placeholder==='Words from the scene…');search.value='find';search.oninput();[...w.document.querySelectorAll('button')].find(n=>n.textContent.includes('Find this line')).click();await new Promise(setImmediate);assert.equal(w.document.getElementById('playerVideo').currentTime,30);
});
test('B14: TTC attachments reach the existing font signature reader and are cleaned up',async()=>{
 const extracted=[];const context={module:{exports:{}},require:name=>name==='./browser-media-tools'?{run:async(binary,args)=>{if(binary==='ffprobe')return JSON.stringify({streams:[{codec_type:'attachment',index:2,tags:{filename:'Collection.TTC'}},{codec_type:'attachment',index:3,tags:{filename:'notes.txt'}}]});const at=args.findIndex(arg=>arg.startsWith('-dump_attachment:'));assert.equal(args[at],'-dump_attachment:2');const dest=args[at+1];extracted.push(dest);fs.writeFileSync(dest,Buffer.from('ttcfsyntheticfont'));return '';}}:require(name)};vm.runInNewContext(fs.readFileSync(path.join(root,'src/browser-fonts.js'),'utf8'),context);const result=await context.module.exports.extractFonts('fixture.mkv','ffmpeg','ffprobe');assert.equal(result.length,1);assert.equal(Buffer.from(result[0].base64,'base64').subarray(0,4).toString(),'ttcf');assert.equal(extracted.length,1);assert.equal(fs.existsSync(extracted[0]),false);
});
test('B15: native dispatch preserves HLS and falls back to HTML without an installed engine',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/media-hub-ui.js'),'utf8'),code=source.slice(source.indexOf(' async function playStream('),source.indexOf(' async function drawPlayer('));
 let native=0,hls=0,normal=0,plays=0,available=true,startResult=true;
 const video={paused:true,play:async()=>{plays++;}};
 const context={player:{openIntent:0},document:{getElementById:id=>id==='playerVideo'?video:{classList:{remove(){}}}},flushWatchState:async()=>{},setWorkspaceMode(){},setPlayerSource:()=>normal++,setPlayerHls:()=>hls++,currentGeneration:()=>1,currentTorrent:null,window:{api:{nativePlayer:async()=>({ok:true,available})},NativePlayerUI:{start:async()=>{native++;return startResult;}}}};
 vm.createContext(context);vm.runInContext(code,context);
 for(const url of ['http://example.org/movie.mkv','https://example.org/movie.mkv','rtsp://example.org/movie'])await context.playStream({url,title:'Fixture',key:url});
 assert.equal(native,3);assert.equal(normal,3);assert.equal(plays,3);
 await context.playStream({url:'https://example.org/stream.m3u8?version=1',title:'HLS',key:'hls'});assert.equal(native,3);assert.equal(hls,1);
 available=false;await context.playStream({url:'https://example.org/movie.mp4',key:'mp4'});assert.equal(native,3,'missing mpv must not launch or show a native error');assert.equal(plays,4,'HTML autoplay remains available');
 available=true;startResult=false;await context.playStream({url:'https://example.org/movie.mp4',key:'fallback'});assert.equal(plays,5,'native failure falls back to HTML');
 context.window.api.nativePlayer=async()=>{context.player.openIntent++;return {ok:true,available:true};};await context.playStream({url:'https://example.org/old.mp4',key:'old'});assert.equal(native,4,'stale status must not start a native owner');assert.equal(plays,5,'stale status must not play the new owner');
 let passedMeta;context.setPlayerSource=(...a)=>{passedMeta=a[3];};const workKey='work:stremio:'+'a'.repeat(64);await context.playStream({url:'https://example.org/work.mp4',key:'work-source',workKey},0,{autoplay:false});assert.equal(passedMeta.workKey,workKey,'catalog work identity reaches the source setter');context.setPlayerHls=(...a)=>{passedMeta=a[3];};await context.playStream({url:'https://example.org/work.m3u8',key:'work-hls',workKey},0,{autoplay:false});assert.equal(passedMeta.workKey,workKey,'HLS carries the same identity without retaining timed state');
});

test('Fable OYN-10: a failed source open preserves the Stremio session',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/stremio-ui.js'),'utf8');const code=source.slice(source.indexOf('  async function playStreamRow('),source.indexOf('  async function autoSubtitle('));
 const previous={key:'old',streamId:'old-stream'};const context={rememberWorkTracks(){},session:previous,playRequest:0,call:async()=>({key:'new'}),detectProfile:()=> 'movie',epLabel:()=>'',hookVideo(){},mountPlayerButton(){},document:{querySelector:()=>null},window:{MediaHubUI:{playStream:async()=>{throw Error('open failed');}}}};
 vm.createContext(context);vm.runInContext(code,context);await assert.rejects(context.playStreamRow({name:'Fixture'},{token:'t'},{id:'new-stream'}),/open failed/);assert.equal(context.session,previous);
 context.window.MediaHubUI.playStream=async()=>false;await context.playStreamRow({name:'Fixture'},{token:'t'},{id:'cancelled'});assert.equal(context.session,previous,'cancelled open must not adopt a source');
 let release;context.call=()=>new Promise(resolve=>{release=resolve;});let opens=0;context.window.MediaHubUI.playStream=async()=>{opens++;return true;};
 const pending=context.playStreamRow({name:'Fixture'},{token:'t'},{id:'stale'});context.playRequest++;release({key:'stale'});await pending;assert.equal(opens,0,'superseded provider reply must not open media');assert.equal(context.session,previous);
});

test('Fable OYN-07: Shift+N belongs to episode navigation, plain N retains up-next',()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');const statement=source.split('\n').find(line=>line.includes('stUpNextToggle(); return;'));assert(statement);let calls=0;
 for(const [shiftKey,expected]of [[true,0],[false,1]]){const context={e:{key:'N',shiftKey,preventDefault(){}},stUpNextToggle:()=>calls++};vm.runInNewContext('(function(){'+statement+'})()',context);assert.equal(calls,expected);}
});

test('B16: Windows Media audio switches to AAC for MP4 but retains lossless copy for MKV',()=>{
 const {burninAudioArgs}=require('../src/burnin-output');for(const suffix of ['wmv','WMV','wma','asf'])assert.deepEqual(burninAudioArgs('fixture.'+suffix,'out.mp4'),['-c:a','aac','-b:a','192k']);assert.deepEqual(burninAudioArgs('fixture.wmv','out.mkv'),['-c:a','copy']);assert.deepEqual(burninAudioArgs('fixture.mp4','out.mp4'),['-c:a','copy']);
});
test('B122: completed M4B downloads may open in player, ZIP and unfinished media remain blocked',()=>{
 class Item extends EventEmitter{constructor(saved){super();this.saved=saved;}getFilename(){return path.basename(this.saved);}getSavePath(){return this.saved;}getReceivedBytes(){return 10;}getTotalBytes(){return 10;}setSaveDialogOptions(){}isPaused(){return false;}canResume(){return false;}}
 const session=new EventEmitter(),manager=require('../src/browser-downloads').createBrowserDownloads({exists:()=>true,publish(){},saveRecords(){}});manager.attach(session);for(const suffix of ['m4b','M4B','m4a','mp4','zip']){const item=new Item(path.join(os.tmpdir(),'fixture.'+suffix));session.emit('will-download',{},item);const row=manager.snapshot().items[0];assert.equal(manager.action(row.id,'open-player').ok,false);item.emit('done',{},'completed');const result=manager.action(row.id,'open-player');assert.equal(result.ok,suffix!=='zip');if(result.ok)assert.equal(result.path,item.saved);}
});

test('Fable ALT-01: subtitle creation follows the actual source and displays why it is blocked',async t=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),code=source.slice(source.indexOf('function playerSubtitleCreationState()'),source.indexOf('function updateMakeTransState()'));
 const dom=new JSDOM('<div class="tool-row-main"></div><button id="makeSubsBtn"></button><button id="makeTransBtn"></button><button id="exportTranslationBtn"></button><p id="playerTranscriptionAvailability" hidden></p>');t.after(()=>dom.window.close());
 const player={workspaceMode:'player',mediaKey:'stream:fixture',localPath:'',originalUrl:'https://fixture.invalid/movie.mp4'},state={};let roles={source:[],translation:[]};
 const c={window:{},player,state,document:dom.window.document,$:id=>dom.window.document.getElementById(id),currentBrowserYoutubeUrl:()=>'',currentBrowserWhisperAudio:()=>null,interfaceChoice:(tr,en)=>en,browserSubtitleRoleCues:()=>roles};vm.createContext(c);vm.runInContext(code,c);
 const button=c.$('makeSubsBtn'),notice=c.$('playerTranscriptionAvailability');c.syncSubtitlePrimaryAction();assert(button.disabled);assert.equal(button.dataset.primaryAction,'false');assert.match(notice.textContent,/local/i);assert.equal(notice.hidden,false);
 player.localPath='C:/movie.mp4';c.syncSubtitlePrimaryAction();assert.equal(button.disabled,false);assert.equal(button.dataset.primaryAction,'true');assert.equal(notice.hidden,true);
 state.running=true;c.syncSubtitlePrimaryAction();assert(button.disabled);assert.match(notice.textContent,/task/i);state.running=false;
 player.localPath='';roles={source:[{}],translation:[]};c.syncSubtitlePrimaryAction();assert(button.disabled);assert.equal(c.$('makeTransBtn').dataset.primaryAction,'true','loaded subtitles remain translatable');
 player.mediaKey='youtube:abc';player.ytInfo={sourceUrl:'https://youtube.test/watch?v=abc'};c.syncSubtitlePrimaryAction();assert.equal(button.disabled,false);
 player.workspaceMode='browser';c.syncSubtitlePrimaryAction();assert(button.disabled);c.currentBrowserWhisperAudio=()=>({mediaToken:'fixture'});c.syncSubtitlePrimaryAction();assert.equal(button.disabled,false);
 c.browserAudioPreparation={};c.syncSubtitlePrimaryAction();assert(button.disabled,'preparing browser audio must not re-enable create');
 player.workspaceMode='player';player.mediaKey='stream:new';c.browserAudioPreparation=null;c.buildOptsFromUI=()=>({});c.logLine=()=>{};c.osd=()=>{};
 const stale=dom.window.document.createElement('span');stale.id='playerVideoPath';stale.textContent='C:/previous-video.mp4';dom.window.document.body.append(stale);
 vm.runInContext(source.slice(source.indexOf('async function startProgressivePlayerTranscription('),source.indexOf('// "Altyazı oluştur"')),c);
 const rejected=await c.startProgressivePlayerTranscription();assert.equal(rejected.ok,false);assert.match(rejected.message,/local/i,'old visible path cannot become a stream transcription input');

});

test('Fable DUB-04: Stremio awaits the studio API and rejects a changed playback owner',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/stremio-ui.js'),'utf8'),code=source.slice(source.indexOf('  async function openDubStudio('),source.indexOf('  function pickPreferred('));
 let calls=0,clicks=0,resolve;const reg={value:'old',options:[{value:'natural'}],dispatchEvent(){}};
 const context={PROFILES:{film:{register:'natural'}},player:{mediaKey:'fixture',generation:1},document:{getElementById:id=>id==='translateRegister'?reg:{disabled:false,click(){clicks++;}}},window:{DubGeneratorUI:{prepareWithPreset:async options=>{calls++;assert.equal(options.preset,'Careful');return new Promise(r=>{resolve=r;});}}},setTimeout:fn=>fn(),Event:class{},t:(en,tr)=>en,toast(){}};
 vm.createContext(context);vm.runInContext(code,context);const pending=context.openDubStudio('film','Careful');assert.equal(calls,1);assert.equal(clicks,0,'no DOM click/poll dispatch');assert.equal(reg.value,'old');context.player.generation++;resolve({ok:true});assert.equal(await pending,false);assert.equal(reg.value,'old','late prepare must not change translation preferences');
});

test('Fable DUB-04: studio preparation does not apply a preset after a source change or while busy',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/dub-generator-ui.js'),'utf8'),code=source.slice(source.indexOf('  async function prepareWithPreset('),source.indexOf('  for (const name of Object.keys(presetSpecs)) el(`dubPreset',source.indexOf('  async function prepareWithPreset(')));
 let owner='first',opens=0,applied=0,finish;const c={presetSpecs:{Fast:{}},cfg:{},current:null,planning:false,choosing:false,referenceBusy:false,workspaceBusy:false,attachmentPending:null,preparationSequence:0,modal:{open:false},requestIdentity:()=>owner,applyPreset:()=>{applied++;return {ok:true};}};
 c.open=()=>{opens++;c.modal.open=true;c.preparationSequence++;return new Promise(resolve=>{finish=resolve;});};vm.createContext(c);vm.runInContext(code,c);
 const pending=c.prepareWithPreset({preset:'Fast'});owner='replacement';finish();assert.equal((await pending).code,'source-changed');assert.equal(applied,0);
 c.current={};assert.equal((await c.prepareWithPreset({preset:'Fast'})).code,'busy');assert.equal(opens,1);c.current=null;
 assert.equal((await c.prepareWithPreset({preset:'unknown'})).code,'invalid-preset');assert.equal(opens,1);
 c.open=async()=>{c.modal.open=true;c.preparationSequence++;};c.cfg=null;assert.equal((await c.prepareWithPreset({preset:'Fast'})).code,'configuration-unavailable');assert.equal(applied,0);
});

test('Fable AST-01: local watched context withholds future cues and their translations',()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),code=source.slice(source.indexOf('function aiChatContext()'),source.indexOf('function aiTranscriptEvidence('));let scope='watched';
 const player={workspaceMode:'player',cues:[{start:0,end:8,text:'past'},{start:10,end:20,text:'future marker'},{start:22,end:25,text:'later'}],activeIdx:1};
 const c={window:{},globalAssistantContext:()=>null,player,$:id=>id==='playerVideo'?{currentTime:15}:id==='aiTranscriptScope'?{value:scope}:null,document:{getElementById:()=>({textContent:'Fixture'})},subtitleSourceTime:(time,secondary)=>time-(secondary?3:2),AI_CHAT_CTX:3,pSecToTime:String,browserSubtitleRoleCues:()=>({source:player.cues,translation:[{start:10,end:20,text:'future translation'}]}),subtitleContextLanguage:()=> 'en',translationFor:()=> 'future translation',translationsForCues:(_rows,translations)=>[translations[0]?.text||'']};
 vm.createContext(c);vm.runInContext(code,c);let result=c.aiChatContext();assert.equal(result.cumle,'past');assert.equal(result.mevcut_ceviri,'');assert.equal(result.sonraki.length,0);assert(!JSON.stringify(result).includes('future'));
 scope='full';result=c.aiChatContext();assert.equal(result.cumle,'future marker');assert.equal(result.sonraki[0].metin,'later');scope='watched';player.cues=[{start:10,end:20,text:'future marker'}];assert(!JSON.stringify(c.aiChatContext()).includes('future marker'));
 player.cues=[{start:0,end:8,text:'past'},{start:10,end:20,text:'future marker'}];c.window.BrowserTranscriptSearch={buildTranscriptEvidence:(rows,_question,options)=>({rows,options})};vm.runInContext(source.slice(source.indexOf('function aiTranscriptEvidence('),source.indexOf('function renderAiChatContext(')),c);const evidence=c.aiTranscriptEvidence('future marker');assert.equal(evidence.rows.length,1);assert.equal(evidence.rows[0].text,'past');assert.equal(evidence.rows[0].translation,'');

});

test('Fable OYN-09: one existing player owner handles rate and sleep from every view',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),code=source.slice(source.indexOf('async function setPlayerPreferredRate('),source.indexOf('function sleepTimerLabel()'));
 let saved=0;const video={playbackRate:1},select={value:'0',options:[{value:'0'},{value:'30'},{value:'end'}],append(o){this.options.push(o);}},player={workspaceMode:'player',sleepTimerAt:0};
 const c={window:{},player,$:id=>id==='playerVideo'?video:select,document:{createElement:()=>({}),dispatchEvent(){}},Event:class{},syncPlayerSpeedControl(){},scheduleSave(){saved++;},syncPlayerMediaSession(){},scheduleBrowserMediaPreferenceSync(){},browserCommand:async()=>({ok:false})};
 vm.createContext(c);vm.runInContext(code,c);assert.equal(await c.window.PlayerPlaybackControls.setRate(1.75),true);assert.equal(player.learningBaseRate,1.75);assert.equal(video.playbackRate,1.75);assert.equal(saved,1);
 c.window.PlayerPlaybackControls.setSleep(30);assert(player.sleepTimerAt>Date.now());c.window.PlayerPlaybackControls.setSleep('end');assert.equal(player.sleepTimerAt,0);assert.equal(player.sleepTimerMode,'end');c.window.PlayerPlaybackControls.setSleep(0);assert.equal(player.sleepTimerMode,'');assert.equal(await c.window.PlayerPlaybackControls.setRate(Infinity),false);
 player.workspaceMode='browser';player.mediaKey='first';c.browserCommand=async()=>{player.mediaKey='second';return {ok:true,media:{playbackRate:2}};};assert.equal(await c.window.PlayerPlaybackControls.setRate(2),false);assert.equal(player.learningBaseRate,1.75);
});

test('Fable DUB-01: timing flags survive saved-project validation and stay reviewable',()=>{
 const model=require('../src/renderer/dub-workspace-model'),rows=model.groups([{key:'a',text:'fixture',sourceStart:1,sourceEnd:3,audioStart:1,audioEnd:2,status:'ready',clipped:true,tempoFallback:true}]);assert.equal(rows[0].clipped,true);assert.equal(rows[0].tempoFallback,true);assert.equal(rows[0].status,'review');
});

test('Fable ALT-03: cached explanation remains readable while a backend job owns the process',async()=>{
 const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),code=source.slice(source.indexOf('async function askExplain('),source.indexOf('const EXPLAIN_TITLES ='));
 const owner={kind:'translate',running:true},state={running:true},shown=[],warnings=[];
 const c={player:{subPath:'fixture.srt',cues:[{}],job:owner,explainCache:{cached:'Saved explanation'}},state,aiChatPreparing:false,explainCacheKey:()=> 'cached',EXPLAIN_TITLES:{sentence:'Explanation'},showAiAnswer:(...a)=>shown.push(a),logLine:(...a)=>warnings.push(a)};
 vm.createContext(c);vm.runInContext(code,c);await c.askExplain('sentence',0);assert.equal(shown[0][1],'Saved explanation');assert.equal(c.player.job,owner);assert.equal(state.running,true);assert.equal(warnings.length,0);
 delete c.player.explainCache.cached;await c.askExplain('sentence',0);assert.equal(c.player.job,owner);assert.equal(warnings.length,1,'uncached work must not replace an active backend owner');
});
