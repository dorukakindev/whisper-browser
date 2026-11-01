'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../src/letterboxd-reviews'),M=require('../src/renderer/media-tools-model');
const source='https://letterboxd.com/film/witness/reviews/by/activity/';
const prefix='A thoughtful review about the dialogue and acting';
const card=(endpoint='/s/full-text/viewing:123/',body=`<div class="collapsed-text"><p>${prefix}… <a href="#" data-js-trigger="collapsible.expand">more</a></p></div>`)=>`<article><a class="name" href="/reader/">Reader</a><div class="js-review-body" data-full-text-url="${endpoint}">${body}</div><a href="/reader/film/witness/">Review</a></article>`;
test('More full endpoint is strict and a normal sentence containing more never causes a request',async()=>{
 assert.equal(R.fullTextUrl('/s/full-text/viewing:123/'),'https://letterboxd.com/s/full-text/viewing:123/');
 for(const u of ['https://evil.test/s/full-text/viewing:1/','https://letterboxd.com@evil.test/s/full-text/viewing:1/','https://letterboxd.com/s/full-text/viewing:1/?token=bad','//evil.test/s/full-text/viewing:1/','/s/full-text/viewing:1/#fragment','/account/'])assert.equal(R.fullTextUrl(u),null);
 let calls=0;const expanded=await R.expandReviewHtml(card('/s/full-text/viewing:123/','<p>I would like to hear more thoughtful dialogue in this film.</p>'),{load:async()=>{calls++;}});assert.equal(calls,0);assert.equal(expanded.expanded,0);assert.equal(R.parseLetterboxdReviews(expanded.html).reviews.length,1);
});
test('Full review retains later paragraphs beyond4000 through parser, renderer normalization, transport and saved snapshot',async()=>{
 const full=prefix+' '+('A later complete paragraph about character motives. '.repeat(110))+' END830';
 const expanded=await R.expandReviewHtml(card(),{load:async url=>{assert.equal(url,R.fullTextUrl('/s/full-text/viewing:123/'));return '<p>'+full.slice(0,300)+'</p><p>'+full.slice(300)+'</p>';}});
 assert.equal(expanded.expanded,1);assert.equal(expanded.failed,0);const r=R.parseLetterboxdReviews(expanded.html,{url:source}).reviews[0];assert(r.text.length>4000);assert(r.text.endsWith('END830'));assert.equal(r.authorId,'reader');assert.equal(r.permalink,'https://letterboxd.com/reader/film/witness/');assert.equal(r.source.url,source);assert.doesNotMatch(r.text,/\bmore$/);
 assert.deepEqual(M.reviewRows(JSON.stringify([r])),[r]);const item={title:'Witness',kind:'film',year:2026},e=M.decisionEvidence(item,[r],{});assert.equal(e.sample.truncated,0);assert.equal(e.evidence.reviews[0].text,r.text);assert(M.normalizeReviewAnalysis(JSON.stringify(e.evidence)));assert(M.validateEvidenceSnapshot({version:1,context:JSON.stringify(e.evidence),profile:e.evidence.profile},e.sample.reviews,item));
});
test('Unavailable, mismatched, challenge, oversized or unsafe full text is excluded, never silently used as teaser evidence',async()=>{
 for(const load of [async()=>{throw Error('HTTP403');},async()=>'<title>Just a moment</title>',async()=>'<p>Another entirely different review.</p>',async()=>'<p>'+prefix+'x'.repeat(20001)+'</p>',async()=>card()]){
  const x=await R.expandReviewHtml(card(),{load});assert.equal(x.failed,1);const p=R.parseLetterboxdReviews(x.html,{url:source});assert.equal(p.reviews.length,0);assert.equal(p.excluded.incomplete,1);assert.equal(p.limited,true);
 }
 let calls=0;const x=await R.expandReviewHtml(card('https://evil.test/private'),{load:async()=>{calls++;}});assert.equal(calls,0);assert.equal(x.failed,1);assert.equal(R.parseLetterboxdReviews(card()).excluded.incomplete,1);
});
test('Cancellation during a continuation aborts the collection and script fragments cannot create requests or execute',async()=>{
 const c=new AbortController();await assert.rejects(R.expandReviewHtml(card(),{signal:c.signal,load:async()=>{c.abort();return '<p>'+prefix+'</p>';}}),{name:'AbortError'});
 let calls=0;const x=await R.expandReviewHtml('<script>'+card()+'</script>'+card('/s/full-text/viewing:123/','<p>Visible complete review text only.</p>'),{load:async()=>{calls++;}});assert.equal(calls,0);assert.equal(R.parseLetterboxdReviews(x.html).reviews.length,1);
 const y=await R.expandReviewHtml(card(),{load:async()=>'<p>'+prefix+' &amp; safe end.</p><script>bad()</script>'});assert.doesNotMatch(y.html,/<script>|bad\(\)/);assert(R.parseLetterboxdReviews(y.html).reviews[0].text.endsWith('& safe end.'));
});
test('Analysis preview shortens only within its existing budget and says so; overlong imports do not silently truncate',()=>{
 const rows=Array.from({length:20},(_,i)=>({id:String(i),text:'Long review '+i+' '+('readable text '.repeat(850))})),e=M.decisionEvidence({kind:'film',title:'Witness'},rows,{});assert(e.sample.truncated>0);assert(JSON.stringify(e.evidence).length<=64000);assert(e.sample.decisions.some(r=>r.reason==='shortened'));assert.throws(()=>M.reviewRows(JSON.stringify([{text:'x'.repeat(20001)}])),/20,000/);
});
test('Automatic HTTP collection loads the own full endpoint before accepting the exact source card',async()=>{
 const {fetchReviews}=require('../src/letterboxd-auto'),calls=[];
 const fetchImpl=async(url)=>{calls.push(url);if(url.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});if(url.includes('/s/full-text/'))return new Response('<p>'+prefix+' and the complete final conclusion END830.</p>');return new Response('<meta property="og:title" content="Witness (2026) • Letterboxd"><div data-tmdb-id="123"></div>'+card());};
 const result=await fetchReviews({kind:'film',title:'Witness',year:2026,tmdbId:'movie:123'},{count:1,fetchImpl});assert.equal(result.reviews.length,1);assert(result.reviews[0].text.endsWith('END830.'));assert(calls.includes(R.fullTextUrl('/s/full-text/viewing:123/')));assert.equal(result.reviews[0].source.url,source);
});
test('Open-page continuation cancellation rejects promptly, preserves source guards and uses the original tab',async()=>{
 const tab={generation:1,view:{webContents:{isDestroyed:()=>false,getURL:()=>source}}},abort=new AbortController();let announce,finish;
 const started=new Promise(resolve=>announce=resolve);
 const pending=R.readBrowserReviews({getTab:()=>tab,signal:abort.signal,execute:async(_view,script)=>{if(script===R.reviewPageScript())return [{url:source,html:card()}];announce();return new Promise(resolve=>finish=resolve);}});
 await started;abort.abort();await assert.rejects(pending,{name:'AbortError'});finish(['<p>'+prefix+' and full ending.</p>']);
 const second=await R.readBrowserReviews({getTab:()=>tab,execute:async(_view,script)=>script===R.reviewPageScript()?[{url:source,html:card()}]:['<p>'+prefix+' and full ending.</p>']});assert.equal(second.reviews.length,1);assert(second.reviews[0].text.endsWith('full ending.'));
});
test('Two concurrent continuation loads preserve source row order even when the second resolves first',async()=>{
 let release;const expanded=R.expandReviewHtml(card()+card('/s/full-text/viewing:124/'),{load:async url=>url.endsWith(':123/')?new Promise(resolve=>release=()=>resolve('<p>'+prefix+' FIRST END.</p>')):'<p>'+prefix+' SECOND END.</p>'});
 await new Promise(resolve=>setImmediate(resolve));release();const r=R.parseLetterboxdReviews((await expanded).html).reviews;assert.equal(r.length,2);assert(r[0].text.endsWith('FIRST END.'));assert(r[1].text.endsWith('SECOND END.'));
});
test('Open-browser source job supports stop and cannot return a stale film after awaiting full text',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'full-review830-')),app=new EventEmitter();app.getPath=()=>directory;let started,release,mode='cancel';const ready=new Promise(resolve=>started=resolve),item={id:'film',kind:'film',title:'Witness',year:2026,tmdbId:'movie:123'};
 const service=require('../src/media-tools-service').registerMediaTools({app,ipcMain:{handle(){}},authorized:()=>true,dialog:{},owner:()=>null,catalogStore:()=>({get:()=>item}),readOpenReviews:async({signal})=>{if(mode==='cancel'){started();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}else await new Promise(resolve=>release=resolve);return {identity:{title:'Witness',year:2026},reviews:[{id:'1',text:'A complete review of the film.'}]};}});
 try{const pending=service.handle({}, {action:'reviews-browser',itemId:'film',id:'open830'});await ready;assert((await service.handle({}, {action:'reviews-stop',id:'open830'})).ok);assert.equal((await pending).ok,false);
  mode='stale';const stale=service.handle({}, {action:'reviews-browser',itemId:'film',id:'next830'});await new Promise(resolve=>setImmediate(resolve));item.tmdbId='movie:999';release();const result=await stale;assert.equal(result.ok,false);assert.match(result.error,/film match changed/);
 }finally{app.emit('before-quit');fs.rmSync(directory,{recursive:true,force:true});}
});
