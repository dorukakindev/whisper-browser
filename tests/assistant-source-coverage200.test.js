'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceText}=require('../src/assistant-context-manifest');

test('coverage describes delivered context without claiming the whole source was read',()=>{
 const value=sourceText({chapterText:'One chapter.',chapterTextComplete:true});
 assert.deepEqual(value.sourceCoverage,{scope:'provided_context',status:'provided_only',wholeSourceVerified:false,upstreamOmissionsUnknown:false,providedCharacters:12,includedCharacters:12,omittedCharacters:0,providedUnits:1,includedUnits:1,omittedUnits:0});
 assert.equal(value.chapterTextComplete,true);
});

test('clipped page rows and text expose actual omitted characters and units',()=>{
 const value=sourceText({page:{blocks:Array.from({length:42},(_,i)=>({id:'S'+i,text:'x'.repeat(450)}))}},40000);
 assert.equal(value.sourceCoverage.providedCharacters,42*450);
 assert.equal(value.sourceCoverage.includedCharacters,40*400);
 assert.equal(value.sourceCoverage.omittedCharacters,42*450-40*400);
 assert.equal(value.sourceCoverage.omittedUnits,2);
 assert.equal(value.sourceCoverage.status,'partial');
 assert.equal(value.page.truncated,true);
});

test('neighbour and target clipping cannot silently look complete',()=>{
 const value=sourceText({onceki:Array.from({length:10},()=>({metin:'a'.repeat(1500)})),hedef:{metin:'b'.repeat(1300)}});
 assert.equal(value.sourceTruncated,true);
 assert.equal(value.sourceCoverage.providedCharacters,16300);
 assert.equal(value.sourceCoverage.includedCharacters,10800);
 assert.equal(value.sourceCoverage.omittedUnits,2);
});

test('the final serialized budget and repeated normalization retain the original denominator',()=>{
 const original={chapterText:'c'.repeat(25000),chapterTextComplete:true,page:{blocks:Array.from({length:20},(_,i)=>({id:'S'+i,text:'p'.repeat(400)}))},evidence:[{id:'U1',text:'e'.repeat(600),translation:'t'.repeat(600)}]};
 const first=sourceText(original,6000),second=sourceText(first,3000);
 for(const [value,budget] of [[first,6000],[second,3000]]){
  assert(JSON.stringify(value).length<=budget);
  assert.equal(value.sourceCoverage.providedCharacters,34200);
  assert.equal(value.sourceCoverage.providedUnits,22);
  assert.equal(value.sourceCoverage.includedCharacters+value.sourceCoverage.omittedCharacters,34200);
  assert.equal(value.sourceCoverage.status,'partial');
  assert.equal(value.sourceCoverage.upstreamOmissionsUnknown,false);
  assert.equal(value.chapterTextComplete,false);
 }
 assert(second.sourceCoverage.includedCharacters<first.sourceCoverage.includedCharacters);
});

test('upstream clipping remains partial even when its missing size is unknown',()=>{
 const first=sourceText({excerpt:'Known excerpt',truncated:true}),second=sourceText(first);
 assert.equal(second.sourceCoverage.status,'partial');
 assert.equal(second.sourceCoverage.upstreamOmissionsUnknown,true);
 assert.equal(second.sourceCoverage.omittedCharacters,0);
 assert.equal(second.sourceCoverage.wholeSourceVerified,false);
});

test('untrusted coverage claims cannot understate the supplied text or enter private fields',()=>{
 const value=sourceText({excerpt:'abcdef',sourceCoverage:{status:'complete',providedCharacters:1,providedUnits:-1,wholeSourceVerified:true,apiKey:'secret'}});
 assert.equal(value.sourceCoverage.providedCharacters,6);
 assert.equal(value.sourceCoverage.providedUnits,1);
 assert.equal(value.sourceCoverage.status,'provided_only');
 assert.equal(value.sourceCoverage.wholeSourceVerified,false);
 assert(!JSON.stringify(value).includes('secret'));
});

test('a small budget falls back to valid bounded partial context',()=>{
 const value=sourceText({excerpt:'a'.repeat(1000)},64);
 assert(JSON.stringify(value).length<=64);
 assert.equal(value.sourceTruncated,true);
});
