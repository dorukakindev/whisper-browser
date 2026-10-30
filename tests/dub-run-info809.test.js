'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {recipe,counts}=require('../src/renderer/dub-run-info'),{inspectVoiceOutput}=require('../src/voice-output');
test('WAV facts come from validated frames; reading never modifies source bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wav-info809-'));
 try {const file=path.join(root,'Türkçe.wav'),bytes=require('./helpers/wav-fixture')(24000);fs.writeFileSync(file,bytes);const info=inspectVoiceOutput(file);assert.equal(info.seconds,1);assert.equal(info.channels,1);assert.equal(info.sampleRate,24000);assert.equal(info.bits,16);assert.deepEqual(fs.readFileSync(file),bytes);
  const stereo=Buffer.from(bytes);stereo.writeUInt16LE(2,22);stereo.writeUInt32LE(96000,28);stereo.writeUInt16LE(4,32);fs.writeFileSync(file,stereo);assert.equal(inspectVoiceOutput(file).seconds,.5);assert.equal(inspectVoiceOutput(file).channels,2);
  fs.writeFileSync(file,stereo.subarray(0,100));assert.equal(inspectVoiceOutput(file),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('cache counts preserve zero and unknown without claiming work that never ran',()=>{
 assert.equal(counts({cached_groups:3,generated_groups:0},true),'From cache: 3 · Newly generated: 0');
 assert.equal(counts(null,true),'');assert.equal(counts({cached_groups:-1,generated_groups:Infinity},true),'');
 assert.equal(counts({cached_groups:3},false),'Önbellekten: 3');
});
test('saved recipe uses only that output and keeps old missing facts unknown',()=>{
 const output={url:'fixture',name:'take.wav',subtitle:'C:\\input\\Kaynak.srt',settings:{referenceName:'C:\\private\\voice.wav',steps:15,grouping:'akici',verification:'detailed',timingMode:'video',range:{start:5,end:65}},metrics:{cached_groups:3,generated_groups:0}};
 const en=Object.fromEntries(recipe(output,true));assert.equal(en.Reference,'voice.wav');assert.equal(en.Subtitle,'Kaynak.srt');assert.equal(en.Scope,'0:05 → 1:05');assert.equal(en.Grouping,'Flowing blocks');assert.match(en.Groups,/Newly generated: 0/);
 assert.equal(Object.fromEntries(recipe({...output,settings:null},true)).Settings,'No saved production settings');assert.equal(Object.fromEntries(recipe({...output,sample:true},true)).Scope,'Short sample');assert.deepEqual(recipe(null,true),[]);
 assert(!JSON.stringify(en).includes('private'));assert.equal(Object.fromEntries(recipe(output,false)).Gruplama,'Akıcı bloklar');
});
