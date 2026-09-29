/**
 * Kuyruk öldürme-yeniden-başlatma E2E (gerçek backend):
 *
 *   Sürücü (arg'sız çağrı): aynı dosyayı iki kez Electron alt süreci olarak
 *     koşturur — önce crash fazı (ani ölümle bitecek), sonra verify fazı.
 *   crash fazı: Gerçek uygulama açılır, 2 wav klibi kuyruğa eklenir ve
 *     kuyruk başlatılır (tiny/CPU/faster). Diskteki queue-state.json ilk
 *     öğeyi 'running' + queueRunning:true olarak gösterince süreç ani
 *     process.exit ile ölür — çökme/SIGKILL kalıntısı birebir budur.
 *   verify fazı: Aynı userData ile uygulama yeniden açılır. Kalıcı kuyruk
 *     geri yüklenmeli, yarım iş pending+recovered'a düşmeli, "yarım kuyruk
 *     işi kurtarıldı" uyarısı görünmeli ve kuyruk durmalı — sözleşme elle
 *     devam ettirmedir (çöken GPU/ağ işini izinsiz yeniden başlatmaz).
 *     "Kuyruğu başlat"a basılınca iki iş de 'done' ve iki .srt yazılmalı.
 *
 * Yetki notu: medya dosyası grant'ları bellekte tutulur ve yeniden
 * açılışta authorizeMediaFile "izin verilsin mi" diye sorar — bu doğru
 * güvenlik davranışıdır. Smoke diyaloğu otomatik İzin Ver'e sabitler;
 * gerçek kullanıcı çökmeden sonra ilk iş için bir kez izin verir.
 *
 *   xvfb-run -a npx electron tests/electron-queue-kill-resume.smoke.js --disable-gpu
 */
const { execFileSync, spawnSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const phase = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || '';

// --- Ortak ön koşullar (queue-concurrency smoke'u ile aynı sözleşme) ------
const home = os.homedir();
const backendPython = path.join(root, 'backend', 'venv', 'bin', 'python3');
if (!fs.existsSync(backendPython)) {
  console.log('SKIP: backend/venv yok');
  process.exit(0);
}
const hfHub = (process.env.HF_HUB_CACHE && path.join(process.env.HF_HUB_CACHE, 'hub'))
  || (process.env.HF_HOME ? path.join(process.env.HF_HOME, 'hub') : null)
  || path.join(home, '.cache', 'huggingface', 'hub');
const { repositoryHasUsableSnapshot } = require('../src/model-manager.js');
if (!repositoryHasUsableSnapshot(path.join(hfHub, 'models--Systran--faster-whisper-tiny'))) {
  console.log('SKIP: HF önbelleğinde kullanılabilir faster-whisper-tiny yok');
  process.exit(0);
}
process.env.HF_HUB_OFFLINE = '1';
let fliteOk = false;
try {
  fliteOk = /\bflite\b/.test(execFileSync('ffmpeg',
    ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 15000 }));
} catch { fliteOk = false; }
if (!fliteOk) {
  console.log('SKIP: ffmpeg flite filtresi yok (fixture üretilemez)');
  process.exit(0);
}

// --- Sürücü: crash + verify alt süreçleri ---------------------------------
if (!phase) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-kill-resume-'));
  const userData = path.join(out, 'profile');
  const env = { ...process.env, KILL_RESUME_USERDATA: userData, HF_HUB_OFFLINE: '1' };
  // Oturumdan sızan ELECTRON_RUN_AS_NODE binary'i saf Node olarak başlatır.
  delete env.ELECTRON_RUN_AS_NODE;
  const childArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu'];
  const crash = spawnSync(process.execPath, [__filename, '--phase=crash', ...childArgs],
    { env, stdio: 'inherit', timeout: 15 * 60 * 1000, windowsHide: true });
  // SIGKILL ile ölen çocuk POSIX'te status=null + signal='SIGKILL' döndürür;
  // Windows'ta TerminateProcess ile status≠0 çıkabilir. Temiz çıkış (0)
  // tek geçersiz sonuçtur.
  assert(crash.signal === 'SIGKILL' || (crash.status !== null && crash.status !== 0),
    `crash fazı beklenmedik şekilde temiz çıktı: ${crash.status} ${crash.error || ''}`);
  const verify = spawnSync(process.execPath, [__filename, '--phase=verify', ...childArgs],
    { env, stdio: 'inherit', timeout: 15 * 60 * 1000, windowsHide: true });
  assert.equal(verify.status, 0,
    `verify fazı başarısız: ${verify.status} ${verify.error || ''}`);
  console.log('PASS: kuyruk kill-resume E2E (crash → recovered → elle resume → done)');
  process.exit(0);
}

// --- Faz içi ortam: aynı userData profili ---------------------------------
const { app, BrowserWindow, dialog } = require('electron');
const userData = process.env.KILL_RESUME_USERDATA;
assert(userData, 'KILL_RESUME_USERDATA eksik');
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userData;
const inputDir = path.join(userData, 'girdi');
const outputDir = path.join(userData, 'cikti');
fs.mkdirSync(inputDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
if (phase === 'crash') {
  fs.writeFileSync(path.join(userData, 'settings.json'),
    JSON.stringify({ settingsVersion: 3, ui: { uiLocale: 'tr' }, inputDir, outputDir }));
}
const queueFile = path.join(userData, 'queue-state.json');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}

app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

app.whenReady().then(async () => {
  // Medya yetki diyaloğunu otomatik İzin Ver'e sabitle (yukarıdaki not).
  dialog.showMessageBox = async () => ({ response: 1 });
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    if (phase === 'crash') await crashPhase(run);
    else await verifyPhase(run);
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('queue-kill-resume hatası:', error && error.stack || error);
    app.exit(1);
  }
});

async function crashPhase(run) {
  const clips = [];
  for (const [i, sentence] of ['First item keeps running.', 'Second clip waits for resume.'].entries()) {
    const file = path.join(inputDir, `clip-${i}.wav`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `flite=text='${sentence}':voice=slt`,
      '-ar', '16000', '-ac', '1', '-y', file], { timeout: 30000 });
    clips.push(file);
  }
  await run(`
    const set=(id,v)=>{const el=document.getElementById(id); el.value=v; el.dispatchEvent(new Event('change',{bubbles:true}));};
    set('model','tiny'); set('engine','faster'); set('device','cpu');
    for (const id of ['translate','diarize','enableTranslation','showOriginal']) {
      const el=document.getElementById(id); if (el && el.checked) el.click();
    }
    return true;`);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: clips });
  await run('document.getElementById("dropZone").click(); return true;');
  await until(() => run('return typeof state !== "undefined" && state.queue.length === 2'), '2 öğe kuyrukta');
  await run('document.getElementById("startQueueBtn").click(); return true;');
  await until(() => run('return state.queueRunning === true'), 'Kuyruk başladı');

  // Çökme anı: ilk iş gerçekten 'running' olarak diske yazılana dek bekle.
  const snap = await until(() => {
    try {
      const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      const running = parsed.items.find((i) => i.status === 'running');
      return (parsed.queueRunning === true && running) ? parsed : null;
    } catch (_) { return null; }
  }, 'queue-state.json running kalıntısı', 120000);
  assert.equal(snap.items.length, 2, 'Kuyruk öğeleri diske düşmedi');
  assert.equal(snap.items[1].status, 'pending', 'İkinci öğe pending kalmalıydı');
  console.log('crash: ilk iş running olarak diske yazıldı — ani çıkış');

  // SIGKILL: kapanış/yakalama kodu (Electron 'exit' handler'ları dahil)
  // hiç koşmadan süreç ölür — process.exit'in aksine hiçbir JS çalışmaz.
  // Windows'ta SIGKILL de terminate anlamına gelir.
  process.kill(process.pid, 'SIGKILL');
}

async function verifyPhase(run) {
  // Renderer kalıcı kuyruğu geri yükledi; kurtarma uyarısı log'da görünmeli.
  await until(() => run(`return [...document.querySelectorAll('#log .log-line')]
    .some((l) => /yarım kuyruk işi kurtarıldı/.test(l.textContent))`),
    'Kurtarma uyarısı logu', 60000);
  console.log('verify: "yarım kuyruk işi kurtarıldı" uyarısı görüldü');

  // Kurtarılan öğeler pending+recovered olarak geri yüklenmeli ve kuyruk
  // kendiliğinden başlamamalı — devam kararı kullanıcınındır.
  const restored = await until(() => run(`return {
    n: state.queue.length,
    running: state.queueRunning,
    recovered: state.queue.filter((i) => i.recovered && i.status === 'pending').length,
    statuses: state.queue.map((i) => i.status),
  }`), 'Kuyruk geri yüklendi', 30000);
  assert.equal(restored.n, 2, `Kuyruk öğeleri kayboldu: ${JSON.stringify(restored)}`);
  assert.equal(restored.recovered, 1, `Yarım iş recovered işaretlenmedi: ${JSON.stringify(restored)}`);
  assert.equal(restored.running, false, 'Kuyruk kendiliğinden sürdü — sözleşme elle devamdır');
  console.log('verify: yarım iş pending+recovered olarak durdu, otomatik resume yok');

  // Kullanıcı "Kuyruğu başlat"a basar → iki iş de tamamlanır.
  await run('document.getElementById("startQueueBtn").click(); return true;');
  await until(() => run('return state.queueRunning === true'), 'Kuyruk sürdü', 30000);
  await until(() => run(`return state.queueRunning === false
    && state.queue.length === 2 && state.queue.every(i => i.status === 'done')`),
    'Kuyruk terminal durumu', 300000);
  console.log('verify: kuyruk elle resume ile tamamlandı');

  const written = fs.readdirSync(outputDir).filter((f) => f.endsWith('.srt'));
  assert(written.length >= 2, `Çıktı eksik: ${written}`);
  const disk = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  assert.equal(disk.queueRunning, false, 'Diskte queueRunning hâlâ true');
  assert(disk.items.every((i) => i.status === 'done'), `Diskte tamamlanmamış öğe: ${disk.items.map((i) => i.status)}`);
  console.log('PASS: verify fazı');
}
