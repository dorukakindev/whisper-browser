'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const A=require('../src/stremio-addons'),{createStremioService}=require('../src/stremio-service');

test('custom library metadata keeps a safe default file ID and declared availability without exposing inline streams',()=>{
 const meta=A.normalizeMeta({id:'torbox:123',type:'other',name:'Library torrent',behaviorHints:{defaultVideoId:'torbox:123:1'},videos:[
  {id:'torbox:123:1',title:'Main file',available:true,streams:[{url:'https://media.example/private-token/file.mkv'}]},
  {id:'torbox:123:2',title:'Waiting file',available:false},{id:'torbox:123:3',title:'Unknown file',available:'yes'}
 ]});
 assert.equal(meta.defaultVideoId,'torbox:123:1');
 assert.deepEqual(meta.videos.map(v=>v.available),[true,false,undefined]);
 assert(meta.videos.every(v=>v.season===null&&v.episode===null));
 assert(!JSON.stringify(meta).includes('private-token'),'inline private stream URLs must stay out of public metadata');
 assert.equal(A.normalizeMeta({id:'tb:1',type:'other',name:'x',behaviorHints:{defaultVideoId:'https://bad.example/token'}}).defaultVideoId,'');
});

test('a direct download URL is not automatically labelled as cached or instant',()=>{
 const addon={key:'fixture',host:'provider.example',name:'Torrentio TB'};
 const cached=A.normalizeStream({name:'Torrentio [TB+]',url:'https://media.example/cached.mkv'},addon);
 const pending=A.normalizeStream({name:'Torrentio [TB download]',url:'https://media.example/request.mkv'},addon);
 const unknown=A.normalizeStream({name:'Direct file',url:'https://media.example/direct.mkv'},addon);
 assert.equal(cached.availability,'cached');assert(cached.tags.includes('instant'));
 assert.equal(pending.availability,'download');assert(!pending.tags.includes('instant'));assert(pending.warns.includes('debrid-download'));
 assert.equal(unknown.availability,'unknown');assert(!unknown.tags.includes('instant'));assert(unknown.playable);
});

test('installed other-type debrid catalogs load, refresh and resolve custom file streams through the existing service',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stremio-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const base='https://addon.example/private-token',requests=[];let audioCalls=0;
 const service=createStremioService({root:()=>root,prepareAudio:async()=>{audioCalls++;return {path:'unused.wav'};},fetch:async(url,options)=>{
  requests.push({url,options});let value;
  if(url===base+'/manifest.json')value={id:'fixture.torbox',name:'TorBox fixture',version:'1',types:['other'],resources:['catalog','meta','stream'],catalogs:[{type:'other',id:'torbox-torrents',name:'TorBox Torrents',extra:[{name:'skip'}]}]};
  else if(url===base+'/catalog/other/torbox-torrents.json')value={metas:[{id:'torbox:123',type:'other',name:options.cache==='no-store'?'Ready now':'Previously queued'}]};
  else if(url===base+'/meta/other/torbox:123.json')value={meta:{id:'torbox:123',type:'other',name:'Library torrent',behaviorHints:{defaultVideoId:'torbox:123:1'},videos:[{id:'torbox:123:1',title:'File',available:true}]}};
  else if(url===base+'/stream/other/torbox:123:1.json')value={streams:[{name:'Torrentio [TB+]',url:'https://media.example/private-token/file.mkv'},{name:'Torrentio [TB download]',url:'https://media.example/private-token/waiting.mkv'}]};
  else throw Error('Unexpected fixture endpoint');
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }});
 const preview=await service.handle({}, {action:'addon-preview',url:base+'/manifest.json'});await service.handle({}, {action:'addon-install',token:preview.token});
 const catalogs=(await service.handle({}, {action:'catalogs'})).catalogs;assert.equal(catalogs.length,1);assert.equal(catalogs[0].type,'other');
 const input={action:'catalog',addonKey:catalogs[0].addonKey,type:'other',catalogId:catalogs[0].id};
 const first=await service.handle({},input),fresh=await service.handle({},{...input,refresh:true});
 assert.equal(first.items[0].name,'Previously queued');assert.equal(fresh.items[0].name,'Ready now');
 const refresh=requests.filter(r=>r.url.includes('/catalog/')).at(-1).options;assert.equal(refresh.cache,'no-store');assert.equal(refresh.headers['Cache-Control'],'no-cache');
 const meta=await service.handle({}, {action:'meta',type:'other',id:first.items[0].id});
 const streams=await service.handle({}, {action:'streams',type:'other',id:meta.meta.defaultVideoId});
 assert.equal(streams.videoId,'torbox:123:1');assert.equal(streams.streams[0].availability,'cached');
 const pending=streams.streams.find(s=>s.availability==='download');assert.equal(pending.whisperAudio,'pending');
 const opened=await service.handle({}, {action:'play',token:streams.token,streamId:pending.id});
 await assert.rejects(service.handle({}, {action:'audio-prepare',token:streams.token,streamId:pending.id,key:opened.key,requestId:'pending-audio'}),e=>e.code==='STREAM_AUDIO_PENDING');assert.equal(audioCalls,0);
 assert(!JSON.stringify({catalogs,first,fresh,meta,streams}).includes('private-token'),'public list responses cannot reveal secret-bearing addon or stream URLs');
});

test('inline-only library files use scoped private sessions and reject stale, cross-item and disabled sources',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stremio-inline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const base='https://library.example/secret-config',calls=[];let now=1000;
 const metas=new Map();
 const make=(parent,files)=>({id:parent,type:'other',name:'Library item',videos:files.map(([id,url])=>({id,title:id,streams:[{name:'Library file',url}]}))});
 metas.set('tb:parentA',make('tb:parentA',[['tb:fileA','https://media.example/private/A.mkv'],['tb:fileB','https://media.example/private/B.mkv']]));
 metas.set('tb:parentB',make('tb:parentB',[['tb:fileC','https://media.example/private/C.mkv']]));
 const service=createStremioService({root:()=>root,now:()=>now,fetch:async(url)=>{
  calls.push(url);let value;
  if(url===base+'/manifest.json')value={id:'inline.library',name:'Inline library',version:'1',types:['other'],resources:['catalog','meta'],catalogs:[{type:'other',id:'library',name:'Library'}]};
  else{const parent=url.slice((base+'/meta/other/').length,-5);assert(metas.has(parent),'no stream resource may be requested by an inline-only addon');value={meta:metas.get(parent)};}
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }});
 const preview=await service.handle({}, {action:'addon-preview',url:base+'/manifest.json'});await service.handle({}, {action:'addon-install',token:preview.token});
 const addonKey=(await service.handle({}, {action:'catalogs'})).catalogs[0].addonKey;
 const meta=await service.handle({}, {action:'meta',type:'other',id:'tb:parentA',addonKey});
 assert(meta.meta.videos.every(v=>v.hasInlineStreams));assert(!JSON.stringify(meta).includes('/private/'));
 const pick=(id,metaId='tb:parentA')=>service.handle({}, {action:'streams',type:'other',id,addonKey,metaId});
 const a=await pick('tb:fileA'),b=await pick('tb:fileB');
 const playedA=await service.handle({}, {action:'play',token:a.token,streamId:a.streams[0].id}),playedB=await service.handle({}, {action:'play',token:b.token,streamId:b.streams[0].id});
 assert(playedA.url.endsWith('/A.mkv'));assert(playedB.url.endsWith('/B.mkv'));assert(!JSON.stringify({a,b}).includes('/private/'));
 await service.handle({}, {action:'meta',type:'other',id:'tb:parentB',addonKey});
 await assert.rejects(pick('tb:fileA','tb:parentB'),e=>e.code==='NOT_FOUND');
 metas.set('tb:parentA',make('tb:parentA',[]));
 await service.handle({}, {action:'meta',type:'other',id:'tb:parentA',addonKey});
 await assert.rejects(pick('tb:fileA'),e=>e.code==='NOT_FOUND');
 await assert.rejects(service.handle({}, {action:'play',token:a.token,streamId:a.streams[0].id}),e=>e.code==='EXPIRED');
 await service.handle({}, {action:'addon-toggle',key:addonKey,enabled:false});
 await assert.rejects(pick('tb:fileC','tb:parentB'),e=>e.code==='EXPIRED');
 await service.handle({}, {action:'addon-toggle',key:addonKey,enabled:true});
 await assert.rejects(pick('tb:fileC','tb:parentB'),e=>e.code==='EXPIRED');
 await service.handle({}, {action:'meta',type:'other',id:'tb:parentB',addonKey});now+=600001;
 await assert.rejects(pick('tb:fileC','tb:parentB'),e=>e.code==='EXPIRED');
 metas.set('tb:collisionA',make('tb:collisionA',[['tb:shared','https://media.example/private/one.mkv']]));
 metas.set('tb:collisionB',make('tb:collisionB',[['tb:shared','https://media.example/private/two.mkv']]));
 for(const id of ['tb:collisionA','tb:collisionB'])await service.handle({}, {action:'meta',type:'other',id,addonKey});
 await assert.rejects(service.handle({}, {action:'streams',type:'other',id:'tb:shared'}),e=>e.code==='AMBIGUOUS_INLINE');
 const scoped=await pick('tb:shared','tb:collisionA');assert(scoped.streams.length===1);
 for(let n=0;n<13;n++){const id='tb:bounded'+n;metas.set(id,make(id,[[id+':file','https://media.example/private/'+n+'.mkv']]));await service.handle({}, {action:'meta',type:'other',id,addonKey});}
 assert.equal(service._internals.inlineMetas.size,12);
 await assert.rejects(service.handle({}, {action:'play',token:scoped.token,streamId:scoped.streams[0].id}),e=>e.code==='EXPIRED');
 metas.set('tb:duplicates',make('tb:duplicates',[['tb:duplicate','https://media.example/private/first.mkv'],['tb:duplicate','https://media.example/private/second.mkv']]));
 const duplicates=await service.handle({}, {action:'meta',type:'other',id:'tb:duplicates',addonKey});
 assert(duplicates.meta.videos.every(v=>v.hasInlineStreams===false));await assert.rejects(pick('tb:duplicate','tb:duplicates'),e=>e.code==='NOT_FOUND');
 assert(!calls.some(u=>u.includes('/stream/')));service.dispose();assert.equal(service._internals.inlineMetas.size,0);
 await assert.rejects(service.handle({}, {action:'meta',type:'other',id:'tb:parentA',addonKey}),e=>e.code==='EXPIRED');
});
