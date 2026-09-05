'use strict';

/**
 * Returns true for the two browser gestures that conventionally open a link
 * in a background tab. Kept separate from Electron/DOM code so the policy can
 * be tested without starting an Electron process.
 */
function isNewTabLinkGesture(event = {}) {
  const button = Number(event.button);
  if (button === 1) return true;
  return button === 0 && (!!event.ctrlKey || !!event.metaKey);
}

module.exports = { isNewTabLinkGesture };
