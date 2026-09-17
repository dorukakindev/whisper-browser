const assert = require('assert');
const { pcm16Wav } = require('../src/browser-live-audio');

const pcm = Buffer.from([0, 0, 255, 127, 0, 128]);
const wav = pcm16Wav(pcm);
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
assert.equal(wav.readUInt32LE(24), 16000);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal(wav.readUInt16LE(34), 16);
assert.equal(wav.readUInt32LE(40), pcm.length);
assert.deepEqual(wav.subarray(44), pcm);
assert.throws(() => pcm16Wav(Buffer.alloc(3)), /geçersiz/);
assert.throws(() => pcm16Wav(Buffer.alloc(16000 * 2 * 10)), /geçersiz/);

// R51-87: chunk_done yankısı yalnız işe ait temp dosyayı silebilir.
{
  const fs = require('fs');
  const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf("event.type === 'chunk_done'");
  const body = main.slice(start, start + 900);
  assert.match(body, /job\.chunkFiles\.delete\(filePath\)\)\s*\{[\s\S]{0,120}unlinkSync/,
    'chunk_done üyelik denetimi olmadan dosya siliyor');
  assert.doesNotMatch(body, /if \(filePath && fs\.existsSync\(filePath\)\) fs\.unlinkSync/,
    'üyelik dışı unlinkSync kaldı');
  // Üyelik kümesi gerçek: chunk dosyaları ancak bizim yazdığımız yollardan eklenir
  assert.match(main, /job\.chunkFiles\.add\(filePath\)/);
}

// R58-01: stopBrowserLiveAsr işi stdout/close'a kadar drain sahibi tutmalı —
// Python 'stop' aldığında son segmentleri boşaltır; browserLiveAsr'ı hemen
// null yapmak o son satırları sahiplik denetiminde düşürür.
{
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8')
    .replace(/\r\n/g, '\n');
  const stopStart = main.indexOf('function stopBrowserLiveAsr(');
  const stopEnd = main.indexOf('\nfunction sweepBrowserLiveAsrTemp(', stopStart);
  assert.ok(stopStart >= 0 && stopEnd > stopStart, 'stopBrowserLiveAsr kaynakta bulunamadı');
  const consumeStart = main.indexOf('  const consumeLiveAsrLine =');
  const consumeEnd = main.indexOf('  const liveAsrLines =', consumeStart);
  assert.ok(consumeStart >= 0 && consumeEnd > consumeStart, 'consumeLiveAsrLine bulunamadı');
  const written = [];
  const stored = [];
  const job = {
    nextCueId: 0, cues: [], stopping: false, chunkFiles: new Set(),
    tab: { id: 'tab-1', acquisitionId: 'acq',
      acquisitionPlan: { stage: () => null, finish: () => true, snapshot: () => ({}) } },
    proc: { stdin: { write: (line) => written.push(line) } },
  };
  const context = vm.createContext({
    browserLiveAsr: job, browserDiagnostics: null, publishBrowserDiagnostics() {},
    sendBrowserEvent() {}, terminateProcessTree() {}, spawn() {}, setTimeout: () => ({ unref() {} }),
    JSON, isCurrentBrowserContext: () => true,
    storeBrowserTrack: (cues) => { stored.push(cues); },
    job, tab: job.tab, language: 'en', context: {},
    fs: { unlinkSync() {}, existsSync: () => false },
  });
  const stop = vm.runInContext(`(${main.slice(stopStart, stopEnd)})`, context);
  const consume = vm.runInContext(
    main.slice(consumeStart, consumeEnd) + '\nconsumeLiveAsrLine', context);
  assert.equal(stop('test'), true);
  assert.equal(context.browserLiveAsr, job,
    'stop sonrası drain sahipliği close a kadar korunmalı');
  // Python'ın stop sonrası boşalttığı son segment kaybolmamalı.
  consume(JSON.stringify({ type: 'segment', start: 120.4, end: 122.1, text: 'Son cümle.' }));
  assert.equal(stored.length, 1, 'stop sonrası boşaltılan son segment kayboldu');
  assert.equal(job.cues.length, 1);
  assert.match(String(written[0] || ''), /"stop"/, 'stop komutu sürece yazılmadı');
}

console.log('browser-live-audio: 10 test');
