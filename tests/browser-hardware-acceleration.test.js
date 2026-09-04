const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const startup = main.match(/const browserHardwareAccelerationEnabled =[^\n]+\nif \(!browserHardwareAccelerationEnabled\) app\.disableHardwareAcceleration\(\);/)[0];
const readSettings = main.slice(main.indexOf('function readPublicSettings()'), main.indexOf('function migrateSubtitleModelDefault'));
assert.ok(main.indexOf(startup) < main.indexOf('app.whenReady()'), 'Apply before Electron ready');

// Exercise the real startup reader without opening actual user settings or Electron.
for (const [stored, disabled] of [
  [undefined, 0], ['invalid JSON', 0], ['null', 0], ['[]', 0], ['{}', 0],
  [JSON.stringify({ ui: { browserHardwareAcceleration: true } }), 0],
  [JSON.stringify({ ui: { browserHardwareAcceleration: false } }), 1],
  [JSON.stringify({ ui: { browserHardwareAcceleration: 'false' } }), 0],
]) {
  let calls = 0;
  vm.runInNewContext(readSettings + startup, {
    settingsPath: () => 'synthetic-settings.json',
    fs: { readFileSync() { if (stored === undefined) throw new Error('ENOENT'); return stored; } },
    app: { disableHardwareAcceleration() { calls++; } },
  });
  assert.strictEqual(calls, disabled, `Unexpected startup behavior: ${stored}`);
}

const controls = renderer.slice(renderer.indexOf('const PERSIST_CHECKBOX_CONTROLS'), renderer.indexOf('function collectUiSettings'));
assert.ok(controls.includes("'browserHardwareAcceleration'"), 'Switch must use existing save/restore pipeline');
const settingsPanel = html.slice(html.indexOf('id="browserViewSettings"'), html.indexOf('id="browserDiagnosticsPanel"'));
assert.match(settingsPanel, /id="browserHardwareAcceleration"[^>]*role="switch"[^>]*checked/);
assert.match(settingsPanel, /aria-describedby="browserHardwareAccelerationHint"/);
assert.match(settingsPanel, /uygulamayı tamamen kapatıp yeniden açın/);
console.log('Hardware acceleration startup, defaults and settings persistence contracts passed.');
