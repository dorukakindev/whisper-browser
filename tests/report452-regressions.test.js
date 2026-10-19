'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { clonePublicOptions } = require('../src/queue-persistence');
const root = path.resolve(__dirname, '..');

test('queue snapshots remove short secret keys at every nesting level without losing public controls', () => {
  const result = clonePublicOptions({ model: 'small', token: 'fixture', JWT: 'fixture',
    nested: { auth: 'fixture', provider_token: 'fixture', authenticationMode: 'oauth',
      contextTokens: 2048, records: [{ token: 'fixture', text: 'hello' }] } });
  assert.deepEqual(result, { model: 'small', nested: { authenticationMode: 'oauth',
    contextTokens: 2048, records: [{ text: 'hello' }] } });
});

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const start = main.indexOf("ipcMain.handle('transcribe:start',");
const header = main.slice(start, main.indexOf('  const folderDefaults =', start));
test('invalid IPC numbers fail before filesystem, model or download side effects', async () => {
  let handler;
  vm.runInNewContext(header + '\n});', {
    ipcMain: { handle: (_channel, fn) => { handler = fn; } }, authorizedBrowserSender: () => true,
  });
  for (const key of ['temperature', 'vadMinSpeechMs', 'maxCps', 'timingGap', 'beamSize']) {
    for (const value of [NaN, Infinity, -Infinity, null, '', 'NaN']) {
      const result = await handler({}, { [key]: value });
      assert.equal(result.ok, false, `${key}: ${String(value)}`);
      assert.match(result.error, new RegExp(key));
    }
  }
  assert.equal(await handler({}, { temperature: 0, logProbThreshold: -1, maxCps: 0 }), undefined);
  assert.equal((await handler({}, { beamSize: 3.5 })).ok, false);
  assert.equal(await handler({}, { vadThreshold: .5, beamSize: 3 }), undefined);
});

test('mini-player preload exposes only the dedicated command bridge', async () => {
  let bridge, invocation;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/browser-mini-preload.js'), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return { contextBridge: { exposeInMainWorld: (name, value) => {
        assert.equal(name, 'mini'); bridge = value;
      } }, ipcRenderer: { invoke: async (...args) => { invocation = args; return { ok: true }; } } };
    },
  });
  assert.deepEqual(Object.keys(bridge), ['command']);
  assert.equal((await bridge.command('close')).ok, true);
  assert.deepEqual(invocation, ['browser:mini:command', 'close']);
});

test('zero-valued timing and decoding controls reach backend argv', () => {
  for (const [key, flag] of [['maxCps', '--max-cps'], ['vadThreshold', '--vad-threshold'],
    ['continuationGap', '--continuation-gap'], ['incompleteGap', '--incomplete-gap'], ['timingGap', '--timing-gap']]) {
    const line = main.split(/\r?\n/).find(value => value.includes(`args.push('${flag}',`));
    assert(line, flag);
    const run = new Function('options', 'const args = []; ' + line + '; return args;');
    assert.deepEqual(run({ [key]: 0 }), [flag, '0']);
    assert.deepEqual(run({}), []);
  }
});

function mediaFixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kills = 0; child.kill = () => { child.kills++; };
  const sandbox = { module: { exports: {} }, Buffer, setTimeout, clearTimeout,
    require(name) {
      if (name === 'node:child_process') return { spawn: () => child };
      if (name === './settings-security') return { withoutSecretEnv: () => ({}) };
      throw new Error(name);
    }, process: { env: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/browser-reference-media.js'), 'utf8')
    + '\nmodule.exports.processOutput = processOutput;', sandbox);
  return { child, run: sandbox.module.exports.processOutput };
}

test('cancelled media preview ignores buffered stdout and terminates once', async () => {
  const { child, run } = mediaFixture(); const controller = new AbortController();
  let consumed = 0;
  const pending = run('fixture', [], { signal: controller.signal, consume: () => { consumed++; } });
  controller.abort();
  child.stdout.emit('data', Buffer.alloc(4)); child.stdout.emit('data', Buffer.alloc(8));
  child.emit('close', 0);
  await assert.rejects(pending, /iptal/);
  assert.equal(consumed, 0); assert.equal(child.kills, 1);
});

test('media stream consumer errors reject the job instead of escaping the event handler', async () => {
  const { child, run } = mediaFixture();
  const pending = run('fixture', [], { consume: () => { throw new Error('fixture decoder'); } });
  assert.doesNotThrow(() => child.stdout.emit('data', Buffer.from('pcm')));
  child.emit('close', 0);
  await assert.rejects(pending, /fixture decoder/); assert.equal(child.kills, 1);
});
