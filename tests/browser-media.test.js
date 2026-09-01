const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { rankBrowserMediaCandidates } = require('../src/browser-media');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; }
}

test('tarayıcı medya adaylarını alanı en büyük videodan başlayarak sıralar', () => {
  const frames = [
    { frame: 'ad', media: { area: 1920, duration: 30, paused: false } },
    { frame: 'player', media: { area: 1280 * 720, duration: 3600, paused: true } },
    { frame: 'preview', media: { area: 0, duration: 10, paused: true } },
  ];
  assert.deepEqual(rankBrowserMediaCandidates(frames).map((item) => item.frame), ['player', 'ad', 'preview']);
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
  assert.doesNotMatch(main, /executeBrowserFrames\(browserMediaCommandScript/);
  assert.match(main, /appendSwitch\('disable-gpu'\)/);
  assert.match(main, /disableHardwareAcceleration\(\)/);
  assert.match(main, /appendSwitch\('in-process-gpu'\)/);
});

test('medya zamanlayıcısı komutlarla aynı aday sıralamasını kullanır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /const probed = await withTimeout\(executeBrowserFrames\(browserMediaProbeScript\(\)\)/);
  assert.match(main, /rankBrowserMediaCandidates\(\s*probed\.map\(\(item\) => \(\{ media: item \}\)\)/s);
});

console.log(`browser-media: ${passed} test`);
