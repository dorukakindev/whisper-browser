'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerFeeds}=require('../src/feed-service');
const session=require('../src/podcast-session');
function fixture(translate,extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-prose-')),app=new EventEmitter(),event={sender:{id:1}};
 const service=registerFeeds({app,ipcMain:{handle(){}},authorized:e=>e===event,userData:()=>dir,autoStart:false,translateText:translate,...extra});
 const parsed=require('../src/feed-parser').parseFeed('<rss version="2.0"><channel><title>Publisher</title><item><guid>episode</guid><title>Episode</title><link>https://publisher.example/episode</link><enclosure url="https://publisher.example/audio.mp3" type="audio/mpeg" length="1000"/></item></channel></rss>','https://publisher.example/rss');
 service.store.subscribe({...parsed,url:'https://publisher.example/rss'},parsed.entries);
 const entry=service.store.entries({kind:'podcast'}).rows[0],version=session.sourceVersion(entry);
 const save=text=>service.store.podcastWorkspace(entry.id,version,{transcript:{state:'untimed',format:'plain',text,provenance:'publisher',status:'complete'}});
 save('First paragraph.\n\nSecond paragraph.');
 const request=(more={})=>service.handle(event,{action:'podcast-translate-text',entryId:entry.id,sourceVersion:version,expectedTranscriptText:service.store.entry(entry.id).podcastWorkspace.transcript.text,requestId:'text-job',...more});
 return {...service,dir,event,entry,version,save,request,close(){service.dispose();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('untimed publisher translation uses existing service and saves no fake timing or materialized files',async()=>{
 const calls=[],f=fixture(async text=>{calls.push(text);return 'Birinci paragraf.\n\nİkinci paragraf.';});
 try{const before=f.store.entry(f.entry.id).podcastWorkspace.transcript;const result=await f.request();assert.equal(result.ok,true,result.error);assert.equal(calls.length,1);assert.equal(result.translation.state,'untimed');assert.equal(result.translation.format,'plain');assert.deepEqual(f.store.entry(f.entry.id).podcastWorkspace.transcript,before);assert.equal(f.store.entry(f.entry.id).podcastWorkspace.translation.text,result.translation.text);assert(!fs.existsSync(path.join(f.dir,'podcast-transcripts')));assert.equal(result.translation.start,undefined);}finally{f.close();}
});
test('cancel and changed source preserve previous translation and original text',async()=>{
 for(const mode of ['cancel','change']){let release,entered;const ready=new Promise(r=>entered=r),f=fixture(async()=>{entered();return new Promise(r=>release=r);});
 try{f.store.podcastWorkspace(f.entry.id,f.version,{translation:{state:'untimed',format:'plain',text:'Önceki çeviri',provenance:'user'}});const pending=f.request();await ready;if(mode==='cancel')await f.handle(f.event,{action:'cancel',requestId:'text-job'});else f.save('New publisher revision.');release('Late translation');const result=await pending;assert.equal(result.ok,false);const workspace=f.store.entry(f.entry.id).podcastWorkspace;assert.equal((mode==='change'?workspace.previous:workspace).translation.text,'Önceki çeviri');if(mode==='change')assert.equal(workspace.translation,undefined);assert.equal(f.store.entry(f.entry.id).podcastWorkspace.transcript.text,mode==='change'?'New publisher revision.':'First paragraph.\n\nSecond paragraph.');}finally{f.close();}}
});
test('chunks freeze one provider snapshot and reject partial, stale and oversized inputs before API use',async()=>{
 let factories=0,calls=0;const f=fixture(null,{createTextTranslator:()=>{const provider=++factories;return async text=>{calls++;return provider+': '+text;};}});
 try{f.save(('Small paragraph with words. '.repeat(100))+'\n\nLast paragraph.');const result=await f.request();assert.equal(result.ok,true,result.error);assert(calls>1);assert.equal(factories,1);const n=calls;assert.equal((await f.request({sourceVersion:'stale'})).ok,false);assert.equal((await f.request({expectedTranscriptText:'stale'})).ok,false);f.store.podcastWorkspace(f.entry.id,f.version,{transcript:{state:'untimed',format:'plain',text:'Partial',provenance:'asr',status:'partial'}});assert.equal((await f.request()).ok,false);f.save('x'.repeat(50001));assert.equal((await f.request()).ok,false);assert.equal(calls,n);}finally{f.close();}
});


test('podcast prose provider prompt respects the selected language instead of forcing Turkish',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/main.js'),'utf8'),start=source.indexOf('  const targetBaseLanguage ='),end=source.indexOf('  const requestController =',start);
 for(const language of ['tr','de']){const context={config:{targetLanguage:language,register:'natural prose'},sentence:{contextBefore:[],contextAfter:[]},pageMode:false,articleMode:true,synopsisMode:false,sentenceRequest:{},glossary:'',accumulatedTerminology:''};vm.runInNewContext(source.slice(start,end)+';globalThis.prompt=system;',context);assert(context.prompt.includes('Hedef dil: '+language));if(language==='de')assert(!context.prompt.includes('doğal Türkçeye çevir'));}
});

// --- Slice 1 / gereksinim 2: zamansız yayıncı metninde komşu satır (paragraf) bağlamı ---
// Sözleşme: translateContext = çevrilen parçanın önünde/arkasında gösterilen satır sayısı (±N, 0 = kapalı).
// Bu yolda ayar olduğu gibi (yarıya bölünmeden) taşınır; düzyazıda "satır" = boş olmayan metin satırı.
const longParagraphs=(count,size=1500)=>Array.from({length:count},(_,i)=>`P${i+1} `+Array.from({length:Math.round(size/7)},(_,k)=>`p${i+1}w${k}`).join(' ')).join('\n\n');
test('untimed prose passes at most N read-only neighbor lines across chunk boundaries and never turns them into output',async()=>{
 const seen=[];
 const f=fixture(null,{createTextTranslator:()=>async(text,_signal,context)=>{seen.push({text,context});return 'T:'+text;}});
 try{
  f.save(longParagraphs(3));
  const result=await f.request({contextLines:2});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.contextLines,2);
  assert(seen.length>=2,'metin birden çok parçaya bölünmeli');
  assert.deepEqual(seen[0].context.before,[],'ilk parçanın öncesi yok');
  assert(seen[0].context.after.length>=1&&seen[0].context.after.length<=2,'sonraki satır bağlam olarak verilmeli, en çok N');
  assert(seen.at(-1).context.before.length>=1&&seen.at(-1).context.before.length<=2,'önceki satır bağlam olarak verilmeli, en çok N');
  assert.deepEqual(seen.at(-1).context.after,[],'son parçanın sonrası yok');
  for(const call of seen)for(const row of [...call.context.before,...call.context.after]){assert.equal(typeof row,'string');assert(row.length<=700,'bağlam satırı sınırlı olmalı');}
  assert(seen[1].context.before.some(row=>seen[0].text.includes(row.slice(0,40))),'önceki bağlam gerçekten önceki parçadan gelmeli');
  assert.equal(result.translation.text,seen.map(call=>('T:'+call.text).trim()).join('\n\n'),'çıktı yalnız parça çevirilerinden oluşur; bağlam çıktıya girmez');
  assert.equal(result.translation.state,'untimed');assert.equal(result.translation.format,'plain');assert.equal(result.translation.timeline,undefined,'sahte zaman üretilmez');
 }finally{f.close();}
});
test('a wide setting is honoured up to N lines but each side stays inside the character budget',async()=>{
 const seen=[];
 const f=fixture(null,{createTextTranslator:()=>async(text,_s,context)=>{seen.push(context);return 'T:'+text;}});
 try{
  f.save(Array.from({length:40},(_,i)=>`L${i+1} `+'x'.repeat(500)).join('\n'));
  const result=await f.request({contextLines:10});assert.equal(result.ok,true,result.error);
  assert(seen.length>=3);
  for(const context of seen)for(const side of [context.before,context.after]){assert(side.length<=10);assert(side.reduce((n,row)=>n+row.length,0)<=2400,'taraf bütçesi aşıldı');}
  assert(seen.some(context=>context.after.length>=4),'N=10 ayarı fiilen 3 satıra kısılmamalı');
 }finally{f.close();}
});
test('contextLines is validated before any provider call: absent keeps the old no-context behaviour, 0 disables, invalid fails',async()=>{
 const seen=[];const f=fixture(null,{createTextTranslator:()=>async(text,_s,context)=>{seen.push(context);return 'T:'+text;}});
 try{
  f.save(longParagraphs(3));
  const absent=await f.request();assert.equal(absent.ok,true,absent.error);assert(seen.length>=2);assert(seen.every(c=>c.before.length===0&&c.after.length===0),'ayar yoksa eski bağlamsız davranış');
  seen.length=0;
  const off=await f.request({contextLines:0});assert.equal(off.ok,true,off.error);assert(seen.every(c=>c.before.length===0&&c.after.length===0));
  const calls=seen.length;
  for(const bad of [21,-1,1.5,'2',null,NaN]){const r=await f.request({contextLines:bad});assert.equal(r.ok,false,String(bad));}
  assert.equal(seen.length,calls,'geçersiz bağlam isteği sağlayıcıyı çağırmamalı');
 }finally{f.close();}
});
test('a chunk result that echoes the original neighbor text verbatim is rejected and saves nothing (partial safeguard only)',async()=>{
 const f=fixture(null,{createTextTranslator:()=>async(text,_s,context)=>'T:'+text+(context.after[0]?'\n\n'+context.after[0]:'')});
 try{
  f.save(longParagraphs(3));
  const result=await f.request({contextLines:2});
  assert.equal(result.ok,false);assert.match(result.error,/komşu bağlam|neighbor context/i);
  assert.equal(f.store.entry(f.entry.id).podcastWorkspace.translation,undefined,'başarısız sonuç kaydedilmemeli');
 }finally{f.close();}
});
test('article provider prompt marks neighbor paragraphs as read-only context only when context exists',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/main.js'),'utf8'),start=source.indexOf('  const targetBaseLanguage ='),end=source.indexOf('  const requestController =',start);
 const run=sentence=>{const context={config:{targetLanguage:'tr',register:'natural prose'},sentence,pageMode:false,articleMode:true,synopsisMode:false,sentenceRequest:{},glossary:'',accumulatedTerminology:''};vm.runInNewContext(source.slice(start,end)+';globalThis.prompt=system;',context);return context.prompt;};
 assert.match(run({contextBefore:[{text:'Önceki paragraf.'}],contextAfter:[]}),/komşu paragraf/);
 assert.doesNotMatch(run({contextBefore:[],contextAfter:[]}),/komşu paragraf/);
});
test('renderer sends the existing translateContext value unchanged and reads it once when the job starts',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),a=source.indexOf('window.translatePodcastTextSource=async function'),b=source.indexOf('window.retryPodcastTranslation=',a);
 for(const [setting,expected] of [['0',0],['2',2],['4',4],['6',6],['10',10]]){
  const requests=[];let value=setting;
  const ctx={state:{},Date,Error,Promise,Number,document:{getElementById:id=>id==='translateContext'?{get value(){return value;}}:id==='translateTo'?{value:'tr'}:null},podcastQueueOwnerCurrent:()=>true,interfaceChoice:tr=>tr,window:{api:{feedsRequest:async request=>{requests.push(request);return {ok:false,error:'stop'};}}}};
  vm.runInNewContext(source.slice(a,b),ctx);
  await ctx.window.translatePodcastTextSource({entryId:'e',sourceVersion:'v',sourceTranscriptText:'Text.',playbackOwner:'media-shelf'});
  value='10';await new Promise(r=>setTimeout(r,5));
  assert.equal(requests.length,1);assert.equal(requests[0].contextLines,expected,`ayar ${setting}: yarıya bölünmeden, aynen`);
 }
});
// Gerçek sınır: registerFeeds -> main.js'teki gerçek çevirici fabrikası ve istek fonksiyonu -> yakalanan fetch gövdesi -> saklanan sonuç.
function providerBoundary(respond=user=>'TR:'+user.metin){
 const vm=require('node:vm'),path=require('node:path'),source=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
 const a=source.indexOf('function safeTranslationEndpoint(raw) {'),b=source.indexOf('async function requestBrowserSentenceTranslation(sentence, config, signal) {');
 const l=source.indexOf("createTextTranslator:({targetLanguage='tr'}={})=>{"),m=source.indexOf(',translateText:(text,signal)=>translateMediaTextToTurkish',l);
 assert(a>0&&b>a&&l>0&&m>l,'main.js sınırları bulunamadı');
 const srcDir=path.dirname(require.resolve('../src/main.js')),calls=[];
 const ctx=vm.createContext({URL,Buffer,AbortController,Response,setTimeout,clearTimeout,Error,JSON,RegExp,Number,String,Array,Object,Math,Promise,Date,
  require:name=>require(name.startsWith('./')?path.join(srcDir,name):name),
  sendEvent(){},writeJobLog(){},terminologyPrompt:()=>'',redactBrowserDiagnosticsText:text=>String(text),classifyTranslationHttpFailure:()=>({}),pageTranslationRequest:()=>({}),decodePageTranslation:()=>({}),
  browserTranslationConfig:({targetLanguage='tr',register='natural prose'}={})=>({targetLanguage,register,profanity:'moderate',model:'test-model',endpoint:'http://127.0.0.1:9/v1/chat/completions',apiKey:'',glossary:[],terminologyEnabled:false}),
  browserTranslationConfigProblem:()=>'',
  fetch:async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});const user=JSON.parse(body.messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:respond(user)},finish_reason:'stop'}]}),{status:200,headers:{'content-type':'application/json'}});}});
 vm.runInContext(source.slice(a,b)+'\nrequestBrowserSentenceTranslation=(sentence,config,signal)=>requestBrowserSentenceTranslationAtEndpoint(sentence,config,signal,config.endpoint);\nglobalThis.atEndpoint=requestBrowserSentenceTranslationAtEndpoint;',ctx);
 const createTextTranslator=vm.runInContext('('+source.slice(l+'createTextTranslator:'.length,m)+')',ctx);
 return {createTextTranslator,calls,atEndpoint:ctx.atEndpoint,config:ctx.browserTranslationConfig()};
}
test('real provider boundary: neighbor lines travel as separate read-only fields, the target text stays separate, the saved result stays untimed and reopens intact',async()=>{
 const boundary=providerBoundary(),f=fixture(null,{createTextTranslator:boundary.createTextTranslator});
 try{
  const original=longParagraphs(3);f.save(original);
  const result=await f.request({contextLines:3});assert.equal(result.ok,true,result.error);
  assert(boundary.calls.length>=2);
  for(const [index,call] of boundary.calls.entries()){
   const system=call.body.messages[0].content,user=JSON.parse(call.body.messages[1].content);
   assert.match(system,/komşu paragraf/,'sistem istemi komşu satırları salt okunur bağlam olarak tanımlamalı');
   assert.equal(typeof user.metin,'string');assert(Array.isArray(user.onceki)&&Array.isArray(user.sonraki));
   assert(user.onceki.length<=3&&user.sonraki.length<=3);
   for(const row of [...user.onceki,...user.sonraki])assert(!user.metin.includes(row),'bağlam hedef metnin içine karışmamalı');
   if(index===0)assert.deepEqual(user.onceki,[]);
   if(index===boundary.calls.length-1)assert.deepEqual(user.sonraki,[]);
  }
  assert(boundary.calls.some(call=>JSON.parse(call.body.messages[1].content).sonraki.length>0)&&boundary.calls.some(call=>JSON.parse(call.body.messages[1].content).onceki.length>0));
  const saved=f.store.entry(f.entry.id).podcastWorkspace;
  assert.equal(saved.transcript.text,original,'özgün metin değişmedi');
  const reopened=await f.handle(f.event,{action:'podcast-workspace',entryId:f.entry.id,sourceVersion:f.version});
  assert.equal(reopened.ok,true,reopened.error);assert.equal(reopened.workspace.translation.text,saved.translation.text,'yeniden açılan okuma görünümü aynı çeviriyi almalı');assert.equal(reopened.workspace.translation.state,'untimed');assert.equal(reopened.workspace.transcript.text,original);
  assert.equal(saved.translation.state,'untimed');assert.equal(saved.translation.format,'plain');assert.equal(saved.translation.status,'complete');
  assert.equal(saved.translation.text,boundary.calls.map(call=>('TR:'+JSON.parse(call.body.messages[1].content).metin).trim()).join('\n\n'),'saklanan çeviri yalnız hedef metin çevirileri');
  const noContext=await f.request();assert.equal(noContext.ok,true,noContext.error);
  const last=boundary.calls.slice(-boundary.calls.length+0).at(-1),lastUser=JSON.parse(last.body.messages[1].content);
  assert.deepEqual([lastUser.onceki,lastUser.sonraki],[[],[]],'ayar yoksa istek bağlamsız (eski davranış)');
  assert.doesNotMatch(last.body.messages[0].content,/komşu paragraf/,'bağlam yoksa ek istem satırı yok');
 }finally{f.close();}
});
test('subtitle sentence requests keep their 3-row neighbor window while article prose may use more',async()=>{
 const boundary=providerBoundary(),rows=Array.from({length:6},(_,i)=>({text:'Satır '+(i+1)+'.'}));
 await boundary.atEndpoint({text:'Hedef.',contextBefore:rows,contextAfter:rows},boundary.config,undefined,boundary.config.endpoint);
 await boundary.atEndpoint({kind:'article',text:'Hedef.',contextBefore:rows,contextAfter:rows},boundary.config,undefined,boundary.config.endpoint);
 const [subtitle,article]=boundary.calls.map(call=>JSON.parse(call.body.messages[1].content));
 assert.equal(subtitle.onceki.length,3);assert.equal(subtitle.sonraki.length,3);
 assert.equal(article.onceki.length,6);assert.equal(article.sonraki.length,6);
});

test('real provider boundary: a multi-paragraph chunk keeps its paragraph structure in the saved untimed translation',async()=>{
 const boundary=providerBoundary(user=>user.metin.split(/\n/).map(line=>line.trim()?'TR '+line.trim():'').join('\n')),f=fixture(null,{createTextTranslator:boundary.createTextTranslator});
 try{
  const paragraphs=Array.from({length:5},(_,i)=>`P${i+1} `+Array.from({length:40},(_,k)=>`q${i+1}w${k}`).join(' '));
  f.save(paragraphs.join('\n\n'));
  const result=await f.request({contextLines:2});assert.equal(result.ok,true,result.error);
  assert.equal(boundary.calls.length,1,'kısa metin tek parça: paragraflar aynı istekte');
  const saved=f.store.entry(f.entry.id).podcastWorkspace.translation.text;
  assert.deepEqual(saved.split(/\n{2,}/).map(block=>block.split(' ').slice(0,2).join(' ')),paragraphs.map((_,i)=>`TR P${i+1}`),'paragraf sınırları ve sırası korunmalı');
 }finally{f.close();}
});
