'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const item={id:'discovery:film:tt14173636',kind:'film',title:'Verified discovery film',year:2026,providerId:'tt14173636',imdbId:'tt14173636',discovery:{kind:'film',id:'tt14173636'}};
function fixture(fresh={...item}){
 const dom=new JSDOM('<body><section id="browserWorkspace"><nav class="browser-toolbar"></nav></section></body>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window,calls=[],mounted=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.syncBrowserOcclusion=async()=>{};w.UiLocale={get:()=> 'en'};w.MediaExperience={setContext(){}};w.LetterboxdReviews=require('../src/letterboxd-reviews');
 w.MediaReviewDecision={leave(){},hasActive:()=>false,mount:(_body,value,_saved,draft)=>mounted.push({item:value,resumeBrowser:draft.resumeBrowser})};
 w.api={mediaDiscovery:async packet=>{calls.push(packet);return {ok:true,item:fresh};},mediaCatalog:async()=>{throw Error('Discovery handoff must not use or insert a library title');},mediaTools:async packet=>{calls.push(packet);return {ok:true,value:{}};}};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/media-tools-ui'),'utf8'));
 w.MediaToolsUI.reviewBrowserHandoff(item);return {w,calls,mounted,close:()=>w.close(),click:()=>w.document.querySelector('#reviewBrowserReturn .mh-primary').click(),tick:()=>new Promise(setImmediate)};
}
test('Discovery Browser review return resolves the original provider identity without a library insertion',async()=>{
 const f=fixture();try{f.click();await f.tick();assert.equal(f.mounted.length,1);assert.equal(f.mounted[0].resumeBrowser,true);assert.equal(f.mounted[0].item.id,item.id);assert.deepEqual(JSON.parse(JSON.stringify(f.mounted[0].item.discovery)),item.discovery);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{action:'detail',kind:'film',id:'tt14173636'});assert(!f.w.document.getElementById('reviewBrowserReturn'));}finally{f.close();}
});
for(const change of [{title:'Different film'},{year:2025},{providerId:'tt99999999'},{kind:'series'}])test('Discovery review return rejects changed identity '+JSON.stringify(change),async()=>{
 const f=fixture({...item,...change});try{f.click();await f.tick();assert.equal(f.mounted.length,0);assert.match(f.w.document.getElementById('reviewBrowserReturn').textContent,/identity changed/);assert(!f.w.document.querySelector('#reviewBrowserReturn .mh-primary').disabled);}finally{f.close();}
});
test('A dismissed discovery handoff cannot reopen a late detail result',async()=>{
 const f=fixture();let release;try{f.w.api.mediaDiscovery=()=>new Promise(resolve=>release=resolve);f.click();f.w.document.querySelector('#reviewBrowserReturn button:last-child').click();release({ok:true,item});await f.tick();assert.equal(f.mounted.length,0);}finally{f.close();}
});
