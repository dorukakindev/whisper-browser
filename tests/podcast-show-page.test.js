'use strict';
// Show page of the podcast library: cover shelf, show header, compact mode, actions, way back.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
const source = fs.readFileSync(require.resolve('../src/renderer/podcast-library-ui'), 'utf8');
const tick = () => new Promise(setImmediate);
function fixture(preselect) {
  const dom = new JSDOM('<body><div id="root"></div></body>', { runScripts: 'outside-only' }), w = dom.window, calls = [];
  w.eval(source);
  const root = w.document.getElementById('root');
  const data = { podcasts: [
    { id: 'a', title: 'Alpha Show', publisher: 'Alpha Show', episodes: [
      { title: 'A1', url: 'a1', image: 'https://img.example/a.png', duration: 3600, published: '2026-11-01T00:00:00Z' },
      { title: 'A2', url: 'a2', position: 30, duration: 1800, published: '2026-10-01T00:00:00Z' } ] },
    { id: 'b', title: 'Beta Show', publisher: 'Beta Studio', episodes: [{ title: 'B1', url: 'b1', duration: 600, published: '2026-11-05T00:00:00Z' }] },
  ] };
  if (preselect !== undefined) w.PodcastLibraryUI.select(preselect);
  w.PodcastLibraryUI.mount(root, data, { play: async (p, row, scene) => { calls.push(['play', p.id, row.url, scene]); return true; }, queue: () => ({ rows: [] }), classic: () => {}, enqueue: async () => {} });
  return { dom, w, root, calls };
}
const program = (h, id) => h.root.querySelector(`.pl-programs .pl-program[data-program="${id}"]`);

test('the shelf shows the cover of a show from its episodes and falls back to initials', () => {
  const h = fixture(); try {
    assert.equal(program(h, 'a').querySelector('img').src, 'https://img.example/a.png');
    assert.equal(program(h, 'b').querySelector('img'), null);
    assert.equal(program(h, 'b').querySelector('.pl-art').textContent, 'BS');
    assert.equal(h.root.querySelector('.pl-show'), null);
    assert.ok(!h.root.querySelector('.pl-v2').classList.contains('pl-has-show'));
  } finally { h.dom.window.close(); }
});

test('selecting a show opens its header, compact mode and a cover backdrop; the existing hero and queue stay', () => {
  const h = fixture(); try {
    program(h, 'a').click();
    const layout = h.root.querySelector('.pl-v2'), header = h.root.querySelector('.pl-show');
    assert.ok(header);
    assert.equal(header.querySelector('.pl-show-title').textContent, 'Alpha Show');
    assert.equal(header.querySelector('.pl-show-title').getAttribute('role'), 'heading');
    const facts = [...header.querySelectorAll('.pl-show-facts li')].map((n) => n.textContent);
    assert.ok(facts.includes('2 episodes'), facts.join('|'));
    assert.ok(!facts.includes('Alpha Show'), 'a publisher equal to the title is not repeated');
    assert.ok(layout.classList.contains('pl-has-show'));
    assert.match(layout.style.getPropertyValue('--pl-cover'), /https:\/\/img\.example\/a\.png/);
    assert.ok(h.root.querySelector('.pl-stage .pl-side'), 'queue panel is kept');
    assert.ok(h.root.querySelector('.pl-hero'), 'continue/start hero is kept');
    program(h, 'b').click();
    assert.equal(h.root.querySelector('.pl-show-title').textContent, 'Beta Show');
    assert.ok([...h.root.querySelectorAll('.pl-show-facts li')].some((n) => n.textContent === 'Beta Studio'));
  } finally { h.dom.window.close(); }
});

test('show actions play the right episode and All shows returns to the library', async () => {
  const h = fixture(); try {
    program(h, 'a').click();
    const buttons = () => [...h.root.querySelectorAll('.pl-show-actions button')];
    const byText = (text) => buttons().find((b) => b.textContent === text);
    byText('Continue listening').click(); await tick();
    assert.deepEqual(h.calls.at(-1), ['play', 'a', 'a2', 'podcast']);
    byText('Play latest episode').click(); await tick();
    assert.deepEqual(h.calls.at(-1), ['play', 'a', 'a1', 'podcast']);
    byText('All shows').click();
    assert.equal(h.root.querySelector('.pl-show'), null);
    assert.ok(!h.root.querySelector('.pl-v2').classList.contains('pl-has-show'));
    assert.equal(h.root.querySelector('.pl-program[aria-pressed=true]').dataset.program, '');
  } finally { h.dom.window.close(); }
});

test('a show requested from outside (select) survives a double mount, ends on the first choice or after a few seconds; unknown ids are ignored', () => {
  const small = { podcasts: [{ id: 'a', title: 'Alpha Show', episodes: [{ title: 'A1', url: 'a1' }] }, { id: 'b', title: 'Beta Show', episodes: [{ title: 'B1', url: 'b1' }] }] };
  const actions = { play: async () => true, queue: () => ({ rows: [] }), classic: () => {} };
  const h = fixture('b'); try {
    assert.equal(h.root.querySelector('.pl-show-title').textContent, 'Beta Show');
    h.root.replaceChildren(); h.w.PodcastLibraryUI.mount(h.root, small, actions);
    assert.equal(h.root.querySelector('.pl-show-title').textContent, 'Beta Show', 'a second mount while opening keeps the request');
    h.root.querySelector('.pl-show-back').click();
    h.root.replaceChildren(); h.w.PodcastLibraryUI.mount(h.root, small, actions);
    assert.equal(h.root.querySelector('.pl-show'), null, 'choosing All shows ends the request');
    h.w.PodcastLibraryUI.select('a'); const real = h.w.Date.now; h.w.Date.now = () => real() + 6000;
    h.root.replaceChildren(); h.w.PodcastLibraryUI.mount(h.root, small, actions);
    assert.equal(h.root.querySelector('.pl-show'), null, 'the request expires');
  } finally { h.dom.window.close(); }
  const unknown = fixture('does-not-exist'); try { assert.equal(unknown.root.querySelector('.pl-show'), null); } finally { unknown.dom.window.close(); }
});
