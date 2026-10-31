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
  const mismatch=await api.handle({},{action:'decision-save',itemId:'film',reviews,analysis,evidenceSnapshot:{...snapshot,context:'x'.repeat(64001)}});assert.equal(mismatch.ok,false);
  assert.equal((await api.handle({},{action:'decision-get',itemId:'film'})).value.history.length,1);
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});

test('Provider rematches stale the analysis even when title and year stay the same; older identity-less snapshots remain readable',()=>{
 const selected={...item,imdbId:'tt1234567',tmdbId:'movie:1'},evidence=model.decisionEvidence(selected,reviews,taste).evidence;
 const snapshot={version:1,context:JSON.stringify(evidence),profile:evidence.profile};
 assert.equal(model.decisionFreshness(snapshot,selected,reviews,taste),'current');
 assert.equal(model.decisionFreshness(snapshot,{...selected,imdbId:'tt7654321'},reviews,taste),'stale');
 assert.throws(()=>model.validateEvidenceSnapshot(snapshot,reviews,{...selected,tmdbId:'movie:2'}),/film identity/);
 const {identity,...legacy}=evidence,old={...snapshot,context:JSON.stringify(legacy)};
 assert.equal(model.decisionFreshness(old,selected,reviews,taste),'unknown');
 assert.deepEqual(model.validateEvidenceSnapshot(old,reviews,selected),old);
 assert.equal(model.decisionIdentityMatch(selected,{...selected,imdbId:'tt7654321'}),'mismatch');
 assert.equal(model.decisionIdentityMatch(selected,{...selected,kind:'series'}),'mismatch');
});

test('Saved analysis follows an exact provider match between discovery and library without transferring feedback or accepting title-only/conflicting matches',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-shared-history-')),close=[];
 const selected={...item,imdbId:'tt1234567',tmdbId:'movie:1'},analysis={at:100,summary:'Saved from discovery.',points:[{id:'r1',quote:'The performances are strong',reason:'Supported.'}]};
 const entry={identity:{...selected,id:'discovery:film:tt1234567'},analysis,reviews};
 const conflict={...entry,identity:{...entry.identity,tmdbId:'movie:2'},analysis:{...analysis,at:900,summary:'Conflicting provider'}};
 const titleOnly={...entry,identity:{kind:'film',title:selected.title,year:selected.year},analysis:{...analysis,at:800,summary:'Same name only'}};
 const wrongYear={...entry,identity:{...entry.identity,year:2025},analysis:{...analysis,at:700}};
 const wrongKind={...entry,identity:{...entry.identity,kind:'series'},analysis:{...analysis,at:600}};
 try{
  fs.writeFileSync(path.join(dir,'media-enrichment.json'),JSON.stringify({version:1,titles:{film:{feedback:{note:'Local feedback'}},'discovery:film:tt1234567':{feedback:{note:'Discovery feedback'},history:[entry]},duplicate:{history:[entry]},conflict:{history:[conflict]},titleOnly:{history:[titleOnly]},wrongYear:{history:[wrongYear]},wrongKind:{history:[wrongKind]}}}));
  const before=fs.readFileSync(path.join(dir,'media-enrichment.json'),'utf8');
  const api=service.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get:()=>selected}),resolveDiscovery:async()=>({ok:true,item:{...selected,providerId:selected.imdbId}})});
  const library=await api.handle({},{action:'decision-get',itemId:'film'});assert.equal(library.ok,true,library.error);assert.deepEqual(library.value.history,[{...entry,savedFrom:'discovery'}]);assert.equal(library.value.feedback.note,'Local feedback');
  const discovery=await api.handle({},{action:'decision-get',itemId:'discovery:film:tt1234567',discovery:{kind:'film',id:'tt1234567'}});assert.equal(discovery.ok,true,discovery.error);assert.deepEqual(discovery.value.history,[{...entry,savedFrom:'discovery'}]);assert.equal(discovery.value.feedback.note,'Discovery feedback');
  assert.equal(fs.readFileSync(path.join(dir,'media-enrichment.json'),'utf8'),before,'Reading shared history never migrates or mutates saved data');
  const saved=await api.handle({},{action:'decision-save',itemId:'film',itemIdentity:selected,reviews,analysis:{...analysis,summary:'Newer library analysis'}});assert.equal(saved.ok,true,saved.error);
  const reverse=await api.handle({},{action:'decision-get',itemId:'discovery:film:tt1234567',discovery:{kind:'film',id:'tt1234567'}});assert.equal(reverse.value.history.length,2);assert.equal(reverse.value.history[0].savedFrom,'library');assert.equal(reverse.value.history[0].analysis.summary,'Newer library analysis');assert.equal(reverse.value.history[1].savedFrom,'discovery');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'media-enrichment.json'),'utf8')).titles.film.history[0].savedFrom,undefined,'Origin labels are response metadata, not a storage migration');
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});

test('Prompt assessment counts canonical author accounts without display names from the selected sample and remains bounded',()=>{
 const rows=Array.from({length:50},(_,i)=>({id:'R'+i,authorId:'reviewer'+i,author:'',text:'Distinct opinion number '+i+' about the pacing and acting. '+('Long source text. '.repeat(250))}));
 const {evidence,sample}=model.decisionEvidence(item,rows,taste),assessment=model.reviewAssessment(sample.reviews);
 assert(sample.reviews.length<rows.length);assert(sample.truncated>0);
 assert.deepEqual(evidence.sampleAssessment,{distinctReviews:assessment.distinct,independentAuthors:sample.reviews.length,unknownAuthors:0,duplicates:assessment.duplicates});
 assert(JSON.stringify(evidence).length<=64000);
 const mixed=model.decisionEvidence(item,[{id:'a',authorId:'one',text:'Exactly the same review text.'},{id:'b',authorId:'one',text:'Exactly the same review text.'},{id:'c',author:'Unverified display name',text:'A different review with no canonical author.'}]).evidence;
 assert.deepEqual(mixed.sampleAssessment,{distinctReviews:2,independentAuthors:1,unknownAuthors:1,duplicates:1});
});

test('Native snapshot validation refuses invented assessment counts while old snapshots without counts remain readable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-assessment-')),close=[];
 try{
  const api=service.registerMediaTools({app:{getPath:()=>dir,on:(_,fn)=>close.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get:()=>item})});
  const evidence=model.decisionEvidence(item,reviews,taste).evidence,analysis={points:[{id:'r1',quote:'The performances are strong',reason:'Supported.'}]},snapshot=context=>({version:1,context:JSON.stringify(context),profile:evidence.profile});
  for(const key of Object.keys(evidence.sampleAssessment)){
   const forged={...evidence,sampleAssessment:{...evidence.sampleAssessment,[key]:99}};
   const result=await api.handle({},{action:'decision-save',itemId:item.id,reviews,analysis,evidenceSnapshot:snapshot(forged)});assert.equal(result.ok,false);assert.match(result.error,/sample assessment/);
  }
  assert.equal((await api.handle({},{action:'decision-get',itemId:item.id})).value.history,undefined);
  const valid=await api.handle({},{action:'decision-save',itemId:item.id,reviews,analysis,evidenceSnapshot:snapshot(evidence)});assert.equal(valid.ok,true,valid.error);
  const {sampleAssessment,...legacy}=evidence;
  const old=await api.handle({},{action:'decision-save',itemId:item.id,reviews,analysis,evidenceSnapshot:snapshot(legacy)});assert.equal(old.ok,true,old.error);
 }finally{close.forEach(fn=>fn());fs.rmSync(dir,{recursive:true,force:true});}
});
