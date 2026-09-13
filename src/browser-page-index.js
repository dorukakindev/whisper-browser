'use strict';

function pageIndexCaptureIsCurrent(options) {
  const { tab, view, webContents, tabGeneration, indexGeneration,
    isEnabled, currentIndexGeneration } = options;
  return !!isEnabled()
    && indexGeneration === currentIndexGeneration()
    && tab?.view === view
    && tab?.generation === tabGeneration
    && !!webContents
    && !webContents.isDestroyed();
}

async function runBrowserPageIndexCapture(options) {
  if (!pageIndexCaptureIsCurrent(options)) return { ok: false, reason: 'stale-before-capture' };
  let result;
  try {
    result = await options.webContents.mainFrame.executeJavaScript(options.script, true);
  } catch (_) {
    return { ok: false, reason: 'capture-failed' };
  }
  if (!pageIndexCaptureIsCurrent(options)) return { ok: false, reason: 'stale-after-capture' };
  if (!result?.ok) return { ok: false, reason: 'invalid-result' };
  try {
    options.upsertPage({
      url: result.url,
      title: result.title,
      content: (result.blocks || []).map((block) => block.text).join('\n'),
      visitedAt: (options.now || Date.now)(),
    });
  } catch (_) {
    return { ok: false, reason: 'index-failed' };
  }
  return { ok: true };
}

module.exports = { pageIndexCaptureIsCurrent, runBrowserPageIndexCapture };
