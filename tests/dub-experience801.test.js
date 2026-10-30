"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../src/renderer/dub-experience-model');
test('preflight is explicit about estimates and overlapping groups are never guessed',()=>{
 const p=M.preflight([{key:'x',text:'A very long sentence '.repeat(40),seconds:3}],{reference:{warnings:['quiet']}});assert.equal(p.dense,1);assert.equal(p.long,1);assert.deepEqual(p.referenceWarnings,['quiet']);
 assert.equal(M.locate([{key:'a',sourceStart:0,sourceEnd:2},{key:'b',sourceStart:2,sourceEnd:4}],2).key,'b');assert.equal(M.locate([{sourceStart:0,sourceEnd:3},{sourceStart:2,sourceEnd:4}],2.5),null);
});
test('translation comparison aligns all overlapping cues and reports changed numbers',()=>{
 assert.equal(M.overlap([{start:0,end:300,text:'Long'},{start:200,end:201,text:'Short'}],250,251),'Long');
 const diff=M.difference('Toplam 12 kişi geldi.','Toplam 2 kişi geldi.');assert(diff.changed);assert.deepEqual(diff.removedNumbers,['12']);assert.equal(diff.before,'12');assert.equal(diff.after,'2');
 assert.equal(M.overlap([{start:1,end:2,text:'A'},{start:2,end:3,text:'B'}],1,3),'A B');
});

test('continuity receipt ignores malformed or impossible acoustic fields',()=>{assert.equal(M.continuity({status:'measured',levelDb:NaN,wordsPerSecond:2,gainDb:0}),null);assert.equal(M.continuity({status:'measured',levelDb:-20,wordsPerSecond:2,gainDb:20}),null);assert.deepEqual(M.continuity({status:'measured',levelDb:-20,wordsPerSecond:2,gainDb:0,warnings:'forged'}).warnings,[]);});

test('saved workspace groups retain validated continuity across reopening',()=>{const G=require('../src/renderer/dub-workspace-model');const row={key:'1',text:'Test.',sourceStart:0,sourceEnd:1,audioStart:0,audioEnd:1,status:'ready',continuity:{status:'measured',levelDb:-20,wordsPerSecond:2,gainDb:1,warnings:['level-jump']}};const saved=G.groups([row])[0];assert.equal(saved.continuity.gainDb,1);assert.deepEqual(G.groups([saved])[0].continuity,saved.continuity);});
