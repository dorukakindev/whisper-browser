'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const model=require('../src/renderer/media-tools-model'),service=require('../src/media-tools-service');
const item={id:'film',kind:'film',title:'Selected film',year:2026};
const reviews=model.reviewRows(JSON.stringify([{id:'r1',author:'Display name',permalink:'https://letterboxd.com/alice/film/selected-film/',source:{url:'https://letterboxd.com/film/selected-film/reviews/by/activity/',sort:'popular',page:1},text:'The performances are strong, but the middle section drags.'}]));
const taste={preferencesConfigured:true,preferences:{weights:{story:5,pace:4},avoid:['sound'],note:'Prefer clear causality.'},reviews:[{id:'mine',title:'Earlier film',text:'I enjoy patient stories when the characters are convincing.'}],analysis:{summary:'Character-led pacing.',insights:[{aspect:'pace',direction:'mixed',reason:'Patience depends on characters.',evidence:[{id:'mine',quote:'patient stories when the characters are convincing'}]}]},quiz:{version:1,answers:['human','quiet',null,null,null,null]}};
test('Review independence uses canonical authors and reports unknown attribution separately',()=>{
 const same=Array.from({length:5},(_,i)=>({...reviews[0],id:String(i),text:'Distinct opinion '+i+' about the film.'}));
 const count=model.reviewAssessment(same);assert.equal(count.distinct,5);assert.equal(count.independentAuthors,1);assert.equal(count.limited,true);
 const unknown=model.reviewAssessment(same.map(row=>({id:row.id,author:'Same display name',text:row.text})));assert.equal(unknown.independentAuthors,0);assert.equal(unknown.unknownAuthors,5);
 const unique=model.reviewAssessment(same.map((row,i)=>({...row,authorId:'forged',permalink:`https://letterboxd.com/author${i}/film/selected-film/`})));
 assert.equal(unique.independentAuthors,5);assert.equal(unique.limited,false);
});
test('Fair sampling preserves later independent sources and keeps exact truthful prefixes inside the JSON limit',()=>{
 const rows=[{id:'long',authorId:'opening',text:'"'.repeat(4000)},...Array.from({length:10},(_,i)=>({id:String(i),authorId:'author'+i,text:'A complete shorter opinion about the acting and pacing, number '+i+'.'}))];
 const sample=model.reviewSample(rows,1600);assert(sample.reviews.length>5);assert(JSON.stringify(sample.reviews).length<=1600);assert(sample.truncated>0);
 for(const row of sample.reviews){const original=rows.find(value=>value.id===row.id),decision=sample.decisions.find(value=>value.id===row.id);assert(original.text.startsWith(row.text));assert.equal(decision.sentLength,row.text.length);assert.equal(decision.originalLength,original.text.length);}
 assert.equal(sample.reviews[1].text,rows[1].text);
});
test('Personal evidence contains verified personal citations and explicit questionnaire choices, not unanchored legacy claims',()=>{
 const {evidence}=model.decisionEvidence(item,reviews,taste),profile=evidence.profile;
 assert.equal(profile.acceptedAnalysis.insights[0].evidence[0].id,'mine');assert.equal(profile.acceptedAnalysis.insights[0].evidence[0].title,'Earlier film');assert(profile.questionnaire.answers.some(row=>row.question==='pace'&&row.choice==='quiet'));
 const absent=model.decisionEvidence(item,reviews,{...taste,reviews:[]}).evidence.profile;assert.equal(absent.acceptedAnalysis,null);assert.equal(absent.analysisEvidenceUnavailable,true);
 assert(JSON.stringify(evidence).length<8000);
});
test('Decision context is stable across input key order and becomes stale when sent sample, preference or cited personal text changes',()=>{
 const key=model.decisionContext(item,reviews,taste),profile=model.decisionEvidence(item,reviews,taste).evidence.profile,snapshot={version:1,context:key,profile};
 assert.equal(key,model.decisionContext({...item},reviews.map(row=>({text:row.text,source:row.source,permalink:row.permalink,id:row.id,author:row.author})),taste));
 assert.equal(model.decisionFreshness(snapshot,item,reviews,taste),'current');assert.equal(model.decisionFreshness(undefined,item,reviews,taste),'unknown');
 for(const [sample,profile]of [[reviews.map(row=>({...row,text:row.text+' New opinion.'})),taste],[reviews,{...taste,preferences:{...taste.preferences,note:'A different preference.'}}],[reviews,{...taste,reviews:[]}]] )assert.equal(model.decisionFreshness(snapshot,item,sample,profile),'stale');
 assert.throws(()=>model.validateEvidenceSnapshot({...snapshot,profile:{}},reviews,item),/snapshot/);
 assert.throws(()=>model.validateEvidenceSnapshot(snapshot,[...reviews,{id:'extra',text:'Another review.'}],item),/snapshot/);
 assert.throws(()=>model.validateEvidenceSnapshot(snapshot,reviews,{...item,title:'Different film'}),/snapshot/);
});
test('Native decision save shares quote validation, retains labelled paraphrase and bounded source/profile provenance',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-contract-')),close=[];
 try{
  const api=service.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get:()=>item})});
  const evidence=model.decisionEvidence(item,reviews,taste).evidence,snapshot={version:1,context:model.decisionContext(item,reviews,taste),profile:evidence.profile};
  const analysis={summary:'Mixed view of the sample.',fit:'Conditional fit.',points:[{id:'r1',quote:'The performances are strong',quoteTr:'Oyunculuklar güçlü bulunuyor.',quoteTrKind:'verified_translation',reason:'Praise is specifically about performances.',kind:'praise'}]};
  const result=await api.handle({},{action:'decision-save',itemId:'film',reviews,analysis,evidenceSnapshot:snapshot});assert.equal(result.ok,true,result.error);
  const saved=result.value.history[0];assert.equal(saved.analysis.points[0].quoteTrKind,'paraphrase');assert.equal(saved.analysis.points[0].quote,analysis.points[0].quote);assert.equal(saved.reviews[0].authorId,'alice');assert.equal(saved.reviews[0].source.sort,'popular');assert.deepEqual(saved.evidenceSnapshot,snapshot);
  const bad=await api.handle({},{action:'decision-save',itemId:'film',reviews,analysis:{...analysis,points:[{...analysis.points[0],quote:'A fabricated quotation'}]},evidenceSnapshot:snapshot});assert.equal(bad.ok,false);
  const mismatch=await api.handle({},{action:'decision-save',itemId:'film',reviews,analysis,evidenceSnapshot:{...snapshot,context:'x'.repeat(8001)}});assert.equal(mismatch.ok,false);
  assert.equal((await api.handle({},{action:'decision-get',itemId:'film'})).value.history.length,1);
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});
