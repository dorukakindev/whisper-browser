"use strict";

function ceaCaptureSegmentIdentity(segment = {}) {
  const discontinuity = Math.max(0, Number(segment.discontinuity) || 0);
  const sequence = Number(segment.sequence);
  if (Number.isFinite(sequence)) return `${discontinuity}:${sequence}`;
  return `${discontinuity}:url:${String(segment.urlKey || segment.url || "").split(/[?#]/)[0]}`;
}

function normalizeCeaCaptureSegments(segments = []) {
  const unique = new Map();
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || !segment.url) continue;
    unique.set(ceaCaptureSegmentIdentity(segment), segment);
  }
  return [...unique.values()].sort((left, right) => {
    const discontinuity = (Number(left.discontinuity) || 0) - (Number(right.discontinuity) || 0);
    if (discontinuity) return discontinuity;
    const leftSequence = Number(left.sequence);
    const rightSequence = Number(right.sequence);
    if (Number.isFinite(leftSequence) && Number.isFinite(rightSequence) && leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }
    return (Number(left.start) || 0) - (Number(right.start) || 0);
  });
}

function remapCeaCaptureSegments(segments = [], refreshed = []) {
  const next = new Map(normalizeCeaCaptureSegments(refreshed)
    .map((segment) => [ceaCaptureSegmentIdentity(segment), segment]));
  return normalizeCeaCaptureSegments(segments).map((segment) =>
    next.get(ceaCaptureSegmentIdentity(segment)) || segment);
}

function mergeCeaCaptureSegments(previous = [], refreshed = []) {
  // Refreshed entries come last so the same sequence's renewed signed URL wins;
  // segments that slid out of the newest window remain part of the completeness ledger.
  return normalizeCeaCaptureSegments([...normalizeCeaCaptureSegments(previous),
    ...normalizeCeaCaptureSegments(refreshed)]);
}

function summarizeCeaCaptureCompleteness(segments = [], completed = [], options = {}) {
  const planned = normalizeCeaCaptureSegments(segments);
  const completedIds = new Set((completed instanceof Set ? [...completed] : completed || [])
    .map((item) => typeof item === "string" ? item : ceaCaptureSegmentIdentity(item)));
  const missing = planned.filter((segment) => !completedIds.has(ceaCaptureSegmentIdentity(segment)));
  const total = planned.length;
  const completedCount = Math.max(0, total - missing.length);
  const cueCount = Math.max(0, Number(options.cueCount) || 0);
  const planComplete = options.planComplete !== false;
  const complete = total > 0 && planComplete && missing.length === 0 && cueCount > 0;
  return {
    total,
    completed: completedCount,
    missing: missing.length,
    missingSegments: missing,
    cueCount,
    planComplete,
    complete,
    state: complete ? "complete" : (completedCount > 0 || cueCount > 0 ? "partial" : "empty"),
    percent: total ? Math.floor((completedCount / total) * 100) : 0,
  };
}

function shouldAutoRetryCeaCapture(summary, retryRound = 0, maxRetryRounds = 2) {
  return !!summary && !summary.complete && (summary.missing > 0 || summary.planComplete === false)
    && Math.max(0, Number(retryRound) || 0) < Math.max(0, Number(maxRetryRounds) || 0);
}

async function runOrderedCeaCapture(options = {}) {
  const items = normalizeCeaCaptureSegments(options.segments);
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 4));
  const fetchSegment = options.fetchSegment;
  const consumeSegment = options.consumeSegment;
  if (typeof fetchSegment !== "function" || typeof consumeSegment !== "function") {
    throw new TypeError("fetchSegment ve consumeSegment işlevleri zorunludur.");
  }
  const isCancelled = typeof options.isCancelled === "function" ? options.isCancelled : () => false;
  const shouldPause = typeof options.shouldPause === "function" ? options.shouldPause : () => false;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const inFlight = new Map();
  const completed = [];
  const failed = [];
  let nextLaunch = 0;
  let paused = false;

  const launch = () => {
    while (!paused && !isCancelled() && nextLaunch < items.length && inFlight.size < concurrency) {
      const index = nextLaunch++;
      const segment = items[index];
      const pending = Promise.resolve().then(() => fetchSegment(segment, index))
        .then((buffer) => ({ ok: true, buffer }), (error) => ({ ok: false, error }));
      inFlight.set(index, pending);
    }
  };

  launch();
  for (let index = 0; index < items.length; index++) {
    if (isCancelled() || paused) break;
    const pending = inFlight.get(index);
    if (!pending) break;
    const result = await pending;
    inFlight.delete(index);
    const segment = items[index];
    if (result.ok) {
      try {
        await consumeSegment(result.buffer, segment, index);
        completed.push(segment);
      } catch (error) {
        failed.push({ segment, error });
        paused = shouldPause(error, segment) === true;
      }
    } else {
      failed.push({ segment, error: result.error });
      paused = shouldPause(result.error, segment) === true;
    }
    onProgress({ completed: completed.length, failed: failed.length, total: items.length,
      paused, cancelled: isCancelled(), segment });
    launch();
  }

  if (paused || isCancelled()) await Promise.allSettled(inFlight.values());
  const handled = new Set([...completed, ...failed.map((item) => item.segment)]
    .map(ceaCaptureSegmentIdentity));
  const remaining = items.filter((segment) => !handled.has(ceaCaptureSegmentIdentity(segment)));
  return { completed, failed, remaining, paused, cancelled: isCancelled(), total: items.length };
}

module.exports = {
  ceaCaptureSegmentIdentity,
  mergeCeaCaptureSegments,
  normalizeCeaCaptureSegments,
  remapCeaCaptureSegments,
  runOrderedCeaCapture,
  shouldAutoRetryCeaCapture,
  summarizeCeaCaptureCompleteness,
};
