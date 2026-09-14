'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBrowserSeriesContext } = require('../src/browser-series-context');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-series-'));
try {
  const filePath = path.join(directory, 'series.json');
  const store = createBrowserSeriesContext({ filePath });
  const episode1 = 'https://show.example|episode-1';
  const episode2 = 'https://show.example|episode-2';
  assert.equal(store.get(episode1), null);
  store.bind(episode1, 'Kuzey', 'https://show.example/watch/1');
  store.save(episode1, { synopsis: 'Yalnız kullanıcının verdiği bilgi.', addressStyle: 'Resmî hitap',
    terms: [{ source: 'Captain', target: 'Kaptan' }, { source: 'captain', target: 'Kaptan' }] });
  store.bind(episode2, 'Kuzey', 'https://show.example/watch/2');
  assert.equal(store.translationContext(episode2).synopsis, 'Yalnız kullanıcının verdiği bilgi.');
  assert.deepEqual(store.translationContext(episode2).terms, [{ source: 'Captain', target: 'Kaptan' }]);
  const check = store.check(episode2, { cues: [{ start: 0, end: 2, text: 'Captain, wait.' },
    { start: 3, end: 5, text: 'Captain, go.' }], translations: [
    { start: 0, end: 2, text: 'Kaptan, bekleyin.' }, { start: 3, end: 5, text: 'Bekleyin.' },
  ] });
  assert.equal(check.issues.length, 1);
  assert.equal(check.issues[0].index, 1);
  assert.equal(check.checked, 2);
  assert.equal(store.get(episode2).profile.terms[0].target, 'Kaptan');
  const split = store.check(episode2, { cues: [{ start: 0, end: 4, text: 'Captain, wait.' }],
    translations: [{ start: 0, end: 2, text: 'Kaptan,' }, { start: 2, end: 4, text: 'bekleyin.' }] });
  assert.equal(split.checked, 1);
  assert.equal(split.issues.length, 0, 'Terim önceki çeviri bloğunda da aranmalı');
  const long = store.check(episode2, { cues: [{ start: 50, end: 52, text: 'Captain' }],
    translations: [{ start: 0, end: 60, text: 'Kaptan' },
      ...Array.from({ length: 12 }, (_, i) => ({ start: i + 1, end: i + 2, text: 'Kısa blok' }))] });
  assert.equal(long.checked, 1, 'Sekiz satırdan önce başlayan örtüşen blok kaybolmamalı');
  assert.equal(long.issues.length, 0);
  const otherSite = 'https://other.example|episode-1';
  store.bind(otherSite, 'Kuzey', 'https://other.example/watch/1');
  assert.equal(store.translationContext(otherSite).terms.length, 0);
  assert.throws(() => store.bind('https://wrong.example|episode', 'Kuzey', 'https://show.example'), /uyuşmuyor/);
  assert.throws(() => store.save(episode2, { terms: 'bad' }), /liste/);
  const untouched = 'https://show.example|episode-3';
  assert.throws(() => store.bindAndSave(untouched, 'Kuzey', 'https://show.example', { terms: 'bad' }), /liste/);
  assert.equal(store.get(untouched), null);
  const bound = store.bindAndSave(untouched, 'Kuzey', 'https://show.example', { terms: [{ source: 'Doctor', target: 'Doktor' }] });
  assert.equal(bound.profile.terms[0].target, 'Doktor');
  assert.equal(createBrowserSeriesContext({ filePath }).translationContext(episode1).terms[0].target, 'Doktor');
  const corruptedPath = path.join(directory, 'corrupted.json');
  fs.writeFileSync(corruptedPath, '{not-json');
  assert.throws(() => createBrowserSeriesContext({ filePath: corruptedPath }).get(episode1), /korunuyor/);
  assert.equal(fs.readFileSync(corruptedPath, 'utf8'), '{not-json');
  console.log('browser-series-context: persistence, scope and review checks passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
