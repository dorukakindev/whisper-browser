'use strict';

const assert = require('node:assert/strict');
const { crashRecoveryPolicy, navigationRetryPolicy, parseRetryAfterMs,
  subtitleRequestRetryPolicy } = require('../src/browser-lifecycle-policy');

assert.deepEqual(navigationRetryPolicy({ status: 404 }), {
  action: 'terminal', reason: 'http-404', delayMs: 0,
});
assert.equal(navigationRetryPolicy({ status: 403,
  url: 'https://cdn.test/sub.m4s?X-Goog-Signature=secret' }).action, 'refresh-manifest');
assert.equal(navigationRetryPolicy({ status: 403,
  url: 'https://example.test/login' }).action, 'terminal');
assert.deepEqual(navigationRetryPolicy({ code: -105, attempt: 0 }), {
  action: 'retry', reason: 'net--105', delayMs: 10000, nextAttempt: 1,
});
assert.equal(navigationRetryPolicy({ status: 503, attempt: 1 }).delayMs, 30000);
assert.equal(navigationRetryPolicy({ status: 429, attempt: 0, retryAfterMs: 12500 }).delayMs, 12500);
assert.equal(navigationRetryPolicy({ code: -105, attempt: 3 }).reason, 'retry-limit');
assert.equal(crashRecoveryPolicy('clean-exit').action, 'ignore');
assert.equal(crashRecoveryPolicy('oom').severity, 'memory');
assert.equal(crashRecoveryPolicy('crashed').action, 'recreate-once');
assert.equal(crashRecoveryPolicy('integrity-failure').action, 'manual-reload');
assert.equal(parseRetryAfterMs('2.5', 0), 2500);
assert.equal(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:50 GMT')), 10000);
assert.equal(parseRetryAfterMs('bozuk', 0), 0);
assert.deepEqual(subtitleRequestRetryPolicy({ status: 404, attempt: 0 }), {
  action: 'terminal', reason: 'http-404', delayMs: 0,
});
assert.equal(subtitleRequestRetryPolicy({ status: 403,
  url: 'https://cdn.test/sub.m4s?token=secret' }).action, 'refresh-manifest');
assert.equal(subtitleRequestRetryPolicy({ status: 429, retryAfterMs: 4200, attempt: 0 }).delayMs, 4200);
assert.equal(subtitleRequestRetryPolicy({ status: 503, attempt: 1 }).delayMs, 1000);
assert.equal(subtitleRequestRetryPolicy({ retryable: true, attempt: 2 }).delayMs, 3000);

console.log('Tarayıcı yaşam döngüsü: retry sınıfları ve çökme neden politikası geçti.');
