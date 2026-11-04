'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {registerAssistantArtifacts}=require('../src/assistant-artifact-service');
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture(t){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-redesign-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/'});t.after(()=>dom.window.close());const w=dom.window;
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.requestAnimationFrame=fn=>setTimeout(fn,0);w.Element.prototype.showPopover=function(){this.hidden=false;};w.Element.prototype.hidePopover=function(){this.hidden=true;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLElement.prototype.getAnimations=()=>[];
 const items=[{id:'one',title:'One',kind:'film',year:2000,runtime:90,directors:['A'],productionCountries:['TR'],originalLanguage:'tr'},{id:'two',title:'Two',kind:'film',year:2020,runtime:80,directors:['B'],productionCountries:['GB'],originalLanguage:'en'}];
 const handle=registerAssistantArtifacts({app:{getPath:()=>profile},ipcMain:{handle(){}},authorized:()=>true,catalogStore:()=>({list:()=>items})}).handle;
 const saved=await handle(null,{action:'save',ids:['one','two'],locale:'en'});const calls=[];
 w.UiLocale={get:()=> 'en'};w.syncBrowserOcclusion=async()=>{};w.player={mediaKey:'',generation:1};
 w.api={assistantArtifacts:async input=>{calls.push(input);return handle(null,input);},mediaCatalog:async input=>input.action==='list'?{ok:true,items}:{ok:true},mediaTools:async()=>({ok:true,watchlist:items.map(i=>({...i,hasSource:false}))}),feedsRequest:async input=>({ok:true,feeds:[],rows:[]}),mediaHub:async input=>({ok:true,folders:[],preview:{roots:{accessible:0,total:0,unverified:0},issues:[],groups:[],proposals:[]},titles:{}}),nativePlayer:async()=>({ok:false})};
 for(const f of ['renderer/player-ui-kit.js','feed-story-identity.js','cinema-bulletin-model.js','watch-itinerary.js','native-player-diagnostics.js','assistant-artifact-export.js','renderer/v3-surfaces-ui.js','renderer/v3-integration.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'));
 const open=async tab=>{w.WhisperV3.open(tab);await wait();await wait();return w.document.getElementById('whisperV3Dialog');};
 const button=(root,text)=>[...root.querySelectorAll('button')].find(n=>n.textContent.trim()===text);
 return {w,items,profile,calls,saved,handle,open,button};
}
test('matrix uses custom controls, typed edits and an initially empty explicit refresh selection',async t=>{
 const f=await fixture(t),d=await f.open('matrix');
 assert.equal(d.querySelectorAll('.ws-film-column .ws-poster').length,2);assert.equal(d.querySelectorAll('.ws-data-cell').length,12);assert.equal(d.querySelectorAll('select,details,input[type=checkbox],input[type=radio]').length,0);assert.equal(d.querySelectorAll('.ws-duration-track i').length,2);
 d.querySelector('button[aria-label="One · Year · Edit"]').click();
 let drawer=d.querySelector('.v3-drawer'),input=drawer.querySelector('input');assert.equal(input.type,'number');assert.equal(input.min,'1888');assert.equal(input.step,'1');input.value='1999';f.button(drawer,'Save correction').click();await wait();await wait();
 assert.ok(d.textContent.includes('Edited by hand'));
 f.items[0].year=2001;f.items[1].runtime=120;d.querySelector('[aria-label="Refresh details from library"]').click();await wait();
 drawer=d.querySelector('.v3-drawer');const apply=f.button(drawer,'Refresh selected fields');assert.equal(apply.disabled,true);assert.equal(drawer.querySelectorAll('[aria-pressed=true]').length,0);
 const row=[...drawer.querySelectorAll('.ws-choice-row')].find(n=>n.textContent.includes('One · Year'));row.querySelector('button').click();assert.equal(apply.disabled,false);apply.click();await wait();await wait();
 const refresh=f.calls.findLast(c=>c.refreshKeys);assert.deepEqual(Array.from(refresh.refreshKeys),['cell:year:one']);
 const result=await f.handle(null,{action:'get',id:f.saved.doc.id});assert.equal(result.body.cells.find(c=>c.rowId==='year'&&c.colId==='one').value,'2001');assert.equal(result.body.cells.find(c=>c.rowId==='runtime'&&c.colId==='two').value,'80');
});
test('route exposes real breaks and bulletin editor remains closed until requested',async t=>{
 const f=await fixture(t);let d=await f.open('route');assert.equal(d.querySelectorAll('.ws-watch-stop').length,2);assert.equal(d.querySelectorAll('.ws-route-break').length,1);assert.ok(d.textContent.includes('10 minute break'));assert.ok(d.textContent.includes('Needs source'));assert.equal(d.querySelectorAll('select,details,input[type=checkbox]').length,0);
 d=await f.open('bulletin');assert.equal(d.querySelector('.v3-drawer-backdrop').hidden,true);assert.equal(d.querySelectorAll('.v3-editorial').length,0);assert.equal(d.querySelector('.mk-accordion-toggle').getAttribute('aria-expanded'),'false');
});
test('maintenance applies explicit candidate subset, refreshes scope and keeps undo reachable',async t=>{
 const f=await fixture(t);let applied=false;const calls=[];
 f.w.api.mediaHub=async input=>{calls.push(input);if(input.action==='folders')return {ok:true,folders:[{id:'root',path:'D:/Media',enabled:true,count:2}]};if(input.action==='v3-maintenance')return {ok:true,preview:{roots:{accessible:1,total:1,unverified:0},issues:[],groups:[],proposals:[]},rootChecks:[{rootId:'root',accessible:true}],untrackedSources:applied?[{workId:'one',path:'E:/old/One.mp4'}]:[{workId:'one',path:'E:/old/One.mp4'},{workId:'two',path:'E:/old/Two.mp4'}],titles:{one:'One',two:'Two'}};if(input.action==='relink-preview')return {ok:true,token:'preview',patches:[{id:'one',title:'One',old:'E:/old/One.mp4',next:'D:/Media/One.mp4'},{id:'two',title:'Two',old:'E:/old/Two.mp4',next:'D:/Media/Two.mp4'}]};if(input.action==='relink-apply'){applied=true;return {ok:true,count:1,undoToken:'undo'};}if(input.action==='relink-undo'){applied=false;return {ok:true,count:1};}return {ok:true};};
 const d=await f.open('maintenance');assert.ok(d.querySelector('.ws-root-status').textContent.includes('Root verified'));assert.equal(d.querySelectorAll('.ws-untracked-scope>span').length,2);
 f.button(d,'Review').click();await wait();const drawer=d.querySelector('.v3-drawer'),apply=f.button(drawer,'Apply selected links');assert.equal(apply.disabled,true);drawer.querySelectorAll('.ws-choice-row button')[1].click();apply.click();await wait();await wait();
 const request=calls.find(c=>c.action==='relink-apply');assert.deepEqual(Array.from(request.selectedIndices),[1]);assert.equal(d.querySelectorAll('.ws-untracked-scope>span').length,1);assert.ok(f.button(d,'Undo relinking'));f.button(d,'Undo relinking').click();await wait();await wait();assert.equal(d.querySelectorAll('.ws-untracked-scope>span').length,2);assert.ok(!f.button(d,'Undo relinking'));
});
test('bulletin keeps full long title, real publisher/date and explicit source action',async t=>{
 const f=await fixture(t),opened=[];const title='The Film Comment Podcast: Liani Greaves and Barry Jenkins on Once Upon a Time in Harlem '+ 'LongHeadline'.repeat(12);const row={id:'entry1',feedId:'internal-feed-uuid',title,text:'Publisher source excerpt.',url:'https://www.filmcomment.com/blog/source/',publishedAt:'2026-11-04T09:40:00Z',sourceFeed:{title:'Film Comment'},links:[],read:false,contentKind:'news'};
 f.w.api.feedsRequest=async input=>input.action==='list'?{ok:true,feeds:[{id:row.feedId,title:'Film Comment',enabled:true,lastAttempt:Date.now(),state:'updated'}]}:{ok:true,rows:[row]};f.w.api.openExternal=async url=>opened.push(url);
 const d=await f.open('bulletin'),article=d.querySelector('.ws-article');assert.ok(article);assert.equal(article.querySelector('h2').textContent,title);assert.ok(article.querySelector('.ws-article-source').textContent.includes('Film Comment'));assert.ok(article.querySelector('.ws-article-source').textContent.includes('2026'));assert.ok(!article.textContent.includes(row.feedId));assert.equal(article.querySelectorAll('.ws-article-actions button').length,2);article.querySelector('[aria-label="Open source"]').click();await wait();assert.deepEqual(opened,[row.url]);
});
test('route budget slider and presets share the same editable duration',async t=>{
 const f=await fixture(t),d=await f.open('route'),range=d.querySelector('input[type=range]'),number=d.querySelector('input[type=number]');assert.ok(range);assert.equal(range.min,number.min);assert.equal(range.max,number.max);
 range.value='360';range.dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.equal(number.value,'360');range.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('[data-budget="360"]').getAttribute('aria-pressed'),'true');
 number.value='250';number.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(range.value,'250');assert.equal(d.querySelector('[data-budget="custom"]').getAttribute('aria-pressed'),'true');
});
test('bulletin filters expose active state and keep bounded-data caption in content',async t=>{
 const f=await fixture(t),d=await f.open('bulletin');assert.equal(d.querySelector('.ws-issue-filter button').getAttribute('aria-pressed'),'true');assert.ok(d.querySelector('.ws-bulletin .ws-bulletin-caption'));assert.equal(d.querySelector('.mtx-status').textContent,'');
 const unread=d.querySelectorAll('.ws-issue-filter button')[1];unread.click();assert.equal(unread.getAttribute('aria-pressed'),'true');assert.equal(d.querySelector('.ws-issue-filter button').getAttribute('aria-pressed'),'false');
});
test('health with samples but no measured properties shows one empty state and can refresh',async t=>{
 const f=await fixture(t);let reads=0;f.w.api.nativePlayer=async()=>{reads++;return {ok:true,props:{}};};const d=await f.open('health');assert.equal(d.querySelectorAll('.ws-state').length,1);assert.equal(d.querySelectorAll('.ws-health-check').length,0);const before=reads;f.button(d,'Refresh measurement').click();await wait();assert.equal(reads,before+1);
});
test('maintenance reports empty visible issues and labels real root table columns',async t=>{
 const f=await fixture(t);f.w.api.mediaHub=async input=>input.action==='folders'?{ok:true,folders:[{id:'root',path:'D:/Media',enabled:true,count:0}]}:{ok:true,preview:{roots:{accessible:0,total:1,unverified:1},issues:[{kind:'root-unverified'}],groups:[]},rootChecks:[],titles:{}};
 const d=await f.open('maintenance');assert.ok(d.querySelector('.ws-root-table-head'));assert.ok(d.querySelector('.ws-relink-section .ws-audit-empty'));assert.ok(!d.textContent.includes('content hash'));
});
