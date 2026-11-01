"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../src/renderer/dub-experience-model');
test('reading cues describe sentence length without changing speech text or rating quality',()=>{
 const text='Bu yüzden…';assert.deepEqual(M.readability(text),{words:2,longestSentence:2,long:false,fragment:true});assert.equal(text,'Bu yüzden…');
 assert.equal(M.readability(' ').words,0);assert.equal(M.readability('Bir. İki üç.').longestSentence,2);assert.equal(M.readability('sözcük '.repeat(36)).long,true);
});
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

test('preflight exposes empty edits, damaged characters and conservative language clues without rewriting',()=>{
 const source=[{key:'empty',text:'Original text.',seconds:3},{key:'broken',text:'Bozuk \uFFFD metin.',seconds:3},{key:'english',text:'This is the story which they would have told with their own words.',seconds:8},{key:'quote',text:'The End',seconds:2},{key:'turkish',text:'Bu kitapta the ve which sözcüklerini bağlamıyla ele alıyoruz.',seconds:5}];
 const p=M.preflight(source,{edits:{empty:''},reference:{seconds:10,warnings:['downmix-cancellation','unknown']}});
 assert.equal(p.rows[0].text,'');assert.deepEqual(p.rows[0].issues,['empty']);assert.deepEqual(p.rows[1].issues,['damaged-text']);assert.deepEqual(p.rows[2].issues,['possible-source-language']);assert.deepEqual(p.rows[3].issues,[]);assert.deepEqual(p.rows[4].issues,[]);assert.equal(p.flagged,3);assert.deepEqual(p.referenceWarnings,['downmix-cancellation']);assert.equal(source[0].text,'Original text.');
 assert.deepEqual(M.preflight(source,{targetLanguage:'en'}).rows[2].issues,[]);
});
test('pronunciation candidates require repeated separate groups and exclude saved mappings and common words',()=>{
 const groups=[{key:'a',text:'Bu anlatıda Newton ve Thomas konuşuyor. Newton, Newton!',seconds:4},{key:'b',text:'Bu kez Newton ile Thomas tekrar buluşuyor. TekAd.',seconds:4}];
 assert.deepEqual(M.preflight(groups).pronunciations,[{term:'Newton',count:4},{term:'Thomas',count:2}]);
 assert.deepEqual(M.preflight(groups,{pronunciations:[{from:'Newton',to:'Nyutın'}]}).pronunciations,[{term:'Thomas',count:2}]);
 assert.deepEqual(M.preflight([{key:'a',text:'Newton Newton.',seconds:2}]).pronunciations,[]);
});
