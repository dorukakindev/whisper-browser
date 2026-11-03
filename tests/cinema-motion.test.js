'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
function setup() {
  const dom = new JSDOM('<select id="uiMotion"><option value="auto">Auto</option><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select><main class="cn-home-content"><section class="cn-hero cn-home-hero"><div class="cn-hero-switch"></div></section><button data-home-item="id"><img></button></main><dialog class="cn-film-page" open><div class="cn-film-poster"><img></div><details class="cn-accordion"><summary>Tools</summary><div class="contents">Original form</div></details></dialog>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, observers = [], animations = [], timers = new Map(); let seq = 0;
  Object.defineProperty(d, 'hasFocus', { value: () => true });
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
  return { dom, w, d, api: w.CinemaMotion, mq, observers, animations, timers, base, close() { w.CinemaMotion.dispose(); dom.window.close(); } };
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
    const details = h.d.querySelector('details'), summary = details.querySelector('summary'), original = details.querySelector('.contents'); let expected;
    summary.addEventListener('click', () => { expected = !details.open; });
    summary.click(); await Promise.resolve(); assert.equal(expected, true); assert.equal(details.open, true); assert.equal(details.querySelector('.contents'), original);
    for (const animation of h.animations.filter(a => a.node === original)) animation.finish(); await Promise.resolve(); await Promise.resolve();
    summary.click(); await Promise.resolve(); assert.equal(expected, false); assert.equal(details.open, true);
    h.animations.filter(a => a.node === original).at(-1).finish(); await new Promise(resolve => setImmediate(resolve)); assert.equal(details.open, false);
  } finally { h.close(); }
});
test('Native shared poster transition is scoped, restores styles and leaves original API on dispose', async () => {
  const h = setup(); try {
    let finish, called = 0;
    h.d.startViewTransition = update => { called++; update(); return { finished: new Promise(resolve => { finish = resolve; }), skipTransition() { finish(); } }; };
    const source = h.d.querySelector('[data-home-item]'), target = h.d.querySelector('.cn-film-poster');
    const snapshot = h.w.UiMotion.captureMedia(source); h.w.UiMotion.mediaTransfer(snapshot, target);
    assert.equal(called, 1); assert.equal(target.style.viewTransitionName, 'cinema-selected-poster');
    assert.equal(h.d.documentElement.style.viewTransitionName, 'none');
    finish(); await Promise.resolve(); await Promise.resolve(); assert.equal(target.style.viewTransitionName, ''); assert.equal(h.d.documentElement.style.viewTransitionName, '');
    h.api.dispose(); assert.equal(h.w.UiMotion, h.base); assert.deepEqual(JSON.parse(JSON.stringify(h.api.diagnostics())), { roots: 0, heroes: 0, pendingReveals: 0, carousels: 0, animations: 0, tints: 0 });
  } finally { h.dom.window.close(); }
});
test('Scroll keeps continuous parallax but quantizes blur and returns to an unfiltered idle surface', () => {
  const h = setup(); try {
    const hero = h.d.querySelector('.cn-hero'); let y = 0, frame;
    h.d.querySelector('dialog').removeAttribute('open'); hero.getBoundingClientRect = () => ({ top: -y });
    h.w.requestAnimationFrame = callback => { frame = callback; return 1; };
    h.observers[0].callback([{ target: hero, isIntersecting: true }]);
    const scroll = value => { y = value; h.d.dispatchEvent(new h.w.Event('scroll')); frame(); };
    scroll(0); assert.equal(hero.style.getPropertyValue('--cn-scroll-filter'), 'none');
    scroll(60); assert.equal(hero.style.getPropertyValue('--cn-scroll-filter'), 'blur(0.25px)'); assert.equal(hero.style.getPropertyValue('--cn-parallax'), '9px');
    scroll(61); assert.equal(hero.style.getPropertyValue('--cn-scroll-filter'), 'blur(0.25px)');
    scroll(0); assert.equal(hero.style.getPropertyValue('--cn-scroll-filter'), 'none');
  } finally { h.close(); }
});
