'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const registry=require('../src/assistant-capabilities'),manifest=require('../src/assistant-context-manifest');
test('Tools depend on real source availability; video actions do not require captured subtitles',()=>{
 const names=context=>registry.definitions(context).map(row=>row.function.name);
 assert(names({kind:'video',hasSubtitles:false}).includes('start_whisper'));
 assert(!names({kind:'video',hasSubtitles:false}).includes('seek_to_time'));
 assert(names({kind:'book',hasSubtitles:false}).includes('get_source_context'));
 assert(!names({kind:'book',hasSubtitles:false}).includes('start_whisper'));
 assert(names({kind:'page'}).includes('translate_page'));
 assert.equal(new Set(registry.list({kind:'video',hasSubtitles:true}).map(row=>row.name)).size,29);
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
