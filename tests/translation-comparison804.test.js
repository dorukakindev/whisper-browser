const test=require('node:test'),assert=require('node:assert/strict'),M=require('../src/renderer/dub-experience-model'),P=require('../src/dub-pronunciation');
test('indexed comparisons preserve long overlapping cues and meaningful filtered rows',()=>{
 const source=[{start:0,end:100,text:'Long context'},{start:12,end:14,text:'Short context'}],normal=[{start:0,end:2,text:'Same'},{start:12,end:14,text:'Total 12'}],speech=[{start:0,end:2,text:'Same'},{start:12,end:14,text:'Total 2'}];
 const before=JSON.stringify({source,normal,speech}),c=M.comparisonRows({source,normal,speech});assert.equal(c.rows.filter(r=>r.changed).length,1);assert.deepEqual(c.rows[1].missingNumbers,['12']);assert.equal(M.indexedOverlap(c.indexes.source,12,14).text,'Long context Short context');assert.equal(JSON.stringify({source,normal,speech}),before);
});
test('pathological overlaps and large inputs are bounded and never given a partial error verdict',()=>{
 const many=Array.from({length:5001},(_,i)=>({start:i,end:i+1,text:'Same'})),c=M.comparisonRows({source:many,normal:many,speech:many});assert.equal(c.rows.length,5000);assert(c.limited);assert.equal(M.indexedOverlap(c.indexes.normal,4999,5001).limited,true);assert.equal(M.indexedOverlap(c.indexes.normal,0,1).limited,false);
 const overlap=Array.from({length:70},()=>({start:0,end:100,text:'12'})),d=M.comparisonRows({normal:overlap,speech:[{start:1,end:2,text:'2'}]});assert(d.rows[0].limited);assert.equal(d.rows[0].changed,false);assert.deepEqual(d.rows[0].missingNumbers,[]);
});
test('saved pronunciation preview is case sensitive, unicode bounded and non-cascading',()=>{
 const entries=[{from:'Newton',to:'Nyutın'},{from:'Nyutın',to:'X'},{from:'A+B',to:'A artı B'},{from:'İl',to:'İlçe'}];assert.equal(P.apply('Newton Newtoncu newton A+B İl il',entries),'Nyutın Newtoncu newton A artı B İlçe il');assert.throws(()=>P.apply('word',[{from:'',to:'x'}]));
});
