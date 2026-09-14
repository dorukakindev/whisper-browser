const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const api = require('../src/browser-skip-segments');

const intro = { id: 'intro-1', scope: 'series', scopeKey: 'show-a', kind: 'intro',
  start: 12, end: 48 };
assert.deepEqual(api.normalizeRecord(intro), { ...intro, autoSkip: false });
assert.equal(api.normalizeRecord({ ...intro, end: 12 }), null);
assert.equal(api.normalizeRecord({ ...intro, scope: 'site' }), null);
assert.equal(api.normalizeRecord({ ...intro, start: -1 }), null);
assert.equal(api.normalizeRecord({ ...intro, end: Infinity }), null);
assert.equal(api.normalizeRecord({ ...intro, kind: 'outro' }), null);

const added = api.upsertRecord([], intro);
assert.equal(added.changed, true);
assert.equal(added.records.length, 1);
assert.equal(api.upsertRecord(added.records, { ...intro, end: 52 }).records.length, 1);
assert.equal(api.removeRecord(added.records, intro.id).records.length, 0);

const matching = { currentTime: 20, mediaKey: 'episode-2', seriesKey: 'show-a', playing: true };
let decision = api.decideSkip(added.records, matching);
assert.equal(decision.candidate.id, intro.id);
assert.equal(decision.shouldSkip, false);
assert.equal(api.decideSkip(added.records, { ...matching, seriesKey: 'show-b' }).candidate, null);

const enabled = [{ ...intro, autoSkip: true }];
decision = api.decideSkip(enabled, matching);
assert.equal(decision.shouldSkip, true);
assert.equal(api.decideSkip(enabled, { ...matching, currentTime: 21 }, decision.state).shouldSkip, false);
decision = api.decideSkip(enabled, { ...matching, currentTime: 70 }, decision.state);
decision = api.decideSkip(enabled, { ...matching, currentTime: 20 }, decision.state);
assert.equal(decision.shouldSkip, false, 'geriye kullanıcı seek işlemi otomatik atlanmamalı');
assert.equal(api.decideSkip(enabled, { ...matching, currentTime: 21 }, decision.state).shouldSkip, false);
assert.equal(api.decideSkip(enabled, { ...matching, currentTime: 20, playing: false }).shouldSkip, false);

const source = fs.readFileSync(path.join(__dirname, '../src/browser-skip-segments.js'), 'utf8');
const browser = { globalThis: {} };
vm.runInNewContext(source, browser);
assert.equal(typeof browser.globalThis.WhisperBrowserSkipSegments.decideSkip, 'function');
console.log('browser-skip-segments: ok');
