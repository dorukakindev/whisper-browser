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
