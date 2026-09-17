'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ceaCaptureSegmentIdentity,
  mergeCeaCaptureSegments,
  normalizeCeaCaptureSegments,
  remapCeaCaptureSegments,
  retainCeaExpectedDuration,
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
  const sliding = mergeCeaCaptureSegments(refreshed.slice(0, 2), [
    { ...refreshed[1], url: 'https://cdn.test/2.ts?sig=renewed' },
    { url: 'https://cdn.test/4.ts?sig=fresh', sequence: 4, discontinuity: 0 },
  ]);
  assert.deepEqual(sliding.map((item) => item.sequence), [1, 2, 4]);
  assert.match(sliding[1].url, /renewed/, 'aynı segmentin yenilenmiş URLsi kazanmalı');

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

  let cancelled = false;
  let releaseDownload;
  const lateConsumed = [];
  const lateProgress = [];
  const cancelledRun = runOrderedCeaCapture({
    segments: refreshed, concurrency: 1,
    isCancelled: () => cancelled,
    fetchSegment: () => new Promise(resolve => { releaseDownload = resolve; }),
    consumeSegment: async (_buffer, segment) => lateConsumed.push(segment.sequence),
    onProgress: progress => lateProgress.push(progress),
  });
  await Promise.resolve();
  cancelled = true;
  releaseDownload(Buffer.from('late segment'));
  const stopped = await cancelledRun;
  assert.deepEqual(lateConsumed, []);
  assert.deepEqual(lateProgress, []);
  assert.equal(stopped.completed.length, 0);
  assert.equal(stopped.remaining.length, 3);
  assert.equal(stopped.cancelled, true);

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
  const openPlaylist = summarizeCeaCaptureCompleteness(refreshed,
    new Set(['0:1', '0:2', '0:3']), { cueCount: 20, planComplete: false });
  assert.equal(openPlaylist.complete, false, 'ENDLIST olmayan pencere tam video sayılamaz');
  assert.equal(openPlaylist.missing, 0);
  assert.equal(shouldAutoRetryCeaCapture(openPlaylist, 0, 2), true);

  assert.equal(retainCeaExpectedDuration(1860, { duration: 30, adPlaying: true }), 1860,
    'reklam süresi içerik süresini ezmemeli');
  assert.equal(retainCeaExpectedDuration(0, { duration: 30, adPlaying: true }), 0,
    'ilk reklam örneği içerik süresi diye kabul edilmemeli');
  assert.equal(retainCeaExpectedDuration(1860, { duration: 30, adPlaying: false }), 1860,
    'aynı akıştaki kısa önizleme doğrulanmış süreyi küçültmemeli');
  assert.equal(retainCeaExpectedDuration(0, { duration: 1860, adPlaying: false }), 1860);
  assert.equal(retainCeaExpectedDuration(0, { duration: Infinity, adPlaying: false }), 0);

  const unknownDuration = summarizeCeaCaptureCompleteness(refreshed,
    new Set(['0:1', '0:2', '0:3']), { cueCount: 20, planComplete: true, requireExpectedDuration: true });
  assert.equal(unknownDuration.complete, false, 'bilinmeyen süre tam video kanıtı değildir');
  assert.equal(unknownDuration.planReason, 'duration-unknown');
  assert.equal(unknownDuration.durationKnown, false);
  assert.equal(shouldAutoRetryCeaCapture(unknownDuration, 0, 2), true);

  const timedSegments = refreshed.map((segment, index) => ({
    ...segment, start: index * 10, duration: 10,
  }));
  const shortWindow = summarizeCeaCaptureCompleteness(timedSegments,
    new Set(['0:1', '0:2', '0:3']), { cueCount: 20, planComplete: true, expectedDuration: 120 });
  assert.equal(shortWindow.complete, false, 'ENDLIST kısa kayan pencereyi tam video yapmamalı');
  assert.equal(shortWindow.manifestComplete, true);
  assert.equal(shortWindow.durationComplete, false);
  assert.equal(shortWindow.planReason, 'duration-gap');
  assert.equal(shortWindow.plannedDuration, 30);
  assert.equal(shortWindow.durationPercent, 25);
  assert.equal(shouldAutoRetryCeaCapture(shortWindow, 0, 2), true);
  const durationComplete = summarizeCeaCaptureCompleteness(timedSegments,
    new Set(['0:1', '0:2', '0:3']), { cueCount: 20, planComplete: true, expectedDuration: 30.5 });
  assert.equal(durationComplete.complete, true, 'küçük EXTINF yuvarlama farkı kabul edilmeli');

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
  assert.match(main, /#EXT-X-ENDLIST/);
  assert.match(main, /mergeCeaCaptureSegments\(job\.segments, refreshed\.segments\)/);
  assert.match(main, /async function resolveBrowserHlsCeaExpectedDuration\(job\)/);
  assert.match(main, /contentDuration:\s*restored\.duration \|\| 0/);
  assert.match(main, /function invalidateBrowserTabSubtitles\(tab\)[\s\S]{0,100}tab\.contentDuration = 0/);
  assert.match(main, /contentDuration = retainCeaExpectedDuration\(tab\.contentDuration, safeMedia\)/);
  assert.match(main, /expectedDuration:\s*Number\(job\.expectedDuration\) \|\| 0/);
  assert.match(main, /requireExpectedDuration:\s*true/);
  assert.match(main, /completeness\.planReason === 'duration-unknown'/);
  assert.match(main, /completeness\.planReason === 'duration-gap'/);
  assert.match(main, /saveBrowserTrackToConfiguredFolder\(job\.tab, cues, track, 'source'\)/);
  assert.equal((main.match(/browserTrackPublicationNeedsMetadataRefresh\(previousPublication, meta\)/g) || []).length, 2,
    'metadata terfisi hem erken tekilleştirmede hem yayın aşamasında korunmalı');
  assert.match(main, /saveBrowserTrackToConfiguredFolder\(tab, cues,[\s\S]*?'translation'\)/);
  assert.match(main, /browser:subtitle:captureFull/);
  assert.match(main, /sendBrowserHlsCeaPlanReady\(ceaTab, browserHlsCeaActive\)/);
  assert.match(main, /ceaCapture:\s*tab\?\.ceaCapture/);
  assert.match(main, /function publishBrowserHlsCeaCaptureState\(tab, payload = \{\}, syncSnapshot = false\)/);
  assert.match(main, /sendBrowserEvent\(\{ type: 'tabs-changed', tabs: browserTabsSnapshot\(\)/);
  assert.match(main, /function invalidateBrowserTabSubtitles\(tab\)[\s\S]{0,140}tab\.ceaCapture = null/);
  assert.match(preload, /captureFullBrowserSubtitle/);
  assert.match(renderer, /toggleBrowserCeaFullCapture/);
  assert.match(renderer, /browserPendingCeaTranslation/);
  assert.match(renderer, /browserCeaCapture:\s*normalizeBrowserCeaCaptureState\(snapshot\.ceaCapture\)/);
  assert.match(renderer, /hasOwnProperty\.call\(snapshot, 'ceaCapture'\)[\s\S]{0,120}normalizeBrowserCeaCaptureState/);
  assert.match(renderer, /Önce bölümün tam kaynak altyazısı getiriliyor/);
  assert.match(html, /id="browserTrackCaptureFull"[\s\S]*?Tüm altyazıyı getir/);

  const normalizeSource = renderer.slice(
    renderer.indexOf('function normalizeBrowserCeaCaptureState('),
    renderer.indexOf('function applyBrowserCeaCaptureProgress('));
  const normalizeState = new Function(`${normalizeSource}; return normalizeBrowserCeaCaptureState;`)();
  assert.equal(normalizeState(null), null);
  const restored = normalizeState({ state: 'ready', available: true, total: 906,
    missing: 906, durationPercent: 102, tracks: [{ instreamId: 'CC1', standard: 'cea-608' }] });
  assert.equal(restored.state, 'ready');
  assert.equal(restored.available, true);
  assert.equal(restored.total, 906);
  assert.equal(restored.durationPercent, 100);
  assert.deepEqual(restored.tracks, [{ instreamId: 'CC1', language: '', name: '', standard: 'cea-608' }]);

  const refreshSource = main.slice(
    main.indexOf('function browserTrackPublicationNeedsMetadataRefresh('),
    main.indexOf('function publishBrowserTrackNow('));
  const needsMetadataRefresh = new Function(`${refreshSource}; return browserTrackPublicationNeedsMetadataRefresh;`)();
  const incompletePublication = { fingerprint: 'same', captureComplete: false, inputPath: '' };
  assert.equal(needsMetadataRefresh(incompletePublication,
    { finalize: true, captureComplete: true, inputPath: 'GİRDİ\\full.srt' }), true,
  'aynı cue metni tamlık metadata yükseltmesini engellememeli');
  assert.equal(needsMetadataRefresh({ ...incompletePublication, captureComplete: true, inputPath: 'GİRDİ\\full.srt' },
    { finalize: true, captureComplete: true, inputPath: 'GİRDİ\\full.srt' }), false,
  'tamamlanmış aynı yayın üçüncü kez yayımlanmamalı');

  // R58-06: EXT-X-GAP parçaları sunucuda bilinçli yok; zorunlu/indirilebilir
  // işten çıkar ama süreleri zaman çizgisi muhasebesinde kalır.
  const gapped = [
    { url: 'https://cdn.test/g1.ts', sequence: 1, discontinuity: 0, start: 0, duration: 6 },
    { url: 'https://cdn.test/g2.ts', sequence: 2, discontinuity: 0, start: 6, duration: 6, gap: true },
    { url: 'https://cdn.test/g3.ts', sequence: 3, discontinuity: 0, start: 12, duration: 6 },
  ];
  const gapFetched = [];
  const gapOrdered = await runOrderedCeaCapture({
    segments: gapped, concurrency: 1,
    fetchSegment: async (segment) => { gapFetched.push(segment.sequence); return Buffer.from('ok'); },
    consumeSegment: async () => {},
  });
  assert.deepEqual(gapFetched, [1, 3], 'EXT-X-GAP parçası indirilmeye çalışılmamalı');
  assert.equal(gapOrdered.total, 2);
  const gapSummary = summarizeCeaCaptureCompleteness(gapped,
    new Set(['0:1', '0:3']), { cueCount: 10, planComplete: true });
  assert.equal(gapSummary.gapCount, 1);
  assert.equal(gapSummary.total, 2, 'gap parçası zorunlu iş sayılmamalı');
  assert.equal(gapSummary.missing, 0, 'gap parçası eksik sayılıp sonsuz retry üretmemeli');
  assert.equal(gapSummary.plannedDuration, 18, 'gap süresi zaman muhasebesinde korunmalı');
  assert.equal(gapSummary.complete, true);
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /if \(segment\.gap\) continue/, 'kurtarma döngüsü gap parçalarını atlamalı');

  console.log('browser-cea-full-capture: ordered capture, exact completeness and automatic missing retry OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
