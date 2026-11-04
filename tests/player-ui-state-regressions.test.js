'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const Catalog = require('../src/player-source-catalog');
function setup(t) {
  const dom = new JSDOM('<!doctype html><body><main></main>', { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  global.window = dom.window; global.document = dom.window.document; global.Node = dom.window.Node;
  dom.window.matchMedia = () => ({ matches: true });
  return { w: dom.window, root: document.querySelector('main') };
}
function catalogVm(query = {}) {
  const sources = [{ sourceId: 'pod:one', kind: 'podcast', title: 'Program' }];
  const items = [{ itemId: 'ep:one', sourceId: 'pod:one', kind: 'podcast', title: 'Episode', durationSeconds: 90 }];
  const normalized = Catalog.normalizeQuery(query);
  return { locale: 'tr', kind: 'podcast', sources, pinned: [], query: normalized,
    result: Catalog.queryPlayerItems({ batch: { items, revision: 'one' }, query: normalized }), shown: 1 };
}
test('podcast filters display actual matching episodes and their empty result', t => {
  const { root } = setup(t), UI = require('../src/renderer/player-source-catalog-ui');
  UI.renderCatalog(root, catalogVm({ durations: ['under10'] }), {});
  assert.equal(root.querySelector('.pw-programs'), null);
  assert.equal(root.querySelector('.pw-episode .pw-row__title').textContent, 'Episode');
  UI.renderCatalog(root, catalogVm({ durations: ['60plus'] }), {});
  assert.equal(root.querySelector('.pw-programs'), null);
  assert.ok(root.querySelector('.pw-empty'));
  UI.renderCatalog(root, catalogVm(), {});
  assert.ok(root.querySelector('.pw-programs'), 'unfiltered overview retains program grid');
});
test('retained catalog search uses the latest render owner', t => {
  const { w, root } = setup(t), UI = require('../src/renderer/player-source-catalog-ui'), calls = [];
  UI.renderCatalog(root, catalogVm(), { onQuery: patch => calls.push(['old', patch.text]) });
  const input = root.querySelector('.pw-search__input');
  UI.renderCatalog(root, catalogVm(), { onQuery: patch => calls.push(['current', patch.text]) });
  assert.equal(root.querySelector('.pw-search__input'), input, 'keep IME and cursor owner');
  input.value = 'latest'; input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(calls, [['current', 'latest']]);
});
test('copy and focus keys preserve transcript follow; manual scrolling pauses it', t => {
  const { w, root } = setup(t), UI = require('../src/renderer/player-workspace-ui'), calls = [];
  const vm = { locale: 'tr', media: { title: 'Video' }, snapshot: { time: 0, duration: 60, paused: true, rate: 1 }, rows: [], tab: 'transcript', stageMode: 'slot', subtitleMode: 'both' };
  UI.renderPlayerWorkspace(root, vm, { onFollow: value => calls.push(value) });
  const list = root.querySelector('.pw-transcript');
  for (const key of ['c', 'Tab', 'Escape', 'Enter']) list.dispatchEvent(new w.KeyboardEvent('keydown', { key, ctrlKey: key === 'c', bubbles: true }));
  assert.deepEqual(calls, [], 'copy and focus changes must not pause following');
  list.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
  list.dispatchEvent(new w.Event('wheel', { bubbles: true }));
  assert.deepEqual(calls, [false, false]);
});
