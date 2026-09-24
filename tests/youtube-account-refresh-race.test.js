'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const accounts = require('../src/youtube-accounts');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('let _ytRefreshInFlight = null;');
const end = source.indexOf('\nfunction validateInvidiousInstance(', start);
assert.ok(start >= 0 && end > start, 'refresh implementation must be found');
const refreshSource = source.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function harness() {
  const session = {
    activeId: 'a', clientId: 'client', clientSecret: 'secret',
    accounts: {
      a: { refreshToken: 'refresh-a', accessToken: '', expiresAt: 0, authMode: 'custom' },
      b: { refreshToken: 'refresh-b', accessToken: '', expiresAt: 0, authMode: 'custom' },
    },
  };
  const requests = [];
  let persistCount = 0;
  const context = {
    youtubeSession: session,
    ytActiveAccount: () => accounts.activeAccount(session.accounts, session.activeId),
    ytAccounts: accounts,
    youtubeAuthEnv: () => ({ accountId: session.activeId }),
    runYoutubeCommand: (_args, _onEvent, _timeout, env) => {
      const request = deferred();
      requests.push({ accountId: env.accountId, ...request });
      return request.promise;
    },
    persistYoutubeSession: () => { persistCount++; },
  };
  vm.runInNewContext(`${refreshSource}\nthis.ensure = ensureYoutubeAccessToken;`, context);
  return { session, requests, ensure: context.ensure, persistCount: () => persistCount };
}

async function waitForRequest(h, count) {
  for (let i = 0; i < 10 && h.requests.length < count; i++) await Promise.resolve();
  assert.equal(h.requests.length, count, `expected ${count} refresh request(s)`);
}

async function testInvalidGrantDoesNotRemoveSwitchedAccount() {
  const h = harness();
  const first = h.ensure();
  await waitForRequest(h, 1);
  h.session.activeId = 'b';
  const second = h.ensure();
  h.requests[0].resolve({ ok: false, error: 'invalid_grant' });
  assert.equal(await first, null);
  await waitForRequest(h, 2);
  assert.equal(h.requests[1].accountId, 'b');
  h.requests[1].resolve({ ok: true, data: { access_token: 'token-b', expires_in: 3600 } });
  assert.equal(await second, 'token-b');
  assert.equal(h.session.accounts.a, undefined);
  assert.ok(h.session.accounts.b, 'switching to B must not delete B');
  assert.equal(h.session.activeId, 'b');
  assert.equal(h.persistCount(), 1);
}

async function testOldAccountTokenCannotSatisfyNewAccount() {
  const h = harness();
  const first = h.ensure();
  await waitForRequest(h, 1);
  h.session.activeId = 'b';
  const second = h.ensure();
  h.requests[0].resolve({ ok: true, data: { access_token: 'token-a', expires_in: 3600 } });
  assert.equal(await first, null, 'old browse must not receive token A after switch');
  await waitForRequest(h, 2);
  assert.equal(h.requests[1].accountId, 'b');
  h.requests[1].resolve({ ok: true, data: { access_token: 'token-b', expires_in: 3600 } });
  assert.equal(await second, 'token-b');
  assert.equal(h.session.accounts.a.accessToken, 'token-a');
  assert.equal(h.session.accounts.b.accessToken, 'token-b');
}

async function testReplacedAccountSurvivesStaleInvalidGrant() {
  const h = harness();
  const first = h.ensure();
  await waitForRequest(h, 1);
  const replacement = { refreshToken: 'new-refresh', accessToken: '', expiresAt: 0, authMode: 'custom' };
  h.session.accounts.a = replacement;
  h.requests[0].resolve({ ok: false, error: 'invalid_grant' });
  assert.equal(await first, null);
  assert.equal(h.session.accounts.a, replacement);
  assert.equal(h.persistCount(), 0);
}

async function testSameAccountSharesSingleRefresh() {
  const h = harness();
  const first = h.ensure();
  const second = h.ensure();
  await waitForRequest(h, 1);
  h.requests[0].resolve({ ok: true, data: { access_token: 'token-a', expires_in: 3600 } });
  assert.equal(await first, 'token-a');
  assert.equal(await second, 'token-a');
  assert.equal(h.requests.length, 1);
}

(async () => {
  await testInvalidGrantDoesNotRemoveSwitchedAccount();
  await testOldAccountTokenCannotSatisfyNewAccount();
  await testReplacedAccountSurvivesStaleInvalidGrant();
  await testSameAccountSharesSingleRefresh();
  console.log('youtube-account-refresh-race: 4/4 passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
