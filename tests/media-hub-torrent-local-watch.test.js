'use strict';
// Streaming torrent → completed local file is attached to the player without the Media center open,
// only for the exact media key/generation that started it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
(async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  const { window } = dom;
  let done = false, calls = 0, quick = 0, subtitle = 0, ready = 0;
  window.UiLocale = { get: () => 'en' };
  window.api = { mediaTorrents: async input => { calls++; assert.equal(input.action, 'local'); return done ? { ok: true, path: '/videos/film.mkv' } : { ok: false, error: 'This file is still downloading.' }; }, mediaHub: async () => ({ ok: true }) };
  window.eval('var player={mediaKey:"torrent:abc:1",localPath:"",openIntent:0};var generation=1;var currentGeneration=()=>generation;var syncPlayerSourceQuick=()=>{window.__quick=(window.__quick||0)+1};var syncSubtitlePrimaryAction=()=>{window.__sub=(window.__sub||0)+1};');
  window.document.addEventListener('player-local-file-ready', () => { ready++; });
  window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/media-hub-ui.js'), 'utf8'));
  const { watchTorrentLocal, stopLocalWatch } = window.MediaHubUI._test, set = (k, v) => window.eval(`${k}=${JSON.stringify(v)}`), get = k => window.eval(k);
  // 1) Becomes ready while no dialog is open → attached once, watcher stops.
  watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 10 });
  await tick(45); assert(calls >= 2, 'keeps polling while downloading'); assert.equal(get('player.localPath'), '');
  done = true; await tick(40);
  assert.equal(get('player.localPath'), '/videos/film.mkv'); assert.equal(get('window.__quick'), 1); assert.equal(get('window.__sub'), 1); assert.equal(ready, 1);
  const settled = calls; await tick(40); assert.equal(calls, settled, 'stops polling after attaching');
  // 2) Media change: a late result for the old torrent never attaches to the new media.
  done = false; set('player.localPath', ''); calls = 0;
  watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 10 }); await tick(25);
  set('player.mediaKey', 'torrent:other:0'); done = true; await tick(40);
  assert.equal(get('player.localPath'), '', 'old torrent does not attach to the new media'); const stopped = calls; await tick(40); assert.equal(calls, stopped, 'stops after media change');
  // 3) Source/generation change stops it too.
  set('player.mediaKey', 'torrent:abc:1'); done = false; calls = 0; watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 10 }); await tick(25);
  set('generation', 2); done = true; await tick(40); assert.equal(get('player.localPath'), '', 'new generation never receives the old file');
  // 4) A new watch replaces the old one (single owner); explicit stop cancels.
  set('generation', 2); done = false; calls = 0; watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 10 }); const second = watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 10 });
  await tick(35); const perTick = calls; assert(perTick <= 5, 'one poller, not two: ' + perTick); stopLocalWatch(); const afterStop = calls; await tick(40); assert.equal(calls, afterStop); assert.equal(second.stopped, true);
  // 5) Time limit.
  calls = 0; watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 5, limit: 20 }); await tick(80); const capped = calls; await tick(40); assert.equal(calls, capped, 'gives up after the limit');
  // 6) A response already in flight cannot attach after a same-key generation change,
  // or stop the replacement watcher that now owns the player.
  let finishOld;
  window.api.mediaTorrents = () => new Promise(resolve => { finishOld = resolve; });
  set('generation', 3); watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 5 });
  await tick(20); assert.equal(typeof finishOld, 'function');
  set('generation', 4);
  window.api.mediaTorrents = async () => ({ ok: true, path: '/videos/current.mkv' });
  const replacement = watchTorrentLocal({ hash: 'abc', index: 1 }, { interval: 30 });
  finishOld({ ok: true, path: '/videos/stale.mkv' });
  await tick(10); assert.equal(get('player.localPath'), ''); assert.equal(replacement.stopped, false);
  await tick(50); assert.equal(get('player.localPath'), '/videos/current.mkv'); assert.equal(ready, 2);
  dom.window.close();
  console.log('media-hub-torrent-local-watch.test.js: OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
