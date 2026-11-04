'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
const model = require('../src/renderer/media-tools-model');
const source = file => fs.readFileSync(require.resolve('../src/renderer/' + file), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function visual(locale) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.UiLocale = { get: () => locale };
  w.matchMedia = () => ({ matches: true });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.eval(source('media-visual.js'));
  return { dom, ui: w.MediaVisual };
}
async function discover(t, locale, rows) {
  const helper = visual(locale);
  t.after(() => helper.dom.window.close());
  const dom = new JSDOM('<div id="mediaHome"><div id="root"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.UiLocale = { get: () => locale };
  w.MediaVisual = { title: value => value, filter: node => node, icon: () => null, art: () => {}, score: helper.ui.score, genre: helper.ui.genre };
  w.CinemaUI = { rebutton: () => {} };
  w.api = { mediaDiscovery: async () => ({ ok: true, rows, nextSkip: null }) };
  w.eval(source('media-discovery-ui.js'));
  w.MediaDiscoveryUI.mount(w.document.getElementById('root'), { tab: 'browse', rows, next: null });
  await tick();
  return w.document.getElementById('root');
}
function filmPage(t, locale, item) {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.UiLocale = { get: () => locale };
  w.MediaToolsModel = model;
  w.eval(source('media-visual.js'));
  w.eval(source('cinema-ui.js'));
  const page = w.document.createElement('dialog');
  w.document.body.append(page);
  page.innerHTML = '<section class="mtd-hero"><div class="mtd-copy"><div class="mtd-actions"><button>Video dosyası seç</button></div></div></section><nav class="film-page-navigation"></nav>';
  w.CinemaUI.film(page, item);
  return page;
}
const dune = { providerId: 'tt1160419', kind: 'film', title: 'Dune', year: 2021, genres: ['Action', 'Sci-Fi', 'Adventure', 'Drama'], rating: 8, backdrop: 'https://images.metahub.space/background/tt1160419' };

test('score shows one decimal with the interface decimal mark and nothing for missing data', () => {
  const tr = visual('tr'), en = visual('en');
  try {
    assert.equal(tr.ui.score(8), '8,0');
    assert.equal(tr.ui.score('8.4'), '8,4');
    assert.equal(en.ui.score(8), '8.0');
    assert.equal(en.ui.score(7.46), '7.5');
    for (const missing of [0, '', null, undefined, 'abc', -1, NaN]) assert.equal(tr.ui.score(missing), '');
  } finally { tr.dom.window.close(); en.dom.window.close(); }
});

test('ratingOf keeps a rating together with the source it came from', () => {
  const { dom, ui } = visual('tr');
  try {
    assert.deepEqual({ ...ui.ratingOf({ rating: 8, tmdbRating: 7.4 }) }, { source: 'IMDb', value: 8 });
    assert.deepEqual({ ...ui.ratingOf({ tmdbRating: 7.4, ratings: { imdb: '8.1' } }) }, { source: 'TMDB', value: 7.4 });
    assert.deepEqual({ ...ui.ratingOf({ ratings: { imdb: '8.1' } }) }, { source: 'IMDb', value: 8.1 });
    assert.equal(ui.ratingOf({ rating: 0 }), null);
    assert.equal(ui.ratingOf(null), null);
    assert.equal(ui.ratingOf({ rating: Infinity, tmdbRating: 'invalid' }), null);
  } finally { dom.window.close(); }
});

test('genre names are Turkish only in the Turkish interface and unknown names are left alone', () => {
  const tr = visual('tr'), en = visual('en');
  try {
    assert.equal(tr.ui.genre('Sci-Fi'), 'Bilim kurgu');
    assert.equal(tr.ui.genre('Action'), 'Aksiyon');
    assert.equal(tr.ui.genre('Experimental'), 'Experimental');
    assert.equal(en.ui.genre('Sci-Fi'), 'Sci-Fi');
  } finally { tr.dom.window.close(); en.dom.window.close(); }
});

test('Discover prints the same formatted score on the badge and the hero chip and localizes genres', async t => {
  const root = await discover(t, 'tr', [dune]);
  assert.equal(root.querySelector('.cn-rating').textContent, '8,0');
  assert.equal(root.querySelector('.cn-rating').getAttribute('aria-label'), 'IMDb puanı 8,0/10');
  assert.equal(root.querySelector('.mv-feature-rating').textContent, 'IMDb 8,0/10');
  assert.equal(root.querySelector('.cn-feature-facts').textContent, '2021 · Aksiyon · Bilim kurgu · Macera');
});

test('Discover keeps English genres and a dot decimal in the English interface', async t => {
  const root = await discover(t, 'en', [dune]);
  assert.equal(root.querySelector('.cn-rating').textContent, '8.0');
  assert.equal(root.querySelector('.mv-feature-rating').textContent, 'IMDb 8.0/10');
  assert.equal(root.querySelector('.cn-feature-facts').textContent, '2021 · Action · Sci-Fi · Adventure');
});

test('Film page never labels an IMDb value as TMDB and localizes genres', t => {
  const page = filmPage(t, 'tr', { id: 'x', title: 'Dune', kind: 'film', year: 2021, runtime: 155, rating: 8, tmdbRating: 7.8, genres: ['Action', 'Sci-Fi', 'Adventure', 'Drama'] });
  assert.equal(page.querySelector('.cn-score').textContent, 'IMDb 8,0');
  assert(page.querySelector('.cn-meta').textContent.includes('Aksiyon / Bilim kurgu / Macera'));
});

test('Film page uses TMDB only when that is the only source it has', t => {
  const page = filmPage(t, 'tr', { id: 'y', title: 'Film', kind: 'film', tmdbRating: 7.8 });
  assert.equal(page.querySelector('.cn-score').textContent, 'TMDB 7,8');
});
