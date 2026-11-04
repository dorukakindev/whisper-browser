'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module'),path=require('node:path');
const {parseYouTubeFeed}=require('../src/subscription-feed');
const CHANNEL='UCAuUUnT6oDeKwE6v1NGQxug',OTHER='UCBJycsmduvYEL83R_U4JriQ';
const feed=(root=CHANNEL.slice(2),entry=CHANNEL)=>'<feed><yt:channelId>'+root+'</yt:channelId><title>Channel</title><entry><yt:videoId>video123abc</yt:videoId><yt:channelId>'+entry+'</yt:channelId><title>Title</title></entry></feed>';

function handler(fetchImpl){
 const file=path.join(__dirname,'../src/main.js'),source=fs.readFileSync(file,'utf8');
 const start=source.indexOf("ipcMain.handle('subs:rssFeed'"),end=source.indexOf("ipcMain.handle('settings:export'",start);
 let handle;
 vm.runInNewContext(source.slice(start,end),{
  ipcMain:{handle(_name,fn){handle=fn;}},authorizedBrowserSender:event=>event==='owner',networkOnline:()=>true,
  require:createRequire(file),fetch:fetchImpl,AbortController,URL,setTimeout,clearTimeout,
  readResponseBufferLimited:async(response,limit)=>{const data=Buffer.from(await response.arrayBuffer());if(data.length>limit)throw Error('limit');return data;},
 });
 return handle;
}

test('official RSS root suffix and per-entry canonical identities remain attached to their source',()=>{
 assert.equal(parseYouTubeFeed(feed()).channel.authorId,CHANNEL);
 assert.equal(parseYouTubeFeed(feed()).videos[0].authorId,CHANNEL);
 const suffix='UC'+'x'.repeat(20);
 assert.equal(parseYouTubeFeed(feed(suffix,'UC'+suffix)).channel.authorId,'UC'+suffix);
 assert.equal(parseYouTubeFeed(feed(CHANNEL,OTHER)).videos[0].authorId,OTHER);
});

test('the real RSS handler retries a 404 on the fixed official uploads feed and reports skipped inputs',async()=>{
 const calls=[];
 const handle=handler(async(url,options)=>{calls.push({url,options});return calls.length===1?new Response('',{status:404}):new Response(feed());});
 assert.equal((await handle('iframe',{channels:[{authorId:CHANNEL}]})).ok,false);
 const result=await handle('owner',{channels:[{authorId:CHANNEL},{authorId:CHANNEL},{authorId:'invalid'}]});
 assert.equal(result.ok,true);
 assert.equal(result.videos[0].authorId,CHANNEL);
 assert.equal(result.skipped,2);
 assert.equal(calls.length,2);
 assert.equal(calls[1].url,'https://www.youtube.com/feeds/videos.xml?playlist_id=UU'+CHANNEL.slice(2));
 assert.equal(calls[0].options.signal,calls[1].options.signal,'Retry shares the original deadline');
 assert.ok(calls.every(call=>call.options.redirect==='manual'));
});

test('RSS rejects a different channel, off-host redirects and oversized bodies without a new provider',async()=>{
 for(const response of [
   ()=>new Response(feed(OTHER,OTHER)),
   ()=>new Response('',{status:302,headers:{location:'https://example.com/private'}}),
   ()=>new Response('x'.repeat(256*1024+1)),
 ]){
  let calls=0;
  const result=await handler(async()=>{calls++;return response();})('owner',{channels:[{authorId:CHANNEL}]});
  assert.equal(result.ok,false);assert.equal(result.errors,1);assert.equal(calls,1);
 }
 let calls=0;
 const result=await handler(async()=>{calls++;return new Response('',{status:403});})('owner',{channels:[{authorId:CHANNEL}]});
 assert.equal(result.ok,false);assert.equal(calls,1,'403 does not trigger a hidden bypass');
});
