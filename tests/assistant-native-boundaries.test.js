'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { registerNativePlayer } = require('../src/native-player');

test('overlay preload exposes only action/snapshot and subscription can be removed independently', () => {
  const ipc = new EventEmitter(), sent = []; let exposed;
  ipc.send = (...args) => sent.push(args);
  const file = path.join(__dirname, '../src/assistant-overlay-preload.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(name) {
      assert.equal(name, 'electron');
      return { ipcRenderer: ipc, contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'assistant'); exposed = value; } } };
    },
  }, { filename: file });
  assert.deepEqual(Object.keys(exposed).sort(), ['action', 'subscribe']);
  assert.throws(() => exposed.subscribe(null), /listener must be a function/);
  const values = [], other = [];
  const stop = exposed.subscribe(value => values.push(value));
  const stopOther = exposed.subscribe(value => other.push(value));
  const event = { sender: 'must not reach renderer' }, payload = { text: 'İstanbul' };
  ipc.emit('assistant:snapshot', event, payload);
  assert.deepEqual(values, [payload]);
  stop(); stop();
  ipc.emit('assistant:snapshot', event, payload);
  assert.equal(values.length, 1); assert.equal(other.length, 2);
  stopOther(); assert.equal(ipc.listenerCount('assistant:snapshot'), 0);
  exposed.action('send', 'question', { sourceToken: 'page-1', requestId: 'r1', apiKey: 'not-forwarded' });
  assert.equal(sent[0][0], 'assistant:action');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0][1])), { action: 'send', text: 'question', sourceToken: 'page-1', requestId: 'r1' });
});

test('native player rejects unauthorized calls before source access and handles canceled engine selection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-boundary-'));
  const app = new EventEmitter(); app.getPath = () => dir;
  const handlers = new Map(); let selects = 0, mediaAccess = 0;
  const good = {};
  try {
    const player = registerNativePlayer({ app, ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
      owner: () => null, authorized: event => event === good,
      authorizeMedia: async () => { mediaAccess++; throw Error('Unexpected source access'); },
      dialog: { showOpenDialog: async () => { selects++; return { canceled: true }; } },
      BrowserWindow: class { constructor() { throw Error('Unexpected native window'); } },
      torrents: { nativeSource() { throw Error('Unexpected torrent access'); } },
    });
    assert.equal(handlers.get('native-player:request'), player.handler);
    for (const action of ['start', 'stop', 'choose', 'snapshot', 'command']) {
      assert.deepEqual(await player.handler({}, { action, path: 'private.mp4' }), { ok: false, error: 'Unauthorized request.' });
    }
    assert.equal(selects, 0); assert.equal(mediaAccess, 0);
    assert.deepEqual(await player.handler(good, { action: 'choose' }), { ok: true, canceled: true });
    assert.equal(selects, 1); assert.equal(fs.readdirSync(dir).length, 0);
    assert.deepEqual(await player.handler(good, { action: 'stop' }), { ok: true });
    const stale = await player.handler(good, { action: 'command', key: 'old', generation: 1 });
    assert.equal(stale.ok, false); assert.match(stale.error, /source changed/);
    await player.stop(); app.emit('before-quit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
