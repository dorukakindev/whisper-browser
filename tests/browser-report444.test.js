'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { BrowserAssetStore } = require('../src/browser-asset-store');
const renderer = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}

test('keyless readiness uses the selected endpoint and accepts only loopback', () => {
  const controls = { translateApiKey: { value: '' }, translateBaseUrl: { value: 'http://localhost:1234/v1' },
    translateEndpointPreset: { value: 'custom' } };
  const scope = { URL, $: id => controls[id] };
  vm.runInNewContext(renderer.slice(renderer.indexOf('function translationEndpointReady('))
    + section(renderer, 'function translationReadyForCreate()', 'function openTranslationKeySetup()')
    + section(main, 'function safeTranslationEndpoint(', 'function browserTranslationConfigProblem('), scope);
  assert.equal(scope.translationReadyForCreate(), true);
  for (const url of ['http://127.0.0.1:8000/v1', 'http://[::1]:8000/v1', 'https://localhost/v1']) {
    controls.translateBaseUrl.value = url;
    assert.equal(scope.translationReadyForCreate(), true);
    assert.ok(scope.safeTranslationEndpoint(url));
  }
  for (const url of ['http://localhost.evil.test/v1', 'https://api.example/v1', 'file:///tmp/key', 'http://u:p@localhost/v1']) {
    controls.translateBaseUrl.value = url;
    assert.equal(scope.translationReadyForCreate(), false);
  }
  controls.translateBaseUrl.value = 'http://localhost:1234/v1';
  controls.translateEndpointPreset.value = 'https://api.example/v1';
  assert.equal(scope.translationReadyForCreate(), false, 'saved custom URL must not override selected provider');
  controls.translateApiKey.value = 'fixture-key';
  assert.equal(scope.translationReadyForCreate(), true);
});

test('player handoff prioritizes an observed time of zero and clears stale seeks', () => {
  const player = { openIntent: 0, browserTime: 0, browserMediaSeen: true };
  let watch = { position: 800 };
  const scope = { player, closeBrowserToolbarMenus() {}, currentBrowserYoutubeUrl: () => 'https://youtube.com/watch?v=fixture',
    mediaKeyFor: () => 'youtube:fixture', watchItemByKey: () => watch, setBrowserSignal() {},
    $: () => ({ classList: { remove() {} } }), openYoutubePanelAndProbe() {} };
  vm.runInNewContext(section(renderer, 'function watchBrowserVideoInPlayer()', "if ($('browserWatchInPlayer'))"), scope);
  for (const seconds of [0, .5, 1.9, 15]) {
    player.browserTime = seconds;
    scope.watchBrowserVideoInPlayer();
    assert.equal(player.pendingLibrarySeek.seconds, seconds);
  }
  player.browserMediaSeen = false; player.browserTime = NaN;
  scope.watchBrowserVideoInPlayer(); assert.equal(player.pendingLibrarySeek.seconds, 800);
  watch = null; scope.watchBrowserVideoInPlayer(); assert.equal(player.pendingLibrarySeek, null);
});

test('translation warnings survive persistence and identity attachment without marking edited text', () => {
  const prefix = section(main, 'function persistCompletedBrowserTranslation(', '  if (!cues.length) return null;');
  const scheduler = { snapshot: () => ({ results: [{ qualityIssues: ['number_mismatch'],
    cues: [{ id: 'a', start: 0, end: 1, text: 'Sample translation.' }] }] }) };
  const scope = { scheduler, tab: { translationScheduler: scheduler }, browserSubtitleIdentityHash: () => 'a'.repeat(64) };
  vm.runInNewContext(prefix + 'return cues; }', scope);
  const cues = scope.persistCompletedBrowserTranslation(scope.tab, scheduler, {}, {});
  assert.equal(cues[0].qualityWarning, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-report444-'));
  try {
    const store = new BrowserAssetStore({ rootDir: dir });
    const saved = store.putTrack({ mediaId: 'fixture', role: 'translation', cues });
    assert.equal(saved.ok, true);
    const loaded = store.getTrack(saved.assetId).document.cues;
    assert.deepEqual(loaded[0].qualityIssues, ['number_mismatch']);
    vm.runInNewContext(section(renderer, 'function attachBrowserCueIdentities(', 'function browserEditContextForCue('), scope);
    const track = { role: 'translation', cueIdentities: loaded };
    assert.equal(scope.attachBrowserCueIdentities(track, [{ start: 0, end: 1, text: 'Sample translation.' }])[0].qualityWarning, true);
    assert.equal(scope.attachBrowserCueIdentities(track, [{ start: 0, end: 1, text: 'Edited text.' }])[0].qualityWarning, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
