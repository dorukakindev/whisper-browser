'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
test('possessive Turkish number inflections preserve quantities without broad prefix matching',()=>{
 for(const [source,target] of [['9 need a new test.','Dokuzunun yeni bir teste ihtiyacı var.'],['3 passed.','Üçünün geçtiği görüldü.'],['4 need a test.','Dördünün teste ihtiyacı var.']])assert(!issues(source,target,'tr','en').includes('number_mismatch'),target);
 for(const target of ['Sekizinin teste ihtiyacı var.','Doksanının teste ihtiyacı var.','Dokuz yüzünün teste ihtiyacı var.'])assert(issues('9 need a test.',target,'tr','en').includes('number_mismatch'),target);
});
