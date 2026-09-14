'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  browserScriptExecutionReady,
  isBrowserScriptContextLoss,
  isMainDocumentNavigation,
} = require('../src/browser-script-execution');

function contents({ destroyed = false, loading = false } = {}) {
  return {
    isDestroyed: () => destroyed,
    isLoading: () => loading,
  };
}

assert.equal(browserScriptExecutionReady(null), false);
assert.equal(browserScriptExecutionReady(contents({ destroyed: true })), false);
assert.equal(browserScriptExecutionReady(contents({ loading: true })), false,
  'yükleme sürerken executeJavaScript did-stop-loading dinleyicisi biriktirmemeli');
assert.equal(browserScriptExecutionReady(contents()), true);
assert.equal(browserScriptExecutionReady({ ...contents(), getURL: () => '' }), false,
  'henüz adresi olmayan WebContents Electron bekleme kuyruğuna alınmamalı');
assert.equal(browserScriptExecutionReady({ ...contents(), isLoadingMainFrame: () => true }), false);
assert.equal(browserScriptExecutionReady({
  isDestroyed() { throw new Error('kapandı'); },
  isLoading: () => false,
}), false);

for (const message of [
  'Execution context was destroyed, most likely because of a navigation.',
  'Render frame was disposed before WebFrameMain could be accessed',
  'Object has been destroyed',
  'net::ERR_ABORTED',
]) {
  assert.equal(isBrowserScriptContextLoss(new Error(message)), true, message);
}
assert.equal(isBrowserScriptContextLoss(new Error('Unexpected token }')), false,
  'gerçek betik hatası yaşam döngüsü yarışı diye gizlenmemeli');
assert.equal(isBrowserScriptContextLoss(new Error('Script failed to execute')), false,
  'genel Electron betik hatası tek başına bağlam kaybı sayılmamalı');

assert.equal(isMainDocumentNavigation({ isMainFrame: true, isSameDocument: false }), true);
assert.equal(isMainDocumentNavigation({ isMainFrame: false, isSameDocument: false }), false,
  'alt iframe gezinmesi üst belge yaşam döngüsü sayılmamalı');
assert.equal(isMainDocumentNavigation({ isMainFrame: true, isSameDocument: true }), false,
  'pushState/hash gezinmesi belge yaşam döngüsü sayılmamalı');
assert.equal(isMainDocumentNavigation({}, false, true), true,
  'eski Electron olay imzası korunmalı');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
assert.match(main, /function browserFrames\([\s\S]*browserScriptExecutionReady\(view\.webContents\)/u);
assert.match(main, /async function browserTabRuntimeState\([\s\S]*browserScriptExecutionReady\(wc\)/u);
const didStart = main.slice(main.indexOf("wc.on('did-start-navigation'"), main.indexOf("wc.on('did-stop-loading'"));
assert.match(didStart, /isMainDocumentNavigation/u,
  'üst belge sıfırlaması ana-frame ve yeni-belge kapısından geçmeli');
assert.doesNotMatch(didStart, /applyBrowserOverlay\(/u,
  'yükleme başlarken katman betiği çalıştırılmamalı');

const trustedStart = main.indexOf('async function executeBrowserTrustedMain(');
const trustedEnd = main.indexOf('function clearBrowserCloudflareTimer(', trustedStart);
const executeBrowserTrustedMain = require('node:vm').runInNewContext(
  main.slice(trustedStart, trustedEnd) + '\nexecuteBrowserTrustedMain', {
    BROWSER_ISOLATED_WORLD_ID: 999,
    browserScriptExecutionReady,
    isBrowserScriptContextLoss,
    withTimeout: promise => promise,
  });
const genuineScriptError = new Error('Unexpected token }');
const trustedView = { webContents: {
  isDestroyed: () => false,
  isLoading: () => false,
  getURL: () => 'https://example.test/',
  executeJavaScriptInIsolatedWorld: async () => { throw genuineScriptError; },
} };

(async () => {
  await assert.rejects(() => executeBrowserTrustedMain(trustedView, 'bad'), /Unexpected token/,
    'gerçek betik hatası yaşam döngüsü kolundaki başka bir ReferenceError ile ezilmemeli');
  console.log('browser-script-execution tests: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
