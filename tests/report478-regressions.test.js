const test=require('node:test'), assert=require('node:assert/strict');
const diff=require('../src/translation-diff');
const timeline=require('../src/browser-cue-timeline-calibration');
const {canonicalWatchKey,canonicalBrowserUrl}=require('../src/watch-library-store');
test('478-01: overlapping dialogue follows stable cue identity',()=>{
 const before=[{id:'a',start:0,end:3,text:'Speaker A'},{id:'b',start:0,end:3,text:'Speaker B'}];
 const after=[before[0],{...before[1],text:'New B'}];
 const review=diff.fullTranslationDiff(before,after);
 assert.equal(review.changed[0].before,'Speaker B');assert.equal(review.missing.length,0);
 assert.equal(diff.diffTranslationCues(before,after)[0].before,'Speaker B');
});
test('478-02: literal curly-brace text is not discarded as subtitle styling',()=>{
 assert.equal(diff.diffTranslationCues([{start:0,end:2,text:'Choose {A}'}],[{start:0,end:2,text:'Choose {B}'}]).length,1);
 assert.equal(diff.diffTranslationCues([{start:0,end:2,text:'{\\i1}Hello'}],[{start:0,end:2,text:'Hello'}]).length,0);
});
test('478-03: unknown ASR chunks break consecutive language-switch evidence',()=>{
 const s=require('../src/live-asr-audio-switch').createLiveAsrAudioSwitch();
 s.observe('en',1);s.observe('tr',2);s.observe('',3);
 assert.equal(s.observe('tr',4).action,'pending');
 assert.equal(s.observe('tr',5).action,'switch');
});
test('478-04: repeated reference phrase is not counted as independent calibration anchors',()=>{
 const result=timeline.calibrateCueTimeline([{start:2,text:'Yes'},{start:2.1,text:'Yes'}],[{start:10,text:'Yes'}]);
 assert.equal(result.accepted,false);
});
test('478-05: notes on conflicting tracks do not reuse one another',()=>{
 const {normalizeAnnotation,matchingLearningAnnotation}=require('../src/browser-learning');
 const a=normalizeAnnotation({type:'quote',mediaId:'movie',trackId:'tr',cueId:'1',start:1,source:'Hello'});
 const b=normalizeAnnotation({type:'quote',mediaId:'movie',trackId:'en',cueId:'1',start:1,source:'Hello'});
 assert.notEqual(a.id,b.id);
 assert.equal(matchingLearningAnnotation([a],'quote',b),null);
});
test('478-06: timeline speed/width diagnostics count visible text rather than markup',()=>{
 const scan=require('../src/renderer/timeline-issue-scan');
 const cue={start:0,end:1,text:'<font color="#ffffff"><i>Hi</i></font>'};
 assert.equal(scan.cpsOf(cue),2);
 assert.deepEqual(scan.scan([cue],{cpsLimit:20,lineLimit:10}),[]);
});
test('478-07: English whole-video questions request distributed evidence',()=>{
 const {buildTranscriptEvidence}=require('../src/browser-transcript-search');
 assert.equal(buildTranscriptEvidence([{start:0,end:2,text:'Hello'}],'Summarize the entire video',{scope:'full'}).coverage,'distributed');
});
test('478-08: small full-transcript evidence budgets still include beginning and ending',()=>{
 const {buildTranscriptEvidence}=require('../src/browser-transcript-search');
 const cues=Array.from({length:100},(_,i)=>({start:i*10,end:i*10+2,text:'Saturn topic '+i}));
 const result=buildTranscriptEvidence(cues,'Tüm video özeti Saturn',{scope:'full',position:0,limit:6});
 assert.equal(result.evidence.length,6);
 assert.equal(result.evidence[0].baslangic,0);assert.equal(result.evidence.at(-1).baslangic,990);
});
test('478-09: fake YouTube domains and malformed IDs cannot alias a valid media key',()=>{
 const id='dQw4w9WgXcQ';
 assert.equal(canonicalWatchKey('https://www.youtube.com/watch?v='+id),'youtube:'+id);
 assert.notEqual(canonicalWatchKey('https://notyoutube.com/watch?v='+id),'youtube:'+id);
 assert.notEqual(canonicalWatchKey('https://youtu.be/'+id+'extra'),'youtube:'+id);
});
test('478-10: browser watch keys do not persist URL user-info or API credentials',()=>{
 const url=canonicalBrowserUrl('https://reader:fixture@example.test/watch?api_key=fixture&refresh_token=fixture&v=123');
 assert.equal(url,'https://example.test/watch?v=123');
 const {migrateWatchDocument}=require('../src/watch-library-store');
 const key='browser:https://reader:fixture@example.test/watch?api_key=fixture&v=123';
 const migrated=migrateWatchDocument([{key,legacyKeys:[key]}]);
 assert.ok(!JSON.stringify(migrated.document.items).includes('fixture')); 
});
