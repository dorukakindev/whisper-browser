'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
const begin=source.indexOf('const CONT_MARKS ='),end=source.indexOf('function applyCueMerge()',begin);
function engine(){const context={$:()=>({value:'3'})};vm.runInNewContext(source.slice(begin,end),context);return context;}
for(const fixture of require('./fixtures/subtitle-continuation.json'))test(fixture.name,()=>{
 const cues=fixture.cues.map(([start,end,text],i)=>({start,end,text,...(fixture.speakers?{speaker:fixture.speakers[i]}:{})}));
 const original=JSON.stringify(cues),merged=engine().mergeCueContinuation(cues,fixture.gap??3);
 assert.deepEqual(JSON.parse(JSON.stringify(merged.map(c=>[c.start,c.end,c.text]))),fixture.expected);
 assert.equal(JSON.stringify(cues),original,'input text/times/metadata remain untouched');
});
test('bounded chains, malformed times and stale word highlights stay safe',()=>{
 const e=engine(),cues=Array.from({length:15},(_,i)=>({start:i*.2,end:i*.2+.15,text:'a'}));
 assert(e.mergeCueContinuation(cues).length>=2,'a chain cannot grow without a part limit');
 const bad=[{start:0,end:1,text:'I thought…'},{start:NaN,end:2,text:'...so.'}];
 assert.equal(e.mergeCueContinuation(bad).length,2);
 const merged=e.mergeCueContinuation([{start:0,end:1,text:'I thought…',wordRanges:[{start:0,end:1}]},{start:1.1,end:2,text:'...so.'}]);
 assert.equal(merged[0].wordRanges,undefined,'old character offsets cannot survive changed text');
});
test('display abbreviation vocabulary stays equal to the backend vocabulary',()=>{
 const e=engine();
 assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext('Array.from(CONT_ABBREVIATIONS)',e))),require('../backend/subtitle-abbreviations.json'));
});
test('merge summary distinguishes off, empty, merged and no-candidate states',()=>{
 const contextHelp={textContent:''};
 const ctx={$:()=>null,player:{mergeCont:false},interfaceChoice:(tr,en)=>en,document:{getElementById:id=>id==='translationContextPolicyHint'?contextHelp:null}};
 const a=source.indexOf('function sentenceMergeSummary()'),b=source.indexOf('// ---- AI sohbet',a);
 vm.runInNewContext(source.slice(a,b),ctx);
 assert.match(ctx.sentenceMergeSummary(),/Off/);
 ctx.player.mergeCont=true;assert.match(ctx.sentenceMergeSummary(),/when subtitles load/);
 ctx.player.cuesRaw=[{},{}];ctx.player.cues=[{}];assert.match(ctx.sentenceMergeSummary(),/Source: 2 → 1/);
 ctx.player.cues=[{},{}];assert.match(ctx.sentenceMergeSummary(),/no continuation cues/);
 ctx.updateSentenceMergeStatus();assert.match(contextHelp.textContent,/same scene and safety limits/);assert.match(contextHelp.textContent,/clipped excerpts/);
});
