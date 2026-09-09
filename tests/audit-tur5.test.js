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
    closeBrowserFind() {},
    setBrowserDownloadsOpen() {},
    player: {
      shadowResumeTimer: 1, openIntent: 0, probeRequestSeq: 0,
      editing: true, cueEditUndo: [{ before: 1 }], cueEditRedo: [{ after: 1 }],
      abA: 10, abB: 20, cuesRaw: [{ text: 'eski' }], cues2Raw: [{ text: 'eski çeviri' }],
    },
    _liveCueRenderTimer: 2, clearTimeout: (id) => pending.delete(id),
    $: (id) => id === 'playerVideo' ? { pause() {} } : { classList: { add() {} } },
    stopAmbient() {}, flushWatchState() {}, destroyHls() {},
    disconnectBrowserBoundsObserver() {}, window: { api: {} },
  };
  runFunction('closePlayer', ctx)();
  assert.equal(pending.size, 0);
  assert.equal(ctx.player.shadowResumeTimer, null);
  assert.equal(ctx._liveCueRenderTimer, null);
  assert.equal(ctx.player.editing, false);
  assert.deepEqual(ctx.player.cueEditUndo, []);
  assert.deepEqual(ctx.player.cueEditRedo, []);
  assert.equal(ctx.player.abA, null);
  assert.equal(ctx.player.abB, null);
  assert.equal(ctx.player.cuesRaw, null);
  assert.equal(ctx.player.cues2Raw, null);
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
  const ctx = { state: { previewSegs: [
    { start: 1, end: 2, text: 'Canlı metin', speaker: 'A', confidence: 0.25,
      lowConfidenceWords: 2, translationText: 'Live text', previewActive: true },
  ] }, playerPreviewUnmatchedEdits: [], PREVIEW_DOM_CAP: 1500,
    $: () => ({ appendChild() {}, classList: { toggle() {} } }), document: { createDocumentFragment: () => ({ appendChild() {} }) },
    createSegmentEl: () => ({ classList: { add() {} } }), applySegmentFilter() {} };
  const record = { start: 1, end: 2, text: 'Merhaba' };
  runFunction('renderFinalPreview', ctx)([record]);
  assert.equal(ctx.state.previewSegs[0].speaker, 'A');
  assert.equal(ctx.state.previewSegs[0].confidence, 0.25);
  assert.equal(ctx.state.previewSegs[0].lowConfidenceWords, 2);
  assert.equal(ctx.state.previewSegs[0].translationText, 'Live text');
  assert.equal(ctx.state.previewSegs[0].previewActive, false);
  assert.notStrictEqual(ctx.state.previewSegs[0], record);
}

// Preview status derivation is independent from color, and translation refreshes
// resolve rows by timestamp while clearing translations absent from the final set.
{
  const states = runFunction('previewSegmentStates', {})({
    previewActive: true, confidence: 0.4, lowConfidenceWords: 1,
    previewEdited: true, translationText: 'Translated',
  });
  assert.equal(states.map((state) => state.key).join(','),
    'active,low-confidence,edited,translation');

  const rendered = [];
  const ctx = {
    state: { previewSegs: [
      { start: 1, end: 2, text: 'Bir', translationText: 'One' },
      { start: 3, end: 4, text: 'İki' },
    ] },
    previewTimeKey: (seg) => `${Number(seg.start).toFixed(3)}|${Number(seg.end).toFixed(3)}`,
    $: () => ({ querySelector: (selector) => ({ selector }) }),
    syncPreviewTranslation: (el, seg) => rendered.push(['translation', el.selector, seg.translationText]),
    syncPreviewSegmentState: (el, seg) => rendered.push(['state', el.selector, seg.translationText]),
  };
  runFunction('applyPreviewTranslations', ctx)([{ start: 3, end: 4, text: 'Two' }], true);
  assert.equal(ctx.state.previewSegs[0].translationText, undefined);
  assert.equal(ctx.state.previewSegs[1].translationText, 'Two');
  assert.equal(rendered.length, 4);
}

// Refresh retains edits by unambiguous interval, archives changed boundaries,
// and never treats an untouched contenteditable node as an edit.
{
  const preview = { appendChild() {}, contains: () => true,
    querySelectorAll() { throw Error('Unfocused nodes must not be committed'); } };
  const ctx = { state: { previewSegs: [
    { start: 1, end: 2, text: 'Benim metnim', previewEdited: true },
    { start: 3, end: 4, text: 'Yeniden bölünen düzenleme', previewEdited: true },
  ] }, playerPreviewUnmatchedEdits: [], PREVIEW_DOM_CAP: 1500,
    $: id => id === 'preview' ? preview : { classList: { toggle() {} } },
    document: { createDocumentFragment: () => ({ appendChild() {} }) },
    createSegmentEl: () => ({ classList: { add() {} } }), applySegmentFilter() {}, logLine() {},
  };
  const refresh = runFunction('renderFinalPreview', ctx);
  refresh([{ start: 1, end: 2, text: 'API metni' }, { start: 3, end: 3.5, text: 'Yeni parça' }]);
  assert.equal(ctx.state.previewSegs[0].text, 'Benim metnim');
  assert.equal(ctx.state.previewSegs[1].text, 'Yeni parça');
  assert.equal(ctx.playerPreviewUnmatchedEdits[0].text, 'Yeniden bölünen düzenleme');
  refresh([{ start: 1, end: 2, text: 'a' }, { start: 1, end: 2, text: 'b' }]);
  assert.equal(ctx.state.previewSegs[0].text, 'a');
  assert.equal(ctx.state.previewSegs[1].text, 'b');
  assert.equal(ctx.playerPreviewUnmatchedEdits.length, 2);
}

// Switching between browser and local mode keeps the unmerged source lists.
{
  const raw = [{ start: 0, end: 1, text: 'a' }, { start: 1, end: 2, text: 'b' }];
  const merged = [{ start: 0, end: 2, text: 'a b' }];
  const ctx = { player: { cues: merged, cues2: [], cuesRaw: raw, cues2Raw: [],
    subtitles: [], subOrigins: {}, offset: 1.5 }, $: () => null,
    syncSubtitleModeUi() {}, renderCueList() {}, renderCue() {}, updateSubtitleChips() {} };
  runFunction('saveLocalSubtitleWorkspace', ctx)();
  ctx.player.cuesRaw = null; ctx.player.cues = [];
  runFunction('restoreLocalSubtitleWorkspace', ctx)();
  assert.equal(ctx.player.cues.length, 1);
  assert.equal(ctx.player.cuesRaw.length, 2);
  assert.notStrictEqual(ctx.player.cuesRaw, raw);
}

// Timing and text edits migrate saved sentence/word identities; repeated text
// is intentionally not matched to a potentially different subtitle.
{
  const signature = cue => `${cue.start}|${cue.end}|${cue.text}`;
  const old = { start: 1, end: 2, text: 'Merhaba' };
  const ctx = { player: { savedCues: [signature(old)],
    savedWords: [{ key: `merhaba|${signature(old)}|source`, cue: old.text }],
    timeline: { annotationSnapshot: [old] }, cues: [{ ...old, start: 1.5, end: 2.5 }] },
    cueSignature: signature, persistSavedCues() {}, persistSavedWords() {} };
  ctx.migrateSavedCueAssociation = runFunction('migrateSavedCueAssociation', ctx);
  const migrate = runFunction('migrateTimelineAssociations', ctx);
  migrate();
  assert.equal(ctx.player.savedCues[0], '1.5|2.5|Merhaba');
  assert.equal(ctx.player.savedWords[0].key, 'merhaba|1.5|2.5|Merhaba|source');
  ctx.player.timeline.annotationSnapshot = ctx.player.cues.map(c => ({ ...c }));
  ctx.player.cues = [{ ...old, start: 3 }, { ...old, start: 4 }];
  migrate();
  assert.equal(ctx.player.savedCues[0], '1.5|2.5|Merhaba');
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

// Execute the actual beforeunload callback: the final queue snapshot must be
// acknowledged synchronously, not left as an unawaited invoke.
{
  const start = source.indexOf("window.addEventListener('beforeunload'");
  const end = source.indexOf('\n});', start) + 4;
  let unload;
  const calls = [];
  vm.runInNewContext(source.slice(start, end), {
    window: { addEventListener: (_, fn) => { unload = fn; }, api: {
      saveSettingsSync: () => calls.push('settings'),
      saveQueueStateSync: value => { assert.equal(value.queue[0].id, 7); calls.push('queue'); },
    } }, _saveTimer: 1, clearTimeout() {}, _queuePersistenceReady: true,
    stopBrowserMangaLookaheadTimer: () => calls.push('manga-timer'),
    appSettingsPayload: () => ({}), queueSnapshotPayload: () => ({ queue: [{ id: 7 }] }),
    persistQueueNow: () => { throw Error('Async fallback used despite sync bridge'); },
  });
  unload(); assert.deepStrictEqual(calls, ['manga-timer', 'settings', 'queue']);
}
