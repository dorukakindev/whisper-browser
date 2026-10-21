'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const children = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
    child.stdin = new EventEmitter(); child.stdin.write = () => true; child.stdin.end = () => {};
    child.kill = () => { child.killed = true; };
    children.push(child); return child;
  };
  const source = path.join(__dirname, '../src/browser-media-tools.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), { module, exports: module.exports,
    require: name => name === 'node:child_process' ? { spawn } : name === './settings-security'
      ? { withoutSecretEnv: value => value } : require('node:module').createRequire(source)(name),
    __dirname: path.dirname(source), process: { env: {}, once() {} }, Buffer,
    setTimeout: () => ({ unref() {} }), clearTimeout() {},
  });
  return { children, run: module.exports.run, tools: module.exports.createBrowserMediaTools({ pythonPath: process.execPath }) };
}

test('worker pipe failure rejects pending requests immediately and next query recovers', async () => {
  const f = fixture();
  const pending = f.tools.semanticSearch({ query: 'one', cues: [] });
  const rejected = assert.rejects(pending);
  f.children[0].stdin.emit('error', new Error('EPIPE'));
  assert.equal(f.children[0].killed, true);
  await rejected;
  const next = f.tools.semanticSearch({ query: 'two', cues: [] });
  assert.equal(f.children.length, 2);
  f.children[0].stdin.emit('error', new Error('stale'));
  f.children[1].stdout.emit('data', '{"ok":true,"results":[]}\n');
  assert.equal((await next).results.length, 0);
});

test('one-shot media pipe failure rejects immediately instead of waiting for timeout', async () => {
  const f = fixture();
  const pending = f.run('fixture', [], 'input');
  let error;
  pending.catch(value => { error = value; });
  f.children[0].stdin.emit('error', new Error('EPIPE'));
  await Promise.resolve();
  assert.match(error?.message || '', /EPIPE/);
  assert.equal(f.children[0].killed, true);
});
