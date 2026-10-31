'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fetchReviews}=require('../src/letterboxd-auto'),{parseLetterboxdReviews}=require('../src/letterboxd-reviews');
const item={kind:'film',title:'Witness',year:2026,tmdbId:'movie:123'};
const routes={popular:'by/activity/',new:'',high:'by/entry-rating/',low:'by/entry-rating-lowest/'};
const html=rows=>'<meta property="og:title" content="Reviews of Witness (2026) • Letterboxd"><div data-tmdb-id="123"></div>'+rows.map(row=>'<article><a class="name" href="/'+row.author+'/">Same display name</a><a href="/'+row.author+'/film/'+(row.film||'witness')+'/'+(row.repeat?'2/':'')+'">Review</a><div class="js-review-body">'+row.text+'</div></article>').join('');
function fixture(make){const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');if(url.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});if(!url.includes('/reviews/'))return new Response(html([]));return new Response(html(make(url)));}};}
for(const [sort,route]of Object.entries(routes))test('explicit '+sort+' sample uses verified route and preserves page provenance',async()=>{
 const h=fixture(()=>Array.from({length:12},(_,i)=>({author:'author'+i,text:'A complete distinct review number '+i+'.'}))),r=await fetchReviews(item,{sort,count:12,fetchImpl:h.fetchImpl});assert.equal(h.calls.at(-1),'https://letterboxd.com/film/witness/reviews/'+route);assert.equal(r.reviews.length,12);assert.equal(r.sampling.mode,sort);assert.equal(r.sampling.independentAuthors,12);assert.equal(r.sampling.unknownAuthors,0);assert.equal(r.sampling.representative,false);for(const row of r.reviews){assert.equal(row.source.sort,sort);assert.equal(row.source.page,1);assert.equal(row.source.url,h.calls.at(-1));assert.match(row.authorId,/^author\d+$/);}assert.equal(r.sources[0].accepted,12);
});
test('balanced bounded sample interleaves all four pools rather than filling with first page',async()=>{
 const h=fixture(url=>{const sort=Object.keys(routes).find(key=>url==='https://letterboxd.com/film/witness/reviews/'+routes[key]);return Array.from({length:20},(_,i)=>({author:sort+'author'+i,text:'Distinct '+sort+' perspective '+i+' with complete text.'}));}),r=await fetchReviews(item,{sort:'balanced',count:12,fetchImpl:h.fetchImpl});assert.equal(h.calls.filter(url=>url.includes('/reviews/')).length,4);assert.equal(r.reviews.length,12);assert.deepEqual(r.sampling.coverage,{popular:3,new:3,high:3,low:3});assert.equal(r.sources.length,4);assert(r.sources.every(source=>source.loaded===20&&source.accepted===3));assert.equal(r.excluded.requested,68);
});
test('multiple diary reviews by one canonical author do not inflate independent evidence',async()=>{
 const h=fixture(()=>[{author:'repeat',text:'First perspective about the acting.'},{author:'repeat',repeat:true,text:'Second diary entry about the pacing.'},...Array.from({length:10},(_,i)=>({author:'other'+i,text:'Distinct useful perspective '+i+' about acting.'}))]),r=await fetchReviews(item,{count:12,fetchImpl:h.fetchImpl});assert.equal(r.reviews.filter(row=>row.authorId==='repeat').length,1);assert.equal(r.sampling.independentAuthors,r.reviews.length);assert(r.excluded.author>0);
});
test('parser source keeps same-film metadata and canonical author identity without trusting displaynames',()=>{
 const r=parseLetterboxdReviews(html([{author:'First',text:'An opinion about the story.'},{author:'second',text:'A different opinion about the soundtrack.'},{author:'foreign',film:'another-film',text:'This review belongs to another film.'}]),{url:'https://letterboxd.com/film/witness/reviews/by/entry-rating-lowest/page/2/'});assert.equal(r.reviews.length,2);assert.equal(r.reviews[0].authorId,'first');assert.equal(r.reviews[1].authorId,'second');assert.equal(r.reviews[0].source.sort,'low');assert.equal(r.reviews[0].source.page,2);assert.equal(r.excluded.identity,1);
});
test('balanced cross-film redirect or silently changed sort cannot become mislabeled evidence',async()=>{
 for(const location of ['/film/wrong/reviews/by/entry-rating/','/film/witness/reviews/']){const h=fixture(()=>Array.from({length:2},(_,i)=>({author:'author'+i,text:'A complete distinct opinion '+i+'.'}))),original=h.fetchImpl;h.fetchImpl=(url,options)=>url.endsWith('/by/entry-rating/')?Promise.resolve(new Response(null,{status:302,headers:{location}})):original(url,options);await assert.rejects(fetchReviews(item,{sort:'balanced',count:12,fetchImpl:h.fetchImpl}),/different film|order changed/);}
});
test('unidentified displaynames stay unknown and do not fabricate independent authors',async()=>{
 const h=fixture(()=>Array.from({length:12},(_,i)=>({author:'user'+i,text:'A distinct complete perspective '+i+'.'})));const original=h.fetchImpl;h.fetchImpl=async(url,options)=>{const r=await original(url,options);if(!url.includes('/reviews/'))return r;return new Response((await r.text()).replace(/ href="[^"]+"/g,''));};const r=await fetchReviews(item,{count:12,fetchImpl:h.fetchImpl});assert.equal(r.reviews.length,12);assert.equal(r.sampling.independentAuthors,0);assert.equal(r.sampling.unknownAuthors,12);assert(r.reviews.every(row=>!row.authorId));
});
test('author identity cannot come from displayed name markup or conflict with the own review URL',()=>{
 const source={url:'https://letterboxd.com/film/witness/reviews/'};
 const first=parseLetterboxdReviews('<article><a class="name">name href="/pretend/"</a><div class="js-review-body">A real opinion without an author URL.</div></article>',source);assert.equal(first.reviews[0].authorId,undefined);
 const conflict=parseLetterboxdReviews(html([{author:'real',text:'A real review with a conflicting metadata URL.'}]).replace('/real/film/','/pretend/film/'),source);assert.equal(conflict.reviews[0].authorId,undefined);assert.equal(conflict.reviews[0].permalink,undefined);
});
test('rejected foreign-film text cannot suppress the same text in a legitimate current-film card',()=>{
 const r=parseLetterboxdReviews(html([{author:'wrong',film:'another-film',text:'Same opinion repeated on the correct film.'},{author:'right',text:'Same opinion repeated on the correct film.'}]),{url:'https://letterboxd.com/film/witness/reviews/'});assert.equal(r.reviews.length,1);assert.equal(r.reviews[0].authorId,'right');assert.equal(r.excluded.identity,1);
});
test('partial balanced coverage stays explicit after rate limiting without claiming missing pools',async()=>{
 const h=fixture(()=>[{author:'one',text:'A complete positive perspective.'},{author:'two',text:'A different complete perspective.'}]),original=h.fetchImpl;h.fetchImpl=(url,options)=>url.endsWith('/reviews/')?Promise.resolve(new Response('Rate limited',{status:429})):original(url,options);const r=await fetchReviews(item,{sort:'balanced',count:12,fetchImpl:h.fetchImpl});assert(r.partial&&r.limited);assert.match(r.warning,/429/);assert.equal(r.pages,1);assert.deepEqual(r.sampling.coverage,{popular:2,new:0,high:0,low:0});assert.equal(r.reviews.length,2);assert.equal(r.sources[0].accepted,2);
});
test('cancellation after one balanced page rejects rather than disguising it as partial success',async()=>{
 const controller=new AbortController(),h=fixture(()=>[{author:'one',text:'A complete source perspective.'}]),original=h.fetchImpl;h.fetchImpl=(url,options)=>{if(url.endsWith('/reviews/'))controller.abort();return original(url,options);};await assert.rejects(fetchReviews(item,{sort:'balanced',signal:controller.signal,fetchImpl:h.fetchImpl}),/abort/i);
});
test('unsupported sort is refused before any network request',async()=>{
 let calls=0;await assert.rejects(fetchReviews(item,{sort:'guessed-path',fetchImpl:async()=>{calls++;throw Error('Must not run');}}),/supported/);assert.equal(calls,0);
});
