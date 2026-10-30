"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const timing=require('../src/scene-timing-tools');
test('audio silence suggestions preserve manual timing, text and existing speech; coarse data fails closed',()=>{
 const points=Array.from({length:100},(_,i)=>i>=10&&i<20||i>=40&&i<50?.001:.5);
 const silences=timing.silenceIntervals(points,{duration:5});assert.deepEqual(silences,[{start:.5,end:1},{start:2,end:2.5}]);
 const cues=[{start:1.1,end:1.9,text:'A sentence.'},{start:3,end:4,text:'Manual sentence.',timingLocked:true}],before=structuredClone(cues);
 const proposal=timing.proposeSilence(cues,{silences});assert.equal(proposal.changes.length,1);assert.equal(proposal.cues[0].start,1);assert.equal(proposal.cues[0].end,2);assert.deepEqual(proposal.cues[1],cues[1]);assert.deepEqual(cues,before);
 assert.equal(timing.propose(cues,{shots:[2.9]}).cues[1].start,3);
 assert.notEqual(timing.signature(cues),timing.signature(cues.map(c=>({...c,timingLocked:false}))));
 assert.deepEqual(timing.silenceIntervals(points,{duration:900}),[]);
 const collision=timing.proposeSilence([{start:.9,end:1.5,text:'First'},{start:1.6,end:2,text:'Second'}],{silences:[{start:1.7,end:1.8}]});assert.equal(collision.cues[0].end,1.5);
});
test('book search retains exact page and source-independent hit IDs across batches',async()=>{
 const search=require('../src/renderer/assistant-book-search');const r=await search.scan({total:43,start:41,query:'needle',getText:async page=>page===43?'The needle is here.':'Other text.'});
 assert.equal(r.matches[0].page,43);assert.equal(r.matches[0].id,'B43-0');assert.equal(r.complete,true);
});
