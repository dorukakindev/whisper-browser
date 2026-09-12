const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeWatchOutputConfig,
  hasConfiguredWatchOutput,
  advanceWatchStability,
} = require('../src/watch-folder');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n${err.stack}`); process.exitCode = 1; }
}

test('izleme ayarlarında bilinmeyen formatları atar ve güvenli varsayılanı korur', () => {
  assert.deepEqual(normalizeWatchOutputConfig({ formats: 'vtt,wat,json,vtt', langSuffix: 'true' }), {
    formats: ['vtt', 'json'], langSuffix: true, outputDir: '', translateTo: '',
  });
  assert.deepEqual(normalizeWatchOutputConfig({ formats: 'wat' }).formats, ['srt']);
});

test('çıktı klasöründeki VTT ve dil ekli çeviri dosyası videoyu tamamlanmış sayar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-'));
  try {
    const video = path.join(dir, 'Bolum 01.mp4');
    const output = path.join(dir, 'out');
    fs.mkdirSync(output);
    fs.writeFileSync(video, 'video');
    fs.writeFileSync(path.join(output, 'Bolum 01.tr.vtt'), 'WEBVTT');
    assert.equal(hasConfiguredWatchOutput(video, { formats: 'vtt', outputDir: output }, fs.existsSync), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dil eki kapalıyken rastgele dil dosyasını tamamlandı saymaz', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-'));
  try {
    const video = path.join(dir, 'film.mkv');
    fs.writeFileSync(video, 'video');
    fs.writeFileSync(path.join(dir, 'film.de.srt'), '1');
    assert.equal(hasConfiguredWatchOutput(video, { formats: 'srt', langSuffix: false }, fs.existsSync), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hedef dili farklı çeviri dosyası da tekrar kuyruğa girmez', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-'));
  try {
    const video = path.join(dir, 'film.mp4');
    fs.writeFileSync(video, 'video');
    fs.writeFileSync(path.join(dir, 'film.de.srt'), '1');
    assert.equal(hasConfiguredWatchOutput(video, { formats: 'srt', translateTo: 'de' }, fs.existsSync), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('önceden okunmuş çıktı dizini dil ekli dosya aramasında yeniden kullanılabilir', () => {
  const video = path.join('D:\\medya', 'film.mkv');
  assert.equal(hasConfiguredWatchOutput(video, {
    formats: 'srt,vtt', langSuffix: true, outputDir: 'D:\\cikti',
  }, () => false, ['film.fr.srt', 'film.fr.vtt']), true);
  assert.equal(hasConfiguredWatchOutput(video, {
    formats: 'srt,vtt', langSuffix: true, outputDir: 'D:\\cikti',
  }, () => false, ['film.fr.vtt']), false);
});

test('sabit dosya yalnızca bir kez kuyruğa bildirilir', () => {
  const state = { size: 100, stableCount: 0, queued: false, hadOutput: false };
  assert.equal(advanceWatchStability(state, 100, 2), false);
  assert.equal(advanceWatchStability(state, 100, 2), true);
  assert.equal(advanceWatchStability(state, 100, 2), false);
  assert.equal(advanceWatchStability(state, 100, 2), false);
  assert.equal(state.queued, true);
});

test('izleme IPCsi renderer ayarlarını ana sürece taşır', () => {
  const root = path.join(__dirname, '..', 'src');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(preload, /startWatchFolder: \(dir, options\)/);
  assert.match(preload, /reportWatchFile:/);
  assert.match(renderer, /formats: opts\.formats/);
  assert.match(renderer, /langSuffix: opts\.langSuffix/);
  assert.match(renderer, /outputDir: opts\.outputDir/);
  assert.match(renderer, /translateTo: opts\.translateTo/);
  assert.match(main, /prev\.queued && prev\.hadOutput/);
  assert.match(main, /advanceWatchStability\(prev, size, WATCH_STABLE_TICKS\)/);
  assert.match(main, /queued: hasOutput, hadOutput: hasOutput/);
  assert.match(main, /ipcMain\.handle\('watch:report'/);
  assert.match(renderer, /queueInputKey/);
  assert.match(renderer, /reportWatchQueueResult/);
});

console.log(`watch-folder: ${passed} test`);
