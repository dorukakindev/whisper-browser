'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/renderer/renderer.js','utf8'),start=source.indexOf('async function showBrowserWorkspaceAttempt(');let open=source.indexOf('{',start),depth=1,end=open+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
const implementation=source.slice(start,end);
for(const reason of ['selection changed','tab creation busy'])test('An old showBrowser response cannot overwrite the new selection: '+reason,async()=>{let resolve,syncs=0,retries=0;const player={browserWorkspaceSeq:0,workspaceMode:'browser',browserActiveTabId:'old',browserTabCreateBusy:false};const context={player,$:()=>({classList:{contains:()=>false}}),document:{body:{classList:{contains:()=>false}}},browserSlotBounds:()=>({x:0,y:0,width:10,height:10}),window:{api:{showBrowser:()=>new Promise(r=>resolve=r)}},setTimeout:()=>retries++,syncBrowserTabs:()=>syncs++};vm.createContext(context);vm.runInContext(implementation+';this.invoke=showBrowserWorkspaceAttempt;',context);const pending=context.invoke();if(reason==='selection changed')player.browserActiveTabId='new';else player.browserTabCreateBusy=true;resolve({ok:true,tabs:[{id:'old'}],activeTabId:'old'});await pending;assert.equal(syncs,0);assert.equal(retries,1);});
test('Creating a tab waits for the previously issued native show request before sending create IPC',async()=>{const start=source.indexOf('async function createBrowserTab()'),open=source.indexOf('{',start);let depth=1,end=open+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}const implementation=source.slice(start,end);let release,creates=0;const context={player:{browserTabCreateBusy:false,browserTabs:[],browserWorkspaceSeq:0,workspaceMode:'browser'},MAX_BROWSER_TABS:32,browserWorkspaceShowPromise:new Promise(r=>release=r),updateBrowserNewTabAvailability(){},flushWatchState:async()=>{},saveActiveBrowserTabWorkspace(){},window:{api:{createBrowserTab:async()=>{creates++;return {ok:true,tabs:[{id:'new'}],activeTabId:'new'};}}},syncBrowserTabs:()=>{},browserTabState:()=>({id:'new'}),restoreActiveBrowserTabWorkspace(){},updateBrowserNavigation(){},scheduleBrowserBounds(){},setTimeout(){}};vm.createContext(context);vm.runInContext(implementation+';this.invoke=createBrowserTab;',context);const pending=context.invoke();await Promise.resolve();assert.equal(creates,0);release();await pending;assert.equal(creates,1);});
test('A native show response arriving after the player layer was hidden explicitly hides the old surface',async()=>{let resolve,hidden=false,hides=0;const player={browserWorkspaceSeq:0,workspaceMode:'browser',browserActiveTabId:'old',browserTabCreateBusy:false},context={player,$:()=>({classList:{contains:()=>hidden}}),document:{body:{classList:{contains:()=>true}}},browserSlotBounds:()=>({x:0,y:0,width:10,height:10}),window:{api:{showBrowser:()=>new Promise(r=>resolve=r),hideBrowser:async()=>hides++}},setTimeout(){throw Error('Hidden workspace must not reschedule show');},syncBrowserTabs(){throw Error('Hidden surface must not be applied');}};vm.createContext(context);vm.runInContext(implementation+';this.invoke=showBrowserWorkspaceAttempt;',context);const pending=context.invoke();hidden=true;resolve({ok:true});await pending;assert.equal(hides,1);});
test('Concurrent home returns share completion rather than allowing a caller to open behind the player',async()=>{const s=fs.readFileSync('src/renderer/media-home.js','utf8'),start=s.indexOf('  let homeReturnPromise=null;'),end=s.indexOf('  async function performReturnHome()',start);let release,calls=0;const context={performReturnHome:()=>{calls++;return new Promise(r=>release=r);}};vm.createContext(context);vm.runInContext(s.slice(start,end)+';this.invoke=returnHome;',context);const first=context.invoke(),second=context.invoke();assert.equal(first,second);assert.equal(calls,1);release();await first;const next=context.invoke();assert.equal(calls,2);release();await next;});

function parkedCloseFixture(mode='player'){
 const home=fs.readFileSync('src/renderer/media-home.js','utf8'),start=home.indexOf('  async function closeParkedWorkspace('),end=home.indexOf('  let wasPlayerOpen',start);
 assert(start>=0,'Home has an owned session-close operation');
 const calls=[],savedPositions=[],video={currentTime:42,pause:()=>calls.push('pause'),removeAttribute:name=>calls.push('remove:'+name),load:()=>{calls.push('unload');video.currentTime=0;}};
 const player={workspaceMode:mode,mediaKey:'source',generation:4,openIntent:7,browserActiveTabId:'tab',job:{running:true,id:'whisper-running'}};
 const context={player,parked:{mode,key:'source',tabId:'tab',generation:4},closingParked:false,resuming:false,returningHome:false,
  layer:{classList:{contains:()=>true}},document:{getElementById:id=>id==='playerVideo'?video:{focus(){}}},
  flushWatchState:async()=>calls.push('flush'),closePlayer:()=>calls.push('close-player'),setMediaKey:key=>{calls.push('key:'+key);if(player.mediaKey)savedPositions.push(video.currentTime);player.mediaKey=key;},
  closeBrowserTab:async id=>{calls.push('close-tab:'+id);context.tabExists=false;},browserTabState:()=>context.tabExists?{id:'tab'}:null,tabExists:true,
  renderContent:()=>calls.push('render'),report:message=>calls.push('report:'+message),t:(en)=>en,
  window:{NativePlayerUI:{busy:()=>true,stop:async options=>calls.push('native:'+options.resume)},BrowserDubAudioUI:{stop:async()=>calls.push('dub-stop')}}};
 vm.createContext(context);vm.runInContext(home.slice(start,end)+';this.invoke=closeParkedWorkspace;',context);return {context,calls,player,video,savedPositions};
}
test('Home session close stops native/dub/HTML playback and preserves the running Whisper job',async()=>{
 const h=parkedCloseFixture();await h.context.invoke();
 assert.deepEqual(h.calls.filter(call=>call!=='render'),['flush','native:false','dub-stop','key:','close-player','pause','remove:src','unload']);
 assert.deepEqual(h.savedPositions,[42],'the media-key owner saves the live position before unloading resets time');assert.equal(h.video.currentTime,0);
 assert.equal(h.context.parked,null);assert.equal(h.player.job.id,'whisper-running');assert.equal(h.player.job.running,true);
});
test('Home browser session close uses the protected-tab owner and keeps the card when canceled',async()=>{
 const h=parkedCloseFixture('browser');h.context.closeBrowserTab=async id=>h.calls.push('protected:'+id);
 await h.context.invoke();assert(h.context.parked);assert.deepEqual(h.calls.filter(call=>call!=='render'),['protected:tab']);
 h.context.closeBrowserTab=async id=>{h.calls.push('closed:'+id);h.context.tabExists=false;};await h.context.invoke();assert.equal(h.context.parked,null);assert.equal(h.player.mediaKey,'source');
});
test('Home session close is single-flight and cannot tear down another source after an awaited stop',async()=>{
 const h=parkedCloseFixture();let release;h.context.window.NativePlayerUI.stop=()=>new Promise(resolve=>{release=resolve;});
 const closing=h.context.invoke();await new Promise(setImmediate);await h.context.invoke();h.player.mediaKey='replacement';release();await closing;
 assert(!h.calls.includes('close-player'));assert(!h.calls.includes('dub-stop'));assert(!h.calls.includes('unload'));assert.equal(h.player.mediaKey,'replacement');
});
