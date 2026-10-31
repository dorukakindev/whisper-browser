'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createBrowserReviewReader}=require('../src/letterboxd-browser-reader');
const base='https://letterboxd.com/film/example/',review=base+'reviews/by/activity/';
function fixture(response,options={}){
 const windows=[];
 class Window extends EventEmitter{
  constructor(options){super();windows.push(this);this.options=options;this.dead=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{
   setUserAgent:ua=>{this.ua=ua;},setWindowOpenHandler:handler=>{this.popup=handler;},getURL:()=>this.url,
   executeJavaScript:async(script,gesture)=>{this.script=script;assert.equal(gesture,false);return response?response(this):{url:this.url,html:'<section><div class="js-review-body">Public review text</div></section>'};}
  });}
  async loadURL(url){this.url=url.startsWith('https://letterboxd.com/tmdb/')?base:url;if(options.load)return options.load(this,url);}
  setTitle(title){this.title=title;}
  isDestroyed(){return this.dead;}
  destroy(){if(this.dead)return;this.dead=true;this.emit('closed');}
 }
 return {windows,reader:createBrowserReviewReader({BrowserWindow:Window,partition:'persist:browser',userAgent:'Existing browser UA',onDiagnostic:options.onDiagnostic})};
}
test('one visible sandboxed window uses the browser partition and reads only the public extraction script',async()=>{
 const {windows,reader}=fixture();
 assert.equal((await reader.readPage('https://letterboxd.com/tmdb/123/')).url,base);
 assert.equal((await reader.readPage(review,{expectedBase:base})).url,review);
 assert.equal(windows.length,1);const win=windows[0];
 assert.equal(win.options.show,true);assert.equal(win.options.webPreferences.partition,'persist:browser');
 assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.options.webPreferences.contextIsolation,true);
 assert.equal(win.options.webPreferences.nodeIntegration,false);assert.equal(win.options.webPreferences.webSecurity,true);
 assert.equal(win.options.webPreferences.preload,undefined);assert.equal(win.ua,'Existing browser UA');
 assert.deepEqual(win.popup({url:'https://example.com'}),{action:'deny'});
 assert.match(win.script,/js-review-body/);assert.doesNotMatch(win.script,/document\.cookie/);
 reader.close();assert.equal(win.dead,true);reader.close();
});
test('untrusted, file and credential-bearing addresses never create a window',async()=>{
 for(const url of ['file:///tmp/test','http://letterboxd.com/film/example/','https://evil.test/film/example/','https://letterboxd.com@evil.test/film/example/','https://letterboxd.com/film/example/?download=1']){
  const {reader,windows}=fixture();await assert.rejects(reader.readPage(url),/Unsupported/);assert.equal(windows.length,0);reader.close();
 }
});
test('same-film redirects cannot switch review sort, page, scheme or origin',async()=>{
 for(const url of [base+'reviews/',review+'page/2/','https://letterboxd.com/film/other/reviews/by/activity/','https://evil.test/','file:///tmp/test']){
  let release;const {reader,windows}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const pending=reader.readPage(review,{expectedBase:base});await new Promise(resolve=>setImmediate(resolve));
  let prevented=false;windows[0].webContents.emit('will-redirect',{preventDefault(){prevented=true;}},url);
  await assert.rejects(pending,/navigation changed/);assert.equal(prevented,true);assert.equal(windows[0].dead,true);release({});
 }
});
test('navigation guards support modern event details and legacy arguments, ignoring explicit subframes',async()=>{
 const {reader,windows}=fixture();await reader.readPage(base);
 let release;windows[0].webContents.executeJavaScript=()=>new Promise(resolve=>{release=resolve;});
 const pending=reader.readPage(review);await new Promise(resolve=>setImmediate(resolve));
 const wc=windows[0].webContents;let prevented=0;
 wc.emit('will-redirect',{url:'https://challenges.cloudflare.com/frame?secret=value',isMainFrame:false,preventDefault(){prevented++;}});
 wc.emit('will-redirect',{preventDefault(){prevented++;}},'https://challenges.cloudflare.com/frame?secret=value',false,false);
 wc.emit('will-redirect',{url:review,isMainFrame:true,preventDefault(){prevented++;}});
 wc.emit('will-navigate',{url:review,isMainFrame:true,preventDefault(){prevented++;}});
 assert.equal(prevented,0);assert.equal(windows[0].dead,false);
 release({url:review,html:'<div class="js-review-body">Loaded review text</div>'});await pending;reader.close();
});
test('top-level denied diagnostics classify host, query and route without leaking tokens',async()=>{
 for(const entry of [{url:'https://evil.test/?token=secret',reason:'host'},{url:review+'?__cf_chl_tk=secret',reason:'query'},{url:base+'reviews/',reason:'route'}]){
  const diagnostics=[];const {reader,windows}=fixture(()=>new Promise(()=>{}),{onDiagnostic:event=>diagnostics.push(event)});
  const pending=reader.readPage(review);await new Promise(resolve=>setImmediate(resolve));
  let prevented=false;windows[0].webContents.emit('will-redirect',{url:entry.url,isMainFrame:true,preventDefault(){prevented=true;}});
  await assert.rejects(pending,/navigation changed/);assert.equal(prevented,true);
  assert.equal(diagnostics.find(event=>event.stage==='navigation-denied').reason,entry.reason);
  assert.doesNotMatch(JSON.stringify(diagnostics),/token|secret|__cf_chl/);
 }
});
test('closing or aborting a hung DOM read rejects promptly and destroys only the owned window',async()=>{
 for(const mode of ['close','abort']){
  const {reader,windows}=fixture(()=>new Promise(()=>{})),controller=new AbortController();
  const pending=reader.readPage(review,{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));
  if(mode==='close')windows[0].destroy();else controller.abort(Error('Cancelled by caller'));
  await assert.rejects(pending,mode==='close'?/window was closed/:/Cancelled by caller/);assert.equal(windows[0].dead,true);
 }
});
test('verification stays visible until the caller aborts; no challenge automation is executed',async()=>{
 const {reader,windows}=fixture(()=>({blocked:true})),controller=new AbortController();
 const pending=reader.readPage(review,{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));
 assert.match(windows[0].title,/finish site verification/);assert.equal(windows[0].dead,false);
 controller.abort(Error('Verification wait cancelled'));await assert.rejects(pending,/Verification wait cancelled/);
});
test('a Chromium HTTP status failure keeps verification visible until normal page content loads',async()=>{
 for(const status of [{code:'ERR_HTTP_RESPONSE_CODE_FAILURE'},{errno:-379}]){
  let attempts=0;const {reader,windows}=fixture(win=>++attempts===1?{blocked:true}:{url:win.url,html:'<div class="js-review-body">Normal public review after user verification</div>'});
  await reader.readPage(base);attempts=0;
  windows[0].loadURL=async url=>{windows[0].url=url;throw Object.assign(Error('HTTP 403'),status);};
  const pending=reader.readPage(review);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(windows[0].dead,false);assert.match(windows[0].title,/finish site verification/);
  const data=await pending;assert.match(data.html,/Normal public review/);assert.equal(windows.length,1);reader.close();
 }
});
test('other navigation failures and status failures on an untrusted URL fail closed',async()=>{
 for(const entry of [{code:'ERR_NAME_NOT_RESOLVED',url:review},{code:'ERR_HTTP_RESPONSE_CODE_FAILURE',url:'https://evil.test/'}]){
  const {reader,windows}=fixture();await reader.readPage(base);
  windows[0].loadURL=async()=>{windows[0].url=entry.url;throw Object.assign(Error('Navigation failure'),{code:entry.code});};
  await assert.rejects(reader.readPage(review),/Navigation failure/);assert.equal(windows[0].dead,true);
 }
});
test('superseded identifier navigation can read the resolved film, with bounded public diagnostics',async()=>{
 const diagnostics=[];const {reader,windows}=fixture(undefined,{load(){throw Object.assign(Error('superseded'),{code:'ERR_ABORTED',errno:-3});},onDiagnostic:event=>diagnostics.push(event)});
 const result=await reader.readPage('https://letterboxd.com/tmdb/123/');assert.equal(result.url,base);
 assert.equal(windows[0].dead,false);assert.ok(diagnostics.some(event=>event.stage==='navigation-error'&&event.code==='ERR_ABORTED'&&event.url===base));
 for(const event of diagnostics)assert.ok(Object.keys(event).every(key=>['stage','url','code'].includes(key)));
 reader.close();
});
test('ERR_ABORTED on unresolved identity, wrong film/order, or off-origin URL does not recover',async()=>{
 for(const entry of [{address:'https://letterboxd.com/tmdb/123/',current:'https://letterboxd.com/tmdb/123/'},{address:review,current:base+'reviews/'},{address:review,current:'https://letterboxd.com/film/other/reviews/by/activity/'},{address:review,current:'https://evil.test/?private=secret'}]){
  const diagnostics=[];const {reader,windows}=fixture(undefined,{load(win){win.url=entry.current;throw Object.assign(Error('superseded'),{code:'ERR_ABORTED',errno:-3});},onDiagnostic:event=>diagnostics.push(event)});
  await assert.rejects(reader.readPage(entry.address),/superseded/);assert.equal(windows[0].dead,true);
  assert.doesNotMatch(JSON.stringify(diagnostics),/private|secret|evil/);
 }
});
test('a superseding main-frame load settles before extraction and remains cancellable',async()=>{
 let loading=true;const {reader}=fixture(win=>{assert.equal(loading,false);return {url:win.url,html:'<h1>Example</h1>'};},{load(win){win.webContents.isLoadingMainFrame=()=>loading;setTimeout(()=>{loading=false;},20);throw Object.assign(Error('superseded'),{errno:-3});}});
 assert.equal((await reader.readPage('https://letterboxd.com/tmdb/123/')).url,base);reader.close();
 const next=fixture(undefined,{load(win){win.webContents.isLoadingMainFrame=()=>true;throw Object.assign(Error('superseded'),{errno:-3});}}),controller=new AbortController();
 const pending=next.reader.readPage('https://letterboxd.com/tmdb/123/',{signal:controller.signal});
 await new Promise(resolve=>setImmediate(resolve));controller.abort(Error('Cancel redirect wait'));
 await assert.rejects(pending,/Cancel redirect wait/);assert.equal(next.windows[0].dead,true);
});
test('a stable completed film reviews page with no cards returns an empty sample after DOM settles',async()=>{
 const {reader}=fixture(win=>({url:win.url,ready:true,html:'<section><h1>Example</h1></section>'}));
 const result=await reader.readPage(review);assert.doesNotMatch(result.html,/js-review-body/);reader.close();
});
test('normal DOM polling continues after manual verification and waits for loaded review cards',async()=>{
 let attempts=0;const {reader}=fixture(win=>{
  attempts++;if(attempts===1)return {blocked:true};
  return {url:win.url,html:attempts===2?'<section></section>':'<section><div class="js-review-body">Loaded public text</div></section>'};
 });
 const result=await reader.readPage(review);assert.equal(attempts,3);assert.match(result.html,/Loaded public text/);reader.close();
});
test('an aborted navigation releases a hung loadURL and a pre-aborted read creates no window',async()=>{
 const {reader,windows}=fixture();await reader.readPage(base);windows[0].loadURL=()=>new Promise(()=>{});
 const controller=new AbortController(),pending=reader.readPage(review,{signal:controller.signal});
 controller.abort(Error('Stop navigation'));await assert.rejects(pending,/Stop navigation/);assert.equal(windows[0].dead,true);
 const next=fixture(),aborted=new AbortController();aborted.abort(Error('Already cancelled'));
 await assert.rejects(next.reader.readPage(review,{signal:aborted.signal}),/Already cancelled/);assert.equal(next.windows.length,0);
});
test('UTF-8 response size is bounded and returned location must match the loaded page',async()=>{
 for(const response of [win=>({url:win.url,html:'ü'.repeat(1500001)}),()=>({tooLarge:true}),()=>({url:base,html:'<section></section>'})]){
  const {reader,windows}=fixture(response);await assert.rejects(reader.readPage(review),/byte limit|could not be read/);assert.equal(windows[0].dead,true);
 }
});
test('resolved film remains fixed and five total reads bound window lifetime',async()=>{
 const {reader,windows}=fixture();await reader.readPage('https://letterboxd.com/tmdb/123/');
 await assert.rejects(reader.readPage('https://letterboxd.com/film/other/'),/different film/);
 for(let n=0;n<4;n++)await reader.readPage(review);
 await assert.rejects(reader.readPage(review),/five-page limit/);reader.close();assert.equal(windows[0].dead,true);
});
