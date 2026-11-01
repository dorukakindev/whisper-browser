'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'../../../..'),out=__dirname;
const registry=require(path.join(root,'docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'));
fs.writeFileSync(path.join(out,'registry-reviewed.json'),JSON.stringify(registry.scenarios.filter(x=>['F40','F48'].includes(x.family)),null,2));
const {registerMediaTools}=require(path.join(root,'src/media-tools-service'));
const url='https://letterboxd.com/film/witness/reviews/by/activity/';
const prefix='A thoughtful review about the dialogue and acting';
const meta='<meta property="og:title" content="Witness (2026) • Letterboxd"><div data-tmdb-id="123"></div>';
const collapsed='<article><a class="name" href="/reader/">Reader</a><div class="js-review-body" data-full-text-url="/s/full-text/viewing:123/"><div class="collapsed-text"><p>'+prefix+'… <a data-js-trigger="collapsible.expand">more</a></p></div></div></article>';
const complete='<article><a class="name" href="/other/">Other</a><div class="js-review-body"><p>A separate complete review praises the performances.</p></div></article>';
async function run(mode){
 const app=new EventEmitter();app.getPath=()=>path.join(root,'.tmp/audit840/spec',mode);fs.mkdirSync(app.getPath(),{recursive:true});
 let item={id:'film',kind:'film',title:'Witness',year:2026,tmdbId:'movie:123'},browserCalls=0,lookups=0,announce,release;
 const started=new Promise(r=>announce=r),requests=[];
 const fetchImpl=async address=>{requests.push(address);if(address.includes('/tmdb/'))return new Response(null,{status:302,headers:{location:'/film/witness/'}});
 if(mode==='page403'&&address.includes('/reviews/'))return new Response('',{status:403});
 if(address.includes('/s/full-text/')){if(mode==='stale'){announce();await new Promise(r=>release=r);return new Response('<p>'+prefix+' and a complete ending.</p>');}return new Response('',{status:403});}
 return new Response(meta+collapsed+(mode==='mixed403'?complete:''));};
 const service=registerMediaTools({app,ipcMain:{handle(){}},authorized:()=>true,dialog:{},owner:()=>null,catalogStore:()=>({get:()=>{lookups++;return {...item};}}),fetchImpl,collectBrowserReviews:async()=>{browserCalls++;return {reviews:[{id:'browser',text:'Browser successfully read this public complete review.'}],match:{state:'matched'}};}});
 try{const pending=service.handle({}, {action:mode==='stale'?'reviews-fetch':'reviews-auto',itemId:'film',id:mode,count:2,url});if(mode==='stale'){await started;item={...item,title:'Another Film',tmdbId:'movie:999'};release();}const result=await pending;return {mode,result,browserCalls,lookups,requests,currentItem:item};}finally{app.emit('before-quit');}
}
(async()=>{const results=[];for(const mode of ['all403','mixed403','page403','stale'])results.push(await run(mode));
 assert.equal(results[0].result.ok,false);assert.equal(results[0].browserCalls,0);
 assert.equal(results[1].result.ok,true);assert.equal(results[1].result.partial,true);assert.equal(results[1].browserCalls,0);
 assert.equal(results[2].result.ok,true);assert.equal(results[2].browserCalls,1);
 assert.equal(results[3].result.ok,true);assert.equal(results[3].result.match.state,'matched');assert.equal(results[3].lookups,1);assert.notEqual(results[3].result.identity.tmdbId,results[3].currentItem.tmdbId);
 const {JSDOM}=require('jsdom'),R=require(path.join(root,'src/letterboxd-reviews'));
 const identityResults=[];
 for(const withLink of [false,true]){
  const html='<meta property="og:title" content="Witness (2026)"><article><div class="js-review-body"><p>I liked this more than '+(withLink?'<a href="https://www.themoviedb.org/movie/999">another film</a>':'another film')+' because of its dialogue.</p></div></article><a href="https://www.themoviedb.org/movie/123">Official film metadata</a>';
  const dom=new JSDOM(html,{url,runScripts:'outside-only'});try{const extracted=dom.window.eval(R.reviewPageScript()),parsed=R.parseLetterboxdReviews(extracted.html,{url});identityResults.push({withLink,identity:parsed.identity,match:R.matchFilm({kind:'film',title:'Witness',year:2026,tmdbId:'movie:123'},parsed.identity)});}finally{dom.window.close();}
 }
 assert.equal(identityResults[0].match.state,'matched');assert.equal(identityResults[1].match.state,'mismatch');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({head:'f3713c9fe7855f9e9a92bab5fcf65e2d5a69a74d',controlledNetwork:true,liveProviderCalls:0,results,identityResults},null,2));console.log(JSON.stringify({requests:results.map(({mode,result,browserCalls,lookups})=>({mode,ok:result.ok,error:result.error,partial:result.partial,browserCalls,lookups,match:result.match,excluded:result.excluded})),identityResults},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
