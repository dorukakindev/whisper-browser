'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const calls = [];
let selected = null;
let focused = 0;
let revealed = 0;
const ctx = {
  player: {
    browserCeaCapture: {
      state: 'complete', available: true,
      tracks: [{ instreamId: 'CC1', language: 'en', name: 'English' }],
    },
    browserTracks: [
      { id: 'preview', path: 'preview.srt', language: 'en', label: '1-CC1', format: 'html5-track', role: 'source' },
      { id: 'complete', path: 'complete.srt', language: 'en', label: '1-CC1', format: 'cea-608', captureKind: 'embedded-cea', captureComplete: true, role: 'source' },
    ],
  },
  browserTrackSelection() { return selected; },
  async useBrowserTrack(translate, trackId) { calls.push({ translate, trackId }); },
  setBrowserSignal() {},
  $(id) {
    if (id === 'browserTrackActions') return { classList: { remove() { revealed++; } } };
    if (id === 'browserTrackSelect') return { focus() { focused++; } };
    return null;
  },
};
vm.createContext(ctx);
const start = source.indexOf('function browserCeaMatchHint(');
const end = source.indexOf('function shouldAcquireFullCeaBeforeTranslation(');
vm.runInContext(source.slice(start, end), ctx);

(async () => {
  assert.equal(ctx.preferredBrowserSourceTrack().id, 'complete', 'Tam CEA kaydı önizleme izinden önce gelmeli');
  assert.equal(await ctx.translateBrowserSubtitleFromHealth(), true);
  assert.deepEqual(calls, [{ translate: true, trackId: 'complete' }]);

  ctx.player.browserCeaCapture = { state: 'complete', available: true, tracks: [] };
  ctx.player.browserTracks = [];
  selected = null;
  assert.equal(await ctx.translateBrowserSubtitleFromHealth(), false);
  assert.equal(revealed, 1);
  assert.equal(focused, 1);
  console.log('Subtitle health direct translation: completed CEA source and fallback passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
