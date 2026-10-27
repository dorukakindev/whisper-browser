'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),summary=require('../src/translation-review-summary');
test('Meaning and coverage flags prevent a layout-only clean verdict without inventing acoustic quality',()=>{
 const r=summary.summarize({translation_blocks:10,translation_failed:2,translation_number_mismatch_indices:[0,0,-1,'2'],translation_negation_mismatch_indices:[4]},[6]);
 assert(r.needsReview);assert.equal(r.ready,8);assert.equal(r.failed,2);assert.deepEqual(r.rows,[0,4,6]);assert.equal(r.layout,0);assert.equal(r.groups.length,3);
 assert.equal(summary.summarize({translation_blocks:2}).needsReview,false);assert.equal(summary.summarize({translation_issues:1}).needsReview,true);
 assert.equal(summary.summarize({translation_blocks:2,translation_failed:999}).failed,2);
});
test('Result modal shows numbered meaning failures and partial translation in both languages',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8'),start=source.indexOf('  const qr = state.lastQualityReport;',source.indexOf('function showResultModal(')),end=source.indexOf('  const filesEl =',start);assert(start>0&&end>start);
 for(const locale of ['en','tr']){const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8')),el=id=>dom.window.document.getElementById(id),ctx={state:{lastQualityReport:{blocks:10,translation_blocks:10,translation_failed:2,translation_issues:2,translation_number_mismatch_indices:[0],translation_negation_mismatch_indices:[4]},speechCoverageIndices:[6]},window:{TranslationReviewSummary:summary},document:dom.window.document,$:el,interfaceChoice:(tr,en)=>locale==='tr'?tr:en};
 try{vm.runInNewContext(source.slice(start,end),ctx);assert(el('qualityVerdict').classList.contains('needs-review'));assert(!el('modalTranslationReview').classList.contains('hidden'));assert.match(el('modalTranslationReview').textContent,/8\/10/);assert.match(el('modalTranslationReview').textContent,locale==='tr'?/Olumlu\/olumsuz/:/Negation/);assert.match(el('modalTranslationReview').textContent,/1/);assert.match(el('modalTranslationReview').textContent,/5/);assert.match(el('modalTranslationReview').textContent,/7/);}finally{dom.window.close();}}
});
