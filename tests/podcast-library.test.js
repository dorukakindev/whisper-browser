'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require.resolve('../src/renderer/podcast-library-ui'),'utf8');
const tick=()=>new Promise(setImmediate);
function fixture(){
  const dom=new JSDOM('<body><div id="root"></div></body>',{runScripts:'outside-only'}),w=dom.window,calls=[],queue=[];
  w.eval(source);const root=w.document.getElementById('root');
  const data={podcasts:[{id:'p',title:'Actual program',episodes:[{title:'Resume episode',url:'one',position:20,duration:100,sourceVersion:'v1',podcastWorkspace:{sourceVersion:'v1',translation:{text:'Saved translation'}}},{title:'Unverified episode',url:'two',position:20,duration:100,positionState:'needs-review',sourceVersion:'new',podcastWorkspace:{sourceVersion:'old',translation:{text:'Old translation'}}},{title:'Local episode',url:'three',localSource:{path:'not exposed'},duration:80}]}]};
  w.PodcastLibraryUI.mount(root,data,{play:async(p,row,scene)=>calls.push(['play',p.id,row.url,scene]),enqueue:async(p,row)=>{queue.push({...row,queueKey:'queued:'+row.url});calls.push(['queue',p.id,row.url]);},queue:()=>({rows:queue,index:0}),playQueued:key=>calls.push(['queued',key]),addRss:()=>calls.push(['rss']),openLocal:()=>calls.push(['local']),openQueue:()=>calls.push(['manage']),classic:host=>{calls.push(['classic']);host.textContent='Existing radio tools';}});
  return {dom,w,root,calls,data};
}
test('library renders real subscription/count/continue and excludes stale translation from ready filter',async()=>{const h=fixture();try{assert.match(h.root.querySelector('.pl-programs').textContent,/Actual program/);assert.match(h.root.querySelector('.pl-hero').textContent,/Resume episode/);assert.equal(h.root.querySelector('.pl-hero progress').value,20);assert.equal(h.root.querySelectorAll('audio,video').length,0);assert.equal(h.calls.length,0);h.root.querySelector('[data-filter=ready]').click();await tick();assert.equal(h.root.querySelectorAll('.pl-episodes .pl-episode').length,1);assert.doesNotMatch(h.root.querySelector('.pl-episodes').textContent,/Unverified/);h.root.querySelector('[data-filter=local]').click();await tick();assert.match(h.root.querySelector('.pl-episodes').textContent,/Local episode/);assert.equal(h.root.querySelector('.pl-hero progress'),null);assert.match(h.root.querySelector('.pl-hero .pl-eyebrow').textContent,/START LISTENING/);}finally{h.dom.window.close();}});
test('search and actions use existing playback/queue/source owners without media creation',async()=>{const h=fixture();try{h.root.querySelector('.pl-hero .mh-primary').click();await tick();assert.deepEqual(h.calls[0],['play','p','one','podcast']);h.root.querySelector('.pl-hero .pl-enqueue').click();await tick();assert.deepEqual(h.calls[1],['queue','p','one']);assert.match(h.root.querySelector('.pl-queue').textContent,/Resume episode/);h.root.querySelector('.pl-hero .pl-study').click();await tick();assert.deepEqual(h.calls.at(-1),['play','p','one','bilingual']);h.root.querySelector('.pl-queue-play').click();await tick();assert.deepEqual(h.calls.at(-1),['queued','queued:one']);const search=h.root.querySelector('input');search.value='Unverified';search.dispatchEvent(new h.w.Event('input'));assert.equal(h.root.querySelectorAll('.pl-episodes .pl-episode').length,1);assert.equal(h.root.querySelector('.pl-hero progress'),null);assert.match(h.root.querySelector('.pl-hero .pl-eyebrow').textContent,/START LISTENING/);search.value='not present';search.dispatchEvent(new h.w.Event('input'));assert.match(h.root.querySelector('.pl-empty').textContent,/No matching/);h.root.querySelector('.pl-add').click();await tick();assert.deepEqual(h.calls.at(-1),['rss']);const classic=h.root.querySelector('details');classic.open=true;classic.dispatchEvent(new h.w.Event('toggle'));assert.match(classic.textContent,/Existing radio tools/);classic.dispatchEvent(new h.w.Event('toggle'));assert.equal(h.calls.filter(c=>c[0]==='classic').length,1);}finally{h.dom.window.close();}});
test('subscription strip and filters remain available and empty library has no synthetic episodes',async()=>{const h=fixture();try{assert.equal(h.root.querySelector('.pl-drawer'),null);assert(h.root.querySelector('.pl-programs[role=group]'));assert(h.root.querySelector('.pl-list-tools [data-filter=ready]'));assert(h.root.querySelector('.pl-stage .pl-side'));assert(h.root.querySelector('.pl-record .pl-disc'));const search=h.root.querySelector('.pl-search');search.focus();search.value='Resume';search.dispatchEvent(new h.w.Event('input'));assert.equal(h.w.document.activeElement,search);const host=h.w.document.createElement('div');h.w.PodcastLibraryUI.mount(host,{podcasts:[]},{queue:()=>({rows:[]})});assert.equal(host.querySelectorAll('.pl-episode,.pl-hero').length,0);assert.match(host.textContent,/Add a podcast RSS feed/);}finally{h.dom.window.close();}});
test('feed registry merges into the library and enqueue preserves its existing player identity',async()=>{
  const dom=new JSDOM('<body><div id="root"></div></body>',{runScripts:'outside-only'}),w=dom.window,calls=[],queued=[],mounted=[];
  try{
    w.t=(en)=>en;w.view={};w.snapshot={podcasts:[]};w.classicRadio=()=>{};w.status=()=>{};w.openQueue=()=>{};w.order={snapshot:()=>({rows:queued,index:0})};w.appendQueue=row=>queued.push(row);w.listen=()=>{};w.playPodcastRow=async(row,scene)=>calls.push({id:row.entryId,opts:{view:scene==='bilingual'?'bilingual':'podcast'}});
    w.el=(tag,cls,text)=>{const n=w.document.createElement(tag);n.className=cls||'';n.textContent=text||'';return n;};
    const feed={id:'feed',url:'https://publisher.test/rss',title:'Feed show'},entry={id:'entry',feedId:'feed',kind:'podcast',title:'Real entry',sourceVersion:'v1',durationSeconds:100,enclosures:[{type:'audio/mpeg',url:'https://publisher.test/audio.mp3'}]};
    w.api=async(action)=>{calls.push(action);return action==='list'?{podcasts:calls.includes('podcast-add')?[{id:'actual-shelf-id',url:feed.url,title:feed.title,episodes:[{title:entry.title,url:entry.enclosures[0].url,sourceVersion:'v1'}]}]:[]}:{};};
    w.api.feedsRequest=async req=>{calls.push(req.action);return req.action==='list'?{ok:true,feeds:[feed]}:{ok:true,rows:[entry],total:1};};
    w.PodcastLibraryUI={mount:(root,data,actions)=>{mounted.push({data,actions});return()=>{};}};w.PlayerSourceCatalogIntegration={openPodcastEntry:async(id,opts)=>calls.push({id,opts})};
    const dialog=w.document.createElement('dialog');w.PodcastLinkUI={open:()=>dialog};
    const shelf=fs.readFileSync(require.resolve('../src/renderer/media-shelf-ui'),'utf8'),start=shelf.indexOf('  function radio(root)'),end=shelf.indexOf('  function classicRadio(root)',start);
    w.eval('const transcriptSearchState={};function status(){};'+shelf.slice(start,end)+';window.openLibrary=radio;');w.openLibrary(w.document.getElementById('root'));await tick();
    assert.equal(mounted.length,1);const {data,actions}=mounted[0],program=data.podcasts[0],row=program.episodes[0];assert.equal(row.entryId,'entry');assert.equal(row.canonicalFeed,true);assert.equal(row.positionState,undefined,'A fresh episode without a saved timeline needs no review');
    await actions.play(program,row,true);assert.equal(calls.find(c=>c?.id)?.id,'entry');await actions.play(program,row,'bilingual');assert.equal(calls.at(-1).opts.view,'bilingual');await actions.enqueue(program,row);await actions.enqueue(program,row);assert.equal(calls.filter(c=>c==='podcast-add').length,0);assert.equal(queued.length,2);assert.equal(queued[0].id,'entry');assert.equal(queued[0].entryId,'entry');assert.equal(queued[0].kind,'podcasts');assert.equal(queued[0].sourceVersion,'v1');
    actions.addRss();dialog.dispatchEvent(new w.Event('close'));await tick();assert.equal(mounted.length,2);
  }finally{dom.window.close();}
});

test('publisher HTML is displayed as safe prose and dates use the UI locale',()=>{const h=fixture();try{const row=h.data.podcasts[0].episodes[0];row.description='First<br>Second &amp; third<script>bad()</script>';row.published='Wed, 04 Nov 2026 10:42:43 +0000';const search=h.root.querySelector('input');search.dispatchEvent(new h.w.Event('input'));const hero=h.root.querySelector('.pl-hero');assert.equal(hero.querySelector('.pl-description').textContent,'First Second & third');assert.match(hero.querySelector('.pl-meta').textContent,/Nov/);assert.doesNotMatch(hero.querySelector('.pl-meta').textContent,/GMT|0000/);assert.equal(hero.querySelector('script,br'),null);}finally{h.dom.window.close();}});

test('saved Spotify source stays a source card and never invents local audio or timed episodes',async()=>{const h=fixture();try{const host=h.w.document.createElement('div'),opened=[];h.w.PodcastLibraryUI.mount(host,{podcasts:[{id:'spotify',sourceKind:'spotify',image:'http://legacy.publisher.test/cover.jpg',title:'Actual Spotify show',url:'https://open.spotify.com/show/7cUmwyJH18B7VGMVQCjokx',episodes:[]}]},{queue:()=>({rows:[]}),openSpotify:url=>opened.push(url)});assert.equal(host.querySelectorAll('audio,video,progress,.pl-hero,img').length,0);assert.match(host.textContent,/Actual Spotify show/);[...host.querySelectorAll('button')].find(b=>b.textContent==='Listen in Spotify').click();await tick();assert.equal(opened.length,1);}finally{h.dom.window.close();}});

test('episode sort handles numeric RSS timestamps and strip selection keeps keyboard focus',async()=>{const h=fixture();try{h.data.podcasts[0].episodes[0].date=1000;h.data.podcasts[0].episodes[1].date=5000;const search=h.root.querySelector('.pl-search');search.dispatchEvent(new h.w.Event('input'));assert.match(h.root.querySelector('.pl-episodes .pl-episode').textContent,/Unverified episode/);const sort=h.root.querySelector('.pl-sort');sort.value='oldest';sort.dispatchEvent(new h.w.Event('change'));assert.match(h.root.querySelectorAll('.pl-episodes .pl-episode')[1].textContent,/Resume episode/);const program=h.root.querySelector('[data-program=p]');program.focus();program.click();await tick();assert.equal(h.w.document.activeElement.dataset.program,'p');}finally{h.dom.window.close();}});


test('search keeps unchanged subscription and hero DOM and reuses parsed dates',()=>{
 const h=fixture();try{const hero=h.root.querySelector('.pl-hero'),program=h.root.querySelector('[data-program=p]'),search=h.root.querySelector('.pl-search'),NativeDate=h.w.Date;let parses=0;
 h.w.Date=new Proxy(NativeDate,{construct(Target,args){parses++;return new Target(...args);}});
 for(const query of ['Resume','Res','Resume']){search.value=query;search.dispatchEvent(new h.w.Event('input'));}
 assert.equal(h.root.querySelector('.pl-hero'),hero);assert.equal(h.root.querySelector('[data-program=p]'),program);assert.equal(parses,0);assert.equal(h.root.querySelectorAll('.pl-episode').length,1);
 }finally{h.dom.window.close();}
});

test('late episode open cannot launch tools after the library is disposed',async()=>{
 const h=fixture();try{let resolve,tools=0,unsubscribed=0;const host=h.w.document.createElement('div');h.w.document.body.append(host);
 const dispose=h.w.PodcastLibraryUI.mount(host,{podcasts:[{id:'show',title:'Show',episodes:[{title:'Episode',url:'one'}]}]},{play:()=>new Promise(r=>resolve=r),transcriptTools:()=>tools++,queue:()=>({rows:[]}),subscribeQueue:()=>()=>unsubscribed++});
 host.querySelector('.pl-transcript-open').click();dispose();resolve();await tick();assert.equal(tools,0);assert.equal(unsubscribed,1);
 }finally{h.dom.window.close();}
});

async function listeningFixture(saved){
 const dom=new JSDOM('<div id="playerLayer" class="hidden"><video id="playerVideo"></video></div>',{url:'https://fixture.invalid',runScripts:'outside-only'}),w=dom.window,calls=[];let fail='',opening;
 w.player={openIntent:0,mediaKey:'',generation:0,workspaceAudio:null};w.UiLocale={get:()=> 'en'};w.HTMLMediaElement.prototype.pause=function(){this.dispatchEvent(new w.Event('pause'));};w.HTMLMediaElement.prototype.play=async function(){calls.push(['audio-play',this.id]);};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.PlayerLoopPolicy=require('../src/player-loop-policy');
 w.api={mediaShelf:async request=>{calls.push(['api',request.action,request]);if(request.action==='list')return {ok:true,music:[],stations:[],podcasts:[],listeningQueue:saved};return {ok:true};}};
 w.PlayerSourceCatalogIntegration={openPodcastEntry:async(id,options)=>{calls.push(['open',id,options.view]);if(opening)await opening(id);if(options.isCancelled?.())return;if(fail===id)throw Error('Unavailable episode');if(w.player.workspaceAudio?.entryId!==id){w.player.mediaKey='stream:'+id;w.player.generation++;w.player.workspaceAudio={entryId:id,mediaKey:w.player.mediaKey,generation:w.player.generation,title:id};} }};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/music-queue'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/media-shelf-ui'),'utf8'));await tick();await tick();
 return {dom,w,calls,shelf:w.MediaShelfUI,fail:id=>fail=id,opening:fn=>opening=fn};
}

test('Shelf podcast sentence loop uses the same audio and cannot follow the next episode', async () => {
 const h=await listeningFixture(null);
 try {
  const episode=id=>({id:'show',episodeIdentity:id,title:id,url:'https://fixture.invalid/'+id+'.wav'});
  await h.shelf.playPodcastRow(episode('A'));
  const audio=h.w.document.getElementById('mediaShelfAudio');
  Object.defineProperties(audio,{duration:{value:30},paused:{value:false},readyState:{value:4}});
  const owner=h.shelf.readSnapshot();
  const command=(type,range)=>h.shelf.executeExisting({type,mediaKey:owner.mediaKey,generation:owner.generation,...range});
  assert.equal((await command('setAB',{a:5,b:7})).ok,true);
  audio.currentTime=7;
  audio.dispatchEvent(new h.w.Event('timeupdate'));
  assert.equal(audio.currentTime,5);
  audio.currentTime=10;
  audio.dispatchEvent(new h.w.Event('timeupdate'));
  assert.equal(h.shelf.readSnapshot().loopRange,null);
  await command('setAB',{a:5,b:7});
  await h.shelf.playPodcastRow(episode('B'));
  assert.equal(h.shelf.readSnapshot().loopRange,null);
  assert.equal((await command('setAB',{a:5,b:7})).code,'stale-source');
  assert.equal(h.w.document.getElementById('mediaShelfAudio'),audio);
 } finally { h.dom.window.close(); }
});

test('listening queue reopens without autoplay and missing rows stay visible and retryable at their exact place',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'feed-A',entryId:'A',title:'Episode A',scene:'bilingual'},{kind:'podcasts',id:'feed-B',entryId:'B',title:'Episode B'}],index:1,repeat:'off'});try{
 assert.equal(h.calls.filter(c=>c[0]==='open'||c[0]==='audio-play').length,0);h.shelf.openQueue();h.fail('B');h.w.document.querySelectorAll('.ms-queue-play')[1].click();await tick();await tick();assert.match(h.w.document.querySelector('.is-current').textContent,/Retry.*Episode B/);assert.match(h.w.document.querySelector('.ms-queue-error').textContent,/Unavailable episode/);assert.equal(h.calls.filter(c=>c[0]==='open').length,1);
 h.fail('');h.w.document.querySelectorAll('.ms-queue-play')[1].click();await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'B');assert.equal(h.w.document.querySelector('.ms-queue-error'),null);assert.equal(h.w.document.querySelectorAll('audio').length,1);
 }finally{h.dom.window.close();}
});

test('canonical queue selection retains player owner and view; delayed old completion cannot replace a later selection',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'feed-A',entryId:'A',title:'A',scene:'bilingual'},{kind:'podcasts',id:'feed-B',entryId:'B',title:'B',scene:'podcast'}],index:0,repeat:'off'});try{
 let release;h.opening(id=>id==='A'?new Promise(resolve=>release=resolve):Promise.resolve());h.shelf.openQueue();h.w.document.querySelectorAll('.ms-queue-play')[0].click();await tick();h.w.document.querySelectorAll('.ms-queue-play')[1].click();await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'B');release();await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'B');assert.equal(h.shelf.ownsPodcastQueue(),true);assert.equal(await h.shelf.advancePodcastQueue({mediaKey:'stream:A',generation:1}),false);assert.equal(h.w.player.workspaceAudio.entryId,'B');
 h.opening(null);h.w.document.querySelectorAll('.ms-queue-play')[0].click();await tick();await tick();assert.equal(h.calls.filter(c=>c[0]==='open').at(-1)[2],'bilingual');assert.equal(h.w.player.workspaceAudio.entryId,'A');h.shelf.rememberQueueScene('podcast');const owner={mediaKey:h.w.player.mediaKey,generation:h.w.player.generation};await h.shelf.advancePodcastQueue(owner);assert.equal(h.w.player.workspaceAudio.entryId,'B');assert.equal(h.calls.filter(c=>c[0]==='audio-play').length,0);
 }finally{h.dom.window.close();}
});

test('same RSS episode switches Podcast/Bilingual presentation without reloading or losing playback',async()=>{
 const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8'),start=text.indexOf('  let podcastOpenIntent='),end=text.indexOf('  const podcastButton=',start),calls=[],player={mediaKey:'A',generation:3,workspaceAudio:{entryId:'A',mediaKey:'A',generation:3}},context={player,window:{PlayerWorkspaceIntegration:{setPodcastMode:v=>calls.push(['mode',v]),refresh(){}},CinemaSahne:{open:o=>calls.push(['scene',o.mode])}},play:async()=>{throw Error('Same episode must not load');},t:en=>en};vm.runInNewContext(text.slice(start,end),context);await context.openPodcastEntry('A',{view:'bilingual'});await context.openPodcastEntry('A',{view:'podcast'});assert.equal(player.generation,3);assert.equal(player.mediaKey,'A');assert.deepEqual(calls,[['mode',false],['scene','study'],['mode',true],['scene','podcast']]);
});

test('pending queue preparation yields to a newer source opened through the existing stream owner',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'A',entryId:'A',title:'A'}],index:0,repeat:'off'});try{
 let release;const original=h.w.api.mediaShelf;h.w.api.mediaShelf=request=>request.action==='spotify-cancel'?new Promise(resolve=>release=()=>resolve({ok:true})):original(request);h.shelf.openQueue();h.w.document.querySelector('.ms-queue-play').click();await tick();
 const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/media-hub-ui'),'utf8'),start=text.indexOf(' async function playStream('),end=text.indexOf(' async function drawPlayer(',start),ctx={player:h.w.player,document:h.w.document,window:h.w,flushWatchState:async()=>{},setWorkspaceMode(){},setPlayerSource:(_url,_title,key)=>{h.w.player.mediaKey=key;h.w.player.generation++;h.w.player.workspaceAudio=null;},currentGeneration:()=>h.w.player.generation};vm.runInNewContext(text.slice(start,end),ctx);await ctx.playStream({url:'fixture:other',title:'Newer',key:'newer-video'});release();await tick();await tick();assert.equal(h.w.player.mediaKey,'newer-video');assert.equal(h.calls.filter(c=>c[0]==='open').length,0);
 }finally{h.dom.window.close();}
});

test('canonical decode failure stays at the same queue row and explicit Retry requests source reload',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'A',entryId:'A',title:'A'}],index:0,repeat:'off'});try{
 const flags=[];const open=h.w.PlayerSourceCatalogIntegration.openPodcastEntry;h.w.PlayerSourceCatalogIntegration.openPodcastEntry=async(id,opts)=>{flags.push(opts);return open(id,opts);};h.shelf.openQueue();h.w.document.querySelector('.ms-queue-play').click();await tick();await tick();h.shelf.podcastQueueError();assert.match(h.w.document.querySelector('.is-current').textContent,/Retry/);h.w.document.querySelector('.ms-queue-play').click();await tick();await tick();assert.equal(flags.at(-1).reload,true);assert.equal(h.shelf.musicContext().index,0);assert.equal(h.w.document.querySelector('.ms-queue-error'),null);
 h.w.player.mediaKey='other';h.w.player.generation++;h.shelf.podcastQueueError();assert.equal(h.w.document.querySelector('.ms-queue-error'),null);
 }finally{h.dom.window.close();}
});

test('repeat-all end of a one-episode canonical queue explicitly restarts existing transport',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'A',entryId:'A',title:'A'}],index:0,repeat:'all'});try{
 const flags=[];const open=h.w.PlayerSourceCatalogIntegration.openPodcastEntry;h.w.PlayerSourceCatalogIntegration.openPodcastEntry=async(id,opts)=>{flags.push(opts);return open(id,opts);};h.shelf.openQueue();h.w.document.querySelector('.ms-queue-play').click();await tick();await tick();await h.shelf.advancePodcastQueue({mediaKey:h.w.player.mediaKey,generation:h.w.player.generation});assert.equal(flags.at(-1).restart,true);assert.equal(h.shelf.musicContext().index,0);
 }finally{h.dom.window.close();}
});

test('saved transcript search ignores late queries and untimed reading exposes no seek action',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only'}),w=dom.window;try{w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.eval(source);let finish,opens=0;w.PodcastLibraryUI.mount(w.document.getElementById('root'),{podcasts:[]},{searchTranscripts:()=>new Promise(r=>finish=r),resolveTranscript:async()=>({row:{episodeTitle:'Untimed episode',showTitle:'Show',quote:'Real publisher text',timed:false}}),openTranscriptResult:()=>opens++,queue:()=>({rows:[],index:-1}),openQueue:()=>{}});const form=w.document.querySelector('.pl-transcript-search form'),input=form.querySelector('input');input.value='old';form.dispatchEvent(new w.Event('submit',{cancelable:true}));input.value='new';input.dispatchEvent(new w.Event('input'));finish({rows:[{episodeTitle:'Stale',quote:'Stale',timed:false}]});await tick();assert.doesNotMatch(w.document.querySelector('.pl-transcript-search').textContent,/Stale/);form.dispatchEvent(new w.Event('submit',{cancelable:true}));finish({rows:[{episodeTitle:'Untimed episode',showTitle:'Show',quote:'Real publisher text',timed:false,token:'t'}]});await tick();[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Read saved passage').click();await tick();assert.match(w.document.querySelector('dialog').textContent,/Real publisher text/);assert(![...w.document.querySelector('dialog').querySelectorAll('button')].some(b=>b.textContent.includes('Open episode')));assert.equal(opens,0);}finally{w.close();}
});

test('transcript scope, next page and selected passage survive a library remount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.eval(source);
  const root=w.document.getElementById('root'),calls=[],state={};
  const data={podcasts:[{id:'s',title:'Show',episodes:[{title:'Episode',episodeIdentity:'ep'}]}]};
  const hit=token=>({token,episodeTitle:'Episode',showTitle:'Show',episodeIdentity:'ep',quote:token,timed:false,role:'translation'});
  const actions={transcriptSearchState:state,queue:()=>({rows:[]}),searchTranscripts:async(query,scope)=>{
   calls.push({query,...scope});return scope.offset?{rows:[hit('second')],nextOffset:null}:{rows:[hit('first')],nextOffset:100};
  }};
  const dispose=w.PodcastLibraryUI.mount(root,data,actions),area=root.querySelector('.pl-transcript-search');
  area.open=true;
  const [show,episode,role]=area.querySelectorAll('select');
  show.value='s';show.dispatchEvent(new w.Event('change'));episode.value='ep';role.value='translation';
  area.querySelector('input').value='phrase';area.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await tick();assert.deepEqual(calls[0],{query:'phrase',show:'s',episode:'ep',role:'translation',offset:0});
  const more=[...area.querySelectorAll('button')].find(b=>b.textContent==='Load more passages');more.focus();more.click();
  await tick();assert.equal(calls[1].offset,100);assert.equal(area.querySelectorAll('.pl-search-group').length,1);
  assert.equal(area.querySelectorAll('.pl-search-hit').length,2);
  assert.equal(w.document.activeElement.closest('[data-passage]').dataset.passage,'second');
  state.anchor='second';dispose();root.replaceChildren();w.PodcastLibraryUI.mount(root,data,actions);
  assert.equal(root.querySelector('.pl-transcript-search input').value,'phrase');
  assert.equal(root.querySelectorAll('.pl-search-hit').length,2);assert.equal(calls.length,2);
  actions.searchTranscripts=async()=>({rows:[],nextOffset:null});
  root.querySelector('.pl-transcript-search form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await tick();
  assert.match(root.querySelector('.pl-transcript-search [role=status]').textContent,/no complete translation/);
 }finally{w.close();}
});

test('a stale passage open keeps the source dialog visible and allows retry',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(source);
  const row={episodeTitle:'Episode',showTitle:'Show',quote:'A real quote',timed:true,seconds:2,end:3,token:'t'};
  let opens=0;
  w.PodcastLibraryUI.mount(w.document.getElementById('root'),{podcasts:[]},{
   searchTranscripts:async()=>({rows:[row]}),resolveTranscript:async()=>({row}),
   openTranscriptResult:async()=>{if(++opens===1)throw Error('The source changed.');},
   queue:()=>({rows:[],index:-1}),openQueue:()=>{}
  });
  const form=w.document.querySelector('.pl-transcript-search form');
  form.querySelector('input').value='quote';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  w.document.querySelector('.pl-passage-open').click();await tick();
  const dialog=w.document.querySelector('dialog');
  const open=dialog.querySelector('.mh-primary');open.click();await tick();
  assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[role=alert]').textContent,'The source changed.');
  assert.equal(open.disabled,false);open.click();await tick();assert.equal(dialog.isConnected,false);
 }finally{w.close();}
});

test('a pending next page cannot repopulate results after changing the show',async()=>{
 const {window:w}=new JSDOM('<div id="root"></div>',{runScripts:'outside-only'});
 try{
  w.eval(source);
  const root=w.document.getElementById('root'),state={};
  let complete;
  const hit={token:'old',episodeTitle:'Old episode',showTitle:'Old show',quote:'Old passage',timed:false};
  w.PodcastLibraryUI.mount(root,{podcasts:[{id:'old',title:'Old',episodes:[{title:'Episode',episodeIdentity:'ep'}]}]},
   {transcriptSearchState:state,queue:()=>({rows:[]}),searchTranscripts:async(_query,scope)=>
    scope.offset?new Promise(resolve=>{complete=resolve;}):{rows:[hit],nextOffset:100}});
  const area=root.querySelector('.pl-transcript-search');
  area.querySelector('input').value='passage';
  area.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await tick();
  [...area.querySelectorAll('button')].find(b=>b.textContent==='Load more passages').click();
  const show=area.querySelector('select');show.value='old';show.dispatchEvent(new w.Event('change'));
  complete({rows:[{...hit,token:'late',quote:'Late old page'}],nextOffset:200});
  await tick();
  assert.equal(area.querySelectorAll('.pl-search-hit').length,0);
  assert.equal(state.nextOffset,null);
  assert.equal(state.show,'old');
 }finally{w.close();}
});

test('The real listening queue names the next episode only while its current row plays, and plays exactly that row; a stale target does nothing',async()=>{
 const h=await listeningFixture({rows:[{kind:'podcasts',id:'feed-A',entryId:'A',title:'Episode A'},{kind:'podcasts',id:'feed-B',entryId:'B',title:'Episode B'},{kind:'podcasts',id:'feed-C',entryId:'C',title:'Episode C'}],index:0,repeat:'off'});
 try{
  assert.equal(h.shelf.upNext(),null,'a restored queue that is not playing names no next episode');
  h.shelf.openQueue();h.w.document.querySelector('.ms-queue-play').click();await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'A');
  const next=h.shelf.upNext();assert.equal(next.index,1);assert.equal(next.title,'Episode B');
  assert.equal((await h.shelf.playUpNext({index:2,queueKey:'stale'})).code,'stale-queue');assert.equal(h.w.player.workspaceAudio.entryId,'A','a stale target changes nothing');
  assert.equal((await h.shelf.playUpNext(next)).ok,true);await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'B');
  const after=h.shelf.upNext();assert.equal(after.title,'Episode C');assert.equal((await h.shelf.playUpNext(after)).ok,true);await tick();await tick();assert.equal(h.w.player.workspaceAudio.entryId,'C');
  assert.equal(h.shelf.upNext(),null,'the last episode has no next one when repeat is off');
 }finally{h.dom.window.close();}
});
