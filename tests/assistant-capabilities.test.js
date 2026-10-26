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
 assert.equal(new Set(registry.list({kind:'video',hasSubtitles:true}).map(row=>row.name)).size,14);
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
