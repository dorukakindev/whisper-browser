'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function sourceBetween(start, end) {
  const from = main.indexOf(start);
  const to = main.indexOf(end, from);
  assert(from >= 0 && to > from, 'Üretim işlevi kaynakta bulunamadı');
  return main.slice(from, to);
}

async function mainTest() {
  const manifestSource = sourceBetween(
    'function browserManifestResourceProbeScript()',
    'function scheduleBrowserDiscoveryProbe(',
  );
  const calls = [];
  const tab = {
    id: 'tab-1',
    closing: false,
    compatibilityMode: false,
    cloudflareChallengeActive: false,
    browserInstrumentationPending: false,
    manifestResourceRecoveryBusy: false,
    manifestResourceAttempts: new Map(),
    restoredUrl: 'https://video.test/watch',
    view: { webContents: { isDestroyed: () => false } },
    diagnostics: {},
  };
  const context = {
    URL,
    Buffer,
    Date,
    Map,
    Set,
    browserActiveTabId: tab.id,
    browserView: tab.view,
    browserCaptureEnabled: true,
    browserStateGeneration: 7,
    CAPTURE_RETRY: 'retry',
    CAPTURE_ABANDONED: 'abandoned',
    CAPTURE_PROCESSED: 'processed',
    decodeSubtitleBuffer: (value) => ({ text: Buffer.from(value).toString('utf8') }),
    browserEventContext: () => ({ tabId: tab.id, generation: 2, mediaId: 'media-1' }),
    executeBrowserViewFrames: async () => [[
      'https://cdn.test/master.m3u8?sig=secret',
      'https://cdn.test/video/manifest?id=42',
    ]],
    isCurrentBrowserContext: () => true,
    fetchBrowserBufferWithRetry: async (url) => {
      calls.push(url);
      return Buffer.from('#EXTM3U\n');
    },
    processBrowserCapturedPayload: async (_payload, candidate, strategy) => {
      assert.equal(strategy, 'performance-resource');
      assert.match(candidate.mimeType, /mpegurl/);
      return 'processed';
    },
    captureOutcomeStatus: (value) => value,
    freshBrowserDiagnostics: () => ({}),
    sendBrowserEvent: () => {},
    browserTabById: () => tab,
    browserDiagnostics: null,
  };
  const api = vm.runInNewContext(
    manifestSource + '\n({ browserManifestResourceProbeScript, browserManifestResourceMime, recoverBrowserManifestResources })',
    context,
  );
  assert.equal(api.browserManifestResourceMime('https://cdn.test/a.mpd?x=1'), 'application/dash+xml');
  assert.equal(api.browserManifestResourceMime('https://cdn.test/a.m3u8'), 'application/vnd.apple.mpegurl');
  assert.equal(api.browserManifestResourceMime(
    'https://cdn.test/video/manifest?id=1', Buffer.from('<?xml version="1.0"?><MPD></MPD>'),
  ), 'application/dash+xml');
  assert.equal(api.browserManifestResourceMime(
    'https://cdn.test/video/manifest?id=1', Buffer.from('#EXTM3U\n'),
  ), 'application/vnd.apple.mpegurl');

  const probe = api.browserManifestResourceProbeScript();
  const candidates = vm.runInNewContext(probe, {
    URL,
    location: { href: 'https://page.test/watch' },
    performance: { getEntriesByType: () => [
      { name: 'https://cdn.test/master.m3u8?sig=x' },
      { name: 'https://cdn.test/video/manifest?id=1' },
      { name: 'https://cdn.test/image.jpg' },
      { name: 'file:///C:/secret.m3u8' },
    ] },
    document: { querySelectorAll: () => [] },
  });
  assert.deepEqual(Array.from(candidates), [
    'https://cdn.test/master.m3u8?sig=x',
    'https://cdn.test/video/manifest?id=1',
  ]);

  assert.equal(await api.recoverBrowserManifestResources(tab, 'test'), 2);
  assert.equal(calls.length, 2);
  assert.equal(await api.recoverBrowserManifestResources(tab, 'test'), 0);
  assert.equal(calls.length, 2, 'Başarıyla işlenen manifest yeniden indirilmemeli');
  tab.browserInstrumentationPending = true;
  tab.manifestResourceAttempts.clear();
  assert.equal(await api.recoverBrowserManifestResources(tab, 'pending'), 0);
  assert.equal(calls.length, 2, 'Güvenlik ölçümü beklerken sayfa taranmamalı');
  tab.browserInstrumentationPending = false;
  tab.manifestResourceAttempts = new Map();
  let releaseFetch;
  context.executeBrowserViewFrames = async () => [['https://cdn.test/race.m3u8']];
  context.fetchBrowserBufferWithRetry = () => new Promise((resolve) => { releaseFetch = resolve; });
  const staleRecovery = api.recoverBrowserManifestResources(tab, 'eski gezinme');
  while (!releaseFetch) await new Promise((resolve) => setImmediate(resolve));
  tab.manifestResourceRecoverySeq += 1;
  tab.manifestResourceRecoveryBusy = true;
  releaseFetch(Buffer.from('#EXTM3U\n'));
  await staleRecovery;
  assert.equal(tab.manifestResourceRecoveryBusy, true,
    'Eski kurtarma yeni gezinmenin meşgul bayrağını temizlememeli');
  tab.manifestResourceRecoveryBusy = false;

  const frameSource = sourceBetween(
    'function browserDiscoveryFrameAllowed(event)',
    "if (typeof ipcMain.on === 'function') ipcMain.on('browser:discovery-signal'",
  );
  const browserDiscoveryFrameAllowed = vm.runInNewContext(
    frameSource + '\nbrowserDiscoveryFrameAllowed',
  );
  const child = {}, outsider = {};
  const mainFrame = { framesInSubtree: [] };
  mainFrame.framesInSubtree = [mainFrame, child];
  const sender = { mainFrame };
  assert.equal(browserDiscoveryFrameAllowed({ sender, senderFrame: mainFrame }), true);
  assert.equal(browserDiscoveryFrameAllowed({ sender, senderFrame: child }), true);
  assert.equal(browserDiscoveryFrameAllowed({ sender, senderFrame: outsider }), false);
  assert.equal(browserDiscoveryFrameAllowed({ sender: {}, senderFrame: child }), false);

  assert.match(main, /media-started-playing[\s\S]{0,500}recoverBrowserManifestResources\(tab, 'oynatma başladı'\)/);
  assert.match(main, /browserTrackTimer = setInterval[\s\S]{0,300}recoverBrowserManifestResources/);
  assert.match(main, /performBrowserPageInstrumentation[\s\S]{0,5000}recoverBrowserManifestResources\(tab, 'güvenlik ölçümü sonrası'\)/);
  console.log('browser-manifest-recovery: iframe discovery, missed manifest recovery and bounded retry passed');
}

mainTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
