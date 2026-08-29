/**
 * Ön kontroller ve altyazı zaman kaydırma testleri.
 *
 * Neden var:
 *  - Kuyruk, tekil başlatmadaki ön kontrolleri hiç yapmıyordu: anahtarsız
 *    çeviri/LLM/diarization veya geçersiz kırpma aralığıyla iş eklenebiliyor,
 *    kullanıcı sorunu ancak günlükten anlıyordu. Artık ikisi de optsProblem()
 *    kullanıyor; bu test o fonksiyonu gerçek kaynaktan alır.
 *  - subs:shift dosyayı düz UTF-8 okuyordu; eski cp1254 Türkçe altyazıda
 *    ş/ğ/ı harfleri U+FFFD olup dosyaya geri yazılıyordu (kalıcı bozulma).
 *
 * Çalıştırma:  node tests/validation.test.js
 */
const fs = require('fs');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
const MAIN = path.join(__dirname, '..', 'src', 'main.js');

let pass = 0; const fails = [];
const t = (name, fn) => {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fails.push(name + ': ' + e.message); console.log('  FAIL  ' + name + ' — ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };

// ---------------------------------------------------------------- optsProblem
const rsrc = fs.readFileSync(RENDERER, 'utf-8');
const vStart = rsrc.indexOf('function optsProblem(opts) {');
const vEnd = rsrc.indexOf('function addToQueue(');
ok(vStart >= 0 && vEnd > vStart, 'optsProblem kaynakta bulunamadi');
// parseClipInput de gerekiyor
const pStart = rsrc.indexOf('function parseClipInput(');
const pEnd = rsrc.indexOf('\n}', pStart) + 2;
ok(pStart >= 0, 'parseClipInput bulunamadi');
const optsProblem = new Function(
  rsrc.slice(pStart, pEnd) + rsrc.slice(vStart, vEnd) + '; return optsProblem;')();

const base = (extra) => Object.assign({ clipStart: '', clipEnd: '' }, extra);

t('temiz ayarlarda sorun yok', () => {
  ok(optsProblem(base({})) === null, 'bos ayar');
  ok(optsProblem(base({ clipStart: '1:30', clipEnd: '5:00' })) === null, 'gecerli aralik');
});

t('gecersiz zaman araligi yakalanir', () => {
  ok(optsProblem(base({ clipStart: 'abc' })) !== null, 'bozuk bicim');
  ok(optsProblem(base({ clipStart: '5:00', clipEnd: '1:30' })) !== null, 'bitis < baslangic');
  ok(optsProblem(base({ clipStart: '5:00', clipEnd: '5:00' })) !== null, 'esit');
});

t('anahtarsiz ceviri/LLM/diarization yakalanir', () => {
  ok(optsProblem(base({ translate: true })) !== null, 'ceviri anahtarsiz gecti');
  ok(optsProblem(base({ translate: true, translateApiKey: 'sk-x' })) === null, 'anahtarli ceviri engellendi');
  ok(optsProblem(base({ diarize: true })) !== null, 'diarization tokensiz gecti');
  ok(optsProblem(base({ diarize: true, hfToken: 'hf-x' })) === null, 'tokenli diarization engellendi');
  ok(optsProblem(base({ llmPostprocess: true })) !== null, 'LLM anahtarsiz gecti');
  ok(optsProblem(base({ llmPostprocess: true, llmApiKey: 'sk-y' })) === null, 'anahtarli LLM engellendi');
});

t('kuyruk ve tekil baslatma AYNI fonksiyonu kullanir', () => {
  // Ikisinin ayrismasi bu hatanin ta kendisiydi - kaynakta iki cagri da olmali
  const calls = (rsrc.match(/optsProblem\(opts\)/g) || []).length;
  ok(calls >= 2, `optsProblem yalnizca ${calls} yerde cagriliyor`);
});

// ---------------------------------------------------------------- shiftTimecodes
const msrc = fs.readFileSync(MAIN, 'utf-8');
const sStart = msrc.indexOf('function shiftTimecodes(');
const sEnd = msrc.indexOf("ipcMain.handle('subs:shift'");
ok(sStart >= 0 && sEnd > sStart, 'shiftTimecodes bulunamadi');
const shiftTimecodes = new Function(msrc.slice(sStart, sEnd) + '; return shiftTimecodes;')();

t('zaman kaydirma SRT ve VTT bicimlerini korur', () => {
  const srt = '1\n00:00:05,000 --> 00:00:07,500\nMetin.\n';
  const out = shiftTimecodes(srt, 2.5);
  ok(out.includes('00:00:07,500 --> 00:00:10,000'), 'SRT kaymadi: ' + out);
  const vtt = '00:00:05.000 --> 00:00:07.500';
  ok(shiftTimecodes(vtt, 1).includes('00:00:06.000 --> 00:00:08.500'), 'VTT ayraci bozuldu');
});

t('negatif kaydirma sifira kelepcelenir', () => {
  const out = shiftTimecodes('00:00:01,000 --> 00:00:03,000', -5);
  ok(out.startsWith('00:00:00,000'), 'kelepceleme yok: ' + out);
});

// ---------------------------------------------------------------- decodeSubtitleBuffer
const dStart = msrc.indexOf('function decodeSubtitleBuffer(');
const dEnd = msrc.indexOf("ipcMain.handle('media:readSubtitle'");
ok(dStart >= 0 && dEnd > dStart, 'decodeSubtitleBuffer bulunamadi');
const cpStart = msrc.indexOf('const CP1254_FIXUP');
const decodeSubtitleBuffer = new Function(
  'Buffer', msrc.slice(cpStart, dEnd) + '; return decodeSubtitleBuffer;')(Buffer);

t('cp1254 altyazi dogru cozulur (kaydirma yolu icin)', () => {
  const tr = 'Çocuk güzel şeyler öğrendi.';
  const { text } = decodeSubtitleBuffer(Buffer.from(tr, 'latin1'));  // cp1254 benzeri bayt dizisi
  ok(!text.includes('�'), 'U+FFFD uretildi: ' + text);
});

t('subs:shift kodlama tespitini KULLANIYOR (duz utf-8 degil)', () => {
  const handler = msrc.slice(msrc.indexOf("ipcMain.handle('subs:shift'"),
                             msrc.indexOf("ipcMain.handle('subs:shift'") + 900);
  ok(handler.includes('decodeSubtitleBuffer'), 'duz utf-8 okuma geri gelmis');
  ok(handler.includes('backupOnce'), '.bak alinmiyor');
  ok(handler.includes('writeSubtitleAtomic'), 'atomik yazma yok');
});

console.log(`\n${pass} geçti, ${fails.length} başarısız (${pass + fails.length} test)`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
