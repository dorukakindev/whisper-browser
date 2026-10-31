'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const media = require('../src/browser-media-controller');
const hints = require('../src/browser-link-hints');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r815-native-'));
app.setPath('userData', path.join(root, 'profile'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let window, first, other;
const observations = [];
app.whenReady().then(async () => {
  try {
    const respond = (_, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><style>video{width:320px;height:180px}</style><body></body>'); };
    first = http.createServer(respond); other = http.createServer(respond); await listen(first); await listen(other);
    const base = `http://127.0.0.1:${first.address().port}`, foreign = `http://127.0.0.1:${other.address().port}`;
    window = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' } });
    const wc = window.webContents, evaljs = script => wc.executeJavaScript(script, true);
    const fresh = async html => { await wc.loadURL(base); await evaljs(`document.body.innerHTML=${JSON.stringify(html)};true`); };
    await fresh('<div id="host"></div>'); assert.equal(await evaljs(media.buildBrowserMediaProbeScript()), null);
    await evaljs("document.getElementById('host').attachShadow({mode:'open'}).innerHTML='<video></video>';true"); await wait(1050); assert(await evaljs(media.buildBrowserMediaProbeScript())); observations.push({ id: 'B59', passed: true, discoveryBoundMs: 1000 });
    await fresh('<video id="small"></video><video id="large" style="width:800px;height:400px;visibility:hidden"></video>');
    assert.equal((await evaljs(media.buildBrowserMediaProbeScript())).area, 320 * 180); observations.push({ id: 'B60', passed: true });
    const old = await evaljs(media.buildBrowserMediaProbeScript()); await evaljs("document.body.innerHTML='<video id=replacement></video>';true");
    assert((await evaljs(media.buildBrowserMediaCommandScript('loop', 0, old.docToken))).stale); assert.equal(await evaljs("document.getElementById('replacement').loop"), false); observations.push({ id: 'B61', passed: true });
    await fresh('<video id="v"></video>'); await evaljs(media.buildBrowserMediaCommandScript('dub-rate', { rate: .5, baseRate: 1 }));
    await evaljs("document.getElementById('v').src='/new-source.mp4';true"); await wait(100); assert.equal(await evaljs("document.getElementById('v').playbackRate"), 1); observations.push({ id: 'B62', passed: true });
    await fresh(`<button onclick="window.topClicks=(window.topClicks||0)+1">Top</button><iframe src="${foreign}/frame"></iframe>`); await wait(200);
    const child = wc.mainFrame.framesInSubtree.find(frame => frame !== wc.mainFrame); assert(child);
    await child.executeJavaScript("document.body.innerHTML='<button onclick=\"window.childClicks=(window.childClicks||0)+1\">Child</button>';true", true);
    await evaljs(hints.buildBrowserLinkHintsScript({ session: 'native-fixture', prefix: 'a' })); await child.executeJavaScript(hints.buildBrowserLinkHintsScript({ session: 'native-fixture', prefix: 's' }), true);
    assert.deepEqual(await evaljs("[...document.querySelectorAll('[data-whisper-link-hints] span')].map(x=>x.textContent)"), ['AA']);
    assert.deepEqual(await child.executeJavaScript("[...document.querySelectorAll('[data-whisper-link-hints] span')].map(x=>x.textContent)", true), ['SA']);
    for (const key of ['s', 'a']) { await evaljs(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}));true`); await wait(50); }
    assert.equal(await evaljs('window.topClicks||0'), 0); assert.equal(await child.executeJavaScript('window.childClicks||0', true), 1);
    assert.equal(await evaljs("!!document.querySelector('[data-whisper-link-hints]')"), false); assert.equal(await child.executeJavaScript("!!document.querySelector('[data-whisper-link-hints]')", true), false);
    observations.push({ id: 'B64', passed: true, crossOriginFrame: true });
    console.log(JSON.stringify({ electron: process.versions.electron, observations }));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally {
    window?.destroy(); first?.close(); other?.close();
    try { fs.rmSync(root, { recursive: true, force: true }); }
    catch (_) { console.log(`Temporary Chromium profile remains locked until process exit: ${root}`); }
    app.exit(process.exitCode || 0);
  }
});
