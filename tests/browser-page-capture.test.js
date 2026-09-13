'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBrowserMediaProbeScript } = require('../src/browser-media-controller');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

assert.match(main, /Page\.getLayoutMetrics/);
assert.match(main, /Page\.captureScreenshot/);
assert.match(main, /captureBeyondViewport:\s*true/);
assert.match(main, /width \* height > 120000000/);
assert.match(main, /await browserDebuggerAttachPromise\.catch/,
  'tam sayfa yakalama sürmekteki kalıcı debugger kurulumunu beklemeli');
assert.match(main, /attachedHere && wc\.debugger\.isAttached\(\) && !browserDebuggerReady/,
  'yalnız geçici ve devralınmamış debugger bağlantısı sökülmeli');
assert.match(main, /!browserDebuggerAttachAttempts\.has\(wc\)/,
  'eşzamanlı altyazı yakalama girişimi ekran görüntüsü tarafından koparılmamalı');
assert.match(main, /captureBrowserVideoFrame\(tab, includeCaptions\)/);
assert.match(main, /candidate\.frame !== wc\.mainFrame/);
assert.match(main, /wc\.getZoomFactor/);
assert.match(main, /Math\.floor\(Number\(bounds\.width\) \* zoom\)/);
assert.match(main, /clipboard\.writeImage\(image\)/);
assert.match(main, /writeBufferAtomic\(outputPath, image\.toPNG\(\)\)/,
  'PNG doğrudan nihai dosyaya yazılmamalı');
assert.match(main, /path\.extname\(result\.filePath\).*=== '\.png'/s,
  'kullanıcı uzantı yazmasa bile PNG uzantısı korunmalı');
assert.match(main, /data-whisper-browser-overlay/);
assert.match(preload, /captureBrowserPage: \(tabId, options = \{\}\)/);
assert.match(renderer, /mode: 'video-captions', copy: true, save: false/);
assert.match(buildBrowserMediaProbeScript(), /getBoundingClientRect/);
console.log('browser-page-capture: 18 test');
