// R406 — tek tık = Whisper + çeviri.
// Eskiden browser'daki "Altyazı oluştur" düğmesi startBrowserYoutubeWhisper(false)
// çağırıyor, API anahtarı girili olsa bile çeviriyi zorla kapatıyordu. Yerel
// oynatıcıda ise açık eylem niyeti (translateOverride) hiç okunmuyordu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8').replace(/\r\n/g, '\n');
function section(from, to) {
  const start = code.indexOf(from);
  assert(start >= 0, `bulunamadı: ${from}`);
  const end = code.indexOf(to, start + from.length);
  assert(end > start, `bitiş bulunamadı: ${to}`);
  return code.slice(start, end);
}

const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) {
    nodes.set(id, {
      id, value: '', checked: false, textContent: '', disabled: false, title: '', style: {},
      listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    });
  }
  return nodes.get(id);
};

const browserCalls = [];
const chunkJobs = [];
const ctx = {
  console, Object, Number, Date, String, setTimeout: (fn) => { fn(); return 1; },
  $: node,
  state: { running: false, queueRunning: false },
  player: { workspaceMode: 'browser', mediaKey: 'local:abc', localPath: '/videos/a.mp4', subPath: '', sub2Path: '' },
  buildOptsFromUI: () => ({ input: 'old.mp4', translate: false, translateTo: 'tr', translateApiKey: node('translateApiKey').value }),
  optsProblem: () => '',
  progressiveRanges: () => [{ start: 0, end: 10 }],
  startProgressiveChunk: async (job) => { chunkJobs.push(job); },
  startBrowserYoutubeWhisper: (translate) => { browserCalls.push(translate); },
  currentBrowserYoutubeUrl: () => '',
  logLine() {}, setBrowserSignal() {}, updatePlayerTaskCenter() {}, updateBrowserWhisperActions() {},
};
vm.createContext(ctx);
vm.runInContext(section('function translationReadyForCreate(', 'function openTranslationKeySetup('), ctx);
ctx.URL = URL;
vm.runInContext(section('function translationEndpointReady(', '\n}') + '\n}', ctx);
vm.runInContext(section('async function startProgressivePlayerTranscription(', '// "Altyazı oluştur"'), ctx);
vm.runInContext(section("if ($('makeSubsBtn')) {\n  $('makeSubsBtn').addEventListener('click'", "if ($('playerJobCancel'))"), ctx);

(async () => {
  const click = node('makeSubsBtn').listeners.click;
  assert.equal(typeof click, 'function', 'makeSubsBtn tıklama dinleyicisi bağlanmadı');

  // 1) Anahtar yok: çeviri kesin olarak istenmez (doğrulama hatası yerine kaynak altyazı).
  node('translateApiKey').value = '   ';
  assert.equal(ctx.translationReadyForCreate(), false);
  ctx.player.workspaceMode = 'browser';
  click();
  assert.deepEqual(browserCalls, [false]);

  // 2) Anahtar girili: browser'da tek tık Whisper + çeviri.
  node('translateApiKey').value = 'sk-test';
  assert.equal(ctx.translationReadyForCreate(), true);
  click();
  assert.deepEqual(browserCalls, [false, true], 'anahtar varken browser tıklaması çeviriyi kapattı');

  // 3) Yerel oynatıcı + anahtar: ayardaki çeviri kutusu kapalı olsa da çeviri açılır.
  ctx.player.workspaceMode = 'player';
  await click();
  assert.equal(chunkJobs.length, 1);
  assert.equal(chunkJobs[0].baseOpts.translate, true, 'yerel oynatıcıda tıklama çeviriyi atladı');
  assert.equal(chunkJobs[0].baseOpts.translateKeepSource, true);
  assert.equal(chunkJobs[0].baseOpts.input, '/videos/a.mp4');

  // 4) "Yalnız altyazı" yolu: açık niyet ayardaki genel anahtarı ezer.
  ctx.state.running = false;
  ctx.buildOptsFromUI = () => ({ input: 'old.mp4', translate: true, translateTo: 'tr', translateApiKey: 'sk-test' });
  await ctx.startProgressivePlayerTranscription({ translateOverride: false });
  assert.equal(chunkJobs.length, 2);
  assert.equal(chunkJobs[1].baseOpts.translate, false, 'translateOverride:false yerel yolda yok sayıldı');
  assert.equal(chunkJobs[1].baseOpts.translateKeepSource, undefined);

  // 5) Anahtar yok + yerel: override verilmez, ayardaki tercih korunur.
  ctx.state.running = false;
  node('translateApiKey').value = '';
  ctx.buildOptsFromUI = () => ({ input: 'old.mp4', translate: false });
  await click();
  assert.equal(chunkJobs.length, 3);
  assert.equal(chunkJobs[2].baseOpts.translate, false);

  // 6) Boş panel: anahtar varken üç eylem, yokken anahtar kurulum bağlantısı.
  const empty = section('const emptyTranslationReady', "box.querySelector('[data-empty-action=\"setup\"]')");
  assert.match(empty, /data-empty-action="source"[^]*Yalnız altyazı/);
  assert.match(empty, /lt\('Whisper \+ çeviri'\)/);
  assert.match(empty, /data-empty-action="setup"[^]*Çeviri için API anahtarı ekle/);
  assert.match(empty, /startProgressivePlayerTranscription\(\{ translateOverride: false \}\)/);
  assert.doesNotMatch(empty, /▭/, 'boş panel simgesi hâlâ metin glifi');

  // 7) Yeni metinlerin İngilizce karşılığı var.
  const locale = fs.readFileSync(path.join(root, 'src/renderer/ui-locale.js'), 'utf8');
  for (const tr of ['Whisper + çeviri', 'Yalnız altyazı', 'Çeviri için API anahtarı ekle',
    'Bu YouTube videosu için Whisper altyazısı ve çeviri oluştur']) {
    assert(locale.includes(`['${tr}', '`), `çeviri eksik: ${tr}`);
  }
  console.log('browser-create-translate-default: OK');
})().catch((err) => { console.error(err); process.exit(1); });
