'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMediaCatalogStore}=require('../src/media-catalog-store'),{register}=require('../src/assistant-collections');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'collections624-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createMediaCatalogStore({filePath:path.join(dir,'catalog.json')});const a=store.upsert({kind:'film',title:'First',source:{type:'local',value:'C:\\private\\first.mp4'}}),b=store.upsert({kind:'film',title:'Second'});let handle,time=1000;register({ipcMain:{handle:(_,fn)=>handle=fn},authorized:e=>e.sender.id===1,store:()=>store,now:()=>time});return {store,a,b,call:input=>handle({sender:{id:1}},input),foreign:input=>handle({sender:{id:2}},input),expire:()=>time+=600001};}
test('Collection plan changes nothing; apply atomically preserves sources and persists memberships',async t=>{const f=fixture(t),plan=await f.call({action:'plan',name:'Quiet films',ids:f.a.id+','+f.b.id});assert(plan.ok);assert.deepEqual(f.store.get(f.a.id).collections,[]);assert.equal((await f.foreign({action:'apply',id:plan.plan.id})).ok,false);assert((await f.call({action:'apply',id:plan.plan.id})).ok);assert.deepEqual(f.store.get(f.a.id).collections,['Quiet films']);assert.equal(f.store.get(f.a.id).source.value,'C:\\private\\first.mp4');assert.equal((await f.call({action:'apply',id:plan.plan.id})).ok,false);f.store.upsert({id:f.a.id,title:'First renamed'});assert.deepEqual(f.store.get(f.a.id).collections,['Quiet films']);});
test('Changed identities and expired plans cannot partially update a collection',async t=>{const f=fixture(t);let p=await f.call({action:'plan',name:'Plan',ids:f.a.id+','+f.b.id});f.store.upsert({id:f.b.id,title:'Changed'});assert.equal((await f.call({action:'apply',id:p.plan.id})).ok,false);assert.deepEqual(f.store.get(f.a.id).collections,[]);p=await f.call({action:'plan',name:'Plan',ids:f.a.id});f.expire();assert.equal((await f.call({action:'apply',id:p.plan.id})).ok,false);assert.equal((await f.call({action:'plan',name:'Plan',ids:'invented'})).ok,false);});

test('Membership removal is planned separately and never deletes a catalog record',async t=>{const f=fixture(t);f.store.upsert({id:f.a.id,collections:['Keep','Remove']});const p=await f.call({action:'plan',name:'Remove',ids:f.a.id,member:false});assert.equal(p.plan.member,false);assert((await f.call({action:'apply',id:p.plan.id})).ok);assert.deepEqual(f.store.get(f.a.id).collections,['Keep']);assert(f.store.get(f.a.id).source);});


test('Collection plan binds the reviewed target before creating a fresh plan',async t=>{
 const f=fixture(t),sig=row=>JSON.stringify([row.id,row.kind,row.imdbId,row.title,row.year]),expected={id:f.a.id,signature:sig(f.a)};
 f.store.upsert({id:f.a.id,title:'A different reviewed title'});
 const stale=await f.call({action:'plan',name:'Reviewed',ids:f.a.id,expectedTargets:[expected]});assert.equal(stale.ok,false);assert.deepEqual(f.store.get(f.a.id).collections,[]);
 const fresh=await f.call({action:'plan',name:'Reviewed',ids:f.a.id,expectedTargets:[{id:f.a.id,signature:sig(f.store.get(f.a.id))}]});assert.equal(fresh.ok,true);assert.equal((await f.call({action:'apply',id:fresh.plan.id})).ok,true);
 assert.equal((await f.call({action:'plan',name:'Bad',ids:f.a.id,expectedTargets:[]})).ok,false);
 assert.equal((await f.call({action:'plan',name:'Bad',ids:f.a.id,expectedTargets:[{id:f.b.id,signature:sig(f.b)}]})).ok,false);
});
