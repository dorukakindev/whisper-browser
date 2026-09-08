/**
 * Ön kontroller ve altyazı zaman kaydırma testleri.
 *
 * Neden var:
 *  - Kuyruk, tekil başlatmadaki ön kontrolleri hiç yapmıyordu: anahtarsız
 *    çeviri/LLM/diarization veya geçersiz kırpma aralığıyla iş eklenebiliyor,
 *    kullanıcı sorunu ancak günlükten anlıyordu. Artık ikisi de aynı zengin
 *    doğrulama sonucunu (optsProblemInfo) kullanıyor; bu test gerçek kaynak
 *    uygulamasını alır.
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

// ------------------------------------------------------------ optsProblemInfo
const rsrc = fs.readFileSync(RENDERER, 'utf-8');
const vStart = rsrc.indexOf('function optsProblemInfo(opts) {');
const vEnd = rsrc.indexOf('function addToQueue(');
ok(vStart >= 0 && vEnd > vStart, 'optsProblemInfo kaynakta bulunamadi');
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
  const calls = (rsrc.match(/optsProblemInfo\(opts\)/g) || []).length;
  ok(calls >= 2, `optsProblemInfo yalnizca ${calls} yerde cagriliyor`);
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
  const longShortVtt = 'WEBVTT\n\n59:59.000 --> 59:59.500\nUzun';
  ok(shiftTimecodes(longShortVtt, 2).includes('01:00:01.000 --> 01:00:01.500'),
    'bir saati aşan kısa VTT zaman damgası saatli biçime yükseltilmedi');
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

t('burn-in nihai dosyaya değil benzersiz tmp.mp4 yoluna yazar ve tek kez finalize edilir', () => {
  const start = msrc.indexOf("ipcMain.handle('burnin:start'");
  const end = msrc.indexOf("ipcMain.handle('burnin:cancel'", start);
  const body = msrc.slice(start, end);
  ok(/burninOutputPaths\(videoPath\)/.test(body), 'benzersiz burn-in geçici yolu üretilmiyor');
  ok(/'\-nostats', tempPath/.test(body), 'ffmpeg doğrudan nihai dosyaya yazıyor');
  ok(/if \(job\.settled\) return/.test(body), 'error ve close çift finalizasyonu engellenmiyor');
  ok(/if \(burninJob === job\) burninJob = null/.test(body), 'eski job yeni job durumunu silebilir');
  ok(/replaceBurninOutput\(tempPath, outPath\)/.test(body), 'başarılı geçici çıktı nihai yola alınmıyor');
  ok(/if \(ok\) \{/.test(body), 'başarılı FFmpeg çıkışı geç iptal yarışında silinebilir');
  ok(/removeFileQuietly\(tempPath\)/.test(body), 'hata ve iptalde geçici çıktı temizlenmiyor');
  ok(/stageBurninSubtitle\(subPath\)/.test(body), 'kesme işaretli altyazı yolu güvenli geçici ada alınmıyor');
  ok(/'-map', '0:a\?'/u.test(body), 'birden fazla ses izi gömme çıktısında korunmuyor');
  ok(/'-map_metadata', '0'/u.test(body), 'kaynak metadata gömme çıktısında korunmuyor');
  ok(/removeFileQuietly\(job\.filterSubPath\)/.test(body), 'geçici altyazı kopyası iş bitiminde temizlenmiyor');
});

t('klasör izleme yalnız gerçek dizin yolunu kabul eder', () => {
  const start = msrc.indexOf("ipcMain.handle('watch:start'");
  const end = msrc.indexOf("ipcMain.handle('watch:stop'", start);
  const body = msrc.slice(start, end);
  ok(/fs\.statSync\(dir\)\.isDirectory\(\)/.test(body), 'watch:start dosya yolunu klasör sanıyor');
});

t('ayar içe aktarma JSON dizisini reddeder', () => {
  const start = msrc.indexOf("ipcMain.handle('settings:import'");
  const body = msrc.slice(start, msrc.indexOf("ipcMain.handle('maintenance:updateYtdlp'", start));
  ok(/Array\.isArray\(data\)/.test(body), 'JSON dizisi ayar nesnesi olarak kabul ediliyor');
  ok(/maxImportBytes\s*=\s*40\s*\*\s*1024\s*\*\s*1024/.test(body), 'uygulama yedeği içe aktarma boyut sınırı yok');
  ok(/statSync\(importPath\)\.size\s*>\s*maxImportBytes/.test(body), 'dosya boyutu okumadan önce denetlenmiyor');
});

t('kısmen okunabilen güvenli anahtarlar ayarlara geri yüklenir', () => {
  const start = msrc.indexOf('function loadSettings()');
  const end = msrc.indexOf('function saveSettings(', start);
  const body = msrc.slice(start, end);
  ok(/loaded\.ok\s*\|\|\s*loaded\.partial/.test(body), 'sağlam kalan gizli anahtarlar yüklemede atılıyor');
});

t('güvenli depo yokken genel ayarlar kaydedilir ve kısmi hata görünür kalır', () => {
  const saveStart = msrc.indexOf('function saveSettings(s)');
  const saveEnd = msrc.indexOf('// ---- İş geçmişi', saveStart);
  const save = msrc.slice(saveStart, saveEnd);
  ok(/secured\.unavailable[\s\S]*writeJsonAtomic\(settingsPath\(\), secured\.publicSettings\)/.test(save),
    'güvenli depo yokken genel ayarlar da kayboluyor');
  ok(/partial:\s*true/.test(save), 'kısmi kayıt sonucu çağırana bildirilmiyor');
  const rendererStart = rsrc.indexOf('async function saveAppSettings()');
  const rendererSave = rsrc.slice(rendererStart, rsrc.indexOf('// ===== Tüm UI ayarlarını', rendererStart));
  ok(/saved\?\.ok === false/.test(rendererSave) && /saved\?\.error/.test(rendererSave),
    'renderer ayar kayıt hatasını kullanıcıya göstermiyor');
});

t('uygulama yedeği ayar, tarayıcı yerleri ve izleme kütüphanesini birlikte taşır', () => {
  const exportStart = msrc.indexOf("ipcMain.handle('settings:export'");
  const importStart = msrc.indexOf("ipcMain.handle('settings:import'", exportStart);
  const end = msrc.indexOf("ipcMain.handle('maintenance:updateYtdlp'", importStart);
  const exported = msrc.slice(exportStart, importStart);
  const imported = msrc.slice(importStart, end);
  ok(/backupVersion:\s*3/.test(exported), 'sürümlü yedek biçimi yok');
  ok(exported.includes('learningAnnotations'), 'kalıcı notlar uygulama yedeğine eklenmiyor');
  ok(/browserPlaces:\s*browserPlacesSnapshot\(\)/.test(exported), 'yer imleri ve geçmiş yedeklenmiyor');
  ok(/watchLibrary:\s*loadWatchLibraryAll\(\)/.test(exported),
    'taşma kayıtları dahil izleme kütüphanesi yedeklenmiyor');
  ok(/writeBrowserPlaces\(data\.browserPlaces\)/.test(imported), 'tarayıcı yerleri geri yüklenmiyor');
  ok(/saveWatchLibrary\(watchLibrary,\s*\{\s*restoreRemoved:\s*true\s*\}\)/.test(imported),
    'izleme kütüphanesi açık restore kararıyla geri yüklenmiyor');
  ok(/watchLibraryCount:\s*loadWatchLibraryAll\(\)\.length/.test(imported),
    'geri yüklenen taşma kayıtları sonuç sayacında eksik raporlanıyor');
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
  ok(body.indexOf('chatFilePath = p') < body.indexOf('fs.writeFileSync(p, chatPayload'),
    'kısmi yazma hatasında temizlenecek sohbet yolu önceden kaydedilmiyor');
  ok(/Buffer\.byteLength\(chatPayload, 'utf8'\) > 8 \* 1024 \* 1024/.test(body),
    'sohbet geçici dosyasında güvenli boyut sınırı yok');
  ok(/mode:\s*0o600/.test(body), 'sohbet geçici dosyası kısıtlı izinle yazılmıyor');
  ok(/catch \(err\) \{[\s\S]{0,320}cleanupChatFile\(\);\s*return \{ ok: false, error: `Python başlatılamadı/.test(body),
    'spawn hatasında sohbet dosyası silinmiyor');
  const closeBody = body.slice(body.indexOf("activeJob.on('close'"), body.indexOf("activeJob.on('error'"));
  const errorBody = body.slice(body.indexOf("activeJob.on('error'"), body.indexOf('startPowerBlocker()', body.indexOf("activeJob.on('error'")));
  ok(/cleanupChatFile\(\)/.test(closeBody), 'normal kapanışta sohbet dosyası silinmiyor');
  ok(/cleanupChatFile\(\)/.test(errorBody), 'child error yolunda sohbet dosyası silinmiyor');
});

t('çökmeden kalan sohbet dosyaları açılışta ve dar hedefle temizlenir', () => {
  const sweepStart = msrc.indexOf('function sweepStaleChatFiles()');
  const sweepEnd = msrc.indexOf('\n}', sweepStart) + 2;
  const sweep = msrc.slice(sweepStart, sweepEnd);
  ok(sweepStart >= 0, 'sohbet artık temizleyicisi yok');
  ok(/\^chat-\[0-9a-f\]/.test(sweep), 'temizlik tüm tmp klasörünü hedefliyor');
  ok(/sweepStaleChatFiles\(\);/.test(msrc.slice(msrc.indexOf('app.whenReady()'))),
    'sohbet artığı açılışta temizlenmiyor');
});

t('ana pencere güvenliği açık ve IPC yalnız ana frame kabul ediyor', () => {
  const create = msrc.slice(msrc.indexOf('mainWindow = new BrowserWindow'),
    msrc.indexOf('installSystemAudioCaptureHandler()', msrc.indexOf('mainWindow = new BrowserWindow')));
  ok(/sandbox:\s*true/.test(create), 'ana pencere sandbox açık değil');
  ok(/webSecurity:\s*true/.test(create), 'ana pencere webSecurity açık değil');
  ok(/webviewTag:\s*false/.test(create), 'ana pencere webviewTag açıkça kapalı değil');
  const auth = msrc.slice(msrc.indexOf('function authorizedBrowserSender'),
    msrc.indexOf("ipcMain.on('browser:trusted-bridge'"));
  ok(/event\.senderFrame === contents\.mainFrame/.test(auth), 'IPC senderFrame ana frame ile doğrulanmıyor');
});

t('kapanış, manga ağ hataları ve atomik altyazı yazımı güvenli toparlanır', () => {
  const atomic = msrc.slice(msrc.indexOf('function writeSubtitleAtomic'),
    msrc.indexOf('function writeJsonAtomic'));
  ok(/catch \(error\)[\s\S]*fs\.unlinkSync\(tmp\)/.test(atomic),
    'başarısız altyazı rename işleminden sonra .tmp temizlenmiyor');
  const beforeQuit = msrc.slice(msrc.indexOf("app.on('before-quit'"),
    msrc.indexOf("app.on('window-all-closed'"));
  ok(/persistBrowserSessionNow\(\)/.test(beforeQuit),
    'before-quit son tarayıcı oturumunu yazmıyor');
  const retryable = msrc.slice(msrc.indexOf('function mangaRetryableDownloadError'),
    msrc.indexOf('function waitForMangaRetry'));
  ok(/enotfound/.test(retryable) && /eai_again/.test(retryable) && /etimedout/.test(retryable),
    'geçici DNS/timeout kodları yeniden denenebilir değil');
  ok(/MAX_MANGA_IMAGE_BASE64_CHARS/.test(msrc.slice(msrc.indexOf('function dataUrlMangaImage') - 180,
    msrc.indexOf('async function assertPublicMangaImageHost'))),
    'data URL decode öncesi boyut sınırı yok');
  ok(/const attempt = 2 - rateLimitRetries/.test(msrc), '429 backoff ilk denemede 2 kat uzun');
});

t('kapanışta sağlam sekmeler boş görünümle ikinci kez ezilmez', () => {
  const closeStart = msrc.indexOf("mainWindow.on('close'");
  const closeEnd = msrc.indexOf("mainWindow.on('closed'", closeStart);
  const close = msrc.slice(closeStart, closeEnd);
  const flushed = close.indexOf('await flushBrowserSession()');
  const finalized = close.indexOf('browserSessionFinalizedForQuit = true');
  const destroyed = close.indexOf('destroyBrowserView()');
  ok(flushed >= 0 && finalized > flushed, 'kapanış oturum yazımını finalize etmiyor');
  ok(destroyed > finalized, 'tarayıcı sekmeleri oturum yazılmadan önce yok ediliyor');

  const beforeQuit = msrc.slice(msrc.indexOf("app.on('before-quit'"),
    msrc.indexOf("app.on('window-all-closed'"));
  ok(/if \(!browserSessionFinalizedForQuit\) persistBrowserSessionNow\(\)/.test(beforeQuit),
    'before-quit sağlam oturumu boş sekme listesiyle yeniden yazabilir');
  const persist = msrc.slice(msrc.indexOf('function persistBrowserSessionNow'),
    msrc.indexOf('function restoreBrowserSessionState'));
  ok(/if \(browserSessionFinalizedForQuit\) return \{ ok: true, skipped: true \}/.test(persist),
    'destroyBrowserView gecikmiş timerı sağlam oturumun üzerine yazabilir');
});

t('transkripsiyon Python süreci Windows konsol penceresi açmadan başlatılır', () => {
  const start = msrc.indexOf('activeJob = spawn(pythonPath, args');
  const line = msrc.slice(start, msrc.indexOf('\n', start));
  ok(/windowsHide:\s*true/.test(line), 'transkripsiyon spawn windowsHide kullanmıyor');
});

t('çeviri endpointi tam rota verilince chat/completions ekini çoğaltmaz', () => {
  const start = msrc.indexOf('function safeTranslationEndpoint(');
  const end = msrc.indexOf('async function readResponseBufferLimited', start);
  ok(start >= 0 && end > start, 'safeTranslationEndpoint bulunamadı');
  const safeTranslationEndpoint = new Function(
    `${msrc.slice(start, end)}; return safeTranslationEndpoint;`)();
  ok(safeTranslationEndpoint('https://api.example.test/v1') ===
    'https://api.example.test/v1/chat/completions', 'taban rota tamamlanmadı');
  ok(safeTranslationEndpoint('https://api.example.test/v1/chat/completions') ===
    'https://api.example.test/v1/chat/completions', 'tam rota iki kez tamamlandı');
  ok(safeTranslationEndpoint('http://api.example.test/v1') === '',
    'uzak güvensiz HTTP rota kabul edildi');
});

t('altyazıyı farklı kaydet kaynak biçimini ve uzantısını korur', () => {
  const start = msrc.indexOf("ipcMain.handle('media:saveSubtitleCopy'");
  const end = msrc.indexOf("ipcMain.handle('media:saveImage'", start);
  const body = msrc.slice(start, end);
  ok(/sourceExt = \/\^\\\.\(srt\|vtt\|ass\|ssa\)\$\/i/.test(body),
    'kaynak altyazı uzantısı doğrulanmıyor');
  ok(/`\$\{parsed\.name\}\.duzeltilmis\$\{sourceExt\}`/.test(body),
    'farklı kaydet adı kaynak biçimini korumuyor');
  ok(/WebVTT altyazı/.test(body) && /ASS\/SSA altyazı/.test(body),
    'kaydet diyaloğu biçime uygun filtre kullanmıyor');
});

t('uzun çalışan süreçlerin NDJSON satır tamponları sınırlıdır', () => {
  const mediaStart = msrc.indexOf('function runMediaCommand(');
  const mediaEnd = msrc.indexOf("ipcMain.handle('media:probe'", mediaStart);
  const media = msrc.slice(mediaStart, mediaEnd);
  ok(/createNdjsonLineBuffer/.test(media) && /8 \* 1024 \* 1024/.test(media),
    'medya yardımcı sürecinin stdout tamponu sınırsız');
  const liveStart = msrc.indexOf('function startBrowserLiveAsr(');
  const liveEnd = msrc.indexOf('function stopBrowserLiveAsr(', liveStart);
  const live = msrc.slice(liveStart, liveEnd);
  ok(/createNdjsonLineBuffer/.test(live) && /8 \* 1024 \* 1024/.test(live),
    'canlı ASR stdout tamponu sınırsız');
  ok(/job\.cues\.length > 20_?000/.test(live), 'canlı ASR cue belleği sınırsız');
});

t('AI işi ve oynatıcı kapanışı görünür durumu temizler', () => {
  const cancel = rsrc.slice(rsrc.indexOf("$('cancelBtn').addEventListener"),
    rsrc.indexOf('function finishRun'));
  ok(/aiJob\.bubble[\s\S]*İptal edildi/.test(cancel), 'ana iptal AI sohbet balonunu temizlemiyor');
  const events = rsrc.slice(rsrc.indexOf('function playerJobEvent'),
    rsrc.indexOf('window.api.onEvent'));
  ok(/Video veya sohbet oturumu değiştiği için önceki yanıt/.test(events),
    'video değişince bekleyen AI sohbet balonu temizlenmiyor');
  const close = rsrc.slice(rsrc.indexOf('function closePlayer'), rsrc.indexOf('async function playPlaylistDelta'));
  ok(/stopAmbient\(\)/.test(close), 'oynatıcı kapanırken ambient zamanlayıcı durmuyor');
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
                             msrc.indexOf('\n});', msrc.indexOf("ipcMain.handle('subs:shift'")) + 4);
  ok(handler.includes('decodeSubtitleBuffer'), 'duz utf-8 okuma geri gelmis');
  ok(handler.includes('backupOnce'), '.bak alinmiyor');
  ok(handler.includes('writeSubtitleAtomic'), 'atomik yazma yok');
});

console.log(`\n${pass} geçti, ${fails.length} başarısız (${pass + fails.length} test)`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
