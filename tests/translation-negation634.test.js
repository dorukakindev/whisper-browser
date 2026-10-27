'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
test('Positive nominal obligations and before clauses survive while actual negative meanings remain gated',()=>{
 for(const [source,target] of [['I need to do it.','Bunu yapmam gerekiyor.'],['I need to call the office.','Ofisi aramam gerekiyor.'],['We need to do it.','Bunu yapmamız lazım.'],['Explain what we need to do before delivery arrives.','Teslimat gelmeden önce ne yapmamız gerektiğini açıklayın.'],['Come before the delivery arrives.','Teslimat gelmeden önce gel.']])assert(!issues(source,target,'tr').includes('negation_added'),target);
 for(const [source,target] of [['I can do it.','Yapmam.'],['I need to do it.','Bunu yapmam gerekmiyor.'],['Call before delivery arrives.','Teslimat gelmeden önce arama.']])assert(issues(source,target,'tr').includes('negation_added'),target);
 assert(issues('Do not call before delivery arrives.','Teslimat gelmeden önce ara.','tr').includes('negation_missing'));
});
