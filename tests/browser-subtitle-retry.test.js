const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('function browserSubtitleHttpError(');
const end = source.indexOf('async function fetchAndStoreBrowserSubtitle(', start);
assert(start >= 0 && end > start);
const { subtitleRequestRetryPolicy } = require('../src/browser-lifecycle-policy');
const context = { subtitleRequestRetryPolicy };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  PASS  ${name}`); }

test('Kalıcı altyazı HTTP hataları yeniden denenmez', () => {
  for (const status of [403, 404]) {
    const error = context.browserSubtitleHttpError(status);
    assert.equal(error.code, 'EBROWSER_HTTP');
    assert.equal(error.retryable, false);
    assert.equal(context.browserSubtitleRetryable(error), false);
  }
});

test('Kota ve sağlayıcı hataları sınırlı yeniden denemeye uygundur', () => {
  for (const status of [429, 500, 502, 503]) {
    const error = context.browserSubtitleHttpError(status);
    assert.equal(error.retryable, true);
    assert.equal(context.browserSubtitleRetryable(error), true);
  }
});

test('Durum hataları metinden bağımsız kodlarla yeniden deneme dışında kalır', () => {
  for (const code of ['EBROWSER_STALE', 'EBROWSER_CLOSED', 'EBROWSER_UNSAFE_URL', 'EBROWSER_UNSAFE_RESPONSE']) {
    const error = context.browserSubtitleStateError(code, 'İleride değişebilecek kullanıcı metni');
    assert.equal(error.code, code);
    assert.equal(context.browserSubtitleRetryable(error), false);
  }
});

test('Zaman aşımı yeniden denenir; gezinme iptali yeniden denenmez', () => {
  const timeout = new Error('Zaman aşımı'); timeout.code = 'ETIMEDOUT';
  const navigationAbort = new Error('Gezinme'); navigationAbort.name = 'AbortError';
  const electronAbort = new Error('net::ERR_ABORTED'); electronAbort.code = 'ERR_ABORTED';
  assert.equal(context.browserSubtitleRetryable(timeout), true);
  assert.equal(context.browserSubtitleRetryable(navigationAbort), false);
  assert.equal(context.browserSubtitleRetryable(electronAbort), false);
});

test('Gerçek istek kararı imzalı 403 ve Retry-After bilgisini korur', () => {
  const signed = context.browserSubtitleHttpError(403, 'https://cdn.test/a.m4s?sig=secret');
  const refresh = context.browserSubtitleRetryDecision(signed, '', 0);
  assert.equal(refresh.action, 'refresh-manifest');
  const quota = context.browserSubtitleHttpError(429, 'https://cdn.test/a.vtt', 2500);
  const retry = context.browserSubtitleRetryDecision(quota, '', 0);
  assert.equal(retry.action, 'retry');
  assert.equal(retry.delayMs, 2500);
});

console.log(`browser-subtitle-retry: ${passed} test`);
