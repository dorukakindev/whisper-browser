'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
function setup(){const calls=[],notices=[];const binding={episodeIdentity:'episode-A',resource:'https://example.test/audio.mp3',revision:1,mime:'audio/mpeg',sha256:'unknown'};let snapshot={mediaKey:'stream-A',generation:2,sourceVersion:'version-A',sourceBinding:binding,episodeIdentity:'episode-A',entryId:'entry-A'};
 const context={window:{UiLocale:{get:()=> 'en'},PlayerSourceCatalogIntegration:{openPodcastEntry:async id=>calls.push(['open-rss',id])},PlayerWorkspaceIntegration:{executeExisting:async packet=>{calls.push(['seek-rss',packet]);return {ok:true};}},CinemaSahne:{open:async()=>{},openShelf:async()=>{}},MediaShelfUI:{readSnapshot:()=>null,openPodcast:async(id,url)=>calls.push(['open-shelf',id,url]),executeExisting:async packet=>{calls.push(['seek-shelf',packet]);return {ok:true};}},api:{mediaShelf:async()=>({ok:true,podcasts:[{id:'show-A',episodes:[{url:'https://example.test/audio.mp3',episodeIdentity:'episode-A'}]}]})}},player:{workspaceMode:'player',get workspaceAudio(){return snapshot;},mediaKey:'stream-A',generation:2},osd:text=>notices.push(text),logLine:text=>notices.push(text)};
 const start=source.indexOf('async function openPodcastResearchResult('),end=source.indexOf('async function openUnifiedLibraryResult(',start);assert(start>=0,'podcast library reopen helper exists');vm.runInNewContext(source.slice(start,end),context);
 return {context,calls,notices,binding,setSnapshot:value=>snapshot=value,snapshot,result:{mediaType:'podcast',mediaId:'stream-A',sourceEntryId:'entry-A',sourceVersion:'version-A',sourceBinding:binding,episodeIdentity:'episode-A',playbackOwner:'player',timed:true,seconds:0}};
}
test('RSS research note reopens by real entry and permits a matching zero timestamp',async()=>{const h=setup();assert.equal(await h.context.openPodcastResearchResult(h.result),true);assert.deepEqual(h.calls[0],['open-rss','entry-A']);assert.equal(h.calls[1][0],'seek-rss');assert.equal(h.calls[1][1].time,0);});
test('Untimed and changed-source notes open their podcast without inventing a seek',async()=>{for(const change of ['untimed','version','binding']){const h=setup();if(change==='untimed')h.result.timed=false;else if(change==='version')h.setSnapshot({...h.snapshot,sourceVersion:'different'});else h.setSnapshot({...h.snapshot,sourceBinding:{...h.binding,resource:'https://example.test/different.mp3'}});assert.equal(await h.context.openPodcastResearchResult(h.result),true);assert.equal(h.calls.length,1,change);assert(h.notices.length);}});
test('Shelf research note resolves its saved episode identity through existing library owner',async()=>{const h=setup();h.result.playbackOwner='media-shelf';h.result.mediaId='shelf-podcast:episode-A';h.context.window.MediaShelfUI.readSnapshot=()=>({...h.snapshot,mediaKey:h.result.mediaId});assert.equal(await h.context.openPodcastResearchResult(h.result),true);assert.deepEqual(h.calls[0],['open-shelf','show-A','https://example.test/audio.mp3']);assert.equal(h.calls[1][0],'seek-shelf');assert.equal(h.calls[1][1].time,0);});
test('Cancellation during shelf opening prevents the follow-up scene and seek', async () => {
 const h=setup();
 h.result.playbackOwner='media-shelf';
 let cancelled=false, sceneOpens=0;
 h.context.window.MediaShelfUI.openPodcast=async()=>{cancelled=true;};
 h.context.window.CinemaSahne={openShelf:async()=>{sceneOpens++;}};
 assert.equal(await h.context.openPodcastResearchResult(h.result,{isCancelled:()=>cancelled}),false);
 assert.equal(sceneOpens,0);
 assert.equal(h.calls.length,0);
});
test('Missing RSS locator never falls through to a generic browser reopen',async()=>{const h=setup();delete h.result.sourceEntryId;assert.equal(await h.context.openPodcastResearchResult(h.result),false);assert.equal(h.calls.length,0);assert(h.notices.length);});

test('changed audio opens the saved quote as read-only without seeking',async()=>{
 const h=setup();
 const {JSDOM}=require('jsdom'),dom=new JSDOM('');
 try{
  h.context.document=dom.window.document;
  h.context.syncBrowserOcclusion=()=>{};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  h.setSnapshot({...h.snapshot,sourceVersion:'replacement'});
  const receipt={};
  assert.equal(await h.context.openPodcastResearchResult({...h.result,quote:'Saved wording'},{receipt}),true);
  assert.equal(receipt.mode,'read-only');
  assert.equal(dom.window.document.querySelector('dialog blockquote').textContent,'Saved wording');
  assert.deepEqual(h.calls,[['open-rss','entry-A']]);
 }finally{dom.window.close();}
});

test('Saved-search revalidation cannot seek a newer episode or a modified saved passage',async()=>{
 for(const change of ['source','text']){const h=setup();const opened=await h.context.openPodcastResearchResult(h.result,{beforeSeek:async()=>{if(change==='text')throw Error('Saved passage changed');h.setSnapshot({...h.snapshot,episodeIdentity:'episode-B',generation:3});}}).catch(()=>false);assert.equal(opened,false);assert.equal(h.calls.length,1);}
 const h=setup();assert.equal(await h.context.openPodcastResearchResult(h.result,{beforeSeek:async()=>{}}),true);assert.equal(h.calls.filter(c=>c[0]==='open-rss').length,1);assert.equal(h.calls[1][1].time,0);
});

test('Assistant passage navigation keeps its originating conversation and rejects a replacement thread',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/assistant-app-actions'),'utf8');
 const start=source.indexOf("  if(name==='open_saved_podcast_passage')");
 const end=source.indexOf("  if(name==='open_feed_entry')",start);
 for(const switched of [false,true]){
  let scope='library',thread='original';
  const row={token:'passage',episodeTitle:'Episode'};
  const context={t:en=>en,stale:()=>false,Date,window:{
   AssistantWorkspace:{key:()=>scope,activeId:(key=scope)=>key==='library'?thread:''},
   api:{mediaShelf:async()=>({ok:true,row})}},
   openPodcastResearchResult:async(_row,{receipt,isCancelled})=>{
    scope='podcast';
    if(switched)thread='replacement';
    if(isCancelled())return false;
    receipt.mode='seek';return true;
   }};
  const execute=vm.runInNewContext(`(async function(name,owner,expectedSettings,isCancelled,deadline){${source.slice(start,end)}})`,context);
  const request=execute('open_saved_podcast_passage',{thread:'original'},{kind:'podcast-passage',locator:{token:'passage'}},()=>false,Infinity);
  if(switched)await assert.rejects(request,/could not be opened/);
  else assert.equal((await request).mode,'seek');
 }
});

test('Research library renders untimed notes without a fake zero timestamp',()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="playerLibraryList"></div><p id="playerLibraryStatus"></p>');
 try{const context={document:dom.window.document,$:id=>dom.window.document.getElementById(id),researchAnnotations:[{id:'note-A',timed:false,start:null,mediaTitle:'Episode',type:'quote',status:'new'}],playerLibraryView:'research',captureResearchLibraryDrafts:()=>new Map(),uiText:value=>value,interfaceChoice:(_,en)=>en,researchTypeLabel:()=> 'Quote',researchStatusLabel:()=> 'New',pSecToTime:()=>{throw Error('Untimed note formatted as timestamp');}};
 const start=source.indexOf('const researchDraftCache'),end=source.indexOf('async function loadResearchLibrary(',start);vm.runInNewContext(source.slice(start,end)+';renderResearchLibrary();',context);assert.match(context.document.querySelector('.research-card-head').textContent,/Untimed text/);
 }finally{dom.window.close();}
});

test('saved passage applies the selected track offset and keeps the same playback owner',async()=>{
 const h=setup(),receipt={};
 h.context.window.PlayerWorkspaceIntegration.getTranscriptTracks=()=>[{role:'source',offsetSeconds:2},{role:'translation',offsetSeconds:-1.25}];
 let focused;
 h.context.window.CinemaSahne.current={focusPassage:time=>focused=time};
 assert.equal(await h.context.openPodcastResearchResult({...h.result,role:'translation',seconds:12},{beforeSeek:async()=>{},receipt}),true);
 assert.equal(h.calls[1][1].time,10.75);
 assert.equal(focused,10.75);
 assert.equal(receipt.mode,'seek');
});

test('An assistant-approved passage never seeks or reports success after another media, episode or tab replaced the opened one',async()=>{
 for(const change of ['other-media','other-episode','browser-tab']){
  const h=setup(),receipt={};
  h.context.window.PlayerSourceCatalogIntegration.openPodcastEntry=async id=>{h.calls.push(['open-rss',id]);
   if(change==='other-media')h.setSnapshot({...h.snapshot,mediaKey:'stream-B',generation:3,episodeIdentity:'episode-B',sourceVersion:'version-B',entryId:'entry-B'});
   else if(change==='other-episode')h.setSnapshot({...h.snapshot,episodeIdentity:'episode-B'});
   else h.context.player.workspaceMode='browser';};
  const opened=await h.context.openPodcastResearchResult(h.result,{beforeSeek:async()=>{},receipt});
  assert.equal(opened,false,change+': the assistant action must not report success');assert(!h.calls.some(row=>String(row[0]).startsWith('seek')),change+': no seek');assert.equal(receipt.mode,undefined,change+': no success receipt');
 }
});

test('podcast source cards resolve exactly, seek only after re-verification and report each real outcome',async()=>{
 const sources=require('../src/renderer/assistant-podcast-sources'),token='a'.repeat(64),id='P'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12);
 const raw={id,kind:'podcast',usage:'cited',show:'Coastal',episode:'Episode',role:'source',timed:true,seconds:12.5,end:15,quote:'The lighthouse blinks.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry-1',token},scope:{limit:6,more:false}};
 const card=sources.cleanOne(raw);assert(card);
 const row=(extra={})=>({token,timed:true,seconds:12.5,end:15,quote:'The lighthouse blinks.',...extra});
 const harness=(shelf,opener)=>{const calls={shelf:0,open:0,seek:0};return {calls,run:(options={})=>sources.reveal(card,{locale:'en',mediaShelf:async()=>shelf(++calls.shelf),open:async(found,opened)=>{calls.open++;return opener(found,opened,calls);},...options})};};
 const seeker=async(_row,opened,calls)=>{try{await opened.beforeSeek();}catch{return false;}calls.seek++;opened.receipt.mode='seek';return true;};
 // 1. The saved source is gone or changed: nothing opens and nothing is sought.
 let h=harness(()=>({ok:false,sourceChanged:true,error:'changed'}),seeker);
 let result=await h.run();assert.equal(result.state,'stale');assert.deepEqual([h.calls.open,h.calls.seek],[0,0]);
 h=harness(()=>({ok:true,row:row({token:'b'.repeat(64)})}),seeker);result=await h.run();assert.equal(result.state,'stale');assert.equal(h.calls.open,0);
 // 2. It changes between opening the episode and the seek: the second check refuses the seek.
 h=harness(count=>count===1?{ok:true,row:row()}:{ok:false,sourceChanged:true},seeker);
 result=await h.run();assert.equal(result.state,'stale');assert.deepEqual([h.calls.open,h.calls.seek],[1,0]);
 // 3. Verified timed passage seeks once and says where.
 h=harness(()=>({ok:true,row:row()}),seeker);result=await h.run();assert.equal(result.state,'opened');assert.match(result.note,/0:12/);assert.equal(h.calls.seek,1);
 // 4. Untimed text opens read-only; no fake time or seek.
 h=harness(()=>({ok:true,row:row({timed:false,seconds:null,end:null})}),async(_row,opened)=>{opened.receipt.mode='read-only';return true;});
 result=await h.run();assert.equal(result.state,'read-only');assert.match(result.note,/no verified time/);assert.equal(h.calls.seek,0);
 // 5. A conversation/source switch cancels before opening.
 h=harness(()=>({ok:true,row:row()}),seeker);result=await h.run({isCancelled:()=>true});assert.equal(result.state,'cancelled');assert.equal(h.calls.open,0);
 // 6. An unconfirmed open is reported as uncertain, never as success or as a plain failure.
 h=harness(()=>({ok:true,row:row()}),async()=>false);result=await h.run();assert.equal(result.state,'unconfirmed');assert.match(result.note,/no seek was made/);
 // 7. Malformed locators never reach the resolver.
 h=harness(()=>({ok:true,row:row()}),seeker);
 assert.equal((await sources.reveal({...raw,locator:{...raw.locator,token:'short'}},{mediaShelf:async()=>{h.calls.shelf++;return {};},open:async()=>true})).state,'unavailable');assert.equal(h.calls.shelf,0);
 // 8. Only whitelisted data is kept: no URL, path or markup-bearing extras.
 const cleaned=sources.cleanOne({...raw,html:'<b>x</b>',url:'file:///c:/secret',locator:{...raw.locator,url:'https://evil.example',path:'C:\\secret'}});
 assert.deepEqual(Object.keys(cleaned.locator).sort(),['action','episode','query','token']);assert.equal(cleaned.html,undefined);assert.equal(cleaned.url,undefined);
 assert.equal(sources.cleanOne({...raw,timed:true,seconds:null}),null,'a timed card needs a verified time');
 assert.deepEqual([cleaned.timed,sources.cleanOne({...raw,timed:false,seconds:3,end:4}).seconds],[true,null],'an untimed card never carries a time');
});

test('Source card click: the controller drives the real reopen helper and never opens, seeks or reports success wrongly',async()=>{
 const sources=require('../src/renderer/assistant-podcast-sources'),{JSDOM}=require('jsdom'),token='c'.repeat(64);
 const card=(extra={})=>sources.cleanOne({id:'P'+'1'.repeat(8)+'-1111-1111-1111-'+'1'.repeat(12),kind:'podcast',usage:'cited',show:'Show',episode:'Episode',role:'source',timed:true,seconds:12,end:15,quote:'The lighthouse blinks.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry-A',token},scope:{limit:6,more:false},...extra});
 const build=(options={})=>{
  const h=setup(),workspace={thread:'thread-1'},changes=[],shelfCalls=[],dom=new JSDOM('');
  h.context.document=dom.window.document;h.context.syncBrowserOcclusion=()=>{};dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  const row=extra=>({...h.result,token,quote:'The lighthouse blinks.',seconds:12,end:15,role:'source',...extra});
  const controller=sources.createController({locale:()=> 'en',
   mediaShelf:options.mediaShelf?async input=>options.mediaShelf(++shelfCalls.length,row,input):async()=>{shelfCalls.push(1);return {ok:true,row:row(options.row)};},
   open:(found,opened)=>h.context.openPodcastResearchResult(found,opened),workspace:{key:()=> 'conversation',activeId:()=>workspace.thread},onChange:(id,state)=>changes.push([id,state.state])});
  return {h,controller,workspace,changes,shelfCalls,dom};
 };
 // 1. verified time: the real helper opens the episode in its playback owner and seeks to the verified second
 let t=build();try{
  const result=await t.controller.click('a',card());
  assert.equal(result.state,'opened');assert.deepEqual(t.h.calls[0],['open-rss','entry-A']);assert.equal(t.h.calls[1][0],'seek-rss');assert.equal(t.h.calls[1][1].time,12);assert.equal(t.h.calls[1][1].mediaKey,'stream-A');
  assert.deepEqual(t.changes,[['a','opening'],['a','opened']]);
 }finally{t.dom.window.close();}
 // 2. untimed text: read-only view, no episode opened, no time
 t=build({row:{timed:false,seconds:null,end:null}});try{
  const result=await t.controller.click('a',card({timed:false,seconds:null,end:null}));
  assert.equal(result.state,'read-only');assert.deepEqual(t.h.calls,[]);assert.equal(t.dom.window.document.querySelector('dialog blockquote').textContent,'The lighthouse blinks.');
 }finally{t.dom.window.close();}
 // 3. removed or changed saved source: nothing opens, the card says so
 t=build({mediaShelf:()=>({ok:false,sourceChanged:true,error:'changed'})});try{
  const result=await t.controller.click('a',card());assert.equal(result.state,'stale');assert.deepEqual(t.h.calls,[]);assert.equal(t.dom.window.document.querySelector('dialog'),null);
 }finally{t.dom.window.close();}
 // 4. the source changes between opening the episode and the seek: no seek
 t=build({mediaShelf:(count,row)=>count===1?{ok:true,row:row()}:{ok:false,sourceChanged:true}});try{
  const result=await t.controller.click('a',card());assert.equal(result.state,'stale');assert.deepEqual(t.h.calls,[['open-rss','entry-A']]);
 }finally{t.dom.window.close();}
 // 5. a different playback version is opened read-only, never sought
 t=build();try{
  t.h.setSnapshot({...t.h.snapshot,sourceVersion:'replacement'});
  const result=await t.controller.click('a',card());assert.equal(result.state,'read-only');assert.deepEqual(t.h.calls,[['open-rss','entry-A']]);
 }finally{t.dom.window.close();}
 // 6. the conversation switches while the episode opens: cancelled, no seek
 t=build();try{
  t.h.context.window.PlayerSourceCatalogIntegration.openPodcastEntry=async id=>{t.h.calls.push(['open-rss',id]);t.workspace.thread='thread-2';};
  const result=await t.controller.click('a',card());assert.equal(result.state,'cancelled');assert.deepEqual(t.h.calls,[['open-rss','entry-A']]);
 }finally{t.dom.window.close();}
 // 7. a late answer after a switch changes only its own card; a repeat click while opening is ignored
 t=build({mediaShelf:(count,row)=>new Promise(resolve=>{t.release=()=>resolve({ok:true,row:row()});})});try{
  const first=t.controller.click('a',card());await new Promise(setImmediate);
  const repeat=await t.controller.click('a',card());assert.equal(repeat.state,'opening');assert.equal(t.shelfCalls.length,1,'a repeat click never starts a second resolution');
  t.workspace.thread='thread-2';t.release();const late=await first;
  assert.equal(late.state,'cancelled');assert.deepEqual(t.h.calls,[]);assert.equal(t.controller.state('b'),null);assert.equal(t.controller.state('a').state,'cancelled');
 }finally{t.dom.window.close();}
 // 8. a missing episode keeps the saved quote readable with its reason
 t=build();try{
  delete t.h.context.window.PlayerSourceCatalogIntegration;
  const result=await t.controller.click('a',card());assert.equal(result.state,'read-only');assert.match(result.note,/no longer in your library/);
  assert.match(t.dom.window.document.querySelector('dialog p').textContent,/no longer in your library/);assert.deepEqual(t.h.calls,[]);
 }finally{t.dom.window.close();}
 // 9. a seek the player does not confirm is reported as unconfirmed, not as success or as a plain failure
 t=build();try{
  t.h.context.window.PlayerWorkspaceIntegration.executeExisting=async()=>({ok:false});
  const result=await t.controller.click('a',card());assert.equal(result.state,'unconfirmed');
 }finally{t.dom.window.close();}
});
