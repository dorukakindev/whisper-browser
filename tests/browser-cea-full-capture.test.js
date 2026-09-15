'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ceaCaptureSegmentIdentity,
  normalizeCeaCaptureSegments,
  remapCeaCaptureSegments,
  runOrderedCeaCapture,
  shouldAutoRetryCeaCapture,
  summarizeCeaCaptureCompleteness,
} = require('../src/browser-cea-full-capture');

(async () => {
  const segments = [3, 1, 2, 2].map((sequence, index) => ({
    url: `https://cdn.test/${sequence}.ts?sig=${index}`, sequence, discontinuity: 0, start: sequence * 6,
  }));
  assert.deepEqual(normalizeCeaCaptureSegments(segments).map((item) => item.sequence), [1, 2, 3]);
  assert.equal(ceaCaptureSegmentIdentity(segments[0]), '0:3');

  const refreshed = [1, 2, 3].map((sequence) => ({
    url: `https://cdn.test/${sequence}.ts?sig=fresh`, sequence, discontinuity: 0,
  }));
  assert.ok(remapCeaCaptureSegments(segments, refreshed).every((item) => item.url.includes('fresh')));

  const consumed = [];
  let active = 0;
  let peak = 0;
  const ordered = await runOrderedCeaCapture({
    segments: refreshed,
    concurrency: 2,
    fetchSegment: async (segment) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, segment.sequence === 1 ? 12 : 1));
      active--;
      return Buffer.from(String(segment.sequence));
    },
    consumeSegment: async (_buffer, segment) => { consumed.push(segment.sequence); },
  });
  assert.deepEqual(consumed, [1, 2, 3], 'paralel indirme decode sırasını bozmamalı');
  assert.equal(peak, 2);
  assert.equal(ordered.completed.length, 3);

  const refreshError = Object.assign(new Error('expired'), { retryAction: 'refresh-manifest' });
  const paused = await runOrderedCeaCapture({
    segments: refreshed,
    concurrency: 2,
    fetchSegment: async (segment) => {
      if (segment.sequence === 2) throw refreshError;
      return Buffer.from('ok');
    },
    consumeSegment: async () => {},
    shouldPause: (error) => error?.retryAction === 'refresh-manifest',
  });
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.completed.map((item) => item.sequence), [1]);
  assert.deepEqual(paused.failed.map((item) => item.segment.sequence), [2]);
  assert.deepEqual(paused.remaining.map((item) => item.sequence), [3]);

  const partial = summarizeCeaCaptureCompleteness(refreshed, new Set(['0:1', '0:3']), { cueCount: 14 });
  assert.equal(partial.complete, false, 'cue bulunması eksik segmenti gizlememeli');
  assert.equal(partial.missing, 1);
  assert.equal(partial.percent, 66);
  assert.deepEqual(partial.missingSegments.map((item) => item.sequence), [2]);
  assert.equal(shouldAutoRetryCeaCapture(partial, 0, 2), true);
  assert.equal(shouldAutoRetryCeaCapture(partial, 2, 2), false);
  const complete = summarizeCeaCaptureCompleteness(refreshed, new Set(['0:1', '0:2', '0:3']), { cueCount: 20 });
  assert.equal(complete.complete, true);
  assert.equal(complete.missing, 0);

  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /runOrderedCeaCapture\([\s\S]*?concurrency:\s*4/);
  assert.match(main, /refresh-manifest[\s\S]*?resolveBrowserHlsCeaFullPlan/);
  assert.match(main, /decoderKey = `\$\{ceaUrlKey\(segment\.playlistUrl/);
  assert.match(main, /shouldPause:\s*\(\) => true/);
  assert.match(main, /filter\(\(segment\) => !job\.completed\.has\(ceaCaptureSegmentIdentity\(segment\)\)\)/);
  assert.match(main, /completed:\s*new Set\(resume \? previous\.completed : \[\]\)/);
  assert.match(main, /scheduleBrowserHlsCeaAutoRetry\(job, completeness\)/);
  assert.match(main, /sendBrowserHlsCeaFullProgress\(job, 'retry-wait'/);
  assert.match(main, /saveBrowserTrackToConfiguredFolder\(job\.tab, cues, track, 'source'\)/);
  assert.match(main, /saveBrowserTrackToConfiguredFolder\(tab, cues,[\s\S]*?'translation'\)/);
  assert.match(main, /browser:subtitle:captureFull/);
  assert.match(preload, /captureFullBrowserSubtitle/);
  assert.match(renderer, /toggleBrowserCeaFullCapture/);
  assert.match(html, /id="browserTrackCaptureFull"[\s\S]*?Tüm altyazıyı getir/);

  console.log('browser-cea-full-capture: ordered capture, exact completeness and automatic missing retry OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
