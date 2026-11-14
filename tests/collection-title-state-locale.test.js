'use strict';
// Collection title page: the user's own state sits in the hero, and a bilingual service error is shown in the UI language.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function ui(t, locale) {
  const dom = new JSDOM('<main id="mediaHome"><nav><button data-home-page="watched">Library</button></nav></main>', { runScripts: 'outside-only', pretendToBeVisual: true }), w = dom.window;
  t.after(() => w.close()); w.UiLocale = { get: () => locale }; w.matchMedia = () => ({ matches: true });
  w.MediaTitleUI = { createPage() { const p = w.document.createElement('section'); p.open = true; p.close = () => { p.open = false; p.dispatchEvent(new w.Event('close')); p.remove(); }; w.document.querySelector('main').append(p); return p; } };
  for (const file of ['media-visual.js', 'cinema-ui.js', 'collection-title-ui.js']) w.eval(fs.readFileSync('src/renderer/' + file, 'utf8'));
  w.CinemaFilmTools = { mount() { throw Error('no'); } }; w.CinemaFilmRound4 = { mount() { throw Error('no'); } }; w.AssistantFilmActions = { openPicker() { throw Error('no'); } };
  return w;
}
const row = () => ({ id: 'mal:anime:1', providerId: '1', provider: 'myanimelist', title: 'My title', domain: 'anime', kind: 'anime', rating: 9, status: 'watching', progress: 12, total: 64, metadata: { title: 'My title', genres: ['Drama'], total: 64 } });

test('cached-detail warning uses the UI language while the saved synopsis stays untouched', async (t) => {
  const w = ui(t, 'tr');
  const metadata = { ...row().metadata, description: 'A story / its subtitle' };
  w.api = { mediaShelf: async (input) => input.action === 'collection-detail'
    ? { ok: true, metadata, warning: 'Public details unavailable. / Yapım bilgileri alınamadı.' }
    : { ok: true, image: '' } };
  const page = w.CollectionTitleUI.open(row(), { onEdit: () => {} }); await settle();
  assert.ok(page.textContent.includes('Yapım bilgileri alınamadı.'));
  assert.ok(!page.textContent.includes('Public details unavailable.'));
  assert.ok(page.textContent.includes(metadata.description));
});

test('the hero shows status, rating and progress of the user, with a real progress bar', async (t) => {
  const w = ui(t, 'en'); w.api = { mediaShelf: async (input) => (input.action === 'collection-detail' ? { ok: true, metadata: row().metadata } : { ok: true, image: '' }), openExternal: async () => {} };
  const page = w.CollectionTitleUI.open(row(), { onEdit: () => {} }); await settle();
  const strip = page.querySelector('.cn-film-copy .mtd-state');
  assert.ok(strip, 'state strip lives inside the cinema hero copy');
  const chips = [...strip.querySelectorAll('.mtd-chip')].map((n) => n.textContent);
  assert.deepEqual(chips, ['In progress', '★ 9/10', '12 / 64 episodes']);
  const bar = strip.querySelector('progress'); assert.equal(bar.max, 64); assert.equal(bar.value, 12);
});

test('a bilingual service error is shown in the UI language, not as the raw "A / B" string', async (t) => {
  for (const [locale, expected, unexpected] of [['tr', 'Anime/Manga kaydı seç.', /Choose an Anime/], ['en', 'Choose an Anime/Manga title.', /kaydı seç/]]) {
    const w = ui(t, locale); w.api = { mediaShelf: async (input) => (input.action === 'collection-detail' ? { ok: false, error: 'Choose an Anime/Manga title. / Anime/Manga kaydı seç.' } : { ok: true, image: '' }), openExternal: async () => {} };
    const page = w.CollectionTitleUI.open(row(), { onEdit: () => {} }); await settle();
    assert.match(page.textContent, new RegExp(expected.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), locale);
    assert.doesNotMatch(page.textContent, unexpected, locale);
    assert.doesNotMatch(page.textContent, / \/ Anime\/Manga kaydı|title\. \/ /, 'no raw bilingual string');
  }
});
