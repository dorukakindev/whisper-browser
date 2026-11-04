'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const start = source.indexOf('let browserOcclusionApplied = false;');
const end = source.indexOf('\nfunction openManagedModal', start);

test('opening a toolbar menu hides the native page without waiting for a snapshot; closing rejects the stale frame', async () => {
  const dom = new JSDOM('<div id="playerLayer"></div><div id="browserViewSlot"></div><div id="playerSide"></div>', { runScripts: 'outside-only' });
  try {
    const w = dom.window, calls = [];
    let resolveShot;
    w.api = { snapshotBrowserPage: () => new Promise(resolve => { resolveShot = resolve; }), setBrowserOccluded: async value => { calls.push(value); return { ok: true }; } };
    w.$ = id => w.document.getElementById(id);
    w.player = { workspaceMode: 'browser' };
    w.requestAnimationFrame = callback => callback();
    w.eval(source.slice(start, end) + '\nwindow.applyOcclusion = applyBrowserOcclusion;');
    const opened = w.applyOcclusion(true);
    assert.deepEqual(calls, [true], 'native hiding must begin while capture is still unresolved');
    await opened;
    await w.applyOcclusion(false);
    resolveShot({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [true, false]);
    assert.equal(w.$('browserViewSlot').classList.contains('browser-frozen'), false);
    assert.equal(w.$('browserViewSlot').style.getPropertyValue('--browser-freeze-image'), '');
  } finally { dom.window.close(); }
});

test('a delayed snapshot paints only the still-open menu and capture failure never prevents hiding', async () => {
  const dom = new JSDOM('<div id="playerLayer"></div><div id="browserViewSlot"></div><div id="playerSide"></div>', { runScripts: 'outside-only' });
  try {
    const w = dom.window, calls = [];
    let resolveShot;
    w.api = { snapshotBrowserPage: () => new Promise(resolve => { resolveShot = resolve; }), setBrowserOccluded: async value => { calls.push(value); } };
    w.$ = id => w.document.getElementById(id);
    w.player = { workspaceMode: 'browser' };
    w.eval(source.slice(start, end) + '\nwindow.applyOcclusion = applyBrowserOcclusion;');
    await w.applyOcclusion(true);
    resolveShot({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(w.$('browserViewSlot').classList.contains('browser-frozen'), true);
    await w.applyOcclusion(false);
    w.api.snapshotBrowserPage = () => Promise.reject(new Error('capture unavailable'));
    await w.applyOcclusion(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [true, false, true]);
    assert.equal(w.$('browserViewSlot').classList.contains('browser-frozen'), false);
  } finally { dom.window.close(); }
});
