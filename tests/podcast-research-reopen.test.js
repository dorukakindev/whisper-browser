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
 const start=source.indexOf('function renderResearchLibrary('),end=source.indexOf('async function loadResearchLibrary(',start);vm.runInNewContext(source.slice(start,end)+';renderResearchLibrary();',context);assert.match(context.document.querySelector('.research-card-head').textContent,/Untimed text/);
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
