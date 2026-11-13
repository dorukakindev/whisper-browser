'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerMediaShelf}=require('../src/media-shelf-service');
function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backend-data-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'media-shelf.json');
 fs.writeFileSync(file,JSON.stringify({version:1,music:[],books:[],stations:[],playlists:[],diary:[],podcasts:[{id:'p',url:'https://feed.example/rss',title:'Show',episodes:[{guid:'episode',url:'https://audio.example/a.mp3',enclosureType:'audio/mpeg',enclosureLength:100,transcriptDescriptors:[{url:'https://text.example/a.vtt',mime:'text/vtt'},{url:'https://text.example/b.vtt',mime:'text/vtt'}]}]}]}));
 let handle;registerMediaShelf({ipcMain:{handle(_name,fn){handle=fn;}},authorized:()=>true,userData:()=>dir,...options});
 const api=(action,input={})=>handle({}, {action,...input});
 return {api,file,read:()=>JSON.parse(fs.readFileSync(file,'utf8'))};
}
const transcript=text=>({ok:true,timed:'yes',format:'vtt',text:`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n${text}\n`});
test('first registry adoption and an older input with the same declaration remain supported',async t=>{
 let f;f=fixture(t,{podcastRegistryBinding:async persisted=>{
  const store=require('../src/feed-store').createFeedStore(path.join(path.dirname(f.file),'feeds.json'));
  const entry=store.ensurePodcastEntry(persisted),session=require('../src/podcast-session');
  return {entryId:entry.id,sourceVersion:session.sourceVersion(entry),workspace:null};
 }});
 const episode=(await f.api('list')).podcasts[0].episodes[0];
 const result=await f.api('podcast-processing-binding',{id:'p',url:episode.url,sourceVersion:'older-downloaded-version',sourceBinding:episode.sourceBinding});
 assert.equal(result.ok,true,result.error);
 const fresh=(await f.api('list')).podcasts[0].episodes[0];
 assert.equal(fresh.feedEntryId,result.entryId);
 assert.notEqual(fresh.episodeIdentity,episode.episodeIdentity);
});
test('processing binding rejects an enclosure revision changed while registry resolution is pending',async t=>{
 let resolve;const f=fixture(t,{podcastRegistryBinding:()=>new Promise(r=>resolve=r)});
 const episode=(await f.api('list')).podcasts[0].episodes[0];
 const pending=f.api('podcast-processing-binding',{id:'p',url:episode.url,sourceVersion:episode.sourceVersion});
 const data=f.read();data.podcasts[0].episodes[0].enclosureLength=200;fs.writeFileSync(f.file,JSON.stringify(data));
 resolve({entryId:'entry',sourceVersion:episode.sourceVersion,workspace:null});
 assert.equal((await pending).ok,false);
 assert.equal(f.read().podcasts[0].episodes[0].enclosureLength,200);
});
test('a delayed publisher response cannot replace a later chosen transcript',async t=>{
 let resolve;const f=fixture(t,{transcriptFetcher:descriptor=>descriptor.url.endsWith('a.vtt')?new Promise(r=>resolve=r):Promise.resolve(transcript('New choice'))});
 const episode=(await f.api('list')).podcasts[0].episodes[0],binding={id:'p',url:episode.url,sourceVersion:episode.sourceVersion};
 const pending=f.api('podcast-transcript',{...binding,descriptorIndex:0});
 assert.equal((await f.api('podcast-transcript',{...binding,descriptorIndex:1})).ok,true);
 resolve(transcript('Old delayed choice'));
 assert.equal((await pending).ok,false);
 assert.match(f.read().podcasts[0].episodes[0].podcastWorkspace.transcript.text,/New choice/);
 const delayed=f.api('podcast-transcript',{...binding,descriptorIndex:0});
 assert.equal((await f.api('podcast-transcript',{...binding,descriptorIndex:1})).cached,true);
 resolve(transcript('Old delayed choice'));
 assert.equal((await delayed).ok,false);
 assert.match(f.read().podcasts[0].episodes[0].podcastWorkspace.transcript.text,/New choice/);
});
