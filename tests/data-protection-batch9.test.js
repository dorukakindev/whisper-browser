// Madde 41–45 veri koruma sözleşme kilitleri — statik kaynak denetimi +
// yedekleme kapsam roundtrip'leri. Electron UI davranışı smoke'larda değil
// burada doğrulanır; kurallar `subtitle:watch` yetki sınırını, kendi-yazım
// bastırmasını, disk ön kontrolünü, çevrimdışı kapılarını ve kurtarma
// merkezinin IPC yüzeyini aynen kilitler.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createBackupPayload,
  parseImportText,
  sanitizeSettings,
} = require('../src/settings-security');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
const RENDERER = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

function test(name, fn) {
  try { fn(); console.log('  PASS', name); }
  catch (error) { console.error('  FAIL', name, error); process.exitCode = 1; }
}

test('M41: kapsamlı yedek ayarsız bölümle içe aktarılabilir', () => {
  const notesOnly = JSON.stringify({
    backupVersion: 3,
    learningAnnotations: [{ id: 'a1', text: 'not' }],
  });
  const parsed = parseImportText(notesOnly, {});
  assert.strictEqual(parsed.settings, undefined, 'ayarsız kapsam ayar yazımı üretmemeli');
  assert.deepStrictEqual(parsed.learningAnnotations, [{ id: 'a1', text: 'not' }]);
});

test('M41: hiç bölüm içermeyen yedek dosyası reddedilir', () => {
  assert.throws(
    () => parseImportText(JSON.stringify({ backupVersion: 3 }), {}),
    /geri yüklenebilecek bölüm/,
  );
});

test('M41: tam kapsamlı yedek settings bölümünü korur', () => {
  const settings = sanitizeSettings({ ui: { model: 'tiny' }, outputDir: 'C:\\out' });
  const payload = createBackupPayload(settings, { history: [], bookmarks: [] }, []);
  const parsed = parseImportText(JSON.stringify(payload), {});
  assert.ok(parsed.bundled);
  assert.strictEqual(parsed.settings.ui.model, 'tiny');
});

test('M42: izleme IPC yalnız erişim izni verilmiş yolları kabul eder', () => {
  const watchBody = MAIN.slice(MAIN.indexOf("ipcMain.handle('subtitle:watch'"), MAIN.indexOf('// ===== Klasör izleme'));
  assert.match(watchBody, /subtitleFileAccess\.inspect/, 'kanonikleştirme zorunlu');
  assert.match(watchBody, /subtitleFileAccess\.has/, 'izinsiz yol sessizce atlanmalı');
  assert.doesNotMatch(watchBody, /grant\(/, 'izleme isteği izin diyaloğu açmamalı');
});

test('M42: kendi writeSubtitleAtomic yazımı izleyici olayını bastırır', () => {
  const atomicBody = MAIN.slice(MAIN.indexOf('function writeSubtitleAtomic'), MAIN.indexOf('// Düz metin (Markdown'));
  assert.match(atomicBody, /markOwnSubtitleWrite/);
  const notifyBody = MAIN.slice(MAIN.indexOf('function notifySubtitleFileChanged'), MAIN.indexOf('function rebuildSubtitleWatchers'));
  assert.match(notifyBody, /ownSubtitleWrites/, 'kendi yazımı olay göndermemeli');
  assert.match(notifyBody, /readFileSync/, 'içerik olayla gönderilmeli');
});

test('M42: renderer dış-değişiklik olayında açık düzenlemeyi ezmiyor', () => {
  const section = RENDERER.slice(RENDERER.indexOf('// ===== Madde 42'), RENDERER.indexOf('// ===== Initial log'));
  assert.match(section, /subtitleTrackHasEdits/);
  assert.match(section, /cueEditUndo/, 'geri-alma geçmişi düzenleme sayılır');
  assert.match(section, /applyExternalSubtitleContent/, 'temiz durumda sessiz tazeleme');
  assert.match(RENDERER, /scheduleSubtitleWatchRefresh/, 'altyazı yüklenince izleme tazelenir');
  assert.match(PRELOAD, /watchSubtitlePaths/, 'preload köprüsü zorunlu');
});

test('M43: burn-in ve transkripsiyon disk ön kontrolü yapar', () => {
  const burninBody = MAIN.slice(MAIN.indexOf("ipcMain.handle('burnin:start'"), MAIN.indexOf("ipcMain.handle('burnin:cancel'"));
  assert.match(burninBody, /diskFreeBytes/);
  assert.match(burninBody, /diskSpaceError/);
  const trBody = MAIN.slice(MAIN.indexOf("ipcMain.handle('transcribe:start'"), MAIN.indexOf("ipcMain.handle('maintenance:updateYtdlp'", MAIN.indexOf("ipcMain.handle('transcribe:start'")));
  assert.match(trBody, /diskFreeBytes/);
  assert.match(trBody, /diskSpaceError/);
});

test('M43: iş sürerken düşük disk uyarısı yüzeye çıkar', () => {
  assert.match(MAIN, /lowDisk/, 'örnekleme bayrağı');
  const resourceCase = RENDERER.slice(RENDERER.indexOf("case 'job_resource'"), RENDERER.indexOf("case 'job_resource_final'"));
  assert.match(resourceCase, /lowDiskWarned/, 'iş başına bir kez uyarı');
  assert.match(RENDERER, /state\.lowDiskWarned = false/, 'yeni işte sıfırlanır');
});

test('M44: çevrimiçi-gerektiren işlemler çevrimdışı kapısından geçer', () => {
  const ytdlpBody = MAIN.slice(MAIN.indexOf("ipcMain.handle('maintenance:updateYtdlp'"), MAIN.indexOf("ipcMain.handle('maintenance:updateYtdlp'") + 4000);
  assert.match(ytdlpBody, /networkOnline/, 'yt-dlp güncellemesi çevrimdışıyken net hata vermeli');
  assert.match(MAIN, /function networkOnline/);
  assert.match(INDEX, /id="netBadge"/, 'kalıcı çevrimdışı rozeti');
  assert.match(RENDERER, /addEventListener\('offline'/, 'offline dinleyicisi');
  assert.match(RENDERER, /updateNetBadge/, 'rozet güncelleyici');
});

test('M45: kurtarma merkezi tüm kaynakları tek ekranda toplar', () => {
  assert.match(INDEX, /id="recoveryCenterBtn"/);
  const timelineBody = MAIN.slice(MAIN.indexOf("ipcMain.handle('timeline:recovery'"), MAIN.indexOf("ipcMain.handle('timeline:recovery'") + 3000);
  assert.match(timelineBody, /action === 'list'/, 'kaydetme-dışı listeleme eylemi');
  const center = RENDERER.slice(RENDERER.indexOf('function renderRecoveryCenter'), RENDERER.indexOf('// ===== Madde 33'));
  assert.match(center, /burnin/, 'gömme kurtarması bölümü');
  assert.match(center, /timeline/, 'düzenleme kayıtları bölümü');
  assert.match(center, /queue/, 'kuyruk bölümü');
  assert.match(PRELOAD, /timelineRecovery/, 'preload köprüsü');
});
