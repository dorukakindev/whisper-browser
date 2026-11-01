'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {speechResult,recipe,verificationSummary}=require('../src/renderer/dub-run-info');
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

test('a source-reviewed group does not hide another group with no original evidence',()=>{
 const mixed=output(['source_reviewed','source_unavailable','unchanged']);
 assert.match(speechResult(mixed,true),/Some groups had no matching original text/);
 assert.match(speechResult(mixed,false),/Bazı gruplarda kaynak metin eşleştirilemedi/);
});

test('generated audio, text verification and human naturalness stay separate',()=>{
 const result=groups=>({url:'fixture.wav',quality:{groups}});
 assert.match(verificationSummary(result([{status:'ready',verification:{status:'passed'}}]),true),/Naturalness still needs listening/);
 assert.match(verificationSummary(result([{status:'ready',verification:{status:'passed'}}]),true),/against the supplied subtitles.*does not verify the original transcription/);
 assert.match(verificationSummary(result([{status:'ready',verification:{status:'passed'}}]),false),/altyazıya göre.*doğru çözümlendiğini kanıtlamaz/);
 assert.match(verificationSummary(result([{status:'ready',verification:{status:'skipped'}}]),true),/0 have a passed text check/);
 assert.match(verificationSummary(result([{status:'review',verification:{status:'passed'}}]),false),/dinleme kontrolü/);
 assert.match(verificationSummary(result([{status:'failed'}]),true),/may be silent/);
 assert.match(verificationSummary({url:'fixture.wav',qualityUnavailable:true},false),/doğrulama kaydı yok/);
 assert.equal(verificationSummary({url:'old.wav'},true),'');
 assert.equal(verificationSummary(null,true),'');
});
