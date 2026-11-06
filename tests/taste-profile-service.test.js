'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taste-service-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let handle;
 const file=path.join(dir,'media-shelf.json'),data={version:1,music:[],books:[],stations:[],podcasts:[],playlists:[],diary:[{title:'Evidence',year:'2000',rating:4,review:'The story stayed with me.'}],reviews:[],tasteProfile:{weights:{story:5},avoid:['pace'],note:'Keep my note',quiz:{version:1,answers:['human',null,null,null,null,null]}}};fs.writeFileSync(file,JSON.stringify(data));
 const items=[{id:'rated',kind:'film',title:'Evidence',year:'2000',genres:['Drama'],ratings:{personal:8}},{id:'next',kind:'film',title:'Next',genres:['Drama'],runtime:90,watchStatus:'unwatched'}];
 require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle(_name,fn){handle=fn;}},authorized:e=>e.allowed,userData:()=>dir,catalogStore:()=>({list:()=>items})});
 return {file,data,api:input=>handle({allowed:true},input),unauthorized:input=>handle({allowed:false},input)};
}
test('Taste preference CAS merges only reviewed fields and rejects stale or malformed changes without data loss',async t=>{
 const h=fixture(t),first=await h.api({action:'taste-profile'});assert.equal(first.ok,true);const revision=first.taste.preferencesRevision;
 const saved=await h.api({action:'taste-preferences',expectedPreferencesRevision:revision,patch:{weights:{sound:4}}});assert.equal(saved.ok,true,saved.error);assert.equal(saved.taste.preferences.weights.story,5);assert.equal(saved.taste.preferences.weights.sound,4);assert.equal(saved.taste.preferences.note,'Keep my note');
 const before=fs.readFileSync(h.file,'utf8');assert.equal((await h.api({action:'taste-preferences',expectedPreferencesRevision:revision,patch:{note:'stale'}})).stale,true);
 for(const patch of [{weights:{unknown:4}},{weights:{sound:NaN}},{avoid:['invented']},{note:9},{invented:true}])assert.equal((await h.api({action:'taste-preferences',patch})).ok,false);
 assert.equal(fs.readFileSync(h.file,'utf8'),before);assert.deepEqual(JSON.parse(before).tasteProfile.quiz,h.data.tasteProfile.quiz);assert.equal((await h.unauthorized({action:'taste-preferences',patch:{note:'bad'}})).ok,false);
});
test('Taste recommendations are a bounded read with explicit runtime constraints and unchanged storage',async t=>{
 const h=fixture(t),before=fs.readFileSync(h.file,'utf8');const r=await h.api({action:'taste-recommendations',maxDuration:100,limit:6,exploration:false});assert.equal(r.ok,true,r.error);assert(r.recommendations.every(row=>row.runtime<=100));assert.equal(fs.readFileSync(h.file,'utf8'),before);
 for(const input of [{maxDuration:-1},{limit:99},{kind:'invented'},{exploration:'yes'}])assert.equal((await h.api({action:'taste-recommendations',...input})).ok,false);
});
test('Review analysis cannot be accepted against an out-of-date evidence snapshot',async t=>{
 const h=fixture(t),first=await h.api({action:'taste-profile'}),d=JSON.parse(fs.readFileSync(h.file,'utf8'));d.diary[0].review='A newly edited review.';fs.writeFileSync(h.file,JSON.stringify(d));const before=fs.readFileSync(h.file,'utf8');
 const result=await h.api({action:'taste-analysis',expectedEvidenceRevision:first.taste.evidenceRevision,analysis:{version:1,summary:'Old',insights:[]}});assert.equal(result.ok,false);assert.equal(result.stale,true);assert.equal(fs.readFileSync(h.file,'utf8'),before);
});
test('An explicit note-only change keeps default aspect priorities unconfigured',async t=>{
 const h=fixture(t),d=JSON.parse(fs.readFileSync(h.file,'utf8'));delete d.tasteProfile.weights;fs.writeFileSync(h.file,JSON.stringify(d));
 const first=await h.api({action:'taste-profile'}),result=await h.api({action:'taste-preferences',expectedPreferencesRevision:first.taste.preferencesRevision,patch:{note:'Only this note'}});
 assert.equal(result.ok,true);assert.equal(result.taste.preferencesConfigured,false);assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(h.file,'utf8')).tasteProfile,'weights'),false);
});

test('Production catalog projection excludes saved dislikes and playback-completed titles from taste suggestions',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taste-projection-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const handlers=new Map(),played=path.join(dir,'seen.mp4');
 const service=require('../src/media-catalog-service').registerMediaCatalogService({ipcMain:{handle(name,fn){handlers.set(name,fn);}},authorized:()=>true,userData:()=>dir,watchItems:()=>[{key:'file:'+played,position:90,duration:90,completed:true,lastWatched:Date.now()}],mediaShelf:{}});
 const store=service.store();for(const item of [{id:'rated',kind:'film',title:'Rated',year:2000,genres:['Drama'],ratings:{personal:9}},{id:'no',kind:'film',title:'No',genres:['Drama']},{id:'seen',kind:'film',title:'Seen',genres:['Drama'],source:{type:'local',value:played}},{id:'yes',kind:'film',title:'Available',genres:['Drama']}])store.upsert(item);
 const personal=require('../src/personal-media-state'),feedback=personal.readFeedback(dir);personal.setFeedback(feedback,store.get('no'),{reaction:'dislike'});personal.saveFeedback(dir,feedback);
 const result=await handlers.get('media-shelf:request')({}, {action:'taste-recommendations'});assert.equal(result.ok,true,result.error);assert.deepEqual(result.recommendations.map(row=>row.itemId),['yes']);assert.equal(store.get('seen').watchStatus,'unspecified','reading observed playback does not mutate the catalog');
});

test('review correction previews exact source, preserves rating and rejects concurrent edits or token replay',async t=>{
 const h=fixture(t),first=(await h.api({action:'taste-profile'})).taste,before=fs.readFileSync(h.file,'utf8');
 const p=await h.api({action:'taste-source-preview',reviewId:first.reviews[0].id,review:'I changed my words.',expectedEvidenceRevision:first.evidenceRevision});assert(p.ok,p.error);assert.equal(fs.readFileSync(h.file,'utf8'),before);
 const a=await h.api({action:'taste-source-apply',token:p.token});assert(a.ok,a.error);const saved=JSON.parse(fs.readFileSync(h.file));assert.equal(saved.diary[0].rating,4);assert.equal(saved.diary[0].review,'I changed my words.');assert.deepEqual(saved.tasteProfile,h.data.tasteProfile);assert.notEqual(a.taste.evidenceRevision,first.evidenceRevision);assert.equal((await h.api({action:'taste-source-apply',token:p.token})).ok,false);
 const next=await h.api({action:'taste-source-preview',reviewId:a.taste.reviews[0].id,review:'Late change.',expectedEvidenceRevision:a.taste.evidenceRevision});saved.diary[0].review='Newer manual edit.';fs.writeFileSync(h.file,JSON.stringify(saved));assert.equal((await h.api({action:'taste-source-apply',token:next.token})).ok,false);assert.equal(JSON.parse(fs.readFileSync(h.file)).diary[0].review,'Newer manual edit.');
});

test('diary rating correction preserves its review, dates, preferences and current library rating',async t=>{
 const h=fixture(t),taste=require('../src/media-taste'),recordId=taste.diaryRecordId(h.data.diary[0]);
 const first=(await h.api({action:'taste-profile'})).taste,before=fs.readFileSync(h.file,'utf8');
 const p=await h.api({action:'taste-source-preview',kind:'diary-rating',recordId,rating:2,expectedEvidenceRevision:first.evidenceRevision});assert(p.ok,p.error);assert.equal(fs.readFileSync(h.file,'utf8'),before);
 const r=await h.api({action:'taste-source-apply',token:p.token});assert(r.ok,r.error);const saved=JSON.parse(fs.readFileSync(h.file));assert.deepEqual(saved.diary[0],{...h.data.diary[0],rating:2});assert.deepEqual(saved.tasteProfile,h.data.tasteProfile);assert.equal(r.taste.average,4,'current library score retains precedence');
});

test('late model analysis cannot override newer explicit priorities',async t=>{
 const h=fixture(t),first=(await h.api({action:'taste-profile'})).taste;
 await h.api({action:'taste-preferences',expectedPreferencesRevision:first.preferencesRevision,patch:{note:'A new manual preference'}});
 const before=fs.readFileSync(h.file,'utf8'),r=await h.api({action:'taste-analysis',expectedEvidenceRevision:first.evidenceRevision,expectedPreferencesRevision:first.preferencesRevision,analysis:{version:1,summary:'Old',insights:[]}});assert.equal(r.stale,true);assert.equal(fs.readFileSync(h.file,'utf8'),before);
});
