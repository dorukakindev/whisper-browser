'use strict';

const assert = require('assert');
const { summarizeTranslationIntegrity } = require('../src/browser-translation-integrity');

const sourceCues = [
  { id: 'a', text: 'Bir' }, { id: 'b', text: 'İki' }, { id: 'c', text: 'Üç' },
];

const partial = summarizeTranslationIntegrity({
  sourceCues,
  results: new Map([['a', { cueId: 'a', text: 'One' }]]),
  state: { total: 2, completed: 1, queued: [], pending: [], failures: [{ sentenceId: 's2' }] },
});
assert.equal(partial.status, 'partial');
assert.equal(partial.reason, 'provider-failure');
assert.equal(partial.sourceCues, 3);
assert.equal(partial.translatedCues, 1);
assert.deepEqual(partial.missingCueIds, ['b', 'c']);

const running = summarizeTranslationIntegrity({
  sourceCues, results: [{ cueId: 'a' }],
  state: { total: 2, completed: 1, queued: ['s2'], pending: [], failures: [] },
});
assert.equal(running.status, 'running');
assert.equal(running.submittedSentences, 1);

const complete = summarizeTranslationIntegrity({
  sourceCues, results: sourceCues.map((cue) => ({ cueId: cue.id })),
  state: { total: 2, completed: 2, queued: [], pending: [], failures: [] },
});
assert.equal(complete.status, 'complete');
assert.equal(complete.missingCues, 0);

console.log('browser-translation-integrity: 3 test geçti');
