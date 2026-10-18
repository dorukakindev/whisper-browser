'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const vm = require('node:vm');
const { BrowserTranslationArchive, canonicalPageUrl } = require('../src/browser-translation-archive');
const { BrowserTranslationScheduler, assembleCueSentences } = require('../src/browser-translation-scheduler');
const { summarizeTranslationIntegrity } = require('../src/browser-translation-integrity');
const address = require('../src/browser-address-model');
const { parsePdfPageSelection } = require('../src/pdf-translate');

test('SPA routes retain separate archive content while sensitive hash queries and ordinary anchors are removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r467-archive-'));
  try {
    const archive = new BrowserTranslationArchive(root);
    const urls = ['https://example.test/#/watch/1', 'https://example.test/#/watch/2'];
    const saved = urls.map((url, i) => archive.savePage({ url, blocks: [{ id: 'a', text: 'Original.' }],
      translations: { a: `Çeviri ${i}` } }));
    assert.notEqual(saved[0].id, saved[1].id);
    assert.equal(archive.listPages().length, 2);
    const reopened = new BrowserTranslationArchive(root);
    for (const [index, url] of urls.entries()) {
      assert.equal(reopened.findPage({ url, blocks: [{ id: 'a', text: 'Original.' }] }).record.rows[0].translation,
        `Çeviri ${index}`);
    }
    assert.equal(canonicalPageUrl('https://example.test/#/watch/1?token=fixture&lang=tr'),
      'https://example.test/#/watch/1?lang=tr');
    assert.equal(canonicalPageUrl('https://example.test/#section'), 'https://example.test/');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('clean cached translation breaks a consecutive quality failure sequence', async () => {
  const sentences = assembleCueSentences([{ id: 'a', start: 0, end: 1, text: 'Rate 5%.' },
    { id: 'b', start: 2, end: 3, text: 'Hello.' }, { id: 'c', start: 4, end: 5, text: 'Rate 6%.' }]);
  let reads = 0;
  const scheduler = new BrowserTranslationScheduler({ maxConcurrent: 1, maxAttempts: 1, maxQualityAttempts: 1, requireSentenceParts: false,
    qualityBreakerThreshold: 2, context: { targetLanguage: 'tr', trackIdentity: 'fixture' },
    cache: { get: async () => ++reads === 2 ? JSON.stringify({ text: 'Merhaba.' }) : undefined, set() {} },
    translate: async sentence => ({ text: sentence.text.includes('5') ? 'Oran 5.' : 'Oran 6.' }) });
  scheduler.setSentences(sentences); scheduler.completeAll(); await scheduler.whenIdle();
  assert.equal(scheduler.qualityAutoLenient, false);
  assert.equal(scheduler.snapshot().completed, 1);
});

test('duplicate cue ids require individual timed coverage in result, file and displayed stages', () => {
  const sourceCues = [{ cueId: 'x', start: 0, end: 1 }, { cueId: 'x', start: 2, end: 3 }];
  const first = { cueId: 'x', start: 0, end: 1, text: 'Bir.' };
  const state = { total: 2, completed: 2 };
  const partial = summarizeTranslationIntegrity({ sourceCues, results: [first], state });
  assert.equal(partial.status, 'partial'); assert.equal(partial.translatedCues, 1); assert.equal(partial.missingCues, 1);
  const results = [first, { ...first, start: 2, end: 3 }];
  assert.equal(summarizeTranslationIntegrity({ sourceCues, results, state }).status, 'complete');
  assert.equal(summarizeTranslationIntegrity({ sourceCues, results, state, fileCueIds: ['x'] }).status, 'partial');
  assert.equal(summarizeTranslationIntegrity({ sourceCues, results, state, displayedCues: [first] }).status, 'partial');
  assert.equal(summarizeTranslationIntegrity({ sourceCues, state,
    results: [{ ...first, end: 3, coveredCueIds: ['x'] }] }).status, 'complete');
});

test('inline completion never overwrites a partially typed expansion of an ellipsis', () => {
  const items = [{ url: 'https://example.com/a…bc', title: 'Fixture' }];
  for (const query of ['example.com/a.', 'example.com/a..']) assert.equal(address.inlineCompletion(query, items), null);
  assert.equal(address.inlineCompletion('example.com/a...', items)?.prefix, 'example.com/a…');
  assert.equal(address.inlineCompletion('example.com/a...b', items)?.prefix, 'example.com/a…b');
});

test('PDF ranges need a finite positive known page count before expanding', () => {
  for (const pages of [0, NaN, Infinity, -1]) assert.equal(parsePdfPageSelection('1-12', pages), null);
  assert.deepEqual(parsePdfPageSelection('1-3', 3).pages, [1, 2, 3]);
  const helpers = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer-helpers.js'), 'utf8').replace(/\r\n/g, '\n');
  const copy = helpers.match(/function parsePdfPageSelectionInput\(input, numPages\) \{[\s\S]*?\n\}/)[0];
  const renderer = vm.runInNewContext(`(${copy})`);
  assert.equal(renderer('1-9999999', 0), null);
  assert.equal(renderer('1-9999999', Infinity), null);
});
