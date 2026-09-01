'use strict';

const assert = require('assert');
const { withAbortTimeout, withTimeout } = require('../src/async-timeout');

async function main() {
  assert.equal(await withTimeout(Promise.resolve('ok'), 50), 'ok');

  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, 'probe timeout'),
    (error) => error.code === 'ETIMEDOUT' && error.message === 'probe timeout');

  let aborted = false;
  await assert.rejects(
    withAbortTimeout((signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    }), 10, 'fetch timeout'),
    (error) => error.code === 'ETIMEDOUT' && error.message === 'fetch timeout');
  assert.equal(aborted, true);

  assert.equal(await withAbortTimeout(async (signal) => {
    assert.equal(signal.aborted, false);
    return 42;
  }, 50), 42);

  console.log('  OK  async timeout yardımcıları');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
