'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerFeeds}=require('../src/feed-service');
test('actual feed IPC translates revision-bound content, uses the configured translator, caches, and cancels only its owner',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-translate-')),app=new EventEmitter(),event={sender:{id:1}};let calls=0;
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:()=>true,userData:()=>dir,autoStart:false,translateText:async(text,signal)=>{calls++;if(text==='Wait')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));return 'Çeviri: '+text;}});
 try{service.store.subscribe({url:'https://example.org/rss',title:'Journal'},[{externalId:'a',title:'Article',kind:'article',contentScope:'summary',textFormat:'plain',text:'Original'},{externalId:'b',title:'Wait',kind:'article',contentScope:'summary',textFormat:'plain',text:'Wait'}],'all');const rows=service.store.entries().rows,entry=rows.find(e=>e.text==='Original');const input={action:'translate',entryId:entry.id,revision:entry.revision,requestId:'test-translate'};
 const r=await service.handle(event,input);assert.equal(r.ok,true);assert.equal(r.text,'Çeviri: Original');assert.equal(service.store.entry(entry.id).text,'Original');assert.equal((await service.handle(event,input)).cached,true);assert.equal(calls,1);assert.equal((await service.handle(event,{...input,revision:'stale'})).ok,false);
 const waiting=rows.find(e=>e.text==='Wait'),pending=service.handle(event,{action:'translate',entryId:waiting.id,revision:waiting.revision,requestId:'waiting'});await new Promise(r=>setTimeout(r,0));await service.handle({sender:{id:2}},{action:'cancel',requestId:'waiting'});await service.handle(event,{action:'cancel',requestId:'waiting'});assert.equal((await pending).ok,false);
 }finally{service.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});
test('oldest sort applies before pagination and does not change the newest default',()=>{
 const {createFeedStore}=require('../src/feed-store'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-order-')),store=createFeedStore(path.join(dir,'feeds.json'));
 try{store.subscribe({url:'https://example.org/rss',title:'Journal'},[1,2,3].map(n=>({externalId:String(n),title:String(n),text:'Text',kind:'article',contentScope:'summary',publishedAt:n*1000})),'all');assert.equal(store.entries({sort:'oldest',limit:1}).rows[0].title,'1');assert.equal(store.entries({sort:'oldest',limit:1,offset:1}).rows[0].title,'2');assert.equal(store.entries({limit:1}).rows[0].title,'3');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
