'use strict';

const assert = require('node:assert/strict');
const {
  assertCeaPlan, assertCeaComplete, assertOverlayModes, assertSeekCue,
  assertLocaleLabels, assertReloadTracks,
} = require('./browser-subtitle-gauntlet-acceptance');

const plan = { available: true, total: 1, tracks: [{ instreamId: 'CC1' }] };
const complete = { state: 'complete', planComplete: true, missing: 0,
  total: 1, completed: 1, cueCount: 1, durationPercent: 100 };

assertCeaPlan(plan);
assert.throws(() => assertCeaPlan(null), /CEA planı/);
assert.throws(() => assertCeaPlan({ ...plan, tracks: [] }), /CC1/);
assertCeaComplete({ ok: true }, complete);
assert.throws(() => assertCeaComplete({ ok: false }, complete), /tam yakalama/);
assert.throws(() => assertCeaComplete({ ok: true }, { ...complete, state: 'error' }), /complete/);
assert.throws(() => assertCeaComplete({ ok: true }, { ...complete, state: 'partial',
  planComplete: false, missing: 1 }), /complete/);
assert.throws(() => assertCeaComplete({ ok: true }, { ...complete, durationPercent: 6 }), /süresini/);

const sourceView = { source: { visible: true, text: 'First fixture cue' },
  translation: { visible: false, text: 'TR:stale' } };
const bothView = { source: { visible: true, text: 'First fixture cue' },
  translation: { visible: true, text: 'TR:First fixture cue·p0' } };
assertOverlayModes(sourceView, bothView);
assert.throws(() => assertOverlayModes({ ...sourceView, source: { visible: false, text: '' } }, bothView), /kaynak/);
assert.throws(() => assertOverlayModes({ ...sourceView, translation: { visible: true, text: 'TR:stale' } }, bothView), /çeviri/);
assertSeekCue('TR:Second fixture cue·p1', 1);
assert.throws(() => assertSeekCue('TR:First fixture cue·p0', 1), /p1/);

assertLocaleLabels('Fetch full subtitles', 'Tüm altyazıyı getir');
assert.throws(() => assertLocaleLabels('', 'Tüm altyazıyı getir'), /EN/);
assert.throws(() => assertLocaleLabels('Fetch full subtitles', ''), /TR/);

assertReloadTracks([{ role: 'source', cueCount: 3 }]);
assert.throws(() => assertReloadTracks([]), /kaynak cue/);
console.log('browser-subtitle-gauntlet-acceptance: pozitif/negatif kapılar geçti');
