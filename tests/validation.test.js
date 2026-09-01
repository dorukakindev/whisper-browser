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
  const shortVtt = '05:23.500 --> 05:28.100 align:start';
  ok(shiftTimecodes(shortVtt, 1).includes('05:24.500 --> 05:29.100 align:start'), 'iki parçalı VTT kaymadı');
});

t('negatif kaydirmada tamamen video disinda kalan blok atilir', () => {
  const out = shiftTimecodes('1\n00:00:01,000 --> 00:00:03,000\nEski blok\n\n2\n00:00:05,000 --> 00:00:08,000\nKalan', -5);
  ok(!out.includes('Eski blok'), 'sifir süreli blok kaldi: ' + out);
  ok(out.includes('00:00:00,000 --> 00:00:03,000') && out.includes('Kalan'), 'kismen kalan blok bozuldu: ' + out);
});

const writeStart = msrc.indexOf('function writeSubtitleAtomic(');
const writeEnd = msrc.indexOf('function writeJsonAtomic(', writeStart);
ok(writeStart >= 0 && writeEnd > writeStart, 'atomik altyazı yazıcısı bulunamadı');
const writeSubtitleAtomic = new Function('fs', `${msrc.slice(writeStart, writeEnd)}; return writeSubtitleAtomic;`)(fs);

t('SRT BOM alır fakat WebVTT BOM almaz', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'whisper-bom-'));
  try {
    const srt = path.join(dir, 'a.srt'); const vtt = path.join(dir, 'a.vtt');
    writeSubtitleAtomic(srt, '1\n00:00:00,000 --> 00:00:01,000\nA');
    writeSubtitleAtomic(vtt, 'WEBVTT\n\n00:00.000 --> 00:01.000\nA');
    ok(fs.readFileSync(srt, 'utf8').startsWith('\uFEFF'), 'SRT BOM kayboldu');
    ok(!fs.readFileSync(vtt, 'utf8').startsWith('\uFEFF'), 'VTT dosyasına BOM eklendi');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('FFmpeg burn-in Windows sürücü iki noktasını kaçışlı yazar', () => {
  const start = msrc.indexOf('function ffSubtitlesArg(');
  const end = msrc.indexOf("ipcMain.handle('burnin:start'", start);
  ok(start >= 0 && end > start, 'ffSubtitlesArg bulunamadı');
  const fn = new Function(`${msrc.slice(start, end)}; return ffSubtitlesArg;`)();
  ok(fn('D:\\Film\\altyazi.srt').includes("D\\:/Film/altyazi.srt"), 'sürücü iki noktası kaçırılmadı');
});

t('ayar içe aktarma JSON dizisini reddeder', () => {
  const start = msrc.indexOf("ipcMain.handle('settings:import'");
  const body = msrc.slice(start, msrc.indexOf("ipcMain.handle('maintenance:updateYtdlp'", start));
  ok(/Array\.isArray\(data\)/.test(body), 'JSON dizisi ayar nesnesi olarak kabul ediliyor');
});

t('uygulama yedeği ayar, tarayıcı yerleri ve izleme kütüphanesini birlikte taşır', () => {
  const exportStart = msrc.indexOf("ipcMain.handle('settings:export'");
  const importStart = msrc.indexOf("ipcMain.handle('settings:import'", exportStart);
  const end = msrc.indexOf("ipcMain.handle('maintenance:updateYtdlp'", importStart);
  const exported = msrc.slice(exportStart, importStart);
  const imported = msrc.slice(importStart, end);
  ok(/backupVersion:\s*2/.test(exported), 'sürümlü yedek biçimi yok');
  ok(/browserPlaces:\s*browserPlacesSnapshot\(\)/.test(exported), 'yer imleri ve geçmiş yedeklenmiyor');
  ok(/watchLibrary:\s*loadWatchLibrary\(\)/.test(exported), 'izleme kütüphanesi yedeklenmiyor');
  ok(/writeBrowserPlaces\(data\.browserPlaces\)/.test(imported), 'tarayıcı yerleri geri yüklenmiyor');
  ok(/saveWatchLibrary\(watchLibrary\)/.test(imported), 'izleme kütüphanesi geri yüklenmiyor');
  ok(/const settings = bundled \? data\.settings : data/.test(imported), 'eski ayar dosyası uyumluluğu korunmuyor');
});

t('ana süreç activeJob temizlendikten sonra exit olayı gönderir', () => {
  const start = msrc.indexOf("activeJob.on('close'");
  const body = msrc.slice(start, msrc.indexOf("activeJob.on('error'", start));
  ok(body.indexOf('activeJob = null') >= 0, 'activeJob temizlenmiyor');
  ok(body.indexOf('activeJob = null') < body.indexOf('sendEvent(exitEvent)'),
    'exit olayı activeJob temizlenmeden gönderiliyor');
});

t('geçici sohbet verisi benzersiz dosyada tutulur ve tüm iş bitiş yollarında silinir', () => {
  const start = msrc.indexOf("ipcMain.handle('transcribe:start'");
  const end = msrc.indexOf("ipcMain.handle('maintenance:updateYtdlp'", start);
  const body = msrc.slice(start, end);
  ok(/chat-\$\{randomUUID\(\)\}\.json/.test(body), 'sohbet dosyası hâlâ sabit adlı');
  ok(/const cleanupChatFile\s*=/.test(body), 'sohbet temizleme yardımcısı yok');
  ok(body.indexOf('chatFilePath = p') < body.indexOf('fs.writeFileSync(p, JSON.stringify(options.chat)'),
    'kısmi yazma hatasında temizlenecek sohbet yolu önceden kaydedilmiyor');
  ok(/catch \(err\) \{\s*cleanupChatFile\(\);\s*return \{ ok: false, error: `Python başlatılamadı/s.test(body),
    'spawn hatasında sohbet dosyası silinmiyor');
  const closeBody = body.slice(body.indexOf("activeJob.on('close'"), body.indexOf("activeJob.on('error'"));
  const errorBody = body.slice(body.indexOf("activeJob.on('error'"), body.indexOf('startPowerBlocker()', body.indexOf("activeJob.on('error'")));
  ok(/cleanupChatFile\(\)/.test(closeBody), 'normal kapanışta sohbet dosyası silinmiyor');
  ok(/cleanupChatFile\(\)/.test(errorBody), 'child error yolunda sohbet dosyası silinmiyor');
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
