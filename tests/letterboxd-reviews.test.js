 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {parseLetterboxdReviews,decode}=require('../src/letterboxd-reviews');const {reviewSample}=require('../src/renderer/media-tools-model');
test('Nested review containers and once-only entities retain complete safe text',()=>{
 const data=parseLetterboxdReviews('<script>const fake=\'<div class="js-review-body">Fake reviewer content</div>\'</script><meta property="og:title" content="Reviews of Example (1999)"><article><a class="name">Test &amp; Author</a><div class="js-review-body"><p>First &#304;stanbul paragraph.</p><div>Nested <b>second</b> paragraph.</div><p>Last &#x15f; line &amp;lt;b&amp;gt;.</p><script>injected()</script></div></article>');assert.equal(data.reviews.length,1);assert.match(data.reviews[0].text,/Last ş line &lt;b&gt;/);assert.match(data.reviews[0].text,/Nested second paragraph/);assert.doesNotMatch(data.reviews[0].text,/injected/);assert.equal(data.reviews[0].author,'Test & Author');assert.equal(data.pageTitle,'Reviews of Example (1999)');assert.equal(decode('&#x110000; &#xD800;'),'� �');
});
test('A neighbouring spoiler does not mark the next review, while duplicates and challenge screens are rejected',()=>{
 const page='<li class="review contains-spoilers"><div class="js-review-body">A spoiler review reveals the ending.</div></li><li class="review"><div class="js-review-body">A clean review discusses acting only.</div></li><li><div class="js-review-body">A clean review discusses acting only.</div></li>';
 const data=parseLetterboxdReviews(page);assert.equal(data.reviews.length,2);assert(data.reviews[0].spoiler);assert.equal(data.reviews[1].spoiler,false);assert.throws(()=>parseLetterboxdReviews('<title>Just a moment...</title>'),/verification/);assert.throws(()=>parseLetterboxdReviews('x'.repeat(3000001)),/large/);
});
test('Review samples survive escaped long input and report omitted or shortened evidence',()=>{
 const rows=[{id:'a',author:'A',text:'"'.repeat(4000),spoiler:false},{id:'b',text:'A short later review about acting.',spoiler:false}];const sample=reviewSample(rows);assert(sample.reviews.length>0);assert(JSON.stringify(sample.reviews).length<=4500);assert.equal(sample.truncated,1);assert.equal(sample.omitted,rows.length-sample.reviews.length);assert(rows[0].text.startsWith(sample.reviews[0].text));assert.equal(rows[0].text.length,4000);
});

test('Spoiler warnings inside a review body are excluded by the default sample filter',()=>{
 const result=parseLetterboxdReviews('<li><div class="js-review-body"><p class="spoiler-warning">This review contains spoilers.</p><p>The final scene reveals the answer.</p></div></li>');assert.equal(result.reviews.length,1);assert.equal(result.reviews[0].spoiler,true);
});

test('Personal fit distinguishes unsaved defaults from explicit preferences and includes only bounded accepted profile analysis',()=>{
 const {decisionEvidence}=require('../src/renderer/media-tools-model');const review={id:'1',text:'An example review with exact supporting evidence.',author:'Test',spoiler:false};const defaults=decisionEvidence({title:'Film',year:2024,kind:'film'},[review],{preferences:{weights:{story:3}}});assert.equal(defaults.evidence.profile.preferences,null);assert.equal(defaults.evidence.profile.preferencesConfigured,false);
 const personal=decisionEvidence({title:'İstanbul'.repeat(60),kind:'film'},[...Array(40)].map((_,i)=>({...review,id:String(i),text:'"'.repeat(4000)})),{preferencesConfigured:true,preferences:{weights:{story:5},note:'"'.repeat(2000)},analysis:{summary:'"'.repeat(4000),insights:[{aspect:'story',direction:'likes',reason:'"'.repeat(1200)}]}});assert.equal(personal.evidence.profile.preferences.weights.story,5);assert(personal.evidence.profile.acceptedAnalysis);assert(JSON.stringify(personal.evidence).length<8000);assert(personal.sample.omitted>0);
});

test('Fetched reviews fit the supported import size even when source text needs JSON escaping',()=>{
 const page=Array.from({length:50},(_,i)=>'<li><div class="js-review-body">'+i+' '+('&quot;'.repeat(4000))+'</div></li>').join('');const result=parseLetterboxdReviews(page);assert(result.reviews.length>0);assert(JSON.stringify(result.reviews).length<=110000);assert.equal(result.limited,true);
});
