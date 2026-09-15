'use strict';

const assert = require('node:assert/strict');
const { runBrowserPageIndexCapture } = require('../src/browser-page-index');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function run() {
  let enabled = true;
  let indexGeneration = 7;
  const view = { id: 'view-1' };
  const tab = { view, generation: 11 };
  const first = deferred();
  const writes = [];
  const webContents = {
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: () => first.promise,
  };
  const base = {
    tab, view, webContents, tabGeneration: 11, indexGeneration: 7,
    isEnabled: () => enabled,
    currentIndexGeneration: () => indexGeneration,
    script: 'page-context-script',
    upsertPage: (page) => writes.push(page),
    now: () => 12345,
  };

  const staleGeneration = runBrowserPageIndexCapture(base);
  indexGeneration += 1;
  first.resolve({ ok: true, url: 'https://example.test/eski', title: 'Eski',
    blocks: [{ text: 'Bu gecikmiş içerik indekse yazılmamalıdır.' }] });
  assert.deepEqual(await staleGeneration, { ok: false, reason: 'stale-after-capture' });
  assert.equal(writes.length, 0, 'Temizleme sonrası gecikmiş sonuç FTS indeksine yazıldı');

  indexGeneration = 7;
  const second = deferred();
  webContents.executeJavaScriptInIsolatedWorld = () => second.promise;
  const staleTab = runBrowserPageIndexCapture(base);
  tab.generation += 1;
  tab.view = { id: 'view-2' };
  second.resolve({ ok: true, url: 'https://example.test/onceki', title: 'Önceki',
    blocks: [{ text: 'Medya değişiminden kalan eski içerik.' }] });
  assert.deepEqual(await staleTab, { ok: false, reason: 'stale-after-capture' });
  assert.equal(writes.length, 0, 'Eski sekme görünümünün sonucu FTS indeksine yazıldı');

  tab.generation = 11;
  tab.view = view;
  webContents.executeJavaScriptInIsolatedWorld = async () => ({
    ok: true, url: 'https://example.test/yeni?token=gizli', title: 'Yeni',
    blocks: [{ text: 'Güncel birinci blok.' }, { text: 'Güncel ikinci blok.' }],
  });
  assert.deepEqual(await runBrowserPageIndexCapture(base), { ok: true });
  assert.deepEqual(writes, [{
    url: 'https://example.test/yeni?token=gizli', title: 'Yeni',
    content: 'Güncel birinci blok.\nGüncel ikinci blok.', visitedAt: 12345,
  }]);

  enabled = false;
  assert.deepEqual(await runBrowserPageIndexCapture(base),
    { ok: false, reason: 'stale-before-capture' });
  assert.equal(writes.length, 1);
  console.log('browser-page-index-race: 4 test');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
