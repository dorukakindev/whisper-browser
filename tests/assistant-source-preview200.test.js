'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),preview=require('../src/assistant-source-preview');
test('caption question scope and new production range are separate before sending',()=>{
 const row=preview.build({locale:'tr',video:true,page:true,transcript:true,position:90,scope:'watched',sourceLanguage:'en',targetLanguage:'tr',range:{start:300,end:600}});
 assert.match(row.summary,/İzlenen altyazılar · 0:00–1:30 · en → tr/);
 assert.match(row.detail,/5:00–10:00/);assert.match(row.detail,/sorunun altyazı kapsamından ayrıdır/);
 assert(!row.summary.includes('5:00'));
});
test('full scope never promises all rows were read and local nearby scope is bounded',()=>{
 assert.match(preview.build({transcript:true,scope:'full'}).detail,/does not mean every line is sent/);
 assert.match(preview.build({locale:'tr',transcript:true,position:3661,scope:'nearby'}).summary,/58:01–1:04:01/);
});
test('book passage preview preserves current chapter without claiming whole-book context',()=>{
 const row=preview.build({locale:'tr',selection:{type:'book-page',chapter:'Sayfa 12',selectedText:'Bir pasaj'}});
 assert.equal(row.summary,'Kitap · Sayfa 12 · Seçili pasaj');assert.match(row.detail,/diğer sayfalar/);
});
test('metadata and uncaptioned page previews never invent video content',()=>{
 assert.match(preview.build({selection:{type:'discovery-title'}}).summary,/Provided metadata/);
 assert.match(preview.build({page:true}).summary,/Current web page/);
 assert.match(preview.build({locale:'tr'}).summary,/Ekli metin kaynağı yok/);
});
