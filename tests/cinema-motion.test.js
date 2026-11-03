'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
function setup({fakeFrames=false}={}) {
  const dom = new JSDOM('<select id="uiMotion"><option value="auto">Auto</option><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select><main class="cn-home-content"><section class="cn-hero cn-home-hero"><div class="cn-hero-switch"></div></section><button data-home-item="id"><img></button></main><dialog class="cn-film-page"><div class="cn-film-poster"><img></div><details class="cn-accordion"><summary>Tools</summary><div class="contents">Original form</div></details></dialog>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, observers = [], animations = [], timers = new Map(); let seq = 0;
  Object.defineProperty(d, 'hasFocus', { value: () => true });
  let clock=0;const frameCallbacks=new Map();if(fakeFrames){Object.defineProperty(w.performance,'now',{value:()=>clock});w.requestAnimationFrame=fn=>{frameCallbacks.set(++seq,fn);return seq;};w.cancelAnimationFrame=id=>frameCallbacks.delete(id);}
  const tick=time=>{clock=time;const pending=[...frameCallbacks.values()];frameCallbacks.clear();pending.forEach(fn=>fn(time));};
  const mq = { matches: false, addEventListener() {} }; w.matchMedia = () => mq;
  w.setTimeout = (fn, delay) => { timers.set(++seq, { fn, delay }); return seq; }; w.clearTimeout = id => timers.delete(id);
  w.IntersectionObserver = class { constructor(callback) { this.callback = callback; observers.push(this); this.nodes = new Set(); } observe(node) { this.nodes.add(node); } unobserve(node) { this.nodes.delete(node); } disconnect() { this.nodes.clear(); } };
  w.HTMLCanvasElement.prototype.getContext = () => ({ createImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4) }), putImageData() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([80, 120, 160, 255]) }) });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA';
  w.HTMLElement.prototype.animate = function(frames, options) {
    let resolve, reject; const animation = { node: this, frames, options, paused: false, canceled: false, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), finish() { resolve(); }, cancel() { this.canceled = true; reject(Error('canceled')); }, pause() { this.paused = true; }, play() { this.paused = false; } }; animations.push(animation); return animation;
  };
  const base = { reveal() {}, captureMedia: () => ({ src: 'data:image/png;base64,AA', x: 10, y: 20, width: 120, height: 180 }), mediaTransfer() {} }; w.UiMotion = base;
  w.eval(fs.readFileSync('src/renderer/cinema-motion.js', 'utf8'));
  return { dom, w, d, api: w.CinemaMotion, mq, observers, animations, timers, base, tick, close() { w.CinemaMotion.dispose(); dom.window.close(); } };
}
test('Hero progress, jump, keyboard, hover and off-screen pause share a disposable controller', async () => {
  const h = setup(); try {
    const hero = h.d.querySelector('.cn-hero'); let at = 0, hover = false;
    h.d.querySelector('dialog').removeAttribute('open');
    const matches = hero.matches.bind(hero); hero.matches = selector => selector === ':hover,:focus-within' ? hover : matches(selector);
    h.observers[0].callback([{ target: hero, isIntersecting: true }]);
    const controller = h.api.carousel(hero, { count: 3, getIndex: () => at, goTo: next => { at = next; } });
    assert.equal(h.timers.size, 1); assert.equal(hero.querySelectorAll('.cn-carousel-dots button').length, 3);
    hero.querySelectorAll('.cn-carousel-dots button')[2].click(); assert.equal(at, 2);
    hero.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); assert.equal(at, 0);
    hover = true; hero.dispatchEvent(new h.w.Event('pointerenter')); assert.equal(h.timers.size, 0);
    hover = false; hero.dispatchEvent(new h.w.Event('pointerleave')); assert.equal(h.timers.size, 1);
    h.observers[0].callback([{ target: hero, isIntersecting: false }]); assert.equal(h.timers.size, 0);
    h.api.setPreference('off'); assert.equal(h.api.mode, 'off'); assert.equal(hero.dataset.motionActive, 'false');
    controller.dispose(); assert.equal(h.api.diagnostics().carousels, 0);
  } finally { h.close(); }
});
test('Artwork waits for decoded replacement and releases outgoing node after 800 ms animation', async () => {
  const h = setup(); try {
    const hero = h.d.querySelector('.cn-hero'), old = h.d.createElement('div'), next = h.d.createElement('div'); hero.append(old, next);
    h.api.swapArtwork(hero, old, next); assert.equal(old.isConnected, true); assert.equal(next.style.opacity, '0');
    next.dispatchEvent(new h.w.Event('home-art-ready'));
    const entering = h.animations.find(a => a.node === next); assert.equal(entering.options.duration, 800);
    entering.finish(); await Promise.resolve(); await Promise.resolve(); assert.equal(old.isConnected, false); assert.equal(next.style.opacity, '');
  } finally { h.close(); }
});
test('Accordion preserves original click state handling, normal-flow form, and finite closing animation', async () => {
  const h = setup(); try {
    h.w.CSS = { supports: () => false }; // Exercise the non-interpolating Electron fallback.
    const details = h.d.querySelector('details'), summary = details.querySelector('summary'), original = details.querySelector('.contents'); let expected;
    summary.addEventListener('click', () => { expected = !details.open; });
    summary.click(); await Promise.resolve(); assert.equal(expected, true); assert.equal(details.open, true); assert.equal(details.querySelector('.contents'), original);
    for (const animation of h.animations.filter(a => a.node === original)) animation.finish(); await Promise.resolve(); await Promise.resolve();
    summary.click(); await Promise.resolve(); assert.equal(expected, false); assert.equal(details.open, true);
    h.animations.filter(a => a.node === original).at(-1).finish(); await new Promise(resolve => setImmediate(resolve)); assert.equal(details.open, false);
  } finally { h.close(); }
});
test('Shared poster uses a finite FLIP overlay, restores target and cancels on disposal', async () => {
 const h=setup({fakeFrames:true});try{const target=h.d.querySelector('.cn-film-poster');target.getBoundingClientRect=()=>({x:100,y:100,width:200,height:300});
 const snapshot=h.w.UiMotion.captureMedia(h.d.querySelector('[data-home-item]'));h.w.UiMotion.mediaTransfer(snapshot,target);
 const overlay=h.d.querySelector('[data-cinema-transfer]');assert(overlay);assert.equal(target.style.opacity,'0');
 h.tick(7);h.tick(14);const motion=h.animations.find(a=>a.node===overlay);assert.equal(motion.options.duration,600);assert.match(motion.frames[1].transform,/scale/);
 motion.finish();await Promise.resolve();await Promise.resolve();assert.equal(overlay.isConnected,false);assert.equal(target.style.opacity,'');
 h.w.UiMotion.mediaTransfer(snapshot,target);h.api.dispose();assert.equal(h.d.querySelector('[data-cinema-transfer]'),null);assert.equal(target.style.opacity,'');assert.equal(h.w.UiMotion,h.base);
 }finally{h.dom.window.close();}
});
test('78-item carousel renders a moving window of seven indicators, including the last item',()=>{
 const h=setup();try{let index=0;const hero=h.d.querySelector('.cn-home-hero'),c=h.w.CinemaMotion.carousel(hero,{count:78,getIndex:()=>index,goTo:v=>index=v});assert.equal(hero.querySelectorAll('.cn-carousel-dots button').length,7);c.jump(77);assert.equal(hero.querySelector('[aria-current=true]').dataset.slideIndex,'77');assert.equal(hero.querySelectorAll('.cn-carousel-dots button').length,7);c.jump(40);assert.equal(hero.querySelector('[aria-current=true]').dataset.slideIndex,'40');assert.equal(hero.querySelector('.cn-carousel-dots button').dataset.slideIndex,'37');c.dispose();}finally{h.close();}
});
test('Tint uses asynchronous resized bitmap and closes it; disposal aborts pending sampling',async()=>{
 const h=setup();try{let task,closed=0,canceled=0;h.w.requestIdleCallback=callback=>{task=callback;return 9;};h.w.cancelIdleCallback=()=>canceled++;
 h.w.fetch=async()=>({ok:true,blob:async()=>({})});h.w.createImageBitmap=async(blob,options)=>{assert.equal(options.resizeWidth,16);return {close(){closed++;}};};
 const img=h.d.querySelector('[data-home-item] img'),host=img.parentElement;host.classList.add('cn-poster');Object.defineProperty(img,'naturalWidth',{value:16});img.dispatchEvent(new h.w.Event('load'));assert.equal(host.dataset.cinemaTint,undefined);assert.equal(typeof task,'function');task({didTimeout:false,timeRemaining:()=>8});await new Promise(r=>setImmediate(r));assert.equal(host.dataset.cinemaTint,'sampled');assert.equal(closed,1);
 img.src='data:image/png;base64,BBB';img.dispatchEvent(new h.w.Event('load'));h.api.dispose();assert.equal(canceled,1);
 }finally{h.close();}
});
test('Scroll crossfades a fixed soft layer and keeps continuous parallax without filter mutation', () => {
  const h = setup(); try {
    const hero = h.d.querySelector('.cn-hero'); let y = 0, frame;
    h.d.querySelector('dialog').removeAttribute('open'); hero.getBoundingClientRect = () => ({ top: -y });
    h.w.requestAnimationFrame = callback => { frame = callback; return 1; };
    h.observers[0].callback([{ target: hero, isIntersecting: true }]);
    const scroll = value => { y = value; h.d.dispatchEvent(new h.w.Event('scroll')); frame(); };
    scroll(0); assert.equal(hero.style.getPropertyValue('--cn-scroll-soften'), '0');
    scroll(60); assert.equal(hero.style.getPropertyValue('--cn-scroll-soften'), '0.14'); assert.equal(hero.style.getPropertyValue('--cn-parallax'), '9px');
    scroll(61); assert.equal(hero.style.getPropertyValue('--cn-scroll-soften'), '0.14');
    scroll(0); assert.equal(hero.style.getPropertyValue('--cn-scroll-soften'), '0');
  } finally { h.close(); }
});

test('Sustained slow frames reduce only this session and offer explicit restoration',()=>{
 const h=setup({fakeFrames:true});try{const control=h.d.getElementById('uiMotion');const before=control.value;
 for(let time=0;time<=2100;time+=35)h.tick(time);
 assert.equal(h.api.mode,'reduced');const toast=h.d.querySelector('.cn-motion-toast');assert(toast);assert.equal(control.value,before);
 toast.querySelector('button').click();assert.equal(h.api.mode,'full');assert.equal(h.d.querySelector('.cn-motion-toast'),null);
 h.api.setPreference('off');for(let time=2200;time<5000;time+=35)h.tick(time);assert.equal(h.api.mode,'off');assert.equal(h.d.querySelector('.cn-motion-toast'),null);
 }finally{h.close();}
});
test('Healthy frames preserve full motion and a section film owns visibility without an open attribute',()=>{
 const h=setup({fakeFrames:true});try{const dialog=h.d.querySelector('dialog'),page=h.d.createElement('section');page.className='cn-film-page';page.open=true;page.append(...dialog.childNodes);dialog.replaceWith(page);
 for(let time=0;time<2100;time+=7)h.tick(time);assert.equal(h.api.mode,'full');assert.equal(h.d.querySelector('.cn-motion-toast'),null);
 const hero=h.d.querySelector('.cn-home-hero');h.observers[0].callback([{target:hero,isIntersecting:true}]);assert.equal(hero.dataset.motionActive,'false');
 }finally{h.close();}
});
