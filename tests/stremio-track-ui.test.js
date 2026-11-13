'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let i=0;i<50;i++){if(fn())return;await tick();}assert.fail('UI did not settle');}
async function fixture(t){
 const dom=new JSDOM('<main></main><div id="playerLayer"><video id="playerVideo"></video><div id="playerStage"></div><div id="playerControls"><details id="playerMore"></details></div><select id="playerStreamAudio"><option value="0">English</option><option value="1">Türkçe</option></select><section class="sh sh-local"><div class="sh-top-r"></div><div class="sh-dock-tools"></div></section></div>',{url:'https://test.invalid',pretendToBeVisual:true,runScripts:'outside-only'});
 const w=dom.window,d=w.document;t.after(()=>w.close());w.UiLocale={get:()=> 'tr'};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));this.remove();};
 w.player={mediaKey:'',generation:0,workspaceMode:'player',subPath:'',sub2Path:'',cues:[],cues2:[]};
 w.api={stremio:async r=>r.action==='streams'?{ok:true,token:'sources',streams:[{id:'one',name:'Source',addonName:'Fixture',playable:true,kind:'url'}],failures:[]}:r.action==='play'?{ok:true,key:'stremio:test',url:'https://cdn.example/video.mp4'}:r.action==='subtitles'?{ok:true,token:'subs',subtitles:[]}:{ok:true}};
 w.MediaHubUI={playStream:async r=>{w.player.mediaKey=r.key;w.player.generation++;return true;}};
 w.eval('var player=window.player;var setSubtitleMode=mode=>{window.subtitleMode=mode;};var currentSubtitleMode=()=>window.subtitleMode||"both";');
 w.eval(fs.readFileSync(require.resolve('../src/renderer/stremio-ui.js'),'utf8'));
 await w.StremioUI.openStreams({type:'movie',id:'tt1234567',name:'Fixture',autoplayBest:true});
 await until(()=>w.StremioUI._test.session());await tick();
 return {w,d,UI:w.StremioUI,video:d.getElementById('playerVideo'),find:text=>Array.from(d.querySelectorAll('.sx-player-panel button')).find(b=>b.textContent.includes(text))};
}
test('track shortcuts follow cinema, study and podcast stages and disappear with the source',async t=>{
 const f=await fixture(t),stage=f.d.querySelector('.sh');
 assert.equal(stage.querySelectorAll('.sh-dock-tools .sx-track-access-btn').length,2);
 stage.querySelector('.sh-dock-tools').remove();stage.className='sh sh-study';await tick();
 assert.equal(stage.querySelectorAll('.sh-top-r .sx-track-access-btn').length,2);
 stage.className='sh sh-podcast';await tick();f.d.querySelector('[data-sx-track="audio"]').click();await tick();
 assert(stage.querySelector('.sx-player-panel'));assert.equal(f.d.querySelector('#sxTab-audio').getAttribute('aria-selected'),'true');
 f.w.player.mediaKey='other';f.video.dispatchEvent(new f.w.Event('loadedmetadata'));await tick();
 assert.equal(f.d.querySelector('.sx-track-access'),null);assert.equal(f.d.querySelector('.sx-player-panel'),null);
});
test('HLS audio uses the canonical control, while inactive native samples and old-source buttons cannot select',async t=>{
 const f=await fixture(t);let changed=0,commands=0;
 f.w.NativePlayerUI={active:()=>false,state:()=>({tracks:[{id:99,type:'audio',title:'Stale native'}]}),command:()=>{commands++;return{ok:true};}};
 f.w.player.hls={audioTracks:[{name:'English'},{name:'Türkçe'}],audioTrack:0};
 f.w.player.hls.audioTracks[0].details=f.w.player.hls.audioTracks[0];
 f.d.getElementById('playerStreamAudio').addEventListener('change',e=>{changed++;f.w.player.hls.audioTrack=Number(e.target.value);});
 f.UI.togglePanel('audio');await tick();assert(!f.d.querySelector('.sx-player-panel').textContent.includes('Stale native'));
 f.find('Türkçe').click();await tick();assert.equal(changed,1);assert.equal(f.w.player.hls.audioTrack,1);assert.equal(commands,0);
 const old=f.find('English');f.w.player.generation++;old.click();await tick();assert.equal(changed,1);
});
test('native failures stay visible and embedded selection hides custom overlays without deleting text',async t=>{
 const f=await fixture(t);let ok=false;const calls=[];
 f.w.player.cues=[{text:'Keep transcript'}];
 const sample={tracks:[]};f.w.NativePlayerUI={active:()=>true,state:()=>sample,command:async(name,value)=>{calls.push([name,value]);return{ok};}};
 f.UI.togglePanel('audio');assert.equal(f.find('Türkçe'),undefined);
 sample.tracks=[{id:2,type:'audio',title:'Türkçe'},{id:3,type:'sub',title:'Embedded English'}];f.video.dispatchEvent(new f.w.Event('timeupdate'));await tick();
 f.find('Türkçe').click();await tick();assert.match(f.d.querySelector('.sx-status').textContent,/değiştirilemedi/);
 f.UI.togglePanel('subs',{keepOpen:true});f.find('Embedded English').click();await tick();assert.match(f.d.querySelector('.sx-track-status').textContent,/değiştirilemedi/);assert.equal(f.w.subtitleMode,undefined);
 ok=true;f.find('Embedded English').click();await tick();assert.equal(f.w.subtitleMode,'off');assert.equal(f.w.player.cues[0].text,'Keep transcript');
 const old=f.find('Embedded English'),count=calls.length;f.w.player.generation++;old.click();await tick();assert.equal(calls.length,count);
});
test('HTML subtitle and audio tracks use their own media objects and reject changed generations',async t=>{
 const f=await fixture(t),sub={kind:'subtitles',language:'tr',label:'Embedded Turkish',mode:'disabled'},audio=[{label:'English',enabled:true},{label:'Türkçe',enabled:false}];
 Object.defineProperty(f.video,'textTracks',{value:[sub]});Object.defineProperty(f.video,'audioTracks',{value:audio});
 f.UI.togglePanel('subs');f.find('Embedded Turkish').click();await tick();assert.equal(sub.mode,'showing');assert.equal(f.w.subtitleMode,'off');
 f.UI.togglePanel('audio',{keepOpen:true});f.find('Türkçe').click();await tick();assert.equal(audio[0].enabled,false);assert.equal(audio[1].enabled,true);
 const old=f.find('English');f.w.player.generation++;old.click();await tick();assert.equal(audio[0].enabled,false);
});
test('HLS subtitles are selectable and an HLS stream never advertises a working native fallback',async t=>{
 const f=await fixture(t);let started=0;
 const hls=f.w.player.hls={audioTracks:[],subtitleTracks:[{name:'Stream English'},{name:'Stream Turkish'}],subtitleTrack:-1,subtitleDisplay:false};
 f.w.NativePlayerUI={active:()=>false,start:async()=>{started++;return true;},state:()=>({tracks:[]})};
 f.UI.togglePanel('subs');f.find('Stream Turkish').click();await tick();assert.equal(hls.subtitleTrack,1);assert.equal(hls.subtitleDisplay,true);assert.equal(f.w.subtitleMode,'off');
 const old=f.find('Stream English');f.w.player.generation++;old.click();await tick();assert.equal(hls.subtitleTrack,1);
 f.w.player.generation--;f.UI.togglePanel('audio',{keepOpen:true});f.find('Native oynatıcıyı kullan').click();await tick();assert.equal(started,0);assert.match(f.d.querySelector('.sx-status').textContent,/HLS/);
});

test('a late manual addon read cannot replace a newer embedded subtitle choice',async t=>{
 const f=await fixture(t),base=f.w.api.stremio;let release,reading=false,committed=false;
 f.w.api.stremio=async r=>r.action==='subtitles'?{ok:true,token:'subs',subtitles:[{id:'s',label:'Addon subtitle',language:'en',addonName:'Fixture'}]}:r.action==='subtitle-save'?{ok:true,filePath:'addon.srt',language:'en'}:base(r);
 f.w.addSubtitleOption=()=>{};
 f.w.loadSubtitle=async(_path,_secondary,options={})=>{reading=true;await new Promise(r=>release=r);if(options.isCancelled?.())return;committed=true;f.w.player.subPath='addon.srt';f.w.subtitleMode='source';return{ok:true,loaded:true};};
 f.w.NativePlayerUI={active:()=>true,state:()=>({tracks:[{id:3,type:'sub',title:'Embedded English'}]}),command:async()=>({ok:true})};
 f.UI.togglePanel('subs');await until(()=>f.find('Kullan'));f.find('Kullan').click();await until(()=>reading);
 f.find('Embedded English').click();await tick();release();await tick();
 assert.equal(committed,false);assert.equal(f.w.subtitleMode,'off');
});

test('an explicit embedded choice cancels an earlier automatic addon download',async t=>{
 const f=await fixture(t),base=f.w.api.stremio;let release,saving=false,loads=0;
 f.w.api.stremio=async r=>r.action==='subtitles'?{ok:true,token:'subs',subtitles:[{id:'s',preferred:true,label:'Automatic',language:'en',addonName:'Fixture'}]}:r.action==='subtitle-save'?(saving=true,await new Promise(resolve=>release=()=>resolve({ok:true,filePath:'automatic.srt',language:'en'}))):base(r);
 f.w.addSubtitleOption=()=>{};f.w.loadSubtitle=async()=>{loads++;return{ok:true,loaded:true};};
 await f.UI.openStreams({type:'movie',id:'tt1234567',name:'Fixture',autoplayBest:true});await until(()=>saving);
 f.w.NativePlayerUI={active:()=>true,state:()=>({tracks:[{id:3,type:'sub',title:'Embedded English'}]}),command:async()=>({ok:true})};
 f.UI.togglePanel('subs');f.find('Embedded English').click();await tick();release();await tick();
 assert.equal(loads,0);assert.equal(f.w.subtitleMode,'off');
});

test('native track state redraw does not cancel the addon selection that disabled it',async t=>{
 const f=await fixture(t),base=f.w.api.stremio;let committed=false;
 const sample={tracks:[{id:3,type:'sub',title:'Embedded English',selected:true}]};
 f.w.api.stremio=async r=>r.action==='subtitles'?{ok:true,token:'subs',subtitles:[{id:'s',label:'Addon subtitle',language:'en',addonName:'Fixture'}]}:r.action==='subtitle-save'?{ok:true,filePath:'addon.srt',language:'en'}:base(r);
 const select=f.d.createElement('select');select.id='playerSubSelect';select.append(new f.w.Option('Off',''));f.d.body.append(select);
 // The real loader rejects a read whose path was not explicitly selected.
 f.w.addSubtitleOption=(path,label)=>select.append(new f.w.Option(label||path,path));
 f.w.loadSubtitle=async(path,_secondary,options={})=>{if(options.select===true)select.value=path;await tick();if(options.isCancelled?.()||select.value!==path)return;committed=true;f.w.player.subPath=path;return{ok:true,loaded:true};};
 f.w.NativePlayerUI={active:()=>true,state:()=>sample,command:async()=>{sample.tracks[0].selected=false;f.video.dispatchEvent(new f.w.Event('timeupdate'));await tick();return{ok:true};}};
 f.UI.togglePanel('subs');await until(()=>f.find('Kullan'));f.find('Kullan').click();await until(()=>committed);
 assert.equal(committed,true);assert.equal(f.w.player.subPath,'addon.srt');
});
