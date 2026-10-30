'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),registry=require('../src/assistant-capabilities'),manifest=require('../src/assistant-context-manifest');
test('tool parameter repair exposes schema hints without echoing rejected private values',()=>{
 const ctx={kind:'video',hasSubtitles:true};
 assert.throws(()=>registry.validate('start_whisper',{translate:'private-key'},ctx),error=>/Expected boolean/.test(error.message)&&/Geçersiz/.test(error.message)&&!error.message.includes('private-key'));
 assert.throws(()=>registry.validate('start_whisper',{'private-token':'secret'},ctx),error=>/Use only:/.test(error.message)&&!error.message.includes('private-token'));
 assert.throws(()=>registry.validate('open_settings',{section:'bad'},ctx),/ai.*general/);
});
test('source context reports bounded page read outcomes and never accepts arbitrary error text as a status',()=>{
 for(const state of ['available','empty','timeout','read_failed','source_changed','unavailable'])assert.equal(manifest.sourceText({pageReadStatus:state}).pageReadStatus,state);
 assert.equal(manifest.sourceText({pageReadStatus:'C:/private/key'}).pageReadStatus,undefined);
 assert.match(manifest.sourceText({pageReadStatus:'empty'}).pageReadHint,/select a passage/);
 assert.match(manifest.sourceText({pageReadStatus:'timeout'}).pageReadHint,/four seconds/);
});
