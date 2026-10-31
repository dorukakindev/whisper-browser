'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { fixture } = require('./helpers/book-flow-fixture');
const { voiceStorage } = require('../src/voice-storage');
const { exportBooks, importBooks } = require('../src/book-project-backup');
const tick = () => new Promise(setImmediate);
const defer = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function projectFile(f) { return path.join(voiceStorage({ getPath: () => f.root }).input, 'Kitap projeleri', f.id, 'project.json'); }
for (const stage of ['picker', 'encoding']) test(`changed source WAV during ${stage} cannot publish an M4B under old chapter metadata`, async t => {
  let source, encoded = 0;
  const changeSource = () => { const bytes = fs.readFileSync(source); bytes[44] ^= 1; fs.writeFileSync(source, bytes); };
  const f = await fixture(t, {
    dialog: { showSaveDialog: async () => { if (stage === 'picker') changeSource(); return { filePath: f.target }; } },
    runTool: async (tool, args) => {
      if (tool === 'probe') return '2';
      encoded++; if (stage === 'encoding') changeSource();
      fs.writeFileSync(args.at(-1), 'encoded changed source'); return '';
    },
  });
  const p = JSON.parse(fs.readFileSync(projectFile(f)));
  source = p.chapters[0].output;
  const before = fs.readFileSync(projectFile(f));
  const result = await f.call('book-export', { id: f.id, chapters: [0] });
  assert.equal(result.ok, false);
  assert.match(result.error, /audio changed|source.*changed/i);
  assert.equal(encoded, stage === 'picker' ? 0 : 1);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'keep original');
  assert.deepEqual(fs.readFileSync(projectFile(f)), before);
});
test('an already registered audiobook remains available after failed replacement manifest commit', async t => {
  let encoding = 0;
  const f = await fixture(t, { runTool: async (tool, args) => {
    if (tool === 'probe') return '2';
    fs.writeFileSync(args.at(-1), 'distinct audiobook version ' + (++encoding)); return '';
  } });
  assert.equal((await f.call('book-export', { id: f.id, chapters: [0] })).ok, true);
  const before = fs.readFileSync(projectFile(f)), audio = fs.readFileSync(f.target);
  const rename = fs.renameSync;
  fs.renameSync = function(from, to, ...args) {
    if (path.resolve(String(to)) === projectFile(f)) throw Object.assign(Error('manifest unavailable'), { code: 'EIO' });
    return rename.call(this, from, to, ...args);
  };
  try { assert.equal((await f.call('book-export', { id: f.id, chapters: [0, 1] })).ok, false); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(projectFile(f)), before);
  assert.deepEqual(fs.readFileSync(f.target), audio);
  assert.equal((await f.call('book-audiobook', { id: f.id })).available, true);
});
test('cancel during encoding preserves output/reference and permits retry; edited text cannot reuse old review/playback tokens', async t => {
  const entered = defer(), release = defer(); let holding = true;
  const f = await fixture(t, { runTool: async (tool, args, _input, signal) => {
    if (tool === 'probe') return '2';
    if (holding) { entered.resolve(); await release.promise; }
    if (signal.aborted) throw Error('controlled encoder abort');
    fs.writeFileSync(args.at(-1), 'encoded fixture'); return '';
  } });
  const file = projectFile(f), before = fs.readFileSync(file);
  const pending = f.call('book-export', { id: f.id, chapters: [0] });
  await entered.promise; assert.equal((await f.call('cancel')).ok, true);
  holding = false; release.resolve(); assert.equal((await pending).ok, false);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'keep original');
  assert.equal((await f.call('book-export', { id: f.id, chapters: [0] })).ok, true);
  const c = (await f.call('book-open', { id: f.id })).project.chapters[0];
  assert.equal((await f.call('book-save', { id: f.id, chapter: 0, text: 'New draft that requires new audio.' })).ok, true);
  for (const action of ['book-listen', 'book-approve', 'book-progress']) {
    const result = await f.call(action, { id: f.id, chapter: 0, outputId: c.output, textHash: c.textHash, key: c.groups[0].key, position: 1 });
    assert.equal(result.ok, false, action);
  }
  assert.equal((await f.call('book-readiness', { id: f.id, chapters: [0] })).ready, false);
  fs.appendFileSync(path.join(f.root, 'book.pdf'), ' changed source');
  assert.equal((await f.call('book-pdf', { id: f.id })).ok, false);
});
for (const existing of [true, false]) for (const afterRename of [false, true]) test(`M4B manifest-save failure rolls back publication (existing=${existing}, afterRename=${afterRename}) and retry works`, async t => {
  const f = await fixture(t);
  if (!existing) fs.unlinkSync(f.target);
  const file = projectFile(f), original = fs.readFileSync(file);
  const rename = fs.renameSync;
  let faulted = false;
  fs.renameSync = function(from, to, ...args) {
    if (path.resolve(String(to)) === file && !faulted) {
      faulted = true;
      if (afterRename) rename.call(this, from, to, ...args);
      throw Object.assign(Error('controlled manifest save failure'), { code: 'EIO' });
    }
    return rename.call(this, from, to, ...args);
  };
  let result;
  try { result = await f.call('book-export', { id: f.id, chapters: [0] }); }
  finally { fs.renameSync = rename; }
  assert.equal(result.ok, false);
  assert.deepEqual(fs.readFileSync(file), original);
  if (existing) assert.equal(fs.readFileSync(f.target, 'utf8'), 'keep original');
  else assert.equal(fs.existsSync(f.target), false);
  const retry = await f.call('book-export', { id: f.id, chapters: [0] });
  assert.equal(retry.ok, true, retry.error);
  const reopened = await f.call('book-open', { id: f.id });
  assert.equal(reopened.project.audiobook.chapters.length, 1);
  assert.equal((await f.call('book-audiobook', { id: f.id })).available, true);
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.audiobook-')), false);
});
test('portable book export rejects stale text/audio before replacing an existing package; text-only retry preserves edits', async t => {
  const f = await fixture(t), books = path.dirname(path.dirname(projectFile(f)));
  const backup = path.join(f.root, 'books.wbb');
  exportBooks(books, backup, true);
  const previous = fs.readFileSync(backup);
  const edited = 'Edited chapter after speech was generated.';
  assert.equal((await f.call('book-save', { id: f.id, chapter: 0, text: edited })).ok, true);
  assert.throws(() => exportBooks(books, backup, true), /text changed|current.*audio/i);
  assert.deepEqual(fs.readFileSync(backup), previous);
  exportBooks(books, backup, false);
  const restored = path.join(f.root, 'restored');
  assert.equal(importBooks(restored, backup).count, 1);
  const row = JSON.parse(fs.readFileSync(path.join(restored, fs.readdirSync(restored)[0], 'project.json')));
  assert.equal(row.chapters[0].text, edited);
  assert.equal(row.chapters[0].output, null);
  assert.equal(row.chapters[0].status, 'pending');
});
for (const stage of ['import', 'production', 'listen', 'closed']) test(`PDF narration respects content/view ownership during ${stage} and retries current text`, async t => {
  const dom = new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'), 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, $ = id => w.document.getElementById(id), gate = defer(), calls = [], opened = [];
  w.HTMLMediaElement.prototype.pause = w.HTMLMediaElement.prototype.load = function() {};
  const reader = { pdfHash: 'fixture', currentPage: 1, pdf: { numPages: 1 }, pages: new Map(), state: { pages: { '1': [{ source: 'Source', translation: 'Old translation' }] } } };
  let hold = true, focus;
  Object.assign(w, { player: { pdfReader: reader }, UiLocale: { get: () => 'en' },
    extractPdfReaderPage: async () => [{ source: 'Source' }],
    api: { mediaWorkflows: async args => { calls.push(args); if (['import', 'closed'].includes(stage) && hold) await gate.promise; return { ok: true, project: { id: 'project-' + calls.length } }; } },
    MediaWorkflowsUI: { openProject: async (id, options) => { opened.push(id); focus = options; if (stage === 'production' && hold) await gate.promise; } },
  });
  w.eval(fs.readFileSync(require.resolve('../src/renderer/pdf-reader-experience.js'), 'utf8'));
  w.PdfReaderExperience.opened();
  $('pdfVoiceFrom').value = $('pdfVoiceTo').value = '1'; $('pdfVoiceText').value = 'translation';
  const pending = $('pdfVoicePrepare').onclick(); await tick();
  if (stage === 'closed') {
    w.PdfReaderExperience.closed(); $('pdfVoiceStatus').textContent = 'New view owns this status';
    hold = false; gate.resolve(); await pending;
    assert.equal(opened.length, 0);
    assert.equal($('pdfVoiceStatus').textContent, 'New view owns this status');
    assert.equal($('pdfVoicePrepare').disabled, false);
    w.PdfReaderExperience.opened();
    $('pdfVoiceFrom').value = $('pdfVoiceTo').value = '1'; $('pdfVoiceText').value = 'translation';
    await $('pdfVoicePrepare').onclick();
    assert.equal($('pdfVoiceListen').disabled, false);
    return;
  }
  if (stage === 'listen') await pending;
  reader.state.pages['1'][0].userText = 'Edited translation while opening production';
  if (stage === 'listen') {
    const count = calls.length;
    await $('pdfVoiceListen').onclick();
    assert.equal(calls.length, count, 'stale narration must not request old project audio');
  }
  if (focus) assert.equal(focus.isCurrent(), false);
  hold = false; gate.resolve(); await pending;
  assert.equal($('pdfVoiceListen').disabled, true);
  assert.match($('pdfVoiceStatus').textContent, /text.*changed|content.*changed/i);
  if (stage === 'import') assert.equal(opened.length, 0);
  await $('pdfVoicePrepare').onclick();
  assert.equal(calls.at(-1).pages[0].text, 'Edited translation while opening production');
  assert.equal($('pdfVoiceListen').disabled, false);
});
