const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('function flushBrowserTrackPublication(');
const end = source.indexOf('function flushBrowserTrackPublications(', start);
assert(start >= 0 && end > start);

const initialTimer = { name: 'initial' };
const scheduled = [];
const cleared = [];
const published = [];
const activity = [];
const states = ['waiting', 'stable'];
const context = {
  browserTrackPublicationTimers: new Map([['stream-1', initialTimer]]),
  browserTrackPendingPublications: new Map([['stream-1', {
    fingerprint: 'fp-1', normalized: [{ text: 'Canlı metin' }], meta: {},
  }]]),
  browserTextStability: { observe: () => ({ state: states.shift() }) },
  clearTimeout: (timer) => cleared.push(timer),
  setTimeout: (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    scheduled.push(timer);
    return timer;
  },
  publishBrowserTrackNow: (entry) => { published.push(entry); return entry; },
  noteBrowserDiagnosticActivity: (_tab, key, message) => activity.push({ key, message }),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.equal(context.flushBrowserTrackPublication('stream-1'), null);
assert.deepEqual(cleared, [initialTimer], 'çalışmış timer kaydı temizlenmedi');
assert.equal(scheduled.length, 1, 'kararsız metin için yeni kontrol zamanlanmadı');
assert.equal(scheduled[0].delay, 650);
assert.equal(context.browserTrackPublicationTimers.get('stream-1'), scheduled[0]);
scheduled[0].callback();
assert.equal(published.length, 1, 'metin sabitlenince bekleyen iz yayımlanmadı');
assert.equal(activity.length, 1);
assert.equal(activity[0].key, 'lastCapture');
assert.match(activity[0].message, /1 altyazı satırı/);
assert.equal(context.browserTrackPendingPublications.has('stream-1'), false);
assert.equal(context.browserTrackPublicationTimers.has('stream-1'), false);

context.browserTrackPendingPublications.set('stream-2', {
  fingerprint: 'fp-2', normalized: [{ text: 'Kapanış metni' }], meta: {},
});
context.browserTrackPublicationTimers.set('stream-2', { name: 'closing' });
assert.ok(context.flushBrowserTrackPublication('stream-2', true));
assert.equal(published.length, 2, 'yaşam döngüsü flush işlemi bekleyen izi zorla yayımlamadı');
assert.equal(scheduled.length, 1, 'zorunlu flush yeni timer üretmemeli');

console.log('browser-track-publication: bekleme yeniden zamanlandı ve kararlı iz yayımlandı.');

// Reopening the same page must not inherit the evaluator's published marker.
const { TextStabilityEvaluator } = require('../src/text-stability-evaluator');
let clock = 0;
const output = [];
const evaluator = new TextStabilityEvaluator();
const replay = vm.createContext({
  browserTextStability: {
    observe: candidate => evaluator.observe(candidate, clock),
    clear: () => evaluator.clear(),
  },
  browserTrackBuffers: new Map(), browserTrackPublications: new Map(),
  browserTrackPendingPublications: new Map(), browserTrackPublicationTimers: new Map(),
  browserPendingResponses: new Map(), browserRequestRanges: new Map(),
  browserManifestTransactions: { reset() {} },
  normalizeCues: cues => cues, cueFingerprint: cues => cues.map(cue => cue.text).join('|'),
  browserTrackPublicationNeedsMetadataRefresh: () => false,
  trimInsertionCollection() {}, mergeBrowserStreamCues: (_previous, cues) => cues,
  isCurrentBrowserContext: context => context.generation === 2,
  browserTabById: () => ({}), activeBrowserTab: () => ({}),
  browserDiagnostics: null, clearTimeout() {},
  noteBrowserDiagnosticActivity() {},
  setTimeout: callback => ({ callback, unref() {} }),
  publishBrowserTrackNow: entry => {
    output.push(entry);
    replay.browserTrackPublications.set(entry.publicationKey, { fingerprint: entry.fingerprint });
    return entry;
  },
});
vm.runInContext(source.slice(start, end), replay);
const storeStart = source.indexOf('function storeBrowserTrack(');
const storeEnd = source.indexOf('// Doğrulanan adresi', storeStart);
vm.runInContext(source.slice(storeStart, storeEnd), replay);
const cue = [{ start: 0, end: 2, text: 'Same saved caption' }];
const meta = { streamKey: 'same-stream', context: { tabId: 'one', generation: 2 } };
replay.storeBrowserTrack(cue, meta);
clock = 700;
replay.flushBrowserTrackPublication(meta.streamKey);
assert.equal(output.length, 1);
const resetStart = source.indexOf('  browserPendingResponses.clear();', source.indexOf('function resetBrowserCaptureState('));
const resetEnd = source.indexOf('  browserManifestTransactions.reset();', resetStart);
vm.runInContext(source.slice(resetStart, resetEnd), replay);
replay.storeBrowserTrack(cue, meta);
clock = 1400;
replay.flushBrowserTrackPublication(meta.streamKey);
assert.equal(output.length, 2, 'reopened page must republish the same captions');
assert.equal(replay.storeBrowserTrack(cue, { ...meta, context: { generation: 1 } }), null);
assert.equal(output.length, 2);

const publishStart = source.indexOf('function publishBrowserTrackNow(');
const publishEnd = source.indexOf('function flushBrowserTrackPublication(', publishStart);
vm.runInContext(source.slice(publishStart, publishEnd), replay);
assert.equal(replay.publishBrowserTrackNow({
  normalized: cue, meta: { context: { generation: 1 } },
  publicationKey: 'old-stream', fingerprint: 'old'
}), null, 'stale deferred publication must stop before file access');
console.log('browser-track-publication: same-page replay and stale deferred publication passed');
