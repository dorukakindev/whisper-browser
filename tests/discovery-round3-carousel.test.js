'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const row=id=>({providerId:id,kind:'film',title:'Title '+id,year:2026,genres:[],rating:'8.1',backdrop:'https://images.metahub.space/background/'+id});
function fixture(t,rows){
  const dom=new JSDOM('<div id="mediaHome"><div id="root"></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window;w.MediaVisual={title:title=>title,filter:node=>node,icon:()=>null,art:()=>{}};w.CinemaUI={rebutton:()=>{}};
  w.api={mediaDiscovery:async()=>({ok:true,rows,nextSkip:null})};
  w.eval(fs.readFileSync(require.resolve('../src/renderer/media-discovery-ui.js'),'utf8'));
  w.MediaDiscoveryUI.mount(w.document.getElementById('root'),{tab:'browse',rows,next:null});
  return {w,root:w.document.getElementById('root')};
}
test('Discover carousel follows dots and arrows, wraps, retains controls focus and opens active title',async t=>{
  const h=fixture(t,[row('tt1'),row('tt2'),row('tt3')]);
  const hero=h.root.querySelector('.cn-discover-hero'),dots=[...hero.querySelectorAll('.cn-discover-dot')],arrows=hero.querySelectorAll('.cn-discover-arrow');
  assert.equal(dots.length,3);assert.equal(dots[0].getAttribute('aria-pressed'),'true');
  arrows[1].focus();arrows[1].click();await tick();
  assert.equal(hero.dataset.featureId,'tt2');assert.equal(h.w.document.activeElement,arrows[1]);assert.equal(dots[1].getAttribute('aria-pressed'),'true');
  dots[2].click();await tick();assert.match(hero.querySelector('h1').textContent,/tt3/);
  arrows[1].click();await tick();assert.equal(hero.dataset.featureId,'tt1');
  arrows[0].click();await tick();assert.equal(hero.dataset.featureId,'tt3');
  // Exercise the original details handler through the active feature action.
  let selected;h.w.MediaHomeUI={returnHome:()=>{}};h.w.UiMotion={captureMedia:()=>null};
  h.w.api.mediaDiscovery=async input=>{selected=input;return {ok:false,error:'fixture stop'};};
  h.w.MediaTitleUI={createPage:()=>{const dialog=h.w.document.createElement('dialog');dialog.open=true;h.w.document.body.append(dialog);return dialog;}};
  hero.querySelector('.cn-feature-open').click();await tick();assert.equal(selected.id,'tt3');assert.equal(selected.action,'detail');
});
test('Discover omits carousel controls for one feature and suppresses hero during search',t=>{
  const h=fixture(t,[row('tt1')]);assert.equal(h.root.querySelector('.cn-discover-carousel').hidden,true);
  const saved=h.w.MediaDiscoveryUI.snapshot();h.w.MediaDiscoveryUI.mount(h.root,{...saved,query:'search title'});
  assert.equal(h.root.querySelector('.cn-discover-hero'),null);
});


test('a stale image error cannot hide the newly selected slide',async t=>{
  const h=fixture(t,[row('tt1'),row('tt2')]),hero=h.root.querySelector('.cn-discover-hero'),old=hero.querySelector('img');
  Object.defineProperties(old,{naturalWidth:{value:1920},naturalHeight:{value:1080}});old.dispatchEvent(new h.w.Event('load'));
  assert.equal(hero.hidden,false);hero.querySelectorAll('.cn-discover-arrow')[1].click();await tick();
  old.dispatchEvent(new h.w.Event('error'));assert.equal(hero.hidden,false);assert.equal(hero.dataset.featureId,'tt2');
});
