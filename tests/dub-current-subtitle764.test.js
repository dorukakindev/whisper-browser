'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function fixture(mode='browser',extra={}){
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);let media='A',config=async()=>({ok:true,ready:true}),picked=0,started=0,payloads=[];
 w.player={subPath:'C:/source.srt',sub2Path:'C:/translated.tr.srt',sub2Role:'translation',browserTracks:[{path:'C:/source.srt'},{path:'C:/translated.tr.srt'}]};
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};w.syncBrowserOcclusion=()=>{};
 w.BrowserDubAudioUI={context:()=>({mode,tabId:'tab',mediaKey:media,source:media,generation:1,visible:true,hasMedia:true,subtitleRange:{start:300,end:600},...(typeof extra==='function'?extra():extra)})};
 w.api={dubConfig:()=>config(),onDubEvent(){},latestDub:async()=>({ok:true,output:null}),selectFile:async()=>{picked++;return 'C:/manual.srt';},startDub:async payload=>{started++;payloads.push(payload);return {ok:true};}};
 el('dubGeneratorDialog').showModal=()=>el('dubGeneratorDialog').open=true;
 // Same load order as index.html: dub-run-info.js defines window.DubRunInfo before dub-generator-ui.js uses it.
 w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-run-info'),'utf8'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-generator-ui'),'utf8'));
 return {w,el,open:async()=>{el(mode==='player'?'playerDubGenerate':'browserDubGenerate').click();await tick();},changeMedia:()=>media='B',holdConfig:()=>new Promise(resolve=>{config=()=>new Promise(reply=>resolve(reply));}),get picked(){return picked;},get payloads(){return payloads;},get started(){return started;},close:()=>w.close()};
}
test('Normal browser button adopts the active translation and range without picking or generating',async()=>{const h=fixture();try{await h.open();assert.equal(h.el('dubSrtName').textContent,'translated.tr.srt');assert.equal(h.el('dubRangeStart').value,'5:00');assert.equal(h.el('dubRangeEnd').value,'10:00');assert.equal(h.picked,0);assert.equal(h.started,0);}finally{h.close();}});
test('Local player and assistant share the same preparation entry',async()=>{const h=fixture('player');try{await h.w.DubGeneratorUI.prepareCurrent();assert.equal(h.el('dubSrtName').textContent,'translated.tr.srt');assert.equal(h.started,0);}finally{h.close();}});
test('A manually selected SRT remains selected when reopening',async()=>{const h=fixture();try{await h.open();h.el('dubChooseSrt').click();await tick();await h.open();assert.equal(h.el('dubSrtName').textContent,'manual.srt');assert.equal(h.picked,1);}finally{h.close();}});
test('Source SRT is used when no translation is selected',async()=>{const h=fixture();try{h.w.player.sub2Role='comparison';await h.open();assert.equal(h.el('dubSrtName').textContent,'source.srt');}finally{h.close();}});
test('Browser rejects leftover paths and non-SRT sources',async()=>{for(const path of ['C:/stale.srt','C:/source.vtt']){const h=fixture();try{h.w.player.sub2Role='';h.w.player.subPath=path;await h.open();assert.notEqual(h.el('dubSrtName').textContent,path.split('/').pop());assert(h.el('dubGeneratorStart').disabled);}finally{h.close();}}});
test('A source change while configuration loads never adopts the old subtitle',async()=>{const h=fixture();try{const pending=h.holdConfig();h.el('browserDubGenerate').click();const reply=await pending;h.changeMedia();reply({ok:true,ready:true});await tick();assert.notEqual(h.el('dubSrtName').textContent,'translated.tr.srt');}finally{h.close();}});

test('a captured Browser track refreshed during dialog configuration uses its latest file, while a different selected track is not borrowed',async()=>{
 for(const sameTrack of [true,false]){
  const h=fixture();try{
   h.w.player.browserLoadedTrackId2='tr';h.w.player.browserTracks[1].id='tr';
   const configured=h.holdConfig();h.el('browserDubGenerate').click();const release=await configured;
   h.w.player.sub2Path='C:/refreshed.tr.srt';h.w.player.browserTracks[1]={id:sameTrack?'tr':'other-track',path:'C:/refreshed.tr.srt'};h.w.player.browserLoadedTrackId2=sameTrack?'tr':'other-track';
   release({ok:true,ready:true});await tick();await tick();
   assert.equal(h.el('dubSrtName').textContent,sameTrack?'refreshed.tr.srt':'—');
  }finally{h.close();}
 }
});

test('Ready lookup carries the chosen SRT and exact inherited clip',async()=>{const h=fixture();try{let query;h.w.api.latestDub=async value=>{query=value;return {ok:true,output:null};};await h.open();assert.deepEqual(JSON.parse(JSON.stringify(query)),{source:'A',srt:'C:/translated.tr.srt',range:{start:300,end:600}});}finally{h.close();}});
test('A ready-result lookup cannot replace a newly edited clip',async()=>{const h=fixture();try{let reply;h.w.api.latestDub=()=>new Promise(resolve=>reply=resolve);await h.open();h.el('dubRangeStart').value='6:00';reply({ok:true,output:{name:'Old clip',url:'file:///old.wav',range:{start:300,end:600}}});await tick();assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null);assert.equal(h.el('dubRangeStart').value,'6:00');}finally{h.close();}});

// --- Slice 1 / gereksinim 3, 4, 6, 8: Podcast kaynağı ve gizli oynatıcı sızıntısı ---
const VERSION='a'.repeat(64),track=(extra={})=>({state:'timed',format:'vtt',provenance:'publisher',status:'complete',...extra});
const SHA='c'.repeat(64);
function podcastFixture({workspace,mediaKey='rss:ep1',materialize,extra={},audio={}}={}){
 const ref={};
 const h=fixture('player',()=>ref.h?{mediaKey:ref.h.w.player.mediaKey,source:ref.h.w.player.mediaKey,generation:ref.h.w.player.generation,tabId:'player-video',subtitleRange:null,...extra}:{});ref.h=h;
 Object.assign(h.w.player,{mediaKey,generation:3,workspaceAudio:{entryId:'e1',sourceVersion:VERSION,mediaKey,generation:3,...audio}});
 const calls=[],integration={tools:0,opened:[]};
 h.w.PlayerSourceCatalogIntegration={podcastTools(){integration.tools++;},async openPodcastEntry(id,options){integration.opened.push([id,options.exactVersion,options.view]);return {};}};
 h.w.api.feedsRequest=async request=>{
  calls.push(request);
  if(request.action==='podcast-workspace')return {ok:true,sourceVersion:VERSION,workspace};
  if(request.action==='podcast-materialize'){const role=request.role||'source';return materialize?materialize(request):{ok:true,path:`C:/podcast-transcripts/${role}-dub.srt`,derived:true,format:'srt',role,revision:role+'rev0001',language:role==='translation'?'tr':''};}
  if(request.action==='podcast-exact-audio')return {available:true,sourceVersion:'copyver'};
  return {ok:false};
 };
 h.el('dubGeneratorDialog').close=()=>{h.el('dubGeneratorDialog').open=false;};
 // Spread copies getter VALUES once; the counters must stay live.
 return {...h,get started(){return h.started;},get picked(){return h.picked;},get payloads(){return h.payloads;},calls,integration,select:h.el('dubPodcastTrack'),notice:()=>h.el('dubPodcastNotice'),action:()=>h.el('dubPodcastAction'),srtName:()=>h.el('dubSrtName').textContent};
}
const bothTracks=()=>({transcript:track(),translation:track({provenance:'user',targetLanguage:'tr'})});
test('A hidden or media-less player never lends its leftover subtitle or clip range',async()=>{
 for(const extra of [{visible:false},{hasMedia:false}]){
  const h=fixture('player',extra);try{await h.open();assert.equal(h.el('dubSrtName').textContent,'—',JSON.stringify(extra));assert.equal(h.el('dubRangeEnabled').checked,false);}finally{h.close();}
 }
});
test('Podcast owner: the stored translation is the default candidate, its derived SRT is used and the leftover player subtitle is ignored',async()=>{
 const h=podcastFixture({workspace:bothTracks()});
 try{
  await h.open();await tick();
  assert.equal(h.srtName(),'translation-dub.srt');
  assert.deepEqual([...h.select.options].map(o=>o.value),['translation','source']);assert.equal(h.select.value,'translation');
  assert.equal(h.el('dubPodcastSource').hidden,false);
  assert.match(h.el('dubPodcastMeta').textContent,/tr/);assert.match(h.el('dubPodcastMeta').textContent,/translationr/);assert.match(h.el('dubPodcastMeta').textContent,/aaaaaaaa/,'bölüm sürümü görünür olmalı');
  const asked=h.calls.find(c=>c.action==='podcast-materialize');assert.deepEqual([asked.entryId,asked.sourceVersion,asked.role,asked.as],['e1',VERSION,'translation','srt']);
  assert.notEqual(h.srtName(),'translated.tr.srt');
 }finally{h.close();}
});
test('Choosing another Podcast track swaps the SRT and its version line',async()=>{
 const h=podcastFixture({workspace:bothTracks()});
 try{
  await h.open();await tick();
  h.select.value='source';h.select.dispatchEvent(new h.w.Event('change'));await tick();
  assert.equal(h.srtName(),'source-dub.srt');assert.equal(h.select.value,'source');assert.match(h.el('dubPodcastMeta').textContent,/sourcerev000/);
 }finally{h.close();}
});
test('Untimed or missing Podcast text explains itself and offers the existing timed-transcript tools',async()=>{
 for(const workspace of [{transcript:{state:'untimed',format:'plain',provenance:'publisher',status:'complete'}},{}]){
  const h=podcastFixture({workspace});
  try{
   await h.open();await tick();
   assert.equal(h.srtName(),'—');assert.equal(h.notice().hidden,false);assert.equal(h.action().hidden,false);
   assert.match(h.notice().textContent,/zamansız|kayıtlı transkript yok/);
   assert(!h.calls.some(c=>c.action==='podcast-materialize'),'zamanı olmayan metin için SRT üretilmez');
   h.action().click();await tick();
   assert.equal(h.integration.tools,1,'mevcut “önce zamanlı transkript oluştur” girişi çağrılmalı');assert.equal(h.el('dubGeneratorDialog').open,false);
  }finally{h.close();}
 }
});
const timeline=(sha=SHA,extra={})=>({clock:'absolute-media-seconds',sha256:sha,sourceVersion:VERSION,extractionStart:0,...extra});
const asrTracks=(extra={})=>({transcript:track({provenance:'asr',timeline:timeline(SHA,extra)}),translation:track({provenance:'asr',targetLanguage:'tr',timeline:timeline(SHA,extra)})});
const exactAudio={exactAudio:true,sourceBinding:{sha256:SHA}};
test('Whisper tracks follow the player rule: timed only on the exact audio copy whose sha256 matches the track timeline',async()=>{
 const stream=podcastFixture({workspace:asrTracks()});
 try{
  await stream.open();await tick();
  assert.equal(stream.srtName(),'—');assert.equal(stream.action().hidden,false);assert.match(stream.notice().textContent,/kopya|copy/i);
  assert([...stream.select.options].every(o=>o.disabled),'akıştaki ses için Whisper zamanları doğrulanmamış');assert(!stream.calls.some(c=>c.action==='podcast-materialize'));
  stream.action().click();await tick();await tick();
  assert.deepEqual(stream.integration.opened,[['e1','copyver','podcast']],'Whisper’ın kullandığı ses kopyası mevcut girişle açılmalı');
 }finally{stream.close();}
 const exact=podcastFixture({workspace:asrTracks(),audio:exactAudio});
 try{await exact.open();await tick();assert.equal(exact.srtName(),'translation-dub.srt');assert.equal(exact.notice().hidden,true);}finally{exact.close();}
 const otherCopy=podcastFixture({workspace:asrTracks(),audio:{exactAudio:true,sourceBinding:{sha256:'d'.repeat(64)}}});
 try{await otherCopy.open();await tick();assert.equal(otherCopy.srtName(),'—','başka bir kopyanın sha256’sı kabul edilmez');assert(!otherCopy.calls.some(c=>c.action==='podcast-materialize'));}finally{otherCopy.close();}
 const noProof=podcastFixture({workspace:{transcript:track({provenance:'asr'}),translation:track({provenance:'asr',targetLanguage:'tr'})},audio:exactAudio});
 try{await noProof.open();await tick();assert.equal(noProof.srtName(),'—','zaman ekseni kanıtı olmayan Whisper izi kabul edilmez');}finally{noProof.close();}
});
test('A verified partial range keeps its offset and is not rejected for being shorter than the episode; its range is shown',async()=>{
 const partial=podcastFixture({workspace:{transcript:track({provenance:'asr',coverage:{start:600,end:750},timeline:timeline(SHA,{extractionStart:600})}),translation:track({provenance:'asr',targetLanguage:'tr',coverage:{start:600,end:750},timeline:timeline(SHA,{extractionStart:600})})},audio:exactAudio});
 try{
  await partial.open();await tick();
  assert.equal(partial.srtName(),'translation-dub.srt');assert.match([...partial.select.options].map(o=>o.textContent).join('|'),/10:00–12:30/,'kapsanan aralık seçicide görünmeli');
  assert.equal(partial.notice().hidden,true);
 }finally{partial.close();}
});
test('Publisher timed tracks need no audio-copy proof, and the same title on a different audio version is never matched',async()=>{
 const publisher=podcastFixture({workspace:{transcript:track({provenance:'publisher'}),translation:track({provenance:'asr',targetLanguage:'tr'})}});
 try{await publisher.open();await tick();assert.equal(publisher.srtName(),'translation-dub.srt','yayıncı kaynağı için ek kanıt gerekmez');}finally{publisher.close();}
 const sibling=podcastFixture({workspace:asrTracks(),audio:{exactAudio:true,sourceBinding:{sha256:SHA},title:'Same title'}});
 sibling.w.api.feedsRequest=async request=>{sibling.calls.push(request);return request.action==='podcast-workspace'?{ok:false,error:'Podcast audio source changed.'}:{ok:false};};
 try{await sibling.open();await tick();assert.equal(sibling.srtName(),'—','servis başka ses sürümünü reddettiğinde hiçbir iz benimsenmez');assert.equal(sibling.notice().hidden,false);}finally{sibling.close();}
});
test('A late track resolution for a previous episode never changes the current one',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const h=podcastFixture({workspace:bothTracks(),materialize:async request=>{await gate;return {ok:true,path:'C:/podcast-transcripts/late-'+request.role+'.srt',derived:true,format:'srt',role:request.role,revision:'late'};}});
 try{
  const opening=h.open();await tick();
  Object.assign(h.w.player,{mediaKey:'rss:ep2',workspaceAudio:{entryId:'e2',sourceVersion:'b'.repeat(64),mediaKey:'rss:ep2',generation:3}});
  release();await opening;await tick();await tick();
  assert.notEqual(h.srtName(),'late-translation.srt','bayat çözüm yeni bölüme uygulanmamalı');
 }finally{h.close();}
});
test('A derivation failure is shown as is and no unusable SRT is adopted',async()=>{
 const h=podcastFixture({workspace:bothTracks(),materialize:async()=>({ok:false,error:'Transcript timing could not be preserved for dubbing / Dublaj için döküm zamanları korunamadı.'})});
 try{await h.open();await tick();assert.equal(h.srtName(),'—');assert.equal(h.notice().hidden,false);assert.match(h.notice().textContent,/korunamadı|preserved/);}finally{h.close();}
});
test('A manually selected SRT is kept when a Podcast is reopened',async()=>{
 const h=podcastFixture({workspace:bothTracks()});
 try{
  await h.open();await tick();h.el('dubChooseSrt').click();await tick();assert.equal(h.srtName(),'manual.srt');
  await h.open();await tick();assert.equal(h.srtName(),'manual.srt','elle seçim Podcast izi tarafından ezilmemeli');
 }finally{h.close();}
});

test('late Podcast materialization cannot overwrite a manual SRT picked while it was pending',async()=>{
 let release;const h=podcastFixture({workspace:bothTracks(),materialize:()=>new Promise(resolve=>release=resolve)});
 try{
  await h.open();await tick();assert.equal(typeof release,'function');
  h.el('dubChooseSrt').click();await tick();assert.equal(h.srtName(),'manual.srt');
  release({ok:true,path:'C:/translation-late.srt',revision:'late'});await tick();await tick();
  assert.equal(h.srtName(),'manual.srt');assert.equal(h.select.value,'manual');
 }finally{h.close();}
});

test('two pending Podcast track choices apply only the latest choice even when replies finish in reverse order',async()=>{
 const h=podcastFixture({workspace:bothTracks()}),pending={};
 try{
  await h.open();await tick();const original=h.w.api.feedsRequest;
  h.w.api.feedsRequest=request=>request.action==='podcast-materialize'?new Promise(resolve=>pending[request.role]=resolve):original(request);
  for(const role of ['source','translation']){h.select.value=role;h.select.dispatchEvent(new h.w.Event('change'));await tick();}
  pending.translation({ok:true,path:'C:/translation-newest.srt',revision:'newest'});await tick();
  pending.source({ok:true,path:'C:/source-obsolete.srt',revision:'obsolete'});await tick();
  assert.equal(h.srtName(),'translation-newest.srt');assert.equal(h.select.value,'translation');
 }finally{h.close();}
});

test('Generation never starts from a stale Podcast track: a changed stored transcript is reloaded and the start is refused once',async()=>{
 let revision='one';
 const h=podcastFixture({workspace:bothTracks(),materialize:async request=>({ok:true,path:`C:/podcast-transcripts/${request.role}-${revision}.srt`,derived:true,format:'srt',role:request.role,revision})});
 h.w.api.planDub=async()=>({ok:true,groups:[{key:'g1',seconds:1,text:'Merhaba',start:0,end:1000}],sourceHash:'hash',skipped:0});
 try{
  await h.open();await tick();assert.equal(h.srtName(),'translation-one.srt');
  revision='two';
  h.el('dubGeneratorStart').click();for(let i=0;i<6;i++)await tick();
  assert.equal(h.started,0,'eski izle üretim başlamamalı');
  assert.equal(h.srtName(),'translation-two.srt','güncel iz yüklenmeli');assert.equal(h.notice().hidden,false);assert.match(h.notice().textContent,/değişti|changed/);
  h.el('dubGeneratorStart').click();for(let i=0;i<60&&h.started<1;i++)await tick();
  assert.equal(h.started,1,'güncel izle ikinci başlatma çalışır');
  assert.equal(h.payloads.at(-1).srt,'C:/podcast-transcripts/translation-two.srt','servis çağrısı güncel izi taşımalı, eskisini değil');
  assert(!h.payloads.some(p=>/translation-one/.test(p.srt)),'eski izle hiçbir üretim isteği gitmemeli');
  assert.equal(h.payloads.at(-1).source,'rss:ep1','istek bölümün kimliğini taşımalı');
 }finally{h.close();}
});

test('A failed plan preview stops generation with a visible reason and never reaches the service',async()=>{
 const h=podcastFixture({workspace:bothTracks()});
 h.w.api.planDub=async()=>({ok:false,error:'SRT planı hazırlanamadı: test nedeni.'});
 try{
  await h.open();await tick();
  h.el('dubGeneratorStart').click();for(let i=0;i<6;i++)await tick();
  assert.equal(h.started,0);assert.match(h.el('dubGeneratorDetails').textContent,/test nedeni/);
 }finally{h.close();}
});

test('generation rechecks timing provenance when a publisher transcript is replaced by an unverified Whisper result',async()=>{
 const h=podcastFixture({workspace:bothTracks()});h.w.api.planDub=async()=>({ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0});
 try{
  await h.open();await tick();assert.equal(h.srtName(),'translation-dub.srt');
  const original=h.w.api.feedsRequest;h.w.api.feedsRequest=request=>request.action==='podcast-workspace'?Promise.resolve({ok:true,sourceVersion:VERSION,workspace:asrTracks()}):original(request);
  h.el('dubGeneratorStart').click();for(let i=0;i<20;i++)await tick();
  assert.equal(h.started,0,'new timing proof must be checked before producing speech');assert.match(h.notice().textContent,/doğrulanmadı|not verified/);
 }finally{h.close();}
});

// --- Slice 1 / gereksinim 3: Sahne'nin gerçek shelf "Altyazıdan dublaj" girişi ---
// Gerçek cinema-sahne.js + gerçek dub-generator-ui.js + gerçek index.html panel DOM'u. Sahne kabuğu (sahne.js) ve
// oynatıcıya devir (openPodcastEntry) yerine, mevcut sahne-integration düzeneğindeki gibi dar benzetimler kullanılır.
function sahneDubFixture({tracks=[],snapshot={}}={}){
 const state={visible:false,opened:[],handoff:true,calls:[],lookups:[]},ref={};
 const h=fixture('player',()=>ref.h?{mediaKey:ref.h.w.player.mediaKey,source:ref.h.w.player.mediaKey,generation:ref.h.w.player.generation,tabId:'player-video',visible:state.visible,hasMedia:!!ref.h.w.player.mediaKey,subtitleRange:ref.h.w.player.mediaKey==='local:A'?{start:300,end:600}:null,backgroundSource:ref.h.w.player.localPath||''}:{});ref.h=h;
 const w=h.w,document=w.document;
 // Hidden local player: media A with its old subtitles, translation and range.
 Object.assign(w.player,{workspaceMode:'player',mediaKey:'local:A',generation:1,localPath:'C:/Videos/A.mkv',subPath:'C:/leftover/A.srt',sub2Path:'C:/leftover/A.tr.srt',sub2Role:'translation',cues:[],cues2:[],browserTracks:[]});
 document.getElementById('playerLayer')?.classList.add('hidden');
 w.Sahne=class{constructor(host,adapter,opts){this.a=adapter;this.o=opts;this.root=document.createElement('section');host.append(this.root);}prefs(){return {};}destroy(){this.a.releaseSlot?.();this.root.remove();}};
 w.requestAnimationFrame=()=>0;w.ResizeObserver=class{observe(){}disconnect(){}};w.browserSubtitleRoleCues=()=>({source:[],translation:[]});w.renderAbMarkers=()=>{};
 w.PlayerWorkspaceIntegration={isPodcastMode:()=>false,setPodcastMode(){},snapshot:()=>null,getTranscriptTracks:()=>[]};
 const snap={mediaKey:'shelf:B',generation:1,entryId:'entry-B',sourceVersion:VERSION,title:'Episode B',duration:60,capabilities:{seek:{support:'yes'}},...snapshot};
 w.MediaShelfUI={readSnapshot:()=>snap,isPodcastMode:()=>true,openPodcastMode:async()=>{},getTranscriptTracks:()=>tracks,executeExisting:async()=>({ok:true})};
 // Narrow stand-in for the real handoff: a new media key resets localPath and the subtitle selection, then the player shows B.
 w.PlayerSourceCatalogIntegration={podcastTools(){},async openPodcastEntry(id,options){
  state.opened.push([id,options.exactVersion,options.view]);if(!state.handoff)return;
  Object.assign(w.player,{mediaKey:'rss:B',generation:2,localPath:'',subPath:'C:/podcast-transcripts/B-source.vtt',sub2Path:'',sub2Role:'',workspaceAudio:{entryId:id,sourceVersion:options.exactVersion||VERSION,mediaKey:'rss:B',generation:2,...(options.exactVersion?{exactAudio:true,sourceBinding:{sha256:SHA}}:{})}});state.visible=true;}};
 w.api.feedsRequest=async request=>{
  state.calls.push(request);
  if(request.entryId!=='entry-B')return {ok:false,error:'unknown entry'};
  if(request.action==='podcast-workspace')return {ok:true,sourceVersion:VERSION,workspace:bothTracks()};
  if(request.action==='podcast-materialize')return {ok:true,path:`C:/podcast-transcripts/B-${request.role}-dub.srt`,derived:true,format:'srt',role:request.role,revision:'B'+request.role,language:''};
  if(request.action==='podcast-exact-audio')return {available:true,sourceVersion:'copyver'};
  return {ok:false};
 };
 w.api.latestDub=async lookup=>{state.lookups.push(JSON.parse(JSON.stringify(lookup)));return {ok:true,output:null};};
 w.api.planDub=async()=>({ok:true,groups:[{key:'g1',seconds:1,text:'Merhaba',start:0,end:1000}],sourceHash:'hash',skipped:0});
 h.el('dubGeneratorDialog').close=()=>{h.el('dubGeneratorDialog').open=false;};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/cinema-sahne'),'utf8'));
 return {...h,get started(){return h.started;},get payloads(){return h.payloads;},state,dialog:h.el('dubGeneratorDialog')};
}
test('Sahne shelf dub button: the panel, candidate track, range and generation request belong to episode B and carry nothing of the hidden media A',async()=>{
 const f=sahneDubFixture();
 try{
  assert.equal((await f.w.CinemaSahne.openShelf()).ok,true);
  const adapter=f.w.CinemaSahne.current.a;assert.equal(adapter.caps.dub,true);
  assert.equal((await adapter.cmd('dub')).ok,true);
  for(let i=0;i<6;i++)await tick();
  assert.deepEqual(f.state.opened,[['entry-B',undefined,'podcast']],'bölüm mevcut Podcast girişiyle oynatıcıya devredilir');
  assert.equal(f.dialog.open,true);
  assert.equal(f.el('dubSrtName').textContent,'B-translation-dub.srt','aday iz B’nin kayıtlı çevirisi');
  assert.equal(f.el('dubRangeEnabled').checked,false,'A’nın aralığı taşınmamalı');
  assert(f.state.calls.length>0&&f.state.calls.every(c=>c.entryId==='entry-B'),'servis çağrılarının hepsi B’ye ait');
  const lookup=f.state.lookups.at(-1);assert.equal(lookup.source,'rss:B','hazır-sonuç sorgusu B kimliği ile');assert.equal(lookup.srt,'C:/podcast-transcripts/B-translation-dub.srt');assert.equal(lookup.range,null,'A’nın aralığı sorguya girmemeli');
  f.el('dubGeneratorStart').click();for(let i=0;i<60&&f.started<1;i++)await tick();
  assert.equal(f.started,1);
  const payload=f.payloads.at(-1);
  assert.equal(payload.source,'rss:B');assert.equal(payload.srt,'C:/podcast-transcripts/B-translation-dub.srt');assert.equal(payload.range,null);
  assert.doesNotMatch(JSON.stringify(payload),/local:A|A\.mkv|leftover|A\.srt|A\.tr\.srt/,'üretim isteğinde A’ya ait alan olmamalı');
 }finally{f.close();}
});
test('Sahne shelf dub button: a Whisper episode opens its verified audio copy first; a failed handoff or a changed shelf source never opens the panel',async()=>{
 const exact={entryId:'entry-B',sourceVersion:VERSION};
 const tracks=[{id:'source',role:'source',revision:'r',timed:false,timestamped:true,timingState:'needs-review',exactSource:exact,text:'Saved',cues:[]}];
 const ok=sahneDubFixture({tracks});
 try{
  await ok.w.CinemaSahne.openShelf();const result=await ok.w.CinemaSahne.current.a.cmd('dub');
  assert.equal(result.code,'exact-unavailable','kanıt sürümü eşleşmiyorsa açılmaz (copyver ≠ bölüm sürümü)');assert.deepEqual(ok.state.opened,[]);assert.equal(ok.dialog.open,false);
 }finally{ok.close();}
 const exactOk=sahneDubFixture({tracks:[{...tracks[0],exactSource:{entryId:'entry-B',sourceVersion:'copyver'}}]});
 try{
  await exactOk.w.CinemaSahne.openShelf();const result=await exactOk.w.CinemaSahne.current.a.cmd('dub');
  for(let i=0;i<4;i++)await tick();
  assert.equal(result.ok,true);assert.deepEqual(exactOk.state.opened,[['entry-B','copyver','podcast']]);assert.equal(exactOk.dialog.open,true);
 }finally{exactOk.close();}
 const failed=sahneDubFixture();failed.state.handoff=false;
 try{
  await failed.w.CinemaSahne.openShelf();const result=await failed.w.CinemaSahne.current.a.cmd('dub');
  assert.equal(result.code,'source-changed');assert.equal(failed.dialog.open,false,'devir hedef bölümü getirmediyse panel açılmaz');
  assert.equal(failed.el('dubSrtName').textContent,'—','A’nın altyazısı panele sızmaz');
 }finally{failed.close();}
 const noEntry=sahneDubFixture({snapshot:{entryId:''}});
 try{
  await noEntry.w.CinemaSahne.openShelf();const result=await noEntry.w.CinemaSahne.current.a.cmd('dub');
  assert.equal(result.code,'needs-player');assert.match(result.message,/oynatıcıda/);assert.deepEqual(noEntry.state.opened,[]);assert.equal(noEntry.dialog.open,false);
 }finally{noEntry.close();}
});
