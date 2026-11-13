const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('crowded map keeps labels apart, saved positions and every accessible source', async () => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  const w = dom.window;
  const nodes = Array.from({ length: 60 }, (_, i) => ({
    id: `collection:${i}`, title: `A long anime or manga title number ${i}`,
    domain: i % 2 ? 'anime' : 'manga', ref: { kind: 'collection', id: String(i) },
    ...(i < 3 ? { position: { x: 450, y: 300 } } : {})
  }));
  const requests = [];
  let controller;
  try {
    w.eval(fs.readFileSync(require.resolve('../src/renderer/recall-network-ui'), 'utf8'));
    controller = w.RecallNetworkUI.render({ host: w.document.querySelector('main'), api: async input => {
      requests.push(input);
      return { ok: true, nodes, edges: [], views: [], counts: { visibleNodes: 60, totalNodes: 60 } };
    } });
    await new Promise(setImmediate);
    const groups = [...w.document.querySelectorAll('.rn-node')];
    assert.equal(groups.length, 60);
    assert.equal(groups[0].getAttribute('transform'), 'translate(450 300)');
    assert.equal(groups[0].querySelector('title').textContent, nodes[0].title);
    assert(groups.every(g => g.getAttribute('aria-label').includes('A long anime')));
    const boxes = [...w.document.querySelectorAll('.rn-node-label rect')].map(rect =>
      Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number(rect.getAttribute(k))])));
    assert(boxes.length > 0 && boxes.length < nodes.length);
    for (const [i, a] of boxes.entries()) {
      assert(a.x >= 8 && a.y >= 8 && a.x + a.width <= 892 && a.y + a.height <= 592);
      for (const b of boxes.slice(i + 1)) {
        assert(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y));
      }
    }
    w.document.querySelector('[data-action="map-mode"][data-value="list"]').click();
    await new Promise(setImmediate);
    assert.equal(w.document.querySelectorAll('.rn-source-row').length, 60);
    assert(requests.every(r => r.action === 'graph'), 'viewing must not rewrite saved positions');
  } finally { controller?.dispose(); dom.window.close(); }
});
