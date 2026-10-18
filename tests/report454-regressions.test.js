'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { registerDubService } = require('../src/dub-service');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r454-'));
  const engine = path.join(root, 'Ses', 'VoxCPM2');
  for (const name of ['.venv/Scripts/python.exe', 'kitap_ortak.py', 'anlatici_ham.wav', 'anlatici_ham.txt']) {
    const target = path.join(engine, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, 'fixture');
  }
  const srt = path.join(root, 'Türkçe.srt'); fs.writeFileSync(srt, 'fixture');
  fs.writeFileSync(path.join(root, 'dub-settings.json'), JSON.stringify({ timingMode: 'clip' }));
  const app = new EventEmitter(); app.getPath = () => root;
  const handlers = {}, children = [], events = [];
  const sender = new EventEmitter(); sender.id = 7; sender.isDestroyed = () => false;
  sender.send = (_channel, event) => events.push(event);
  const service = registerDubService({ app, ipcMain: { handle: (key, fn) => { handlers[key] = fn; } },
    authorized: () => true, busy: () => false, environment: () => ({}), grantMedia() {},
    authorizeSubtitle: async value => value, shorten: async text => text,
    terminate: async () => true,
    spawn() {
      const child = new EventEmitter(); child.exitCode = child.signalCode = null;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdout.setEncoding = child.stderr.setEncoding = child.stderr.resume = () => {};
      children.push(child); return child;
    }, ...overrides });
  return { root, srt, children, sender, service, events,
    call: (key, data) => handlers[key]({ sender }, data),
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function result(child, text) {
  child.stdout.emit('data', JSON.stringify({ sourceHash: 'fixture', groups: [{ key: '1', text, seconds: 2 }] }));
  child.exitCode = 0; child.emit('close', 0);
}

test('a late older plan cannot overwrite the latest sender plan', async () => {
  const f = fixture();
  try {
    await f.call('dub:references');
    const old = f.call('dub:plan', { srt: f.srt }); await tick();
    const latest = f.call('dub:plan', { srt: f.srt }); await tick();
    result(f.children[1], 'latest'); assert.equal((await latest).ok, true);
    result(f.children[0], 'obsolete'); await old;
    assert.equal((await f.call('dub:shorten', '1')).text, 'latest');
  } finally { f.close(); }
});

test('a failed replacement plan cannot leave the previous plan available for shortening', async () => {
  const f = fixture();
  try {
    await f.call('dub:references');
    const first = f.call('dub:plan', { srt: f.srt }); await tick(); result(f.children[0], 'old'); await first;
    const replacement = f.call('dub:plan', { srt: f.srt }); await tick();
    f.children[1].emit('close', 1); assert.equal((await replacement).ok, false);
    assert.equal((await f.call('dub:shorten', '1')).ok, false);
  } finally { f.close(); }
});

test('cancellation tracks its captured process even if background completion clears ownership', async () => {
  const prepared = deferred(), entered = deferred(); let options;
  const child = { exitCode: null, signalCode: null };
  const f = fixture({
    prepareBackground: async value => { options = value; value.onProcess(child); entered.resolve(); await prepared.promise; },
    terminate: async () => { child.exitCode = 0; options.onProcess(null); return false; },
  });
  try {
    const pending = f.call('dub:start', { id: 'cancel-race', srt: f.srt, keepBackground: true });
    await entered.promise;
    const cancelled = await f.call('dub:cancel');
    prepared.resolve(); await pending;
    assert.equal(cancelled.ok, true, cancelled.error);
    assert.equal(f.events.at(-1).type, 'cancelled');
    assert.equal(f.children.length, 0, 'cancelled background must not start TTS');
  } finally { prepared.resolve(); f.close(); }
});

test('destroyed sender cannot publish a plan or keep a prior plan available', async () => {
  let terminated = 0;
  const f = fixture({ terminate: async () => { terminated++; return true; } });
  try {
    await f.call('dub:references');
    const first = f.call('dub:plan', { srt: f.srt }); await tick(); result(f.children[0], 'old'); await first;
    const pending = f.call('dub:plan', { srt: f.srt }); await tick();
    f.sender.isDestroyed = () => true; f.sender.emit('destroyed'); await tick();
    result(f.children[1], 'late');
    assert.equal((await pending).ok, false);
    assert.equal((await f.call('dub:shorten', '1')).ok, false);
    assert.equal(terminated, 1);
  } finally { f.close(); }
});

test('replacement during subtitle authorization never spawns an obsolete planner', async () => {
  const authorization = deferred(); let count = 0;
  const f = fixture({ authorizeSubtitle: async value => { if (++count === 1) await authorization.promise; return value; } });
  try {
    await f.call('dub:references');
    const old = f.call('dub:plan', { srt: f.srt }); await tick();
    const current = f.call('dub:plan', { srt: f.srt }); await tick();
    assert.equal(f.children.length, 1); result(f.children[0], 'latest'); await current;
    authorization.resolve(); assert.equal((await old).ok, false);
    assert.equal(f.children.length, 1);
    assert.equal((await f.call('dub:shorten', '1')).text, 'latest');
  } finally { authorization.resolve(); f.close(); }
});
