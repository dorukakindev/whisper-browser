const assert = require('assert');
const vm = require('vm');
const { mangaOverlayScript, mangaClearScript } = require('../src/browser-manga');

// Minimal DOM: execute the actual injected script, not a copy of its callbacks.
class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.attrs = {}; this.isConnected = true;
    this.style = { removeProperty(name) { delete this[name]; } };
    this.textContent = ''; this.clientWidth = 200; this.clientHeight = 100;
    this.scrollWidth = 20; this.scrollHeight = 20;
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key]; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.append(item); return item; }
  addEventListener() {}
  removeEventListener() {}
  remove() { this.isConnected = false; }
  querySelectorAll(selector) {
    const key = selector.slice(1, -1);
    return this.children.flatMap(child => [
      ...(Object.hasOwn(child.attrs, key) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 1000, bottom: 1000, right: 800 }; }
}
const images = ['a', 'b'].map(id => {
  const image = new Element(); image.setAttribute('data-whisper-manga-id', id); return image;
});
const messages = [];
const context = vm.createContext({
  document: { images, documentElement: new Element(), createElement: () => new Element() },
  innerWidth: 1200, innerHeight: 1200, addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  __whisperTrustedBridgeSend: (_channel, payload) => messages.push(payload),
});
context.window = context;
const run = (id, verticalText, bridgeToken) => vm.runInContext(mangaOverlayScript({
  id, verticalText, bridgeToken,
  regions: [{ box: [100, 100, 300, 400], translation: 'Merhaba', source: 'Hello' }],
}), context);
assert.strictEqual(run('a', false, 'old'), true);
assert.strictEqual(run('b', true, 'new'), true);
const state = context.__whisperMangaOverlay;
const group = id => state.overlays.get(id).querySelector('[data-whisper-manga-region]');
const text = id => group(id).querySelector('[data-whisper-manga-text]');
assert.strictEqual(text('a').style.height, 'auto');
assert.strictEqual(text('b').style.width, 'auto');
assert.notStrictEqual(text('b').style.height, 'auto');
state.emitEdit(group('b'), { translation: 'önce' });
assert.strictEqual(messages.at(-1).bridgeToken, 'new');
state.emitEdit(group('a'), { translation: 'önce' });
assert.strictEqual(messages.at(-1).bridgeToken, 'new');

const frame = group('b').querySelector('[data-whisper-manga-frame]');
text('b').textContent = 'Uzun'; text('b').scrollHeight = 1000;
state.layout();
assert.strictEqual(frame.dataset.expanded, 'true');
text('b').textContent = 'Kısa'; text('b').scrollHeight = 10;
state.layout();
assert.strictEqual(frame.dataset.expanded, 'false');
assert.strictEqual(frame.style.width, frame.dataset.baseWidth + '%');
assert.strictEqual(frame.style.height, frame.dataset.baseHeight + '%');
vm.runInContext(mangaClearScript(), context);
assert.strictEqual(context.__whisperMangaOverlay, null);
assert.strictEqual(state.destroyed, true);
console.log('Manga injected layout: mixed directions, refreshed token, edit resize and cleanup passed.');
