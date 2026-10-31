'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const media=require('../src/browser-media-controller');
function page(html='<video id="v"></video>'){
  const dom=new JSDOM(html,{url:'https://fixture.example/',runScripts:'outside-only',pretendToBeVisual:true});
  for(const video of dom.window.document.querySelectorAll('video')){
    Object.defineProperties(video,{clientWidth:{value:400},clientHeight:{value:200},duration:{value:30},paused:{value:false}});
    video.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:400,bottom:200,width:400,height:200});
  }
  dom.window.eval(media.buildBrowserMediaProbeScript());return dom;
}
test('detaching a controlled video preserves a later site filter and rate, including reattachment',async()=>{
  const dom=page(),w=dom.window,v=w.document.getElementById('v');
  w.eval(media.buildBrowserMediaPreferenceScript({brightness:1.2}));
  assert.match(v.style.filter,/brightness/);
  w.__whisperMediaController.setDubRate(v,{rate:.8,baseRate:1});
  v.style.filter='blur(2px)';v.playbackRate=1.7;
  v.remove();await Promise.resolve();
  assert.equal(v.style.filter,'blur(2px)','cleanup must not overwrite a newer site-authored filter');
  assert.equal(v.playbackRate,1.7,'cleanup must not overwrite a newer playback rate');
  w.document.body.append(v);await Promise.resolve();
  assert.match(v.style.filter,/blur\(2px\)/,'reattachment must use the current site baseline');
  w.eval(media.buildBrowserMediaPreferenceScript({}));
  assert.equal(v.style.filter,'blur(2px)');w.close();
});
test('ad mute restoration does not transfer the removed video snapshot to replacement media',async()=>{
  const dom=page('<div class="html5-video-player ad-showing"></div><video id="v"></video><video id="next"></video>');
  const w=dom.window,old=w.document.getElementById('v'),next=w.document.getElementById('next');
  w.document.querySelector('div').getClientRects=()=>[{}];
  old.muted=false;next.muted=true;
  w.__whisperMediaController.muteForAd(old);assert(old.muted);
  old.remove();w.document.querySelector('div').remove();await Promise.resolve();
  w.__whisperMediaController.probe();
  assert.equal(next.muted,true,'replacement keeps its independent original mute state');
  w.close();
});
test('media identity changes publish even when playback measurements are identical',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const start=source.indexOf('async function probeActiveBrowserMedia('),end=source.indexOf('\nfunction startBrowserPolling(',start);
  const events=[],tab={id:'one',generation:1,playbackDiagnostics:{observeMediaSample:()=>[]}};
  let sample={docToken:'source-A',currentTime:0,duration:30,playbackRate:1,volume:1,paused:true};
  const wc={isDestroyed:()=>false,getURL:()=> 'https://fixture.example/watch'},view={webContents:wc};
  const ctx=vm.createContext({activeBrowserTab:()=>tab,browserMediaBusy:false,browserVisible:true,browserView:view,browserStateGeneration:1,
    browserEventContext:()=>({tabId:tab.id,generation:tab.generation}),isCurrentBrowserContext:()=>true,
    buildBrowserMediaProbeScript:()=>'',executeBrowserFrames:async()=>[sample],withTimeout:p=>p,BROWSER_SCRIPT_TIMEOUT:100,
    rankBrowserMediaCandidates:rows=>rows,retainCeaExpectedDuration:()=>30,redactDiagnosticText:x=>x,
    sendBrowserEvent:(_tab,event)=>events.push(event),scheduleBrowserSessionSave:()=>{},publishBrowserPlaybackDiagnostics:()=>{}});
  vm.runInContext(source.slice(start,end),ctx);
  await ctx.probeActiveBrowserMedia();await ctx.probeActiveBrowserMedia();
  assert.equal(events.length,1,'unchanged source remains deduplicated');
  sample={...sample,docToken:'source-B'};await ctx.probeActiveBrowserMedia();
  assert.equal(events.length,2,'renderer receives the replacement media identity');
  assert.equal(events.at(-1).media.docToken,'source-B');
});
test('a source-stale best frame cannot redirect a user media command into another frame',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const start=source.indexOf("ipcMain.handle('browser:command'"),end=source.indexOf("ipcMain.handle('browser:adblock:getState'",start);
  let handler,otherMutations=0;
  const first={executeJavaScript:async script=>script==='probe'?{docToken:'old-source'}:{handled:false,stale:true}};
  const other={executeJavaScript:async script=>script==='probe'?{docToken:'other-frame'}:(otherMutations++,{handled:true})};
  const wc={isDestroyed:()=>false},owner={},tab={id:'one'};
  const ctx=vm.createContext({ipcMain:{handle:(_name,fn)=>handler=fn},authorizedBrowserSender:()=>true,
    activeRequestedBrowserTab:()=>tab,mainWindow:{webContents:owner},browserView:{webContents:wc},browserStateGeneration:1,
    browserEventContext:()=>({tabId:tab.id}),browserNavigationCapabilities:()=>({}),browserNavigationState:()=>({}),
    browserFrames:()=>[first,other],buildBrowserMediaProbeScript:()=> 'probe',buildBrowserMediaCommandScript:()=> 'command',
    dt:(_tr,en)=>en,withTimeout:p=>p,isCurrentBrowserContext:()=>true,rankBrowserMediaCandidates:rows=>rows});
  vm.runInContext(source.slice(start,end),ctx);
  const result=await handler({sender:owner},{tabId:tab.id,command:'seek',value:5});
  assert.equal(result.stale,true);assert.equal(otherMutations,0,'a different iframe is not a substitute for the stale source');
});
test('overlapping full captures retain their debugger lease until the last result; cancellation does not write an export',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const start=source.indexOf('async function captureBrowserFullPage('),end=source.indexOf('\nasync function captureBrowserVideoFrame(',start);
  const shots=[];let attached=false,detaches=0;
  const wc={isDestroyed:()=>false,debugger:{isAttached:()=>attached,attach:()=>attached=true,detach:()=>{attached=false;detaches++;},sendCommand:async cmd=>cmd==='Page.getLayoutMetrics'?{cssContentSize:{width:300,height:200}}:new Promise(resolve=>shots.push(resolve))}};
  const ctx=vm.createContext({Buffer,browserDebuggerAttachPromise:null,browserDebuggerReady:false,browserDebuggerAttachAttempts:new WeakMap(),browserFullPageCaptureOwners:new WeakMap(),nativeImage:{createFromBuffer:b=>b}});
  vm.runInContext(source.slice(start,end),ctx);
  const first=ctx.captureBrowserFullPage(wc),second=ctx.captureBrowserFullPage(wc);await new Promise(setImmediate);assert.equal(shots.length,2);
  shots[0]({data:Buffer.from('first').toString('base64')});assert.equal((await first).toString(),'first');assert(attached,'first caller must not detach the second caller');
  shots[1]({data:Buffer.from('second').toString('base64')});assert.equal((await second).toString(),'second');assert.equal(detaches,1);assert(!attached);
  const pdfStart=source.indexOf('async function saveBrowserPagePdf('),pdfEnd=source.indexOf("ipcMain.handle('browser:exportPagePdf'",pdfStart);
  let writes=0;Object.assign(ctx,{path,app:{getPath:()=>'/synthetic'},mainWindow:{},dt:(_tr,en)=>en,browserExportTitle:()=> 'fixture',dialog:{showSaveDialog:async()=>({canceled:true})},writeBufferAtomic:()=>writes++});
  vm.runInContext(source.slice(pdfStart,pdfEnd),ctx);
  const result=await ctx.saveBrowserPagePdf({generation:1,view:{webContents:{isDestroyed:()=>false,getURL:()=> 'https://fixture.example/',printToPDF:async()=>{throw Error('canceled export must not print');}}}});
  assert(result.canceled);assert.equal(writes,0);
});
test('cleanup restores owned playback changes and same-element ad mute normally',async()=>{
  const dom=page(),w=dom.window,v=w.document.getElementById('v');v.style.filter='sepia(.4)';
  // Capture the site's baseline before applying preferences.
  w.eval(media.buildBrowserMediaPreferenceScript({brightness:1.2}));
  w.__whisperMediaController.setDubRate(v,{rate:.8,baseRate:1.3});
  w.__whisperMediaController.muteForAd(v);w.__whisperMediaController.probe();assert.equal(v.muted,false);
  v.remove();await Promise.resolve();assert.equal(v.playbackRate,1.3);assert.equal(v.style.filter,'sepia(.4)');w.close();
});
test('a timed-out frame command cannot start a second uncertain mutation in another frame',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),start=source.indexOf("ipcMain.handle('browser:command'"),end=source.indexOf("ipcMain.handle('browser:adblock:getState'",start);
  let handler,otherMutations=0;
  const first={executeJavaScript:async script=>{if(script==='probe')return {docToken:'slow-source'};throw Object.assign(Error('Timed out while native play is pending'),{code:'ETIMEDOUT'});}};
  const other={executeJavaScript:async script=>script==='probe'?{docToken:'other-frame'}:(otherMutations++,{handled:true})};
  const wc={isDestroyed:()=>false},owner={},tab={id:'one'};
  const ctx=vm.createContext({ipcMain:{handle:(_name,fn)=>handler=fn},authorizedBrowserSender:()=>true,
    activeRequestedBrowserTab:()=>tab,mainWindow:{webContents:owner},browserView:{webContents:wc},browserStateGeneration:1,
    browserEventContext:()=>({tabId:tab.id}),browserNavigationCapabilities:()=>({}),browserNavigationState:()=>({}),
    browserFrames:()=>[first,other],buildBrowserMediaProbeScript:()=> 'probe',buildBrowserMediaCommandScript:()=> 'command',
    dt:(_tr,en)=>en,withTimeout:p=>p,isCurrentBrowserContext:()=>true,rankBrowserMediaCandidates:rows=>rows});
  vm.runInContext(source.slice(start,end),ctx);const result=await handler({sender:owner},{tabId:tab.id,command:'play'});
  assert.equal(otherMutations,0,'timing out does not cancel the original native play request');assert.equal(result.timedOut,true);assert.equal(result.ok,false);
});
test('late preference responses cannot change the newly selected tab rate',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/renderer/renderer.js'),'utf8'),start=source.indexOf('function scheduleBrowserMediaPreferenceSync('),end=source.indexOf('\nfunction scheduleBrowserDarkModeSync(',start);
  let callback,resolve;const reply=new Promise(r=>resolve=r),tabs={a:{generation:1},b:{generation:1}};
  const player={workspaceMode:'browser',browserActiveTabId:'a',browserPageUrl:'https://fixture.example/a',browserRate:1};
  const ctx=vm.createContext({player,window:{api:{browserCommand(){}}},clearTimeout(){},setTimeout:fn=>(callback=fn,1),
    effectiveBrowserProfile:()=>({values:{}}),browserCommand:()=>reply,browserTabState:()=>tabs[player.browserActiveTabId]});
  vm.runInContext(source.slice(start,end),ctx);ctx.scheduleBrowserMediaPreferenceSync();const pending=callback();
  player.browserActiveTabId='b';player.browserPageUrl='https://fixture.example/b';player.browserRate=2;
  resolve({ok:true,media:{media:{playbackRate:1.4}}});await pending;
  assert.equal(player.browserRate,2);
});
