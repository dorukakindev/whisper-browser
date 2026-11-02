'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const model=require('../src/renderer/media-tools-model'),letterboxd=require('../src/letterboxd-reviews');
function fixture(t){
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'));};
 const item={id:'one',kind:'film',title:'Exact film',year:2024,imdbId:'tt1234567'},old={id:'old',author:'Old reviewer',text:'An older opinion about this film.',spoiler:false},fresh={id:'fresh',author:'New reviewer',text:'The atmosphere is superb but the pacing drags.',spoiler:false};
 const identity=row=>JSON.stringify([row.kind,row.title,row.year,row.imdbId||row.providerId,row.tmdbId]);
 const analysis={summary:'One new review praises atmosphere and criticizes pace.',fit:'Conditional only.',points:[{id:'fresh',quote:'the pacing drags',reason:'This reviewer discusses pace.',kind:'criticism'}]};
 const result={identity:model.decisionProviderIdentity(item),match:{state:'matched'},reviews:[fresh],analysisReviews:[fresh],analysis,requestedCount:40,loadedCount:1,analyzedCount:1,partial:true,personalEvidence:false};
 w.MediaToolsModel=model;w.LetterboxdReviews=letterboxd;w.MediaToolsUI={reviewSnapshot:()=>({match:{state:'matched'},identity:result.identity,reviews:[old]})};
 w.api={mediaTools:async()=>({ok:true,value:{history:[]}}),mediaCatalog:async()=>({ok:true,items:[item]}),personalMedia:async()=>({ok:true,item:null}),mediaShelf:async()=>({ok:true,taste:{preferencesConfigured:false}})};
 w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/assistant-film-actions.js'),'utf8'));
 const helpers={guard:()=>{},identity,title:async()=>({key:{catalogId:'one'},row:item})};return {w,item,result,fresh,helpers,read:()=>w.AssistantFilmActions.execute('get_film_context',{item_id:'catalog:one'},helpers)};
}
test('Fresh analysis remains citeable for follow-up while an older editable sample is preserved',async t=>{
 const h=fixture(t),actions=h.w.AssistantFilmActions;actions.rememberReviewEvidence(h.item,h.result);
 const packet=await actions.reviewEvidenceResult('catalog:one',h.helpers);
 assert.equal(packet.film.scope,'current-assistant-sample');assert.equal(packet.film.analysis.historical,false);
 assert.equal(packet.film.sample.requestedCount,40);assert.equal(packet.film.sample.loadedCount,1);assert.equal(packet.film.sample.analyzedCount,1);assert.equal(packet.film.sample.partial,true);assert.equal(packet.film.personalEvidence,false);
 assert.equal(packet.citations[0].reviewId,'fresh');assert.equal(h.w.MediaToolsUI.reviewSnapshot().reviews[0].id,'old');
 assert.equal((await h.read()).citations[0].id,packet.citations[0].id);
 const dialog=await actions.revealCitation(packet.citations[0]);assert.equal(dialog.querySelector('mark').textContent,'the pacing drags');dialog.close();
 h.fresh.text='Mutated transport object';assert.equal((await h.read()).citations[0].text,'the pacing drags');
 h.item.year=2025;await assert.rejects(actions.revealCitation(packet.citations[0]),/changed|unavailable|değişti|bulunamıyor/);
});
test('Retained evidence rejects mismatched identities and unsupported quotes without replacing a good result',async t=>{
 const h=fixture(t),actions=h.w.AssistantFilmActions;actions.rememberReviewEvidence(h.item,h.result);
 assert.throws(()=>actions.rememberReviewEvidence(h.item,{...h.result,identity:{imdbId:'tt7654321'}}),/match/i);
 assert.throws(()=>actions.rememberReviewEvidence(h.item,{...h.result,analysis:{...h.result.analysis,points:[{id:'fresh',quote:'invented pacing quote'}]}}),/quote|verified/i);
 assert.equal((await h.read()).citations[0].text,'the pacing drags');
});
test('Spoiler-bearing retained samples expose accurate counts but never quotes or summaries',async t=>{
 const h=fixture(t);h.result.reviews[0].spoiler=true;h.w.AssistantFilmActions.rememberReviewEvidence(h.item,h.result);
 const r=await h.read();assert.equal(r.film.analysis,null);assert.equal(r.film.spoilersHidden,true);assert.equal(r.film.sourceCount,0);assert.equal(r.film.sample.loadedCount,1);assert.equal(r.citations.length,0);
});
test('Current title selection supplies an exact personal target before browser-title guessing',t=>{
 const h=fixture(t),actions=h.w.AssistantFilmActions;
 let context={type:'discovery-title',id:'discovery:film:tt1234567',catalogId:'discovery:film:tt1234567',title:'Exact film'};
 h.w.globalAssistantContext=()=>context;h.w.MediaExperience={context:()=>({type:'library-title',id:'stale-film'})};
 assert.equal(actions.selectedTitleId(),'discovery:film:tt1234567');
 context={type:'library-title',id:'one',catalogId:'catalog:one'};assert.equal(actions.selectedTitleId(),'catalog:one');
 context={type:'library-title',id:'decision-job',catalogId:'one'};assert.equal(actions.selectedTitleId(),'catalog:one');
 context={type:'discovery-title',id:'discovery:series:tt7654321'};assert.equal(actions.selectedTitleId(),'discovery:series:tt7654321');
 for(const candidate of [{type:'library-title',id:'person:7',catalogId:'catalog:person:7'},{type:'page',title:'Exact film'},{type:'library-title',id:'C:\\private\\film.mp4'},{type:'discovery-title',id:'tt1234567'},{type:'media-tool',id:'one'},null]){context=candidate;assert.equal(actions.selectedTitleId(),null);}
});
