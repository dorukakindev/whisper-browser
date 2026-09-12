'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  captureBodyFingerprint,
  shouldRetryCaptureResponseBody,
} = require('../src/browser-capture-recovery');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function generatedScriptFactory(name, nextName, context = {}) {
  const start = main.indexOf('function ' + name + '(');
  const end = main.indexOf('\nfunction ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, name + ' kaynakta bulunamadı');
  vm.createContext(context);
  return vm.runInContext('(' + main.slice(start, end) + ')', context);
}

const prefix = 'A'.repeat(120);
const suffix = 'Z'.repeat(120);
const first = prefix + 'X' + suffix;
const corrected = prefix + 'Y' + suffix;

assert.equal(first.length, corrected.length);
assert.notEqual(captureBodyFingerprint(first), captureBodyFingerprint(corrected),
  'eşit boylu orta bölüm düzeltmesi aynı parmak izine düştü');
assert.equal(captureBodyFingerprint(first), captureBodyFingerprint(first),
  'aynı gövde kararlı parmak izi üretmedi');

for (const candidate of [
  { mimeType: 'text/vtt', url: 'https://cdn.test/data' },
  { mimeType: 'application/ttml+xml', url: 'https://cdn.test/data' },
  { mimeType: 'application/octet-stream', url: 'https://cdn.test/subtitle.srt?x=1' },
  { mimeType: 'application/dash+xml', url: 'https://cdn.test/video' },
  { mimeType: 'application/json', url: 'https://cdn.test/api/timedtext?v=1&fmt=json3' },
  { mimeType: 'application/json', url: 'https://cdn.test/transcripts/tr' },
  { mimeType: 'text/plain', url: 'https://cdn.test/cc/tr' },
  { mimeType: 'application/octet-stream', url: 'https://cdn.test/sub/en' },
]) {
  assert.equal(shouldRetryCaptureResponseBody(candidate), true);
}
assert.equal(shouldRetryCaptureResponseBody({
  mimeType: 'application/json', url: 'https://cdn.test/catalog',
}), false, 'genel JSON gövdesi gereksiz CDP retry sınıfına girdi');
assert.equal(shouldRetryCaptureResponseBody({
  mimeType: 'application/json', url: 'https://cdn.test/api?cc=US',
}), false, 'ülke kodu sorgusu altyazı rotası sanıldı');
assert.equal(shouldRetryCaptureResponseBody({
  mimeType: 'video/mp4', url: 'https://cdn.test/video.mp4',
}), false, 'video gövdesi timed-text retry sınıfına girdi');

class MockXhr {
  constructor() {
    this.responseType = '';
    this.responseText = '';
    this.responseURL = '';
    this.mimeType = 'text/vtt';
    this.listeners = new Map();
  }

  open() {}
  send() {}
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  getResponseHeader(name) { return name === 'content-type' ? this.mimeType : ''; }
  emitLoadEnd(body, url, mimeType = this.mimeType) {
    this.responseText = body;
    this.responseURL = url;
    this.mimeType = mimeType;
    this.listeners.get('loadend')?.();
  }
}

const pageContext = {
  window: { location: { hostname: 'www.hulu.com' } },
  XMLHttpRequest: MockXhr,
  crypto: { randomUUID: () => 'frame-test' },
  performance: { now: () => 0 },
};
const hookFactory = generatedScriptFactory('browserCaptureHookScript',
  'browserCaptureDrainScript', { captureBodyFingerprint });
vm.runInNewContext(hookFactory(), pageContext);
const url = 'https://cdn.test/timedtext/recovery.vtt';
for (const body of [first, corrected]) {
  const xhr = new pageContext.XMLHttpRequest();
  xhr.open('GET', url);
  xhr.send();
  xhr.emitLoadEnd(body, url);
}
assert.equal(pageContext.window.__whisperCaptureQueue.length, 2,
  'ortası düzeltilen aynı boylu ikinci gövde sayfa kancasında elendi');

const huluPlaylistUrl = 'https://play.hulu.com/v6/playlist';
const huluPlaylistXhr = new pageContext.XMLHttpRequest();
huluPlaylistXhr.open('POST', huluPlaylistUrl);
huluPlaylistXhr.send();
huluPlaylistXhr.emitLoadEnd('{"transcripts":[]}', huluPlaylistUrl, 'application/json');
assert.equal(pageContext.window.__whisperCaptureQueue.length, 3,
  'Hulu playlist JSON yanıtı sayfa içi XHR kancasında yakalanmadı');

const genericContext = {
  window: { location: { hostname: 'example.com' } },
  XMLHttpRequest: MockXhr,
  crypto: { randomUUID: () => 'generic-frame' },
  performance: { now: () => 0 },
};
vm.runInNewContext(hookFactory(), genericContext);
const genericPlaylistXhr = new genericContext.XMLHttpRequest();
genericPlaylistXhr.open('GET', 'https://example.com/v6/playlist');
genericPlaylistXhr.send();
genericPlaylistXhr.emitLoadEnd('{"items":[]}', 'https://example.com/v6/playlist', 'application/json');
assert.equal(genericContext.window.__whisperCaptureQueue.length, 0,
  'Hulu dışındaki genel playlist JSON yanıtı sayfa kancasında yakalandı');

pageContext.window.__whisperCaptureInFlight.set('frame-test:1', {
  deliveryId: 'old-delivery', at: 1,
});
pageContext.window.__whisperCaptureDropped = 3;
const resetFactory = generatedScriptFactory('browserCaptureResetScript',
  'browserCaptureStatusScript');
vm.runInNewContext(resetFactory(), pageContext);
assert.equal(pageContext.window.__whisperCaptureQueue.length, 0);
assert.equal(pageContext.window.__whisperCaptureSeen.size, 0);
assert.equal(pageContext.window.__whisperCaptureInFlight.size, 0);
assert.equal(pageContext.window.__whisperCaptureDropped, 0);

const toggleFactory = generatedScriptFactory('browserCaptureToggleScript',
  'browserCapturePauseScript');
vm.runInNewContext(toggleFactory(false), pageContext);
assert.equal(pageContext.window.__whisperCaptureEnabled, false);
vm.runInNewContext(toggleFactory(true), pageContext);
assert.equal(pageContext.window.__whisperCaptureEnabled, true,
  'kurulu sayfa kancası yeniden açılırken etkinlik bayrağı kapalı kaldı');

assert.match(main, /mediaChanged[\s\S]*resetBrowserCaptureState[\s\S]*resetBrowserPageCaptureState/);
assert.match(main, /browser:capture:setEnabled[\s\S]*await resetBrowserPageCaptureState/);
assert.match(main, /browserCaptureEnabled && !tab\.compatibilityMode[\s\S]{0,420}ensureBrowserCaptureHooks\(\)[\s\S]{0,260}browserCaptureToggleScript\(true\)/,
  'yakalama yeniden açılırken kurulu sayfa kancası etkinleştirilmiyor');
assert.doesNotMatch(main, /sample\.slice\(0, 96\)[\s\S]{0,80}sample\.slice\(-96\)/);

console.log('browser-capture-recovery: parmak izi, retry sınıfı ve sayfa reseti geçti.');
