'use strict';

// Electron suspends executeJavaScript* while a page is loading and adds an
// internal did-stop-loading listener for every call. Periodic probes must not
// accumulate those listeners during a long or stalled navigation.
function browserScriptExecutionReady(webContents) {
  try {
    return !!webContents
      && !webContents.isDestroyed()
      && !(typeof webContents.getURL === 'function' && !webContents.getURL())
      && !(typeof webContents.isLoadingMainFrame === 'function' && webContents.isLoadingMainFrame())
      && !(typeof webContents.isLoading === 'function' && webContents.isLoading());
  } catch (_) {
    return false;
  }
}

// A navigation can begin immediately after the ready check. Context-loss
// failures are expected lifecycle races; genuine script errors must stay visible.
function isBrowserScriptContextLoss(error) {
  const message = String(error && (error.message || error) || '');
  return /execution context (?:was )?destroyed|frame (?:was )?(?:detached|disposed)|Render frame was disposed|Object has been destroyed|navigation (?:was )?(?:cancelled|canceled|aborted)|ERR_ABORTED/iu.test(message);
}

function isMainDocumentNavigation(details, legacyInPlace, legacyIsMainFrame) {
  const mainFrame = typeof details?.isMainFrame === 'boolean'
    ? details.isMainFrame : legacyIsMainFrame === true;
  const sameDocument = typeof details?.isSameDocument === 'boolean'
    ? details.isSameDocument : legacyInPlace === true;
  return mainFrame && !sameDocument;
}

module.exports = { browserScriptExecutionReady, isBrowserScriptContextLoss, isMainDocumentNavigation };
