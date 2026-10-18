'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { buildBrowserMediaProbeScript } = require('../src/browser-media-controller');

test('media added beyond the observer cap is discovered without unbounded observers or scans', () => {
  let now = 10000;
  let scans = 0;
  const observed = new Set();
  class MutationObserver {
    observe(root) { this.root = root; observed.add(root); }
    disconnect() { observed.delete(this.root); }
  }
  const hosts = Array.from({ length: 128 }, () => {
    const host = { nodeType: 1, children: [], isConnected: true };
    host.shadowRoot = { nodeType: 11, host, children: [], querySelectorAll() { return this.children; } };
    return host;
  });
  const document = { nodeType: 9, children: hosts, querySelectorAll() { scans++; return []; } };
  const context = { window: {}, document, MutationObserver, Date: { now: () => now } };
  vm.runInNewContext(buildBrowserMediaProbeScript(), context);
  const controller = context.window.__whisperMediaController;
  const video = { nodeType: 1, isConnected: true, tagName: 'VIDEO', paused: true, ended: false,
    clientWidth: 640, clientHeight: 360, currentTime: 7, duration: 90,
    playbackRate: 1, style: {}, addEventListener() {} };
  assert.equal(observed.has(hosts[127].shadowRoot), false);
  hosts[127].shadowRoot.children.push(video);
  now += 1000;
  assert.equal(controller.select(), video);
  const afterDiscovery = scans;
  for (let i = 0; i < 100; i++) controller.select();
  assert.equal(scans, afterDiscovery, 'fallback scans must be throttled');
  assert.equal(observed.size, 128);
  hosts[0].isConnected = false;
  const pendingRoot = hosts[127].shadowRoot;
  hosts.shift();
  now += 1000;
  controller.select();
  assert.equal(observed.has(pendingRoot), true, 'freed capacity should observe pending roots');
  assert.equal(observed.size, 128);
});

test('default Python inventory includes backend and audio tool regression tests', () => {
  const { findPythonTestFiles } = require('./python-runtime');
  const files = findPythonTestFiles();
  for (const name of ['test_dub_timing.py', 'test_dub_plan_regressions.py',
    'test_background_cache_regressions.py', 'test_browser_align_validation444.py']) {
    assert.ok(files.includes(`tests/${name}`), name);
  }
  assert.ok(files.includes('backend/test_transcribe.py'));
  assert.deepEqual(files, [...files].sort());
  assert.equal(new Set(files).size, files.length);
});

test('main test runner executes discovered Python files and propagates their failure', () => {
  const calls = [];
  let exitCode;
  const pythonFiles = ['backend/test_example.py', 'tests/test_audio.py'];
  const runner = fs.readFileSync(path.join(__dirname, 'run-all.js'), 'utf8');
  vm.runInNewContext(runner, {
    __dirname,
    console: { log() {} },
    process: { execPath: process.execPath, exit(code) { exitCode = code; } },
    require(name) {
      if (name === 'path') return path;
      if (name === 'fs') return { readdirSync: () => ['example.test.js'] };
      if (name === './python-runtime') return {
        findTestPython: () => 'python-fixture', findPythonTestFiles: () => pythonFiles,
      };
      if (name === 'child_process') return { spawnSync(command, args) {
        calls.push([command, ...args]);
        return { status: args[0].endsWith('test_audio.py') ? 1 : 0 };
      } };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  assert.deepEqual(calls.map(call => path.basename(call[1])),
    ['example.test.js', 'test_example.py', 'test_audio.py']);
  assert.equal(exitCode, 1);
});
