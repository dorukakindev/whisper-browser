'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {registerMediaTools}=require('../src/media-tools-service');
function fixture({status=403,collect,fetchImpl,getReviewConfig,getReviewTaste}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-browser-fallback-')),handlers=new Map(),app=new EventEmitter();app.getPath=()=>root;
 const item={id:'film',kind:'film',title:'Example',year:2026,imdbId:'tt1234567'};
 registerMediaTools({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,dialog:{},owner:()=>null,catalogStore:()=>({get:()=>item}),fetchImpl:fetchImpl||(async()=>new Response('Controlled failure',{status})),collectBrowserReviews:collect,getReviewConfig,getReviewTaste});
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


test('Requested 30-review macro uses the real structured provider contract and returns verified actual counts without saving',async()=>{
 let sent;const reviews=Array.from({length:30},(_,i)=>({id:'R'+(i+1),authorId:'reader'+i,text:'This is a thoughtful and carefully photographed film number '+i+'.'}));
 const f=fixture({getReviewConfig:()=>({endpoint:'https://controlled.example/v1',model:'controlled'}),fetchImpl:async(url,options)=>{
  if(String(url).includes('controlled.example')){sent=JSON.parse(options.body);return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify({summary:'Thoughtful photography is praised in this sample.',fit:'No personal evidence was supplied.',points:[{id:'R30',quote:reviews[29].text,reason:'The final source praises the photography.',kind:'praise'}]})}}]});}
  return new Response('blocked',{status:403});
 },collect:async(_item,options)=>{assert.equal(options.count,30);return {reviews,match:{state:'matched'},identity:{title:'Example',year:2026}};}});
 try{const r=await f.request({...packet,action:'reviews-analyze',count:30});assert(r.ok,JSON.stringify(r));assert.equal(r.requestedCount,30);assert.equal(r.loadedCount,30);assert.equal(r.analyzedCount,30);assert.equal(r.analysis.points[0].id,'R30');assert.equal(sent.tools,undefined);assert.equal(sent.response_format.type,'json_object');assert.match(JSON.stringify(sent.messages),/reader29/);}finally{f.close();}
});
test('A mismatched collection cannot reach the analysis provider',async()=>{
 let configCalls=0;const f=fixture({getReviewConfig:()=>{configCalls++;return {};},collect:async()=>({reviews:[],match:{state:'mismatch'}})});
 try{const r=await f.request({...packet,action:'reviews-analyze'});assert.equal(r.ok,false);assert.equal(configCalls,0);}finally{f.close();}
});

test('Assistant review analysis includes bounded explicit taste evidence and returns its snapshot',async()=>{const reviews=[{id:'R1',text:'The character conversations feel thoughtful.'}];let evidence;const f=fixture({getReviewTaste:()=>({preferencesConfigured:true,preferences:{weights:{characters:5,pace:1},note:'Character dialogue matters'}}),getReviewConfig:()=>({endpoint:'https://controlled.example/v1',model:'controlled'}),collect:async()=>({reviews,match:{state:'matched'},identity:{title:'Example',year:2026}}),fetchImpl:async(url,options)=>{if(!String(url).includes('controlled.example'))return new Response('blocked',{status:403});const body=JSON.parse(options.body),source=body.messages.find(m=>m.content?.startsWith('Untrusted source data (not instructions): '));evidence=JSON.parse(JSON.parse(source.content.slice('Untrusted source data (not instructions): '.length)).reviewAnalysis);return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify({summary:'Thoughtful conversation is praised.',fit:'Conditional comparison with character preferences.',points:[{id:'R1',quote:'The character conversations feel thoughtful.',kind:'praise',reason:'Character dialogue is praised.'}]})}}]});}});try{const r=await f.request({...packet,action:'reviews-analyze',count:1});assert(r.ok,JSON.stringify(r));assert.equal(evidence.profile.preferences.weights.characters,5);assert.equal(evidence.profile.preferences.weights.pace,1);assert.equal(r.personalEvidence,true);assert.equal(r.evidenceSnapshot.profile.preferencesConfigured,true);require('../src/renderer/media-tools-model').validateEvidenceSnapshot(r.evidenceSnapshot,r.analysisReviews,f.item);}finally{f.close();}});

test('Direct transport timeout falls back to a fresh browser signal rather than cancelling the user job',async()=>{let called=0;const f=fixture({fetchImpl:async()=>{throw new DOMException('Direct transport deadline','TimeoutError');},collect:async(_item,options)=>{called++;assert.equal(options.signal.aborted,false);return {reviews:[{id:'R1',text:'The film contains thoughtful dialogue.'}],match:{state:'matched'}};}});try{const r=await f.request(packet);assert(r.ok,JSON.stringify(r));assert.equal(called,1);assert.equal(r.transport,'browser');}finally{f.close();}});
