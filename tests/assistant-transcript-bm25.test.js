'use strict';
// Transcript evidence ranking: English function words, plural folding, substring noise,
// Turkish inflection, spoiler scope and playhead grounding. Pure module, no Electron.
const test = require('node:test'), assert = require('node:assert/strict');
const { buildTranscriptEvidence, transcriptTokens } = require('../src/browser-transcript-search');

const bridge = () => [
  { start: 0, end: 4, text: 'Welcome back, today we talk about the history of the bridge.' },
  { start: 5, end: 9, text: 'The other engineers thought that the design was impossible.' },
  { start: 10, end: 14, text: 'Another team brought their own theory about the cables.' },
  { start: 300, end: 304, text: 'Finally the cable tension failed during the storm in 1940.' },
  { start: 305, end: 309, text: 'Rebuilding took seven years and cost eleven million.' },
  ...Array.from({ length: 40 }, (_, i) => ({ start: 20 + i * 5, end: 24 + i * 5, text: `This is the filler sentence number ${i} about the weather and the other things.` })),
];
const ids = (r) => r.evidence.map((e) => e.metin);

test('English function words are not query terms, but an all-stopword question keeps a fallback', () => {
  assert.deepEqual(transcriptTokens('what did the other engineers think about the cables'), ['engineers', 'think', 'cables']);
  assert.ok(transcriptTokens('what is this').length > 0);
});

test('plural and singular forms match and filler cues no longer flood the evidence', () => {
  const r = buildTranscriptEvidence(bridge(), 'what did the other engineers think about the cables', { scope: 'full', position: 0, limit: 8 });
  assert.ok(ids(r).some((t) => t.includes('cable tension failed')), 'singular "cable" cue must be retrieved for "cables"');
  assert.equal(ids(r).filter((t) => t.startsWith('This is the filler')).length, 0);
});

test('a term contained inside another word does not score', () => {
  const cues = Array.from({ length: 40 }, (_, i) => ({ start: 100 + i * 10, end: 104 + i * 10, text: `Plain dialogue line ${i}` }));
  cues[0] = { start: 0, end: 4, text: 'The party started early' };
  const r = buildTranscriptEvidence(cues, 'art', { scope: 'full', position: 480, limit: 12 });
  assert.ok(!ids(r).some((t) => t.includes('party')));
});

test('Turkish inflected forms still match a stem written by the user', () => {
  const cues = Array.from({ length: 30 }, (_, i) => ({ start: i * 20, end: i * 20 + 4, text: `Sıradan konuşma ${i}`.replace('konuşma', 'diyalog') }));
  cues[3] = { start: 60, end: 64, text: 'Başkanın konuşmasını dinledik' };
  const r = buildTranscriptEvidence(cues, 'konuşma', { scope: 'full', position: 500, limit: 12 });
  assert.ok(ids(r).some((t) => t.includes('konuşmasını')));
});

test('watched scope never returns cues after the playhead', () => {
  const r = buildTranscriptEvidence(bridge(), 'cable tension', { scope: 'watched', position: 30, limit: 12 });
  assert.ok(!r.evidence.some((e) => e.baslangic > 30.75));
});

test('the cues nearest the playhead stay in the evidence for deictic questions', () => {
  const r = buildTranscriptEvidence(bridge(), 'cables', { scope: 'full', position: 100, limit: 12 });
  assert.ok(r.evidence.some((e) => e.baslangic >= 95 && e.baslangic <= 105));
});

test('dense lexical hits cannot evict playhead context at the smallest budget', () => {
  const cues = Array.from({ length: 40 }, (_, i) => ({ start: i * 10, end: i * 10 + 4, text: i < 20 ? 'cable tension failure' : 'Unrelated dialogue' }));
  const r = buildTranscriptEvidence(cues, 'cable tension failure', { scope: 'full', position: 380, limit: 6 });
  assert.equal(r.evidence.length, 6);
  assert.ok(r.evidence.some(e => e.baslangic === 380), 'current context has a reserved slot');
  assert.ok(r.evidence.some(e => e.metin === 'cable tension failure'), 'lexical evidence is still present');
});

test('nearby scope and distributed summaries remain within their declared bounds', () => {
  const cues = Array.from({ length: 80 }, (_, i) => ({ start: i * 10, end: i * 10 + 4, text: `Cable tension line ${i}` }));
  const r = buildTranscriptEvidence(cues, 'cables', { scope: 'nearby', position: 400, limit: 6 });
  assert.ok(r.evidence.every(e => Math.abs(e.baslangic - 400) <= 180));
  const summary = buildTranscriptEvidence(cues, 'whole video summary', { scope: 'watched', position: 400, limit: 6 });
  assert.equal(summary.coverage, 'distributed');
  assert.ok(summary.evidence.length <= 6);
  assert.ok(summary.evidence.every(e => e.baslangic <= 400.75));
});
