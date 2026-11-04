'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMediaCatalogStore}=require('../src/media-catalog-store');
const M=require('../src/media-source-mechanisms'),Q=require('../src/assistant-library-query');
const {createMetadataClient}=require('../src/catalog-discovery');
test('stored and assistant catalog conditions distinguish original language, production country and exact director identity',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-conditions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=createMediaCatalogStore({filePath:path.join(root,'catalog.json')});
 const first=store.upsert({id:'ja',kind:'film',title:'Japanese dialogue',originalLanguage:'ja',productionCountries:['JP'],directorIds:['tmdb:person:11'],directorPeople:[{id:'tmdb:person:11',name:'Director'}]});
 store.upsert({id:'en',kind:'film',title:'English dialogue',originalLanguage:'en',productionCountries:['JP'],directorIds:['tmdb:person:22']});
 store.upsert({id:'legacy',kind:'film',title:'Legacy named director',directors:['Director']});
 store.upsert({id:'partial',kind:'film',title:'Partial credits',originalLanguage:'ja',productionCountries:['JP'],directorIds:['tmdb:person:33'],directorsTruncated:true});
 const conditions={originalLanguages:['ja'],productionCountries:['JP'],directorIds:['tmdb:person:11']};
 const result=M.catalogConditions(store.list(),{conditions});assert.deepEqual(result.items.map(row=>row.id),['ja']);assert.equal(result.unknown,2);assert.equal(result.excluded,1);
 assert.deepEqual(M.filterCatalog(store.list(),{conditions:{productionCountries:['JP']}}).map(row=>row.id).sort(),['en','ja','partial']);
 assert.deepEqual(M.filterCatalog(store.list(),{conditions,conditionUnknown:'only'}).map(row=>row.id).sort(),['legacy','partial']);
 assert.equal(store.upsert({id:'ja',title:'Renamed'}).originalLanguage,first.originalLanguage);
 const reload=createMediaCatalogStore({filePath:path.join(root,'catalog.json')});assert.deepEqual(reload.get('ja').directorIds,['tmdb:person:11']);
 const filters={and:[{field:'original_language',op:'eq',value:'ja'},{field:'production_country',op:'eq',value:'JP'},{field:'director_id',op:'eq',value:'tmdb:person:11'}]};
 const query=Q.query(store.list(),{filters});assert.equal(query.total,1);assert.equal(query.unknown,2);assert.equal(query.items[0].item_id,'catalog:ja');
 assert.throws(()=>Q.query(store.list(),{filters:{and:[{field:'director_id',op:'eq',value:'Director'}]}}),/Invalid typed/);
 assert.throws(()=>store.upsert({id:'ja',productionCountries:['Japanese']}),/ISO/);
});
test('TMDB completion retains ISO countries and only Director crew identities',async()=>{
 const client=createMetadataClient(async()=>new Response(JSON.stringify({title:'Title',original_language:'en',production_countries:[{iso_3166_1:'JP',name:'Japan'}],credits:{crew:[{id:11,name:'Director',job:'Director'},{id:22,name:'Producer',job:'Producer'}]},created_by:[{id:33,name:'Creator'}]})),{language:()=> 'en-US'});
 const result=await client.detail({kind:'series'},1,'a'.repeat(40));
 assert.equal(result.patch.originalLanguage,'en');assert.deepEqual(result.patch.productionCountries,['JP']);assert.deepEqual(result.patch.directorIds,['tmdb:person:11']);assert.deepEqual(result.patch.directorPeople,[{id:'tmdb:person:11',name:'Director'}]);
});

test('catalog and assistant canonicalize ISO language aliases while undetermined stays unknown',()=>{
 const rows=[['turkish','tur'],['english','eng'],['french','fra'],['english2','en'],['unknown','und']].map(([id,originalLanguage])=>({id,title:id,kind:'film',originalLanguage}));
 for(const [selected,ids]of [['tr',['turkish']],['tur',['turkish']],['en',['english','english2']],['eng',['english','english2']],['fr',['french']],['fra',['french']]]){
  const source=M.catalogConditions(rows,{conditions:{originalLanguages:[selected]}});
  assert.deepEqual(source.items.map(row=>row.id).sort(),ids.sort());assert.equal(source.unknown,1);
  const assistant=Q.query(rows,{filters:{and:[{field:'original_language',op:'eq',value:selected}]}});
  assert.deepEqual(assistant.items.map(row=>row.item_id).sort(),ids.map(id=>'catalog:'+id).sort());assert.equal(assistant.unknown,1);
 }
 const normalized=Q.validate({filters:{and:[{field:'original_language',op:'in',value:['eng','en','fra','fr']}]}});
 assert.deepEqual(normalized.filters.and[0].value,['en','fr']);
 assert.throws(()=>Q.validate({filters:{and:[{field:'original_language',op:'eq',value:'und'}]}}),/Invalid typed/);
 assert.throws(()=>M.catalogConditions(rows,{conditions:{originalLanguages:['und']}}),/Invalid catalog/);
 const all=Q.query(rows);assert.equal('original_language' in all.items.find(row=>row.item_id==='catalog:unknown'),false);
});

test('catalog UI offers canonical language options once and keeps undetermined metadata explicit',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<button id="mediaCatalogOpen"></button><dialog id="mediaCatalogDialog"><div id="mediaCatalogRoot"></div></dialog>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const rows=[['turkish','tur'],['english','eng'],['english2','en'],['french','fra'],['unknown','und']].map(([id,originalLanguage])=>({id,title:id,kind:'film',originalLanguage}));
 rows[0].posterImage='data:image/avif;base64,AAAA';rows[1].posterImage='data:image/svg+xml;base64,AAAA';
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.WhisperTextFold={search:value=>String(value).toLowerCase()};w.UiLocale={get:()=> 'en'};
 const dialog=w.document.getElementById('mediaCatalogDialog');dialog.showModal=()=>{dialog.open=true;};
 w.api={mediaCatalog:async()=>({ok:true,items:rows})};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/player-ui-kit'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/catalog-conditions'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/media-catalog'),'utf8'));
 await w.MediaCatalogUI.open();
 assert.equal(w.document.activeElement,dialog,'initial focus belongs to the dialog rather than Close');
 assert.equal(w.document.querySelector('.mc-card-poster img')?.getAttribute('src'),'data:image/avif;base64,AAAA','bounded AVIF raster data from the main service is accepted');assert.equal(w.document.querySelectorAll('.mc-card-poster img').length,1,'SVG remains outside the raster allowlist');
 const select=w.document.querySelector('.mc-condition-grid select');assert.deepEqual([...select.options].map(option=>option.value),['','en','fr','tr']);
 select.value='en';select.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.mc-card').length,2);
 const policy=w.document.querySelectorAll('.mc-condition-grid select')[3];policy.value='include';policy.dispatchEvent(new w.Event('change'));
 assert.equal(w.document.querySelectorAll('.mc-card').length,3);assert.equal(w.document.querySelectorAll('.mc-condition-unknown').length,1);
 assert.equal(w.document.querySelector('.mc-filter-summary').getAttribute('aria-expanded'),'false');
 assert.equal(select.hidden,true,'native value adapter stays hidden behind the custom picker');
 w.document.querySelector('.mc-filter-summary').click();assert.equal(w.document.querySelector('.mc-filter-summary').getAttribute('aria-expanded'),'true');
 assert.equal(w.document.querySelectorAll('.mc-condition-grid .mk-picker').length,5,'all filter selection owners have custom controls');
});
