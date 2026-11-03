'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), { JSDOM } = require('jsdom');
function setup() {
  const dom = new JSDOM('<dialog><div class="cn-hero-actions"></div><details open><div class="cn-advanced-body"></div></details></dialog>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  w.UiLocale = { get: () => 'tr' };
  w.eval(fs.readFileSync('src/renderer/cinema-film-tools.js', 'utf8'));
  return { dom, w, d, body: d.querySelector('.cn-advanced-body'), hero: d.querySelector('.cn-hero-actions'), page: d.querySelector('dialog') };
}
test('Film status segments retain canonical owner, pending state and explicit confirmation', async () => {
  const h = setup(); try {
    h.body.innerHTML = '<section class="pm-panel"><div class="pm-actions"><label class="pm-watch"><select><option value="planned">Liste</option><option value="completed">İzlendi</option></select></label><button>Beğendim</button><button>Bana göre değil</button></div><textarea>Unsaved draft</textarea></section>';
    const root = h.body.firstElementChild, select = root.querySelector('select'), draft = root.querySelector('textarea');
    let preview = 0, applied = 0, reaction = 0;
    const heroLike = h.d.createElement('button'); heroLike.setAttribute('aria-label', 'Beğendim'); h.hero.append(heroLike);
    heroLike.onclick = () => root.querySelector('.pm-actions > button').click();
    root.querySelector('.pm-actions > button').onclick = () => reaction++;
    select.onchange = () => {
      preview++; select.disabled = true;
      const confirm = h.d.createElement('button'); confirm.className = 'pm-confirm';
      confirm.onclick = () => { applied++; select.disabled = false; };
      root.append(confirm);
    };
    const owner = h.w.CinemaFilmTools.mount(h.page, h.body, root, h.hero);
    const complete = root.querySelector('[data-status-value=completed]'); complete.click();
    assert.equal(preview, 1); assert.equal(applied, 0); assert.equal(select.value, 'completed');
    assert.equal(complete.disabled, true); complete.click(); assert.equal(preview, 1);
    root.querySelector('.pm-confirm').click(); await new Promise(resolve => h.w.setTimeout(resolve, 0));
    assert.equal(applied, 1); assert.equal(complete.disabled, false);
    assert.equal(root.querySelector('textarea'), draft); assert.equal(draft.value, 'Unsaved draft');
    assert.equal(root.querySelector('.pm-actions > button').hidden, true);
    heroLike.click(); assert.equal(reaction, 1);
    owner.dispose();
  } finally { h.dom.window.close(); }
});
test('Async tool rendering enhances original journal nodes and observer disposes cleanly', async () => {
  const h = setup(); try {
    const owner = h.w.CinemaFilmTools.mount(h.page, h.body, null, h.hero);
    const daily = h.d.createElement('section'); daily.className = 'daily-title';
    daily.innerHTML = '<section class="daily-journal"><h2 id="journal-heading">Film günlüğüm</h2><details class="daily-add-entry"><summary>Ekle</summary><form class="daily-journal-form"><input type="date"><input type="number"><textarea rows="8">Draft</textarea><button>Save</button></form></details></section>';
    const form = daily.querySelector('form'), note = daily.querySelector('textarea'); let saves = 0;
    form.onsubmit = e => { e.preventDefault(); saves++; };
    h.body.append(daily); await new Promise(resolve => h.w.setTimeout(resolve, 0));
    assert.equal(daily.querySelector('#journal-heading').tagName, 'H3');
    assert.equal(daily.querySelector('form'), form); assert.equal(note.rows, 3); assert.equal(note.value, 'Draft');
    assert.equal(daily.querySelector('details').open, true);
    form.dispatchEvent(new h.w.Event('submit', { cancelable: true })); assert.equal(saves, 1);
    owner.dispose();
    const late = h.d.createElement('h2'); h.body.append(late); await new Promise(resolve => h.w.setTimeout(resolve, 0));
    assert.equal(late.tagName, 'H2');
  } finally { h.dom.window.close(); }
});
