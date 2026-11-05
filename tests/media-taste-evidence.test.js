'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const taste=require('../src/media-taste');
test('preference revision distinguishes displayed defaults from the same explicitly chosen priorities',()=>{
 const defaults=taste.effectivePreferences({});assert.equal(taste.preferencesRevision({}),taste.preferencesRevision({weights:{}}));assert.notEqual(taste.preferencesRevision({}),taste.preferencesRevision(defaults));
});
const film=(id,title,personal,genres=['Drama'],extra={})=>({id,title,year:2020,kind:'film',genres,directors:['Director'],ratings:{personal},...extra});
test('taste evidence deduplicates watches, includes explicit catalog ratings and exposes missing metadata',()=>{
 const diary=[{title:'Good',year:2020,rating:1},{title:'Good',year:2020,rating:2},{title:'Unknown',year:2010,rating:1},{title:'Clash',year:2020,rating:4}];
 const catalog=[film('a','Good',10),film('b','Bad',2,['Horror']),film('c','Clash',null),film('d','Clash',null),film('e','Read',null,['Read'])];
 const p=taste.profile(diary,catalog);
 assert.equal(p.rated,4);assert.equal(p.coverage.catalogOnlyRatedTitles,1);assert.equal(p.coverage.ambiguousTitles,1);assert.equal(p.coverage.missingMetadata,2);
 const signal=p.signals.genres.find(s=>s.name==='Drama');assert.equal(signal.direction,'likes');assert.equal(signal.count,1);assert.equal(signal.confidence,'single');assert.equal(signal.evidence[0].itemId,'a');assert.equal(p.signals.genres.some(s=>s.name==='Read'),false);
 assert.equal(p.preferencesRevision,taste.preferencesRevision({}));assert.equal(taste.preferencesRevision({avoid:['story','pace']}),taste.preferencesRevision({avoid:['pace','story']}));
 assert.notEqual(p.evidenceRevision,taste.profile(diary,catalog.map(r=>r.id==='a'?{...r,ratings:{personal:8}}:r)).evidenceRevision);
});
test('analysis fingerprint follows active complete review corpus, quotes and archival state',()=>{
 const row={title:'Review',year:2020,review:'The story was excellent.'};
 const raw={version:1,insights:[{aspect:'story',direction:'likes',evidence:[{id:taste.reviewId(row),quote:'story was excellent'}]}]};
 const analysis=taste.validateAnalysis(raw,[row]);assert.equal(taste.profile([row],[],{analysis}).analysisState,'current');
 assert.equal(taste.profile([row,{title:'New',review:'Another review.'}],[],{analysis}).analysisState,'stale');
 assert.equal(taste.profile([{...row,recordState:'archived'}],[],{analysis}).analysisState,'stale');
 assert.equal(taste.profile([row],[],{analysis:{...analysis,insights:[{...analysis.insights[0],evidence:[{id:taste.reviewId(row),quote:'invented quotation'}]}]}}).analysisState,'stale');
 assert.throws(()=>taste.validateAnalysis(raw,[{...row,recordState:'archived'}]),/verified/);
 assert.equal(taste.profile([row],[],{}).analysisState,'none');
});
test('recommendations use actual unviewed metadata, deterministic evidence and bounded constraints',()=>{
 const catalog=[film('a','Rated',10),film('b','Candidate',null,undefined,{runtime:90}),film('c','Viewed',null,undefined,{watchStatus:'completed'}),film('d','Long',null,undefined,{runtime:180}),film('e','Unknown runtime',null)];
 const p=taste.profile([],catalog);assert.ok(p.recommendations.some(r=>r.itemId==='b'));assert.equal(p.recommendations.some(r=>r.itemId==='a'||r.itemId==='c'),false);
 const rows=taste.recommend(catalog,p,{maxDuration:100,kind:'film',limit:99});assert.deepEqual(rows.map(r=>r.itemId),['b']);assert.equal(rows[0].confidence,'single');assert.ok(rows[0].evidence.length);assert.ok(rows[0].limitations.length);
 assert.deepEqual(taste.recommend([...catalog].reverse(),p,{maxDuration:100}),taste.recommend(catalog,p,{maxDuration:100}));
 assert.deepEqual(taste.profile([],catalog.filter(r=>r.id!=='a')).recommendations,[]);
});
test('signal direction preserves counterevidence and explicit dislike; words and watches add no rating',()=>{
 const catalog=[film('a','High',10,['Mixed']),film('b','Low',0,['Mixed']),film('c','Dislike',2,['Avoid']),film('d','Viewed only',null,['Unrated'],{watchStatus:'completed'})];
 const p=taste.profile([{title:'Words',review:'Story music lovely excellent!',year:2020}],catalog);
 assert.equal(p.rated,3);assert.equal(p.signals.genres.find(s=>s.name==='Mixed').direction,'mixed');assert.equal(p.signals.genres.find(s=>s.name==='Mixed').count,2);assert.equal(p.signals.genres.find(s=>s.name==='Avoid').direction,'dislikes');assert.equal(p.signals.genres.some(s=>s.name==='Unrated'),false);
 assert.equal(p.mentions.find(s=>s.aspect==='story').count,1);
});
test('recommendations explain contrary matches and honor six-item bound without duplicate watches',()=>{
 const catalog=[film('a','Good',10,['Drama'],{directors:['Loved']}),film('b','Bad',0,['Horror'],{directors:['Other']}),...Array.from({length:10},(_,i)=>film('p'+i,'Pick '+i,null,['Drama','Horror'],{directors:['Loved']}))];
 const p=taste.profile([],catalog);assert.equal(p.recommendations.length,6);assert.ok(p.recommendations[0].limitations.includes('contrary-genres:Horror'));assert.ok(p.recommendations[0].reasonDetails.some(row=>row.kind==='genre'&&row.name==='Drama'));
 assert.equal(taste.recommend(catalog,p,{limit:0}).length,0);
 assert.equal(taste.profile([{title:'Pick 0',year:2020}],catalog).recommendations.some(row=>row.itemId==='p0'),false);
});
test('standalone series ratings have catalog identity without borrowing film diary evidence',()=>{
 const catalog=[film('film','Shared',8,['Film']),film('series','Shared',2,['Series'],{kind:'series'}),film('unrated','Next episode',null,['Series'],{kind:'series'})];
 const p=taste.profile([{title:'Shared',year:2020,rating:5}],catalog);
 assert.equal(p.rated,2);assert.equal(p.coverage.catalogOnlyRatedTitles,1);assert.equal(p.signals.genres.find(s=>s.name==='Film').average,4);assert.equal(p.signals.genres.find(s=>s.name==='Series').average,1);
 assert.equal(p.signals.genres.find(s=>s.name==='Film').evidence[0].itemId,'film');assert.equal(p.signals.genres.find(s=>s.name==='Series').evidence[0].itemId,'series');
 assert.equal(taste.profile([],catalog).rated,2);
});
test('series candidates keep film title identity separate and exclude started episodes',()=>{
 const catalog=[film('a','Loved',10),film('b','Shared',null,undefined,{kind:'series'}),film('c','Started',null,undefined,{kind:'series',episodes:[{watchStatus:'completed'}]})];
 const p=taste.profile([{title:'Shared',year:2020}],catalog);
 assert.ok(p.recommendations.some(row=>row.itemId==='b'));assert.equal(p.recommendations.some(row=>row.itemId==='c'),false);
});
test('recommendations respect projected personal dislikes, watch state and resume without inventing ratings',()=>{
 const catalog=[film('a','Rated',10),film('b','Disliked',null,undefined,{personalMedia:{reaction:'dislike'}}),film('c','Completed',null,undefined,{personalMedia:{watchStatus:'completed'}}),film('d','Started',null,undefined,{personalMedia:{effectiveResume:{positionSeconds:30}}}),film('e','Finished resume',null,undefined,{personalMedia:{effectiveResume:{completed:true}}}),film('f','Explicit like',null,undefined,{personalMedia:{reaction:'like'}})];
 const p=taste.profile([],catalog,{weights:{story:5},avoid:['pace']});assert.equal(p.rated,1);assert.deepEqual(p.recommendations.map(row=>row.itemId),['f']);assert.ok(p.recommendations[0].limitations.includes('aspect-priorities-not-scored'));
 const onlyLike=taste.profile([],catalog.filter(row=>row.id==='f'));assert.equal(onlyLike.rated,0);assert.deepEqual(onlyLike.signals.genres,[]);
});

test('rating evidence keeps the real current-library or latest-diary origin for correction',()=>{
 const diary=[{title:'Current',year:2020,rating:1,watchedDate:'2020-01-01'},{title:'Imported',year:2020,rating:2,watchedDate:'2020-01-01'},{title:'Imported',year:2020,rating:5,watchedDate:'2024-02-03'}];
 const p=taste.profile(diary,[film('current','Current',10),film('imported','Imported',null),film('library','Library only',8)]);
 const evidence=p.signals.genres.find(row=>row.name==='Drama').evidence;
 assert.equal(evidence.find(row=>row.title==='Current').ratingSource,'catalog');assert.equal(evidence.find(row=>row.title==='Current').rating,5);
 assert.equal(evidence.find(row=>row.title==='Imported').ratingSource,'diary');assert.equal(evidence.find(row=>row.title==='Imported').ratingDate,'2024-02-03');
 assert.equal(evidence.find(row=>row.title==='Library only').ratingSource,'catalog');
 assert(p.recommendations.every(row=>row.evidence.every(item=>['catalog','diary'].includes(item.ratingSource))));
});
