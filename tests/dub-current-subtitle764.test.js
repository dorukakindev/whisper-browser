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
test('A browser translation rejected by the current source cannot open as a dubbing input',async()=>{
 const h=fixture('browser',{subtitleTrack:null,subtitleRange:null});
 try{await h.w.DubGeneratorUI.prepareCurrent();assert.equal(h.el('dubSrtName').textContent,'—');assert.equal(h.el('dubRangeEnabled').checked,false);assert.equal(h.started,0);}
 finally{h.close();}
});

test('saved audio is not attached after the automatically selected subtitle changes behind the open panel',async()=>{
 const h=fixture();try{let attached=0;h.w.api.latestDub=async()=>({ok:true,output:{id:'saved',name:'Saved voice',url:'file:///saved.wav'}});h.w.BrowserDubAudioUI.attachGenerated=async()=>{attached++;return true;};
 await h.open();h.w.player.sub2Path='C:/another.tr.srt';h.w.player.browserTracks[1]={path:h.w.player.sub2Path};h.el('dubGeneratorUse').click();for(let i=0;i<6;i++)await tick();assert.equal(attached,0);
 }finally{h.close();}
});
test('A manually selected SRT remains selected when reopening',async()=>{const h=fixture();try{await h.open();h.el('dubChooseSrt').click();await tick();await h.open();assert.equal(h.el('dubSrtName').textContent,'manual.srt');assert.equal(h.picked,1);}finally{h.close();}});

test('reopening preparation adopts a changed automatic track on the same video and clears the previous track result',async()=>{
 const h=fixture();try{
  h.w.api.latestDub=async()=>({ok:true,output:{name:'Old track output',url:'file:///old.wav',syncInvalid:true}});
  await h.open();assert.equal(h.el('dubSrtName').textContent,'translated.tr.srt');assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),'file:///old.wav');
  h.w.api.latestDub=async()=>({ok:true,output:null});
  h.w.player.sub2Path='C:/new-translation.tr.srt';h.w.player.browserTracks[1]={id:'new-translation',path:h.w.player.sub2Path};h.w.player.browserLoadedTrackId2='new-translation';
  await h.open();assert.equal(h.el('dubSrtName').textContent,'new-translation.tr.srt');assert.equal(h.started,0);assert.equal(h.picked,0);assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null);assert(h.el('dubGeneratorOutput').classList.contains('hidden'));
 }finally{h.close();}
});
test('Source SRT is used when no translation is selected',async()=>{const h=fixture();try{h.w.player.sub2Role='comparison';await h.open();assert.equal(h.el('dubSrtName').textContent,'source.srt');}finally{h.close();}});

test('a previously prepared plan cannot start on another media using the same subtitle path',async()=>{
 const h=fixture();try{
  h.w.api.planDub=async()=>({ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0});
  await h.open();h.el('dubPlanPrepare').click();for(let i=0;i<8;i++)await tick();assert(h.w.DubGeneratorUI.experience().plan);
  h.changeMedia();h.el('dubGeneratorStart').click();for(let i=0;i<8;i++)await tick();assert.equal(h.started,0);assert.equal(h.el('dubSrtName').textContent,'—');
 }finally{h.close();}
});

test('an unscoped saved audio preview is cleared when the first automatic subtitle is adopted',async()=>{
 const h=fixture();try{
  h.w.player.subPath='';h.w.player.sub2Path='';h.w.player.browserTracks=[];
  h.w.api.latestDub=async()=>({ok:true,output:{name:'Unscoped saved audio',url:'file:///unscoped.wav',syncInvalid:true}});
  await h.open();assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),'file:///unscoped.wav');
  h.w.api.latestDub=async()=>({ok:true,output:null});h.w.player.subPath='C:/new.srt';h.w.player.browserTracks=[{id:'new',path:'C:/new.srt'}];
  await h.open();assert.equal(h.el('dubSrtName').textContent,'new.srt');assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null);assert(h.el('dubGeneratorOutput').classList.contains('hidden'));
 }finally{h.close();}
});

test('an open preparation never starts the previous subtitle after the media or selected track changes',async()=>{
 for(const change of ['media','track']){
  const h=fixture();try{
   h.w.api.planDub=async()=>({ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0});
   await h.open();
   if(change==='media')h.changeMedia();else {h.w.player.sub2Path='C:/new.tr.srt';h.w.player.browserTracks[1]={path:'C:/new.tr.srt'};}
   h.el('dubGeneratorStart').click();for(let i=0;i<50;i++)await tick();
   assert.equal(h.started,0,change+' must invalidate the old preparation');
  }finally{h.close();}
 }
});

test('a plan finishing after the selected automatic track changes is not shown or generated',async()=>{
 const h=fixture();let release;try{
  h.w.api.planDub=()=>new Promise(resolve=>release=resolve);await h.open();h.el('dubGeneratorStart').click();
  for(let i=0;i<8&&!release;i++)await tick();assert.equal(typeof release,'function');
  h.w.player.sub2Path='C:/new.tr.srt';h.w.player.browserTracks[1]={path:'C:/new.tr.srt'};
  release({ok:true,groups:[{key:'old',seconds:1,text:'Old track',start:0,end:1000}],sourceHash:'old',skipped:0});
  for(let i=0;i<8;i++)await tick();assert.equal(h.started,0);assert.equal(h.w.DubGeneratorUI.experience().plan,null);
 }finally{h.close();}
});

test('an old explicit preflight confirmation cannot approve a newly selected automatic track',async()=>{
 const h=fixture();try{
  h.w.Element.prototype.scrollIntoView=()=>{};
  h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');
  h.w.api.planDub=async()=>({ok:true,groups:[{key:'dense',seconds:1,text:'[untranslated] Long sentence '.repeat(50),start:0,end:1000}],sourceHash:'old',skipped:0});
  await h.open();h.el('dubGeneratorStart').click();for(let i=0;i<12;i++)await tick();
  const gate=h.el('dubGenerationGate');assert.equal(gate.hidden,false);const approval=gate.querySelector('button:last-child');
  h.w.player.sub2Path='C:/changed.tr.srt';h.w.player.browserTracks[1]={path:'C:/changed.tr.srt'};
  approval.click();for(let i=0;i<12;i++)await tick();assert.equal(h.started,0);assert.equal(gate.hidden,true);
  assert.equal(h.el('dubSrtName').textContent,'changed.tr.srt');assert.match(h.el('dubGeneratorStatus').textContent,/seçimi değişti|selection changed/);
 }finally{h.close();}
});

test('a manual SRT with a short untranslated cue hidden by grouping opens repair before generation',async()=>{
 const h=fixture('player');try{
  h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');
  const recovery=require('../src/podcast-translation-recovery');
  const bytes=Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nBugün buradayız.\n\n2\n00:00:02,000 --> 00:00:04,000\nWhat is it?\n');
  h.w.api.planDub=async()=>({ok:true,groups:[{key:'1,2',seconds:4,text:'Bugün buradayız. What is it?',start:0,end:4000}],sourceHash:'fixture'});
  h.w.api.repairSubtitleTranslation=async request=>({ok:true,...recovery.repairFile({file:request.path,bytes,allowMixed:request.allowMixed})});
  let offer;
  h.w.SubtitleTranslationRepair={offer:async(file,_container,options)=>{offer={file,options};}};
  await h.open();h.el('dubChooseSrt').click();await tick();
  h.el('dubRangeEnabled').checked=false;
  h.el('dubGeneratorStart').click();for(let i=0;i<12;i++)await tick();
  assert.equal(h.started,0);assert.equal(h.el('dubGenerationGate').hidden,false);
  assert.equal(offer.file,'C:/manual.srt');assert.equal(offer.options.allowMixed,true);
 }finally{h.close();}
});

test('removing the automatic subtitle on the same video clears preparation and its saved output',async()=>{
 const h=fixture();try{
  h.w.api.latestDub=async()=>({ok:true,output:{name:'Old track output',url:'file:///old.wav',syncInvalid:true}});
  await h.open();h.w.player.subPath='';h.w.player.sub2Path='';h.w.player.browserTracks=[];
  await h.open();assert.equal(h.el('dubSrtName').textContent,'—');assert(h.el('dubGeneratorStart').disabled);
  assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null);assert(h.el('dubGeneratorOutput').classList.contains('hidden'));
 }finally{h.close();}
});
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
  assert.equal(result.code,'source-unavailable');assert.doesNotMatch(result.message,/oynatıcıda aç/);assert.deepEqual(noEntry.state.opened,[]);assert.equal(noEntry.dialog.open,false);
 }finally{noEntry.close();}
});

test('cancelled assistant approval cannot hand off a Podcast after its audio proof arrives',async()=>{
 const exactSource={entryId:'entry-B',sourceVersion:'copyver'};
 const f=sahneDubFixture({tracks:[{role:'source',exactSource}]});
 try{
  const original=f.w.api.feedsRequest;
  let finish,cancelled=false;
  f.w.api.feedsRequest=request=>request.action==='podcast-exact-audio'
   ? new Promise(resolve=>{finish=resolve;}) : original(request);
  await f.w.CinemaSahne.openShelf();
  f.w.eval(fs.readFileSync(require.resolve('../src/renderer/media-experience'),'utf8'));
  const pending=f.w.MediaExperience.openVoice({receipt:true,isCancelled:()=>cancelled});
  assert.equal(typeof finish,'function');
  cancelled=true;finish({available:true,sourceVersion:'copyver'});
  assert.equal(await pending,false);
  assert.deepEqual(f.state.opened,[]);
  assert.equal(f.dialog.open,false);
 }finally{f.close();}
});

test('changing the Podcast transcript revision during audio verification blocks the handoff',async()=>{
 const track={id:'source',role:'source',revision:'reviewed',exactSource:{entryId:'entry-B',sourceVersion:'copyver'}};
 const f=sahneDubFixture({tracks:[track]});
 try{
  const original=f.w.api.feedsRequest;
  let finish;
  f.w.api.feedsRequest=request=>request.action==='podcast-exact-audio'
   ? new Promise(resolve=>{finish=resolve;}) : original(request);
  await f.w.CinemaSahne.openShelf();
  const pending=f.w.CinemaSahne.current.a.cmd('dub');
  assert.equal(typeof finish,'function');
  track.revision='updated';
  finish({available:true,sourceVersion:'copyver'});
  assert.equal((await pending).code,'stale-track');
  assert.deepEqual(f.state.opened,[]);
  assert.equal(f.dialog.open,false);
 }finally{f.close();}
});

for(const change of ['close','reopen','generation']){
 test('late grouping comparison cannot reopen or update a '+change+' context',async()=>{
  let generation=1;const h=fixture('browser',()=>({generation}));
  try{
   h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};
   const result={ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'same-hash',skipped:0};h.w.api.planDub=async()=>result;
   await h.open();h.el('dubPlanPrepare').click();for(let i=0;i<5;i++)await tick();assert(h.w.DubGeneratorUI.experience().plan);
   h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));
   let finish;h.w.api.planDub=()=>new Promise(resolve=>finish=resolve);h.w.document.querySelector('.dub-group-compare').click();await tick();assert.equal(typeof finish,'function');
   if(change==='generation')generation++;else{h.el('dubGeneratorDialog').close();if(change==='reopen')await h.open();}
   const before=h.w.document.querySelector('.dub-experience-status').textContent;finish({...result,groups:[{...result.groups[0],text:'Obsolete comparison'}]});for(let i=0;i<5;i++)await tick();
   assert.equal(h.w.document.querySelector('.dub-grouping-dialog'),null,'late comparison must not open a dialog');assert.equal(h.w.document.querySelector('.dub-experience-status').textContent,before,'late result must not overwrite current panel status');assert.equal(h.started,0);
  }finally{h.close();}
 });
}

test('grouping comparison returns focus and closes with its parent or source',async()=>{
 let generation=1;const h=fixture('browser',()=>({generation}));
 try{
  h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};
  const result={ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0};h.w.api.planDub=async()=>result;await h.open();h.el('dubPlanPrepare').click();for(let i=0;i<5;i++)await tick();
  h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));const button=h.w.document.querySelector('.dub-group-compare');
  button.focus();button.click();for(let i=0;i<5;i++)await tick();let child=h.w.document.querySelector('.dub-grouping-dialog');assert(child?.open);assert.match(child.querySelector('h3').textContent,/Flowing blocks|Sentence flow|Sentence groups|Subtitle rows/);assert.doesNotMatch(child.querySelector('h3').textContent,/ · (akici|anlatim|cumle|satir) · /);child.close();assert.equal(h.w.document.activeElement,button);
  button.click();for(let i=0;i<5;i++)await tick();assert(h.w.document.querySelector('.dub-grouping-dialog')?.open);generation++;h.w.document.dispatchEvent(new h.w.Event('media-context-changed'));assert.equal(h.w.document.querySelector('.dub-grouping-dialog'),null);
  button.click();for(let i=0;i<5;i++)await tick();assert(h.w.document.querySelector('.dub-grouping-dialog')?.open);h.el('dubGeneratorDialog').close();assert.equal(h.w.document.querySelector('.dub-grouping-dialog'),null);assert.equal(button.disabled,false);assert.equal(h.started,0);
 }finally{h.close();}
});
test('late comparison error never overwrites a reopened panel',async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};const result={ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0};h.w.api.planDub=async()=>result;await h.open();h.el('dubPlanPrepare').click();for(let i=0;i<5;i++)await tick();
  h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));let fail;h.w.api.planDub=()=>new Promise((_,reject)=>fail=reject);h.w.document.querySelector('.dub-group-compare').click();await tick();h.el('dubGeneratorDialog').close();await h.open();const status=h.w.document.querySelector('.dub-experience-status');status.textContent='Current panel';fail(Error('Obsolete error'));for(let i=0;i<5;i++)await tick();assert.equal(status.textContent,'Current panel');
 }finally{h.close();}
});

for(const change of ['close','reopen','media']){
 test('pending saved-output attachment is cancelled by '+change,async()=>{
  const h=fixture();try{
   h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};
   const output={id:'saved',name:'Saved voice',url:'file:///saved.wav'};h.w.api.latestDub=async()=>({ok:true,output});let attached=0;h.w.BrowserDubAudioUI.attachGenerated=async()=>{attached++;return true;};await h.open();
   let finish;h.w.api.latestDub=()=>new Promise(resolve=>finish=resolve);h.el('dubGeneratorUse').click();await tick();assert.equal(typeof finish,'function');
   if(change==='media')h.changeMedia();else{h.el('dubGeneratorDialog').close();if(change==='reopen')await h.open();}
   finish({ok:true,output});for(let i=0;i<5;i++)await tick();assert.equal(attached,0,'abandoned verification cannot attach audio');assert.equal(h.started,0);
  }finally{h.close();}
 });
}
test('saved-output attachment stays busy through control refresh and duplicate clicks',async()=>{
 const h=fixture();try{h.w.UiLocale={get:()=> 'en',t:text=>text};h.w.document.documentElement.lang='en';
  const output={id:'saved',name:'Saved voice',url:'file:///saved.wav'};h.w.api.latestDub=async()=>({ok:true,output});let attached=0;h.w.BrowserDubAudioUI.attachGenerated=async()=>{attached++;return true;};await h.open();
  const replies=[];h.w.api.latestDub=()=>new Promise(resolve=>replies.push(resolve));const button=h.el('dubGeneratorUse');button.click();await tick();assert.equal(button.disabled,true);
  h.w.document.dispatchEvent(new h.w.Event('ui-locale-change'));assert.equal(button.disabled,true,'unrelated controls refresh must retain attachment lock');assert.equal(button.getAttribute('aria-busy'),'true');assert.match(button.textContent,/Attaching audio/);
  button.dispatchEvent(new h.w.Event('click'));await tick();assert.equal(replies.length,1,'only one output verification');assert.equal(h.el('dubGeneratorStart').disabled,true);h.el('dubGeneratorStart').dispatchEvent(new h.w.Event('click'));await tick();assert.equal(h.started,0,'generation cannot race a pending attachment');assert.equal(h.w.DubGeneratorUI.assistant.state().busy,true);replies[0]({ok:true,output});for(let i=0;i<5;i++)await tick();assert.equal(attached,1);assert.equal(button.disabled,false);
 }finally{h.close();}
});

test('a reopened panel keeps its own attachment lock when the previous proof finishes',async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};const output={id:'saved',name:'Saved voice',url:'file:///saved.wav'};h.w.api.latestDub=async()=>({ok:true,output});let attached=0;h.w.BrowserDubAudioUI.attachGenerated=async()=>{attached++;return true;};await h.open();const replies=[];h.w.api.latestDub=()=>new Promise(resolve=>replies.push(resolve));
  h.el('dubGeneratorUse').click();await tick();h.el('dubGeneratorDialog').close();await h.open();h.el('dubGeneratorUse').click();await tick();assert.equal(replies.length,2);
  replies[0]({ok:true,output});for(let i=0;i<4;i++)await tick();assert.equal(attached,0);assert.equal(h.el('dubGeneratorUse').disabled,true);
  replies[1]({ok:true,output});for(let i=0;i<4;i++)await tick();assert.equal(attached,1);assert.equal(h.el('dubGeneratorUse').disabled,false);
 }finally{h.close();}
});
test('a rejected output proof releases the action for a deliberate retry and never claims success',async()=>{
 const h=fixture();try{
  const output={id:'saved',name:'Saved voice',url:'file:///saved.wav'};h.w.api.latestDub=async()=>({ok:true,output});let attached=0;h.w.BrowserDubAudioUI.attachGenerated=async()=>{attached++;return true;};await h.open();h.w.api.latestDub=async()=>{throw Error('read failed');};h.el('dubGeneratorUse').click();for(let i=0;i<4;i++)await tick();assert.equal(attached,0);assert.equal(h.el('dubGeneratorUse').disabled,false);assert.equal(h.el('dubGeneratorUse').hasAttribute('aria-busy'),false);assert.match(h.el('dubGeneratorStatus').textContent,/Ses bağlanamadı|Audio could not/);
  h.w.api.latestDub=async()=>({ok:true,output});h.el('dubGeneratorUse').click();for(let i=0;i<4;i++)await tick();assert.equal(attached,1);assert.equal(h.started,0);
 }finally{h.close();}
});

test('grouping comparison cannot start planning while saved audio attachment is pending',async()=>{
 const h=fixture();try{
  const output={id:'saved',name:'Saved voice',url:'file:///saved.wav'};h.w.api.latestDub=async()=>({ok:true,output});h.w.BrowserDubAudioUI.attachGenerated=async()=>true;const plan={ok:true,groups:[{key:'g',seconds:1,text:'Hello',start:0,end:1000}],sourceHash:'hash',skipped:0};let plans=0;h.w.api.planDub=async()=>{plans++;return plan;};await h.open();h.el('dubPlanPrepare').click();for(let i=0;i<5;i++)await tick();
  h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));let finish;h.w.api.latestDub=()=>new Promise(resolve=>finish=resolve);h.el('dubGeneratorUse').click();await tick();const before=plans;
  assert.equal(await h.w.DubGeneratorUI.compareGrouping(),null,'direct comparison must obey the same attachment lock');assert.equal(plans,before);assert.equal(h.w.document.querySelector('.dub-group-compare').disabled,true);
  finish({ok:true,output});for(let i=0;i<5;i++)await tick();assert.equal(h.w.document.querySelector('.dub-group-compare').disabled,false);assert.equal(h.started,0);
 }finally{h.close();}
});

for(const change of ['close','source','media-load','browser-layout']){
 test('translation comparison belongs to its parent panel across '+change,async()=>{
  const h=fixture();try{
   h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};await h.open();h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.parseSubtitles=()=>[{start:0,end:1,text:'Controlled passage'}];h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));let finish;h.w.api.readSubtitle=()=>new Promise(resolve=>finish=resolve);const pending=h.w.DubExperienceUI.comparison();await tick();assert(h.w.document.querySelector('.speech-compare-dialog')?.open);
   if(change==='close')h.el('dubGeneratorDialog').close();else{h.changeMedia();if(change==='media-load')h.el('playerVideo').dispatchEvent(new h.w.Event('loadstart'));else if(change==='browser-layout')h.w.dispatchEvent(new h.w.Event('browser-panel-layout'));else h.w.document.dispatchEvent(new h.w.Event('media-context-changed'));}
   assert.equal(h.w.document.querySelector('.speech-compare-dialog'),null,'parent/source change closes owned comparison');finish({ok:true,text:'Controlled data'});await pending;assert.equal(h.w.document.querySelector('.speech-compare-dialog'),null);assert.equal(h.started,0);
  }finally{h.close();}
 });
}
test('translation comparison is single-instance and returns focus only to its current opener',async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};await h.open();h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.api.readSubtitle=async()=>({ok:false,error:'Not loaded'});h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));const opener=h.w.document.querySelector('.dub-experience-tools').children[1];opener.focus();await h.w.DubExperienceUI.comparison();await h.w.DubExperienceUI.comparison();assert.equal(h.w.document.querySelectorAll('.speech-compare-dialog').length,1);h.w.document.querySelector('.speech-compare-dialog').close();assert.equal(h.w.document.activeElement,opener);
  h.el('dubGeneratorDialog').close();await h.w.DubExperienceUI.comparison();assert.equal(h.w.document.querySelector('.speech-compare-dialog'),null,'a closed parent cannot open an orphan comparison');
 }finally{h.close();}
});
test('dub repair shortcut respects another modal and a prevented key event',async()=>{
 const h=fixture();try{
  await h.open();let calls=0;h.w.DubGeneratorUI={experience:()=>({owner:'A',srt:'',groups:[],output:null,busy:false}),editAtCurrent:async()=>{calls++;return true;}};h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));
  const other=h.w.document.createElement('dialog');other.open=true;const button=h.w.document.createElement('button');other.append(button);h.w.document.body.append(other);button.dispatchEvent(new h.w.KeyboardEvent('keydown',{ctrlKey:true,altKey:true,code:'KeyR',bubbles:true,cancelable:true}));await tick();assert.equal(calls,0,'another modal owns its shortcut');
  other.remove();const event=new h.w.KeyboardEvent('keydown',{ctrlKey:true,altKey:true,code:'KeyR',bubbles:true,cancelable:true});event.preventDefault();h.el('dubGeneratorDialog').dispatchEvent(event);await tick();assert.equal(calls,0);
 }finally{h.close();}
});


test('translation comparison separates matching totals from the visible page range',async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};await h.open();h.w.DubExperienceModel=require('../src/renderer/dub-experience-model');h.w.parseSubtitles=()=>Array.from({length:20},(_,i)=>({start:i,end:i+1,text:'Passage '+i}));h.w.api.readSubtitle=async()=>({ok:true,text:'Controlled subtitles'});h.w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-experience-ui'),'utf8'));await h.w.DubExperienceUI.comparison();
  const d=h.w.document.querySelector('.speech-compare-dialog'),feedback=d.querySelector('[role=status]');assert.equal(d.querySelectorAll('.speech-compare-row').length,12);assert.match(feedback.textContent,/Showing 1–12|Gösterilen: 1–12/);
  d.querySelector('.speech-compare-pager').lastElementChild.click();assert.equal(d.querySelectorAll('.speech-compare-row').length,8);assert.match(feedback.textContent,/Showing 13–20|Gösterilen: 13–20/);assert.match(feedback.textContent,/20 of 20|20 metinden 20/);assert.equal(h.started,0);
 }finally{h.close();}
});


for(const change of ['close','reopen'])test('late panel preparation never adopts saved output after '+change,async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};
  const replies=[];h.w.api.latestDub=()=>new Promise(resolve=>replies.push(resolve));await h.open();assert.equal(replies.length,1);
  h.el('dubGeneratorDialog').close();if(change==='reopen'){await h.open();assert.equal(replies.length,2);}
  replies[0]({ok:true,output:{name:'Obsolete saved voice',url:'file:///obsolete.wav',syncInvalid:true}});for(let i=0;i<5;i++)await tick();
  assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),null,'abandoned opening cannot attach its preview');
  if(change==='reopen'){replies[1]({ok:true,output:{name:'Current saved voice',url:'file:///current.wav',syncInvalid:true}});for(let i=0;i<5;i++)await tick();assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),'file:///current.wav');}
  assert.equal(h.started,0);
 }finally{h.close();}
});

test('closed preparation does not continue after its configuration arrives',async()=>{
 const h=fixture();try{
  h.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new h.w.Event('close'));};let release;h.w.api.dubConfig=()=>new Promise(resolve=>release=resolve);let lookups=0;h.w.api.latestDub=async()=>{lookups++;return {ok:true,output:null};};
  await h.open();assert.equal(typeof release,'function');h.el('dubGeneratorDialog').close();release({ok:true,ready:true,profile:'fast'});for(let i=0;i<8;i++)await tick();assert.equal(lookups,0);assert.equal(h.el('dubSrtName').textContent,'—');assert.equal(h.started,0);
 }finally{h.close();}
});
