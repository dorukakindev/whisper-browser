'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const turn=()=>new Promise(setImmediate);
function fixture(t){
 const dom=new JSDOM('<div id="playerLayer" class="hidden"></div><video id="playerVideo"></video>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.UiLocale={get:()=> 'en'};w.notices=[];w.writes=[];w.opened=[];
 w.api={mediaHub:async()=>({ok:true}),updateWatchItem:async patch=>{w.writes.push(patch);return new Promise((resolve,reject)=>{w.releaseSave=resolve;w.failSave=reject;});}};
 w.eval(`var player={mediaKey:'source:A',seriesKey:'series:A',openIntent:0};var state={seriesPrefs:{}};var watchMutationQueue=Promise.resolve();var pendingWatchProgress=new Set();
 var currentWatchPatch=()=>({key:player.mediaKey,prefs:{viewMode:player.seriesKey}});
 var watchMutationRequest=p=>p;var applyWatchMutationResult=r=>r;var seriesKeyForPlayer=()=>player.seriesKey;
 var seriesWatchSubset=p=>({...p});var scheduleSave=()=>{};var updateSeriesChip=()=>{};var renderPlayerLibrary=()=>{};
 var setWorkspaceMode=()=>{};var setPlayerSource=(url,title,key)=>{window.opened.push(key);player.mediaKey=key;player.seriesKey='series:B';};
 var currentGeneration=()=>1;var osd=message=>window.notices.push(message);`);
 const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
 const serial=renderer.slice(renderer.indexOf('function serializeWatchMutation('),renderer.indexOf('\nfunction watchMutationRequest(',renderer.indexOf('function serializeWatchMutation(')));
 const flush=renderer.slice(renderer.indexOf('async function flushWatchState('),renderer.indexOf('\nasync function restoreWatchProfile(',renderer.indexOf('async function flushWatchState(')));
 w.eval(serial+flush);w.eval(fs.readFileSync(require.resolve('../src/renderer/media-hub-ui'),'utf8'));return w;
}
test('a delayed outgoing save does not block source B and still commits A progress and A series preferences',async t=>{
 const w=fixture(t);const opening=w.MediaHubUI.playStream({key:'source:B',url:'https://fixture.invalid/B.mp4',title:'B'},0,{autoplay:false});
 await turn();assert.deepEqual([...w.opened],['source:B']);assert.equal(await opening,true);
 assert.equal(w.writes.length,1);assert.equal(w.writes[0].key,'source:A');assert.equal(w.player.mediaKey,'source:B');assert.equal(w.state.seriesPrefs['series:B'],undefined);
 w.releaseSave({ok:true,item:{key:'source:A'}});await turn();
 assert.equal(w.state.seriesPrefs['series:A'].viewMode,'series:A');assert.equal(w.state.seriesPrefs['series:B'],undefined);assert.equal(w.notices.length,0);
});
test('outgoing progress writes retain queue order while the next source opens',async t=>{
 const w=fixture(t);const prior=w.flushWatchState();await turn();await w.MediaHubUI.playStream({key:'source:B',url:'https://fixture.invalid/B.mp4'},0,{autoplay:false});
 assert.equal(w.player.mediaKey,'source:B');assert.equal(w.writes.length,1);
 w.releaseSave({ok:true,item:{key:'source:A'}});await prior;await turn();assert.equal(w.writes.length,2);assert.equal(w.writes[1].key,'source:A');
 w.releaseSave({ok:true,item:{key:'source:A'}});await turn();assert.equal(w.state.seriesPrefs['series:B'],undefined);
});
test('a superseded persistence request never starts the outgoing save or opens its source',async t=>{
 const w=fixture(t);let release;w.api.mediaHub=()=>new Promise(r=>release=r);
 const opening=w.MediaHubUI.playStream({key:'stream:'+'b'.repeat(64),url:'https://fixture.invalid/B.mp4'},0,{autoplay:false});
 w.player.openIntent++;release({ok:true});assert.equal(await opening,false);await turn();assert.equal(w.opened.length,0);assert.equal(w.writes.length,0);
});
test('a rejected outgoing save is reported generically without undoing the new source',async t=>{
 const w=fixture(t);await w.MediaHubUI.playStream({key:'source:B',url:'https://fixture.invalid/B.mp4'},0,{autoplay:false});await turn();
 w.failSave(Error('private path https://fixture.invalid/secret'));await turn();assert.equal(w.player.mediaKey,'source:B');assert.equal(w.notices.length,1);assert.equal(w.notices[0],'The previous playback progress could not be saved.');
});


// Exercise the production queue, request capture and close hook with the real
// persistent store/tombstones; only the transport is delayed.
function closeFixture(t){
 const {createWatchLibraryStore}=require('../src/watch-library-store'),path=require('node:path');
 const base=path.resolve(__dirname,'../.uiprev');fs.mkdirSync(base,{recursive:true});
 const dir=fs.mkdtempSync(path.join(base,'close-handoff-')),filePath=path.join(dir,'watch-library.json');
 t.after(()=>{if(!path.resolve(dir).startsWith(base+path.sep))throw Error('Unexpected cleanup path');fs.rmSync(dir,{recursive:true,force:true});});
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const store=createWatchLibraryStore({filePath});let heldResponse,release;
 const copy=value=>JSON.parse(JSON.stringify(value));
 const apply=request=>{const item=store.upsert(copy(request));return item?{ok:true,item:copy(item)}:{ok:false,error:'Gecersiz kayit'};};
 for(const key of ['source:A','source:B'])apply({key,title:key,position:1,lastWatched:1});
 w.writes=[];w.order=[];
 w.api={updateWatchItem:request=>{w.writes.push(copy(request));const result=apply(request);if(w.writes.length>1)return Promise.resolve(result);heldResponse=result;return new Promise(resolve=>release=resolve);},
  saveWatchItemBeforeClose:request=>{w.order.push('save:'+request.key);return apply(request);},
  onWatchFlushBeforeClose:handler=>w.closeHandler=handler,
  finishWatchFlushBeforeClose:token=>w.order.push('ack:'+token)};
 w.initialItems=copy(store.loadAll());
 w.eval('var watchLibraryCache=window.initialItems;var player={mediaKey:"source:A",position:80,lastWatched:80};var state={seriesPrefs:{}};var watchItemByKey=key=>watchLibraryCache.find(item=>item.key===key);var currentWatchPatch=()=>({...player,key:player.mediaKey,prefs:{speed:1.25}});var seriesKeyForPlayer=()=>null;var seriesWatchSubset=p=>p;var scheduleSave=()=>{};var updateSeriesChip=()=>{};var renderPlayerLibrary=()=>{};');
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
 w.eval(source.slice(source.indexOf('let watchMutationQueue ='),source.indexOf('let playerLibraryResults =')).replace(/^(let|const) /gm,'var ')
  +source.slice(source.indexOf('async function flushWatchState('),source.indexOf('async function restoreWatchProfile('))
  +source.slice(source.indexOf('function flushPendingWatchProgressBeforeClose('),source.indexOf('// ---- HLS ile indirmeden izleme ----')));
 return {w,release:()=>release(heldResponse),snapshot:()=>({items:copy(createWatchLibraryStore({filePath}).loadAll())}),
  remove:key=>{store.remove(key);w.watchLibraryCache=w.watchLibraryCache.filter(item=>item.key!==key);},
 };
}

test('close saves latest queued A plus current B before ACK and late async A cannot regress reloaded progress',async t=>{
 const f=closeFixture(t),{w}=f;
 const first=w.flushWatchState();await turn();
 w.player.position=90;w.player.lastWatched=90;const latest=w.flushWatchState();
 w.player={mediaKey:'source:B',position:10,lastWatched:100};
 w.closeHandler('handoff');
 assert.deepEqual([...w.order],['save:source:A','save:source:B','ack:handoff']);
 let items=f.snapshot().items;
 assert.equal(items.find(i=>i.key==='source:A').position,90);assert.equal(items.find(i=>i.key==='source:B').position,10);
 f.release();await Promise.all([first,latest]);
 assert.equal(w.writes.length,1,'coalesced queued A must not send after sync close');
 assert.equal(w.watchLibraryCache.find(i=>i.key==='source:A').position,90,'old successful response must not regress cache');
 items=f.snapshot().items;assert.equal(items.find(i=>i.key==='source:A').position,90);assert.equal(items.find(i=>i.key==='source:B').position,10);
 assert.equal(w.eval('pendingWatchProgress.size'),0);
});

test('close preserves a deleted outgoing record despite queued snapshots and a late successful response',async t=>{
 const f=closeFixture(t),{w}=f;
 const first=w.flushWatchState();await turn();
 w.player.position=90;w.player.lastWatched=90;const latest=w.flushWatchState();
 f.remove('source:A');
 w.player={mediaKey:'source:B',position:10,lastWatched:100};w.closeHandler('removed');
 f.release();await Promise.all([first,latest]);
 const item=f.snapshot().items.find(i=>i.key==='source:A');
 assert.equal(item,undefined);assert.equal(w.watchLibraryCache.find(i=>i.key==='source:A'),undefined);
 assert.equal(f.snapshot().items.find(i=>i.key==='source:B').position,10);assert.equal(w.writes.length,2);assert.equal(w.eval('pendingWatchProgress.size'),0);
});


test('failed sync close writes preserve ordinary async recovery for existing records',async t=>{
 const f=closeFixture(t),{w}=f;
 const first=w.flushWatchState();await turn();
 w.player.position=90;w.player.lastWatched=90;const latest=w.flushWatchState();
 w.player={mediaKey:'source:B',position:10,lastWatched:100};
 w.api.saveWatchItemBeforeClose=()=>({ok:false,error:'synthetic-write-failure'});
 w.closeHandler('failed-sync');f.release();await Promise.all([first,latest]);
 assert.equal(w.writes.length,2);assert.equal(f.snapshot().items.find(i=>i.key==='source:A').position,90);
 assert.equal(w.watchLibraryCache.find(i=>i.key==='source:A').position,90);assert.equal(w.eval('pendingWatchProgress.size'),0);
});
