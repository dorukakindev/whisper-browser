// R854 G28–G31: evidence-less fit card, topic filter, quote identity line, closed "change sample" group.
// jsdom behaviour tests against the real review-decision-ui.js; layout acceptance was measured in headless Chromium.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { JSDOM } = require('jsdom');
const model = require('../src/renderer/media-tools-model');
const item = { id: 'discovery:film:tt1234567', title: 'Film', kind: 'film', year: 2026, imdbId: 'tt1234567', discovery: { kind: 'film', id: 'tt1234567' } };
const reviews = [
  { id: 'r1', author: 'Reader One', text: 'The acting is excellent but the pace is slow.', rating: 4, date: '2026-11-01' },
  { id: 'r2', author: '', text: 'A story told with patience and a rushed ending.' },
];
const analysis = {
  summary: 'Acting praised.', fit: 'No personal evidence.', at: 1000,
  points: [
    { id: 'r1', topic: 'characters', quote: 'The acting is excellent', kind: 'praise', reason: 'Strong performances.' },
    { id: 'r1', topic: 'pace', quote: 'the pace is slow', kind: 'criticism', reason: 'Slow middle.' },
    { id: 'r2', topic: 'story', quote: 'a rushed ending', kind: 'criticism', reason: 'Rushed finish.' },
  ],
};
async function title(options = {}) {
  const dom = new JSDOM('<section class="media-title-page"><section id="review"></section></section>', { runScripts: 'outside-only' }), w = dom.window;
  w.UiLocale = { get: () => 'en' };
  w.eval(fs.readFileSync('src/renderer/media-visual.js', 'utf8')); w.eval(fs.readFileSync('src/renderer/cinema-ui.js', 'utf8'));
  w.MediaToolsModel = model; w.MediaToolsUI = { open() {}, reviewSnapshot: () => null };
  const calls = []; w.MediaHomeUI = { navigate: async (page) => { calls.push(page); } }; w.MediaTitleUI = { close: () => calls.push('close-title') };
  w.HTMLElement.prototype.scrollIntoView = function () { calls.push('scroll'); };
  const taste = options.taste || {}, entry = { identity: item, analysis, reviews };
  if (options.evidence) { const e = model.decisionEvidence(item, reviews, taste).evidence; entry.reviews = e.reviews; entry.evidenceSnapshot = { version: 1, context: JSON.stringify(e), profile: e.profile }; }
  w.api = { mediaTools: async () => ({ ok: true, value: { history: [entry] } }), mediaShelf: async () => ({ ok: true, taste }) };
  w.eval(fs.readFileSync('src/renderer/review-decision-ui.js', 'utf8'));
  w.MediaReviewDecision.mountTitle(w.document.getElementById('review'), item);
  await new Promise((r) => setTimeout(r, 0));
  return { dom, w, calls, $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)] };
}

test('G28: without personal evidence the fit card is short, stays honest and offers the taste preferences', async () => {
  const h = await title();
  try {
    const fit = h.$('.mrv-fit'); assert.ok(fit.classList.contains('mrv-fit-sparse'));
    assert.match(fit.textContent, /No personal evidence/);
    assert.doesNotMatch(fit.textContent, /\d+\s*%/, 'no invented percentage');
    h.$('.mrv-fit-open').click(); await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(h.calls.filter((c) => c !== 'scroll'), ['close-title', 'taste']);
  } finally { h.dom.window.close(); }
});

test('G28: real saved preferences keep the full personal card without the sparse treatment', async () => {
  const h = await title({ evidence: true, taste: { preferencesConfigured: true, preferences: { weights: { story: 5, pace: 2 }, note: 'Patient stories' } } });
  try {
    const fit = h.$('.mrv-fit'); assert.equal(fit.classList.contains('mrv-fit-sparse'), false); assert.equal(h.$('.mrv-fit-open'), null);
    assert.match(fit.textContent, /Patient stories/);
  } finally { h.dom.window.close(); }
});

test('G29: a topic row narrows the existing observations, reports the count and clearing restores them', async () => {
  const h = await title();
  try {
    const cards = () => h.$$('.mrv-point'), shown = () => cards().filter((c) => !c.hidden).length;
    assert.equal(cards().length, 3); assert.equal(h.$$('.cv2-topic-row').length, 3);
    const pace = h.$('.cv2-topic-row[data-topic=pace]'); assert.equal(pace.tagName, 'BUTTON'); assert.equal(pace.getAttribute('aria-pressed'), 'false');
    pace.click();
    assert.equal(shown(), 1); assert.equal(cards().find((c) => !c.hidden).dataset.topic, 'pace');
    assert.equal(pace.getAttribute('aria-pressed'), 'true');
    const status = h.$('.mrv-topic-filter'); assert.equal(status.hidden, false); assert.match(status.textContent, /Pace: 1 of 3 observations shown/);
    assert.equal(h.$('.mrv-opinions > [data-opinion-kind=praise]').dataset.topicEmpty, 'true', 'a panel with no matching card is hidden');
    assert.equal(h.$('.mrv-opinions > [data-opinion-kind=criticism]').dataset.topicEmpty, 'false');
    h.$('.mrv-topic-filter button').click();
    assert.equal(shown(), 3); assert.equal(status.hidden, true); assert.equal(pace.getAttribute('aria-pressed'), 'false');
    assert.equal(h.$$('.mrv-opinions > [data-topic-empty=true]').length, 0);
    pace.click(); pace.click(); assert.equal(shown(), 3, 'second click on the same row clears the filter');
    assert.equal(h.calls.includes('close-title'), false, 'filtering never navigates or asks a provider');
  } finally { h.dom.window.close(); }
});

test('G30: the source quotation carries only the real author, date and rating of its review', async () => {
  const h = await title();
  try {
    const ids = h.$$('.cv2-source-quote .cv2-source-id').map((n) => n.textContent);
    assert.ok(ids.includes('Reader One · 2026-11-01 · 4/5'));
    assert.ok(ids.includes('Author unknown · Date unavailable · Rating unavailable'), 'unknown values are stated, never invented');
    const quote = h.$('.cv2-source-quote'); assert.ok(quote.querySelector('blockquote') && quote.querySelector('.cv2-source-id'));
  } finally { h.dom.window.close(); }
});

const letterboxd = require('../src/letterboxd-reviews');
function modal(draft) {
  const dom = new JSDOM('<dialog open><main></main></dialog>', { runScripts: 'outside-only', url: 'https://fixture.test/' }), w = dom.window;
  w.LetterboxdReviews = letterboxd;
  Object.assign(w, { UiLocale: { get: () => 'en' }, player: { job: null }, state: { running: false, queueRunning: false }, aiChatPreparing: null, buildOptsFromUI: () => ({}), translationEndpointReady: () => true, globalAssistantContext: () => ({}), MediaExperience: { setContext() {} }, aiChatSend: async () => {},
    api: { mediaTools: async () => ({ ok: false, error: 'Controlled failure' }), mediaShelf: async () => ({ ok: true, taste: { preferencesConfigured: false } }), openExternal: async () => {} } });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(fs.readFileSync(require.resolve('../src/renderer/media-tools-model'), 'utf8')); w.eval(fs.readFileSync(require.resolve('../src/renderer/review-decision-ui'), 'utf8'));
  w.MediaReviewDecision.mount(w.document.querySelector('main'), { id: 'film', title: 'The Matrix', year: 1999 }, {}, draft, { current: () => true, redraw() {}, status() {} });
  const tab = (name) => [...w.document.querySelectorAll('.mrv-workspace-nav button')].find((n) => n.textContent === name);
  return { dom, w, tab, group: () => w.document.querySelector('.mrv-control-room > .mrv-sample-change') };
}

test('G31: with a ready sample the change group is closed; source views open it; returning restores the reader choice', () => {
  const u = modal({ reviews: 'A source review with exact punctuation.' });
  try {
    const g = u.group(); assert.ok(g, 'group exists'); assert.equal(g.open, false);
    assert.ok(g.querySelector('[name=letterboxd-sample-count]') && g.querySelector('[name=letterboxd-review-sort]'), 'count and pool controls are inside');
    assert.ok([...g.querySelectorAll('button')].some((b) => /Find this film/.test(b.textContent)), 'fetch action is inside');
    assert.equal(u.w.document.querySelector('[data-review-action=preview]').closest('.mrv-sample-change'), null, 'the analyze action stays outside, visible');
    u.tab('Load from a source').click(); assert.equal(g.open, true);
    u.tab('Sample & analysis').click(); assert.equal(g.open, false);
    g.open = true; g.dispatchEvent(new u.w.Event('toggle')); u.tab('Text & advanced options').click(); u.tab('Sample & analysis').click(); assert.equal(g.open, true, 'a choice made in the sample view is remembered');
  } finally { u.dom.window.close(); }
});

test('G31: with no sample yet the controls are open so the first fetch is one step away', () => {
  const u = modal({});
  try { assert.equal(u.group().open, true); } finally { u.dom.window.close(); }
});


test('G49–G52 keep raw metadata, partial readiness and preview identity; returning retains sample and review selection without sending',async()=>{
 const draft={reviews:JSON.stringify(reviews),source:{partial:true,identity:{title:'The Matrix',year:1999},match:{state:'matched'}}},h=modal(draft);try{
  let sent=0;h.w.aiChatSend=async()=>sent++;assert.match(h.w.document.querySelector('.mrv-format-info').textContent,/Structured review list.*2 reviews/);assert.match(h.w.document.querySelector('.mrv-job-copy').textContent,/2 eligible reviews.*partial sample/);
  assert(h.w.document.querySelector('.mrv-source-alternatives'));h.tab('Text & advanced options').click();const raw=h.w.document.querySelector('[name=review-text]');assert.equal(raw.value,draft.reviews);
  h.w.document.querySelector('[data-review-action=preview]').click();for(let i=0;i<8;i++)await new Promise(setImmediate);
  const preview=h.w.document.querySelector('.mrv-sample');assert(preview);assert.match(preview.querySelector('.mrv-preview-head').textContent,/The Matrix.*1999.*2\/2/);const checked=[...preview.querySelectorAll('[data-review-pick]')];assert.equal(checked.length,2);checked[1].checked=false;checked[1].dispatchEvent(new h.w.Event('change'));assert.match(preview.querySelector('.mrv-selection-count').textContent,/1\/2/);
  [...preview.querySelectorAll('button')].find(b=>b.textContent==='Back to reviews').click();assert.equal(h.w.document.querySelector('.mrv-sample'),null);assert.equal(raw.value,JSON.stringify(reviews));assert.equal(draft.reviewSelection.excludedIds.length,1);assert.equal(sent,0);
 }finally{h.dom.window.close();}
});
