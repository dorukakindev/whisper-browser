'use strict';
// Yeni-100 b2 — spawn/spawnSync sarmalayıcısının platform varsayılanları.
// POSIX: detached=true (süreç-grubu iptali), windowsHide yok.
// Windows: detached=false (taskkill /T kullanılır), windowsHide=true —
// unutulursa her alt süreçte boş konsol penceresi beliriyordu; artık
// sarmalayıcıdan gelen yapısal varsayılan tek noktada kilitlendi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

function loadWrappers(platform) {
  const start = src.indexOf('function spawn(command, args, options = {})');
  const end = src.indexOf("const { buildBrowserOverlayScript }", start);
  assert.ok(start > 0 && end > start, 'spawn sarmalayıcı dilimi bulunur');
  const calls = [];
  const sandbox = {
    process: { platform, env: {} },
    withoutSecretEnv: (env) => env,
    rawSpawn: (command, args, options) => { calls.push(['spawn', command, args, options]); return calls[calls.length - 1]; },
    rawSpawnSync: (command, args, options) => { calls.push(['spawnSync', command, args, options]); return calls[calls.length - 1]; },
    String,
  };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  return { spawn: sandbox.spawn, spawnSync: sandbox.spawnSync, calls };
}

// Windows: varsayılan detached=false + windowsHide=true, env açıkça verilmedikçe scrub'lanır.
{
  const { spawn, spawnSync, calls } = loadWrappers('win32');
  spawn('python.exe', ['x.py']);
  assert.deepStrictEqual(
    { detached: calls[0][3].detached, windowsHide: calls[0][3].windowsHide },
    { detached: false, windowsHide: true },
    'win32 spawn varsayılanları',
  );
  spawnSync('ffmpeg.exe', ['-version']);
  assert.strictEqual(calls[1][3].windowsHide, true, 'win32 spawnSync windowsHide');
}

// POSIX: detached=true, windowsHide=false — explicit seçenekler baskındır.
{
  const { spawn, calls } = loadWrappers('linux');
  spawn('ffmpeg', ['-version']);
  assert.strictEqual(calls[0][3].detached, true, 'linux detached varsayılan');
  assert.strictEqual(calls[0][3].windowsHide, false, 'linux windowsHide kapalı');
  spawn('ffmpeg', [], { detached: false, windowsHide: true });
  assert.strictEqual(calls[1][3].detached, false, 'açık detached saygı görür');
  assert.strictEqual(calls[1][3].windowsHide, true, 'açık windowsHide saygı görür');
}

// windowsHide:false açıkça istenirse win32'de de saygı görür (debug konsolu).
{
  const { spawn, calls } = loadWrappers('win32');
  spawn('python.exe', [], { windowsHide: false });
  assert.strictEqual(calls[0][3].windowsHide, false, 'açık windowsHide:false korunur');
}

console.log('PASS: spawn-wrapper-defaults — platform varsayılanları kilitli (3 grup, 7 kontrol)');
