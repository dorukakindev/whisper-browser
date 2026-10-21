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
    child.stdin = new EventEmitter(); child.stdin.write = () => true;
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
  return { children, tools: module.exports.createBrowserMediaTools({ pythonPath: process.execPath }) };
}

test('semantic worker rejects JSON null without throwing out of the stream callback', async () => {
  const f = fixture();
  const pending = f.tools.semanticSearch({ query: 'fixture', cues: [] });
  const rejected = assert.rejects(pending, /geçersiz yanıt/);
  assert.doesNotThrow(() => f.children[0].stdout.emit('data', 'null\n'));
  await rejected;
  const next = f.tools.semanticSearch({ query: 'next', cues: [] });
  f.children.at(-1).stdout.emit('data', '{"ok":true,"results":[]}\n');
  assert.equal((await next).results.length, 0);
});

test('oversized unterminated semantic reply retires worker and rejects every waiting query', async () => {
  const f = fixture();
  const first = f.tools.semanticSearch({ query: 'one', cues: [] });
  const second = f.tools.semanticSearch({ query: 'two', cues: [] });
  const rejected = Promise.all([assert.rejects(first, /çok büyük/), assert.rejects(second, /çok büyük/)]);
  f.children[0].stdout.emit('data', 'x'.repeat(5 * 1024 * 1024 + 1));
  // Deliberately do not await a permanently unresolved reply in broken code.
  assert.equal(f.children[0].killed, true);
  await rejected;
  const recovered = f.tools.semanticSearch({ query: 'three', cues: [] });
  assert.equal(f.children.length, 2);
  f.children[0].stdout.emit('data', '{"ok":true,"results":["stale"]}\n');
  f.children[0].emit('close', 1);
  f.children[1].stdout.emit('data', '{"ok":true,"results":[]}\n');
  assert.equal((await recovered).results.length, 0);
});

test('a complete oversized semantic line is rejected before JSON parsing', async () => {
  const f = fixture();
  const pending = f.tools.semanticSearch({ query: 'one', cues: [] });
  const rejected = assert.rejects(pending, /çok büyük/);
  f.children[0].stdout.emit('data', JSON.stringify({ ok: true, text: 'x'.repeat(5 * 1024 * 1024) }) + '\n');
  assert.equal(f.children[0].killed, true);
  await rejected;
});
