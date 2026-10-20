const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const diff = require('../src/translation-diff');
const { assembleCueSentences, BrowserTranslationScheduler } = require('../src/browser-translation-scheduler');
const { summarizeTranslationIntegrity } = require('../src/browser-translation-integrity');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');
const turn = () => new Promise(resolve => setImmediate(resolve));
const cue = (id, text, start = 0, end = 2) => ({ id, text, start, end });

test('492-01: second-pass English joins respect protected dialogue and invalid-cue barriers', () => {
  for (const middle of [null, { id: 'invalid', start: 1, end: 1, text: 'missing' }]) {
    const rows = [cue('a', 'A place.', 0, 1), ...(middle ? [middle] : []),
      { ...cue('b', 'Where we meet.', 1.1, 2), ...(middle ? {} : { protected: true }) }];
    assert.equal(assembleCueSentences(rows, { joinEnglishFragments: true }).length, 2);
  }
});

test('492-02: an aborted provider success cannot reset the new session quality breaker', async () => {
  let release;
  const scheduler = new BrowserTranslationScheduler({ translate: () => new Promise(resolve => { release = resolve; }) });
  scheduler.setSentences(assembleCueSentences([cue('a', 'Hello.')]));
  scheduler.completeAll(); await turn();
  scheduler.cancelAll();
  scheduler.consecutiveQualityFailures = 3;
  release('Merhaba.'); await turn(); await turn();
  assert.equal(scheduler.consecutiveQualityFailures, 3);
  assert.equal(scheduler.results.size, 0);
});

test('492-03: parallel anonymous cues match distinct previous dialogue rows', () => {
  const before = [{ start: 0, end: 2, text: 'A' }, { start: 0, end: 2, text: 'B' }];
  const after = [before[0], { ...before[1], text: 'Yeni B' }];
  const review = diff.fullTranslationDiff(before, after);
  assert.equal(review.missing.length, 0);
  assert.equal(review.changed[0].before, 'B');
  assert.equal(diff.diffTranslationCues(before, after)[0].before, 'B');
});

test('492-04: a deleted speaker can be restored alongside a simultaneous surviving speaker', () => {
  const before = [cue('a', 'A'), cue('b', 'B')];
  const after = [before[0]];
  const review = diff.fullTranslationDiff(before, after);
  assert.equal(diff.reviewStillApplies(after, review, [], [0], []), true);
  const restored = diff.applyReviewChoice(after, review, [], [0], []);
  assert.deepEqual(restored.map(c => c.id), ['a', 'b']);
  assert.equal(diff.reviewStillApplies(restored, review, [], [0], []), false);
});

test('492-05: review choices cannot modify a replacement cue with different identity', () => {
  const before = [cue('a', 'Old')], after = [cue('a', 'New')];
  const review = diff.fullTranslationDiff(before, after);
  const replacement = [cue('b', 'New')];
  assert.equal(diff.reviewStillApplies(replacement, review, [0], [], []), false);
  const changes = diff.diffTranslationCues(before, after);
  assert.equal(diff.selectedChangesStillMatch(replacement, changes, [0]), false);
  const addition = diff.fullTranslationDiff([], after);
  assert.equal(diff.reviewStillApplies(replacement, addition, [], [], [0]), false);
});

test('492-06: review does not hide changes to literal comparison text', () => {
  assert.equal(diff.diffTranslationCues([cue('a', 'x < 5 > y')], [cue('a', 'x < 9 > y')]).length, 1);
  assert.equal(diff.diffTranslationCues([cue('a', '<i>Hello</i>')], [cue('a', 'Hello')]).length, 0);
});

test('492-07: a foreign explicit cue identity cannot claim coverage through matching timestamps', () => {
  const result = summarizeTranslationIntegrity({
    sourceCues: [cue('a', 'Source')], results: [{ ...cue('foreign', 'Wrong'), cueId: 'foreign' }],
    state: { total: 1, completed: 1 }
  });
  assert.equal(result.translatedCues, 0);
  assert.equal(result.status, 'partial');
});

test('492-08: a torn journal tail cannot swallow the first subsequent translation write', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-492-'));
  const file = path.join(dir, 'cache.json');
  let cache;
  try {
    const now = Date.now();
    fs.writeFileSync(file, JSON.stringify({ version: 2, entries: [['old', { value: 'Eski', updatedAt: now }]] }));
    fs.writeFileSync(file + '.journal', JSON.stringify({ k: 'old', v: 'Eski', t: now }) + '\n{"k":"torn"');
    cache = new PersistentTranslationCache(file);
    cache.set('new', 'Yeni'); await cache.flush();
    const reloaded = new PersistentTranslationCache(file);
    assert.equal(reloaded.get('new'), 'Yeni');
    clearTimeout(reloaded.timer);
  } finally { clearTimeout(cache?.timer); fs.rmSync(dir, { recursive: true, force: true }); }
});

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
function section(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from);
  assert(from >= 0 && to > from); return main.slice(from, to);
}
test('492-09: PDF paragraph neighbors use the production single-cue request contract', async () => {
  let sent = 0;
  const sandbox = { require: name => name.startsWith('./') ? require('../src/' + name.slice(2)) : require(name),
    AbortController, setTimeout, clearTimeout, Buffer, URL, console,
    safeTranslationEndpoint: () => 'http://localhost/v1/chat/completions',
    terminologyPrompt: () => '', browserGlossaryTruncationNotified: false,
    readJsonResponseLimited: async () => ({ choices: [{ message: { content: 'Merhaba.' } }] }),
    fetch: async (_, options) => { sent++; const body = JSON.parse(options.body);
      const input = JSON.parse(body.messages.at(-1).content);
      assert.deepEqual(input.onceki, ['Previous paragraph']);
      assert.deepEqual(input.sonraki, ['Next paragraph']);
      return { ok: true }; }
  };
  vm.createContext(sandbox);
  vm.runInContext(section('async function requestBrowserSentenceTranslationAtEndpoint(', 'async function requestBrowserSentenceTranslation('), sandbox);
  const result = await sandbox.requestBrowserSentenceTranslationAtEndpoint({
    text: 'Hello.', pieces: [{ text: 'Hello.', start: 0, end: 1 }],
    contextBefore: 'Previous paragraph', contextAfter: 'Next paragraph'
  }, { targetLanguage: 'tr', glossary: [], model: 'fixture', register: 'neutral', profanity: 'keep' }, null, 'http://localhost');
  assert.equal(sent, 1); assert(result);
});

test('492-10: PDF caches distinguish provider and document identity', async () => {
  const contexts = [];
  class Scheduler {
    constructor(options) { contexts.push(options.context); }
    setSentences() {} completeAll() {} whenIdle() { return Promise.resolve(); }
  }
  const sandbox = { BrowserTranslationScheduler: Scheduler, browserTranslationCache: () => new Map(),
    createHash: crypto.createHash, safeTranslationEndpoint: value => value };
  vm.createContext(sandbox);
  vm.runInContext(section('async function translatePdfPageBlocks(', 'function mangaJobIsCurrent('), sandbox);
  const job = () => ({ schedulers: new Set(), controller: new AbortController() });
  for (const endpoint of ['https://one.example/v1', 'https://two.example/v1']) {
    await sandbox.translatePdfPageBlocks({ pdfHash: 'document-a' }, { pageNumber: 1, blocks: [{ id: 'a', source: 'Hello' }] },
      { endpoint, model: 'same-model', glossary: [], targetLanguage: 'tr' }, job());
  }
  const sentence = assembleCueSentences([cue('a', 'Hello')])[0];
  const { translationCacheKey } = require('../src/browser-translation-scheduler');
  assert.notEqual(translationCacheKey(sentence, contexts[0]), translationCacheKey(sentence, contexts[1]));
  assert.equal(contexts[0].mediaIdentity, 'pdf:document-a');
});

const subtitles = require('../src/browser-subtitles');
test('492-11: captured YouTube translated tracks use the target language', () => {
  assert.equal(subtitles.subtitleLanguage({ url: 'https://www.youtube.com/api/timedtext?lang=en&tlang=tr' }), 'tr');
  assert.equal(subtitles.subtitleLanguage({ url: 'https://site.example/sub?lang=de&hl=en' }), 'de');
});

test('492-12: a failed stop attempt allows the user to retry stopping the same live process', () => {
  const { terminateProcessTree } = require('../src/process-lifecycle');
  let calls = 0;
  const child = { pid: 1, exitCode: null, signalCode: null, kill() { calls++; return false; } };
  const options = { platform: 'linux', killFn() { throw Error('not a process group'); } };
  terminateProcessTree(child, options);
  assert.equal(terminateProcessTree(child, options), true);
  assert.equal(calls, 2);
  assert.equal(child.exitCode, null);
});

test('492-13: WebVTT comments containing timestamps do not become spoken subtitles', () => {
  const text = 'WEBVTT\n\nNOTE diagnostic example\n00:00:01.000 --> 00:00:02.000\nDo not translate this comment\n\n00:00:03.000 --> 00:00:05.000\nReal dialogue\n';
  assert.deepEqual(subtitles.parseTimedBlocks(text).map(c => c.text), ['Real dialogue']);
});

test('492-14: Persian/Arabic joining marks retain the same meaning when encoded as entities', () => {
  for (const [entity, mark] of [['&#8204;', '\u200c'], ['&#8205;', '\u200d'], ['&#8206;', '\u200e'], ['&#8207;', '\u200f']]) {
    assert.equal(subtitles.cleanCueText('می' + entity + 'روم'), 'می' + mark + 'روم');
  }
  assert.equal(subtitles.cleanCueText('a&#8238;b'), 'ab');
});

test('492-15: namespaced TTML formatting does not leak XML tags into dialogue', () => {
  const xml = '<tt:tt xmlns:tt="http://www.w3.org/ns/ttml"><tt:body><tt:div><tt:p begin="1s" end="3s"><tt:span>Hello</tt:span><tt:br/>World</tt:p></tt:div></tt:body></tt:tt>';
  assert.equal(subtitles.parseSubtitlePayload(xml).cues[0].text, 'Hello\nWorld');
});

test('492-16: ASS actor names preserve simultaneous identical lines from different speakers', () => {
  const ass = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    + 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,Alice,0,0,0,,Yes.\n'
    + 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,Bob,0,0,0,,Yes.';
  const rows = subtitles.parseAss(ass);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(c => c.speaker), ['Alice', 'Bob']);
});

test('492-17: deep remote TTML style inheritance cannot overflow the main process stack', () => {
  const styles = Array.from({ length: 9000 }, (_, i) => '<style xml:id="s' + i + '" style="s' + (i+1) + '"/>').join('');
  const xml = '<tt><head><styling>' + styles + '</styling></head><body><div><p begin="1s" end="3s" style="s0">Hello</p></div></body></tt>';
  assert.equal(subtitles.parseSubtitlePayload(xml).cues[0].text, 'Hello');
});

test('492-18: queued but undispatched sentences remain deferred after a provider outage', async () => {
  const scheduler = new BrowserTranslationScheduler({ maxConcurrent: 1, maxAttempts: 1, providerFailureThreshold: 2,
    translate: async () => { throw Object.assign(Error('Overload'), { httpStatus: 503 }); } });
  scheduler.setSentences(assembleCueSentences(Array.from({ length: 4 }, (_, i) => cue('s'+i, 'Hello.', i*3, i*3+1))));
  scheduler.updatePlayhead(0); await scheduler.whenIdle();
  const failures = scheduler.snapshot().failures;
  assert.equal(failures.length, 4);
  assert.equal(failures.filter(f => f.deferred).length, 2);
  scheduler.updatePlayhead(1000);
  assert.equal(scheduler.retryFailed(), 2);
  scheduler.cancelAll();
});

test('492-19: manual recovery resets the definitive failure breaker too', async () => {
  let calls = 0;
  const scheduler = new BrowserTranslationScheduler({ maxConcurrent: 1, maxAttempts: 1, providerFailureThreshold: 2,
    translate: async () => { if (++calls <= 3) throw Object.assign(Error('Protocol rejected'), { definitive: true });
      return 'Merhaba.'; } });
  scheduler.setSentences(assembleCueSentences([cue('a', 'Hello.', 0, 1), cue('b', 'World.', 3, 4)]));
  scheduler.completeAll(); await scheduler.whenIdle();
  scheduler.retryFailed(); await scheduler.whenIdle();
  assert.equal(scheduler.results.size, 1);
  assert.equal(calls, 4);
});

test('492-20: reconnect cannot automatically retry a definitively unavailable provider/model', async () => {
  let calls = 0;
  const scheduler = new BrowserTranslationScheduler({ translate: async () => {
    calls++; throw Object.assign(Error('Model not available'), { providerUnavailable: true, retryable: false });
  } });
  scheduler.setSentences(assembleCueSentences([cue('a', 'Hello.')]));
  scheduler.completeAll(); await scheduler.whenIdle();
  assert.equal(scheduler.retryFailed({ onlyTransient: true }), 0);
  await scheduler.whenIdle(); assert.equal(calls, 1);
  scheduler.cancelAll();
});
