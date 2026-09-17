/**
 * transcribe:start seçenek -> argv sözleşmesi testleri.
 *
 * Neden var: çeviri argümanları bir ara yanlışlıkla `if (options.llmPostprocess)`
 * bloğunun İÇİNDE kaldı; "Çeviri" açık ama "LLM ile düzeltme" kapalıyken
 * --translate hiç gönderilmiyordu, iş sessizce çevirisiz bitiyordu. Sözdizimi
 * kontrolü böyle bir şeyi yakalayamaz.
 *
 * Çalıştırma:  node tests/main-args.test.js
 *
 * main.js Electron'a bağlı olduğu için import edilemez; argv kurulum bloğu
 * KAYNAKTAN kesilip çalıştırılır. Bloğun sınırları değişirse test yüksek sesle
 * kırılır (aşağıdaki hata mesajı).
 */
const fs = require('fs');
const path = require('path');

const MAIN = path.join(__dirname, '..', 'src', 'main.js');
const src = fs.readFileSync(MAIN, 'utf-8');

const START = '  const args = [scriptPath];';
const END = '  const env = buildSecretEnv(process.env, options);';
const i = src.indexOf(START);
const j = src.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.error('main.js icindeki argv blogu bulunamadi (sinir isaretleri degismis olabilir).');
  console.error(`  baslangic: ${JSON.stringify(START)} -> ${i}`);
  console.error(`  bitis    : ${JSON.stringify(END)} -> ${j}`);
  process.exit(1);
}
const body = src.slice(i, j) + '\n  return args;';
// main.js gercek kodu app.getPath('userData') kullaniyor (onbellek klasoru);
// cikarilan blok icin sahte bir app veriyoruz.
const fakeApp = { getPath: (k) => `C:/fake/${k}` };
// Aşamalı çıktı soneki doğrulayıcısı ortak sözleşmeden (queue-lifecycle) gelir.
const { isValidOutputNameSuffix } = require('../src/renderer/queue-lifecycle');
const buildArgs = new Function('options', 'scriptPath', 'path', 'app', 'isValidOutputNameSuffix', body);

// ---- minik test cercevesi ----
let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`  FAIL  ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert'); }

/** args dizisinde "--flag deger" ciftini bulur (deger yoksa sadece varlik). */
function argValue(args, flag) {
  const k = args.indexOf(flag);
  return k < 0 ? undefined : args[k + 1];
}
function base(extra) {
  return Object.assign({
    input: 'C:/video.mkv',
    model: 'large-v3',
    inputDir: 'C:/in',
    outputDir: 'C:/out',
  }, extra);
}
const build = (o) => buildArgs(o, 'transcribe.py', path, fakeApp, isValidOutputNameSuffix);

test('girdi ve çıktı klasörleri backend argv sözleşmesine ayrı gider', () => {
  const args = build(base());
  assert(argValue(args, '--input-dir') === 'C:/in', '--input-dir yanlış');
  assert(argValue(args, '--output-dir') === 'C:/out', '--output-dir yanlış');
});

// ---- 1) ASIL HATA: ceviri, LLM duzeltmesinden bagimsiz olmali ----
test('ceviri LLM duzeltme KAPALIYKEN de gonderilir', () => {
  const args = build(base({ translate: true, llmPostprocess: false, translateTo: 'tr' }));
  assert(argValue(args, '--translate') === 'true', '--translate true degil: ' + argValue(args, '--translate'));
  assert(argValue(args, '--translate-to') === 'tr', '--translate-to yok');
});

test('ceviri LLM duzeltme ACIKKEN de gonderilir', () => {
  const args = build(base({ translate: true, llmPostprocess: true, translateTo: 'tr' }));
  assert(argValue(args, '--translate') === 'true', '--translate true degil');
  assert(argValue(args, '--llm-postprocess') === 'true', '--llm-postprocess yok');
});

test('ceviri kapaliyken --translate false gider', () => {
  const args = build(base({ translate: false, llmPostprocess: false }));
  assert(argValue(args, '--translate') === 'false', '--translate false degil');
});

test('ses on-isleme LLM duzeltmeden bagimsiz', () => {
  const args = build(base({ llmPostprocess: false, audioPreprocess: 'loudnorm' }));
  assert(argValue(args, '--audio-preprocess') === 'loudnorm', '--audio-preprocess yok');
});

test('ceviri onbellegi ve onbellek klasoru gonderilir', () => {
  const args = build(base({ translate: true, translateCache: true }));
  assert(argValue(args, '--translate-cache') === 'true', '--translate-cache yok');
  assert(String(argValue(args, '--cache-dir') || '').includes('userData'), '--cache-dir yok');
  const off = build(base({ translate: true, translateCache: false }));
  assert(argValue(off, '--translate-cache') === 'false', 'onbellek kapatilamiyor');
});

test('ceviri yan ayarlari da gider', () => {
  const args = build(base({
    translate: true, llmPostprocess: false, translateTo: 'tr',
    translateModel: 'gpt-4o-mini', translateWorkers: 4, translateRegister: 'documentary',
    translateRefine: true, translateKeepSource: false, dualSubtitle: true,
  }));
  assert(argValue(args, '--translate-model') === 'gpt-4o-mini', 'model yok');
  assert(argValue(args, '--translate-workers') === '4', 'workers yok');
  assert(argValue(args, '--translate-register') === 'documentary', 'register yok');
  assert(argValue(args, '--translate-refine') === 'true', 'refine yok');
  assert(argValue(args, '--translate-keep-source') === 'false', 'keep-source yanlis');
  assert(argValue(args, '--dual-subtitle') === 'true', 'dual yok');
});

test('cue tekilleştirme yalnızca çeviri-only işinde açıkça gider', () => {
  const on = build(base({ translate: true, translateOnly: true, dedupeCues: true }));
  assert(on.includes('--dedupe-cues'), '--dedupe-cues yok');
  const normal = build(base({ translate: true, translateOnly: false, dedupeCues: true }));
  assert(!normal.includes('--dedupe-cues'), 'normal transkripsiyona dedupe sızdı');
});

// ---- 2) LLM bayraklari YALNIZCA LLM acikken ----
test('LLM bayraklari LLM kapaliyken gonderilmez', () => {
  const args = build(base({ llmPostprocess: false, translate: true }));
  assert(!args.includes('--llm-postprocess'), '--llm-postprocess sizmis');
  assert(!args.includes('--llm-fix-censorship'), '--llm-fix-censorship sizmis');
});

// ---- 3) gizli anahtarlar ASLA argv'de olmamali ----
test('API anahtarlari ve token argv de gecmez', () => {
  const args = build(base({
    translate: true, llmPostprocess: true, diarize: true,
    translateApiKey: 'sk-TRANSLATE-SECRET', llmApiKey: 'sk-LLM-SECRET', hfToken: 'hf-SECRET',
  }));
  const joined = args.join(' ');
  assert(!joined.includes('sk-TRANSLATE-SECRET'), 'ceviri anahtari argv de!');
  assert(!joined.includes('sk-LLM-SECRET'), 'LLM anahtari argv de!');
  assert(!joined.includes('hf-SECRET'), 'HF token argv de!');
});

// ---- 4) kaynak secimi ----
test('YouTube ve yerel dosya birbirini disliyor', () => {
  const yt = build({ youtube: 'https://youtu.be/x', model: 'large-v3' });
  assert(argValue(yt, '--youtube') === 'https://youtu.be/x', '--youtube yok');
  assert(!yt.includes('--input'), 'youtube ile --input da gitmis');
  const local = build(base({}));
  assert(argValue(local, '--input') === 'C:/video.mkv', '--input yok');
  assert(!local.includes('--youtube'), 'yerel dosyada --youtube gitmis');
});

test('oynaticida secilen YouTube ses dili Whisper isine gider', () => {
  const args = build({ youtube: 'https://youtu.be/test', model: 'large-v3',
    youtubeAudioLang: 'en-US' });
  assert(argValue(args, '--youtube-audio-lang') === 'en-US',
    'secilen ses dili argv sozlesmesine tasinmadi');
});

test('aşamalı çıktı soneki tireli değeri argparse için tek argv öğesinde taşır', () => {
  const suffix = '-whisper-test123';
  const args = build({ youtube: 'https://youtu.be/test', model: 'large-v3',
    outputNameSuffix: suffix });
  assert(args.includes(`--output-name-suffix=${suffix}`),
    'tireli sonek --ad=değer biçiminde gönderilmedi');
  assert(!args.includes('--output-name-suffix'),
    'tireli sonek ayrı argv öğesi; argparse bunu yeni seçenek sanır');
  assert(!args.includes(suffix), 'tireli sonek bağımsız argv öğesi olarak sızdı');
});

test('yalnizca sifir veya pozitif tam sayi ses parcasi argumana gider', () => {
  assert(argValue(build(base({ audioTrack: 0 })), '--audio-track') === '0', '0 numarali parca atlandi');
  assert(argValue(build(base({ audioTrack: 3 })), '--audio-track') === '3', 'gecerli parca atlandi');
  for (const invalid of ['', null, undefined, -1, 1.5, '2']) {
    assert(!build(base({ audioTrack: invalid })).includes('--audio-track'),
      `gecersiz ses parcasi sizdi: ${JSON.stringify(invalid)}`);
  }
});

test('YouTube cookie tarayıcısı yalnızca izin verilen değerde backend\'e gider', () => {
  const ok = build({ youtube: 'https://youtu.be/test', model: 'large-v3', youtubeCookieBrowser: 'firefox' });
  assert(argValue(ok, '--youtube-cookie-browser') === 'firefox', 'cookie tarayicisi argv ye gitmedi');
  const bad = build({ youtube: 'https://youtu.be/test', model: 'large-v3', youtubeCookieBrowser: 'keyfi-komut' });
  assert(!bad.includes('--youtube-cookie-browser'), 'izin verilmeyen tarayici argv ye sizdi');
});

// ---- 5) cumle birlestirme (opsiyonel) ----
test('cümle birleştirme opsiyonel ve varsayılan kapalı', () => {
  // Varsayilan KAPALI olmali: acikken bloklar uzuyor (olcum: 8 sn ustu blok
  // sayisi 0 -> 5), bu yuzden kullanici acmadikca devreye girmemeli.
  const kapali = build(base({}));
  assert(argValue(kapali, '--merge-continuation') === 'false',
    '--merge-continuation varsayilan false degil');
  const acik = build(base({ mergeContinuation: true, continuationGap: 2.5 }));
  assert(argValue(acik, '--merge-continuation') === 'true', 'acikken true gitmiyor');
  assert(argValue(acik, '--continuation-gap') === '2.5', 'bosluk siniri gitmiyor');
});

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.log('\nBaşarısızlar:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
