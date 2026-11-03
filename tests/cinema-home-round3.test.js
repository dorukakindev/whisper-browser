'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
function setup() {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' }), w = dom.window;
  w.UiLocale = { get: () => 'tr' };
  w.MediaHomeModel = require('../src/renderer/media-home-model');
  w.ResizeObserver = class { observe() {} disconnect() {} };
  for (const file of ['media-visual', 'cinema-ui']) w.eval(fs.readFileSync(`src/renderer/${file}.js`, 'utf8'));
  return { dom, w, d: w.document };
}
test('Fallback initials skip punctuation and emoji while preserving Unicode letters and digits', () => {
  const h = setup(); try {
    for (const [title, expected] of [['TikTok - Make Your Day', 'TM'], ['🎬 — İstanbul / 2049', 'İ2'], ['--- !!!', ''], ['Çığlık • Ötesi', 'ÇÖ']]) {
      const art = h.d.createElement('div'); h.w.MediaVisual.art(art, title);
      assert.equal(art.querySelector('.mv-art-fallback').textContent, expected);
    }
    const a = h.d.createElement('div'), b = h.d.createElement('div');
    h.w.MediaVisual.art(a, 'TikTok - Make Your Day'); h.w.MediaVisual.art(b, 'A different title');
    assert.notEqual(a.style.getPropertyValue('--mv-art-hue'), b.style.getPropertyValue('--mv-art-hue'));
  } finally { h.dom.window.close(); }
});
test('Home shows source with duration and moves functional row arrows outside card content', async () => {
  const h = setup(); try {
    let played = 0;
    const item = { key: 'youtube:abcdefghijk', type: 'youtube', title: 'TikTok - Make Your Day', duration: 780, position: 90 };
    const page = h.w.CinemaUI.home(h.d.querySelector('main'), {
      items: [], continuing: [item], progress: h.w.MediaHomeModel.progress,
      art: (_, cls) => { const node = h.d.createElement('div'); node.className = cls; return node; },
      hasArtwork: () => true, play: () => played++, details: () => {}, page: () => {}, addFolder: () => {},
      minutes: () => '13 dk', onFeature: () => {}
    });
    assert.equal(h.d.querySelector('.cn-home-hero .cn-meta').textContent, 'YouTube13 dk');
    assert.equal(h.d.querySelector('.cn-poster-art .mv-art-fallback').textContent, 'TM');
    assert.equal(h.d.querySelector('.cn-source-mark').getAttribute('aria-label'), 'YouTube');
    const grid = h.d.querySelector('.cn-poster-row');
    Object.defineProperties(grid, { scrollWidth: { value: 1200 }, clientWidth: { value: 400 } });
    grid.scrollLeft = 0; let moved;
    grid.scrollBy = options => { moved = options.left; };
    h.w.matchMedia = () => ({ matches: true });
    await Promise.resolve();
    assert.equal(h.d.querySelector('.mv-rail > button'), null);
    h.d.querySelector('.cn-heading-tools .mv-rail-next').click();
    assert.equal(moved, 320);
    h.d.querySelector('.cn-poster').click(); await Promise.resolve();
    assert.equal(played, 1);
    page.dispose();
  } finally { h.dom.window.close(); }
});
