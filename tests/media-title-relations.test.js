'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {createMediaCatalogStore}=require('../src/media-catalog-store'),R=require('../src/media-title-relations'),D=require('../src/media-daily-service'),F=require('../src/film-watch-service');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(t,duplicates=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'title-relations-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'media-catalog.json');let store=createMediaCatalogStore({filePath:file});
 const a=store.upsert({kind:'film',title:'Exact cut A',imdbId:'tt1234567',year:2000,watchStatus:'planned',source:{type:'local',value:path.join(root,'A.mp4')}});let b;if(duplicates)b=store.upsert({kind:'film',title:'Exact cut B',imdbId:a.imdbId,year:a.year,watchStatus:'planned',source:{type:'local',value:path.join(root,'B.mp4')}});
 const subtitle=path.join(root,'A.srt'),alt=path.join(root,'A-alt.mp4');fs.writeFileSync(subtitle,'subtitle A');fs.writeFileSync(alt,'alternate A');const legacy=R.legacyKey(a),source=F.sources(a)[0],oldAsset=hash([legacy,subtitle,'subtitle']).slice(0,24);
 const dailyFile=path.join(root,'media-daily.json'),watchFile=path.join(root,'film-watch.json');fs.writeFileSync(dailyFile,JSON.stringify({version:1,queue:{[legacy]:{bucket:'together',order:2}},journal:[{id:'old-note',titleKey:legacy,title:a.title,note:'Legacy exact note'}],preferences:[],assets:[{id:'old-sub',titleKey:legacy,role:'subtitle',path:subtitle}]}));fs.writeFileSync(watchFile,JSON.stringify({version:1,collections:{},alternatives:[{id:'old-alt',titleKey:legacy,label:'A alternate',source:{type:'local',value:alt,watchKey:'file:'+alt}}],viewingChoices:[{titleKey:legacy,sourceId:source.id,subtitleId:oldAsset,voiceId:''}]}));
 const service=()=>{const args={root:()=>root,catalog:()=>store,reviewItem:async(_e,input)=>store.get(input.itemId),grantSubtitle:()=>true};return {daily:D.create(args),film:F.create(args)};};const event={sender:{id:1}},call=(s,action,id=a.id,extra={})=>s.handle(event,{action,itemId:id,...extra});
 return {root,file,a,b,legacy,dailyFile,watchFile,subtitle,service,call,get store(){return store;},restart(){store=createMediaCatalogStore({filePath:file});}};
}

test('R848-02 legacy owner aliases preserve year corrections and undo across restart without rewriting personal records',async t=>{
 const h=fixture(t),bytes=[h.dailyFile,h.watchFile].map(f=>fs.readFileSync(f,'utf8'));h.store.upsert({id:h.a.id,year:2001});h.restart();let s=h.service(),title=await h.call(s.daily,'daily-title');assert.equal(title.journal[0].id,'old-note');assert.equal(title.sources.assets.length,1);assert.equal((await h.call(s.daily,'daily-list')).watchlist[0].bucket,'together');let overview=await h.call(s.film,'film-watch-overview');assert.equal(overview.assets.length,1);assert.equal(overview.selection.subtitleId,overview.assets[0].id);assert(overview.sources.some(row=>row.id==='old-alt'));assert.equal(F.additionalSources(h.root,h.store.get(h.a.id))[0].alternativeId,'old-alt');assert.equal((await h.call(s.film,'film-watch-asset',h.a.id,{assetId:overview.assets[0].id})).file,h.subtitle);
 h.store.upsert({id:h.a.id,year:2000});h.restart();s=h.service();assert.equal((await h.call(s.daily,'daily-title')).journal.length,1);assert.equal((await h.call(s.film,'film-watch-overview')).assets[0].id,overview.assets[0].id);assert.deepEqual([h.dailyFile,h.watchFile].map(f=>fs.readFileSync(f,'utf8')),bytes);
});

test('R848-02 captured aliases never move legacy files to a duplicate physical copy or a retargeted provider',async t=>{
 const h=fixture(t);h.store.upsert({id:h.a.id,year:2001});const b=h.store.upsert({kind:'film',title:'Another physical cut',imdbId:h.a.imdbId,year:2001,source:{type:'local',value:path.join(h.root,'B.mp4')}});let s=h.service();assert.equal((await h.call(s.film,'film-watch-overview',b.id)).assets.length,0);assert.equal((await h.call(s.daily,'daily-title',b.id)).journal.length,0);assert.equal(F.additionalSources(h.root,b).length,0);assert.equal((await h.call(s.film,'film-watch-overview')).assets.length,1);
 h.store.upsert({id:h.a.id,imdbId:'tt7654321'});h.restart();s=h.service();assert.equal((await h.call(s.daily,'daily-title')).journal.length,0);assert.equal((await h.call(s.film,'film-watch-overview')).assets.length,0);assert.equal(fs.readFileSync(h.subtitle,'utf8'),'subtitle A');
});

test('R848-02 ambiguous preexisting provider duplicates remain unclaimed and original bytes are preserved',async t=>{
 const h=fixture(t,true),before=[h.dailyFile,h.watchFile].map(f=>fs.readFileSync(f,'utf8'));h.store.upsert({id:h.b.id,year:2001});h.restart();const s=h.service();for(const item of [h.a,h.b]){assert.equal((await h.call(s.daily,'daily-title',item.id)).journal.length,0);assert.equal((await h.call(s.film,'film-watch-overview',item.id)).assets.length,0);assert.equal(F.additionalSources(h.root,h.store.get(item.id)).length,0);}assert.deepEqual([h.dailyFile,h.watchFile].map(f=>fs.readFileSync(f,'utf8')),before);const aliases=JSON.parse(fs.readFileSync(path.join(h.root,'media-title-relations.json')));assert.equal(aliases.bindings[h.legacy],null);
});

test('R848-02 alias write failure blocks metadata mutation before catalog/backup changes; unrelated flag edits remain available',t=>{
 const h=fixture(t),before=[h.file,h.file+'.bak'].map(f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):null),io={...fs,writeFileSync(file,...args){if(path.basename(file).startsWith('media-title-relations.json.'))throw Object.assign(Error('controlled alias write failure'),{code:'EACCES'});return fs.writeFileSync(file,...args);}},store=createMediaCatalogStore({filePath:h.file,fsImpl:io});assert.throws(()=>store.upsert({id:h.a.id,year:2001}),/ownership.*Catalog unchanged/);assert.deepEqual([h.file,h.file+'.bak'].map(f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):null),before);assert.equal(store.get(h.a.id).year,2000);assert.equal(store.upsert({id:h.a.id,watchStatus:'completed'}).watchStatus,'completed');
});

test('R848-02 catalog-write failure after alias commit leaves valid old-owner aliases and permits safe retry',async t=>{
 const h=fixture(t),io={...fs,writeFileSync(file,...args){if(file.startsWith(h.file+'.')&&file.endsWith('.tmp'))throw Error('controlled catalog failure');return fs.writeFileSync(file,...args);}},store=createMediaCatalogStore({filePath:h.file,fsImpl:io});assert.throws(()=>store.upsert({id:h.a.id,year:2001}),/controlled catalog failure/);assert.equal(store.get(h.a.id).year,2000);assert.equal(JSON.parse(fs.readFileSync(path.join(h.root,'media-title-relations.json'))).bindings[h.legacy],R.titleKey(h.a));h.store.upsert({id:h.a.id,year:2001});h.restart();const s=h.service();assert.equal((await h.call(s.daily,'daily-title')).journal.length,1);
});

test('R848-02 daily ownership indexes read shared sidecars once and accept authoritative large catalogs and backup recovery',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'title-relations-large-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'media-catalog.json');
 const items=Array.from({length:4100},(_,i)=>({id:'work-'+i,kind:i<80?'series':'film',title:'Recorded title '+i,year:2000,imdbId:'tt'+String(1000000+i),synopsis:'s'.repeat(4000),watchStatus:i<80?'watching':'planned',episodes:i<80?[{id:'episode',season:1,number:1,watchStatus:'watching'}]:[]}));
 const raw=JSON.stringify({version:1,items});assert(Buffer.byteLength(raw)>16_000_000);fs.writeFileSync(file,raw);fs.writeFileSync(file+'.bak',raw);
 const series=items.slice(0,80),legacy=Object.fromEntries(series.map(item=>[R.legacyKey(item),R.titleKey(item)]));fs.writeFileSync(path.join(root,'media-title-relations.json'),JSON.stringify({version:1,bindings:legacy}));fs.writeFileSync(path.join(root,'film-watch.json'),JSON.stringify({version:1,collections:{},alternatives:series.map(item=>({id:'alt-'+item.id,titleKey:R.legacyKey(item),episodeId:'episode',source:{type:'local',value:path.join(root,item.id+'.mp4'),watchKey:'file:'+path.join(root,item.id+'.mp4')}}))}));fs.writeFileSync(path.join(root,'media-daily.json'),JSON.stringify({version:1,queue:Object.fromEntries(series.map(item=>[R.legacyKey(item),{bucket:'together'}])),journal:[],preferences:[]}));
 for(const backup of [false,true]){
  if(backup)fs.writeFileSync(file,'{broken primary');
  const store=createMediaCatalogStore({filePath:file});assert.equal(store.list().length,4100,'authoritative catalog accepts its existing envelope and backup policy');
  let lists=0;const catalog={get:id=>store.get(id),list:()=>{lists++;return store.list();}},daily=D.create({root:()=>root,catalog:()=>catalog,reviewItem:async(_e,input)=>catalog.get(input.itemId)}),reads=new Map(),original=fs.readFileSync;
  fs.readFileSync=function(name,...args){const value=String(name);reads.set(value,(reads.get(value)||0)+1);return original.call(this,name,...args);};
  let result;try{result=await daily.handle({sender:{id:1}},{action:'daily-list'});}finally{fs.readFileSync=original;}
  assert.equal(result.continuations.length,80);assert(result.continuations.every(row=>row.episode.playable));assert.equal(lists,1,'one authoritative catalog snapshot per daily operation');assert.equal(reads.get(file)||0,0,'association helper never reparses or imposes a smaller catalog limit');assert.equal(reads.get(file+'.bak')||0,0);assert.equal(reads.get(path.join(root,'media-title-relations.json')),1,'one binding snapshot shared by queue and all series');assert((reads.get(path.join(root,'film-watch.json'))||0)<=1,'alternate sidecar is cached once across all series');
 }
});

test('R848-01 discovery requires a unique physical library target and missing exact selection is never rematched',async t=>{
 const h=fixture(t,true),selected={id:'discovery:film:'+h.a.imdbId,kind:'film',providerId:h.a.imdbId,imdbId:h.a.imdbId,year:2000,title:h.a.title},args={root:()=>h.root,catalog:()=>h.store,reviewItem:async()=>selected},film=F.create(args),daily=D.create(args),event={sender:{id:1}};
 await assert.rejects(film.handle(event,{action:'film-watch-overview',discovery:{kind:'film',id:h.a.imdbId}}),/Multiple library records/);await assert.rejects(daily.handle(event,{action:'daily-title',discovery:{kind:'film',id:h.a.imdbId}}),/Multiple library records/);
 const original=h.b;h.store.remove(h.b.id);const stale=F.create({...args,reviewItem:async()=>original});await assert.rejects(stale.handle(event,{action:'film-watch-overview',itemId:original.id}),/Library selection changed/);
});
