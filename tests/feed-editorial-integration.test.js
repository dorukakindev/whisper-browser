'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerFeeds}=require('../src/feed-service');
const {groupStories}=require('../src/feed-story-identity');
test('editorial review binds exact evidence, source, catalog state, sender, version and retention',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-editorial-')),app=new EventEmitter();app.getPath=()=>dir;t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=10000,body='The film is beautifully photographed.',catalog={id:'film',kind:'film',title:'Witness',year:2026};
 const event={sender:{id:1}};
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,userData:()=>dir,catalogStore:()=>({get:id=>id==='film'?catalog:null}),autoStart:false,now:()=>now,fetchValidated:async()=>new Response('<rss><channel><title>Publisher</title><item><guid>one</guid><link>https://publisher.example/one</link><title>Witness review</title><description>'+body+'</description></item></channel></rss>')});t.after(()=>service.dispose());
 const request=input=>service.handle(event,input);
 const preview=await request({action:'preview',url:'https://publisher.example/rss'});await request({action:'subscribe',token:preview.token});const entry=service.store.entries().rows[0];
 const data={action:'editorial-preview',entryId:entry.id,contentKind:'criticism',stance:'positive',quote:body};
 assert.equal((await request({...data,quote:'Invented quote'})).ok,false);
 let card=await request(data);assert.equal(card.ok,true);event.sender.id=2;assert.equal((await request({action:'editorial-confirm',token:card.token})).ok,false);event.sender.id=1;
 assert.equal((await request({action:'editorial-confirm',token:card.token})).ok,true);
 let row=(await request({action:'entry',entryId:entry.id})).entry;assert.equal(row.stance,'positive');assert.equal(row.editorialBy,'user');
 const old=await request(data);card=await request(data);await request({action:'editorial-confirm',token:card.token});assert.equal((await request({action:'editorial-confirm',token:old.token})).ok,false);
 card=await request(data);now+=600001;assert.equal((await request({action:'editorial-confirm',token:card.token})).ok,false);
 let link=await request({action:'link-preview',entryId:entry.id,catalogId:'film'});await request({action:'link-confirm',token:link.token});row=(await request({action:'entry',entryId:entry.id})).entry;assert.equal(row.links[0].state,'confirmed');
 card=await request(data);catalog={...catalog,title:'Changed'};assert.equal((await request({action:'editorial-confirm',token:card.token})).ok,false);assert.equal((await request({action:'entry',entryId:entry.id})).entry.links[0].state,'stale');
 body='Updated source text.';await request({action:'refresh',feedId:entry.feedId});row=(await request({action:'entry',entryId:entry.id})).entry;assert.equal(row.editorialState,'stale');assert.equal(row.stance,'unknown');assert.equal(row.contentKind,'unknown');
 await request({action:'unsubscribe',feedId:entry.feedId});assert.ok(service.store.entry(entry.id).editorial);
});
test('neutral and unknown are not opposing opinions, information kinds stay separate',()=>{
 const rows=[{entryId:'1',url:'https://a.example/one',title:'Witness story',workId:'film',contentKind:'criticism',stance:'neutral'},{entryId:'2',url:'https://b.example/two',title:'Witness story',workId:'film',contentKind:'criticism',stance:'unknown'}];
 assert.equal(groupStories(rows)[0].opposingStances,false);
 rows[0].stance='positive';rows[1].stance='negative';assert.equal(groupStories(rows)[0].opposingStances,true);
 rows[1].contentKind='award';assert.equal(groupStories(rows).length,2);
});

test('shared summary prefixes do not collapse distinct full opinions',()=>{
 const prefix='This is a shared introduction to the film and its themes. '.repeat(8);
 const rows=[{entryId:'a',publisherId:'p1',url:'https://one.example/a',title:'Review',summary:prefix,text:prefix+'I recommend it.',contentScope:'summary'}, {entryId:'b',publisherId:'p2',url:'https://two.example/b',title:'Review',summary:prefix,text:prefix+'I reject it.',contentScope:'summary'}];
 assert.equal(groupStories(rows).reduce((sum,topic)=>sum+topic.stories.length,0),2);
});
