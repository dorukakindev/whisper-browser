'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
test('Negative nominal requests preserve not-to meaning without masking negative obligations',()=>{
 for(const [source,correct,reversed] of [['She asked her not to open it until Friday.',"Cuma'ya kadar açmamasını istedi.",'Açmasını istedi.'],['She asked me not to come.','Gelmememi istedi.','Gelmemi istedi.'],['We must not go.','Gitmememiz gerekiyor.','Gitmemiz gerekiyor.'],['They asked you not to do it.','Yapmamanızı istediler.','Yapmanızı istediler.']]){
  assert(!issues(source,correct,'tr').includes('negation_missing'),correct);
  assert(issues(source,reversed,'tr').includes('negation_missing'),reversed);
 }
});
test('Positive nominal obligations and before clauses survive while actual negative meanings remain gated',()=>{
 for(const [source,target] of [['I need to do it.','Bunu yapmam gerekiyor.'],['I need to call the office.','Ofisi aramam gerekiyor.'],['We need to do it.','Bunu yapmamız lazım.'],['Explain what we need to do before delivery arrives.','Teslimat gelmeden önce ne yapmamız gerektiğini açıklayın.'],['Come before the delivery arrives.','Teslimat gelmeden önce gel.']])assert(!issues(source,target,'tr').includes('negation_added'),target);
 for(const [source,target] of [['I can do it.','Yapmam.'],['I need to do it.','Bunu yapmam gerekmiyor.'],['Call before delivery arrives.','Teslimat gelmeden önce arama.']])assert(issues(source,target,'tr').includes('negation_added'),target);
 assert(issues('Do not call before delivery arrives.','Teslimat gelmeden önce ara.','tr').includes('negation_missing'));
});
