'use strict';

// Real Electron regression: a slow image must not delay CSS or fetch scriptlets
// until did-stop-loading. No external network, account, or real profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { app, BrowserWindow } = require('electron');
const { createBrowserAdblock } = require('../src/browser-adblock');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-adblock-smoke-'));
app.setPath('userData', temp);
let win, server, controller;
const sockets = new Set();

async function run() {
  await app.whenReady();
  const { ElectronBlocker } = require('@ghostery/adblocker-electron');
  const engine = ElectronBlocker.parse('127.0.0.1###home-ad\n127.0.0.1##+js(audit-loading)'
    + '\n127.0.0.1##+js(audit-second)');
  engine.updateResources(JSON.stringify({ redirects: [], scriptlets: [{
    name: 'audit-loading.js', aliases: [], dependencies: ['first-helpers.fn'],
    body: 'function auditLoading() { window.__adblockLoadingState = document.readyState;'
      + ' window.__firstAudit = () => sharedDependency(); }',
  }, {
    name: 'audit-second.js', aliases: [], dependencies: ['second-helpers.fn'],
    body: 'function auditSecond() { window.__secondAudit = () => sharedDependency(); }',
  }, {
    name: 'first-helpers.fn', aliases: [], dependencies: [],
    body: 'class JSONPath {} function sharedDependency() { return 1; }',
  }, {
    name: 'second-helpers.fn', aliases: [], dependencies: [],
    body: 'class JSONPath {} function sharedDependency() { return 2; }',
  }] }), 'fixture-v1');
  const cachePath = path.join(temp, 'engine.bin');
  fs.writeFileSync(cachePath, engine.serialize());
  controller = createBrowserAdblock({ cachePath, isSitePaused: () => false });
  win = new BrowserWindow({ show: false, webPreferences: {
    partition: `adblock-smoke-${process.pid}`, sandbox: true, contextIsolation: true, nodeIntegration: false,
  } });
  const state = await controller.setEnabled(win.webContents.session, true);
  assert.equal(state.enabled, true, state.error);
  let releaseImage;
  server = http.createServer((req, res) => {
    if (req.url === '/slow-image') {
      releaseImage = () => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(); };
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Adblock fixture</title><div id="home-ad">Sponsored</div>'
      + '<div id="normal-video">Normal video</div><img src="/slow-image">');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const navigation = win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await new Promise(resolve => win.webContents.once('dom-ready', resolve));
  let result;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    result = await win.webContents.mainFrame.executeJavaScript(`({
      scriptState: window.__adblockLoadingState,
      first: window.__firstAudit?.(), second: window.__secondAudit?.(),
      currentState: document.readyState,
      adDisplay: getComputedStyle(document.getElementById('home-ad')).display,
      contentDisplay: getComputedStyle(document.getElementById('normal-video')).display
    })`);
    if (result.scriptState && result.adDisplay === 'none') break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(result.currentState, 'interactive', 'slow resource should still hold the load event');
  assert.notEqual(result.scriptState, undefined, 'scriptlet did not run while loading');
  assert.notEqual(result.scriptState, 'complete', 'scriptlet waited until full load');
  assert.equal(result.adDisplay, 'none', 'homepage cosmetic filter was delayed');
  assert.notEqual(result.contentDisplay, 'none', 'ordinary video must stay visible');
  assert.equal(result.first, 1, 'later scriptlet overwrote a helper used by the first one');
  assert.equal(result.second, 2, 'duplicate dependency declaration prevented the second scriptlet');
  releaseImage();
  await navigation;
  await controller.setEnabled(win.webContents.session, false);
  console.log('electron-adblock: early frame scriptlet + homepage CSS + ordinary content passed', result);
}

const watchdog = setTimeout(() => { console.error('adblock smoke timed out'); app.exit(1); }, 15000);
run().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) {
  clearTimeout(watchdog);
  if (win && !win.isDestroyed()) win.destroy();
  for (const socket of sockets) socket.destroy();
  server?.close();
  // Profile/cache is under the unique OS temp directory, never the user's profile.
  const resolvedTemp = path.resolve(temp);
  if (path.dirname(resolvedTemp) === path.resolve(os.tmpdir())
      && path.basename(resolvedTemp).startsWith('whisper-adblock-smoke-')) {
    try { fs.rmSync(resolvedTemp, { recursive: true, force: true }); } catch (_) {}
  }
  app.exit(code);
}
