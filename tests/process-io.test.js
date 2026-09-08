'use strict';

const assert = require('assert');
const { probeCommand } = require('../src/process-io');

(async () => {
  const line = await probeCommand(process.execPath, ['-e', "console.log('ilk'); console.log('ikinci')"], {
    timeoutMs: 2000,
  });
  assert.equal(line, 'ilk');

  const missing = await probeCommand('whisper-command-that-does-not-exist', [], { timeoutMs: 500 });
  assert.equal(missing, null);

  const started = Date.now();
  const hung = await probeCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 150 });
  assert.equal(hung, null);
  assert(Date.now() - started < 2000, 'takılan probe zaman sınırında kesilmedi');

  const flood = await probeCommand(process.execPath, ['-e', "process.stdout.write('x'.repeat(20000))"], {
    timeoutMs: 2000,
    maxChars: 1024,
  });
  assert.equal(flood, null);
  console.log('  PASS  harici binary probe timeout ve çıktı sınırı');
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
