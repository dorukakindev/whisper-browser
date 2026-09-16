'use strict';

const assert = require('assert');
const {
  calibrateCueTimeline,
  matchingReferenceCues,
  shiftCueTimeline,
} = require('../src/browser-cue-timeline-calibration');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  OK  ${name}`); passed++; }
  catch (error) { console.error(`  FAIL ${name}`); throw error; }
}

test('site TextTrack örneklerinden sabit CEA ofsetini bulur', () => {
  const full = [
    { start: 19.977, end: 21.945, text: 'In the last lecture, we\nconsidered the beginnings of' },
    { start: 28.018, end: 31.955, text: 'All of Egyptian religion and its\nstories refer either directly or' },
  ];
  const native = [
    { start: 11.977, end: 13.945, text: 'In the last lecture, we considered the beginnings of' },
    { start: 20.018, end: 23.955, text: 'All of Egyptian religion and its stories refer either directly or' },
  ];
  const result = calibrateCueTimeline(native, full);
  assert.equal(result.accepted, true);
  assert.equal(result.offsetSeconds, -8);
  assert.equal(result.matches, 2);
  assert.equal(shiftCueTimeline(full, result.offsetSeconds)[1].start, 20.018);
});

test('tek kısa veya çelişkili eşleşmeyle zaman çizelgesini değiştirmez', () => {
  assert.equal(calibrateCueTimeline([{ start: 2, text: 'Hello' }],
    [{ start: 10, text: 'Hello' }]).accepted, false);
  const result = calibrateCueTimeline([
    { start: 2, text: 'This is a sufficiently long unique caption line' },
    { start: 30, text: 'Another sufficiently long unique caption line' },
  ], [
    { start: 10, text: 'This is a sufficiently long unique caption line' },
    { start: 31, text: 'Another sufficiently long unique caption line' },
  ]);
  assert.equal(result.accepted, false);
});

test('dil ve CC etiketi uyumlu yerel izi seçer', () => {
  const tracks = [
    { language: 'tr', label: 'Türkçe', cues: [{ start: 1, text: 'Yanlış' }] },
    { language: 'en', label: '1-CC1', cues: [{ start: 2, text: 'Correct' }] },
  ];
  assert.deepEqual(matchingReferenceCues(tracks,
    { language: 'en', label: '1-CC1', instreamId: 'CC1' }), [{ start: 2, text: 'Correct' }]);
});

console.log(`browser-cue-timeline-calibration: ${passed}/${passed} OK`);
