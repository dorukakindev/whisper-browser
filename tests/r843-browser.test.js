'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nav=require('../src/browser-navigation-state'),{createBrowserMemoryReclaimer}=require('../src/browser-memory-control'),{browserTabUnloadDecision:decision}=require('../src/browser-tab-resources');
const main=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
function extract(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a);return main.slice(a,b);}
function protection(){let host={known:false,busy:false},runtime={stateKnown:true,mediaPlaying:false,formOrLogin:false,dirtyDraft:false,fullscreen:false,pictureInPicture:false},audible=false;
 const context=vm.createContext({browserHostWorkState:async()=>host,browserTabRuntimeState:async()=>runtime});vm.runInContext(extract('async function refreshBrowserUnloadProtection(tab){','\nasync function unloadBrowserTab('),context);
 const tab={id:'idle',generation:1,view:{webContents:{isDestroyed:()=>false,isCurrentlyAudible:()=>{if(audible instanceof Error)throw audible;return audible;}}},lifecycle:'background',lastActivatedAt:1};
 return {tab,refresh:()=>context.refreshBrowserUnloadProtection(tab),host:v=>host=v,runtime:v=>runtime={...runtime,...v},audible:v=>audible=v};
}
test('R843-10 complete fresh protection recovers transient unknown but never hides failed frame, host or native measurements',async()=>{
 const p=protection();await p.refresh();assert.equal(decision(p.tab).reason,'unknown_state');p.host({known:true,busy:false});p.runtime({stateKnown:false});await p.refresh();assert.equal(decision(p.tab).reason,'unknown_state');p.runtime({stateKnown:true});p.audible(Error('native unavailable'));await p.refresh();assert.equal(decision(p.tab).reason,'unknown_state');p.audible(false);await p.refresh();assert(decision(p.tab).allowed);
 for(const [runtime,reason]of [[{mediaPlaying:true},'media_playing'],[{mediaPlaying:false,formOrLogin:true},'form_or_login'],[{formOrLogin:false,dirtyDraft:true},'unsaved_draft']]){p.runtime(runtime);await p.refresh();assert.equal(decision(p.tab).reason,reason);}
 p.runtime({dirtyDraft:false});p.host({known:true,busy:true});await p.refresh();assert.equal(decision(p.tab).reason,'active_job');
});
test('R843-11 reclaimer reaches fresh unload checks for stale flags and still rejects live audio/jobs, with two-attempt bound',async()=>{
 const p=protection();p.host({known:true,busy:false});Object.assign(p.tab,{hostWorkBusy:true,audible:true,mediaPlaying:true,stateKnown:false,dirtyDraft:true});let calls=0;
 const control=createBrowserMemoryReclaimer({tabs:()=>[p.tab],activeId:()=>'',now:()=>600001,unload:async()=>{calls++;await p.refresh();return {ok:decision(p.tab).allowed,reason:decision(p.tab).reason};}});
 assert.equal((await control.reclaim()).unloaded,1);assert.equal(calls,1);p.audible(true);assert.equal((await control.reclaim()).unloaded,0);p.audible(false);p.host({known:true,busy:true});assert.equal((await control.reclaim()).unloaded,0);
 const stable=[{pinned:true},{keepAwake:true},{dubPlaying:true},{liveAsr:true},{mangaJob:{}},{pageTranslateJob:{}},{loading:true},{restoringPage:true}].map((flags,i)=>({...p.tab,id:String(i),...flags}));
 const protectedControl=createBrowserMemoryReclaimer({tabs:()=>stable,activeId:()=>'',now:()=>600001,unload:async()=>{throw Error('stable protection must remain');}});assert.equal((await protectedControl.reclaim()).considered,0);
 let attempts=0;const bounded=createBrowserMemoryReclaimer({tabs:()=>['a','b','c'].map(id=>({...p.tab,id})),activeId:()=>'',now:()=>600001,unload:async()=>{attempts++;return {ok:false,reason:'active_job'};}});assert.equal((await bounded.reclaim()).considered,3);assert.equal(attempts,2);
});
function resumeFixture(reject,change){const tab={id:'one',restoredUrl:'https://example.invalid/current',compatibilityMode:false,navigationHistory:{entries:[{url:'https://example.invalid/previous'},{url:'https://example.invalid/current'}],index:1}},counts={loads:0,errors:0,restores:0};
 tab.view={webContents:{isDestroyed:()=>false,getURL:()=> 'about:blank',loadURL:async()=>{counts.loads++;},navigationHistory:{restore:async()=>{counts.restores++;change?.(tab);throw reject;}}}};
 const c=vm.createContext({browserNavigationStateStore:nav,browserTabById:()=>tab,browserCompatibilityModeForUrl:()=>false,setBrowserTabCompatibilityMode:async()=>true,waitForProtectedPlayback:async()=>{},suspendBrowserInstrumentationForNavigation:()=>{},isAbortedBrowserNavigation:e=>e?.code==='ERR_ABORTED',browserLoadError:()=>({message:'fixture'}),sendBrowserEvent:()=>counts.errors++});vm.runInContext(extract('function resumeRestoredBrowserPage(tab) {','\nasync function activateBrowserTab('),c);c.resumeRestoredBrowserPage(tab);return {tab,counts};
}
test('K843-01 native history compatibility failure falls back once; aborted, superseded and page failures never replay',async()=>{
 const recovered=resumeFixture(new TypeError('Invalid native history'));await new Promise(setImmediate);assert.equal(recovered.counts.restores,1);assert.equal(recovered.counts.loads,1);assert.equal(recovered.counts.errors,0);
 for(const error of [Object.assign(Error('cancelled'),{code:'ERR_ABORTED',errno:-3}),Object.assign(Error('superseded'),{code:'ERR_NAVIGATION_SUPERSEDED'}),Object.assign(Error('offline'),{code:'ERR_INTERNET_DISCONNECTED',errno:-106}),Error('Unexpected native failure')]){const result=resumeFixture(error);await new Promise(setImmediate);assert.equal(result.counts.loads,0);}
 const superseded=resumeFixture(new TypeError('Invalid native history'),tab=>{tab.navigationRequestSeq++;});await new Promise(setImmediate);assert.equal(superseded.counts.loads,0);assert.equal(superseded.counts.errors,0);
 const staleFailure=resumeFixture(Error('offline'),tab=>{tab.navigationRequestSeq++;});await new Promise(setImmediate);assert.equal(staleFailure.counts.errors,0);
});
