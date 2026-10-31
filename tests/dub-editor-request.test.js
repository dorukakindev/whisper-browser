'use strict';
const assert=require('node:assert/strict');
const {editorMessages}=require('../src/dub-editor-request');
const source='Bu görüşün doğru olduğunu söyleyemeyiz; sonuç henüz kesin değil.';
const messages=editorMessages(source,1,{mode:'natural',measured:20,before:'Önceki.',after:'Sonraki.'});
const natural=JSON.parse(messages[1].content);
assert.equal(natural.text,source);
for(const key of ['seconds','measuredSeconds','suggestedMaxWords']) assert(!(key in natural));
assert.equal(natural.context_before,'Önceki.');
assert(messages[0].content.includes('telgraf dili kullanma'));
assert(messages[0].content.includes('zaten doğalsa aynen'));
const fit=JSON.parse(editorMessages(source,2,{measured:4})[1].content);
assert.equal(fit.seconds,2); assert.equal(fit.measuredSeconds,4);
assert(fit.suggestedMaxWords>0);
assert.equal(JSON.parse(editorMessages('x',1,{mode:'natural',before:'a'.repeat(5000)})[1].content).context_before.length,1500);
console.log('dub-editor-request: natural editing has no duration quota; explicit fitting retains it');

assert.match(natural.delivery_contract,/anlamlı tekrarlar/);
assert.match(messages[0].content,/anlamlı tekrarlar/);
assert(!('delivery_contract' in fit));

const {editorFailureCode}=require('../src/dub-editor-request');
assert.equal(editorFailureCode({reason:'meaning_guard',message:'private text'}),'meaning_guard');
assert.equal(editorFailureCode({reason:'secret-token',message:'private text'}),'unavailable');
assert.equal(editorFailureCode({name:'TimeoutError'}),'timeout');

const {semanticReviewMessages,semanticReviewAccepted}=require('../src/dub-editor-request');
const sourceContext={original:'I gave her the book.',originalBefore:'She was waiting.',originalAfter:'Then I left.',
  terminology:'book = kitap',roles:'speaker: Ali; listener: Ayşe',speaker:'Ali'};
const grounded=editorMessages('Kitabı ona verdim.',3,{mode:'natural',...sourceContext});
const groundedPayload=JSON.parse(grounded[1].content);
assert.equal(groundedPayload.original,sourceContext.original);
assert.equal(groundedPayload.original_after,'Then I left.');
assert.equal(groundedPayload.roles,sourceContext.roles);
assert.match(grounded[0].content,/yerli bir konuşmacı/);
const review=semanticReviewMessages('Kitabı ona verdim.','Kitabı ondan aldım.',sourceContext);
assert.match(review[0].content,/özne\/nesne/);
assert.equal(JSON.parse(review[1].content).proposed,'Kitabı ondan aldım.');
assert.equal(semanticReviewAccepted('{"equivalent":true,"reason":"ok"}'),true);
for(const raw of ['true','{"equivalent":"true","reason":"ok"}','{"equivalent":true,"reason":"uncertain"}',
  '{"equivalent":false,"reason":"meaning_change"}','```json\n{"equivalent":true,"reason":"ok"}\n```']) assert.equal(semanticReviewAccepted(raw),false);
assert.throws(()=>semanticReviewMessages('Türkçe','Başka Türkçe'),/evidence/);
