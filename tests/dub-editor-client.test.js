'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {editSpeech}=require('../src/dub-editor-client');
const original='This is not impossible. We just need more evidence.';
function fixture(replies){const calls=[];return {calls,options:{config:{model:'fixture',apiKey:'private-fixture'},endpoint:'https://provider.invalid/v1/chat/completions',
  fetch:async(url,request)=>{calls.push(JSON.parse(request.body));const reply=replies.shift();if(reply instanceof Error)throw reply;return {ok:reply.status===undefined||reply.status===200,status:reply.status||200,data:reply};},
  readBuffer:async response=>Buffer.from(JSON.stringify({choices:[{finish_reason:response.data.finish||'stop',message:{content:response.data.text}}]})),
  requestOptions:{service_tier:'flex'}}};}
const text='Bu imkânsız değil. Sadece daha fazla kanıta ihtiyacımız var.';
const proposed='Bu imkânsız değil. Sadece daha fazla kanıt gerekiyor.';
const context={mode:'natural',original,originalBefore:'An earlier claim.',originalAfter:'We can test it.'};
test('source-bound changed script requires a second strict meaning verdict',async()=>{
 const f=fixture([{text:proposed},{text:'{"equivalent":true,"reason":"ok"}'}]);
 assert.equal(await editSpeech({...f.options,text,seconds:5,context}),proposed);
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].service_tier,'flex');
 assert.equal(JSON.parse(f.calls[1].messages[1].content).original,original);
 assert.equal(JSON.parse(f.calls[1].messages[1].content).proposed,proposed);
});
for(const verdict of ['{"equivalent":false,"reason":"meaning_change"}','{"equivalent":true,"reason":"uncertain"}','looks good'])
 test('uncertain/changed source meaning cannot become accepted speech: '+verdict,async()=>{
  const f=fixture([{text:proposed},{text:verdict}]);
  await assert.rejects(editSpeech({...f.options,text,seconds:5,context}),e=>e.reason==='meaning_guard');
 });
test('unchanged script avoids a redundant provider request',async()=>{
 const f=fixture([{text}]);assert.equal(await editSpeech({...f.options,text,seconds:5,context}),text);assert.equal(f.calls.length,1);
});
test('ordinary translation editing does not opt into flex without an explicit tier',async()=>{
 const f=fixture([{text}]);delete f.options.requestOptions;
 assert.equal(await editSpeech({...f.options,text,seconds:5,context}),text);
 assert.equal(Object.hasOwn(f.calls[0],'service_tier'),false);
});
test('second request failure is surfaced for original-text fallback, never accepts first edit',async()=>{
 const f=fixture([{text:proposed},{status:429}]);await assert.rejects(editSpeech({...f.options,text,seconds:5,context}),e=>e.reason==='rate_limit');
});
test('existing numeric/negation guard rejects before semantic request',async()=>{
 const f=fixture([{text:'Bu imkânsız. Sadece daha fazla kanıta ihtiyacımız var.'}]);
 await assert.rejects(editSpeech({...f.options,text,seconds:5,context}),e=>e.reason==='meaning_guard');assert.equal(f.calls.length,1);
});
