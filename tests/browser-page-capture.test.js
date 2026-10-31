'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
assert.match(main, /clipboard\.writeImage\(image\)/);
assert.match(main, /writeBufferAtomic\(outputPath, image\.toPNG\(\)\)/,
  'PNG doğrudan nihai dosyaya yazılmamalı');
assert.match(main, /data-whisper-browser-overlay/);
assert.match(preload, /captureBrowserPage: \(tabId, options = \{\}\)/);
assert.match(renderer, /mode: 'video-captions', copy: true, save: false/);
assert.match(buildBrowserMediaProbeScript(), /getBoundingClientRect/);
function mainFunction(name) {
  const start = main.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert(start >= 0); return main.slice(start, main.indexOf('\n}', start) + 2);
}
(async () => {
  let bounds = { x: -100, y: -80, width: 640, height: 360 }, zoom = 1;
  const frame = { executeJavaScript: async () => null };
  const wc = { mainFrame: frame, getZoomFactor: () => zoom, capturePage: async rect => rect };
  const ctx = vm.createContext({ randomUUID: () => 'fixture', browserFrames: () => [frame],
    buildBrowserMediaProbeScript: () => '', withTimeout: promise => promise, dt: (_, en) => en,
    rankBrowserMediaCandidates: () => [{ frame, media: { bounds } }] });
  vm.runInContext(mainFunction('captureBrowserVideoFrame'), ctx);
  const tab = { view: { webContents: wc, getBounds: () => ({ width: 1000, height: 800 }) } };
  assert.deepEqual({ ...await ctx.captureBrowserVideoFrame(tab, false) }, { x: 0, y: 0, width: 540, height: 280 },
    'offscreen video must capture only the visible intersection');
  bounds = { x: 100, y: 50, width: 640, height: 360 }; zoom = 1.5;
  assert.deepEqual({ ...await ctx.captureBrowserVideoFrame(tab, true) }, { x: 150, y: 75, width: 850, height: 540 });
  let written;
  const selected = path.join('fixture', 'chosen-name.txt');
  const image = { isEmpty: () => false, toPNG: () => Buffer.from('png') };
  const save = vm.createContext({ path, mainWindow: {}, dt: (_, en) => en, browserExportTitle: () => 'fixture',
    app: { getPath: () => 'fixture' }, dialog: { showSaveDialog: async () => ({ filePath: selected }) },
    writeBufferAtomic: target => { written = target; } });
  vm.runInContext(mainFunction('saveBrowserPageCapture'), save);
  const result = await save.saveBrowserPageCapture({ view: { webContents: { isDestroyed: () => false, capturePage: async () => image } } });
  assert(result.ok); assert.equal(written, selected,
    'PNG export must honor the exact target approved by SaveDialog, without appending an unconfirmed overwrite target');
  console.log('browser-page-capture: wiring, zoomed/offscreen intersection and approved PNG target passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
