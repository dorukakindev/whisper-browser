'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),{JSDOM}=require('jsdom'),M=require(path.join(root,'src/renderer/media-tools-model'));
const item={id:'film-fixture',kind:'film',title:'Fixture',year:2026,imdbId:'tt1234567',tmdbId:'movie:42'};
const rows=[{id:'one',text:'SECRET ENDING fixture culprit is revealed.',spoiler:true}];
const analysis={at:1,summary:'SECRET ENDING fixture culprit is revealed.',fit:'Conditional fit.',points:[{id:'one',quote:'SECRET ENDING',reason:'Fixture reason.',kind:'debate'}]};
const entry={identity:item,reviews:rows,analysis};
const wait=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
async function spoiler(){
 const dom=new JSDOM('<section class="media-title-page"><main></main></section>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 Object.assign(w,{UiLocale:{get:()=> 'en'},api:{mediaShelf:async()=>({ok:true,taste:{}}),mediaTools:async()=>({ok:true,value:{history:[entry]}})},MediaToolsUI:{reviewSnapshot:()=>null},LetterboxdReviews:require(path.join(root,'src/letterboxd-reviews'))});
 for(const p of ['src/renderer/media-tools-model.js','src/renderer/media-tools-ui.js','src/renderer/review-decision-ui.js'])w.eval(fs.readFileSync(path.join(root,p),'utf8'));
 w.document.querySelector('.media-title-page').open=true;
 const host=w.document.querySelector('main');w.MediaReviewDecision.mountTitle(host,item);await wait();
 assert(!host.textContent.includes('SECRET ENDING'));
 const filmGate=host.textContent.includes('Reveal spoiler analysis');
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Manage reviews').click();await wait();
 const history=host.querySelector('.mrv-saved-analyses');assert(history&&!history.open);history.querySelector('summary').click();await wait();
 const box=host.querySelector('.mtx-history'),out={filmGate,realManageReviewsButton:true,savedAnalysesDisclosureOpened:history.open,spoilerOption:host.querySelector('[name=review-spoilers]').checked,historyOpen:box.open,historySummaryVisible:box.querySelector('.mrv-summary').textContent.includes('SECRET ENDING')};
 assert(out.filmGate&&!out.spoilerOption&&out.historyOpen&&out.historySummaryVisible);w.close();return out;
}
async function feedback(){
 const disk=path.join(__dirname,'profile');fs.mkdirSync(disk,{recursive:true});const closes=[];
 const svc=require(path.join(root,'src/media-tools-service')).registerMediaTools({app:{getPath:()=>disk,on:(_,fn)=>closes.push(fn)},ipcMain:{handle(){}},authorized:()=>true,owner:()=>null,dialog:{},catalogStore:()=>({get:()=>item}),resolveDiscovery:async()=>({ok:true,item:{...item,providerId:item.imdbId}})});
 const discovery={kind:'film',id:item.imdbId},did='discovery:film:'+item.imdbId;
 try{
  assert((await svc.handle({},{action:'feedback-save',itemId:item.id,reaction:'like',note:'Earlier library reaction'})).ok);
  await new Promise(r=>setTimeout(r,10));
  assert((await svc.handle({},{action:'feedback-save',itemId:did,discovery,reaction:'dislike',note:'Latest corrected reaction'})).ok);
  const library=await svc.handle({},{action:'decision-get',itemId:item.id}),discover=await svc.handle({},{action:'decision-get',itemId:did,discovery});
  assert.equal(library.value.feedback.reaction,'like');assert.equal(discover.value.feedback.reaction,'dislike');assert(discover.value.feedback.at>library.value.feedback.at);
  return {library:library.value.feedback,discovery:discover.value.feedback,newerSharedFeedbackIgnored:true};
 }finally{closes.forEach(fn=>fn());}
}
async function sampling(){
 const make=(author,body)=>`<article><a class="name" href="/${author}/">${author}</a><a href="/${author}/film/fixture/">Review</a><div class="js-review-body">${body}</div></article>`;
 const first='First distinct review text is available.',second='Another valid public source text is available.';
 const calls=[];
 const result=await require(path.join(root,'src/letterboxd-auto')).fetchReviews(item,{count:2,sort:'popular',readPage:async url=>{calls.push(url);if(url.includes('/tmdb/'))return {url:'https://letterboxd.com/film/fixture/',html:'<h1>Fixture</h1>'};return {url,html:'<meta property="og:title" content="Fixture (2026)"><div data-tmdb-id="42"></div>'+ (calls.length===2?make('author-a',first)+make('author-a',second).replace('/film/fixture/','/film/fixture/2/'):calls.length===3?make('author-b',second):'')};}});
 assert.equal(result.reviews.length,1);assert.equal(result.excluded.author,1);assert.equal(result.excluded.duplicate,1);
 const control=await require(path.join(root,'src/letterboxd-auto')).fetchReviews(item,{count:2,sort:'popular',readPage:async url=>({url:url.includes('/tmdb/')?'https://letterboxd.com/film/fixture/':url,html:'<meta property="og:title" content="Fixture (2026)"><div data-tmdb-id="42"></div>'+make('author-a',first)+make('author-b',second)})});
 assert.equal(control.reviews.length,2);return {withRepeatedAuthor:result.reviews.map(r=>r.authorId),excluded:result.excluded,withoutRejectedRow:control.reviews.map(r=>r.authorId),calls};
}
(async()=>{const result={head:'2cc48e6d49fcc8552bd62fda51fb4bf67cc77b0e',spoiler:await spoiler(),feedback:await feedback(),sampling:await sampling(),networkRequests:0};fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
