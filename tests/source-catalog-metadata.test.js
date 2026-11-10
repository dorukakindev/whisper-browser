'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseFeed,durationSeconds}=require('../src/feed-parser');
const {createFeedStore}=require('../src/feed-store');
const catalog=require('../src/player-source-catalog');
test('RSS, Atom and JSON publisher duration/language persist through a feed reload',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publisher-metadata-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(durationSeconds('01:02:03'),3723);
 assert.equal(durationSeconds('1:99'),null);
 assert.equal(durationSeconds('unknown'),null);
 for(const [body,seconds,language] of [
  ['<rss><channel><language>en</language><item><guid>rss-1</guid><title>Episode</title><itunes:duration>12:34</itunes:duration><enclosure url="https://example.com/a.mp3" type="audio/mpeg"/></item></channel></rss>',754,'en'],
  ['<feed xml:lang="fr"><title>Feed</title><entry xml:lang="tr"><id>atom-1</id><title>Episode</title><link rel="enclosure" href="https://example.com/a.mp3" type="audio/mpeg"/><media:content duration="125"/></entry></feed>',125,'tr'],
  [JSON.stringify({version:'https://jsonfeed.org/version/1.1',language:'de',items:[{id:'json-1',title:'Episode',attachments:[{url:'https://example.com/a.mp3',mime_type:'audio/mpeg',duration_in_seconds:99}]}]}),99,'de'],
 ]){
  const parsed=parseFeed(body,'https://example.com/feed');
  assert.equal(parsed.entries[0].durationSeconds,seconds);
  assert.equal(parsed.entries[0].language,language);
  const file=path.join(root,'feeds-'+seconds+'.json'),store=createFeedStore(file);
  store.subscribe(parsed,parsed.entries,'all');
  const loaded=createFeedStore(file).entries().rows[0];
  assert.equal(loaded.durationSeconds,seconds);assert.equal(loaded.language,language);
 }
});
test('source filters use measured durations, canonical language tags and explicit unknowns',()=>{
 const items=[
  {itemId:'known',sourceId:'local',kind:'local',title:'Known',durationSeconds:26,language:'tur'},
  {itemId:'unknown',sourceId:'local',kind:'local',title:'Unknown',durationSeconds:null,language:null},
  {itemId:'multi',sourceId:'local',kind:'local',title:'Multi',durationSeconds:700,spokenLanguages:['eng','tur']},
 ];
 const query=q=>catalog.queryPlayerItems({batch:{items,revision:'one'},query:q}).items.map(i=>i.itemId);
 assert.deepEqual(query({speechLanguages:['tr']}),['known','multi']);
 assert.deepEqual(query({speechLanguages:['und']}),['unknown']);
 assert.deepEqual(query({speechLanguages:['en'],durations:['10to30']}),['multi']);
});

test('publisher untimed and conditional text never advertises confirmed subtitle languages',()=>{
 const build=descriptors=>({itemId:'episode',sourceId:'publisher',kind:'podcast',title:'Episode',subtitleLanguages:catalog.podcastSubtitleLanguages(descriptors)});
 const result=(item,query)=>catalog.queryPlayerItems({batch:{items:[item],revision:'one'},query}).items.length;
 for(const descriptors of [undefined,[],[{timed:'no',mime:'text/plain',language:'tr'}],[{timed:'no',mime:'text/html',language:'en'}],[{timed:'conditional',mime:'application/ttml+xml',language:'fr'}],[{timed:'yes',mime:'text/vtt',language:null}],[{timed:'yes',mime:'text/vtt',language:'und'}]]){
  const item=build(descriptors);
  assert.equal(item.subtitleLanguages,null);
  assert.equal(result(item,{subtitleAvailability:'present'}),0);
  assert.equal(result(item,{subtitleAvailability:'absent'}),0);
  assert.equal(result(item,{subtitleAvailability:'unknown'}),1);
 }
 const timed=build([{timed:'yes',mime:'text/vtt',language:'TR_tr'},{timed:'no',mime:'text/plain',language:'en'}]);
 assert.deepEqual(timed.subtitleLanguages,['tr-tr']);
 assert.equal(result(timed,{subtitleAvailability:'present',subtitleLanguages:['tr']}),1);
 assert.equal(result(timed,{subtitleLanguages:['en']}),0);
 assert.equal(result(timed,{subtitleAvailability:'absent'}),0);
});

test('late resume history cannot replace a newer playback choice',async()=>{const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),pending=[],opened=[],env={player:{openIntent:0},flushWatchState:async()=>{},watchLibraryCache:[],window:{api:{listWatchLibrary:()=>new Promise(r=>pending.push(r))}},setWorkspaceMode(){},openLocalMedia:async p=>opened.push(p),openWatchLibraryItem:async()=>{}};vm.runInNewContext(text.slice(text.indexOf('window.openMediaCatalogPlayback ='),text.indexOf('async function openHistoryResult(')),env);const a=env.window.openMediaCatalogPlayback({key:'a',type:'local',localPath:'a.mp4'});await new Promise(setImmediate);const b=env.window.openMediaCatalogPlayback({key:'b',type:'local',localPath:'b.mp4'});await new Promise(setImmediate);pending[1]([]);await b;pending[0]([]);await a;assert.deepEqual(opened,['b.mp4']);});

test('source catalog refuses a stale local open and failed automatic transcript never becomes timed',async()=>{const vm=require('node:vm'),text=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8'),code=text.slice(text.indexOf('  async function play('),text.indexOf('  function videoRate('));let resolve,loaded=0;const player={openIntent:0,mediaKey:'old',generation:1,subPath:'',cues:[]},entry={id:'A',title:'A',enclosures:[{type:'audio/mpeg',url:'https://fixture.invalid/a'}]},saved={sourceVersion:'v1',workspace:{rate:1,position:12,transcript:{state:'timed',provenance:'publisher',text:'valid saved SRT'}}},env={player,epoch:0,flushPodcastPosition:async()=>{},close(){},videoRate(){},openLocalMedia:async()=>loaded++,api:async q=>q.action==='entry'?{entry}:q.action==='podcast-materialize'?{path:'missing.srt'}:saved,parseSubtitles:()=>[{start:1,end:2,text:'Hello'}],loadSubtitle:async()=>({ok:false,error:'ENOENT'}),t:(tr,en)=>en,window:{api:{mediaHub:q=>q.action==='folder-play'?new Promise(r=>resolve=r):Promise.resolve({ok:true,key:'rss:A',url:'https://fixture.invalid/a'})},MediaHubUI:{playStream:async s=>{player.mediaKey=s.key;player.generation++;}},PlayerWorkspaceIntegration:{refresh(){}}}};vm.runInNewContext(code+';globalThis.run=play;',env);const local=env.run({file:{id:'f'},folder:{id:'folder'}},'play');await new Promise(setImmediate);player.openIntent++;player.mediaKey='B';player.generation++;resolve({ok:true,path:'A.mp4'});await local;assert.equal(loaded,0);await assert.rejects(env.run({entry},'play'),/ENOENT|loaded|load/i);assert.notEqual(player.workspaceAudio.transcriptState,'timed');assert.equal(player.subPath,'');env.loadSubtitle=async path=>{player.subPath=path;player.cues=[{start:1,end:2,text:'Loaded'}];return {ok:true};};await env.run({entry},'play');assert.equal(player.workspaceAudio.transcriptState,'timed');assert.equal(player.subPath,'missing.srt');});

test('resume authorization belongs to the last live dialog selection and cannot reopen a closed card',async()=>{const {JSDOM}=require('jsdom');for(const closeOnly of [false,true]){const dom=new JSDOM('<button id="mediaCatalogOpen"></button><dialog id="mediaCatalogDialog"><div id="mediaCatalogRoot"></div></dialog>',{runScripts:'outside-only'}),w=dom.window;try{w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.WhisperTextFold={search:v=>String(v).toLowerCase()};w.UiLocale={get:()=> 'en'};const d=w.document.querySelector('dialog');d.showModal=()=>d.open=true;d.close=()=>{d.open=false;d.dispatchEvent(new w.Event('close'));};const pending=new Map(),opened=[],rows=['A','B'].map((id,i)=>({key:'file:'+id,type:'local',title:id,localPath:id+'.mp4',position:30,duration:300,lastWatched:i+1}));w.api={mediaCatalog:async()=>({ok:true,items:[]}),listWatchLibrary:async()=>rows,getQueueState:async()=>({items:[]}),authorizeWatchItem:key=>new Promise(r=>pending.set(key,r))};w.openMediaCatalogPlayback=async item=>opened.push(item.title);for(const file of ['src/renderer/player-ui-kit.js','src/catalog-conditions.js','src/renderer/media-catalog.js'])w.eval(fs.readFileSync(file,'utf8'));await w.MediaCatalogUI.open();[...w.document.querySelectorAll('button')].find(b=>/Devam edenler|In progress/.test(b.textContent)).click();await new Promise(setImmediate);await new Promise(setImmediate);const cards=[...w.document.querySelectorAll('.mc-resume-section .mc-card')],card=id=>cards.find(c=>c.querySelector('strong')?.textContent===id);card('A').querySelector('button').click();if(closeOnly)d.close();else{card('B').querySelector('button').click();pending.get('file:B')({ok:true});await new Promise(setImmediate);}pending.get('file:A')({ok:true});await new Promise(setImmediate);assert.deepEqual(opened,closeOnly?[]:['B']);}finally{w.close();}}});
