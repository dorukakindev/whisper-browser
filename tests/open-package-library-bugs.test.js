'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const R=require('../src/letterboxd-reviews'),taste=require('../src/media-taste');
const item={id:'film',kind:'film',title:'Witness',year:2026,tmdbId:'movie:123',imdbId:'tt1234567'};
const url='https://letterboxd.com/film/witness/reviews/by/activity/';
const meta='<meta property="og:title" content="Witness (2026)"><div data-tmdb-id="123"></div>';
const card=(author,text,suffix='')=>`<article><a class="name" href="/${author}/">${author}</a><a href="/${author}/film/witness/${suffix}">Review</a><div class="js-review-body">${text}</div></article>`;
const prefix='A thoughtful review about the dialogue and acting';
const collapsed=`<article><div class="js-review-body" data-full-text-url="/s/full-text/viewing:123/"><div class="collapsed-text"><p>${prefix}… <a data-js-trigger="collapsible.expand">more</a></p></div></div></article>`;
function service(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'open-library-')),app=new EventEmitter();app.getPath=()=>dir;
 let selected={...item};const svc=require('../src/media-tools-service').registerMediaTools({app,ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get:()=>({...selected})}),resolveDiscovery:async()=>({ok:true,item:{...item,providerId:item.imdbId}}),...options});
 return {dir,request:input=>svc.handle({},input),change:()=>{selected={...selected,title:'Another film',tmdbId:'movie:999'};},close:()=>{app.emit('before-quit');fs.rmSync(dir,{recursive:true,force:true});}};
}
test('F835-04: latest verified feedback wins on both surfaces; legacy feedback stays local',async()=>{
 const f=service(),discovery={kind:'film',id:item.imdbId},did='discovery:film:'+item.imdbId;
 try{
  const stored={version:1,titles:{film:{feedback:{reaction:'like',note:'earlier',at:1},feedbackIdentity:item},[did]:{feedback:{reaction:'dislike',note:'newest',at:2},feedbackIdentity:item}}};
  fs.writeFileSync(path.join(f.dir,'media-enrichment.json'),JSON.stringify(stored));
  for(const input of [{itemId:item.id},{itemId:did,discovery}])assert.equal((await f.request({action:'decision-get',...input})).value.feedback.note,'newest');
  delete stored.titles.film.feedbackIdentity;fs.writeFileSync(path.join(f.dir,'media-enrichment.json'),JSON.stringify(stored));
  assert.equal((await f.request({action:'decision-get',itemId:item.id})).value.feedback.note,'earlier');
 }finally{f.close();}
});
test('F835-05: a rejected repeat author cannot poison later accepted text',async()=>{
 let pages=0;const text='Another valid public source text is available.';
 const result=await require('../src/letterboxd-auto').fetchReviews(item,{count:2,readPage:async address=>({url:address.includes('/tmdb/')?'https://letterboxd.com/film/witness/':address,html:meta+(address.includes('/tmdb/')?'':++pages===1?card('a','First distinct review text is available.')+card('a',text,'2/'):pages===2?card('b',text):'')})});
 assert.equal(result.reviews.length,2);assert.equal(result.excluded.author,1);assert.equal(result.excluded.duplicate,0);
});
test('F837-03: original-title aliases preserve metadata and personal scores without ambiguous guesses',()=>{
 const diary=[{title:'Original Film',year:2020,rating:1}],film={id:'one',kind:'film',title:'Yerel Film',originalTitle:'Original Film',year:2020,ratings:{personal:'9'},genres:['Drama']};
 const p=taste.profile(diary,[film]);assert.equal(p.average,4.5);assert.equal(p.metadataMatched,1);assert.equal(p.genres[0].count,1);
 const ambiguous=taste.profile(diary,[film,{...film,id:'two',title:'Other local name'}]);assert.equal(ambiguous.metadataMatched,0);assert.equal(ambiguous.average,1);
});
test('F837-04: rewatch events remain but distinct-film support uses latest rating',()=>{
 const diary=[{title:'Repeat',year:2020,rating:1,watchedDate:'2026-01-01'},{title:'Repeat',year:2020,rating:5,watchedDate:'2026-02-01'}];
 const p=taste.profile(diary,[{id:'repeat',kind:'film',title:'Repeat',year:2020,genres:['Drama']}]);
 assert.equal(p.genres[0].count,1);assert.equal(p.genres[0].confidence,'single');assert.deepEqual(p.genres[0].titles,['Repeat']);assert.equal(p.genres[0].average,5);assert.equal(p.titles,1);assert.equal(p.watchEvents,2);assert.deepEqual(p.months,[['2026-01',1],['2026-02',1]]);
});
test('F840-01: full-review HTTP403 reaches browser collection for all and mixed samples',async()=>{
 for(const mixed of [false,true]){
  let calls=0;const f=service({fetchImpl:async address=>address.includes('/tmdb/')?new Response(null,{status:302,headers:{location:'/film/witness/'}}):address.includes('/s/full-text/')?new Response('',{status:403}):new Response(meta+collapsed+(mixed?card('other','A separate complete review praises the performances.') :'')),collectBrowserReviews:async()=>{calls++;return {reviews:[{id:'browser',text:'Complete browser text includes the ending.'}],match:{state:'matched'}};}});
  try{const result=await f.request({action:'reviews-auto',itemId:'film',id:'block',count:2});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.equal(result.transport,'browser');}finally{f.close();}
 }
});
test('F840-02: pending public continuation rejects changed catalog identity',async()=>{
 let started,release;const ready=new Promise(r=>started=r);const f=service({fetchImpl:async address=>{if(address.includes('/s/full-text/')){started();await new Promise(r=>release=r);return new Response('<p>'+prefix+' with the complete ending.</p>');}return new Response(meta+collapsed);}});
 try{const pending=f.request({action:'reviews-fetch',itemId:'film',id:'stale',url});await ready;f.change();release();const result=await pending;assert.equal(result.ok,false);assert.match(result.error,/film match changed/i);}finally{f.close();}
});
test('F840-03: review links cannot become film TMDB metadata in parser or browser extraction',()=>{
 const {JSDOM}=require('jsdom');
 const html='<meta property="og:title" content="Witness (2026)">'+card('reader','I prefer this to <a href="https://www.themoviedb.org/movie/999">another film</a> for its dialogue.')+'<a href="https://www.themoviedb.org/movie/123">Film metadata</a>';
 const dom=new JSDOM(html,{url,runScripts:'outside-only'});
 try{for(const input of [html,dom.window.eval(R.reviewPageScript()).html]){const parsed=R.parseLetterboxdReviews(input,{url});assert.equal(parsed.identity.tmdbId,'movie:123');assert.equal(R.matchFilm(item,parsed.identity).state,'matched');}
  const conflict=R.parseLetterboxdReviews(html+'<a href="https://www.themoviedb.org/movie/456">Conflicting metadata</a>',{url});assert.equal(R.matchFilm(item,conflict.identity).state,'unverified');
 }finally{dom.window.close();}
});
test('F835-03: historical spoiler consent is independent of source inclusion checkbox',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<section class="media-title-page"><main></main></section>',{runScripts:'outside-only'}),w=dom.window;
 const entry={identity:item,reviews:[{id:'one',text:'SECRET ENDING fixture culprit is revealed.',spoiler:true}],analysis:{at:1,summary:'SECRET ENDING fixture culprit is revealed.',fit:'Conditional fit.',points:[{id:'one',quote:'SECRET ENDING',reason:'Fixture reason.',kind:'debate'}]}};
 w.HTMLElement.prototype.scrollIntoView=function(){};Object.assign(w,{UiLocale:{get:()=> 'en'},api:{mediaShelf:async()=>({ok:true,taste:{}}),mediaTools:async()=>({ok:true,value:{history:[entry]}})},MediaToolsUI:{reviewSnapshot:()=>({spoiler:true})},LetterboxdReviews:R});
 try{for(const file of ['media-tools-model.js','review-decision-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8'));const host=w.document.querySelector('main');w.MediaReviewDecision.mount(host,item,{history:[entry]},{spoiler:true},{current:()=>true,redraw:()=>{},status:()=>{},inline:true});const history=host.querySelector('.mrv-saved-analyses');history.querySelector('summary').click();assert.equal(host.querySelector('[name=review-spoilers]').checked,true);assert(!history.textContent.includes('SECRET ENDING'));const reveal=history.querySelector('[data-review-spoiler-gate] button');assert(reveal);reveal.click();assert(history.textContent.includes('SECRET ENDING'));}finally{dom.window.close();}
});
