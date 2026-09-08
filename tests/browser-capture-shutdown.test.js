const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const drainBodyStart = main.indexOf('async function drainBrowserCaptureBeforeClose(');
const drainBodyEnd = main.indexOf('async function flushBrowserSession(', drainBodyStart);
const drainBody = main.slice(drainBodyStart, drainBodyEnd);

assert.match(drainBody, /executeBrowserFrames\(browserCapturePauseScript\(\)\)/);
assert.match(drainBody, /pass < 4/);
assert.match(drainBody, /flushBrowserCaptureQueue\(\{ allowHidden: true, force: true, installHook: false \}\)/);
assert.match(main, /captureStatus = await withTimeout\(drainBrowserCaptureBeforeClose\(\), BROWSER_CLOSE_DRAIN_TIMEOUT/);
assert.match(main, /buttons: \['Kapatmayı iptal et', 'Yine de kapat'\]/);
assert.ok(main.indexOf('captureStatus = await withTimeout(drainBrowserCaptureBeforeClose()')
  < main.indexOf('destroyBrowserView();', main.indexOf("mainWindow.on('close'")),
'browser görünümü drain tamamlanmadan yok ediliyor');

console.log('browser-capture-shutdown: 1 test');
