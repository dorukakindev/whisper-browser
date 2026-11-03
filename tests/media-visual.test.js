'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function surface(){
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only'});
 dom.window.UiLocale={get:()=> 'tr'};
 dom.window.matchMedia=()=>({matches:true});
 const observers=[];
 dom.window.ResizeObserver=class {constructor(fn){this.update=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 dom.window.eval(fs.readFileSync(require.resolve('../src/renderer/media-visual.js'),'utf8'));
 return {dom,w:dom.window,d:dom.window.document,ui:dom.window.MediaVisual,observers};
}
test('presentation titles clean file paths and browser suffixes without modifying source identity',()=>{
 const {dom,ui}=surface();try{
  const source={title:'C:\\Filmler\\Yolun_Otesinde.2024.mkv - YouTube',id:'stable-source'};
  assert.equal(ui.title(source.title),'Yolun Otesinde 2024');
  assert.equal(source.title,'C:\\Filmler\\Yolun_Otesinde.2024.mkv - YouTube');
  assert.equal(ui.title('/media/Yolun.Otesinde.mp4'),'Yolun Otesinde');
  assert.equal(ui.title('(11) Kaos show – YouTube'),'Kaos show');
  assert.equal(ui.title('Dr. Strangelove'),'Dr. Strangelove');
  assert.equal(ui.title(''),'Başlıksız');
 }finally{dom.window.close();}
});
test('fallback artwork is deterministic, text-only, and yields to a loaded image',()=>{
 const {dom,w,d,ui}=surface();try{
  const a=d.createElement('div'),b=d.createElement('div');ui.art(a,'Kayıp Hatıra');ui.art(b,'Kayıp Hatıra');
  assert.equal(a.dataset.mvTone,b.dataset.mvTone);assert.equal(a.textContent,'KH');
  const image=d.createElement('img');a.prepend(image);ui.art(a,'Kayıp Hatıra');
  image.dispatchEvent(new w.Event('load'));assert.equal(a.dataset.mvArtState,'ready');
  image.dispatchEvent(new w.Event('error'));assert.equal(a.dataset.mvArtState,'missing');
  ui.art(b,'<img onerror=bad>');assert.equal(b.querySelector('img'),null);
  a.replaceChildren(image);a.dispatchEvent(new w.Event('home-art-ready'));assert(a.querySelector('.mv-art-fallback'));assert.equal(a.dataset.mvArtState,'ready');
 }finally{dom.window.close();}
});
test('empty/overflow retain original actions; Escape closes and restores keyboard focus',()=>{
 const {dom,w,d,ui}=surface();try{
  let calls=0;const first=d.createElement('button'),second=d.createElement('button');first.textContent='Klasör seç';second.textContent='Başka kaynak';second.onclick=()=>calls++;
  d.body.append(ui.empty({title:'Kütüphane',text:'Bir kaynak ekle.',actions:[first,second]}));
  assert.equal(d.querySelector('.mv-empty-actions>button'),first);assert.equal(d.querySelectorAll('.mv-preview-poster').length,3);
  const details=d.querySelector('details');details.open=true;second.click();assert.equal(calls,1);second.focus();second.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(details.open,false);assert.equal(d.activeElement,details.querySelector('summary'));
  details.open=true;d.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(details.open,false);
 }finally{dom.window.close();}
});
test('filter preserves the existing select and change callback',()=>{
 const {dom,w,d,ui}=surface();try{
  const field=d.createElement('label');field.innerHTML='<span>Tür</span><select><option>Dram</option><option>Komedi</option></select>';
  const select=field.querySelector('select');let changed=0;select.onchange=()=>changed++;
  const filter=ui.filter(field);d.body.append(filter);assert.equal(filter.querySelector('select'),select);
  select.value='Komedi';select.dispatchEvent(new w.Event('change'));assert.equal(changed,1);
  select.disabled=true;filter.querySelector('summary').click();assert.equal(filter.open,false);
 }finally{dom.window.close();}
});
test('rail updates boundaries and disposes its resize/scroll lifetime',async()=>{
 const {dom,w,d,ui,observers}=surface();try{
  const grid=d.createElement('div');Object.defineProperties(grid,{scrollWidth:{value:1000},clientWidth:{value:400}});grid.scrollLeft=0;let moved;
  grid.scrollBy=value=>{moved=value;};const rail=ui.rail(grid,'Devam et');d.body.append(rail.element);await Promise.resolve();
  const [previous,next]=rail.element.querySelectorAll('button');assert.equal(previous.hidden,true);assert.equal(next.hidden,false);next.click();assert.equal(moved.left,320);assert.equal(moved.behavior,'instant');
  grid.scrollLeft=600;grid.dispatchEvent(new w.Event('scroll'));assert.equal(previous.hidden,false);assert.equal(next.hidden,true);
  rail.dispose();assert.equal(observers[0].disconnected,true);grid.scrollLeft=0;grid.dispatchEvent(new w.Event('scroll'));assert.equal(next.hidden,true);
 }finally{dom.window.close();}
});
