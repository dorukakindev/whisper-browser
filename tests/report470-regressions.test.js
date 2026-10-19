'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { auditSubtitlePair } = require('../src/subtitle-pair-quality');

test('an exact short subtitle is not a missing or extra translation', () => {
  const result = auditSubtitlePair([{ start: 1, end: 1.1, text: 'Yes.' }],
    [{ start: 1, end: 1.1, text: 'Evet.' }]);
  assert.equal(result.pass, true);
  assert.equal(result.coveredSourceCues, 1);
  assert.equal(result.coveredTargetCues, 1);
});

test('an empty merged target cannot pass without an exact timestamp match', () => {
  const result = auditSubtitlePair([
    { start: 0, end: 2, text: 'First sentence.' },
    { start: 2, end: 4, text: 'Second sentence.' },
  ], [{ start: 0, end: 4, text: ' \n ' }]);
  assert.equal(result.matchedCues, 0);
  assert.equal(result.pass, false);
  assert.equal(result.issues.emptyTarget.length, 1);
});

test('empty unmatched targets are reported once, even outside source coverage', () => {
  const result = auditSubtitlePair([{ start: 0, end: 2, text: 'Yes.' }], [
    { start: 0, end: 2, text: '' }, { start: 3, end: 4, text: '' },
  ]);
  assert.equal(result.issues.emptyTarget.length, 2);
  assert.equal(result.pass, false);
});

test('incidental short overlap is still missing and a nonempty merged target still passes', () => {
  assert.equal(auditSubtitlePair([{ start: 0, end: 1, text: 'One.' }],
    [{ start: .9, end: 2, text: 'Bir.' }]).pass, false);
  assert.equal(auditSubtitlePair([{ start: 0, end: 2, text: 'One.' },
    { start: 2, end: 4, text: 'Two.' }], [{ start: 0, end: 4, text: 'Bir. İki.' }]).pass, true);
});
