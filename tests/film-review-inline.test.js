const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),model=require('../src/renderer/media-tools-model');
const item={id:'discovery:film:tt1234567',title:'Film',kind:'film',year:2026,imdbId:'tt1234567',discovery:{kind:'film',id:'tt1234567'}};
const reviews=[{id:'r1',author:'Reader',text:'The acting is excellent but the pace is slow.'}],analysis={summary:'Acting praised.',fit:'No personal evidence.',points:[{id:'r1',quote:'The acting is excellent',kind:'praise',reason:'Strong performances.'}],at:1000};
async function setup(history,options={}){const dom=new JSDOM('<section class="media-title-page"><section id="review"></section></section>',{runScripts:'outside-only'}),w=dom.window;w.UiLocale={get:()=> 'en'};w.eval(fs.readFileSync('src/renderer/media-visual.js','utf8'));w.eval(fs.readFileSync('src/renderer/cinema-ui.js','utf8'));w.MediaToolsModel=model;w.MediaToolsUI={open:()=>{},reviewSnapshot:()=>null};w.api={mediaTools:async()=>({ok:true,value:{history}}),mediaShelf:async()=>{if(options.profileError)throw Error('Profile offline');return {ok:true,taste:options.taste||{}};}};w.eval(fs.readFileSync('src/renderer/review-decision-ui.js','utf8'));w.MediaReviewDecision.mountTitle(w.document.getElementById('review'),item);await new Promise(r=>setTimeout(r,0));return {dom,w,text:()=>w.document.getElementById('review').textContent};}
test('Film page displays saved verified analysis and original sources without any model call',async()=>{const h=await setup([{identity:item,analysis,reviews}]);try{assert.match(h.text(),/Acting praised/);assert.match(h.text(),/Saved analysis/);assert.match(h.text(),/1 source reviews/);assert.equal(h.w.document.querySelectorAll('.film-review-original').length,1);assert.equal(h.w.document.querySelector('.film-review-proof').open,false);}finally{h.dom.window.close();}});
test('Conflicting film identity is never shown on this page',async()=>{const h=await setup([{identity:{...item,imdbId:'tt9999999'},analysis,reviews}]);try{assert.doesNotMatch(h.text(),/Acting praised/);assert.match(h.text(),/Read original reviews and analyze them together/);}finally{h.dom.window.close();}});
test('Spoiler sources hide the entire synthesis until explicit reveal',async()=>{const h=await setup([{identity:item,analysis,reviews:[{...reviews[0],spoiler:true}]}]);try{assert.doesNotMatch(h.text(),/Acting praised/);assert.match(h.text(),/Reveal spoiler analysis/);[...h.w.document.querySelectorAll('button')].find(n=>n.textContent==='Reveal spoiler analysis').click();await new Promise(r=>setTimeout(r,0));assert.match(h.text(),/Acting praised/);}finally{h.dom.window.close();}});
test('Saved-analysis comparison cannot reveal prior spoilers without explicit consent',async()=>{const h=await setup([{identity:item,analysis,reviews},{identity:item,analysis:{...analysis,summary:'Old spoiler summary'},reviews:[{...reviews[0],spoiler:true}]}]);try{assert.doesNotMatch(h.text(),/Old spoiler summary/);assert.match(h.text(),/Reveal spoiler-containing previous analysis/);}finally{h.dom.window.close();}});

test('Film review entry point changes from load to manage without another analysis call',async()=>{const empty=await setup([]),saved=await setup([{identity:item,analysis,reviews}]);try{assert.equal(empty.w.document.querySelector('.film-review-section').dataset.reviewState,'empty');assert.equal(empty.w.document.querySelector('[data-review-action=load]').textContent,'Load reviews');assert.equal(saved.w.document.querySelector('.film-review-section').dataset.reviewState,'ready');assert.equal(saved.w.document.querySelector('[data-review-action=load]').textContent,'Manage reviews');assert.equal(saved.w.document.querySelector('.film-decision-profile').tagName,'DETAILS');assert.equal(saved.w.document.querySelector('.film-decision-profile').open,false);}finally{empty.dom.window.close();saved.dom.window.close();}});

for(const state of ['current','stale','unknown'])test('Film reading page checks saved context against the current taste profile: '+state,async()=>{
 const taste={preferencesConfigured:true,preferences:{weights:{story:5,pace:2},note:'Patient character stories'}},evidence=model.decisionEvidence(item,reviews,taste).evidence;
 const entry={identity:item,analysis,reviews:evidence.reviews,evidenceSnapshot:{version:1,context:JSON.stringify(evidence),profile:evidence.profile}};
 const h=await setup([entry],{taste:state==='stale'?{...taste,preferences:{...taste.preferences,note:'Faster stories'}}:taste,profileError:state==='unknown'});
 try{assert.equal(h.w.document.querySelector('.film-review-content .mrv-freshness').dataset.freshness,state);assert.match(h.text(),/Acting praised/);if(state==='stale')assert.match(h.text(),/reuse the saved sample/);if(state==='unknown')assert.match(h.text(),/context could not be checked/);}finally{h.dom.window.close();}
});


test('Film visual rail follows delayed existing artwork and keeps the source reader available',async()=>{
 const h=await setup([{identity:item,analysis,reviews}]);try{
  const art=h.w.document.querySelector('.film-review-art');assert(art.hidden);
  const backdrop=h.w.document.createElement('div');backdrop.className='mtd-backdrop';const image=h.w.document.createElement('img');image.src='data:image/png;base64,AA==';backdrop.append(image);h.w.document.querySelector('.media-title-page').append(backdrop);
  await new Promise(r=>setTimeout(r,0));assert.equal(art.hidden,false);assert.equal(art.querySelector('img').src,image.src);assert.equal(h.w.document.querySelector('.film-review-originals').open,true);assert.equal(h.w.document.querySelector('.film-analysis-scene > .mrv-fit h2').textContent,'Through your lens');
 }finally{h.dom.window.close();}
});


test('Analysis opens the exact source quotation, returns to its point, and retains reader/filter selection on refresh',async()=>{
 const rows=[...reviews,{id:'r2',author:'Second',text:'Other view of the same scene.'}],value={...analysis,points:[...analysis.points,{id:'r2',quote:'Other view',kind:'criticism',reason:'A different reading.'}]};
 const h=await setup([{identity:item,analysis:value,reviews:rows}]);try{
  h.w.HTMLElement.prototype.scrollIntoView=function(){};
  const jump=h.w.document.querySelector('[data-review-id="r2"].mrv-source-jump');jump.click();await new Promise(r=>setTimeout(r,0));
  const mark=h.w.document.querySelector('mark');assert.equal(mark.textContent,'Other view');assert.equal(mark.closest('article').dataset.reviewId,'r2');assert.equal(mark.closest('article').textContent.includes('of the same scene.'),true);assert.equal(h.w.document.querySelector('.film-review-originals').open,true);
  h.w.document.querySelector('.mrv-back-to-point').click();await new Promise(r=>setTimeout(r,0));assert.equal(h.w.document.activeElement,jump);
  [...h.w.document.querySelector('.film-opinion-filters').children].find(n=>n.textContent==='Criticism').click();await new Promise(r=>setTimeout(r,0));
  h.w.document.dispatchEvent(new h.w.Event('media-review-updated'));await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
  assert.equal(h.w.document.querySelector('.film-review-originals .mrv-reader-picker select').value,'r2');assert.equal(h.w.document.querySelector('.film-opinion-filters [aria-pressed=true]').textContent,'Criticism');assert.equal(h.w.document.querySelector('[data-opinion-kind=praise]').hidden,true);
 }finally{h.dom.window.close();}
});

test('Personal fit shows only saved explicit priorities and labels a missing profile as conditional',async()=>{
 const profile={preferencesConfigured:true,preferences:{weights:{story:1,characters:5,pace:0,visuals:4},note:'Character first'}};
 const h=await setup([{identity:item,analysis,reviews,evidenceSnapshot:{profile}}]),none=await setup([{identity:item,analysis,reviews,evidenceSnapshot:{profile:{}}}]);try{
  assert.deepEqual([...h.w.document.querySelectorAll('.mrv-preference-chips span')].map(n=>n.textContent),['Characters','Visuals','Story']);assert.match(none.text(),/No saved taste evidence/);assert.equal(none.w.document.querySelector('.mrv-preference-chips'),null);
 }finally{h.dom.window.close();none.dom.window.close();}
});

test('Reviewer rail keeps exact source text and supports keyboard selection without another request',async()=>{
 const rows=[...reviews,{id:'r2',author:'Second',text:'A different view with the complete original context.'}],value={...analysis,points:[{...analysis.points[0],topic:'characters'},{id:'r2',topic:'pace',quote:'A different view',kind:'criticism',reason:'An interpretation, not a source quote.'}]};
 const h=await setup([{identity:item,analysis:value,reviews:rows}]);try{
  const rail=h.w.document.querySelector('.cv2-review-rail'),options=rail.querySelectorAll('[role=option]');assert.equal(options.length,2);assert.match(options[1].textContent,/complete original context/);options[0].dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(options[1].getAttribute('aria-selected'),'true');assert.equal(h.w.document.activeElement,options[1]);assert.equal(h.w.document.querySelector('.film-review-original:not([hidden])').dataset.reviewId,'r2');assert.equal(h.w.document.querySelectorAll('.cv2-topic-row').length,2);assert.equal(h.w.document.querySelectorAll('.cv2-topic-bar').length,2);assert.equal(h.w.document.querySelector('.cv2-source-quote blockquote').textContent,'The acting is excellent');assert.match(h.w.document.querySelector('.cv2-model-insight').textContent,/Model interpretation/);assert.equal(h.w.document.querySelector('.cn-analysis-full'),null);
 }finally{h.dom.window.close();}
});
test('evidence desk adds topic headings without changing original quotes or source callbacks',async()=>{
 const value={...analysis,points:[{...analysis.points[0],topic:'characters'}]},h=await setup([{identity:item,analysis:value,reviews}]);try{const point=h.w.document.querySelector('.mrv-point');assert.equal(point.querySelector('.mrv-point-heading').textContent,'Characters & acting');assert.equal(point.querySelector('.cv2-source-quote blockquote').textContent,analysis.points[0].quote);assert.equal(point.querySelector('.mrv-source-jump').dataset.reviewId,'r1');assert.match(point.querySelector('.cv2-model-insight').textContent,/Strong performances/);}finally{h.dom.window.close();}
});

test('Saved reviews can be hidden, stay hidden across refresh, and reopen without losing sources',async()=>{
 const h=await setup([{identity:item,analysis,reviews}]);try{
  let button=h.w.document.querySelector('.film-review-collapse');const content=h.w.document.querySelector('.film-review-content');
  assert.equal(button.hidden,false);assert.equal(button.getAttribute('aria-controls'),content.id);assert.equal(button.getAttribute('aria-expanded'),'true');
  button.click();assert.equal(content.hidden,true);assert.equal(button.textContent,'Show reviews');assert.match(content.textContent,/Acting praised/);
  h.w.document.dispatchEvent(new h.w.Event('media-review-updated'));await new Promise(r=>setTimeout(r,0));
  assert.equal(content.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');assert.match(content.textContent,/The acting is excellent/);
  button.click();assert.equal(content.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');assert.match(content.textContent,/Acting praised/);
 }finally{h.dom.window.close();}
});
test('Empty review invitation does not offer a result collapse action',async()=>{const h=await setup([]);try{assert.equal(h.w.document.querySelector('.film-review-collapse').hidden,true);assert.equal(h.w.document.querySelector('.film-review-content').hidden,false);}finally{h.dom.window.close();}});
