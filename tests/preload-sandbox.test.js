const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MAX_SESSION_TABS } = require('../src/browser-session-store');

const calls = [];
let api;
const electron = {
  contextBridge: { exposeInMainWorld(name, value) { assert.strictEqual(name, 'api'); api = value; } },
  ipcRenderer: {
    invoke(...args) { calls.push(args); return Promise.resolve({ ok: true }); },
    on() {}, removeListener() {}, send() {}, sendSync() {},
  },
  webUtils: { getPathForFile: () => 'example.mp4' },
};
// Sandboxed Electron preloads cannot require relative CommonJS modules.
// Execute the entire preload with that boundary, rather than just parsing it.
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8'), {
  require(name) {
    if (name === 'electron') return electron;
    throw new Error(`Sandbox preload cannot load: ${name}`);
  },
});
assert.ok(api, 'The renderer must receive its API before installing button handlers');
assert.strictEqual(api.browserLimits.maxTabs, MAX_SESSION_TABS);
api.selectVideo();
api.startTranscribe({ input: 'example.mp4' });
api.cancelTranscribe();
assert.deepStrictEqual(calls.map(call => call[0]), ['dialog:openVideo', 'transcribe:start', 'transcribe:cancel']);
console.log('Sandbox preload boot and primary button IPC contracts passed.');
