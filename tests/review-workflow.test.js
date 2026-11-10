 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');const reviews=require('../src/letterboxd-reviews');
const html='<meta property="og:title" content="Reviews of The Matrix (1999) • Letterboxd"><div data-tmdb-id="603"></div><li><a class="name">Public reviewer</a><div class="js-review-body"><p>Strong acting and a memorable atmosphere.</p></div><form><input value="PRIVATE"></form><script>SECRET</script></li>';
test('Film identity compares TMDB ids first, rejects remakes and retains unknown status without evidence',()=>{
 const p=reviews.parseLetterboxdReviews(html);assert.equal(p.identity.title,'The Matrix');assert.equal(p.identity.year,1999);assert.equal(p.identity.tmdbId,'movie:603');
 assert.equal(reviews.matchFilm({kind:'film',title:'Matrix',year:1999,tmdbId:'movie:603'},p.identity).state,'matched');assert.equal(reviews.matchFilm({kind:'film',title:'The Matrix',year:2021},p.identity).state,'mismatch');assert.equal(reviews.matchFilm({kind:'film',title:'Another',year:1999,tmdbId:'movie:7'},p.identity).state,'mismatch');assert.equal(reviews.matchFilm({kind:'series',title:'The Matrix'},p.identity).state,'mismatch');assert.equal(reviews.matchFilm({kind:'film',title:'The Matrix',year:1999},{title:'The Matrix',year:1999}).state,'matched');assert.equal(reviews.matchFilm({kind:'film',title:'The Matrix'},{}).state,'unverified');
});
test('Loaded browser review extraction excludes forms/scripts and rejects foreign URLs, challenges and stale navigation',async()=>{
 const url='https://letterboxd.com/film/the-matrix/reviews/',dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window;let tab={generation:1,view:{webContents:{getURL:()=>url,isDestroyed:()=>false}}};
 try{const extracted=w.eval(reviews.reviewPageScript());assert.doesNotMatch(extracted.html,/PRIVATE|SECRET|<form|<input/);const data=await reviews.readBrowserReviews({getTab:()=>tab,execute:async()=>[extracted]});assert.equal(data.reviews.length,1);assert.equal(data.identity.tmdbId,'movie:603');assert.equal(data.origin,'browser');await assert.rejects(reviews.readBrowserReviews({getTab:()=>tab,execute:async()=>{tab.generation++;return [extracted];}}),/source changed/);await assert.rejects(reviews.readBrowserReviews({getTab:()=>tab,execute:async()=>[{blocked:true}]}),/verification/);for(const bad of ['https://letterboxd.com/user/review/1/','https://evil.test/film/a/','https://user:pass@letterboxd.com/film/a/'])assert.equal(reviews.publicFilmUrl(bad),null);
 }finally{w.close();}
});
function ui(draft={},options={}){const dom=new JSDOM('<dialog open><main></main></dialog>',{runScripts:'outside-only',url:'https://fixture.test/'}),w=dom.window,calls=[];let context={};const evidence=[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture',spoiler:false}];
 w.LetterboxdReviews=reviews;Object.assign(w,{UiLocale:{get:()=> 'en'},player:{job:null},state:{running:false,queueRunning:false},aiChatPreparing:null,buildOptsFromUI:()=>({}),translationEndpointReady:()=>true,globalAssistantContext:()=>context,MediaExperience:{setContext:(_,c)=>context=c},api:{mediaTools:async packet=>{calls.push(packet);if(packet.action==='decision-save')return {ok:true};if(packet.action==='reviews-browser')return {ok:true,reviews:evidence,identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/'};return {ok:false,error:'Controlled failure'};},mediaShelf:async()=>({ok:true,taste:options.taste||{preferencesConfigured:false}}),openExternal:async()=>{}},aiChatSend:async()=>{}});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(fs.readFileSync(require.resolve('../src/renderer/media-tools-model'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/review-decision-ui'),'utf8'));
 w.MediaReviewDecision.mount(w.document.querySelector('main'),options.item||{id:'film',title:'The Matrix',year:1999},options.saved||{},draft,{current:options.current||(()=>true),redraw:()=>calls.push('redraw'),status:()=>{}});const click=text=>[...w.document.querySelectorAll('button')].find(n=>n.textContent===text).click(),wait=()=>new Promise(setImmediate);return {w,draft,calls,click,wait,context:()=>context};}

test('review count accepts arbitrary 1–48 integers, persists the draft and blocks invalid input before source calls',async()=>{
 const u=ui({},{item:{id:'film',kind:'film',tmdbId:'movie:603',title:'The Matrix',year:1999}});
 try{
  let count=u.w.document.querySelector('[name=letterboxd-sample-count]');assert.equal(count.type,'number');assert.equal(count.min,'1');assert.equal(count.max,'48');assert.equal(count.step,'1');assert.equal(count.value,'40');assert.match(count.closest('label').textContent,/1–48/);
  count.value='37';count.dispatchEvent(new u.w.Event('input'));assert.equal(u.draft.sampleCount,37);
  const body=u.w.document.querySelector('main');body.replaceChildren();u.w.MediaReviewDecision.mount(body,{id:'film',kind:'film',title:'The Matrix',year:1999,tmdbId:'movie:603'},{},u.draft,{current:()=>true,redraw(){},status(){}});count=u.w.document.querySelector('[name=letterboxd-sample-count]');assert.equal(count.value,'37');
  for(const value of ['','0','49','1.5','-1']){const before=u.calls.length;count.value=value;u.click('Find this film & get reviews');await u.wait();assert.equal(u.calls.length,before);assert.match(u.draft.attempt.error,/whole review count from 1 to 48/);assert.equal(u.draft.sampleCount,37);}
  count.value='30';count.dispatchEvent(new u.w.Event('input'));u.click('Find this film & get reviews');await u.wait();const request=u.calls.find(row=>row.action==='reviews-auto');assert.equal(request.count,30);assert.equal(request.sort,'popular');assert.equal(u.draft.sampleCount,30);
 }finally{u.w.close();}
});
test('Review workflow uses an open page, blocks mismatched films and preserves invalid/failed results for retry',async()=>{
 const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();assert.equal(u.draft.source.match.state,'matched');assert.match(u.w.document.querySelector('.mrv-provenance').textContent,/verified/);u.draft.source.match.state='mismatch';u.click('Preview & analyze');await u.wait();assert(!u.w.document.querySelector('.mrv-sample'));assert.match(u.w.document.querySelector('.mrv-job').textContent,/another title/);u.draft.source.match.state='matched';u.click('Preview & analyze');await u.wait();assert(u.w.document.querySelector('[name=review-title-confirmed]').checked);
 u.w.aiChatSend=async()=>{u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:'Not JSON, partial answer preserved'}}));};u.click('Send this sample');await u.wait();assert.equal(u.draft.attempt.state,'failed');assert.match(u.draft.attempt.partial,/partial answer/);assert(u.w.document.querySelector('.mrv-job pre'));assert(!u.calls.some(c=>c.action==='decision-save'));u.click('Review sample & retry');await u.wait();u.w.aiChatSend=async()=>{u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'Acting praised.',fit:'preferencesConfigured=false; no personal preferences supplied.',points:[{id:'1',quote:'Strong acting',reason:'The source praises acting.',kind:'praise'}]})}}));};u.click('Send this sample');await u.wait();assert.equal(u.draft.attempt.state,'result');assert.match(u.w.document.querySelector('.mrv-output').textContent,/What is praised/);assert(!u.w.document.querySelector('.mrv-output pre'));assert.doesNotMatch(u.w.document.querySelector('.mrv-output').textContent,/preferencesConfigured/);assert.match(u.w.document.querySelector('.mrv-output').textContent,/no explicit preferences saved/);assert(!u.calls.some(c=>c.action==='decision-save'));u.click('Verify quotes & save');await u.wait();assert(u.calls.some(c=>c.action==='decision-save'));
 }finally{u.w.close();}
});
test('A request which never starts remains retryable and does not lose the review sample',async()=>{
 const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();u.click('Send this sample');await u.wait();assert.equal(u.draft.attempt.state,'failed');assert.match(u.draft.attempt.error,/did not start/);assert.match(u.draft.reviews,/Strong acting/);}finally{u.w.close();}
});

test('Interrupted analysis keeps partial received text and exposes a retry instead of an endless loading state',async()=>{
 const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();u.w.aiChatSend=async()=>{u.w.player.job={chatContext:u.context(),running:true,awaitingExit:false,streamText:'Partial verified-source discussion',assistantRecord:{reply:{status:'streaming'}}};};u.w.cancelAiChat=async()=>{u.w.player.job.running=false;u.w.player.job.assistantRecord.reply.status='stopped';};u.click('Send this sample');await u.wait();assert.equal(u.draft.attempt.state,'analyzing');u.click('Stop analysis');await u.wait();assert.equal(u.draft.attempt.state,'stopped');assert.match(u.draft.attempt.partial,/Partial verified-source/);assert.match(u.w.document.querySelector('.mrv-job').textContent,/Review sample & retry/);
 }finally{u.w.close();}
});

test('Leaving a reading panel cancels its request and rejects a late result without replacing the old sample',async()=>{
 const u=ui();let release;try{u.draft.reviews='Previous sample remains';u.w.api.mediaTools=async packet=>packet.action==='reviews-stop'?{ok:true}:new Promise(r=>release=r);u.click('Use reviews from open Browser page');await u.wait();assert.equal(u.draft.attempt.state,'reading');u.w.MediaReviewDecision.leave();assert.equal(u.draft.attempt.state,'stopped');release({ok:true,reviews:[{id:'1',text:'Late result must not overwrite existing text.'}]});await u.wait();assert.equal(u.draft.reviews,'Previous sample remains');}finally{u.w.close();}
});

test('Editing a previewed sample or spoiler selection requires a fresh preview before any AI request',async()=>{
 const u=ui();let sent=0;try{u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();u.w.aiChatSend=async()=>{sent++;};const raw=u.w.document.querySelector('[name=review-text]');raw.value='A completely new review with a different opinion.';raw.dispatchEvent(new u.w.Event('input'));u.click('Send this sample');await u.wait();assert.equal(sent,0);assert.match(u.draft.attempt.error,/sample changed/);assert.match(u.draft.reviews,/completely new/);
 }finally{u.w.close();}
});
test('Evidence assessment counts duplicate opinions once and separates exact quotes from general consensus',()=>{
 const model=require('../src/renderer/media-tools-model');const rows=[{id:'1',text:'Strong acting throughout.'},{id:'2',text:'  Strong   ACTING throughout.  '},{id:'3',text:'The ending felt slow.'}];const assessment=model.reviewAssessment(rows,[{id:'1'},{id:'2'}]);assert.deepEqual(assessment,{shortTexts:3,spoilerTexts:0,total:3,distinct:2,duplicates:1,quoted:1,independentAuthors:0,unknownAuthors:3,limited:true});
});

test('A late browser fetch cannot overwrite text edited while reading',async()=>{
 const u=ui();let release;try{u.w.api.mediaTools=()=>new Promise(r=>release=r);u.click('Use reviews from open Browser page');await u.wait();const raw=u.w.document.querySelector('[name=review-text]');raw.value='My edited review must remain.';raw.dispatchEvent(new u.w.Event('input'));release({ok:true,reviews:[{id:'1',text:'Late browser sample with an unrelated opinion.'}]});await u.wait();assert.equal(raw.value,'My edited review must remain.');assert.equal(u.draft.reviews,raw.value);assert.match(u.draft.attempt.error,/edits were kept/);}finally{u.w.close();}
});

 test('Additional loaded review pages deduplicate only verified same-film samples',async()=>{const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();const append=[...u.w.document.querySelectorAll('.mrv-source input[type=checkbox]')][0];append.checked=true;u.w.api.mediaTools=async()=>({ok:true,reviews:[{id:'1',author:'Fixture',text:'Strong acting and a memorable atmosphere.'},{id:'2',author:'Other',text:'A thoughtful second page of public reviews.'}],match:{state:'matched'},identity:{title:'The Matrix',year:1999}});u.click('Use reviews from open Browser page');await u.wait();assert.equal(JSON.parse(u.draft.reviews).length,2);assert.equal(new Set(JSON.parse(u.draft.reviews).map(r=>r.id)).size,2);u.w.api.mediaTools=async()=>({ok:true,reviews:[{id:'3',text:'Wrong film must not be added.'}],match:{state:'mismatch'}});u.click('Use reviews from open Browser page');await u.wait();assert.equal(JSON.parse(u.draft.reviews).length,2);assert.match(u.draft.attempt.error,/Verify both pages/);}finally{u.w.close();}});

test('Browser return preserves append choice and source pages across panel remounts',async()=>{const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();const n=u.w.document.querySelector('.mrv-source input[type=checkbox]');n.checked=true;n.dispatchEvent(new u.w.Event('change'));assert.equal(u.draft.appendPages,true);const body=u.w.document.querySelector('main');body.replaceChildren();u.w.MediaReviewDecision.mount(body,{id:'film',title:'The Matrix',year:1999},{},u.draft,{current:()=>true,redraw(){},status(){}});assert(u.w.document.querySelector('.mrv-source input[type=checkbox]').checked);u.w.api.mediaTools=async()=>({ok:true,url:'https://letterboxd.com/film/the-matrix/reviews/page/2/',identity:{title:'The Matrix',year:1999},match:{state:'matched'},reviews:[{id:'2',text:'A different public second-page opinion.'}]});u.click('Use reviews from open Browser page');await u.wait();assert.equal(JSON.parse(u.draft.reviews).length,2);assert.equal(u.draft.source.pages.length,2);assert.match(u.w.document.querySelector('.mrv-provenance').textContent,/Source pages: 2/);}finally{u.w.close();}});

test('A mismatched incoming film cannot replace a manual sample or its previous analysis',async()=>{const original='My selected sample',draft={reviews:original},u=ui(draft);try{draft.result={sentinel:true};u.w.api.mediaTools=async()=>({ok:true,match:{state:'mismatch'},reviews:[{text:'Wrong film text'}]});u.click('Use reviews from open Browser page');await u.wait();assert.equal(draft.reviews,original);assert.equal(draft.result.sentinel,true);assert.equal(draft.attempt.state,'failed');assert.match(draft.attempt.error,/current sample was kept/);}finally{u.w.close();}});

test('Preview explains spoiler and bounded exclusions and exposes source metadata without revealing excluded text',async()=>{
 const rows=[{id:'short',author:'Source reviewer',text:'Strong acting and a memorable atmosphere.',permalink:'https://letterboxd.com/reviewer/film/the-matrix/',date:'2026-10-30',rating:4.5},{id:'long',text:'"'.repeat(4000)},{id:'later',text:'A later comment that cannot fit the sample.'},...Array.from({length:18},(_,i)=>({id:'extra'+i,text:'A longer source perspective. '.repeat(125)})),{id:'spoiler',text:'SECRET ENDING MUST STAY HIDDEN',spoiler:true}];
 const u=ui({reviews:JSON.stringify(rows),source:{excluded:{duplicate:2,spoiler:1},limited:true}});try{u.click('Preview & analyze');await u.wait();const preview=u.w.document.querySelector('.mrv-sample'),audit=preview.querySelector('.mrv-selection-audit');assert.match(audit.textContent,/Included with shortened text/);assert.match(audit.textContent,/Review later · Included/);assert.match(audit.textContent,/Excluded: spoilers disabled/);assert.match(audit.textContent,/Removed while reading: 2 · duplicate texts/);assert.doesNotMatch(preview.textContent,/SECRET ENDING/);assert.match(preview.textContent,/2026-10-30 · 4.5\/5/);assert.equal(preview.querySelector('a').href,rows[0].permalink);assert.equal(preview.querySelectorAll('.mrv-sample-list article[data-included=true]').length,21);assert(!u.calls.some(c=>c.action==='decision-save'));}finally{u.w.close();}
});

test('Saved result evidence opens only allowed review permalinks and keeps source text in a disclosure',async()=>{
 const u=ui(),opened=[];try{u.w.api.openExternal=async url=>opened.push(url);const parent=u.w.document.createElement('section');const row={id:'1',text:'Strong acting and a memorable atmosphere.',author:'Reviewer',date:'2026-10-30',rating:4,permalink:'https://letterboxd.com/reviewer/film/the-matrix/'};u.w.MediaReviewDecision.resultView(parent,{summary:'An opinion.',fit:'Limited sample.',points:[{id:'1',quote:'Strong acting',reason:'A direct quote supports acting praise.',kind:'praise'}]},[row]);const link=parent.querySelector('a');assert(link);link.click();assert.deepEqual(opened,[row.permalink]);assert.equal(parent.querySelector('.mrv-full-source p').textContent,row.text);assert(!parent.querySelector('.mrv-full-source').open);assert.match(parent.textContent,/2026-10-30 · 4\/5/);
 const bad=u.w.document.createElement('section');u.w.MediaReviewDecision.resultView(bad,{summary:'',fit:'',points:[{id:'1',quote:'Strong acting',reason:'A quote.',kind:'praise'}]},[{...row,permalink:'javascript:alert(1)',date:'2026-02-30',rating:99}]);assert(!bad.querySelector('a'));assert.match(bad.textContent,/Date unavailable · Rating unavailable/);
 }finally{u.w.close();}
});

test('Review checkboxes recompute the budget and only the current selection reaches analysis and save',async()=>{
 const rows=[{id:'first',text:'Excellent acting with a memorable atmosphere.'},{id:'large',text:'"'.repeat(4000)},{id:'later',text:'The later source praises the visuals.'},{id:'spoiler',text:'SECRET SELECTABLE ENDING',spoiler:true}],original=JSON.stringify(rows),u=ui({reviews:original});let sent;
 try{u.click('Preview & analyze');await u.wait();const pick=id=>u.w.document.querySelector('[data-review-pick="'+id+'"]'),toggle=id=>{const n=pick(id);n.checked=!n.checked;n.dispatchEvent(new u.w.Event('change'));},included=()=>[...u.w.document.querySelectorAll('.mrv-review-choice[data-included=true]')].map(n=>n.dataset.reviewId);
 assert.deepEqual(included(),['first','large','later']);assert(pick('spoiler').disabled);assert.doesNotMatch(u.w.document.querySelector('.mrv-sample').textContent,/SECRET SELECTABLE/);
 toggle('large');assert.deepEqual(included(),['first','later']);assert.match(u.w.document.querySelector('.mrv-selection-audit').textContent,/Review large · Excluded by you/);assert.equal(u.draft.reviews,original);
 toggle('large');assert.deepEqual(included(),['first','large','later']);toggle('large');u.click('Back to reviews');u.click('Preview & analyze');await u.wait();assert(!pick('large').checked);assert.deepEqual(included(),['first','later']);
 u.w.document.querySelector('[name=review-title-confirmed]').checked=true;u.w.aiChatSend=async()=>{sent=JSON.parse(u.context().reviewAnalysis||u.context().excerpt);u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'A fixture analysis.',fit:'Limited personal evidence.',points:[{id:'later',quote:'praises the visuals',reason:'A selected source.',kind:'praise'}]})}}));};u.click('Send this sample');await u.wait();assert.deepEqual(sent.reviews.map(r=>r.id),['first','later']);assert.equal(u.draft.reviews,original);assert.deepEqual(Array.from(u.draft.result.reviews,r=>r.id),['first','later']);u.click('Verify quotes & save');await u.wait();assert.deepEqual(Array.from(u.calls.find(c=>c.action==='decision-save').reviews,r=>r.id),['first','later']);
 }finally{u.w.close();}
});

test('An empty checkbox selection cannot send; changing spoiler policy requires a fresh preview',async()=>{
 const u=ui({reviews:JSON.stringify([{id:'one',text:'An ordinary source review.'},{id:'hidden',text:'SECRET SPOILER POLICY',spoiler:true}])});try{u.click('Preview & analyze');await u.wait();const pick=u.w.document.querySelector('[data-review-pick=one]');pick.checked=false;pick.dispatchEvent(new u.w.Event('change'));assert(u.w.document.querySelector('.mrv-preview-actions .mh-primary').disabled);const spoiler=u.w.document.querySelector('[name=review-spoilers]');spoiler.checked=true;spoiler.dispatchEvent(new u.w.Event('change'));const restored=u.w.document.querySelector('[data-review-pick=one]');restored.checked=true;restored.dispatchEvent(new u.w.Event('change'));assert.doesNotMatch(u.w.document.querySelector('.mrv-sample').textContent,/SECRET SPOILER POLICY/);u.w.document.querySelector('[name=review-title-confirmed]').checked=true;let sent=0;u.w.aiChatSend=async()=>{sent++;};u.click('Send this sample');await u.wait();assert.equal(sent,0);assert.match(u.draft.attempt.error,/sample changed/);
 }finally{u.w.close();}
});

const contextItem={id:'film',kind:'film',title:'The Matrix',year:1999,tmdbId:'movie:603'};
const contextRows=[{id:'context-review',author:'Reviewer',permalink:'https://letterboxd.com/reviewer/film/the-matrix/',source:{url:'https://letterboxd.com/film/the-matrix/reviews/by/entry-rating-lowest/page/2/',sort:'low',page:2},text:'Strong acting and a memorable atmosphere.'}];
const contextTaste={preferencesConfigured:true,preferences:{weights:{story:5,pace:3},note:'Prefer convincing characters.'}};
async function contextPreview(u){u.click('Preview & analyze');await u.wait();u.w.document.querySelector('[name=review-title-confirmed]').checked=true;}

test('Taste changed after preview refuses send and preserves the reviewed sample',async()=>{
 const options={item:contextItem,taste:contextTaste},original=JSON.stringify(contextRows),u=ui({reviews:original},options);let sends=0;
 try{await contextPreview(u);const shown=u.w.document.querySelector('.mrv-sample .mtx-sample').textContent;assert.match(shown,/Prefer convincing characters/);options.taste={...contextTaste,preferences:{...contextTaste.preferences,note:'Prefer a different pace now.'}};u.w.aiChatSend=async()=>sends++;u.click('Send this sample');await u.wait();assert.equal(sends,0);assert.match(u.draft.attempt.error,/taste profile changed after preview/);assert.equal(u.draft.reviews,original);assert(u.w.document.querySelector('.mrv-sample'));assert(!u.calls.some(row=>row.action==='decision-save'));}finally{u.w.close();}
});

for(const command of ['AssistantMediaCommands','AssistantPageCommands'])test(command+' starting during awaited profile recheck cannot send a second task',async()=>{
 const u=ui({reviews:JSON.stringify(contextRows)},{item:contextItem,taste:contextTaste});let release,busy=false,sends=0;
 try{await contextPreview(u);u.w[command]={busy:()=>busy};u.w.api.mediaShelf=()=>new Promise(resolve=>release=resolve);u.w.aiChatSend=async()=>sends++;u.click('Send this sample');await u.wait();assert.equal(typeof release,'function');busy=true;release({ok:true,taste:contextTaste});await u.wait();assert.equal(sends,0);assert.match(u.draft.attempt.error,/Another task started/);assert(u.w.document.querySelector('.mrv-sample'));assert.equal(u.draft.result,undefined);}finally{u.w.close();}
});

test('Automatic selected sort reaches the service and source metadata survives preview, analysis and save',async()=>{
 const u=ui({},{item:contextItem,taste:contextTaste}),source={...contextRows[0].source,requestedUrl:contextRows[0].source.url,loaded:1,accepted:1},sampling={mode:'balanced',requested:48,returned:1,independentAuthors:1,unknownAuthors:0,coverage:{popular:0,new:0,high:0,low:1},representative:false};let sent;
 try{u.w.api.mediaTools=async packet=>{u.calls.push(packet);return packet.action==='reviews-auto'?{ok:true,reviews:contextRows,identity:contextItem,match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/',pages:1,sources:[source],sampling,partial:true,warning:'One pool was rate limited.',limited:true}:{ok:true};};const sort=u.w.document.querySelector('[name=letterboxd-review-sort]'),count=u.w.document.querySelector('[name=letterboxd-sample-count]');sort.value='balanced';sort.dispatchEvent(new u.w.Event('change'));count.value='48';count.dispatchEvent(new u.w.Event('change'));u.click('Find this film & get reviews');await u.wait();const request=u.calls.find(row=>row.action==='reviews-auto');assert.equal(request.sort,'balanced');assert.equal(request.count,48);assert.equal(u.draft.sort,'balanced');assert.equal(JSON.stringify(u.draft.source.sources),JSON.stringify([source]));assert.equal(JSON.stringify(u.draft.source.sampling),JSON.stringify(sampling));assert(u.draft.source.pages.includes(source.url));assert.match(u.w.document.querySelector('.mrv-provenance').textContent,/Partial review sample/);
 await contextPreview(u);assert.match(u.w.document.querySelector('.mrv-sample').textContent,/Lowest rated · page 2/);u.w.aiChatSend=async()=>{sent=JSON.parse(u.context().reviewAnalysis||u.context().excerpt);u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'A selected review.',fit:'Conditional personal fit.',points:[{id:'context-review',quote:'Strong acting',reason:'The source praises acting.',kind:'praise'}]})}}));};u.click('Send this sample');await u.wait();assert.equal(sent.reviews[0].authorId,'reviewer');assert.equal(JSON.stringify(sent.reviews[0].source),JSON.stringify(contextRows[0].source));u.click('Verify quotes & save');await u.wait();const save=u.calls.find(row=>row.action==='decision-save');assert.equal(save.reviews[0].permalink,contextRows[0].permalink);assert.equal(save.reviews[0].source.sort,'low');assert.equal(save.evidenceSnapshot.context,JSON.stringify(sent));
 }finally{u.w.close();}
});

for(const changed of [false,true])test('Saved analysis reports '+(changed?'stale':'current')+' profile context and reuses its sample without a fetch or AI request',async()=>{
 const model=require('../src/renderer/media-tools-model'),evidence=model.decisionEvidence(contextItem,contextRows,contextTaste).evidence,entry={identity:contextItem,reviews:evidence.reviews,evidenceSnapshot:{version:1,context:JSON.stringify(evidence),profile:evidence.profile},analysis:{at:Date.now(),summary:'Saved, not freshly generated.',fit:'Conditional fit.',points:[{id:'context-review',quote:'Strong acting',reason:'An exact original quote.',kind:'praise'}]}},taste=changed?{...contextTaste,preferences:{...contextTaste.preferences,note:'A new preference since saving.'}}:contextTaste,u=ui({},{item:contextItem,taste,saved:{history:[entry]}});let sends=0,network=0;
 try{u.w.aiChatSend=async()=>sends++;u.w.fetch=async()=>{network++;throw Error('Saved reuse must remain local');};await u.wait();const freshness=u.w.document.querySelector('.mtx-history .mrv-freshness');assert.equal(freshness.dataset.freshness,changed?'stale':'current');assert.match(freshness.textContent,changed?/Earlier context/:/Current profile/);assert.equal(u.calls.length,0);u.click('Reuse this saved sample');await u.wait();assert.equal(u.calls.length,0,'Reuse must not call any mediaTools fetch/save action');assert.equal(sends,0);assert.equal(network,0);assert.equal(JSON.stringify(JSON.parse(u.draft.reviews)),JSON.stringify(entry.reviews));assert.equal(u.draft.source.match.state,'matched');assert.match(u.w.document.querySelector('.mtx-history').textContent,/Saved, not freshly generated/);
 const raw=u.w.document.querySelector('[name=review-text]');raw.value=JSON.stringify(entry.reviews.map(row=>({...row,text:row.text+' A newly edited source sentence.'})));raw.dispatchEvent(new u.w.Event('input'));assert.equal(freshness.dataset.freshness,'stale');assert.equal(entry.reviews[0].text,evidence.reviews[0].text);assert.equal(u.calls.length,0);
 }finally{u.w.close();}
});

test('AI Turkish paraphrase is labelled separately while exact original survives rendered result and save',async()=>{
 const u=ui({reviews:JSON.stringify(contextRows)},{item:contextItem,taste:contextTaste});
 try{await contextPreview(u);u.w.aiChatSend=async()=>u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'A source-based opinion.',fit:'Limited personal inference.',points:[{id:'context-review',quote:'Strong acting',quoteTr:'Oyunculuk güçlü bulunuyor.',quoteTrKind:'verified_translation',reason:'The exact source supports this.',kind:'praise'}]})}}));u.click('Send this sample');await u.wait();const output=u.w.document.querySelector('.mrv-output'),paraphrase=output.querySelector('.mrv-quote-tr');assert.equal(paraphrase.dataset.quoteKind,'paraphrase');assert.match(paraphrase.textContent,/Turkish explanation · AI paraphrase/);assert.match(paraphrase.textContent,/Not an original or verified translated quotation/);assert.equal(output.querySelector('blockquote').textContent,'Strong acting');assert.equal(output.querySelector('.mrv-full-source p').textContent,contextRows[0].text);assert.equal(paraphrase.querySelector('p').textContent,'Oyunculuk güçlü bulunuyor.');u.click('Verify quotes & save');await u.wait();const point=u.calls.find(row=>row.action==='decision-save').analysis.points[0];assert.equal(point.quote,'Strong acting');assert.equal(point.quoteTrKind,'paraphrase');assert.equal(point.quoteTr,'Oyunculuk güçlü bulunuyor.');}finally{u.w.close();}
});

test('Manual source actions, editor, append and spoiler controls remain usable inside the disclosure',async()=>{
 const u=ui({},{item:contextItem});
 try{const manual=u.w.document.querySelector('.mrv-manual');assert.equal(manual.open,false);manual.querySelector('summary').click();await u.wait();assert(manual.open);for(const name of ['letterboxd-reviews-url','review-text','review-spoilers']){const control=manual.querySelector('[name="'+name+'"]');assert(control&&!control.disabled,name+' is usable inside manual sources');}for(const label of ['Use reviews from open Browser page','Fetch public page','Import TXT / JSON','Open page ↗'])assert([...manual.querySelectorAll('button')].some(button=>button.textContent===label&&!button.disabled));const append=manual.querySelector('input[type=checkbox]:not([name])');append.checked=true;append.dispatchEvent(new u.w.Event('change'));assert.equal(u.draft.appendPages,true);append.checked=false;append.dispatchEvent(new u.w.Event('change'));const url=manual.querySelector('[name=letterboxd-reviews-url]');url.value='https://letterboxd.com/film/the-matrix/reviews/';url.dispatchEvent(new u.w.Event('input'));assert.equal(u.draft.url,url.value);const raw=manual.querySelector('[name=review-text]');raw.value='My manually edited review remains a usable source.';raw.dispatchEvent(new u.w.Event('input'));assert.equal(u.draft.reviews,raw.value);const spoiler=manual.querySelector('[name=review-spoilers]');spoiler.checked=true;spoiler.dispatchEvent(new u.w.Event('change'));assert.equal(u.draft.spoiler,true);u.click('Use reviews from open Browser page');await u.wait();assert.equal(u.draft.source.match.state,'matched');assert.match(u.draft.reviews,/Strong acting/);assert.equal(u.calls.filter(row=>row.action==='reviews-browser').length,1);
 }finally{u.w.close();}
});

 test('Advanced review controls retain their disclosure choice and open after automatic source failure',async()=>{const u=ui({}, {item:{id:'film',kind:'film',title:'The Matrix',year:1999,imdbId:'tt0133093'}});try{const manual=u.w.document.querySelector('.mrv-manual');const toggled=new Promise(resolve=>manual.addEventListener('toggle',resolve,{once:true}));manual.querySelector('summary').click();await toggled;assert.equal(u.draft.manualOpen,true);const body=u.w.document.querySelector('main');body.replaceChildren();u.w.MediaReviewDecision.mount(body,{id:'film',kind:'film',title:'The Matrix',year:1999,imdbId:'tt0133093'},{},u.draft,{current:()=>true,redraw(){},status(){}});const restored=body.querySelector('.mrv-manual');assert(restored.open);restored.open=false;restored.dispatchEvent(new u.w.Event('toggle'));u.click('Find this film & get reviews');await u.wait();assert.equal(u.draft.attempt.state,'failed');assert(restored.open);assert.equal(u.draft.manualOpen,true);assert(restored.querySelector('[name=review-text]'));}finally{u.w.close();}});

test('Loaded reviews can be read without AI and spoiler text stays hidden until explicitly included',async()=>{
 const rows=[{id:'plain',author:'Reader',text:'Strong acting and a memorable atmosphere.'},{id:'spoiler',author:'Another',text:'SECRET ENDING should stay out of the reader.',spoiler:true}],u=ui({reviews:JSON.stringify(rows)});
 try{const desk=u.w.document.querySelector('.mrv-loaded-sample');assert(!desk.hidden);assert.match(desk.textContent,/1 loaded reviews/);const reader=desk.querySelector('details');assert.equal(reader.open,false,'Reading is optional and does not bury the analysis action');reader.querySelector('summary').click();assert(reader.open);assert.match(reader.textContent,/Strong acting/);assert.doesNotMatch(reader.textContent,/SECRET ENDING/);assert.equal(u.calls.length,0);
  const spoiler=u.w.document.querySelector('[name=review-spoilers]');spoiler.checked=true;spoiler.dispatchEvent(new u.w.Event('change'));assert(desk.querySelector('details').open,'Reading position disclosure survives policy update');assert.match(desk.textContent,/SECRET ENDING/);assert.equal(u.calls.length,0);
 }finally{u.w.close();}
});

test('Shared saved history accepts a title alias only with matching film identity and reuses locally',async()=>{
 const item={...contextItem,imdbId:'tt0133093'},entry={savedFrom:'discovery',identity:{...item,title:'Matrix — a localized title'},reviews:contextRows,analysis:{at:1,summary:'Saved source-based summary.',fit:'Conditional fit.',points:[]}},u=ui({},{item,saved:{history:[entry]}});
 try{assert.match(u.w.document.querySelector('[data-saved-origin=discovery]').textContent,/Discover/);assert.doesNotMatch(u.w.document.querySelector('.mtx-history summary').textContent,/Earlier match/);assert.equal(u.w.document.querySelector('main').firstElementChild.className,'mrv-saved-analyses');u.click('Reuse this saved sample');await u.wait();assert.equal(u.calls.length,0);assert.equal(JSON.stringify(JSON.parse(u.draft.reviews)),JSON.stringify(contextRows));assert.equal(u.draft.source.match.state,'matched');assert.equal(u.w.document.activeElement.dataset.reviewAction,'preview');
 }finally{u.w.close();}
});

test('Conflicting saved IMDb identity cannot reuse reviews even when title year and TMDB agree',async()=>{
 const item={...contextItem,imdbId:'tt0133093',tmdbId:'movie:603'},entry={savedFrom:'library',identity:{...item,imdbId:'tt99999999'},reviews:contextRows,analysis:{at:1,summary:'Earlier identity summary.',fit:'Earlier fit.',points:[]}},u=ui({},{item,saved:{history:[entry]}});
 try{assert.match(u.w.document.querySelector('.mtx-history summary').textContent,/Earlier match/);assert(![...u.w.document.querySelectorAll('button')].some(n=>n.textContent==='Reuse this saved sample'));assert.equal(u.draft.reviews,undefined);assert.equal(u.calls.length,0);}finally{u.w.close();}
});

test('Failed source loading retries the same source instead of analyzing an empty sample',async()=>{
 const u=ui({},{item:{...contextItem,imdbId:'tt0133093'}});let sends=0;
 try{u.w.aiChatSend=async()=>sends++;u.click('Find this film & get reviews');await u.wait();assert.equal(u.draft.attempt.state,'failed');u.click('Retry reading');await u.wait();assert.equal(u.calls.filter(row=>row.action==='reviews-auto').length,2);assert.equal(u.draft.attempt.state,'failed');assert.equal(sends,0);assert(!u.w.document.querySelector('.mrv-sample'));assert(u.w.document.querySelector('.mrv-manual').open);}finally{u.w.close();}
});

test('Replacing an unsaved result with a saved sample removes the obsolete save controls and sample preview',async()=>{
 const model=require('../src/renderer/media-tools-model'),evidence=model.decisionEvidence(contextItem,contextRows,contextTaste).evidence;
 const entry={identity:contextItem,reviews:evidence.reviews,analysis:{summary:'Saved interpretation',fit:'Conditional',points:[{id:'context-review',quote:'Strong acting',reason:'Verified source',kind:'praise'}]}};
 const draft={reviews:JSON.stringify(contextRows),result:{...entry,personalEvidence:false}},u=ui(draft,{item:contextItem,taste:contextTaste,saved:{history:[entry]}});
 try{assert(u.w.document.querySelector('.mrv-output button'));const old=u.w.document.createElement('section');old.className='mrv-sample';u.w.document.querySelector('main').append(old);u.click('Reuse this saved sample');await u.wait();assert.equal(draft.result,undefined);assert.equal(u.w.document.querySelector('.mrv-output').children.length,0);assert.equal(u.w.document.querySelector('.mrv-sample'),null);assert.equal(u.calls.length,0);assert.match(u.w.document.querySelector('.mtx-history').textContent,/Saved interpretation/);}finally{u.w.close();}
});

test('personal comparison discloses the profile saved with analysis, preserving later profile differences',async()=>{
 const model=require('../src/renderer/media-tools-model'),evidence=model.decisionEvidence(contextItem,contextRows,{preferencesConfigured:true,preferences:{weights:{characters:5,pace:2},avoid:['sound'],note:'Controlled preference note'}}).evidence;
 const entry={identity:contextItem,reviews:evidence.reviews,evidenceSnapshot:{version:1,context:JSON.stringify(evidence),profile:evidence.profile},analysis:{at:Date.now(),summary:'A selected sample.',fit:'Conditional acting fit.',points:[{id:contextRows[0].id,quote:'Strong acting',reason:'Explicit performance praise.',kind:'praise'}]}};
 const u=ui({},{item:contextItem,taste:{preferencesConfigured:true,preferences:{weights:{visuals:5},note:'Later profile note'}},saved:{history:[entry]}});
 try{await u.wait();const basis=u.w.document.querySelector('.mrv-fit-basis');assert(basis);assert.equal(basis.open,false);assert.match(basis.textContent,/Saved priorities: Characters · Pace/);assert.match(basis.textContent,/Prefer to avoid: Sound/);assert.match(basis.textContent,/Controlled preference note/);assert.doesNotMatch(basis.textContent,/Later profile note/);assert.match(basis.textContent,/inputs saved with this analysis/);basis.querySelector('summary').click();assert(basis.open);}finally{u.w.close();}
});


test('Focused source reader preserves full text, selection and Back without fetching or changing evidence',async()=>{
 const long='A complete source paragraph. '.repeat(40)+'VISIBLE SOURCE END',rows=[{id:'a',author:'First author',text:'First source with enough detail to analyze.'},{id:'b',author:'Second author',text:long}],original=JSON.stringify(rows),u=ui({reviews:original});
 try{
  const loaded=u.w.document.querySelector('.mrv-loaded-reader'),list=loaded.querySelector('.mrv-reading-list'),select=loaded.querySelector('select');assert.equal(list.querySelectorAll('article:not([hidden])').length,1);assert.equal(select.options.length,2);
  select.selectedIndex=1;select.dispatchEvent(new u.w.Event('change'));assert.equal(list.querySelector('article:not([hidden])').dataset.reviewId,'b');assert.equal(list.querySelector('article:not([hidden]) .mrv-reader-text').textContent,long);
  const expand=list.querySelector('article:not([hidden]) .mrv-fulltext-toggle');assert.equal(expand.getAttribute('aria-expanded'),'false');expand.click();assert.equal(expand.getAttribute('aria-expanded'),'true');assert(!list.querySelector('article:not([hidden]) .mrv-reader-text').classList.contains('mrv-reader-collapsed'));
  u.click('Preview & analyze');await u.wait();const body=u.w.document.querySelector('main'),preview=body.querySelector('.mrv-sample');assert.equal(body.dataset.reviewStage,'preview');assert.equal(u.w.document.activeElement,preview);assert.equal(preview.querySelectorAll('.mrv-reading-list>article:not([hidden])').length,1);
  const pick=preview.querySelector('select');pick.selectedIndex=1;pick.dispatchEvent(new u.w.Event('change'));const checkbox=preview.querySelector('[data-review-pick=b]');checkbox.checked=false;checkbox.dispatchEvent(new u.w.Event('change'));assert.equal(preview.querySelector('.mrv-reading-list>article:not([hidden])').dataset.reviewId,'b');assert.equal(u.w.document.activeElement,preview.querySelector('[data-review-pick=b]'));
  u.click('Back to reviews');assert.equal(body.dataset.reviewStage,'sample');assert.equal(u.w.document.activeElement,body.querySelector('[data-review-action=preview]'));assert.equal(u.draft.reviews,original);
  u.click('Preview & analyze');await u.wait();assert.equal(body.querySelector('.mrv-sample .mrv-reading-list>article:not([hidden])').dataset.reviewId,'b');assert.equal(body.querySelector('[data-review-pick=b]').checked,false);assert.equal(u.calls.length,0);
 }finally{u.w.close();}
});
test('Analysis narrative precedes optional accounting for every saved result surface',()=>{
 const u=ui();try{const target=u.w.document.createElement('section');u.w.MediaReviewDecision.resultView(target,{summary:'Actual synthesis first.',fit:'Conditional personal fit.',points:[]},[{id:'a',text:'Source text.',author:'Author'}]);assert.equal(target.firstElementChild.className,'mrv-analysis-overview');assert.equal(target.querySelector('.film-review-proof').open,false);assert(target.querySelector('.film-review-proof .mrv-assessment'));assert.match(target.querySelector('.mrv-summary').textContent,/Actual synthesis first/);}finally{u.w.close();}
});

test('Preview validation stays visible in its active step, and source replacement restores the reading stage',async()=>{
 const u=ui({reviews:JSON.stringify([{id:'a',text:'A source with enough text for the analysis.'}])});try{
  u.click('Preview & analyze');await u.wait();u.w.document.querySelector('[name=review-title-confirmed]').checked=false;u.click('Send this sample');await u.wait();const error=u.w.document.querySelector('.mrv-preview-error');assert.equal(error.hidden,false);assert.equal(error.getAttribute('role'),'alert');assert.match(error.textContent,/Check the title and year/);assert.equal(u.w.document.querySelector('main').dataset.reviewStage,'preview');
  u.click('Use reviews from open Browser page');await u.wait();assert.equal(u.w.document.querySelector('.mrv-sample'),null);assert.equal(u.w.document.querySelector('main').dataset.reviewStage,'sample');assert.equal(u.draft.attempt.state,'ready');
 }finally{u.w.close();}
});

test('Saved spoiler analysis stays absent from workspace DOM until a separate explicit reveal',async()=>{
 const entry={identity:{title:'The Matrix',year:1999},analysis:{at:Date.now(),summary:'SECRET PLOT IN SAVED SUMMARY',fit:'Conditional fit.',points:[]},reviews:[{id:'a',text:'A spoiler review describing the SECRET ENDING.',spoiler:true}]},u=ui({},{saved:{history:[entry]}});
 try{const history=u.w.document.querySelector('.mrv-saved-analyses');assert.equal(u.w.document.querySelector('[name=review-spoilers]').checked,false);assert.doesNotMatch(history.textContent,/SECRET PLOT|SECRET ENDING/);assert(history.querySelector('[data-review-spoiler-gate]'));u.click('Reveal this spoiler analysis');await u.wait();assert.match(history.querySelector('.mrv-summary').textContent,/SECRET PLOT/);assert.equal(u.w.document.querySelector('[name=review-spoilers]').checked,false);assert.equal(u.calls.length,0);}finally{u.w.close();}
});


test('A readable source with zero eligible reviews has an empty state and cannot start an AI preview',async()=>{
 const u=ui();try{
  u.w.api.mediaTools=async()=>({ok:true,reviews:[],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/'});
  u.click('Use reviews from open Browser page');await u.wait();assert.equal(u.draft.attempt.state,'empty');assert.match(u.w.document.querySelector('.mrv-job').textContent,/No eligible reviews found/);assert.equal(u.w.document.querySelector('[data-review-action=preview]').hidden,true);
 }finally{u.w.close();}
});

test('Rejected analysis startup releases the title job and allows another analysis',async()=>{
 const u=ui();try{
  u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();
  u.w.aiChatSend=async()=>{throw Error('Controlled startup rejection');};u.click('Send this sample');await u.wait();
  assert.equal(u.draft.attempt.state,'failed');assert.match(u.draft.attempt.error,/Controlled startup rejection/);assert.equal(u.w.MediaReviewDecision.hasActive('film'),false);assert.equal(u.w.document.querySelector('[data-review-action=preview]').disabled,false);
  u.click('Review sample & retry');await u.wait();u.w.aiChatSend=async()=>{u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'Retried analysis',fit:'Conditional fit',points:[{id:'1',quote:'Strong acting',kind:'praise',reason:'Supported'}]})}}));};u.click('Send this sample');await u.wait();assert.equal(u.draft.result.analysis.summary,'Retried analysis');
 }finally{u.w.close();}
});

test('A late startup rejection cannot release or fail a newer title job',async()=>{
 const u=ui();try{
  u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();let rejectOld;u.w.aiChatSend=()=>new Promise((_,reject)=>rejectOld=reject);u.click('Send this sample');await u.wait();
  u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'First result',fit:'Conditional fit',points:[{id:'1',quote:'Strong acting',kind:'praise',reason:'Supported'}]})}}));u.click('Discard analysis');u.click('Preview & analyze');await u.wait();let finishNew;u.w.aiChatSend=()=>new Promise(resolve=>finishNew=resolve);u.click('Send this sample');await u.wait();const attempt=u.draft.attempt;
  rejectOld(Error('Old startup failed'));await u.wait();assert.equal(u.w.MediaReviewDecision.hasActive('film'),true);assert.equal(u.draft.attempt,attempt);assert.equal(attempt.state,'analyzing');finishNew();await u.wait();
 }finally{u.w.close();}
});

test('A rejected pending startup updates the reopened title review panel',async()=>{
 let current=true;const u=ui({},{current:()=>current});try{
  u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();let rejectStartup;u.w.aiChatSend=()=>new Promise((_,reject)=>rejectStartup=reject);u.click('Send this sample');await u.wait();
  current=false;u.w.MediaReviewDecision.leave();const body=u.w.document.querySelector('main');body.replaceChildren();u.w.MediaReviewDecision.mount(body,{id:'film',title:'The Matrix',year:1999},{},u.draft,{current:()=>true,redraw(){},status(){}});assert.equal(body.querySelector('.mrv-job').dataset.state,'analyzing');
  rejectStartup(Error('Reopened startup failed'));await u.wait();assert.equal(u.w.MediaReviewDecision.hasActive('film'),false);assert.equal(body.querySelector('.mrv-job').dataset.state,'failed');assert.match(body.querySelector('.mrv-job').textContent,/Reopened startup failed/);assert.equal(body.querySelector('[data-review-action=preview]').disabled,false);
 }finally{u.w.close();}
});

for(const changed of ['replacement','disposed'])for(const outcome of ['resolved','rejected'])test('A '+outcome+' pending save cannot mutate a '+changed+' review view',async()=>{
 let current=true;const u=ui({},{current:()=>current});try{
  u.click('Use reviews from open Browser page');await u.wait();let sequence=0;u.w.aiChatSend=async()=>{u.w.document.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'Result '+(++sequence),fit:'Conditional fit',points:[{id:'1',quote:'Strong acting',kind:'praise',reason:'Supported'}]})}}));};
  u.click('Preview & analyze');await u.wait();u.click('Send this sample');await u.wait();let release;u.w.api.mediaTools=async()=>new Promise((resolve,reject)=>release=()=>outcome==='resolved'?resolve({ok:true}):reject(Error('Old save failed')));u.click('Verify quotes & save');await u.wait();
  if(changed==='replacement'){u.click('Discard analysis');u.click('Preview & analyze');await u.wait();u.click('Send this sample');await u.wait();}else current=false;
  const result=u.draft.result,attempt=u.draft.attempt;release();await u.wait();assert.equal(u.draft.result,result);assert.equal(u.draft.attempt,attempt);assert.equal(u.calls.includes('redraw'),false);
 }finally{u.w.close();}
});

test('A source for another year is never loaded, and blocked, empty, mismatched and failed reads are told apart',async()=>{
 const u=ui({},{item:{id:'film',kind:'film',title:'The Matrix',year:1999}}),job=()=>u.w.document.querySelector('.mrv-job'),raw=()=>u.w.document.querySelector('[name=review-text]').value;
 const good={ok:true,reviews:[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture'}],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/'};
 const other={ok:true,reviews:[{id:'1',text:'A review of the later remake only.',author:'Elsewhere'}],identity:{title:'The Matrix',year:2021},match:{state:'mismatch'},url:'https://letterboxd.com/film/the-matrix-2021/reviews/'};
 const read=async answer=>{u.w.api.mediaTools=async()=>answer;u.click('Use reviews from open Browser page');await u.wait();};
 try{
  await read(other);assert.equal(u.draft.attempt.state,'failed');assert.equal(u.draft.attempt.kind,'mismatch');assert.equal(raw(),'');assert.equal(u.draft.reviews,undefined);assert.equal(u.draft.source,undefined);
  assert.match(job().textContent,/Different film or year · nothing was loaded/);assert.doesNotMatch(job().textContent,/sample is kept/);assert.doesNotMatch(u.w.document.body.textContent,/remake only/);
  await read({ok:false,error:'Letterboxd HTTP 403. Full review continuations require Browser access.'});assert.equal(u.draft.attempt.kind,'blocked');assert.match(job().textContent,/Access blocked · nothing was loaded/);
  await read({ok:false,error:'No readable non-spoiler reviews found. Try the Browser or import a sample.'});assert.equal(u.draft.attempt.state,'empty');assert.match(job().textContent,/No eligible reviews found/);
  await read({ok:false,error:'Controlled failure'});assert.equal(u.draft.attempt.state,'failed');assert.equal(u.draft.attempt.kind,'');assert.match(job().textContent,/Could not finish · nothing was loaded/);
  await read(good);assert.equal(u.draft.attempt.state,'ready');assert.equal(u.draft.attempt.kind,'');const kept=raw();assert.match(kept,/Strong acting/);
  await read(other);assert.equal(u.draft.attempt.kind,'mismatch');assert.match(job().textContent,/Different film or year · your sample is kept/);assert.equal(raw(),kept);
  await read({ok:false,error:'Letterboxd HTTP 403. Full review continuations require Browser access.'});assert.match(job().textContent,/Access blocked · your sample is kept/);assert.equal(raw(),kept);
  await read({ok:false,error:'Controlled failure'});assert.match(job().textContent,/Could not finish · your sample is kept/);assert.equal(raw(),kept);assert.equal(u.draft.source.identity.year,1999);
 }finally{u.w.close();}
});
test('Spoiler text stays out of the sample box, preview, provider request, assistant context, saved result and copied answer while spoilers are off',async()=>{
 const secret='ZEBRA_SPOILER_SENTENCE the hero dies at the end.',u=ui(),requests=[];
 u.w.api.mediaTools=async packet=>{requests.push(packet);if(packet.action==='decision-save')return {ok:true};return {ok:true,reviews:[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture'},{id:'2',text:secret,author:'Other',spoiler:true}],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/',sampling:{mode:'new',requestedMode:'high',orderApplied:false,requested:5,returned:1}};};
 try{
  u.click('Use reviews from open Browser page');await u.wait();const read=requests.find(row=>row.action==='reviews-browser');assert.equal(read.spoilers,false);
  const doc=u.w.document;assert.doesNotMatch(doc.querySelector('[name=review-text]').value,/ZEBRA/);assert.doesNotMatch(doc.querySelector('.mrv-loaded-sample').textContent,/ZEBRA/);
  assert.match(doc.querySelector('.mrv-loaded-sample').textContent,/1 of 5 requested/);assert.match(doc.querySelector('.mrv-provenance').textContent,/requested Highest rated order was not applied/);assert.match(doc.querySelector('.mrv-job').textContent,/1 spoiler reviews not loaded/);
  u.click('Preview & analyze');await u.wait();assert.doesNotMatch(doc.querySelector('.mrv-sample').textContent,/ZEBRA/);
  let sentContext='';u.w.aiChatSend=async()=>{sentContext=JSON.stringify(u.context());doc.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'Acting praised.',fit:'preferencesConfigured=false; no personal preferences supplied.',points:[{id:'1',quote:'Strong acting',reason:'The source praises acting.',kind:'praise'}]})}}));};
  u.click('Send this sample');await u.wait();assert(sentContext.includes('Strong acting'));assert.doesNotMatch(sentContext,/ZEBRA/);assert.doesNotMatch(JSON.stringify(u.context()),/ZEBRA/);
  const copied=doc.querySelector('.mrv-output').textContent;assert.match(copied,/Strong acting/);assert.doesNotMatch(copied,/ZEBRA/);
  u.click('Verify quotes & save');await u.wait();const saved=requests.find(row=>row.action==='decision-save');assert(saved);assert.doesNotMatch(JSON.stringify(saved),/ZEBRA/);
 }finally{u.w.close();}
});
test('Changing the spoiler setting while a source is being read never lets spoiler text in',async()=>{
 const secret='ZEBRA_LATE_SPOILER the hero dies.',reply=()=>({ok:true,reviews:[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture'},{id:'2',text:secret,author:'Other',spoiler:true}],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/'});
 for(const startsOn of [true,false]){
  const u=ui({spoiler:startsOn}),doc=u.w.document,box=doc.querySelector('[name=review-spoilers]'),asked=[];let release;
  u.w.api.mediaTools=packet=>{asked.push(packet);return new Promise(resolve=>{release=()=>resolve(reply());});};
  try{
   assert.equal(box.checked,startsOn);u.click('Use reviews from open Browser page');await u.wait();assert.equal(asked[0].spoilers,startsOn);
   box.checked=!startsOn;box.dispatchEvent(new u.w.Event('change'));release();await u.wait();
   assert.equal(u.draft.attempt.state,'ready');assert.match(u.draft.attempt.message,/spoiler setting changed while reading/);
   assert.doesNotMatch(doc.querySelector('[name=review-text]').value,/ZEBRA/,'start '+startsOn);assert.doesNotMatch(doc.querySelector('.mrv-loaded-sample').textContent,/ZEBRA/);
  }finally{u.w.close();}
 }
});
test('A late answer for film A cannot change film B, and reverse-ordered refreshes keep only the newest',async()=>{
 const u=ui({},{item:{id:'a',kind:'film',title:'Film A',year:2001}}),pending=[];
 const reply=(title,year,text)=>({ok:true,reviews:[{id:'1',text,author:title}],identity:{title,year},match:{state:'matched'},url:'https://letterboxd.com/film/'+title.toLowerCase().replace(/ /g,'-')+'/reviews/'});
 u.w.api.mediaTools=packet=>{u.calls.push(packet);if(packet.action==='reviews-stop')return Promise.resolve({ok:true});return new Promise((resolve,reject)=>pending.push({packet,resolve,reject}));};
 const clickIn=(root,text)=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click();
 try{
  u.click('Use reviews from open Browser page');await u.wait();assert.equal(pending.length,1);const first=pending.shift();
  const holder=u.w.document.createElement('div');u.w.document.body.append(holder);const draftB={};
  u.w.MediaReviewDecision.mount(holder,{id:'b',kind:'film',title:'Film B',year:2002},{},draftB,{current:()=>true,redraw(){},status(){}});
  clickIn(holder,'Use reviews from open Browser page');await u.wait();assert.equal(pending.length,1);const second=pending.shift();second.resolve(reply('Film B',2002,'Film B has a very distinct review text.'));await u.wait();
  const sample=draftB.reviews,line=holder.querySelector('.mrv-job').textContent,identityB=JSON.stringify(draftB.source.identity);assert.match(sample,/Film B has a very distinct/);assert.equal(draftB.attempt.state,'ready');
  first.resolve(reply('Film A',2001,'Film A review text that must stay with A.'));await u.wait();
  assert.equal(draftB.reviews,sample);assert.equal(holder.querySelector('.mrv-job').textContent,line);assert.equal(JSON.stringify(draftB.source.identity),identityB);assert.doesNotMatch(holder.textContent,/Film A review text/);assert.match(u.draft.reviews,/Film A review text/);
  // A late error for a stopped request never replaces the visible state either.
  u.draft.reviews='';u.w.document.querySelector('[name=review-text]').value='';
  u.click('Use reviews from open Browser page');await u.wait();const third=pending.shift();u.click('Stop reading');await u.wait();
  assert(u.calls.some(row=>row.action==='reviews-stop'),'the stopped request is cancelled in the service');
  u.click('Use reviews from open Browser page');await u.wait();const fourth=pending.shift();
  fourth.resolve(reply('Film A',2001,'Newest refresh text for film A.'));await u.wait();const newest=u.draft.reviews;assert.match(newest,/Newest refresh text/);
  third.resolve(reply('Film A',2001,'Older refresh text finishing late.'));await u.wait();assert.equal(u.draft.reviews,newest);assert.equal(u.draft.attempt.state,'ready');assert.doesNotMatch(u.w.document.body.textContent,/Older refresh/);
  u.click('Use reviews from open Browser page');await u.wait();const fifth=pending.shift();u.click('Stop reading');await u.wait();fifth.reject(Error('Late failure of a stopped request'));await u.wait();
  assert.equal(u.draft.reviews,newest);assert.doesNotMatch(u.w.document.querySelector('.mrv-job').textContent,/Late failure/);
 }finally{u.w.close();}
});

test('Evidence labels name a shared point only when separate reviews make the same claim, and keep contradictions visible',()=>{
 const u=ui(),reviews=[{id:'1',author:'A',authorId:'a',text:'Strong acting carries every scene.'},{id:'2',author:'B',authorId:'b',text:'The acting is wonderful and subtle.'},{id:'3',author:'C',authorId:'c',text:'The lead performance feels flat.'},{id:'4',author:'D',authorId:'d',text:'The pacing drags badly in the middle.'}];
 const analysis={summary:'Acting divides the sample.',fit:'Conditional.',points:[{id:'1',quote:'Strong acting',reason:'The acting is praised.',kind:'praise',topic:'characters'},{id:'2',quote:'acting is wonderful',reason:'The acting is praised',kind:'praise',topic:'characters'},{id:'3',quote:'performance feels flat',reason:'The lead performance is flat.',kind:'criticism',topic:'characters'},{id:'4',quote:'pacing drags',reason:'The middle section is slow.',kind:'criticism',topic:'pace'},{id:'4',quote:'drags badly',reason:'Another pace remark.',kind:'criticism'}]};
 try{const host=u.w.document.createElement('section');u.w.document.body.append(host);u.w.MediaReviewDecision.resultView(host,analysis,reviews,{preferencesConfigured:false});
  const tags=[...host.querySelectorAll('.mrv-point .mrv-support')];assert.equal(tags.length,5);
  assert.deepEqual(tags.map(n=>n.dataset.support),['shared','shared','single','single','single']);assert.match(tags[0].textContent,/Same point in 2 reviews/);
  assert.match(tags[2].textContent,/Observed in one review · another review takes the opposite view/);assert.equal(tags[0].dataset.contested,'true');
  assert.equal(tags[3].dataset.contested,'false','one criticism of pace with no counter-evidence is not called a minority or contested');assert.doesNotMatch(host.textContent,/minority|azınlık/);
  assert.equal(tags[4].dataset.contested,'false','a point without a topic never derives a contradiction');assert.match(host.querySelector('.mrv-assessment').textContent,/Small sample/);
  const scope=host.querySelector('.mrv-summary .mrv-scope-line');assert.match(scope.textContent,/Based on 4 reviews from 4 identified authors · small sample, not a general consensus/);assert.equal(scope.dataset.limited,'true');
 }finally{u.w.close();}
});

test('A refresh with zero eligible reviews keeps the previous valid sample and its analysis',async()=>{
 const u=ui(),raw=()=>u.w.document.querySelector('[name=review-text]').value;
 try{u.click('Use reviews from open Browser page');await u.wait();const kept=raw();assert.match(kept,/Strong acting/);u.draft.result={analysis:{points:[],summary:'kept',fit:''},reviews:JSON.parse(kept)};const analysis=u.draft.result,source=u.draft.source;
  u.w.api.mediaTools=async()=>({ok:true,reviews:[],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/',sampling:{requested:40,returned:0}});
  u.click('Use reviews from open Browser page');await u.wait();
  assert.equal(raw(),kept);assert.equal(u.draft.reviews,kept);assert.equal(u.draft.result,analysis,'the analysis bound to the kept sample survives');assert.equal(u.draft.source,source);
  assert.equal(u.draft.attempt.state,'empty');assert.match(u.w.document.querySelector('.mrv-job').textContent,/previous sample and its analysis were kept/);
 }finally{u.w.close();}
});
test('Turning spoilers off after a spoiler-inclusive load hides the text from the editor, preview, provider context and copied answer, and restores it when turned back on',async()=>{
 const secret='ZEBRA_LOADED_SPOILER the twist ending.',u=ui({spoiler:true}),doc=u.w.document,box=doc.querySelector('[name=review-spoilers]'),editor=()=>doc.querySelector('[name=review-text]').value;
 u.w.api.mediaTools=async packet=>{if(packet.action==='decision-save')return {ok:true};return {ok:true,reviews:[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture'},{id:'2',text:secret,author:'Other',spoiler:true}],identity:{title:'The Matrix',year:1999},match:{state:'matched'},url:'https://letterboxd.com/film/the-matrix/reviews/'};};
 try{
  u.click('Use reviews from open Browser page');await u.wait();assert.match(editor(),/ZEBRA/,'loaded while spoilers were explicitly on');
  box.checked=false;box.dispatchEvent(new u.w.Event('change'));
  assert.doesNotMatch(editor(),/ZEBRA/);assert.doesNotMatch(u.draft.reviews,/ZEBRA/);assert.doesNotMatch(doc.querySelector('.mrv-loaded-sample').textContent,/ZEBRA/);assert.match(doc.querySelector('.mrv-loaded-sample').textContent,/1 spoiler reviews excluded/);
  u.click('Preview & analyze');await u.wait();assert.doesNotMatch(doc.querySelector('.mrv-sample').textContent,/ZEBRA/);assert.match(doc.querySelector('.mrv-selection-audit').textContent,/Excluded: spoilers disabled/);
  let sent='';u.w.aiChatSend=async()=>{sent=JSON.stringify(u.context());doc.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:u.context(),text:JSON.stringify({summary:'Acting praised.',fit:'Conditional.',points:[{id:'1',quote:'Strong acting',reason:'Acting praised.',kind:'praise'}]})}}));};
  u.click('Send this sample');await u.wait();assert(sent.includes('Strong acting'));assert.doesNotMatch(sent,/ZEBRA/);assert.doesNotMatch(doc.querySelector('.mrv-output').textContent,/ZEBRA/);
  u.click('Discard analysis');await u.wait();box.checked=true;box.dispatchEvent(new u.w.Event('change'));assert.match(editor(),/ZEBRA/,'turning spoilers back on restores the loaded text; nothing was lost');
 }finally{u.w.close();}
});

test('An analysis built with spoilers on is hidden, not copyable and dropped from the assistant context when spoilers are turned off, including a result that arrives late',async()=>{
 const secret='ZEBRA_ANALYSIS_SPOILER the hero dies at the end.',rows=[{id:'1',text:'Strong acting and a memorable atmosphere.',author:'Fixture'},{id:'2',text:secret,author:'Other',spoiler:true}];
 const u=ui({reviews:JSON.stringify(rows),spoiler:true}),doc=u.w.document,box=doc.querySelector('[name=review-spoilers]'),output=()=>doc.querySelector('.mrv-output').textContent;
 const toggle=on=>{box.checked=on;box.dispatchEvent(new u.w.Event('change'));};
 const answer=JSON.stringify({summary:'Acting praised; the ending is revealed.',fit:'Conditional.',points:[{id:'1',quote:'Strong acting',reason:'Acting praised.',kind:'praise'},{id:'2',quote:'the hero dies',reason:'The ending is revealed.',kind:'criticism'}]});
 let sent='',captured;
 try{
  u.click('Preview & analyze');await u.wait();doc.querySelector('[name=review-title-confirmed]').checked=true;
  u.w.aiChatSend=async()=>{captured=u.context();sent=JSON.stringify(captured);u.w.player.job={chatContext:captured,running:true};};u.click('Send this sample');await u.wait();
  assert.match(sent,/ZEBRA/,'with spoilers on the sample reaches the provider');assert.match(JSON.stringify(u.context()),/ZEBRA/);
  toggle(false);assert.doesNotMatch(JSON.stringify(u.context()),/ZEBRA/,'turning spoilers off removes the spoiler evidence from the assistant context');
  doc.dispatchEvent(new u.w.CustomEvent('assistant-answer',{detail:{context:captured,text:answer}}));await u.wait();
  assert(doc.querySelector('[data-review-spoiler-gate]'),'a late result built with spoilers is gated');assert.doesNotMatch(output(),/ZEBRA|hero dies|Strong acting/);
  u.click('Reveal this spoiler analysis');assert.match(output(),/hero dies/,'an explicit reveal shows it');
  toggle(false);assert(doc.querySelector('[data-review-spoiler-gate]'),'turning spoilers off again hides it again');assert.doesNotMatch(output(),/hero dies/);
  toggle(true);assert.match(output(),/hero dies/,'with spoilers on again nothing is lost');
 }finally{u.w.close();}
});

test('Native review analysis reports the actual provider failure instead of waiting for a legacy player job',async()=>{
 const u=ui();try{u.click('Use reviews from open Browser page');await u.wait();u.click('Preview & analyze');await u.wait();u.w.AssistantAgentUI={send:async()=>{}};u.w.aiChatSend=async()=>({ok:false,error:'Provider fixture unavailable'});u.click('Send this sample');await u.wait();await u.wait();assert.match(u.draft.attempt.error,/Provider fixture unavailable/);assert(u.draft.reviews.includes('Strong acting'));}finally{u.w.close();}
});
test('All fifteen loaded reviews reach analysis even when the reader shows only its first review',async()=>{
 const rows=Array.from({length:15},(_,i)=>({id:'r'+i,text:'Distinct review '+i+' with a thoughtful source opinion.'})),u=ui({reviews:JSON.stringify(rows)});let sent;
 try{u.click('Preview & analyze');await u.wait();u.w.document.querySelector('[name=review-title-confirmed]').checked=true;u.w.aiChatSend=async()=>{sent=JSON.parse(u.context().reviewAnalysis);};u.click('Send this sample');await u.wait();await u.wait();assert.equal(sent.reviews.length,15);assert.deepEqual(sent.reviews.map(r=>r.id),rows.map(r=>r.id));}finally{u.w.close();}
});

test('Implausible future review dates are not shown as verified publication dates',()=>{
 const parsed=reviews.parseLetterboxdReviews(html.replace('<li>','<li><time datetime="2565-08-18"></time>'));
 assert.equal(parsed.reviews.length,1);assert.equal(Object.hasOwn(parsed.reviews[0],'date'),false);const valid=reviews.parseLetterboxdReviews(html.replace('<li>','<li><time datetime="2018-08-18"></time>'));assert.equal(valid.reviews[0].date,'2018-08-18');
});
test('review workflow modes preserve manual evidence and never fetch or analyze on navigation',async()=>{
 const draft={reviews:'A source review with exact punctuation.',attempt:{state:'analyzing'}},u=ui(draft);try{const source=u.w.document.querySelector('.mrv-control-room'),raw=source.querySelector('[name=review-text]'),before=raw.value;assert.equal(source.dataset.sourceView,'sample');assert.equal(source.querySelector('[data-review-action=preview]').hidden,true);u.click('Load from a source');await u.wait();assert.equal(source.dataset.sourceView,'sources');u.click('Text & advanced options');await u.wait();assert.equal(source.dataset.sourceView,'raw');assert.equal(raw.value,before);u.click('Sample & analysis');await u.wait();assert.equal(source.dataset.sourceView,'sample');assert.equal(u.calls.filter(p=>p&&typeof p==='object').length,0);}finally{u.w.close();}
});
