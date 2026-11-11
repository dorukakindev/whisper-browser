// R854 G33/G60/G61/G62/G64: Content Network source reader — sections, exact quotation, range preview/removal, pinned identity.
// jsdom behaviour against the real recall-network-ui.js and the real recall store; layout was measured in headless Chromium.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { JSDOM } = require('jsdom');
const { createRecallNetwork } = require('../src/recall-network');
const raw = fs.readFileSync(path.join(__dirname, 'recall-network.test.js'), 'utf8');
const helpers = new Function('require', 'fs', 'os', 'path', 'createRecallNetwork', raw.slice(raw.indexOf('function fixture()'), raw.indexOf("test('consumption")) + ';return {fixture,modelResult};')(require, fs, os, path, createRecallNetwork);
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(setImmediate); };

async function mount({savedViews=[],onOpen}={}) {
  const f = helpers.fixture(), dom = new JSDOM('<main></main>', { runScripts: 'outside-only' }), w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/recall-network-ui.js'), 'utf8'));
  const p = { ...f.store.context(['catalog:a']), mode: 'knowledge' }; f.store.commit(p, helpers.modelResult(p.sources[0]), 'controlled');
  const calls=[];const api = async (q) => {
    calls.push(q);if(q.action==='view-save')return {ok:true,view:f.store.view(q)};
    if(q.action==='evidence-reader'){
      const evidence=f.store.evidence(q.id),source=f.store.source(evidence.nodeId),text=source.text||'';
      const exact=evidence.status==='current'&&!source.spoilerBlocked&&evidence.unit==='utf16'&&text.slice(evidence.start,evidence.end)===evidence.quote;
      return {ok:true,evidence,node:{id:source.id,title:source.title,scope:source.scope,text},highlight:exact?{start:evidence.start,end:evidence.end}:null};
    }
    return q.action === 'graph' ? { ok: true, ...f.store.graph(q) } : q.action === 'node' ? { ok: true, node: f.store.node(q.id) } : q.action === 'edge' ? { ok: true, edge: f.store.edge(q.id) } : q.action === 'recommendations' ? { ok: true, ...f.store.recommend(q) } : { ok: true, rows: [], runs: [] }; };
  for(const view of savedViews)f.store.view(view);
  const controller = w.RecallNetworkUI.render({ host: w.document.querySelector('main'), api, onOpen, locale: 'en' });
  await tick();
  return { f, dom, w, controller, calls, $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)], close() { controller.dispose(); dom.window.close(); f.close(); } };
}

test('G33/G62: the reader pins its identity and splits reading from the personal reaction; the chosen section survives re-opening', async () => {
  const h = await mount();
  try {
    await h.controller.openNode('catalog:a');
    assert.ok(h.$('.rn-reader > .rn-reader-head .rn-reader-title'), 'title lives in the pinned head');
    const tabs = h.$$('.rn-reader-tabs button'); assert.equal(tabs.length, 2);
    const [read, react] = h.$$('.rn-reader .rn-pane');
    assert.equal(read.hidden, false); assert.equal(react.hidden, true);
    assert.ok(read.querySelector('.rn-source-text').open, 'source text opens first');
    assert.ok(react.querySelector('[data-action=reaction]') && react.querySelector('.rn-note'), 'reaction and note live in the other section');
    tabs[1].click(); assert.equal(h.$$('.rn-reader .rn-pane')[0].hidden, true); assert.equal(h.$$('.rn-reader .rn-pane')[1].hidden, false);
    await h.controller.openNode('catalog:a', { history: false });
    assert.equal(h.$$('.rn-reader .rn-pane')[1].hidden, false, 'the section choice is kept');
    assert.ok(h.$('.rn-reader [data-action=consume]') && h.$('.rn-reader [data-action=link-preview]'), 'consumption and relationship tools stay available');
  } finally { h.close(); }
});

test('G61/G64: the range shows its text and length, and can be removed without touching the source selection', async () => {
  const h = await mount();
  try {
    await h.controller.openNode('catalog:a');
    const info = h.$('.rn-range-info'), quote = h.$('.rn-range-quote'), [start, end] = h.$$('.rn-reader details.rn-relations input[type=number]');
    const clear = h.$('[data-action=scope-clear]'), len = h.f.store.node('catalog:a').text.length;
    assert.match(info.textContent, new RegExp(`Start 0 · end ${len} · ${len} of ${len} characters`)); assert.match(info.textContent, /whole text is used/); assert.equal(clear.disabled, true);
    start.value = '0'; end.value = '10'; end.dispatchEvent(new h.w.Event('input'));
    assert.equal(quote.hidden, false); assert.equal(quote.textContent, '“' + h.f.store.node('catalog:a').text.slice(0, 10) + '”');
    h.$('[data-action=scope]').click(); assert.match(info.textContent, /A range is active for analysis/); assert.equal(clear.disabled, false);
    clear.click(); assert.match(info.textContent, /whole text is used/); assert.equal(end.value, String(len)); assert.equal(clear.disabled, true);
    assert.equal(h.$('[data-action=select-source]').getAttribute('aria-pressed'), 'false', 'removing a range never changes source selection');
  } finally { h.close(); }
});

test('G60/G62: opening a source from evidence highlights the exact quotation and names the connection it came from', async () => {
  const h = await mount();
  try {
    await h.controller.openNode('catalog:a');
    h.$('.rn-reader [data-action=edge][data-id^="edge:"]').click(); await tick();
    const open = h.$('[data-action=evidence-source]'); assert.ok(open && open.dataset.quote, 'evidence button carries its quotation');
    open.click(); await tick();
    const mark = h.$('.rn-quote-mark'); assert.ok(mark); assert.equal(mark.textContent, open.dataset.quote);
    assert.match(h.$('.rn-reader-crumb').textContent, /From connection: .+ → .+ · mentions/);
    assert.match(h.$('.rn-quote-note').textContent, /highlighted/);
    assert.ok(h.$('.rn-source-text').open);
  } finally { h.close(); }
});

test('G60: a quotation that is not in the opened text version is stated, never silently dropped', async () => {
  const h = await mount();
  try {
    await h.controller.openNode('catalog:a');
    h.$('.rn-reader [data-action=edge][data-id^="metadata:"]').click(); await tick();
    h.$('[data-action=evidence-source]').click(); await tick();
    assert.equal(h.$('.rn-quote-mark'), null); assert.match(h.$('.rn-quote-note').textContent, /not found in this text version/);
  } finally { h.close(); }
});

test('G34: the reader says where Back leads — the map or list, or the previous source/connection', async () => {
  const h = await mount();
  try {
    await h.controller.openNode('catalog:a');
    assert.match(h.$('.rn-reader-head .rn-reader-return').textContent, /Back goes to: the map/);
    h.$('.rn-reader [data-action=edge][data-id^="edge:"]').click(); await tick();
    assert.match(h.$('.rn-reader-return').textContent, /Back goes to: A film/);
  } finally { h.close(); }
});

test('G41/G44: recommendation cards pair fit and no-fit evidence with real source links and the tab reports its own counts', async () => {
  const h = await mount();
  try {
    h.f.store.reaction('catalog:a', { valence: 'like' });
    await h.controller.recommendations('screen'); await tick(14);
    const cards = h.$$('.rn-rec-grid .rn-recommendation'); assert.ok(cards.length >= 1, 'candidates render as cards');
    assert.match(h.$('.rn-summary').textContent, /\d+ candidates · \d+ explicit positive sources in this pool/);
    for (const c of cards) { assert.ok(c.querySelector('h2') && c.querySelector('[data-action=add-candidate]')); for (const b of c.querySelectorAll('.rn-reason-group [data-action=node]')) assert.ok(b.dataset.id, 'reason links carry a real node id'); }
  } finally { h.close(); }
});

test('G42: the Time tab lists each recorded consumption event with its type and date, separate from network addition', async () => {
  const h = await mount();
  try {
    h.f.store.consume('catalog:a', { eventType: 'completed' }); h.f.store.consume('catalog:a', { eventType: 'rewatched' });
    await h.controller.reload(); h.$('[data-action=tab][data-value=time]').click(); await tick();
    const row = h.$$('.rn-timeline .rn-time-row').find((r) => r.textContent.includes('A film'));
    assert.ok(row); assert.match(row.textContent, /Added to the network:/);
    const labels = [...row.querySelectorAll('.rn-events li')].map((n) => n.textContent);
    assert.equal(labels.length, 2); assert.match(labels[0], /^Completed · /); assert.match(labels[1], /^Revisited \/ rewatched · /);
    const other = h.$$('.rn-timeline .rn-time-row').find((r) => r.textContent.includes('B film')); assert.match(other.textContent, /No dated consumption event recorded/);
  } finally { h.close(); }
});

test('R854 cinematic pass adds no hard-coded colours beyond the baseline and keeps motion opt-outs', () => {
  const dir = path.join(__dirname, '../src/renderer'), css = fs.readdirSync(dir).filter((n) => n.endsWith('.css')).map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  let count = 0; for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) { if (/^(?::root|html\[data-theme="light"\])$/.test(m[1].trim().split('\n').pop().trim())) continue; for (const d of m[2].split(';')) { const [p, ...r] = d.split(':'); if (!p || !r.length || p.trim().startsWith('--')) continue; count += (r.join(':').match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi) || []).length; } }
  assert.ok(count <= 571, `hard-coded colour count ${count} must not exceed the base commit's 571`);
  assert.match(fs.readFileSync(path.join(dir, 'recommendation-hub.css'), 'utf8'), /html:not\(\[data-motion=off\]\):not\(\[data-motion=reduce\]\) \.cn-discover-entry>\.cn-poster:hover/);
});

// Local integration: R853 exact evidence and decision history survive R854 reader tabs/back stack.
test('R853 exact evidence opens from the R854 edge and Back restores its decision history',async()=>{
 const h=await mount();try{
  await h.controller.openNode('catalog:a');h.$('.rn-reader [data-action=edge][data-id^="edge:"]').click();await tick();
  assert(h.$('.rn-edge-history'),'existing relationship provenance remains available');
  const title=h.$('.rn-reader-title').textContent,read=h.$('[data-action=evidence-reader]');assert(read);
  read.click();await tick();assert(h.$('.rn-evidence-highlight'),'server-validated exact source range is highlighted');
  h.$('.rn-reader-back').click();await tick();assert.equal(h.$('.rn-reader-title').textContent,title);assert(h.$('.rn-edge-history'));
 }finally{h.close();}
});


test('G43 saved view scope stays visible outside its menu; changed dates restore without saving or changing source records',async()=>{
 const saved={id:'saved-scope',name:'Research <scope>',dateKind:'added',fromDate:'2026-11-01',from:Date.parse('2026-11-01T00:00:00'),depth:2,camera:{x:25,y:30,w:450,h:300}};
 const h=await mount({savedViews:[saved]});try{
  const select=h.$('select[aria-label="Saved views"]');select.value=saved.id;select.dispatchEvent(new h.w.Event('change'));await tick();
  h.$('.rn-manage').open=false;const bar=h.$('.rn-view-scope');assert(bar&&!bar.hidden);assert.equal(bar.querySelector('strong').textContent,saved.name);assert.equal(bar.querySelector('script'),null);assert.match(bar.textContent,/Added to network/);assert.match(bar.textContent,/2026-11-01/);assert.equal(bar.dataset.state,'saved');
  const before=JSON.stringify(h.f.store.snapshot()),date=h.$('input[type=date]');date.value='2026-11-02';date.dispatchEvent(new h.w.Event('change'));await tick();
  assert.equal(bar.dataset.state,'changed');assert.match(bar.textContent,/Changed/);assert.match(bar.textContent,/2026-11-02/);assert(!bar.querySelector('[data-action=restore-view]').hidden);
  bar.querySelector('[data-action=restore-view]').click();await tick();assert.equal(date.value,'2026-11-01');assert.equal(bar.dataset.state,'saved');assert.equal(h.$('svg.rn-map').getAttribute('viewBox'),'25 30 450 300');assert.equal(JSON.stringify(h.f.store.snapshot()),before);assert(!h.calls.some(q=>q.action==='view-save'));
 }finally{h.close();}
});

test('G43 camera reset is a modified saved view; restore keeps saved camera, scope and explicit selected sources',async()=>{
 const saved={id:'camera-view',name:'Close reading',dateKind:'added',depth:1,camera:{x:50,y:60,w:450,h:300},selectedIds:['catalog:a'],scopes:{'catalog:a':{start:0,end:10}}};
 const h=await mount({savedViews:[saved]});try{
  const select=h.$('select[aria-label="Saved views"]');select.value=saved.id;select.dispatchEvent(new h.w.Event('change'));await tick();
  const before=JSON.stringify(h.f.store.snapshot());h.$('[data-action=zoom-reset]').click();await tick();assert.equal(h.$('.rn-view-scope').dataset.state,'changed');assert.match(h.$('.rn-view-scope').textContent,/Close reading/);
  h.$('[data-action=restore-view]').click();await tick();assert.equal(h.$('svg.rn-map').getAttribute('viewBox'),'50 60 450 300');assert.equal(h.$('.rn-view-scope').dataset.state,'saved');assert.match(h.$('.rn-selection').textContent,/1 sources selected/);assert.equal(JSON.stringify(h.f.store.snapshot()),before);
 }finally{h.close();}
});


test('G43 explicit save activates the new snapshot; source-range edits mark it changed and restore is read-only',async()=>{
 const h=await mount();try{
  await h.controller.openNode('catalog:a');h.$('[data-action=select-source]').click();await tick();
  h.$('[data-action=save-view]').click();await tick();const dialog=h.$('dialog');dialog.querySelector('input').value='My source scope';[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Save').click();await tick();
  assert.equal(h.$('.rn-view-scope strong').textContent,'My source scope');assert.equal(h.$('.rn-view-scope').dataset.state,'saved');assert.equal(h.calls.filter(q=>q.action==='view-save').length,1);
  const before=JSON.stringify(h.f.store.snapshot()),range=h.$('.rn-reader [data-action=scope]').parentElement;range.querySelectorAll('input')[0].value='1';range.querySelectorAll('input')[1].value='10';range.querySelector('[data-action=scope]').click();await tick();
  assert.equal(h.$('.rn-view-scope').dataset.state,'changed');h.$('[data-action=restore-view]').click();await tick();assert.equal(h.$('.rn-view-scope').dataset.state,'saved');assert.equal(h.calls.filter(q=>q.action==='view-save').length,1);assert.equal(JSON.stringify(h.f.store.snapshot()),before);
 }finally{h.close();}
});


test('G45 candidate inspection opens its real owner without adding, reacting or analyzing; G44 timeline count names events',async()=>{
 const opened=[],h=await mount({onOpen:async ref=>opened.push(ref)});try{
  const before=JSON.stringify(h.f.store.snapshot());await h.controller.recommendations('screen');await tick();
  const inspect=h.$('[data-action=inspect-candidate]');assert(inspect);const ref=JSON.parse(inspect.dataset.ref);inspect.click();await tick();
  assert.equal(JSON.stringify(opened),JSON.stringify([{kind:ref.kind,id:ref.id}]));assert.equal(JSON.stringify(h.f.store.snapshot()),before);assert(!h.calls.some(q=>['add','reaction','context','analyze'].includes(q.action)));
  h.$('[data-action=tab][data-value=time]').click();await tick();assert.match(h.$('.rn-summary').textContent,/sources · .*recorded events/);
 }finally{h.close();}
});
test('G62 remembers each source reader position and section without assigning the other source its reaction pane',async()=>{
 const h=await mount();try{
  await h.controller.openNode('catalog:a');const reader=h.$('.rn-reader');reader.scrollTop=321;h.$('[data-pane=react]').click();
  await h.controller.openNode('catalog:b');assert.equal(reader.dataset.pane,'read');reader.scrollTop=85;
  await h.controller.openNode('catalog:a');assert.equal(reader.dataset.pane,'react');assert.equal(reader.scrollTop,321);
 }finally{h.close();}
});
