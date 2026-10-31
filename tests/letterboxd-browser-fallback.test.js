'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {registerMediaTools}=require('../src/media-tools-service');
function fixture({status=403,collect,fetchImpl}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-browser-fallback-')),handlers=new Map(),app=new EventEmitter();app.getPath=()=>root;
 const item={id:'film',kind:'film',title:'Example',year:2026,imdbId:'tt1234567'};
 registerMediaTools({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,dialog:{},owner:()=>null,catalogStore:()=>({get:()=>item}),fetchImpl:fetchImpl||(async()=>new Response('Controlled failure',{status})),collectBrowserReviews:collect});
 return {item,request:values=>handlers.get('media-tools:request')({},values),close:()=>{app.emit('before-quit');fs.rmSync(root,{recursive:true,force:true});}};
}
const packet={action:'reviews-auto',itemId:'film',id:'request-one',count:40,sort:'popular'};

test('HTTP403 opens the normal browser collector with count40 and preserves its actual result',async()=>{
 let calls=0;const f=fixture({collect:async(item,options)=>{calls++;assert.equal(item.imdbId,'tt1234567');assert.equal(options.count,40);assert.equal(options.sort,'popular');assert(options.signal instanceof AbortSignal);return {reviews:[{id:'one',text:'A controlled public review.'}],match:{state:'matched'},partial:true,warning:'Letterboxd HTTP 403. Later Browser page unavailable.'};}});
 try{const r=await f.request(packet);assert(r.ok,JSON.stringify(r));assert.equal(calls,1);assert.equal(r.transport,'browser');assert.equal(r.reviews.length,1);assert.equal(r.partial,true);}finally{f.close();}
});

test('Other HTTP errors do not launch browser windows or retry rate limits',async()=>{
 for(const status of [401,404,429,503]){let calls=0;const f=fixture({status,collect:async()=>{calls++;return {};}});try{const r=await f.request(packet);assert.equal(r.ok,false);assert.match(r.error,new RegExp('HTTP '+status));assert.equal(calls,0);}finally{f.close();}}
});

test('Film identity is rechecked after browser collection and cannot save another match',async()=>{
 let f;f=fixture({collect:async()=>{f.item.imdbId='tt9999999';return {reviews:[],match:{state:'matched'}};}});
 try{const r=await f.request(packet);assert.equal(r.ok,false);assert.match(r.error,/film match changed/);}finally{f.close();}
});

test('Cancelling a normal browser collection aborts its signal and releases the job',async()=>{
 let started,release,signal;const ready=new Promise(resolve=>started=resolve),f=fixture({collect:async(_item,options)=>{signal=options.signal;started();await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return {reviews:[]};}});
 try{const pending=f.request(packet);await ready;const busy=await f.request({...packet,id:'request-two'});assert.equal(busy.ok,false);assert.match(busy.error,/already running/);assert((await f.request({action:'reviews-stop',id:packet.id})).ok);assert(signal.aborted);const result=await pending;assert.equal(result.ok,false);release();}finally{f.close();}
});

function partialFetch(url){
 if(url.includes('/imdb/'))return Promise.resolve(new Response(null,{status:302,headers:{location:'https://letterboxd.com/film/example/'}}));
 if(url.includes('/page/2/'))return Promise.resolve(new Response('Controlled block',{status:403}));
 return Promise.resolve(new Response('<meta property="og:title" content="Example (2026) • Letterboxd"><article><a class="name">Reader</a><div class="js-review-body">One readable public source review before the later block.</div></article>'));
}
test('A later HTTP403 can continue in the browser, while a failed browser preserves the partial sample',async()=>{
 for(const fails of [false,true]){let calls=0;const f=fixture({fetchImpl:partialFetch,collect:async()=>{calls++;if(fails)throw Error('Finish normal site verification.');return {reviews:[{id:'browser',text:'A completed normal browser sample.'}],partial:false};}});
  try{const r=await f.request(packet);assert(r.ok,JSON.stringify(r));assert.equal(calls,1);if(fails){assert.equal(r.partial,true);assert.match(r.reviews[0].text,/before the later block/);assert.match(r.warning,/Finish normal site verification/);}else{assert.equal(r.transport,'browser');assert.equal(r.partial,false);assert.equal(r.reviews[0].id,'browser');}}finally{f.close();}
 }
});
