'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function fixture(t,respond){
  const dom=new JSDOM('<div id="mediaHome"><div id="root" class="md-page"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[];w.UiLocale={get:()=> 'en'};w.api={mediaDiscovery:async input=>{calls.push(input);return respond(input,calls.length);}};
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
  [...h.root.querySelectorAll('.md-footer button')].find(b=>b.textContent==='Retry').click();await tick();
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
  assert.equal(h.w.document.activeElement.tagName,'SELECT');assert.equal(h.w.document.activeElement.value,'series');
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
