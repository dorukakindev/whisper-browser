'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { registerMediaDiscovery, normalizeMeta } = require('../src/media-discovery-service');
const { createMediaCatalogStore } = require('../src/media-catalog-store');
test('discovery translation is cancelable, cached and never silently adds a watchlist record',async()=>{
  const handlers=new Map();let clock=0,translations=0,description="A witness does not claim certainty.";
  registerMediaDiscovery({now:()=>clock,ipcMain:{handle:(n,f)=>handlers.set(n,f)},authorized:()=>true,catalogStore:()=>({list:()=>[],upsert:()=>{throw Error('must not save');}}),
    translateSynopsis:async()=>{translations++;return 'Bir tanık kesinlik iddia etmiyor.';},
    fetchImpl:async()=>new Response(JSON.stringify({meta:{id:'tt1234567',name:'Witness',description}}))});
  const run=(action,token)=>handlers.get('media-discovery:request')({},{action,kind:'film',id:'tt1234567',token});
  assert.equal((await run('synopsis-translate','request-first')).item.synopsisTr,'Bir tanık kesinlik iddia etmiyor.');
  assert((await run('synopsis-translate','request-again')).cached);assert.equal(translations,1);
  assert.equal((await run('detail')).item.synopsisTr,'Bir tanık kesinlik iddia etmiyor.','reopened detail retains this exact source translation');
  await run('synopsis-stop','request-stopped');assert((await run('synopsis-translate','request-stopped')).canceled);assert.equal(translations,1);
  description='A different story.';clock+=600001;assert.equal((await run('detail')).item.synopsisTr,undefined,'changed source cannot show stale translation');
});
test('discovery normalizes trusted image origins, identities and bounded metadata', () => {
  assert.equal(normalizeMeta({ id: '../../secret', name: 'No' }, 'movie'), null);
  const item = normalizeMeta({ id: 'tt1234567', name: 'Keep', poster: 'file:///secret', background: 'https://evil.example/secret', imdbRating: Infinity, genres: ['Drama'], releaseInfo: '2026–' }, 'series');
  assert.equal(item.kind, 'series'); assert.equal(item.year, 2026);
  assert.equal(item.poster, ''); assert.equal(item.backdrop, ''); assert.equal(item.rating, null);
  assert.deepEqual(item.genres, ['Drama']);
});
test('fixed provider routes, caching, personal exclusions and idempotent watchlist saves', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-'));
  try {
    const catalog = createMediaCatalogStore({ filePath: path.join(dir, 'catalog.json') });
    catalog.upsert({ title: 'Liked', kind: 'film', imdbId: 'tt1234567', favorite: true, genres: ['Drama'], ratings: { personal: '4.5' } });
    const calls = [], handlers = new Map();
    const rows = [{ id: 'tt1234567', name: 'Liked', genres: ['Drama'] }, { id: 'tt1234568', name: 'New', genres: ['Drama'], poster: 'https://images.metahub.space/poster/small/tt1234568/img', description: 'A fixture.' }];
    registerMediaDiscovery({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, authorized: e => e.allowed, catalogStore: () => catalog, userData:()=>dir,
      fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(url.includes('/meta/') ? { meta: rows[1] } : { metas: rows })); } });
    const handler = handlers.get('media-discovery:request'), api = (action, rest = {}) => handler({ allowed: true }, { action, ...rest });
    assert.equal((await handler({ allowed: false }, { action: 'list' })).ok, false); assert.equal(calls.length, 0);
    const listed = await api('list', { genre: 'Drama' }); assert.equal(listed.ok, true); assert.equal(listed.rows.length, 2); assert(listed.rows[0].catalogId);
    await api('list', { genre: 'Drama' }); assert.equal(calls.length, 1, '10-minute request cache');
    assert(calls[0].url.startsWith('https://v3-cinemeta.strem.io/catalog/movie/top/')); assert(calls[0].url.includes('skip=0'));
    assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.redirect, 'manual');
    const personal = await api('personal'); assert.equal(personal.rows.length, 1); assert.equal(personal.rows[0].because, 'Liked');
    assert((await api('feedback',{id:'tt1234568',kind:'film',title:'New',state:'hidden'})).ok);
    assert.equal((await api('personal')).rows.length,0,'Not interested excludes personal recommendations');
    assert.equal((await api('list')).rows.some(row=>row.providerId==='tt1234568'),false,'Preference also hides browsing recommendations');
    assert.equal((await api('feedback-list')).rows[0].feedback,'hidden');
    assert((await api('feedback',{id:'tt1234568',kind:'film',state:'none'})).ok);
    assert.equal((await api('personal')).rows.length,1,'Undo restores eligibility without changing library');
    assert.equal((await api('feedback',{id:'../../secret',kind:'film',state:'watched'})).ok,false);
    assert.equal((await api('detail', { kind: 'film', id: 'tt1234568' })).item.title, 'New');
    assert.equal(catalog.list().length, 1, 'Browsing and detail must not add records');
    const [one, two] = await Promise.all([api('add', { kind: 'film', id: 'tt1234568' }), api('add', { kind: 'film', id: 'tt1234568' })]);
    assert(one.ok && two.ok); assert.equal(catalog.list().length, 2);
    assert.equal(catalog.list().find(item => item.imdbId === 'tt1234568').watchStatus, 'planned');
    assert.equal((await api('list', { skip: -1 })).ok, false);
    assert.equal((await api('list', { genre: '../../etc' })).ok, false);
    assert.equal((await api('add', { kind: 'film', id: 'https://evil.example' })).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('provider HTTP errors and excessive response size do not alter the library', async () => {
  let handler;
  registerMediaDiscovery({ ipcMain: { handle: (_name, fn) => { handler = fn; } }, authorized: () => true, catalogStore: () => ({ list: () => [] }), fetchImpl: async () => new Response('bad', { status: 429 }) });
  assert.match((await handler({}, { action: 'list' })).error, /limit/);
  registerMediaDiscovery({ ipcMain: { handle: (_name, fn) => { handler = fn; } }, authorized: () => true, catalogStore: () => ({ list: () => [] }), fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '5000000' } }) });
  assert.equal((await handler({}, { action: 'list' })).ok, false);
});

test('imported ratings seed explained recommendations only with matched genre evidence', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'profile-discovery-'));
  try{
    const catalog=createMediaCatalogStore({filePath:path.join(dir,'catalog.json')});
    catalog.upsert({title:'First',kind:'film',year:2024,genres:['Drama'],ratings:{personal:'8'}});
    catalog.upsert({title:'Second',kind:'film',year:2025,genres:['Drama'],ratings:{personal:'10'}});
    fs.writeFileSync(path.join(dir,'media-shelf.json'),JSON.stringify({diary:[{title:'First',year:'2024',rating:1},{title:'Second',year:'2025',rating:1}]}));
    let handler;registerMediaDiscovery({ipcMain:{handle:(_name,fn)=>handler=fn},authorized:()=>true,userData:()=>dir,catalogStore:()=>catalog,fetchImpl:async()=>new Response(JSON.stringify({metas:[{id:'tt1234999',name:'Suggestion',genres:['Drama']}]}))});
    const result=await handler({}, {action:'personal'});assert(result.ok);assert.equal(result.rows[0].profileBecause.count,2);assert.equal(result.rows[0].profileBecause.average,4.5,'Preserved personal ratings override imported scores');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('official Cinemeta redirect is followed; external redirect is rejected before fetching it', async () => {
  let handler, count = 0;
  const setup = fetchImpl => registerMediaDiscovery({ ipcMain: { handle: (_name, fn) => { handler = fn; } }, authorized: () => true, catalogStore: () => ({ list: () => [] }), fetchImpl });
  setup(async url => {
    count++;
    return url.includes('v3-cinemeta.strem.io') ? new Response(null, { status: 307, headers: { location: 'https://cinemeta-catalogs.strem.io/top/catalog/movie/top/skip=0.json' } }) : new Response('{"metas":[]}');
  });
  assert.equal((await handler({}, { action: 'list' })).ok, true); assert.equal(count, 2);
  count = 0; setup(async () => { count++; return new Response(null, { status: 307, headers: { location: 'http://127.0.0.1/private' } }); });
  assert.equal((await handler({}, { action: 'list' })).ok, false); assert.equal(count, 1);
});

test('detail rejects provider identity drift before saving or translating a different title', async () => {
  let handler, writes=0, translations=0;
  registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,
    catalogStore:()=>({list:()=>[],upsert:()=>{writes++;}}),translateSynopsis:async()=>{translations++;return 'Translated';},
    fetchImpl:async()=>new Response(JSON.stringify({meta:{id:'tt7654321',name:'Wrong title',description:'Different work'}}))});
  for(const action of ['detail','add','ensure-record','synopsis-translate']) {
    const result=await handler({}, {action,kind:'film',id:'tt1234567',token:'request-identity'});
    assert.equal(result.ok,false,action+' must reject a different returned IMDb identity');
  }
  assert.equal(writes,0);assert.equal(translations,0);
});

test('saved viewing year filter ignores the hidden genre and never needs the provider', async () => {
  let handler;
  const items=[{id:'saved',kind:'film',imdbId:'tt1234567',title:'Comedy',year:2025,genres:['Comedy'],watchStatus:'planned'}];
  registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,catalogStore:()=>({list:()=>items}),fetchImpl:async()=>{throw Error('saved view must stay local');}});
  const result=await handler({}, {action:'list',view:'watchlist',mode:'year',year:2025,genre:'Drama'});
  assert.equal(result.ok,true);assert.equal(result.rows.length,1);
});

test('personal exclusion uses kind plus provider identity and honors standalone dislikes', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-exclusion-'));
  try {
    const personal=require('../src/personal-media-state'),data={version:1,titles:{}};
    personal.setFeedback(data,{id:'discovery:film:tt2222222',kind:'film',title:'Disliked',imdbId:'tt2222222'},{reaction:'dislike'});
    personal.saveFeedback(dir,data);
    let handler;
    const items=[{id:'seed',kind:'film',imdbId:'tt1111111',title:'Liked',favorite:true,genres:['Drama']},
      {id:'series',kind:'series',imdbId:'tt3333333',title:'Series identity',watchStatus:'completed'}];
    registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,userData:()=>dir,catalogStore:()=>({list:()=>items}),
      fetchImpl:async()=>new Response(JSON.stringify({metas:[{id:'tt2222222',name:'Disliked',genres:['Drama']},{id:'tt3333333',name:'Film identity',genres:['Drama']},{id:'tt4444444',name:'Wrong genre',genres:['Comedy']}]}))});
    const result=await handler({}, {action:'personal',kind:'film'});
    assert.equal(result.ok,true);assert.deepEqual(result.rows.map(r=>r.providerId),['tt3333333']);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('saved viewing highly rated mode orders saved titles by their IMDb score',async()=>{
  let handler;
  const items=[{id:'lower',kind:'film',imdbId:'tt1111111',title:'Lower',watchStatus:'completed',ratings:{imdb:'6.1'}},
    {id:'missing',kind:'film',imdbId:'tt2222222',title:'Unrated',watchStatus:'completed'},
    {id:'higher',kind:'film',imdbId:'tt3333333',title:'Higher',watchStatus:'completed',ratings:{imdb:'8.7'}}];
  registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,catalogStore:()=>({list:()=>items})});
  const result=await handler({}, {action:'list',view:'watched',mode:'imdbRating'});
  assert.deepEqual(result.rows.map(r=>r.title),['Higher','Lower','Unrated']);
  assert.equal(items[0].title,'Lower','sorting must not mutate the store order');
});


test('discovery exposes the stable local collection target separately from provider presentation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-local-target-'));try{
  const catalog=createMediaCatalogStore({filePath:path.join(dir,'catalog.json')}),local=catalog.upsert({kind:'film',imdbId:'tt1234567',title:'Yerel Türkçe ad',year:2001}),handlers=new Map();
  registerMediaDiscovery({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,catalogStore:()=>catalog,fetchImpl:async()=>new Response(JSON.stringify({meta:{id:'tt1234567',name:'Provider Original Title',releaseInfo:'2001'}}))});
  const r=await handlers.get('media-discovery:request')({}, {action:'detail',kind:'film',id:'tt1234567'});
  assert.equal(r.ok,true);assert.equal(r.item.title,'Provider Original Title');assert.equal(r.catalogTarget.id,local.id);assert.equal(r.catalogTarget.title,'Yerel Türkçe ad');assert.equal(r.catalogTarget.signature,JSON.stringify([local.id,'film','tt1234567','Yerel Türkçe ad',2001]));assert.equal(catalog.list()[0].title,'Yerel Türkçe ad');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('R846-06 discovery projects current playback over older manual resume for the exact saved series',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-progress-'));
 try{const catalog=createMediaCatalogStore({filePath:path.join(dir,'media-catalog.json')}),series=catalog.upsert({kind:'series',title:'Current series',imdbId:'tt4444444',episodes:[{id:'old',season:1,number:1},{id:'live',season:2,number:4,source:{type:'browser',value:'https://example.test/live'}}],manualResume:{episodeId:'old',positionSeconds:120,updatedAt:1000}});
 fs.writeFileSync(path.join(dir,'watch-library.json'),JSON.stringify([{key:series.episodes.find(e=>e.id==='live').source.watchKey,position:900,lastWatched:4000,completed:false}]));
 let handler;registerMediaDiscovery({ipcMain:{handle:(_n,fn)=>handler=fn},authorized:()=>true,userData:()=>dir,catalogStore:()=>catalog,fetchImpl:async()=>new Response(JSON.stringify({meta:{id:series.imdbId,name:series.title}}))});
 const result=await handler({}, {action:'detail',kind:'series',id:series.imdbId});assert.equal(result.ok,true,result.error);assert.equal(result.item.personalMedia.effectiveResume.episodeId,'live');assert.equal(result.item.personalMedia.effectiveResume.positionSeconds,900);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
