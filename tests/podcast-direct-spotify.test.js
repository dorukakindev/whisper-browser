'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spotify}=require('../src/podcast-link-source');
const show='https://open.spotify.com/show/7cUmwyJH18B7VGMVQCjokx';
test('Spotify references canonicalize public show/episode variants without trusting other hosts',()=>{
 assert.equal(spotify(show+'?si=share').url,show);
 assert.equal(spotify(show.replace('/show/','/intl-tr/embed/show/')+'/').url,show);
 for(const value of [show.replace('https:','http:'),show.replace('open.spotify.com','open.spotify.com.evil.test'),show.replace('open.spotify.com','user@open.spotify.com'),show.replace('open.spotify.com','open.spotify.com:8443'),'https://open.spotify.com/show/nope'])assert.equal(spotify(value),null);
 assert.equal(require('../src/podcast-session').spotifyEpisode('https://open.spotify.com/intl-tr/episode/37MZdvTl0mYnTwznQQpqcH?si=share'),'https://open.spotify.com/episode/37MZdvTl0mYnTwznQQpqcH');
});
test('saving Spotify sources uses only public metadata and preserves existing shelf state on duplicate and error',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spotify-podcast-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let handler,requests=[],bad=false;
 require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:e=>e.allowed,userData:()=>dir,catalogStore:()=>({list:()=>[]}),fetchImpl:async url=>{requests.push(url);return new Response(JSON.stringify(bad?{}:{title:'Real show title',thumbnail_url:'https://i.scdn.co/image/cover'}));}});
 const call=(action,args={})=>handler({allowed:true,sender:{id:1}},{action,...args});
 assert.equal((await call('podcast-spotify-add',{url:show})).ok,true);
 const file=path.join(dir,'media-shelf.json'),data=JSON.parse(fs.readFileSync(file));data.diary.push({private:'preserved'});fs.writeFileSync(file,JSON.stringify(data));
 await call('podcast-spotify-add',{url:show+'?si=other'});let saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.podcasts.length,1);assert.equal(saved.podcasts[0].sourceKind,'spotify');assert.deepEqual(saved.podcasts[0].episodes,[]);assert.equal(saved.diary[0].private,'preserved');assert.equal(saved.podcasts[0].id,data.podcasts[0].id);
 const before=fs.readFileSync(file,'utf8');bad=true;assert.equal((await call('podcast-spotify-add',{url:show})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);assert(requests.every(url=>url.startsWith('https://open.spotify.com/oembed?url=')));
 assert.equal((await handler({allowed:false},{action:'podcast-spotify-add',url:show})).ok,false);
});
test('public publisher tracking parameters remain exact while private tokens are rejected',()=>{
 const {safeUrl}=require('../src/feed-parser');const url='https://cdn.publisher.test/episode.mp3?utm_source=Podcast&in_playlist=show';assert.equal(safeUrl(url),url);
 for(const query of ['token=secret','sid=secret','signature=secret'])assert.equal(safeUrl('https://cdn.publisher.test/episode.mp3?'+query),'');
});

test('larger podcast libraries preserve every stored field and leave room for transcript saves',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'large-podcast-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'media-shelf.json'),original={version:1,music:[],books:[],stations:[],podcasts:[],playlists:[],diary:[],preservedMetadata:'x'.repeat(16_000_010)};fs.writeFileSync(file,JSON.stringify(original));let handler;require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,userData:()=>dir,catalogStore:()=>({list:()=>[]}),fetchImpl:async()=>new Response(JSON.stringify({title:'Actual show'}))});const saved=await handler({sender:{id:1}},{action:'podcast-spotify-add',url:show});assert.equal(saved.ok,true,saved.error);const after=JSON.parse(fs.readFileSync(file));assert.equal(after.preservedMetadata,original.preservedMetadata);assert.equal(after.podcasts.length,1);});
