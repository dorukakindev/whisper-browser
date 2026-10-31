'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {speechResult,recipe}=require('../src/renderer/dub-run-info');
const output=states=>({url:'fixture.wav',settings:{speechSourceStatus:'available'},quality:{groups:states.map(natural=>({speechEditing:{natural}}))}});
test('missing original text reports preserved Turkish without claiming source editing',()=>{
 const missing={...output([]),settings:{speechSourceStatus:'unavailable',speechSourceGroups:0,deliveryAutomatic:true,deliveryApplied:2}};
 assert.equal(speechResult(missing,false),'Kaynak metin eşleştirilemedi; mevcut Türkçe metin korundu.');
 assert.match(speechResult(missing,true),/could not be matched/);
 assert.equal(speechResult(output(['source_unavailable']),false),speechResult(missing,false));
});
test('source review, unchanged and editing failure are distinct saved facts',()=>{
 const reviewed=output(['source_reviewed','unchanged']);assert.match(speechResult(reviewed,false),/kaynak anlamı denetlenerek/);
 assert.match(Object.fromEntries(recipe(reviewed,true))['Speech editing'],/1 source-reviewed · 1 unchanged/);
 assert.equal(speechResult(output(['unchanged']),true),'');assert.equal(speechResult({url:'old.wav'},true),'');
 assert.match(speechResult(output(['editor_failed']),true),/preserved/);
 assert.equal(speechResult(null,true),'');
});
