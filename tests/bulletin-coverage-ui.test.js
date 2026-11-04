'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const CinemaBulletinModel = require('../src/cinema-bulletin-model');

test('bulletin retry renders the latest persisted failure instead of an older successful response', async t => {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  t.after(() => w.close());
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false; this.dispatchEvent(new w.Event('close'));
  };
  w.UiLocale = { get: () => 'en' };
  w.syncBrowserOcclusion = () => {};
  w.CinemaBulletinModel = CinemaBulletinModel;

  let persisted = { id: 'feed-one', title: 'Publisher', enabled: true, state: 'failed', errorKind: 'http', lastAttempt: 100 };
  let refreshes = 0, resolveFirst;
  const firstRender = new Promise(resolve => { resolveFirst = resolve; });
  const renders = [];
  w.V3SurfacesUI = { renderBulletin(_root, model, options) {
    renders.push({ model, handlers: options.handlers }); resolveFirst();
  } };
  w.api = {
    mediaCatalog: async () => ({ ok: true, items: [] }),
    feedsRequest: async input => {
      if (input.action === 'list') return { ok: true, feeds: [{ ...persisted }] };
      if (input.action === 'entries') return { ok: true, rows: [] };
      assert.equal(input.action, 'refresh');
      assert.deepEqual(Array.from(input.feedIds), ['feed-one']);
      refreshes++;
      // A newer scheduler attempt has already persisted failure by the time
      // the renderer receives the older manual refresh's successful result.
      persisted = { ...persisted, lastAttempt: 300, state: 'failed', errorKind: 'network' };
      return { ok: true, results: [{ feedId: 'feed-one', state: 'updated', inserted: 1 }] };
    },
  };
  w.eval(fs.readFileSync(require.resolve('../src/renderer/player-ui-kit'), 'utf8'));
  w.eval(fs.readFileSync(require.resolve('../src/renderer/v3-integration'), 'utf8'));
  w.WhisperV3.open('bulletin');
  await firstRender;
  assert.equal(renders[0].model.coverage.rows[0].status, 'error');

  await renders[0].handlers.onRetry();
  assert.equal(refreshes, 1); assert.equal(renders.length, 2);
  const coverage = renders[1].model.coverage;
  assert.equal(coverage.rows[0].status, 'error');
  assert.equal(coverage.rows[0].lastAttempt, 300);
  assert.equal(coverage.rows[0].newItems, 0);
  assert.equal(coverage.checkedFeeds, 0); assert.equal(coverage.remainingFeeds, 1);
  assert.equal(coverage.complete, false);
  assert.equal(w.document.querySelector('.mtx-status').textContent, 'No saved entries to display.');
});
