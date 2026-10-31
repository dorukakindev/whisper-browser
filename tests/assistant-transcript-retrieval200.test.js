'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildTranscriptEvidence}=require('../src/browser-transcript-search');
const manifest=require('../src/assistant-context-manifest');
const rows=()=>Array.from({length:30},(_,i)=>({start:i*10,end:i*10+3,text:i===29?'Intro punctuation!   '.repeat(280)+'İSTANBUL çığ':'Ordinary dialogue '+i}));

test('targeted transcript search retains a tail-only Unicode match with truthful original offsets',()=>{
 const cues=rows(),result=buildTranscriptEvidence(cues,'istanbul cig',{scope:'full',position:0,limit:6}),hit=result.evidence.find(row=>row.id==='T30');
 assert(hit,'the distant matching cue must outrank nearby nonmatches');
 assert.match(hit.metin,/İSTANBUL çığ/);
 assert(hit.textOffset>0);
 assert.equal(hit.metin,cues[29].text.slice(hit.textOffset,hit.textOffset+4000));
 assert.equal(hit.textTruncated,true);
 assert.equal(hit.baslangic,290);
 assert(result.evidence.length<=6);
 assert(hit.metin.length<=4000);
});

test('tail search also finds translated evidence without inventing source text',()=>{
 const cues=rows();cues[29].text='Original short line';cues[29].translation='Çeviri! '.repeat(750)+'eşsiz hedef';
 const hit=buildTranscriptEvidence(cues,'essiz hedef',{scope:'full',position:0,limit:6}).evidence.find(row=>row.id==='T30');
 assert.equal(hit.metin,'Original short line');
 assert.match(hit.ceviri,/eşsiz hedef/);
 assert.equal(hit.ceviri,cues[29].translation.slice(hit.translationOffset,hit.translationOffset+4000));
 assert.equal(hit.translationTruncated,true);
 assert.equal(hit.textTruncated,undefined);
});

test('retrieving tail matches preserves watched and nearby spoiler boundaries',()=>{
 const cues=rows();
 for(const scope of ['watched','nearby']){
  const result=buildTranscriptEvidence(cues,'istanbul cig',{scope,position:10,limit:6});
  assert(!result.evidence.some(row=>row.id==='T30'));
  assert(result.evidence.every(row=>scope==='watched'?row.baslangic<=10.75:Math.abs(row.baslangic-10)<=180));
 }
});

test('excerpt truncation remains explicit when evidence crosses source normalization',()=>{
 const transcript_evidence=buildTranscriptEvidence(rows(),'istanbul cig',{scope:'full',position:0,limit:6});
 const value=manifest.sourceText({transcript_evidence});
 assert.equal(value.sourceTruncated,true);
 assert.equal(value.sourceCoverage.upstreamOmissionsUnknown,true);
 assert.equal(value.sourceCoverage.status,'partial');
 const original=transcript_evidence.evidence.find(row=>row.id==='T30'),again=manifest.sourceText(value),retained=again.evidence.find(row=>row.id==='T30');
 assert.equal(retained.textOffset,original.textOffset);
 assert.equal(retained.textTruncated,true);
 assert.equal(again.sourceCoverage.upstreamOmissionsUnknown,true);
});


test('excerpt offsets address the original UTF-16 text across leading whitespace and Unicode',()=>{
 const original=' \n\t  '+('Punctuation!   '.repeat(400))+'\u0130STANBUL \u00e7\u0131\u011f  \n',result=buildTranscriptEvidence([{start:0,end:1,text:original}],'istanbul cig',{scope:'full',position:0});
 const hit=result.evidence[0];assert.match(hit.metin,/\u0130STANBUL \u00e7\u0131\u011f/);assert.equal(hit.metin,original.slice(hit.textOffset,hit.textOffset+hit.metin.length));
 const excerpt=require('../src/browser-transcript-search').transcriptExcerpt('  \u0130stanbul  ',['istanbul'],700);assert.equal(excerpt.offset,2);assert.equal(excerpt.text,'\u0130stanbul');assert.equal(excerpt.truncated,true);
});
