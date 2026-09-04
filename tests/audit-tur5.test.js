const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
function runFunction(name, context) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, context);
}

// Closing the player must cancel both delayed shadow playback and cue rendering.
{
  const pending = new Map([[1, () => { throw Error('Unexpected playback'); }],
    [2, () => { throw Error('Unexpected render'); }]]);
  const ctx = {
    player: { shadowResumeTimer: 1, openIntent: 0, probeRequestSeq: 0 },
    _liveCueRenderTimer: 2, clearTimeout: (id) => pending.delete(id),
    $: (id) => id === 'playerVideo' ? { pause() {} } : { classList: { add() {} } },
    stopAmbient() {}, flushWatchState() {}, destroyHls() {}, window: { api: {} },
  };
  runFunction('closePlayer', ctx)();
  assert.equal(pending.size, 0);
  assert.equal(ctx.player.shadowResumeTimer, null);
  assert.equal(ctx._liveCueRenderTimer, null);
}

// A clamped/zero nudge must not consume undo or mark the document dirty.
{
  const ctx = { player: { timeline: { selected: 0 }, cues: [{ start: 0, end: 2 }] },
    undo: 0, dirty: 0 };
  ctx.timelinePushUndo = () => { ctx.undo++; };
  ctx.timelineMarkDirty = () => { ctx.dirty++; };
  const nudge = runFunction('timelineNudge', ctx);
  for (const delta of [0, -1, NaN, Infinity]) nudge(delta);
  assert.equal(ctx.undo, 0);
  assert.equal(ctx.dirty, 0);
  nudge(.5);
  assert.equal(ctx.player.cues[0].start, .5);
  assert.equal(ctx.player.cues[0].end, 2.5);
  assert.equal(ctx.undo, 1);
  assert.equal(ctx.dirty, 1);
}

// Clearing a job removes both the search term and its pending debounce.
{
  const nodes = {
    preview: { innerHTML: '' }, previewSearch: { value: 'previous job' },
    previewSearchClear: { classList: { add(value) { this.hidden = value === 'hidden'; } } },
  };
  const canceled = [];
  const ctx = { state: { previewSegs: [1] }, _searchTimer: 5, previewFilter: 'previous job',
    _previewCapWarned: true, clearTimeout: (id) => canceled.push(id), $: (id) => nodes[id] };
  runFunction('clearPreview', ctx)();
  assert.deepStrictEqual(canceled, [5]);
  assert.equal(ctx._searchTimer, null);
  assert.equal(ctx.previewFilter, '');
  assert.equal(nodes.previewSearch.value, '');
  assert.equal(nodes.previewSearchClear.classList.hidden, true);
  assert.equal(ctx.state.previewSegs.length, 0);
}

// Full refresh preserves quality/speaker metadata without sharing mutable records.
{
  const ctx = { state: {}, PREVIEW_DOM_CAP: 1500,
    $: () => ({ appendChild() {} }), document: { createDocumentFragment: () => ({ appendChild() {} }) },
    createSegmentEl: () => ({ classList: { add() {} } }), applySegmentFilter() {} };
  const record = { start: 1, end: 2, text: 'Merhaba', speaker: 'A', confidence: 0 };
  runFunction('renderFinalPreview', ctx)([record]);
  assert.equal(ctx.state.previewSegs[0].speaker, 'A');
  assert.equal(ctx.state.previewSegs[0].confidence, 0);
  assert.notStrictEqual(ctx.state.previewSegs[0], record);
}

// Run the real input handler: live/unknown duration must not assign Infinity.
{
  const start = source.indexOf("$('playerSeek').addEventListener('input'");
  const end = source.indexOf('\n  });', start) + 6;
  const video = { duration: Infinity, currentTime: 8 };
  let input;
  vm.runInNewContext(source.slice(start, end), {
    video, $: () => ({ addEventListener: (_, fn) => { input = fn; } }), updateSeekVisuals() {},
  });
  for (const duration of [Infinity, NaN, 0]) {
    video.duration = duration; input({ target: { value: '500' } });
    assert.equal(video.currentTime, 8);
  }
  video.duration = 100;
  input({ target: { value: '500' } }); assert.equal(video.currentTime, 50);
  input({ target: { value: 'bad' } }); assert.equal(video.currentTime, 50);
  input({ target: { value: '2000' } }); assert.equal(video.currentTime, 100);
}
console.log('Tur 5 renderer davranış testleri geçti.');
