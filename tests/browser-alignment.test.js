'use strict';

const assert = require('node:assert/strict');
const { createBrowserAlignment } = require('../src/browser-alignment');
const { findTestPython } = require('./python-runtime');
const { findMediaTool } = require('./media-runtime');
const pythonPath = findTestPython();
const ffmpegPath = findMediaTool('ffmpeg');
assert(pythonPath && ffmpegPath, 'Python ve FFmpeg test çalışma zamanı bulunamadı.');
const alignment = createBrowserAlignment({ pythonPath, ffmpegPath });

async function run() {
  const referenceCues = Array.from({ length: 28 }, (_, index) => {
    const start = 8 + index * 12 + (index % 4) * 1.3;
    return { start, end: start + 2.1 + (index % 3) * .4, text: `Cümle ${index}` };
  });
  const targetCues = referenceCues.map((cue, index) => ({
    ...cue, start: cue.start + (index < 14 ? 3 : -5),
    end: cue.end + (index < 14 ? 3 : -5),
  }));
  const result = await alignment.align({ referenceCues, targetCues });
  assert.equal(result.cues.length, targetCues.length);
  assert.equal(result.diagnostics.autoApply, false);
  assert(result.diagnostics.overlapAfter > result.diagnostics.overlapBefore + .2,
    'Parçalı eşleme örtüşmeyi artırmadı: ' + JSON.stringify(result.diagnostics));
  const firstError = Math.abs(result.cues[4].start - referenceCues[4].start);
  const secondError = Math.abs(result.cues[23].start - referenceCues[23].start);
  assert(firstError < 1 && secondError < 1,
    `İki ayrı kayma giderilmedi: ${firstError}, ${secondError}`);
  assert(result.changes.length >= 20);
  const drifted = referenceCues.map((cue, index) => ({ ...cue,
    start: cue.start * (25 / 24) + (index < 14 ? 3 : -5),
    end: cue.end * (25 / 24) + (index < 14 ? 3 : -5) }));
  const driftResult = await alignment.align({ referenceCues, targetCues: drifted });
  const driftFirstError = Math.abs(driftResult.cues[4].start - referenceCues[4].start);
  const driftSecondError = Math.abs(driftResult.cues[23].start - referenceCues[23].start);
  assert(driftFirstError < 1 && driftSecondError < 1,
    `Drift+parça hatası giderilmedi: ${driftFirstError}, ${driftSecondError}`);
  assert.equal(driftResult.diagnostics.autoApply, false);
  const sparse = await alignment.align({ referenceCues: referenceCues.slice(0, 3),
    targetCues: targetCues.slice(0, 3) });
  assert.equal(sparse.diagnostics.confidence, 'low');
  assert.equal(sparse.diagnostics.autoApply, false);
  assert.throws(() => alignment.align({ referenceCues: [], targetCues }), /3-10000/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(alignment.align({ referenceCues, targetCues }, { signal: abort.signal }), /iptal/i);
  console.log(JSON.stringify({ ok: true, diagnostics: result.diagnostics,
    firstError, secondError, driftFirstError, driftSecondError, changes: result.changes.length }));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
