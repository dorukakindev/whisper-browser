const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('function browserSubtitleHttpError(');
const end = source.indexOf('async function fetchAndStoreBrowserSubtitle(', start);
assert(start >= 0 && end > start);
const context = {};
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

console.log(`browser-subtitle-retry: ${passed} test`);
