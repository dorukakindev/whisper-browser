'use strict';

const asyncHooks = require('async_hooks');
const fs = require('fs');
const path = require('path');

const MIB = 1024 * 1024;
const DEFAULT_RESOURCE_SOAK_BUDGETS = Object.freeze({
  captureSuccessRateMin: 0.98,
  hibernationSuccessRateMin: 1,
  mainRssDeltaBytesMax: 64 * MIB,
  mainHeapDeltaBytesMax: 24 * MIB,
  rendererHeapDeltaBytesMax: 16 * MIB,
  browserHeapDeltaBytesMax: 16 * MIB,
  totalWorkingSetDeltaBytesMax: 160 * MIB,
  gpuWorkingSetDeltaBytesMax: 96 * MIB,
  rendererHeapSlopeBytesPerCycleMax: 48 * 1024,
  browserHeapSlopeBytesPerCycleMax: 48 * 1024,
  listenerDeltaMax: 0,
  mainTimerDeltaMax: 2,
  mainTimerPeakDeltaMax: 12,
  electronInternalTimerDeltaMax: 32,
  electronInternalTimerPeakDeltaMax: 64,
  rendererTimerDeltaMax: 2,
  gpuProcessDeltaMax: 0,
  browserSubtitleFileCountMax: 64,
  browserPlacesReadOpsPerCycleMax: 1.1,
  watchLibraryReadOpsPerCycleMax: 1.1,
  diskWriteOpsPerCycleMax: 10,
  overlayRenderAverageMsMax: 8,
  overlayRenderMaxMsMax: 50,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readPath(source, dottedPath) {
  return String(dottedPath || '').split('.').reduce((value, key) => (
    value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined
  ), source);
}

function linearSlope(samples, dottedPath) {
  const points = (Array.isArray(samples) ? samples : [])
    .map(sample => ({ x: finite(sample.cycle, NaN), y: finite(readPath(sample, dottedPath), NaN) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  if (!denominator) return 0;
  return points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0)
    / denominator;
}

function fileCounter(snapshot, suffix) {
  const entries = snapshot && snapshot.io && snapshot.io.byFile;
  if (!entries || typeof entries !== 'object') return { readOps: 0, writeOps: 0 };
  const target = String(suffix || '').toLowerCase();
  const match = Object.entries(entries).find(([file]) => file.toLowerCase().endsWith(target));
  return match ? match[1] : { readOps: 0, writeOps: 0 };
}

function evaluateResourceSoak(report, budgets = DEFAULT_RESOURCE_SOAK_BUDGETS) {
  const samples = Array.isArray(report && report.samples) ? report.samples : [];
  const start = samples.find(sample => sample.label === 'start') || samples[0] || {};
  const final = [...samples].reverse().find(sample => sample.label === 'final')
    || samples[samples.length - 1] || {};
  const cycles = Math.max(1, finite(report && report.cycles));
  const delta = key => finite(readPath(final, key)) - finite(readPath(start, key));
  const startPlaces = fileCounter(start, 'browser-places.json');
  const finalPlaces = fileCounter(final, 'browser-places.json');
  const startLibrary = fileCounter(start, 'watch-library.json');
  const finalLibrary = fileCounter(final, 'watch-library.json');
  const captureRate = finite(report && report.capture && report.capture.successes)
    / Math.max(1, finite(report && report.capture && report.capture.attempts));
  const hibernationAttempts = Math.max(0, finite(report && report.hibernation && report.hibernation.attempts));
  const hibernationRate = finite(report && report.hibernation && report.hibernation.successes)
    / Math.max(1, hibernationAttempts);
  const stableSamples = samples.filter(sample => sample.label !== 'cleanup');
  const maximum = key => stableSamples.reduce((value, sample) => Math.max(value, finite(readPath(sample, key))), 0);
  const values = {
    captureSuccessRate: captureRate,
    hibernationSuccessRate: hibernationRate,
    mainRssDeltaBytes: delta('main.rssBytes'),
    mainHeapDeltaBytes: delta('main.heapUsedBytes'),
    rendererHeapDeltaBytes: delta('renderer.heapUsedBytes'),
    browserHeapDeltaBytes: delta('browser.heapUsedBytes'),
    totalWorkingSetDeltaBytes: delta('processes.totalWorkingSetBytes'),
    gpuWorkingSetDeltaBytes: delta('gpu.workingSetBytes'),
    rendererHeapSlopeBytesPerCycle: linearSlope(samples.filter(sample => sample.label !== 'cleanup'), 'renderer.heapUsedBytes'),
    browserHeapSlopeBytesPerCycle: linearSlope(samples.filter(sample => sample.label !== 'cleanup'), 'browser.heapUsedBytes'),
    listenerDelta: delta('listeners.total'),
    mainTimerDelta: delta('timers.main.projectActive'),
    mainTimerPeakDelta: finite(report && report.peaks && report.peaks.mainProjectTimers)
      - finite(readPath(start, 'timers.main.projectActive')),
    electronInternalTimerDelta: delta('timers.main.internalActive'),
    electronInternalTimerPeakDelta: finite(report && report.peaks && report.peaks.mainInternalTimers)
      - finite(readPath(start, 'timers.main.internalActive')),
    rendererTimerDelta: delta('timers.renderer.total'),
    gpuProcessDelta: delta('gpu.processCount'),
    browserSubtitleFileCount: finite(readPath(final, 'disk.browserSubtitleFiles')),
    browserPlacesReadOpsPerCycle: Math.max(0,
      finite(finalPlaces.readOps) - finite(startPlaces.readOps)) / cycles,
    watchLibraryReadOpsPerCycle: Math.max(0,
      finite(finalLibrary.readOps) - finite(startLibrary.readOps)) / cycles,
    diskWriteOpsPerCycle: Math.max(0, delta('io.writeOps')) / cycles,
    overlayRenderAverageMsMaxObserved: maximum('performance.overlay.renderAverageMs'),
    overlayRenderMaxMsObserved: maximum('performance.overlay.renderMaxMs'),
    overlayBoundaryCallbacksMaxObserved: maximum('performance.overlay.boundaryCallbacks'),
  };
  const specs = [
    ['capture-success-rate', values.captureSuccessRate, 'min', budgets.captureSuccessRateMin],
    ['main-rss-delta', values.mainRssDeltaBytes, 'max', budgets.mainRssDeltaBytesMax],
    ['main-heap-delta', values.mainHeapDeltaBytes, 'max', budgets.mainHeapDeltaBytesMax],
    ['renderer-heap-delta', values.rendererHeapDeltaBytes, 'max', budgets.rendererHeapDeltaBytesMax],
    ['browser-heap-delta', values.browserHeapDeltaBytes, 'max', budgets.browserHeapDeltaBytesMax],
    ['total-working-set-delta', values.totalWorkingSetDeltaBytes, 'max', budgets.totalWorkingSetDeltaBytesMax],
    ['gpu-working-set-delta', values.gpuWorkingSetDeltaBytes, 'max', budgets.gpuWorkingSetDeltaBytesMax],
    ['renderer-heap-slope', values.rendererHeapSlopeBytesPerCycle, 'max', budgets.rendererHeapSlopeBytesPerCycleMax],
    ['browser-heap-slope', values.browserHeapSlopeBytesPerCycle, 'max', budgets.browserHeapSlopeBytesPerCycleMax],
    ['listener-delta', values.listenerDelta, 'max', budgets.listenerDeltaMax],
    ['main-timer-delta', values.mainTimerDelta, 'max', budgets.mainTimerDeltaMax],
    ['main-timer-peak-delta', values.mainTimerPeakDelta, 'max', budgets.mainTimerPeakDeltaMax],
    ['electron-internal-timer-delta', values.electronInternalTimerDelta, 'max', budgets.electronInternalTimerDeltaMax],
    ['electron-internal-timer-peak-delta', values.electronInternalTimerPeakDelta, 'max', budgets.electronInternalTimerPeakDeltaMax],
    ['renderer-timer-delta', values.rendererTimerDelta, 'max', budgets.rendererTimerDeltaMax],
    ['gpu-process-delta', values.gpuProcessDelta, 'max', budgets.gpuProcessDeltaMax],
    ['browser-subtitle-file-count', values.browserSubtitleFileCount, 'max', budgets.browserSubtitleFileCountMax],
    ['browser-places-read-ops-per-cycle', values.browserPlacesReadOpsPerCycle,
      'max', budgets.browserPlacesReadOpsPerCycleMax],
    ['watch-library-read-ops-per-cycle', values.watchLibraryReadOpsPerCycle,
      'max', budgets.watchLibraryReadOpsPerCycleMax],
    ['disk-write-ops-per-cycle', values.diskWriteOpsPerCycle, 'max', budgets.diskWriteOpsPerCycleMax],
    ['overlay-render-average-ms', values.overlayRenderAverageMsMaxObserved,
      'max', budgets.overlayRenderAverageMsMax],
    ['overlay-render-max-ms', values.overlayRenderMaxMsObserved,
      'max', budgets.overlayRenderMaxMsMax],
  ];
  if (hibernationAttempts > 0) {
    specs.splice(1, 0, ['hibernation-success-rate', values.hibernationSuccessRate,
      'min', budgets.hibernationSuccessRateMin]);
  }
  const checks = specs.map(([name, value, direction, budget]) => ({
    name,
    value,
    direction,
    budget,
    pass: direction === 'min' ? value >= budget : value <= budget,
  }));
  return { pass: checks.every(check => check.pass), values, checks };
}

function createResourceTracker(options = {}) {
  const targetFs = options.fs || fs;
  const timers = new Map();
  const io = { readOps: 0, readBytes: 0, writeOps: 0, writeBytes: 0, byFile: {} };
  let peakTimers = 0;
  let peakOwners = {};
  let peakProjectTimers = 0;
  let peakInternalTimers = 0;
  const originalReadFileSync = targetFs.readFileSync;
  const originalWriteFileSync = targetFs.writeFileSync;

  const fileKey = file => {
    try { return path.normalize(String(file)); } catch (_) { return String(file || ''); }
  };
  const byteLength = (value, encoding) => {
    if (Buffer.isBuffer(value)) return value.length;
    return Buffer.byteLength(String(value || ''), typeof encoding === 'string' ? encoding : 'utf8');
  };
  const counterFor = file => {
    const key = fileKey(file);
    if (!io.byFile[key]) io.byFile[key] = { readOps: 0, readBytes: 0, writeOps: 0, writeBytes: 0 };
    return io.byFile[key];
  };
  targetFs.readFileSync = function trackedReadFileSync(file, ...args) {
    const result = originalReadFileSync.call(this, file, ...args);
    const bytes = byteLength(result, args[0]);
    const entry = counterFor(file);
    io.readOps++; io.readBytes += bytes;
    entry.readOps++; entry.readBytes += bytes;
    return result;
  };
  targetFs.writeFileSync = function trackedWriteFileSync(file, data, ...args) {
    const bytes = byteLength(data, args[0]);
    const entry = counterFor(file);
    io.writeOps++; io.writeBytes += bytes;
    entry.writeOps++; entry.writeBytes += bytes;
    return originalWriteFileSync.call(this, file, data, ...args);
  };

  const ownerFromStack = () => {
    const stack = String(new Error().stack || '').split(/\r?\n/).slice(2);
    const line = stack.find(entry => !/node:internal|node:timers|async_hooks|resource-soak\.js/.test(entry));
    return String(line || 'bilinmeyen').trim().slice(0, 240);
  };
  const ownerCounts = () => {
    const counts = {};
    for (const timer of timers.values()) counts[timer.owner] = (counts[timer.owner] || 0) + 1;
    return counts;
  };
  const isInternalOwner = owner => /node:electron|node_modules|bilinmeyen/i.test(String(owner || ''));
  const timerClassCounts = () => {
    let projectActive = 0;
    let internalActive = 0;
    for (const timer of timers.values()) {
      if (isInternalOwner(timer.owner)) internalActive++;
      else projectActive++;
    }
    return { projectActive, internalActive };
  };
  const hook = asyncHooks.createHook({
    init(asyncId, type) {
      if (type !== 'Timeout') return;
      timers.set(asyncId, { owner: ownerFromStack() });
      const classes = timerClassCounts();
      peakProjectTimers = Math.max(peakProjectTimers, classes.projectActive);
      peakInternalTimers = Math.max(peakInternalTimers, classes.internalActive);
      if (timers.size > peakTimers) {
        peakTimers = timers.size;
        peakOwners = ownerCounts();
      }
    },
    destroy(asyncId) { timers.delete(asyncId); },
  });
  hook.enable();

  return {
    snapshot() {
      return {
        timers: { active: timers.size, ...timerClassCounts(), owners: ownerCounts() },
        io: JSON.parse(JSON.stringify(io)),
      };
    },
    peaks() {
      return {
        mainTimers: peakTimers,
        mainProjectTimers: peakProjectTimers,
        mainInternalTimers: peakInternalTimers,
        mainTimerOwners: { ...peakOwners },
      };
    },
    resetPeaks() {
      const classes = timerClassCounts();
      peakTimers = timers.size;
      peakProjectTimers = classes.projectActive;
      peakInternalTimers = classes.internalActive;
      peakOwners = ownerCounts();
    },
    close() {
      hook.disable();
      targetFs.readFileSync = originalReadFileSync;
      targetFs.writeFileSync = originalWriteFileSync;
    },
  };
}

module.exports = {
  DEFAULT_RESOURCE_SOAK_BUDGETS,
  createResourceTracker,
  evaluateResourceSoak,
  linearSlope,
};
