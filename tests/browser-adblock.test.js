'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_CACHE_TTL_MS,
  createBrowserAdblock,
  loadEngine,
} = require('../src/browser-adblock');

class FakeEngine extends EventEmitter {
  constructor(label = 'engine') {
    super();
    this.label = label;
    this.enabledSessions = new Set();
  }
  serialize() { return Buffer.from(this.label, 'utf8'); }
  enableBlockingInSession(session) { this.enabledSessions.add(session); }
  disableBlockingInSession(session) { this.enabledSessions.delete(session); }
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-adblock-test-'));
  const cachePath = path.join(tempRoot, 'engine.bin');
  let builds = 0;
  let lastEngine = null;
  class FakeBlocker {
    static async fromPrebuiltAdsOnly(fetcher) {
      builds += 1;
      await fetcher('https://filters.invalid/ads.txt');
      lastEngine = new FakeEngine(`network-${builds}`);
      return lastEngine;
    }
    static deserialize(buffer) {
      lastEngine = new FakeEngine(Buffer.from(buffer).toString('utf8'));
      return lastEngine;
    }
  }

  try {
    const network = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
    });
    assert.equal(network.source, 'network');
    assert.equal(network.stale, false);
    assert.equal(builds, 1);
    assert.equal(fs.readFileSync(cachePath, 'utf8'), 'network-1');

    const freshNow = fs.statSync(cachePath).mtimeMs + 1000;
    const fresh = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => { throw new Error('fresh cache must avoid network'); },
      now: freshNow,
    });
    assert.equal(fresh.source, 'cache');
    assert.equal(fresh.stale, false);
    assert.equal(builds, 1);

    const stale = await loadEngine({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => { throw new Error('offline'); },
      now: freshNow + DEFAULT_CACHE_TTL_MS + 1,
      logger: { warn() {} },
    });
    assert.equal(stale.source, 'cache');
    assert.equal(stale.stale, true);
    assert.equal(builds, 2, 'stale cache should first attempt a refresh');

    const session = { name: 'persist:whisper-browser' };
    const controller = createBrowserAdblock({
      cachePath,
      blockerClass: FakeBlocker,
      fetchImpl: async () => ({ ok: true }),
      initialEnabled: false,
    });
    assert.equal(controller.getState().state, 'disabled');
    const enabled = await controller.setEnabled(session, true);
    assert.equal(enabled.ok, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.changed, true);
    assert.equal(lastEngine.enabledSessions.has(session), true);
    lastEngine.emit('request-blocked');
    assert.equal(controller.getState().blocked, 1);
    const unchanged = await controller.setEnabled(session, true);
    assert.equal(unchanged.changed, false);
    const disabled = await controller.setEnabled(session, false);
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.state, 'disabled');
    assert.equal(disabled.changed, true);
    assert.equal(lastEngine.enabledSessions.has(session), false);

    const failedController = createBrowserAdblock({
      cachePath: path.join(tempRoot, 'missing', 'engine.bin'),
      blockerClass: class BrokenBlocker {
        static async fromPrebuiltAdsOnly() { throw new Error('network unavailable'); }
        static deserialize() { throw new Error('invalid cache'); }
      },
      fetchImpl: async () => { throw new Error('offline'); },
      logger: { warn() {} },
    });
    const failed = await failedController.setEnabled(session, true);
    assert.equal(failed.ok, false);
    assert.equal(failed.enabled, false);
    assert.equal(failed.state, 'error');
    assert.match(failed.error, /network unavailable/);

    const root = path.join(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

    assert.match(main, /createBrowserAdblock/);
    assert.match(main, /browser:adblock:getState/);
    assert.match(main, /browser:adblock:setEnabled/);
    assert.match(preload, /getBrowserAdblockState/);
    assert.match(preload, /setBrowserAdblockEnabled/);
    assert.match(html, /id="browserAdblockEnabled"[^>]*checked/);
    const persisted = renderer.slice(renderer.indexOf('const PERSIST_CHECKBOX_CONTROLS'), renderer.indexOf('function collectUiSettings'));
    assert.match(persisted, /browserAdblockEnabled/);
    assert.ok(renderer.indexOf("event.type === 'adblock-status'") < renderer.indexOf('if (event.tabId)', renderer.indexOf('if (window.api.onBrowserEvent)')),
      'global adblock status must not be dropped by the per-tab event gate');

    for (const marker of ['async function openBrowserLinkInNewTab', 'function resumeRestoredBrowserPage', "ipcMain.handle('browser:navigate'"]) {
      const start = main.indexOf(marker);
      const load = main.indexOf('loadURL(', start);
      const readiness = main.indexOf('waitForBrowserAdblockReady()', start);
      assert.ok(start >= 0 && readiness > start && readiness < load, `${marker} must await adblock before first request`);
    }

    console.log('Browser adblock cache, fallback, toggle and integration tests passed');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});