'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');
const start = source.indexOf('function seekToCue(i)');
const end = source.indexOf('\nfunction stepCue(', start);
assert(start >= 0 && end > start, 'seekToCue kaynakta bulunamadı');
const seekSource = source.slice(start, end);

function buildHarness({ workspaceMode = 'local', withVideo = true } = {}) {
  const video = withVideo ? { currentTime: 0 } : null;
  const calls = [];
  const player = {
    cues: [{ start: 12.5, end: 14, text: 'Hello' }],
    activeIdx: -1,
    browserTime: 0,
    workspaceMode,
  };
  const window = { api: { browserCommand: workspaceMode === 'browser' ? () => {} : null } };
  const seekToCue = new Function(
    'player', 'window', '$', 'subtitleVideoTime', 'browserCommand',
    'renderBrowserCueAt', 'renderCue', 'highlightCueRow',
    `${seekSource}; return seekToCue;`,
  )(
    player,
    window,
    (id) => (id === 'playerVideo' ? video : null),
    (time) => time + 2,
    (command, value) => { calls.push([command, value]); return Promise.resolve(); },
    (time) => calls.push(['renderBrowserCueAt', time]),
    () => calls.push(['renderCue']),
    () => calls.push(['highlightCueRow']),
  );
  return { calls, player, seekToCue, video };
}

{
  const harness = buildHarness();
  harness.seekToCue(0);
  assert.equal(harness.video.currentTime, 14.51);
  assert.equal(harness.player.activeIdx, 0);
  assert.equal(harness.player.loopCueId, '');
  assert.equal(harness.player.loopCueRepeats, 0);
  assert.deepEqual(harness.calls, [['renderCue'], ['highlightCueRow']]);
}

{
  const harness = buildHarness({ workspaceMode: 'browser' });
  harness.seekToCue(0);
  assert.equal(harness.player.browserTime, 14.51);
  assert.deepEqual(harness.calls, [
    ['seek', 14.51],
    ['renderBrowserCueAt', 14.51],
    ['highlightCueRow'],
  ]);
}

{
  const harness = buildHarness();
  harness.seekToCue(-1);
  harness.seekToCue(1);
  assert.equal(harness.player.activeIdx, -1);
  assert.equal(harness.video.currentTime, 0);
  assert.deepEqual(harness.calls, []);
}

const cueClickRegion = source.slice(
  source.indexOf("box.addEventListener('click'"),
  source.indexOf("box.addEventListener('mousemove'"),
);
assert(cueClickRegion.includes('seekToCue(i)'),
  'altyazı kartı tıklaması seekToCue üzerinden oynatıcıya bağlanmalı');

console.log('Cue seek regresyonları: 4/4 OK');
