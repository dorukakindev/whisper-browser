'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const registry=require('../src/assistant-capabilities'),manifest=require('../src/assistant-context-manifest');

test('Source truncation and subtitle evidence survive renderer/main double normalization',()=>{
 const once=manifest.sourceText({page:{blocks:[{id:'S1',text:'x'.repeat(450)},null]},transcript_evidence:{evidence:[{id:'U1',start:4,text:'Real excerpt'}]}});
 assert(once.sourceTruncated);assert(once.page.truncated);assert.equal(once.page.blocks.length,1);
 const twice=manifest.sourceText(once);assert(twice.sourceTruncated);assert(twice.page.truncated);assert.equal(twice.evidence[0].text,'Real excerpt');
 assert(manifest.sourceText({page:{blocks:Array(41).fill({text:'short'})}}).page.truncated);
 assert(!manifest.sourceText({page:{blocks:[{text:'short'}]}}).sourceTruncated);
 assert(manifest.sourceText({assistant_tools:{rows:Array(3101).fill({text:'short'})}}).sourceTruncated);
 assert(manifest.sourceText({assistant_tools:{rows:[{text:'x'.repeat(701)}]}}).sourceTruncated);
 assert(manifest.sourceText({truncated:true,excerpt:'Part of a PDF page'}).sourceTruncated);
});
test('Tools depend on real source availability; video actions do not require captured subtitles',()=>{
 const names=context=>registry.definitions(context).map(row=>row.function.name);
 assert(names({kind:'video',hasSubtitles:false}).includes('start_whisper'));
 assert(!names({kind:'video',hasSubtitles:false}).includes('seek_to_time'));
 assert(names({kind:'book',hasSubtitles:false}).includes('get_source_context'));
 assert(!names({kind:'book',hasSubtitles:false}).includes('start_whisper'));
 assert(names({kind:'page'}).includes('translate_page'));
 const videoTools=registry.list({kind:'video',hasSubtitles:true});assert.equal(new Set(videoTools.map(row=>row.name)).size,videoTools.length);
 for(const name of ['search_library','discover_titles','get_taste_profile','get_title_details','load_title_reviews'])assert(videoTools.some(row=>row.name===name));
 assert(!videoTools.some(row=>row.name==='apply_library_collection'));
 for(const name of ['get_workflow_settings','configure_workflow','undo_workflow_settings'])assert(names({kind:'video'}).includes(name));
});
test('Arguments reject unknown actions, secret fields, wrong types and partial ranges',()=>{
 for(const [name,args] of [['shell',{command:'anything'}],['start_whisper',{translate:'true'}],['start_whisper',{translate:true,start:3}],['start_whisper',{translate:true,start:10,end:2}],['open_settings',{section:'ai',apiKey:'never'}],['translate_page',{target_language:'../bad'}]])assert.throws(()=>registry.validate(name,args,{kind:'video',hasSubtitles:true}));
 assert.deepEqual(registry.validate('start_whisper',{translate:false,start:1,end:4},{kind:'video'}),{translate:false,start:1,end:4});
 assert.throws(()=>registry.validate('start_whisper',{translate:false},{kind:'book'}));
});
test('Manifest drops private fields and bounds source material without producing invalid JSON',()=>{
 const raw={kind:'video',owner:'private-local-media-key',thread:'t',tabId:'tab',generation:7,hasSubtitles:true,apiKey:'secret',tracks:[{id:'A',role:'source',path:'private.wav',language:'en'}]};
 const publicValue=manifest.publicContext(raw);assert(!JSON.stringify(publicValue).includes('private'));assert(!JSON.stringify(publicValue).includes('secret'));assert.equal(publicValue.tracks[0].path,undefined);
 const text=manifest.sourceText({apiKey:'secret',settings:{token:'secret'},chapterText:'a'.repeat(60000),excerpt:'b'.repeat(8000),page:{blocks:Array.from({length:100},(_,id)=>({id:'S'+id,text:'c'.repeat(1000)}))}},10000);
 assert(JSON.stringify(text).length<=10000);assert(!JSON.stringify(text).includes('secret'));assert.doesNotThrow(()=>JSON.parse(JSON.stringify(text)));
 const a=manifest.clean(raw);assert(manifest.same(a,manifest.clean(raw)));assert(!manifest.same(a,manifest.clean({...raw,generation:8})));
});


test('Book tools are source-bound and accept only integer ordered page/chapter ranges',()=>{
 const names=registry.list({kind:'book'}).map(row=>row.name);assert(names.includes('prepare_book_narration'));assert(names.includes('export_book_audio'));assert(!registry.list({kind:'video'}).some(row=>row.domain==='book'));
 for(const args of [{from:1.5,to:2},{from:3,to:2},{from:0,to:1},{from:1,to:2,path:'private'}])assert.throws(()=>registry.validate('prepare_book_narration',args,{kind:'book'}));
 assert.deepEqual(registry.validate('prepare_book_narration',{from:2,to:5,text:'translation'},{kind:'book'}),{from:2,to:5,text:'translation'});
 assert(!registry.list({kind:'book'}).some(row=>/approve/.test(row.name)));
});

test('Review count accepts bounded integers and rejects decimals booleans and strings',()=>{for(const name of ['analyze_title_reviews','load_title_reviews']){const base={item_id:'discovery:film:tt0112471',...(name==='load_title_reviews'?{source:'automatic'}:{})};for(const count of [1,10,30,48])assert.doesNotThrow(()=>registry.validate(name,{...base,count},{kind:'library'}));for(const count of [0,49,1.5,NaN,Infinity,true,'30'])assert.throws(()=>registry.validate(name,{...base,count},{kind:'library'}),/count/);}});


test('Taste tools separate read-only constraints from explicit reviewed global changes',()=>{
 const owner={kind:'video'};
 assert.equal(registry.get('recommend_from_taste').policy,'read');assert.equal(registry.get('update_taste_preferences').policy,'proposal');
 assert.deepEqual(registry.validate('recommend_from_taste',{kind:'film',max_duration_minutes:90,exploration:true,limit:2},owner),{kind:'film',max_duration_minutes:90,exploration:true,limit:2});
 for(const args of [{exploration:.5},{limit:13},{kind:'unknown'},{max_duration_minutes:0}])assert.throws(()=>registry.validate('recommend_from_taste',args,owner));
 for(const args of [{},{story:6},{avoid:['mood']},{avoid:['pace','pace']},{atmosphere:3},{note:'x'.repeat(2001)}])assert.throws(()=>registry.validate('update_taste_preferences',args,owner));
 assert.deepEqual(registry.validate('update_taste_preferences',{story:0,avoid:[],note:''},owner),{story:0,avoid:[],note:''});
});
