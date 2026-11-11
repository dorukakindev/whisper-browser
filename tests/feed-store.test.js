'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFeedStore}=require('../src/feed-store');
test('GUID collisions, canonical provenance, state and offline content survive atomic reload',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-store-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const one=s.subscribe({url:'https://a.example/rss',title:'A'},[{externalId:'same',url:'https://article.example/a',title:'A',text:'Summary',contentScope:'summary',kind:'article'},{externalId:'same',url:'https://article.example/b',title:'B',text:'Another',contentScope:'summary',kind:'article'}],'all');assert.equal(s.entries({}).total,2);
 const row=s.entries({}).rows[0];s.setState([row.id],{read:true,saved:true});s.commit(one.feed.id,{entries:[{externalId:'same',url:row.url,title:'Updated',text:'Changed summary',contentScope:'summary',kind:'article'}],etag:'v2'});assert.equal(s.entry(row.id).read,true);assert.equal(s.entry(row.id).saved,true);
 s.subscribe({url:'https://b.example/rss',title:'B'},[{externalId:'different',url:row.url,title:'Shared',text:'Summary',contentScope:'summary',kind:'article'}],'all');assert.equal(s.entry(row.id).provenance.length,2);s.failure(one.feed.id,{error:'Offline',errorKind:'network'});assert.equal(createFeedStore(path.join(dir,'feeds.json')).entry(row.id).saved,true);
 s.unsubscribe(one.feed.id);assert(s.entry(row.id));assert.equal(s.list().feeds.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('mark-read applies only explicit snapshot IDs and undo does not swallow newly arrived entries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-read-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const f=s.subscribe({url:'https://a.example/rss',title:'A'},[{externalId:'1',url:'https://a.example/1',title:'One',text:'One',kind:'article',contentScope:'summary'}],'all');const ids=s.entries({}).rows.map(r=>r.id),changed=s.setState(ids,{read:true});s.commit(f.feed.id,{entries:[{externalId:'2',url:'https://a.example/2',title:'Two',text:'Two',kind:'article',contentScope:'summary'}]});assert.equal(s.entries({unread:true}).total,1);s.undo(changed.token);assert.equal(s.entries({unread:true}).total,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('initial cursors also apply to pending OPML feeds and empty valid snapshots count as successful checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-initial-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const pending=s.subscribe({url:'https://a.example/rss',title:'A'},[],'now');s.commit(pending.feed.id,{entries:[{externalId:'1',url:'https://a.example/1',title:'One',text:'One',kind:'article',contentScope:'summary'}],format:'rss'});assert.equal(s.entries({unread:true}).total,0);const empty=s.subscribe({url:'https://b.example/rss',title:'B',format:'rss'},[],'all');assert.equal(empty.feed.state,'unchanged');assert(empty.feed.lastSuccess>0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('latest20 imports the newest dated entries regardless of publisher order',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feeds-order-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));const rows=Array.from({length:25},(_,i)=>({externalId:String(i),url:'https://a.example/'+i,title:'Entry '+i,text:'Body',kind:'article',contentScope:'summary',publishedAt:1000+i}));s.subscribe({url:'https://a.example/rss'},rows,'latest20');const unread=s.entries({unread:true}).rows;assert.equal(unread.length,20);assert.deepEqual(unread.map(e=>e.externalId),Array.from({length:20},(_,i)=>String(24-i)));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('R27 automatic capacity trimming and unsubscribe retain personal podcast work without changing saved flags',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retention-'));try{const file=path.join(dir,'feeds.json');let s=createFeedStore(file,{now:()=>10000});const subscribed=s.subscribe({url:'https://feed.example/rss'},[{externalId:'old',url:'https://pub.example/old',title:'Old',text:'Summary',contentScope:'summary',kind:'podcast',enclosures:[{url:'https://audio.example/old.mp3',type:'audio/mpeg'}]}]);const e=s.entries().rows[0],S=require('../src/podcast-session');s.podcastWorkspace(e.id,S.sourceVersion(e),{position:123,transcript:{state:'untimed',format:'plain',provenance:'user',text:'Personal transcript'}});const d=s.snapshot();d.entries[0].receivedAt=1;for(let i=1;i<4000;i++)d.entries.push({...structuredClone(d.entries[0]),id:'filler-'+i,canonicalId:'filler-'+i,externalId:'filler-'+i,url:'https://pub.example/'+i,kind:'article',podcastWorkspace:undefined,receivedAt:i+1});fs.writeFileSync(file,JSON.stringify(d));s=createFeedStore(file,{now:()=>10000});s.commit(subscribed.feed.id,{entries:[{externalId:'new',url:'https://pub.example/new',title:'New',text:'New',contentScope:'summary',kind:'article'}]});assert.equal(s.entry(e.id).podcastWorkspace.transcript.text,'Personal transcript');assert.equal(s.entry(e.id).saved,false);assert.equal(s.snapshot().entries.length,4000);const full=s.snapshot();full.entries.forEach(e=>e.saved=true);fs.writeFileSync(file,JSON.stringify(full));s=createFeedStore(file);const bytesBefore=fs.readFileSync(file,'utf8');assert.equal(s.retention().protected,4000);assert.throws(()=>s.commit(subscribed.feed.id,{entries:[{externalId:'overflow',url:'https://pub.example/overflow',title:'Overflow',text:'x',kind:'article',contentScope:'summary'}]}),/capacity|kapasite/i);assert.equal(fs.readFileSync(file,'utf8'),bytesBefore);s.unsubscribe(subscribed.feed.id);assert.equal(s.entry(e.id).podcastWorkspace.position,123);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('R26 shelf bridge rejects a changed enclosure while preserving the previous source and personal workspace',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'binding-change-'));try{const s=createFeedStore(path.join(dir,'feeds.json')),p={podcast:{url:'https://feed.example/rss',title:'Show'},episode:{guid:'ep',url:'https://audio.example/old.mp3',title:'Episode'}};const e=s.ensurePodcastEntry(p),before=JSON.stringify(s.snapshot());assert.equal(s.ensurePodcastEntry(p).id,e.id);assert.throws(()=>s.ensurePodcastEntry({...p,episode:{...p.episode,url:'https://audio.example/new.mp3'}}),/source changed|kaynağı değişti/i);assert.equal(JSON.stringify(s.snapshot()),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('P08 compact retention inventory counts pinned sources without changing saved state or data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-retained-'));try{const s=createFeedStore(path.join(dir,'feeds.json'));s.subscribe({url:'https://pod.example/feed'},[{externalId:'one',title:'One',kind:'podcast',contentScope:'summary',text:'Source',enclosures:[{url:'https://pod.example/a.mp3',type:'audio/mpeg'}]}]);const e=s.entries().rows[0];s.sourcePins([e.id]);const before=JSON.stringify(s.snapshot()),row=s.entries({kind:'podcast',podcastLibrary:true}).rows[0];assert.equal(row.personalWorkRetained,true);assert.equal(row.saved,false);assert.equal(JSON.stringify(s.snapshot()),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('G04 listening history survives refresh, unsubscribe and reload without becoming a rating',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'listen-history-'));try{const file=path.join(dir,'feeds.json'),store=createFeedStore(file),entry={kind:'podcast',contentScope:'summary',externalId:'e',title:'Episode',text:'Description',enclosures:[{url:'https://pod.example/a.mp3',type:'audio/mpeg'}]};const feed=store.subscribe({url:'https://pod.example/rss'},[entry]);const row=store.entries().rows[0],version=require('../src/podcast-session').sourceVersion(row);store.podcastListened(row.id,version);const at=store.entry(row.id).lastListenedAt;store.commit(feed.feed.id,{entries:[{...entry,title:'Updated'}]});assert.equal(store.entry(row.id).lastListenedAt,at);store.unsubscribe(feed.feed.id);const again=createFeedStore(file).entry(row.id);assert.equal(again.lastListenedAt,at);assert.equal(again.listened,undefined);assert(require('../src/feed-retention').reasons(again).includes('listening-observation'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('publisher archive keeps separate audio episodes on one page and repeat imports preserve work',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'web-archive-'));try{
  const file=path.join(dir,'feeds.json'),s=createFeedStore(file),podcast={url:'https://pub.example/archive',title:'Archive',sourceKind:'web-episode'};
  const input=(number)=>({podcast,episode:{url:`https://audio.example/${number}.mp3`,pageUrl:podcast.url,title:`Recording ${number}`,enclosureType:'audio/mpeg'}});
  const one=s.ensurePodcastEntry(input(1),{save:true});s.podcastWorkspace(one.id,require('../src/podcast-session').sourceVersion(one),{position:42,rate:1});
  const protectedOne=s.entry(one.id),two=s.ensurePodcastEntry(input(2),{save:true});
  assert.notEqual(one.id,two.id);assert.equal(s.snapshot().entries.length,2);assert.deepEqual(s.entry(one.id),protectedOne);
  assert.equal(s.ensurePodcastEntry(input(1),{save:true}).id,one.id);assert.equal(s.ensurePodcastEntry(input(2),{save:true}).id,two.id);
  assert.equal(createFeedStore(file).snapshot().entries.length,2);assert.deepEqual(s.entry(one.id),protectedOne);
  const visible=s.entries({podcastLibrary:true,kind:'podcast'});assert.equal(visible.total,2);assert(visible.rows.every(e=>e.entryIds.length===1));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
