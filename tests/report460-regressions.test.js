'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { EventEmitter } = require('node:events');
const { registerDubService } = require('../src/dub-service');
const { voiceStorage } = require('../src/voice-storage');
const tick = () => new Promise(setImmediate);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r460-'));
  const engine = path.join(root, 'Ses', 'VoxCPM2');
  for (const name of ['.venv/Scripts/python.exe', 'kitap_ortak.py', 'anlatici_ham.wav', 'anlatici_ham.txt']) {
    const file = path.join(engine, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'fixture');
  }
  const srt = path.join(root, 'Türkçe.srt'); fs.writeFileSync(srt, 'original subtitle');
  fs.writeFileSync(path.join(root, 'dub-settings.json'), JSON.stringify({ timingMode: 'clip' }));
  const app = new EventEmitter(); app.getPath = () => root;
  const handlers = {}, children = [], events = [];
  const sender = { id: 7, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  const service = registerDubService({ app, ipcMain: { handle: (key, fn) => { handlers[key] = fn; } },
    authorized: () => true, busy: () => false, environment: () => ({}), grantMedia() {},
    authorizeSubtitle: async value => value, terminate: async () => true,
    spawn(_exe, args) {
      const child = new EventEmitter(); child.exitCode = child.signalCode = null; child.args = args;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdout.setEncoding = child.stderr.setEncoding = child.stderr.resume = () => {};
      children.push(child); return child;
    }, ...overrides });
  return { root, app, srt, children, events, service,
    call: (key, value) => handlers[key]({ sender }, value),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('overlapping cancellation requests share termination and preserve cancelled completion', async () => {
  const stopped = deferred(); let calls = 0;
  const f = fixture({ terminate: () => { calls++; return calls === 1 ? stopped.promise : Promise.reject(Error('second termination failed')); } });
  try {
    assert.equal((await f.call('dub:start', { id: 'cancel-shared', srt: f.srt })).ok, true);
    const first = f.call('dub:cancel'), second = f.call('dub:cancel');
    await tick();
    assert.equal(calls, 1, 'duplicate cancellation must not launch another process termination');
    stopped.resolve(true);
    assert.equal((await first).ok, true); assert.equal((await second).ok, true);
    assert.equal(f.service.running(), true, 'ownership stays locked until child close');
    assert.equal((await f.call('dub:cancel')).ok, true);
    assert.equal(calls, 1, 'successful stop remains shared while waiting for close');
    const child = f.children[0], output = child.args[child.args.indexOf('--output') + 1];
    fs.writeFileSync(output, 'late audio');
    child.emit('close', 0);
    assert.equal(f.events.at(-1).type, 'cancelled');
    assert.equal(fs.existsSync(output), false);
  } finally { stopped.resolve(true); f.dispose(); }
});

test('a failed termination can be retried and never unlocks the running job', async () => {
  let calls = 0;
  const f = fixture({ terminate: async () => ++calls !== 1 });
  try {
    await f.call('dub:start', { id: 'retry-cancel', srt: f.srt });
    assert.equal((await f.call('dub:cancel')).ok, false);
    assert.equal(f.service.running(), true);
    assert.equal((await f.call('dub:cancel')).ok, true);
    assert.equal(calls, 2);
    f.children[0].emit('close', 1);
    assert.equal(f.events.at(-1).type, 'cancelled');
  } finally { f.dispose(); }
});

test('background separation and speech generation consume the same immutable subtitle snapshot', async () => {
  let backgroundSrt, backgroundText;
  const f = fixture({ prepareBackground: async ({ srt, output }) => {
    fs.writeFileSync(f.srt, 'edited while production is starting');
    backgroundSrt = srt; backgroundText = fs.readFileSync(srt, 'utf8');
    fs.writeFileSync(output, 'background fixture');
  } });
  try {
    assert.equal((await f.call('dub:start', { id: 'snapshot', srt: f.srt, keepBackground: true })).ok, true);
    const child = f.children[0];
    assert.equal(backgroundSrt, child.args[1]);
    assert.equal(backgroundText, 'original subtitle');
    assert.equal(fs.readFileSync(child.args[1], 'utf8'), backgroundText);
    assert.ok(backgroundSrt.startsWith(voiceStorage(f.app).input + path.sep));
    child.emit('close', 1);
  } finally { f.dispose(); }
});
