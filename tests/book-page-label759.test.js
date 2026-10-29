const test=require('node:test'),assert=require('node:assert/strict'),{pageLabels}=require('../src/book-workflow-status');
test('Only a verified historical generated PDF heading gets one-language labels',()=>{
 assert.deepEqual(pageLabels({pageNumber:2,title:'Page / Sayfa 2'}),{en:'Page 2',tr:'Sayfa 2'});
 for(const c of [{pageNumber:2,title:'A custom chapter'},{pageNumber:2,title:'Page / Sayfa 3'},{title:'Page / Sayfa 2'},{pageNumber:0,title:'Page / Sayfa 0'},{pageNumber:'2',title:'Page / Sayfa 2'}])assert.equal(pageLabels(c),null);
});
