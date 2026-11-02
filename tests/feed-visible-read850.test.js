'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{JSDOM}=require('jsdom');
const {createFeedStore}=require('../src/feed-store');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function settled(h){await tick();for(let i=0;i<100&&h.host.querySelector('[data-action=cancel-bulk]');i++)await tick();await tick();}
async function fixture(t,{count=201,copies=1,locale='en',stateFilter='',oversizedScope=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feed-visible850-')),file=path.join(dir,'feeds.json'),store=createFeedStore(file),calls=[];
 for(let copy=0;copy<copies;copy++)for(let offset=0;offset<count;offset+=200){const entries=Array.from({length:Math.min(200,count-offset)},(_,i)=>({externalId:String(offset+i),url:'https://articles.example.test/'+(offset+i),title:'Story '+(offset+i),summary:'A source',text:'Source text',contentScope:'summary',kind:'article'}));store.subscribe({url:`https://feed${copy}-${offset}.example.test/rss`,title:'Source'},entries,'all');}
 const dom=new JSDOM('<main id="host"></main>',{runScripts:'outside-only'}),w=dom.window,host=w.document.getElementById('host');let stateHook,undoHook;
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.eval(fs.readFileSync(require.resolve('../src/renderer/media-feeds-ui'),'utf8'));
 const api=async packet=>{calls.push(packet);try{
  if(packet.action==='list')return {ok:true,...store.list()};if(packet.action==='entries'){const result=store.entries(packet);if(oversizedScope&&result.rows[0])result.rows[0].entryIds=Array.from({length:4001},(_,i)=>'bounded-input-'+i);return {ok:true,...result};}if(packet.action==='entry')return {ok:true,entry:store.entry(packet.entryId)};
  if(packet.action==='state'){if(stateHook){const response=await stateHook(packet,calls.filter(p=>p.action==='state').length);if(response)return response;}return {ok:true,...store.setState(packet.entryIds,packet)};}
  if(packet.action==='undo'){if(undoHook){const response=await undoHook(packet);if(response)return response;}return {ok:true,...store.undo(packet.token)};}
  return {ok:true};
 }catch(error){return {ok:false,error:error.message};}};
 const controller=w.MediaFeedsUI.render({host,api,locale,restore:{visibleLimit:count,stateFilter}});t.after(()=>{controller.dispose();w.close();fs.rmSync(dir,{recursive:true,force:true});});await controller.ready;
 return {w,host,controller,store,file,calls,unread:()=>createFeedStore(file).snapshot().entries.filter(e=>!e.read).length,stateHook:fn=>stateHook=fn,undoHook:fn=>undoHook=fn,click:action=>{const button=host.querySelector(`[data-action=${action}]`);assert(button,'Missing action '+action);button.click();},status:()=>host.querySelector('.mf-status').textContent};
}

test('R850-03 all201 visible sources persist through200-ID batches, retain loaded range and undo in reverse order',async t=>{
 const h=await fixture(t);assert.equal(h.host.querySelectorAll('.mf-entry').length,201);h.click('mark-visible');await settled(h);
 assert.deepEqual(h.calls.filter(p=>p.action==='state').map(p=>p.entryIds.length),[200,1]);assert.equal(h.unread(),0);assert.equal(h.host.querySelectorAll('.mf-entry').length,201);assert.equal(h.controller.snapshot().visibleLimit,201);assert.match(h.status(),/201\/201/);
 h.click('undo');await settled(h);assert.equal(h.unread(),201);assert.equal(h.calls.filter(p=>p.action==='undo').length,2);assert.equal(h.host.querySelector('[data-action=undo]'),null);assert.match(h.status(),/201.*restored/i);
});

test('R850-03 canonical copies count visible rows and every physical record without truncation',async t=>{
 const h=await fixture(t,{count:101,copies:2,locale:'tr'});assert.equal(h.unread(),202);h.click('mark-visible');await settled(h);assert.deepEqual(h.calls.filter(p=>p.action==='state').map(p=>p.entryIds.length),[200,2]);assert.equal(h.unread(),0);assert.match(h.status(),/101\/101/);assert.match(h.status(),/202\/202/);h.click('undo');await settled(h);assert.equal(h.unread(),202);
});

test('R850-03 second batch failure reports partial completion and keeps undo for completed batches',async t=>{
 const h=await fixture(t);h.stateHook((_p,n)=>n===2?{ok:false,error:'Controlled second batch failure'}:null);h.click('mark-visible');await settled(h);
 assert.equal(h.unread(),1);assert.match(h.status(),/200\/201/);assert.match(h.status(),/1 remaining/i);assert.match(h.status(),/Controlled second batch failure/);assert.equal(h.controller.snapshot().visibleLimit,201);h.click('undo');await settled(h);assert.equal(h.unread(),201);
});

test('R850-03 undo removes only successful receipts and retains the failed and remaining token for retry',async t=>{
 const h=await fixture(t,{count:401});h.click('mark-visible');await settled(h);let undos=0;h.undoHook(()=>++undos===2?{ok:false,error:'Controlled undo failure'}:null);h.click('undo');await settled(h);
 assert.equal(h.unread(),1);assert.match(h.status(),/400 remaining/i);assert.match(h.status(),/Controlled undo failure/);h.click('undo');await settled(h);assert.equal(h.unread(),401);const tokens=h.calls.filter(p=>p.action==='undo').map(p=>p.token);assert.equal(tokens.length,4);assert.notEqual(tokens[0],tokens[1]);assert.equal(tokens[1],tokens[2]);assert.notEqual(tokens[2],tokens[3]);assert.equal(h.host.querySelector('[data-action=undo]'),null);
});

test('R850-03 cancellation finishes only the in-flight frozen batch and leaves a truthful undoable partial receipt',async t=>{
 const h=await fixture(t);h.stateHook((_p,n)=>{if(n===1)h.click('cancel-bulk');return null;});h.click('mark-visible');await settled(h);
 assert.equal(h.calls.filter(p=>p.action==='state').length,1);assert.equal(h.unread(),1);assert.match(h.status(),/200\/201/);assert.match(h.status(),/1 remaining/);assert.match(h.status(),/Stopped/);assert.equal(h.controller.snapshot().visibleLimit,201);h.click('undo');await settled(h);assert.equal(h.unread(),201);
});

test('R850-03 a newer filter stops remaining old-scope batches without resetting that filter or discarding receipts',async t=>{
 const h=await fixture(t),frozen=new Set(h.store.snapshot().entries.map(e=>e.id));h.stateHook((_p,n)=>{if(n===1){const filter=h.host.querySelector('.mf-state');filter.value='saved';filter.dispatchEvent(new h.w.Event('change'));}return null;});h.click('mark-visible');await settled(h);
 const writes=h.calls.filter(p=>p.action==='state');assert.equal(writes.length,1);assert(writes[0].entryIds.every(id=>frozen.has(id)));assert.equal(h.unread(),1);assert.equal(h.controller.snapshot().stateFilter,'saved');assert.equal(h.host.querySelectorAll('.mf-entry').length,0);assert.match(h.status(),/Original visible selection: 200\/201/);assert.match(h.status(),/Stopped/);h.click('undo');await settled(h);assert.equal(h.unread(),201);
});

test('R850-03 undo restores the original201-row unread scope after marking makes that view empty',async t=>{
 const h=await fixture(t,{stateFilter:'unread'});assert.equal(h.controller.snapshot().visibleLimit,201);h.click('mark-visible');await settled(h);assert.equal(h.unread(),0);assert.equal(h.host.querySelectorAll('.mf-entry').length,0);h.click('undo');await settled(h);
 assert.equal(h.unread(),201);assert.equal(h.host.querySelectorAll('.mf-entry').length,201);assert.equal(h.controller.snapshot().visibleLimit,201);assert.equal(h.controller.snapshot().stateFilter,'unread');assert.equal(h.host.querySelector('[data-action=undo]'),null);
});

test('R850-03 a scope above4000 physical records is refused before any mutation',async t=>{
 const h=await fixture(t,{count:1,oversizedScope:true});h.click('mark-visible');await settled(h);assert.equal(h.calls.filter(p=>p.action==='state').length,0);assert.equal(h.unread(),1);assert.match(h.status(),/at most 4000/);assert.match(h.status(),/Nothing was changed/);
});
