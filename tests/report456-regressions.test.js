'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { BrowserTranslationArchive } = require('../src/browser-translation-archive');
const { BrowserAssetStore, cuesToSrt, normalizeCues } = require('../src/browser-asset-store');
const { assembleCueSentences } = require('../src/browser-translation-scheduler');
function temporary(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r456-'));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const page = (name, translation = 'Merhaba') => ({ url: `https://example.test/${name}`, title: name,
  blocks: [{ id: '1', text: 'Hello.', tag: 'p' }], translations: new Map([['1', translation]]) });

test('failed archive index writes do not publish phantom entries in memory or a later save', () => temporary(root => {
  let fail = false;
  const archive = new BrowserTranslationArchive(root, { fsModule: { ...fs, renameSync(from, to) {
    if (fail && to === path.join(root, 'index.json')) throw Object.assign(new Error('fixture index failure'), { code: 'EIO' });
    fs.renameSync(from, to);
  } } });
  archive.savePage(page('first'));
  fail = true; assert.throws(() => archive.savePage(page('failed')), /fixture/);
  assert.equal(archive.hasPage('https://example.test/failed'), false);
  fail = false; archive.savePage(page('next'));
  assert.equal(new BrowserTranslationArchive(root).hasPage('https://example.test/failed'), false);
  assert.equal(archive.hasPage('https://example.test/first'), true);
}));

test('failed archive replacement leaves the old entry and its files usable', () => temporary(root => {
  let fail = false;
  const archive = new BrowserTranslationArchive(root, { fsModule: { ...fs, renameSync(from, to) {
    if (fail && to === path.join(root, 'index.json')) throw Object.assign(new Error('fixture index failure'), { code: 'EIO' });
    fs.renameSync(from, to);
  } } });
  const original = archive.savePage(page('same', 'Eski çeviri'));
  fail = true; assert.throws(() => archive.savePage(page('same', 'Yeni çeviri')), /fixture/);
  const found = archive.findPage({ url: 'https://example.test/same', blocks: page('same').blocks });
  assert.equal(found.matches[0].translation, 'Eski çeviri');
  assert.equal(found.path, original.path);
  assert(fs.existsSync(original.path));
}));

test('browser SRT output cannot contain cues collapsed to zero milliseconds', () => {
  const cues = [{ start: -2, end: -1, text: 'negative' }, { start: 1, end: 1, text: 'zero' },
    { start: 2, end: 2.0001, text: 'sub-millisecond' }, { start: 3, end: 4, text: 'valid' }];
  assert.deepEqual(normalizeCues(cues).map(cue => cue.text), ['valid']);
  assert.equal(cuesToSrt(cues), '1\r\n00:00:03,000 --> 00:00:04,000\r\nvalid\r\n');
});

test('translation planning excludes subtitle ranges that cannot be represented in SRT', () => {
  const sentences = assembleCueSentences([{ start: 0, end: 0, text: 'Untimed.' },
    { start: 1, end: 1.0001, text: 'Too short.' }, { start: 2, end: 3, text: 'Valid.' }]);
  assert.deepEqual(sentences.map(sentence => sentence.text), ['Valid.']);
});

test('derived SRT is restored from canonical asset JSON when content diverges', () => temporary(root => {
  const store = new BrowserAssetStore({ rootDir: root });
  const saved = store.putTrack({ mediaId: 'fixture', cues: [{ start: 0, end: 2, text: 'Canonical Türkçe' }] });
  assert.equal(saved.ok, true);
  fs.writeFileSync(saved.srtPath, 'unrelated stale subtitle', 'utf8');
  const loaded = store.getTrack(saved.assetId);
  assert.equal(loaded.ok, true);
  assert.equal(fs.readFileSync(loaded.srtPath, 'utf8'), '\uFEFF' + cuesToSrt(loaded.document.cues));
}));

test('failed derived SRT repair cleans temporary files and preserves canonical JSON', () => temporary(root => {
  let fail = false;
  const store = new BrowserAssetStore({ rootDir: root, fsModule: { ...fs, renameSync(from, to) {
    if (fail && to.endsWith('.srt')) throw Object.assign(new Error('fixture repair failure'), { code: 'EIO' });
    fs.renameSync(from, to);
  } } });
  const saved = store.putTrack({ mediaId: 'fixture', cues: [{ start: 0, end: 2, text: 'Canonical' }] });
  fs.unlinkSync(saved.srtPath); fail = true;
  assert.equal(store.getTrack(saved.assetId).ok, false);
  assert.equal(fs.readdirSync(path.dirname(saved.srtPath)).some(name => name.endsWith('.tmp')), false);
  fail = false; assert.equal(store.getTrack(saved.assetId).ok, true);
}));
