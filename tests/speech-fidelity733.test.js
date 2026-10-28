'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
test('possessive Turkish number inflections preserve quantities without broad prefix matching',()=>{
 for(const [source,target] of [['9 need a new test.','Dokuzunun yeni bir teste ihtiyacı var.'],['3 passed.','Üçünün geçtiği görüldü.'],['4 need a test.','Dördünün teste ihtiyacı var.']])assert(!issues(source,target,'tr','en').includes('number_mismatch'),target);
 for(const target of ['Sekizinin teste ihtiyacı var.','Doksanının teste ihtiyacı var.','Dokuz yüzünün teste ihtiyacı var.'])assert(issues('9 need a test.',target,'tr','en').includes('number_mismatch'),target);
});

test('24/7 availability may be spoken in Turkish order without masking changed ratios',()=>{
 assert(!issues('It is 24/7.','Yedi yirmi dört açık.','tr').includes('number_mismatch'));
 for(const [source,target] of [['It is 24/7.','Yedi yirmi üç açık.'],['The ratio is 24/8.','Yedi yirmi dört açık.']])assert(issues(source,target,'tr').includes('number_mismatch'));
});
