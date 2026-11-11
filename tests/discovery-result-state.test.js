'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function fixture(t,respond,personal=()=>({ok:true,rows:[]})){
  const dom=new JSDOM('<div id="mediaHome"><div id="root" class="md-page"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[];w.UiLocale={get:()=> 'en'};w.api={mediaDiscovery:async input=>{if(input.action==='personal')return personal(input);calls.push(input);return respond(input,calls.length);}};
  w.eval(fs.readFileSync(require.resolve('../src/renderer/media-visual.js'),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../src/renderer/discovery-personal-ui.js'),'utf8'));
  w.eval(fs.readFileSync(require.resolve('../src/renderer/media-discovery-ui.js'),'utf8'));
  w.MediaDiscoveryUI.mount(w.document.getElementById('root'));
  return {w,calls,root:w.document.getElementById('root')};
}
const row=id=>({providerId:id,kind:'film',title:'Film '+id,year:2025,backdrop:'https://images.metahub.space/background/'+id});

test('append failure preserves titles and retries the failed cursor rather than restarting the list',async t=>{
  let failed=false;
  const h=fixture(t,async input=>{if(input.skip===100&&!failed){failed=true;return {ok:false,error:'Controlled network failure'};}return {ok:true,rows:[row(input.skip===100?'tt2222222':'tt1111111')],nextSkip:input.skip===100?null:100};});
  await tick();h.root.querySelector('.md-more').click();await tick();
  assert.equal(h.root.querySelector('[data-discovery-id]').dataset.discoveryId,'tt1111111');
  h.root.querySelector('.md-retry').click();await tick();
  assert.deepEqual(h.calls.map(c=>c.skip),[0,100,100]);
  assert.equal(h.root.querySelectorAll('[data-discovery-id]').length,2);
});

test('append loading preserves the existing featured artwork and focused card',async t=>{
  let resolve;
  const h=fixture(t,input=>input.skip?new Promise(r=>resolve=r):{ok:true,rows:[row('tt1111111')],nextSkip:100});
  await tick();const hero=h.root.querySelector('.md-feature'),card=h.root.querySelector('[data-discovery-id]');card.focus();
  h.root.querySelector('.md-more').click();await tick();
  assert.equal(h.root.querySelector('.md-feature'),hero);assert.equal(h.root.querySelector('[data-discovery-id]'),card);
  resolve({ok:true,rows:[row('tt2222222')],nextSkip:null});await tick();
  assert.equal(h.root.querySelector('.md-feature'),hero);
});

test('filter update restores focus to the same labeled control after redrawing results',async t=>{
  const h=fixture(t,()=>({ok:true,rows:[row('tt1111111')],nextSkip:null}));await tick();
  const select=h.root.querySelector('select');select.focus();select.value='series';select.dispatchEvent(new h.w.Event('change',{bubbles:true}));await tick();
  assert.equal(h.w.document.activeElement.tagName,'SUMMARY');assert.equal(h.w.document.activeElement.getAttribute('aria-label'),'Type · Series');assert.equal(h.root.querySelector('select').value,'series');
});

test('snapshot restores filters, loaded results and scroll after leaving the section',async t=>{
  const h=fixture(t,()=>({ok:true,rows:[row('tt1111111')],nextSkip:100}));await tick();
  const search=h.root.querySelector('input[type=search]');search.value='Retained draft';search.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  h.w.document.getElementById('mediaHome').scrollTop=420;
  const saved=h.w.MediaDiscoveryUI.snapshot();h.w.MediaDiscoveryUI.leave();h.root.remove();
  const other=h.w.document.createElement('div');h.w.document.getElementById('mediaHome').append(other);h.w.MediaDiscoveryUI.mount(other,saved);await tick();await tick();
  assert.equal(other.querySelector('input[type=search]').value,'Retained draft');
  assert.equal(other.querySelectorAll('[data-discovery-id]').length,1);assert.equal(h.calls.length,1);
  assert.equal(h.w.document.getElementById('mediaHome').scrollTop,420);
});

test('unsubmitted search draft cannot change the query used by the current pagination cursor, including after reopen',async t=>{
 const h=fixture(t,input=>({ok:true,rows:[row(input.query?'tt3333333':input.skip?'tt2222222':'tt1111111')],nextSkip:input.skip?null:100}));await tick();
 const search=h.root.querySelector('input[type=search]');search.value='New draft';search.dispatchEvent(new h.w.Event('input',{bubbles:true}));
 const saved=h.w.MediaDiscoveryUI.snapshot();h.w.MediaDiscoveryUI.leave();h.root.remove();const root=h.w.document.createElement('div');h.w.document.getElementById('mediaHome').append(root);h.w.MediaDiscoveryUI.mount(root,saved);await tick();
 root.querySelector('.md-more').click();await tick();assert.deepEqual(h.calls.map(c=>[c.query,c.skip]),[['',0],['',100]]);assert.equal(root.querySelectorAll('[data-discovery-id]').length,2);assert.equal(root.querySelector('input[type=search]').value,'New draft');
 root.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(h.calls.at(-1).query,'New draft');assert.equal(h.calls.at(-1).skip,0);assert.equal(root.querySelectorAll('[data-discovery-id]').length,1);assert.equal(root.querySelector('[data-discovery-id]').dataset.discoveryId,'tt3333333');
});


test('v2 personal preview survives the parallel catalog request and opens the real recommendation view',async t=>{
 const h=fixture(t,()=>({ok:true,rows:[row('tt1111111')],nextSkip:null}),()=>({ok:true,rows:[{...row('tt2222222'),because:'Rated source'}]}));
 await tick();assert(h.root.querySelector('.cv2-discover-personal'));assert.match(h.root.querySelector('.cv2-discover-personal .cv2-personal-card').textContent,/Film tt2222222.*Catalog relationship/);
 assert.equal(h.root.querySelectorAll('[data-discovery-id]').length,1);
 h.root.querySelector('.cv2-discover-personal header button').click();await tick();
 assert.equal(h.w.MediaDiscoveryUI.snapshot().tab,'personal');assert.equal(h.root.querySelector('.cn-discover-tab[aria-pressed=true]').textContent,'For you');
});

function detailSurface(h){const w=h.w;w.MediaHomeUI={returnHome:async()=>{w.document.body.classList.add('media-home-active');const n=w.document.createElement('div');n.id='playerLayer';n.className='hidden';w.document.body.append(n);}};let page;
 w.MediaTitleUI={createPage:()=>{page?.close();page=w.document.createElement('section');page.className='media-title-page';page.open=true;page.close=()=>{if(!page.open)return;page.open=false;page.dispatchEvent(new w.Event('close'));};w.document.body.append(page);return page;},open:async id=>({ok:true,itemId:id})};return ()=>page;
}
const detailItem=id=>({...row(id),genres:['Drama'],cast:[],synopsis:'A catalog story.'});
test('detail preserves recommendation basis, refreshes exact membership and retry stays on selected identity',async t=>{
 let failed=true,catalogId=null;const h=fixture(t,input=>{if(input.action==='detail'){if(failed){failed=false;return {ok:false,error:'Network unavailable'};}return {ok:true,item:detailItem(input.id),catalogId};}return {ok:true,rows:[row('tt1111111')],nextSkip:null};});const page=detailSurface(h);await tick();
 await h.w.MediaDiscoveryUI.openDetail({...row('tt1111111'),because:'Legacy source'});assert.match(page().textContent,/Network unavailable/);page().querySelector('.md-detail-retry').click();await tick();assert.equal(h.w.document.querySelectorAll('.media-title-page').length,1);assert.equal(page().querySelector('.md-recommendation-basis').dataset.reasonKind,'metadata');assert.match(page().textContent,/Legacy source/);assert.match(page().querySelector('.md-membership').textContent,/Not in/);
 catalogId='saved-exact';h.w.document.dispatchEvent(new h.w.CustomEvent('media-personal-changed',{detail:{catalogId,identity:{kind:'film',imdbId:'tt1111111'}}}));await tick();assert.equal(page().querySelector('.md-primary-actions button').textContent,'Open in library');assert.match(page().querySelector('.md-membership').textContent,/In your library/);assert(!h.calls.some(c=>['add','feedback'].includes(c.action)));
 catalogId=null;h.w.document.dispatchEvent(new h.w.CustomEvent('media-library-changed'));await tick();assert.equal(page().querySelector('.md-primary-actions button').textContent,'Add to watchlist');
});
test('personal preview updates after external saves and rejects stale late preview responses',async t=>{
 let resolve,turn=0;const h=fixture(t,()=>({ok:true,rows:[row('tt1111111')],nextSkip:null}),()=>++turn===1?new Promise(r=>resolve=r):{ok:true,rows:[{...row('tt3333333'),because:'Current'}]});await tick();h.w.document.dispatchEvent(new h.w.CustomEvent('media-personal-changed',{detail:{origin:'discovery-personal'}}));await tick();resolve({ok:true,rows:[{...row('tt2222222'),because:'Stale'}]});await tick();assert.match(h.root.querySelector('.cv2-discover-personal').textContent,/tt3333333/);assert.doesNotMatch(h.root.querySelector('.cv2-discover-personal').textContent,/tt2222222/);
});

test('empty results retain the submitted query and reset returns focus without changing media type', async t => {
  const h = fixture(t, () => ({ok:true, rows:[], nextSkip:null}));
  await tick();
  const type = h.root.querySelector('select');
  type.value = 'series';
  type.dispatchEvent(new h.w.Event('change', {bubbles:true}));
  await tick();
  const search = h.root.querySelector('input[type=search]');
  search.value = 'Submitted title';
  search.form.dispatchEvent(new h.w.Event('submit', {bubbles:true,cancelable:true}));
  await tick();
  const current = h.root.querySelector('input[type=search]');
  current.value = 'Unsubmitted draft';
  current.dispatchEvent(new h.w.Event('input', {bubbles:true}));
  assert.equal(h.root.querySelector('.cn-discover-empty-query').textContent, 'Submitted title');
  [...h.root.querySelectorAll('.cn-discover-empty button')].find(b => b.textContent === 'Reset search and filters').click();
  await tick();
  assert.equal(h.calls.at(-1).kind, 'series');
  assert.equal(h.calls.at(-1).query, '');
  assert.equal(h.w.document.activeElement, h.root.querySelector('input[type=search]'));
});

// ---- Keşfet liste sürekliliği: kütüphane değişince yüklenmiş sayfalar, imleç ve odak korunur ----
const PAGES={0:['tt1111111','tt1111112'],100:['tt2222221','tt2222222'],200:['tt3333331']};
function pagedRespond(members,hidden=new Set()){return input=>{if(input.action==='detail')return {ok:true,item:{...detailItem(input.id),watchStatus:members.has(input.id)?'planned':'unspecified'},catalogId:members.has(input.id)?'cat-'+input.id:null};const skip=input.skip||0;if(input.query)return {ok:true,rows:[row('tt9999999')],nextSkip:null};return {ok:true,rows:(PAGES[skip]||[]).filter(id=>!hidden.has(id)).map(id=>({...row(id),catalogId:members.has(id)?'cat-'+id:null})),nextSkip:skip===0?100:skip===100?200:null};};}
const cardIds=h=>[...h.root.querySelectorAll('[data-discovery-id]')].map(n=>n.dataset.discoveryId);
const libraryChanged=h=>h.w.document.dispatchEvent(new h.w.Event('media-library-changed'));
async function loadTwoPages(h){await tick();h.root.querySelector('.md-more').click();await tick();assert.deepEqual(cardIds(h),['tt1111111','tt1111112','tt2222221','tt2222222']);}

test('library change refreshes every loaded page in place and keeps order, cursor and the focused card',async t=>{
  const members=new Set(),h=fixture(t,pagedRespond(members));await loadTwoPages(h);
  const card=[...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt2222222');card.focus();
  members.add('tt2222222');libraryChanged(h);await tick();await tick();
  assert.deepEqual(cardIds(h),['tt1111111','tt1111112','tt2222221','tt2222222'],'loaded pages are not dropped');
  assert.deepEqual(h.calls.map(c=>c.skip),[0,100,0,100],'only the loaded range is requested again');
  const fresh=[...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt2222222');
  assert.match(fresh.querySelector('.cn-poster-meta').textContent,/In library/);
  assert.equal(h.w.document.activeElement,fresh,'focus follows the title identity to the rebuilt card');
  assert.equal(h.root.querySelector('.md-more').hidden,false,'the next page cursor is kept');
});

test('a focused card that leaves the list moves focus to its neighbour, not to the page',async t=>{
  const hidden=new Set(),h=fixture(t,pagedRespond(new Set(),hidden));await loadTwoPages(h);
  [...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt1111112').focus();
  hidden.add('tt1111112');libraryChanged(h);await tick();await tick();
  assert.deepEqual(cardIds(h),['tt1111111','tt2222221','tt2222222']);
  assert.equal(h.w.document.activeElement.dataset.discoveryId,'tt2222221');
});

test('focus is not pulled back when the user moved to another control during the refresh',async t=>{
  const h=fixture(t,pagedRespond(new Set(['tt1111111'])));await loadTwoPages(h);
  h.root.querySelector('input[type=search]').focus();libraryChanged(h);await tick();await tick();
  assert.equal(h.w.document.activeElement,h.root.querySelector('input[type=search]'));
});

for(const order of ['refresh-first','append-first']){
  test(`stale refresh cannot drop loaded cards or duplicate a title when a third page is requested meanwhile (${order})`,async t=>{
    const members=new Set(),base=pagedRespond(members);let gate,releaseRefresh,releaseAppend,armed=false,appendGate=false;
    const h=fixture(t,input=>{if(armed&&!input.skip&&!input.query&&input.action==='list'){armed=false;return new Promise(r=>{releaseRefresh=()=>r(base(input));});}if(appendGate&&input.skip===200){appendGate=false;return new Promise(r=>{releaseAppend=()=>r(base(input));});}return base(input);});
    await loadTwoPages(h);members.add('tt2222222');armed=true;appendGate=true;libraryChanged(h);await tick();
    h.root.querySelector('.md-more').click();await tick();
    if(order==='refresh-first'){releaseRefresh();await tick();releaseAppend();}else{releaseAppend();await tick();releaseRefresh();}
    await tick();await tick();await tick();
    const ids=cardIds(h);assert.deepEqual(ids,['tt1111111','tt1111112','tt2222221','tt2222222','tt3333331']);assert.equal(new Set(ids).size,ids.length,'no duplicates');
    assert.match([...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt2222222').querySelector('.cn-poster-meta').textContent,/In library/,'membership is current after the page request');
    assert.equal(h.root.querySelector('.md-more').hidden,true);
  });
}

test('a held membership refresh cannot overwrite a newer search',async t=>{
  const members=new Set(),base=pagedRespond(members);let release,armed=false;
  const h=fixture(t,input=>{if(armed&&!input.skip&&!input.query&&input.action==='list'){armed=false;return new Promise(r=>{release=()=>r(base(input));});}return base(input);});
  await loadTwoPages(h);armed=true;libraryChanged(h);await tick();
  const search=h.root.querySelector('input[type=search]');search.value='yeni';search.form.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.deepEqual(cardIds(h),['tt9999999']);
  release();await tick();await tick();
  assert.deepEqual(cardIds(h),['tt9999999'],'the late refresh of the old query is discarded');
  assert.equal(h.root.querySelector('input[type=search]').value,'yeni');
});

function realTitlePages(h,opened=[]){const w=h.w;w.MediaHomeUI={returnHome:async()=>{w.document.body.classList.add('media-home-active');const n=w.document.createElement('div');n.id='playerLayer';n.className='hidden';w.document.body.append(n);}};
  w.eval(fs.readFileSync(require.resolve('../src/renderer/media-title.js'),'utf8'));const real=w.MediaTitleUI.createPage;
  w.MediaTitleUI=Object.freeze({...w.MediaTitleUI,createPage:(cls,options)=>real(cls,options),open:async(id,options)=>{opened.push({id,options});return {ok:true,itemId:id};}});return opened;}

test('closing a detail page returns focus to the same title after a refresh rebuilt its card',async t=>{
  const members=new Set(),h=fixture(t,pagedRespond(members));realTitlePages(h);await loadTwoPages(h);
  const card=[...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt2222221');card.focus();card.click();await tick();await tick();
  assert(h.w.document.querySelector('.media-title-page'));
  members.add('tt2222221');libraryChanged(h);await tick();await tick();
  const rebuilt=[...h.root.querySelectorAll('[data-discovery-id]')].find(n=>n.dataset.discoveryId==='tt2222221');assert.notEqual(rebuilt,card);assert(!card.isConnected);
  h.w.document.querySelector('.media-title-page').close();await tick();
  assert.equal(h.w.document.activeElement,rebuilt);
});

test('adding from a detail page keeps the page, then Open in library uses the saved record identity and a Discover return path',async t=>{
  const members=new Set(),opened=[];let addResponse=null;
  const h=fixture(t,input=>input.action==='add'?addResponse(input):pagedRespond(members)(input));realTitlePages(h,opened);await tick();
  const card=h.root.querySelector('[data-discovery-id=tt1111111]');card.focus();card.click();await tick();await tick();
  const page=()=>h.w.document.querySelector('.media-title-page'),primary=()=>page().querySelector('.md-primary-actions button');
  assert.equal(primary().textContent,'Add to watchlist');
  addResponse=()=>({ok:true,item:{id:'cat-other',kind:'film',imdbId:'tt0000000',watchStatus:'planned'}});primary().click();await tick();
  assert.match(page().textContent,/identity could not be verified/);assert.equal(primary().textContent,'Add to watchlist','a mismatched record never changes membership');assert.equal(primary().disabled,false);
  addResponse=()=>{members.add('tt1111111');return {ok:true,item:{id:'cat-tt1111111',kind:'film',imdbId:'tt1111111',watchStatus:'planned'}};};
  primary().click();await tick();await tick();
  assert(page(),'the detail page stays open');assert.equal(opened.length,0);
  assert.equal(primary().textContent,'Open in library');assert.match(page().querySelector('.md-membership').textContent,/On your watchlist/);assert.match(page().textContent,/Added to your watchlist/);
  assert.equal(page().querySelector('.md-remove-watchlist').hidden,false);
  primary().click();await tick();await tick();
  assert.equal(opened.length,1);assert.equal(opened[0].id,'cat-tt1111111');assert.equal(opened[0].options.backLabel(),'← Back to Discover');
  assert.equal(opened[0].options.returnFocus().dataset.discoveryId,'tt1111111');
});

test('a failed add leaves membership and the existing watch state untouched',async t=>{
  const members=new Set(['tt1111111']),h=fixture(t,input=>input.action==='add'?{ok:false,error:'Disk is full'}:pagedRespond(members)(input));realTitlePages(h);await tick();
  const card=h.root.querySelector('[data-discovery-id=tt1111112]');card.click();await tick();await tick();
  const page=h.w.document.querySelector('.media-title-page');page.querySelector('.md-primary-actions button').click();await tick();
  assert.match(page.textContent,/Disk is full/);assert.match(page.querySelector('.md-membership').textContent,/Not in your library/);assert.doesNotMatch(page.textContent,/Added to your watchlist/);
});

test('watchlist removal waits for the initial personal read before staging the confirmed change',async t=>{
  const members=new Set(['tt1111111']),h=fixture(t,pagedRespond(members));realTitlePages(h);
  h.w.Element.prototype.scrollIntoView=()=>{};
  let release;const reads=new Promise(resolve=>release=resolve),previews=[];
  h.w.api.personalMedia=async input=>{
    if(input.action==='get'){await reads;return {ok:true,item:{watchStatus:'planned'}};}
    previews.push(input);return {ok:true,token:'removal',preview:{changes:input.changes}};
  };
  h.w.eval(fs.readFileSync(require.resolve('../src/renderer/personal-media-ui.js'),'utf8'));
  await tick();h.root.querySelector('[data-discovery-id=tt1111111]').click();await tick();
  const page=h.w.document.querySelector('.media-title-page');
  assert.equal(page.querySelector('.pm-watch select').disabled,true);
  page.querySelector('.md-remove-watchlist').click();await tick();
  assert.equal(previews.length,0,'nothing is staged against a loading personal record');
  release();await new Promise(resolve=>setTimeout(resolve,160));
  assert.equal(previews.length,1);assert.equal(JSON.stringify(previews[0].changes),'{"watchStatus":"unspecified"}');
  assert(page.querySelector('.pm-preview'),'removal reaches the existing confirmation surface');
  assert.equal(members.size,1,'preview does not remove the record');
});


test('R854 G46 removes only the selected discovery exclusion and preserves the personal record',async t=>{
 const personal={watchStatus:'completed',reaction:'dislike',personalRating:2,note:'keep'},original=JSON.stringify(personal);let removed=false;
 const h=fixture(t,async q=>q.action==='feedback-list'?{ok:true,rows:removed?[]:[{...row('tt1111111'),feedback:'hidden',personalMedia:personal}]}:q.action==='feedback'?(removed=true,{ok:true}):{ok:true,rows:[],nextSkip:null});await tick();
 [...h.root.querySelectorAll('.cn-discover-tab')].find(b=>b.textContent==='Preferences').click();await tick();const undo=h.root.querySelector('.md-restore-preference');assert(undo);assert.match(undo.getAttribute('aria-label'),/tt1111111/);undo.click();await tick();
 assert.deepEqual(h.calls.filter(q=>q.action==='feedback').map(q=>[q.id,q.kind,q.state]),[['tt1111111','film','none']]);assert.equal(JSON.stringify(personal),original);assert.equal(h.root.querySelector('[data-discovery-id]'),null);assert.match(h.root.querySelector('.md-status').textContent,/history are unchanged/);
});
test('R854 G47/G48 distinguish personal, metadata and absent evidence; empty guidance opens existing library without likes',async t=>{
 let empty=false;const h=fixture(t,async()=>({ok:true,rows:[],nextSkip:null}),()=>({ok:true,needsRatings:empty,rows:empty?[]:[{...row('tt1111111'),recommendationEvidence:{seedTitle:'Saved rating',reaction:'like',genre:'Drama'}},{...row('tt2222222'),because:'Catalog link'},row('tt3333333')]}));const routes=[];h.w.MediaHomeUI={navigate:async p=>routes.push(p)};await tick();
 const personalTab=[...h.root.querySelectorAll('.cn-discover-tab')].find(b=>b.textContent==='For you');personalTab.click();await tick();const labels=[...h.root.querySelectorAll('.md-reason')].map(n=>n.textContent).join(' ');assert.match(labels,/Saved rating/);assert.match(labels,/No verified personal like/);assert.match(labels,/no saved personal recommendation evidence/);
 empty=true;personalTab.click();await tick();const open=[...h.root.querySelectorAll('button')].find(b=>b.textContent==='Review library ratings and genres');assert(open);open.click();await tick();assert.deepEqual(routes,['films']);assert(!h.calls.some(c=>c.action==='feedback'));
});
