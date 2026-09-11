const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { rankBrowserMediaCandidates } = require('../src/browser-media');
const { buildBrowserMediaCommandScript } = require('../src/browser-media-controller');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; }
}

test('tarayıcı medya adaylarında oynayan görünür video duraklatılmış büyük videodan önce gelir', () => {
  const frames = [
    { frame: 'ad', media: { area: 1920, duration: 30, paused: false } },
    { frame: 'player', media: { area: 1280 * 720, duration: 3600, paused: true } },
    { frame: 'preview', media: { area: 0, duration: 10, paused: true } },
  ];
  assert.deepEqual(rankBrowserMediaCandidates(frames).map((item) => item.frame), ['ad', 'player', 'preview']);
});

test('eşit alanlı videoda oynayan aday öne alınır, giriş sırası korunur', () => {
  const ranked = rankBrowserMediaCandidates([
    { frame: 'paused', media: { area: 100, paused: true } },
    { frame: 'playing', media: { area: 100, paused: false } },
    { frame: 'same', media: { area: 100, paused: true, duration: 20 } },
  ]);
  assert.deepEqual(ranked.map((item) => item.frame), ['playing', 'same', 'paused']);
});

test('ana süreç medya komutunu tüm karelere yayınlamaz', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /rankBrowserMediaCandidates\(candidates\)/);
  assert.doesNotMatch(main, /executeBrowserFrames\(buildBrowserMediaCommandScript/);
  assert.doesNotMatch(main, /app\.commandLine\.appendSwitch\('disable-gpu'\)/);
  assert.doesNotMatch(main, /app\.commandLine\.appendSwitch\('in-process-gpu'\)/);
  assert.match(main, /if \(!browserHardwareAccelerationEnabled\) app\.disableHardwareAcceleration\(\)/);
  assert.match(main, /summarizeGpuDiagnostics/);
  assert.match(main, /featureStatus = app\.getGPUFeatureStatus\(\)/);
});

test('medya zamanlayıcısı komutlarla aynı aday sıralamasını kullanır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /const probed = await withTimeout\(executeBrowserFrames\(buildBrowserMediaProbeScript\(\)\)/);
  assert.match(main, /rankBrowserMediaCandidates\(\s*probed\.map\(\(item\) => \(\{ media: item \}\)\)/s);
});

test('sayısal medya komutları NaN ve sonsuz değerleri sayfaya göndermeden reddeder', () => {
  for (const command of ['seek', 'seek-relative', 'speed', 'volume-relative', 'volume-set', 'frame-step']) {
    assert.equal(buildBrowserMediaCommandScript(command, Infinity), '(async () => false)()', command);
    assert.equal(buildBrowserMediaCommandScript(command, NaN), '(async () => false)()', command);
  }
});

test('medya komutu reddi ana süreçte video yok hatasına dönüştürülmez', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const script = buildBrowserMediaCommandScript('play', 0);
  assert.match(script, /handled: false, error:/);
  assert.match(main, /Oynatıcı komutu reddetti:/);
});

test('otomatik reklam atlama yeni poller kurmadan mevcut medya olayına bağlanır', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = renderer.indexOf('async function maybeAutoSkipBrowserAd');
  const end = renderer.indexOf('const browserCommandPaletteState', start);
  assert(start >= 0 && end > start);
  const helper = renderer.slice(start, end);
  assert.match(helper, /browserCommand\('skipAd'/);
  assert.doesNotMatch(helper, /setInterval|setTimeout|MutationObserver/);
  assert.match(renderer, /event\.type === 'media'[\s\S]*?maybeAutoSkipBrowserAd\(event, event\.media\)/);
  assert.match(main, /'fullscreen', 'pip', 'skipAd'/);
});

console.log(`browser-media: ${passed} test`);
