'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {lookupUrl,trusted,fetchReviews}=require('../src/letterboxd-auto');
const item={kind:'film',title:'Witness',year:2026,tmdbId:'movie:123',imdbId:'tt1234567'};
function html(rows,{title='Witness',year=2026,id='123'}={}){return `<meta property="og:title" content="${title} (${year}) • Letterboxd"><div data-tmdb-id="${id}"></div>`+rows.map((text,i)=>`<article><div class="js-review-body${text.startsWith('Spoiler')?' contains-spoilers':''}">${text}</div></article>`).join('');}
test('identifier lookup does not guess a film slug, and redirects stay on supported HTTPS film routes',()=>{
  assert.equal(lookupUrl(item),'https://letterboxd.com/tmdb/123/');
  assert.equal(lookupUrl({...item,tmdbId:''}),'https://letterboxd.com/imdb/tt1234567/');
  assert.throws(()=>lookupUrl({...item,kind:'series'}),/series/);
  assert.throws(()=>lookupUrl({...item,tmdbId:'',imdbId:''}),/Match/);
  for(const u of ['https://evil.example/film/witness/','https://letterboxd.com.evil.example/film/witness/','http://letterboxd.com/film/witness/','https://user:pass@letterboxd.com/film/witness/','https://letterboxd.com/admin/'])assert.equal(trusted(u),null);
});
test('real multi-page sample deduplicates and preserves IDs, excludes spoilers and never requests more than four pages',async()=>{
  const calls=[],fetchImpl=async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');if(url.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});if(!url.includes('/reviews/'))return new Response(html([]));const page=/page\/(\d+)/.exec(url)?.[1]||'1';return new Response(html(['A thoughtful review repeated on every page.',...Array.from({length:10},(_,i)=>`Distinct review ${page} number ${i}, a complete perspective.`,),'Spoiler plot is revealed here.']));};
  const result=await fetchReviews(item,{count:24,fetchImpl});assert.equal(result.reviews.length,24);assert.equal(result.pages,3);assert.equal(result.match.state,'matched');assert.equal(new Set(result.reviews.map(r=>r.id)).size,24);assert(!result.reviews.some(r=>r.spoiler));assert.equal(calls.filter(u=>u.includes('/reviews/')).length,3);
});
test('unsafe redirects, mismatched film, blocked pages and abort never become accepted evidence',async()=>{
  let calls=0;
  await assert.rejects(fetchReviews(item,{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/film/witness/'}});}}),/outside/);assert.equal(calls,1);
  const make=body=>async url=>url.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):new Response(body);
  await assert.rejects(fetchReviews(item,{fetchImpl:make(html(['A complete review.'],{id:'999'}))}),/mismatch/);
  await assert.rejects(fetchReviews(item,{fetchImpl:make('<title>Just a moment</title>')}),/verification/);
  const c=new AbortController();c.abort();await assert.rejects(fetchReviews(item,{signal:c.signal,fetchImpl:async()=>{throw Error('should not fetch');}}),/abort/i);
});
test('later service failure is explicitly partial and large text stays within the review editor bound',async()=>{
  const fetchImpl=async url=>{if(url.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});if(url.includes('/page/2/'))return new Response('Unavailable',{status:429});return new Response(html(Array.from({length:10},(_,i)=>`Distinct review ${i}, with a complete opinion.`)));};
  const result=await fetchReviews(item,{count:24,fetchImpl});assert(result.partial);assert.match(result.warning,/429/);assert.equal(result.pages,1);assert.equal(result.reviews.length,10);
});
test('an identity change on a later page rejects the whole automatic sample',async()=>{
  const fetchImpl=async url=>url.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):new Response(html(['A thoughtful review here.'],{id:url.includes('/page/2/')?'999':'123'}));
  await assert.rejects(fetchReviews(item,{count:24,fetchImpl}),/mismatch/);
});
test('large fetched reviews fit the existing editor without splitting review records',async()=>{
  const fetchImpl=async url=>url.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):new Response(html(Array.from({length:48},(_,i)=>'Review '+i+' '+('a'.repeat(3900)))));
  const result=await fetchReviews(item,{count:48,fetchImpl});assert(result.limited);assert(JSON.stringify(result.reviews).length<=120000);assert(result.reviews.length>0&&result.reviews.length<48);
});

test('Automatic exclusions count only rows actually loaded, with spoiler and duplicate reasons',async()=>{
 const fetchImpl=async url=>url.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):new Response(html([...Array.from({length:15},(_,i)=>'Loaded unique opinion '+i+'.'),'Loaded unique opinion 0.','Spoiler final scene is revealed.']));
 const result=await fetchReviews(item,{count:12,fetchImpl});assert.equal(result.pages,1);assert.equal(result.reviews.length,12);assert.deepEqual(result.excluded,{spoiler:1,duplicate:1,unreadable:0,size:0,requested:3});
});

test('Excluded-only intermediate pages do not hide eligible later reviews or exceed the four-page budget',async()=>{
 for(const reason of ['duplicate','spoiler','author','unreadable']){
  const calls=[],card=(text,author)=>'<article>'+(author?'<a class="name" href="/'+author+'/">Reviewer</a>':'')+'<div class="js-review-body'+(text.startsWith('Spoiler')?' contains-spoilers':'')+'">'+text+'</div></article>';
  const fetchImpl=async url=>{
   calls.push(url);
   if(url.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});
   const page=Number(/page\/(\d+)/.exec(url)?.[1]||1);
   let rows=card('First eligible perspective about the story.','first');
   if(page===2)rows=reason==='duplicate'?rows:card(reason==='unreadable'?'Okay':reason==='spoiler'?'Spoiler the ending reveals everything.':'Another diary entry by the first author.',reason==='author'?'first':'spoiler');
   if(page>=3)rows=Array.from({length:6},(_,i)=>card('Eligible later perspective '+page+'-'+i+' about acting.','later'+page+'-'+i)).join('');
   return new Response(html([])+rows);
  };
  const r=await fetchReviews(item,{count:12,fetchImpl});
  assert.equal(r.reviews.length,12,reason);
  assert.equal(r.pages,4,reason);
  assert.equal(calls.filter(url=>url.includes('/reviews/')).length,4);
  assert(r.reviews.some(row=>row.source.page===3));
  assert(r.excluded[reason]>0);
 }
});

test('IMDb lookup verifies translated titles and rejects an IMDb change between review pages',async()=>{
 const local={kind:'film',title:'Tanık',year:2026,imdbId:'tt1234567'};
 for(const conflict of [false,true]){
  const calls=[],fetchImpl=async url=>{
   calls.push(url);if(url.includes('/imdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});
   const page=Number(/page\/(\d+)/.exec(url)?.[1]||1),imdb=conflict&&page===2?'tt7654321':'tt1234567';
   return new Response(html(Array.from({length:6},(_,i)=>'Distinct opinion '+page+'-'+i+' about acting.'),{id:''})+'<a data-track-action="IMDb" href="https://imdb.com/title/'+imdb+'/">IMDb</a>');
  };
  if(conflict)await assert.rejects(fetchReviews(local,{count:12,fetchImpl}),/mismatch/);
  else{const r=await fetchReviews(local,{count:12,fetchImpl});assert.equal(r.match.reason,'imdb-id');assert.equal(r.reviews.length,12);assert.equal(calls[0],'https://letterboxd.com/imdb/tt1234567/');}
 }
 // When the local item knows only TMDB, a new IMDb conflict between pages is still rejected.
 const fetchImpl=async url=>url.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):new Response(html(['A complete source opinion.'])+'<a data-track-action="IMDb" href="https://imdb.com/title/'+(url.includes('/page/2/')?'tt7654321':'tt1234567')+'/">IMDb</a>');
 await assert.rejects(fetchReviews({...item,imdbId:''},{count:12,fetchImpl}),/identity changed/);
});
