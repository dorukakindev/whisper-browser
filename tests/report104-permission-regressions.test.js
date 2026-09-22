const assert = require('node:assert/strict');
const { browserPermissionRequesterUrl, browserPermissionDecision } = require('../src/browser-site-permissions');

const trusted = 'https://trusted.example/watch';
const untrusted = 'https://untrusted.example/frame';
const stored = { 'https://trusted.example': { permissions: { fullscreen: 'allow' } } };

// The third-party frame must not borrow the embedding top-level page's grant.
assert.equal(browserPermissionRequesterUrl(trusted, { requestingUrl: untrusted }, true), untrusted);
assert.equal(browserPermissionDecision(stored,
  browserPermissionRequesterUrl(trusted, { requestingUrl: untrusted }, true), 'fullscreen'), 'ask');
assert.equal(browserPermissionRequesterUrl('', { requestingUrl: untrusted }), untrusted);
assert.equal(browserPermissionRequesterUrl('', {}, false), '');
assert.equal(browserPermissionRequesterUrl(trusted, {}, true), trusted,
  'service-worker checks use requestingOrigin even without a WebContents');
assert.equal(browserPermissionRequesterUrl(trusted, { requestingUrl: 'blob:null/123' }, true), '',
  'opaque frame URL must not fall back to the trusted parent');
assert.equal(browserPermissionRequesterUrl(trusted, { requestingUrl: 'data:text/html,hello' }, true), '');

console.log('report104 permission origin regressions: ok');
