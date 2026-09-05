const assert = require('node:assert/strict');
const { BrowserTranslationScheduler } = require('../src/browser-translation-scheduler');

(async () => {
  let calls = 0;
  const states = [];
  const scheduler = new BrowserTranslationScheduler({
    paused: true,
    maxConcurrent: 1,
    translate: async () => {
      calls += 1;
      return JSON.stringify({ text: 'Çevrildi.' });
    },
    onState: (state) => states.push(state),
  });
  scheduler.setSentences([{
    id: 'sentence:1', start: 0, end: 1, text: 'Source.',
    pieces: [{ cueId: 'cue-1', start: 0, end: 1, text: 'Source.' }],
  }]);
  scheduler.completeAll();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 0, 'çevrimdışıyken sağlayıcı çağrılmamalı');
  assert.equal(scheduler.snapshot().queued.length, 1);
  assert.equal(states.at(-1).paused, true);

  scheduler.setPaused(false);
  await scheduler.whenIdle();
  assert.equal(calls, 1);
  assert.equal(scheduler.snapshot().completed, 1);
  assert.equal(states.at(-1).paused, false);

  console.log('Browser translation offline queue: no provider call while offline and automatic resume passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
