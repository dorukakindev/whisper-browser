 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {parseLetterboxdReviews,decode}=require('../src/letterboxd-reviews');const {reviewSample}=require('../src/renderer/media-tools-model');
test('Nested review containers and once-only entities retain complete safe text',()=>{
 const data=parseLetterboxdReviews('<script>const fake=\'<div class="js-review-body">Fake reviewer content</div>\'</script><meta property="og:title" content="Reviews of Example (1999)"><article><a class="name">Test &amp; Author</a><div class="js-review-body"><p>First &#304;stanbul paragraph.</p><div>Nested <b>second</b> paragraph.</div><p>Last &#x15f; line &amp;lt;b&amp;gt;.</p><script>injected()</script></div></article>');assert.equal(data.reviews.length,1);assert.match(data.reviews[0].text,/Last ş line &lt;b&gt;/);assert.match(data.reviews[0].text,/Nested second paragraph/);assert.doesNotMatch(data.reviews[0].text,/injected/);assert.equal(data.reviews[0].author,'Test & Author');assert.equal(data.pageTitle,'Reviews of Example (1999)');assert.equal(decode('&#x110000; &#xD800;'),'� �');
});

test('Source quotations preserve inline word and punctuation adjacency while separating blocks',()=>{
 const data=parseLetterboxdReviews('<article><a class="name">Jean-<b>Luc</b></a><div class="js-review-body"><p>An un<em>believable</em> film! <a href="/elsewhere/">See it</a>.</p><blockquote>“<strong>Beautiful</strong>,” indeed.</blockquote><p>One<br>last line &amp; goodbye.</p></div></article>');
 assert.equal(data.reviews[0].text,'An unbelievable film! See it.\n\n“Beautiful,” indeed.\n\nOne\nlast line & goodbye.');
 assert.equal(data.reviews[0].author,'Jean-Luc');
});

test('Film IMDb external links verify translated titles, while conflicting identifiers and years remain rejected',()=>{
 const {matchFilm}=require('../src/letterboxd-reviews');
 const identity=parseLetterboxdReviews('<meta property="og:title" content="The Witness (2026)"><a data-track-action="IMDb" href="https://www.imdb.com/title/tt1234567/maindetails">IMDb</a>').identity;
 const local={kind:'film',title:'Tanık',year:2026,imdbId:'tt1234567'};
 assert.equal(identity.imdbId,'tt1234567');
 assert.deepEqual(matchFilm(local,identity),{state:'matched',reason:'imdb-id'});
 assert.deepEqual(matchFilm({...local,title:identity.title,imdbId:'tt7654321'},identity),{state:'mismatch',reason:'imdb-id'});
 assert.equal(matchFilm({...local,year:2025},identity).reason,'year');
 assert.equal(matchFilm({...local,tmdbId:'movie:1'},{...identity,tmdbId:'movie:2'}).reason,'tmdb-id');
 assert.equal(matchFilm({...local,tmdbId:'movie:1'},{...identity,tmdbId:'movie:1',imdbId:'tt7654321'}).reason,'imdb-id');
});

test('Review links, ambiguous markers and impostor IMDb hosts cannot claim the film identifier',()=>{
 const link=href=>'<a data-track-action="IMDb" href="'+href+'">IMDb</a>',valid=link('https://www.imdb.com/title/tt1234567/');
 for(const markup of ['<article>'+valid+'</article>','<li>'+valid+'</li>','<div class="js-review-body">'+valid+'</div>',link('https://www.imdb.com.evil.test/title/tt1234567/'),link('https://user:pass@www.imdb.com/title/tt1234567/'),link('https://www.imdb.com/name/tt1234567/'),valid+link('https://imdb.com/title/tt7654321/'),'<a href="https://imdb.com/title/tt1234567/">IMDb</a>']){
  assert.equal(parseLetterboxdReviews(markup).identity.imdbId,undefined,markup);
 }
});

test('Loaded Browser extraction retains the film IMDb marker without trusting review-body links',()=>{
 const {JSDOM}=require('jsdom'),{reviewPageScript,matchFilm}=require('../src/letterboxd-reviews');
 const html='<meta property="og:title" content="The Witness (2026)"><a data-track-action="IMDb" href="https://www.imdb.com/title/tt1234567/">IMDb</a><article><div class="js-review-body">A visible opinion with <a data-track-action="IMDb" href="https://imdb.com/title/tt7654321/">a different film link</a>.</div></article>';
 const dom=new JSDOM(html,{url:'https://letterboxd.com/film/the-witness/reviews/',runScripts:'outside-only'});
 try{const extracted=dom.window.eval(reviewPageScript()),parsed=parseLetterboxdReviews(extracted.html,{url:extracted.url});assert.equal(parsed.reviews.length,1);assert.equal(parsed.identity.imdbId,'tt1234567');assert.equal(matchFilm({kind:'film',title:'Tanık',year:2026,imdbId:'tt1234567'},parsed.identity).state,'matched');}finally{dom.window.close();}
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
 const personal=decisionEvidence({title:'İstanbul'.repeat(60),kind:'film'},[...Array(40)].map((_,i)=>({...review,id:String(i),text:'"'.repeat(4000)})),{preferencesConfigured:true,preferences:{weights:{story:5},note:'"'.repeat(2000)},reviews:[{id:'personal',title:'A personal review',text:'Exact personal story evidence.'}],analysis:{summary:'"'.repeat(4000),insights:[{aspect:'story',direction:'likes',reason:'"'.repeat(1200),evidence:[{id:'personal',quote:'Exact personal story evidence.'}]}]}});assert.equal(personal.evidence.profile.preferences.weights.story,5);assert(personal.evidence.profile.acceptedAnalysis);assert(JSON.stringify(personal.evidence).length<8000);assert(personal.sample.omitted>0);
});

test('Fetched reviews fit the supported import size even when source text needs JSON escaping',()=>{
 const page=Array.from({length:50},(_,i)=>'<li><div class="js-review-body">'+i+' '+('&quot;'.repeat(4000))+'</div></li>').join('');const result=parseLetterboxdReviews(page);assert(result.reviews.length>0);assert(JSON.stringify(result.reviews).length<=110000);assert.equal(result.limited,true);
});

test('Review metadata belongs to its own card, including metadata after the body',()=>{
 const page='<article><a class="name">First</a><div class="js-review-body">Acting was excellent. <a href="/intruder/film/other/">An unrelated link</a></div><a href="/first/film/example/2/"><time datetime="2026-10-30T12:00:00Z">Yesterday</time></a><span class="rating rated-7">★★★½</span></article><article><a href="javascript:alert(1)">bad</a><div class="js-review-body">Another opinion without source metadata.</div></article>';
 const data=parseLetterboxdReviews(page);assert.equal(data.reviews[0].permalink,'https://letterboxd.com/first/film/example/2/');assert.equal(data.reviews[0].date,'2026-10-30');assert.equal(data.reviews[0].rating,3.5);for(const key of ['permalink','date','rating'])assert.equal(data.reviews[1][key],undefined);
 const inside=parseLetterboxdReviews('<article><div class="js-review-body">A comment <a href="/fake/film/example/">with a fake review link</a><time datetime="2026-01-01">fake date</time><span class="rating rated-10">★★★★★</span></div></article>');assert.equal(inside.reviews[0].permalink,undefined);assert.equal(inside.reviews[0].rating,undefined);
});

test('Renderer and saved-review normalization retain verified metadata and reject unsafe source claims',()=>{
 const client=require('../src/renderer/media-tools-model'),server=require('../src/media-tools-service');
 const raw=JSON.stringify([{id:'a',text:'A source with usable metadata.',permalink:'https://letterboxd.com/reviewer/film/example/',date:'2026-10-30',rating:4.5},{id:'b',text:'A source with untrusted metadata.',permalink:'https://letterboxd.com.evil.test/reviewer/film/example/',date:'2026-02-30',rating:6},null]);
 const rows=client.reviewRows(raw);assert.deepEqual(server.reviewRows(raw),rows);assert.equal(rows.length,2);assert.equal(rows[0].rating,4.5);assert.equal(rows[0].date,'2026-10-30');assert.equal(rows[0].permalink,'https://letterboxd.com/reviewer/film/example/');for(const key of ['permalink','date','rating'])assert.equal(rows[1][key],undefined);
 for(const permalink of ['javascript:alert(1)','https://user:pass@letterboxd.com/reviewer/film/example/','https://letterboxd.com/reviewer/film/example/?secret=x','https://letterboxd.com/film/example/'])assert.equal(client.reviewMetadata({permalink}).permalink,undefined);
});

test('Every eligible review receives a precise inclusion or exclusion decision',()=>{
 const rows=Array.from({length:22},(_,i)=>({id:String(i),text:'A sufficiently long review '+i+'.'})),sample=reviewSample(rows,10000);assert.equal(sample.decisions.length,22);assert.equal(sample.decisions.filter(r=>r.included).length,20);assert.equal(sample.decisions[21].reason,'review-limit');
 const bounded=reviewSample([{id:'long',text:'x'.repeat(4000)},{id:'later',text:'A later complete comment about the acting.'}],180);assert.equal(bounded.decisions[0].reason,'shortened');assert.equal(bounded.decisions[0].originalLength,4000);assert.equal(bounded.decisions[0].sentLength,bounded.reviews[0].text.length);assert.equal(bounded.decisions[1].reason,'included');assert.equal(bounded.reviews[1].text,'A later complete comment about the acting.');assert(JSON.stringify(bounded.reviews).length<=180);
});
