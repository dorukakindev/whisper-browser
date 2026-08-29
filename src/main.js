const { app, BrowserWindow, ipcMain, dialog, shell, Notification, powerSaveBlocker, clipboard, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let activeJob = null;
let powerBlockerId = null;

// İş çalışırken sistemin uykuya geçmesini engelle (uzun transkripsiyon yarıda kalmasın)
function startPowerBlocker() {
  if (powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  }
}

function stopPowerBlocker() {
  if (powerBlockerId !== null) {
    try { powerSaveBlocker.stop(powerBlockerId); } catch (_) {}
    powerBlockerId = null;
  }
}

// Görev çubuğu ilerleme göstergesi — pencere arka plandayken de durum görünür
function setTaskbarProgress(value) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(value);
  }
}

function sendEvent(payload) {
  // Pencere iş çalışırken kapatılmış olabilir — yok edilmiş pencereye göndermeye çalışma
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('transcribe:event', payload);
  }
}

// ===== Kalıcı iş günlüğü =====
// Uygulama içi günlük kapanınca kayboluyor; gece çalışan kuyruklarda ne olduğunu
// sonradan görebilmek için her iş userData/logs altına ayrı dosyaya yazılır.
const LOG_KEEP = 100;                 // en yeni N günlük tutulur, gerisi silinir
const LOG_SKIP = new Set(['segment', 'progress', 'download_progress', 'llm_progress', 'preview_refresh']);
let jobLog = null;

function logsDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

function pruneOldLogs(keep = LOG_KEEP) {
  try {
    const dir = logsDir();
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const full = path.join(dir, f);
        try { return { full, t: fs.statSync(full).mtimeMs }; } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.t - a.t);
    files.slice(keep).forEach((x) => { try { fs.unlinkSync(x.full); } catch (_) {} });
  } catch (_) {}
}

function startJobLog(label, args) {
  endJobLog();
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    // Dosya adı yalnızca girdinin adı olsun (tam yol değil); tam yol başlıkta yazılı
    const base = String(label || 'is').split(/[\\/]/).pop() || 'is';
    const safe = base.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const file = path.join(logsDir(), `${stamp}_${safe}.log`);
    const stream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf-8' });
    // Argümanlar gizli anahtar içermez (HF token / LLM key ortam değişkeniyle geçer)
    stream.write(`# Whisper Altyazı iş günlüğü\n# Başlangıç : ${d.toLocaleString('tr-TR')}\n`);
    stream.write(`# Girdi     : ${label}\n# Ayarlar   : ${args.slice(1).join(' ')}\n\n`);
    jobLog = { file, stream };
    pruneOldLogs();
  } catch (_) {
    jobLog = null;
  }
}

function writeJobLog(event) {
  if (!jobLog || LOG_SKIP.has(event.type)) return;
  const t = new Date().toLocaleTimeString('tr-TR');
  let line;
  switch (event.type) {
    case 'log':
      line = `[${t}] ${String(event.level || 'info').toUpperCase()}: ${event.message}`;
      break;
    case 'status':
      line = `[${t}] AŞAMA (${event.stage}): ${event.text}`;
      break;
    case 'language':
      line = `[${t}] DİL: ${event.code} (%${Math.round((event.probability || 0) * 100)}) · süre ${event.duration}s`;
      break;
    case 'quality_report':
      line = `[${t}] KALİTE: ${event.blocks} blok · ${event.cps_violations} hızlı okuma · `
           + `${event.overlaps} çakışma · en uzun ${event.longest_dur}s · maks ${event.max_cps} KPS`;
      break;
    case 'error':
      line = `[${t}] HATA: ${event.message}${event.traceback ? `\n${event.traceback}` : ''}`;
      break;
    case 'done': {
      const w = Array.isArray(event.warnings) ? event.warnings : [];
      line = `[${t}] BİTTİ: ${event.segments} blok\n         dosyalar: ${(event.files || []).join(', ')}`
           + (w.length ? `\n[${t}] UYARILAR (${w.length}):\n  - ${w.join('\n  - ')}` : '');
      break;
    }
    case 'exit':
      line = `[${t}] SÜREÇ KAPANDI (kod ${event.code})`;
      break;
    default:
      line = `[${t}] ${event.type}`;
  }
  try { jobLog.stream.write(`${line}\n`); } catch (_) {}
}

function endJobLog() {
  if (!jobLog) return;
  try { jobLog.stream.end(); } catch (_) {}
  jobLog = null;
}

ipcMain.handle('logs:openFolder', async () => {
  const dir = logsDir();
  const err = await shell.openPath(dir);
  return err ? { ok: false, error: err } : { ok: true, path: dir };
});

function killActiveJob() {
  if (!activeJob) return;
  const proc = activeJob;
  const pid = proc.pid;
  try {
    if (process.platform === 'win32' && pid) {
      // Tüm süreç ağacını öldür (python + ffmpeg/yt-dlp alt süreçleri orphan kalmasın)
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) {
    try { proc.kill('SIGKILL'); } catch (_) {}
  }
}

// ---- Kalıcı ayarlar (sözlük + HF token) ----
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  } catch (_) {
    return { glossary: [], hfToken: '' };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

// ---- Pencere boyutu hatırlama (ayrı dosya — settings.json'a karışmaz) ----
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath(), 'utf-8'));
  } catch (_) {
    return null;
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    // Maximized iken bile geri yüklenecek normal boyutu sakla
    const b = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ width: b.width, height: b.height, maximized: mainWindow.isMaximized() }, null, 2),
      'utf-8'
    );
  } catch (_) {}
}

function createWindow() {
  // Windows'ta bildirimlerin doğru uygulama adıyla görünmesi için
  if (process.platform === 'win32') app.setAppUserModelId('Whisper Altyazı');
  const st = loadWindowState();
  // Kayıtlı boyutu ekrana kelepçele — bozuk/devasa window-state.json ekran-dışı pencere üretmesin
  const work = screen.getPrimaryDisplay().workAreaSize;
  const initW = st && st.width >= 940 ? Math.min(st.width, work.width) : Math.min(1180, work.width);
  const initH = st && st.height >= 680 ? Math.min(st.height, work.height) : Math.min(820, work.height);
  mainWindow = new BrowserWindow({
    // Pozisyon kasıtlı olarak geri yüklenmiyor (ekran-dışı pencere riskini önlemek için)
    width: initW,
    height: initH,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: '#0b0f17',
    title: 'Whisper Altyazı',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (st && st.maximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('close', saveWindowState);
  // İş bitince yanıp sönen taskbar vurgusunu odaklanınca temizle
  mainWindow.on('focus', () => mainWindow.flashFrame(false));

  // Harici http(s) linkleri (target="_blank" vb.) varsayılan tarayıcıda aç,
  // uygulama içinde yeni pencere açılmasını engelle
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Sayfa içi navigasyonu engelle (örn. pencereye dosya bırakılınca file:// açılması)
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  killActiveJob();
  // Çalışan yt-dlp güncellemesi (pip) / burn-in (ffmpeg) varsa onları da öldür — orphan kalmasın
  for (const j of [updateJob, burninJob]) {
    if (j && j.pid) {
      try { spawn('taskkill', ['/pid', String(j.pid), '/T', '/F'], { windowsHide: true }); } catch (_) {}
    }
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC handlers ---

ipcMain.handle('dialog:openVideo', async () => {
  const prev = loadSettings();
  const opts = {
    title: 'Video veya ses dosyası seç (çoklu seçim → kuyruk)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video / Ses', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'] },
      { name: 'Tüm Dosyalar', extensions: ['*'] },
    ],
  };
  // Son kullanılan girdi klasörünü hatırla
  if (prev && prev.lastInputDir && fs.existsSync(prev.lastInputDir)) opts.defaultPath = prev.lastInputDir;
  const result = await dialog.showOpenDialog(mainWindow, opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  // Seçilen dosyanın klasörünü kaydet (mevcut ayarları koruyarak birleştir)
  try {
    const s = loadSettings();
    s.lastInputDir = path.dirname(result.filePaths[0]);
    saveSettings(s);
  } catch (_) {}
  return result.filePaths;
});

// JSON re-export / SRT shift / settings import için tek-dosya seçici (uzantı filtreli)
ipcMain.handle('dialog:openFile', async (_event, kind) => {
  const filterMap = {
    json: { name: 'JSON altyazı verisi', extensions: ['json'] },
    settings: { name: 'Ayar dosyası', extensions: ['json'] },
    subtitle: { name: 'Altyazı (SRT)', extensions: ['srt'] },
  };
  const f = filterMap[kind] || { name: 'Tüm Dosyalar', extensions: ['*'] };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Dosya seç',
    properties: ['openFile'],
    filters: [f, { name: 'Tüm Dosyalar', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

const MEDIA_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', '3gp',
  'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'
]);

function scanMediaFromPaths(inputPaths) {
  const results = [];
  const visited = new Set();

  function walk(targetPath, depth = 0) {
    if (depth > 5) return;
    try {
      if (!fs.existsSync(targetPath)) return;
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        // Doğal sayısal sıralama (S01E01, S01E02 vb.)
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        for (const entry of entries) {
          walk(path.join(targetPath, entry.name), depth + 1);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(targetPath).slice(1).toLowerCase();
        if (MEDIA_EXTS.has(ext)) {
          const norm = path.normalize(targetPath);
          if (!visited.has(norm)) {
            visited.add(norm);
            results.push(norm);
          }
        }
      }
    } catch (err) {
      console.error('Klasör/dosya tarama hatası:', targetPath, err);
    }
  }

  for (const p of inputPaths) {
    walk(p);
  }
  return results;
}

ipcMain.handle('dialog:openFolders', async () => {
  const prev = loadSettings();
  const opts = {
    title: 'Klasör veya klasörler seç (içlerindeki tüm videolar sıraya eklenir)',
    properties: ['openDirectory', 'multiSelections'],
  };
  if (prev && prev.lastInputDir && fs.existsSync(prev.lastInputDir)) opts.defaultPath = prev.lastInputDir;
  const result = await dialog.showOpenDialog(mainWindow, opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  try {
    const s = loadSettings();
    s.lastInputDir = path.dirname(result.filePaths[0]);
    saveSettings(s);
  } catch (_) {}
  return scanMediaFromPaths(result.filePaths);
});

ipcMain.handle('paths:scanMedia', async (_event, inputPaths) => {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) return [];
  return scanMediaFromPaths(inputPaths);
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Çıktı klasörü seç',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('shell:openPath', async (_event, p) => {
  if (!p) return;
  return shell.openPath(p);
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  // Sadece http(s) — keyfi protokol açılmasını engelle
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  return shell.openExternal(url);
});

ipcMain.handle('notify', (_event, opts) => {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: (opts && opts.title) || 'Whisper Altyazı',
      body: (opts && opts.body) || '',
    });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    n.show();
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('shell:showInFolder', async (_event, p) => {
  if (!p) return;
  return shell.showItemInFolder(p);
});

ipcMain.handle('app:getPaths', () => {
  return {
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    videos: app.getPath('videos'),
    downloads: app.getPath('downloads'),
  };
});

ipcMain.handle('clipboard:write', (_event, text) => {
  if (typeof text !== 'string') return false;
  clipboard.writeText(text);
  return true;
});

// Bir komutu çalıştırıp ilk satırını döndürür (yoksa null) — ortam teşhisi için
function probeCommand(cmd, cmdArgs) {
  return new Promise((resolve) => {
    let out = '';
    let p;
    try {
      p = spawn(cmd, cmdArgs, { windowsHide: true });
    } catch (_) {
      return resolve(null);
    }
    p.on('error', () => resolve(null));
    if (p.stdout) p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      resolve((out.split(/\r?\n/)[0] || '').trim() || null);
    });
  });
}

// Açılış ortam kontrolü: venv, ffmpeg ve GPU adı
ipcMain.handle('app:getEnvInfo', async () => {
  const appDir = app.getAppPath();
  const venv = fs.existsSync(path.join(appDir, 'backend', 'venv', 'Scripts', 'python.exe'))
            || fs.existsSync(path.join(appDir, 'backend', '.venv', 'Scripts', 'python.exe'));
  const localFfmpeg = fs.existsSync(path.join(appDir, 'backend', 'bin', 'ffmpeg.exe'));
  const [ffmpegLine, gpuLine] = await Promise.all([
    localFfmpeg ? Promise.resolve('local') : probeCommand('ffmpeg', ['-version']),
    probeCommand('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader']),
  ]);
  // "NVIDIA GeForce RTX 4070 Ti, 12282 MiB" → toplam VRAM (MiB)
  let vramMib = null;
  if (gpuLine) {
    const m = gpuLine.match(/(\d+)\s*MiB/i);
    if (m) vramMib = parseInt(m[1], 10);
  }
  return { venv, ffmpeg: !!ffmpegLine, gpu: gpuLine, vramMib };
});

// ---- Settings (sözlük, HF token) ----
ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_event, s) => saveSettings(s));

// ---- Ayarları dışa/içe aktar ----
ipcMain.handle('settings:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Ayarları dışa aktar',
    defaultPath: 'whisper-altyazi-ayarlar.json',
    filters: [{ name: 'Ayar dosyası', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(loadSettings(), null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('settings:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ayar dosyası içe aktar',
    properties: ['openFile'],
    filters: [{ name: 'Ayar dosyası', extensions: ['json'] }, { name: 'Tüm Dosyalar', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    if (!data || typeof data !== 'object') return { ok: false, error: 'Geçersiz ayar dosyası.' };
    saveSettings(data);          // diske yaz
    return { ok: true, settings: data };  // renderer UI'a uygulasın
  } catch (err) {
    return { ok: false, error: 'Ayar dosyası okunamadı: ' + err.message };
  }
});

// ffmpeg/ffprobe yolu: önce backend/bin, sonra PATH
function resolveFfTool(name) {
  const local = path.join(app.getAppPath(), 'backend', 'bin', `${name}.exe`);
  return fs.existsSync(local) ? local : name;
}

// ---- Ses kanallarını listele (film çok-kanallı olabilir: orijinal/dublaj/yorum) ----
// ffprobe ile ses akışlarını döndürür. `index` ffmpeg -map 0:a:N için ses-göreli sıradır.
ipcMain.handle('media:probeTracks', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, tracks: [] };
  const ffprobe = resolveFfTool('ffprobe');
  return new Promise((resolve) => {
    let out = '';
    let p;
    try {
      p = spawn(ffprobe, [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=index,codec_name,channels:stream_tags=language,title',
        '-of', 'json', filePath,
      ], { windowsHide: true });
    } catch (_) {
      return resolve({ ok: false, tracks: [] });
    }
    p.on('error', () => resolve({ ok: false, tracks: [] }));
    if (p.stdout) p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      if (code !== 0) return resolve({ ok: false, tracks: [] });
      try {
        const data = JSON.parse(out);
        const tracks = (data.streams || []).map((s, i) => {
          const tags = s.tags || {};
          return {
            index: i,  // ses-göreli indeks → -map 0:a:i
            lang: tags.language || tags.LANGUAGE || '',
            title: tags.title || tags.TITLE || '',
            channels: s.channels || 0,
            codec: s.codec_name || '',
          };
        });
        resolve({ ok: true, tracks });
      } catch (_) {
        resolve({ ok: false, tracks: [] });
      }
    });
  });
});

// ---- Altyazı zaman kaydırma (SRT/VTT) ----
function shiftTimecodes(text, offsetSec) {
  return text.replace(/(\d{2}):(\d{2}):(\d{2})([,.])(\d{3})/g, (_m, h, m, s, sep, ms) => {
    let total = (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000 + offsetSec;
    if (total < 0) total = 0;
    const t = Math.round(total * 1000);
    const hh = Math.floor(t / 3600000);
    const mm = Math.floor((t % 3600000) / 60000);
    const ss = Math.floor((t % 60000) / 1000);
    const mmm = t % 1000;
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(hh)}:${p2(mm)}:${p2(ss)}${sep}${String(mmm).padStart(3, '0')}`;
  });
}

ipcMain.handle('subs:shift', async (_event, filePath, offsetSec) => {
  if (!filePath || typeof offsetSec !== 'number' || !isFinite(offsetSec)) {
    return { ok: false, error: 'Geçersiz parametre.' };
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.srt' && ext !== '.vtt') {
    return { ok: false, error: 'Zaman kaydırma yalnızca SRT/VTT için destekleniyor.' };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');         // BOM dahil okunur
    const shifted = shiftTimecodes(raw, offsetSec);
    fs.writeFileSync(filePath, shifted, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---- Altyazıyı videoya göm (ffmpeg burn-in) ----
// subtitles filtresi argümanı: yolu tek tırnağa al (boşluk + sürücü iki noktası güvenli),
// backslash→slash çevir, içerideki tek tırnağı kaçışla. argv ile geçildiği için shell kaçışı gerekmez.
function ffSubtitlesArg(p) {
  const fwd = p.replace(/\\/g, '/').replace(/'/g, "\\'");
  return `subtitles='${fwd}'`;
}

let burninJob = null;
ipcMain.handle('burnin:start', async (_event, videoPath, subPath) => {
  if (burninJob) return { ok: false, error: 'Gömme zaten çalışıyor.' };
  if (!videoPath || !subPath || !fs.existsSync(videoPath) || !fs.existsSync(subPath)) {
    return { ok: false, error: 'Video veya altyazı dosyası bulunamadı.' };
  }
  const ext = path.extname(subPath).toLowerCase();
  if (ext !== '.srt' && ext !== '.ass') {
    return { ok: false, error: 'Gömme için SRT veya ASS altyazı gerekir.' };
  }
  const ffmpeg = resolveFfTool('ffmpeg');
  const ffprobe = resolveFfTool('ffprobe');
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(dir, `${base}.altyazili.mp4`);

  // Toplam süreyi al (ilerleme yüzdesi için)
  let totalSec = 0;
  try {
    const probe = await probeCommand(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath]);
    totalSec = parseFloat(probe) || 0;
  } catch (_) {}

  const vf = ffSubtitlesArg(subPath);
  const args = ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', '-progress', 'pipe:1', '-nostats', outPath];

  const send = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('burnin:event', payload);
  };

  try {
    burninJob = spawn(ffmpeg, args, { windowsHide: true });
  } catch (err) {
    burninJob = null;
    return { ok: false, error: err.message };
  }
  send({ type: 'start', total: totalSec });
  let errTail = '';
  if (burninJob.stdout) {
    burninJob.stdout.setEncoding('utf-8');
    burninJob.stdout.on('data', (chunk) => {
      // -progress çıktısı: out_time_us=... / progress=continue|end
      const m = String(chunk).match(/out_time_us=(\d+)/g);
      if (m && m.length) {
        const us = parseInt(m[m.length - 1].split('=')[1], 10);
        const cur = us / 1e6;
        const pct = totalSec > 0 ? Math.min(99.5, (cur / totalSec) * 100) : 0;
        send({ type: 'progress', percent: Math.round(pct * 10) / 10, current: cur, total: totalSec });
      }
    });
  }
  if (burninJob.stderr) {
    burninJob.stderr.setEncoding('utf-8');
    burninJob.stderr.on('data', (d) => { errTail = (errTail + d).slice(-1500); });
  }
  burninJob.on('error', (err) => {
    burninJob = null;
    send({ type: 'error', message: err.code === 'ENOENT' ? 'ffmpeg bulunamadı (PATH veya backend/bin).' : err.message });
  });
  burninJob.on('close', (code) => {
    burninJob = null;
    if (code === 0) send({ type: 'done', file: outPath });
    else send({ type: 'error', message: errTail.trim() || `ffmpeg çıkış kodu ${code}` });
  });
  return { ok: true };
});

ipcMain.handle('burnin:cancel', () => {
  if (burninJob && burninJob.pid) {
    try { spawn('taskkill', ['/pid', String(burninJob.pid), '/T', '/F'], { windowsHide: true }); } catch (_) {}
    return { ok: true };
  }
  return { ok: false };
});

function resolvePython() {
  const appDir = app.getAppPath();
  const candidates = [
    path.join(appDir, 'backend', 'venv', 'Scripts', 'python.exe'),
    path.join(appDir, 'backend', '.venv', 'Scripts', 'python.exe'),
    'python',
    'py',
  ];
  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }
  return 'python';
}

ipcMain.handle('transcribe:start', async (_event, options) => {
  if (activeJob) {
    return { ok: false, error: 'Zaten bir iş çalışıyor.' };
  }

  const appDir = app.getAppPath();
  const scriptPath = path.join(appDir, 'backend', 'transcribe.py');
  const pythonPath = resolvePython();

  const args = [scriptPath];

  if (options.youtube) {
    args.push('--youtube', options.youtube);
  } else if (options.input) {
    args.push('--input', options.input);
  } else {
    return { ok: false, error: 'Bir dosya ya da YouTube linki gerekli.' };
  }

  if (options.outputDir) args.push('--output-dir', options.outputDir);
  if (options.model) args.push('--model', options.model);
  if (options.engine) args.push('--engine', options.engine);
  if (options.batchSize) args.push('--batch-size', String(options.batchSize));
  if (options.audioTrack !== undefined && options.audioTrack >= 0) args.push('--audio-track', String(options.audioTrack));
  args.push('--quality-report', options.qualityReport !== false ? 'true' : 'false');
  args.push('--resume', options.resume !== false ? 'true' : 'false');
  if (options.device) args.push('--device', options.device);
  args.push('--fix-timings', options.fixTimings !== false ? 'true' : 'false');
  if (options.maxCps) args.push('--max-cps', String(options.maxCps));
  args.push('--merge-short', options.mergeShort !== false ? 'true' : 'false');
  args.push('--merge-incomplete', options.mergeIncomplete !== false ? 'true' : 'false');
  args.push('--fix-punctuation-collapse', options.fixPunctuationCollapse !== false ? 'true' : 'false');
  args.push('--confidence-report', options.confidenceReport !== false ? 'true' : 'false');
  if (options.incompleteGap) args.push('--incomplete-gap', String(options.incompleteGap));
  args.push('--dedupe', options.dedupe !== false ? 'true' : 'false');
  if (options.computeType) args.push('--compute-type', options.computeType);
  if (options.language) args.push('--language', options.language);
  if (options.task) args.push('--task', options.task);
  if (options.beamSize) args.push('--beam-size', String(options.beamSize));
  if (options.bestOf) args.push('--best-of', String(options.bestOf));
  args.push('--vad-filter', options.vadFilter ? 'true' : 'false');
  if (options.vadThreshold) args.push('--vad-threshold', String(options.vadThreshold));
  args.push('--condition-on-previous', options.conditionOnPrevious ? 'true' : 'false');
  if (options.initialPrompt) args.push('--initial-prompt', options.initialPrompt);
  if (options.formats) args.push('--formats', options.formats);
  args.push('--lang-suffix', options.langSuffix ? 'true' : 'false');
  // JSON'dan yeniden dışa aktarma: transkripsiyon yok, --input bir .json çıktısıdır
  if (options.reexport) args.push('--reexport', 'true');
  // Altyazı senkronlama: transkripsiyon yok, --input video + --sync-srt harici SRT
  if (options.syncSubs) {
    args.push('--sync-subs', 'true');
    if (options.syncSrt) args.push('--sync-srt', options.syncSrt);
    if (options.syncMaxShift) args.push('--sync-max-shift', String(options.syncMaxShift));
  }
  if (options.maxLineWidth) args.push('--max-line-width', String(options.maxLineWidth));
  if (options.maxLines) args.push('--max-lines', String(options.maxLines));
  if (options.maxChars) args.push('--max-chars', String(options.maxChars));
  if (options.splitMode) args.push('--split-mode', options.splitMode);
  if (options.wrapMode) args.push('--wrap-mode', options.wrapMode);
  if (options.timingGap) args.push('--timing-gap', String(options.timingGap));
  if (options.hardMaxChars) args.push('--hard-max-chars', String(options.hardMaxChars));

  // Decoding ince ayarları
  if (options.temperature !== undefined) args.push('--temperature', String(options.temperature));
  args.push('--temperature-fallback', options.temperatureFallback !== false ? 'true' : 'false');
  if (options.patience) args.push('--patience', String(options.patience));
  if (options.lengthPenalty !== undefined) args.push('--length-penalty', String(options.lengthPenalty));
  if (options.repetitionPenalty !== undefined) args.push('--repetition-penalty', String(options.repetitionPenalty));
  if (options.noRepeatNgramSize !== undefined) args.push('--no-repeat-ngram-size', String(options.noRepeatNgramSize));
  if (options.compressionRatioThreshold !== undefined) args.push('--compression-ratio-threshold', String(options.compressionRatioThreshold));
  if (options.logProbThreshold !== undefined) args.push('--log-prob-threshold', String(options.logProbThreshold));
  if (options.noSpeechThreshold !== undefined) args.push('--no-speech-threshold', String(options.noSpeechThreshold));

  // Detaylı VAD
  if (options.vadMinSpeechMs !== undefined) args.push('--vad-min-speech-ms', String(options.vadMinSpeechMs));
  if (options.vadMinSilenceMs !== undefined) args.push('--vad-min-silence-ms', String(options.vadMinSilenceMs));
  if (options.vadSpeechPadMs !== undefined) args.push('--vad-speech-pad-ms', String(options.vadSpeechPadMs));
  if (options.vadMaxSpeechS !== undefined) args.push('--vad-max-speech-s', String(options.vadMaxSpeechS));

  // Sözlük
  if (options.glossary) args.push('--glossary', options.glossary);

  // Zaman aralığı (kırpma)
  if (options.clipStart) args.push('--clip-start', String(options.clipStart));
  if (options.clipEnd) args.push('--clip-end', String(options.clipEnd));

  // Diarization
  if (options.diarize) {
    args.push('--diarize', 'true');
    // hfToken argv yerine ortam değişkeniyle geçer (aşağıda)
    if (options.minSpeakers) args.push('--min-speakers', String(options.minSpeakers));
    if (options.maxSpeakers) args.push('--max-speakers', String(options.maxSpeakers));
    args.push('--label-speakers', options.labelSpeakers !== false ? 'true' : 'false');
  }

  // LLM post-processing
  if (options.llmPostprocess) {
    args.push('--llm-postprocess', 'true');
    // llmApiKey argv yerine ortam değişkeniyle geçer (aşağıda)
    if (options.llmBaseUrl) args.push('--llm-base-url', options.llmBaseUrl);
    if (options.llmModel) args.push('--llm-model', options.llmModel);
    if (options.llmWorkers) args.push('--llm-workers', String(options.llmWorkers));
    args.push('--llm-fix-censorship', options.llmFixCensorship !== false ? 'true' : 'false');
    args.push('--llm-fix-hallucination', options.llmFixHallucination !== false ? 'true' : 'false');
    args.push('--llm-fix-punctuation', options.llmFixPunctuation !== false ? 'true' : 'false');
    args.push('--llm-fix-consistency', options.llmFixConsistency ? 'true' : 'false');
  }

  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  // Gizli anahtarları argv yerine ortam değişkeniyle geçir (process listesinde görünmesin)
  if (options.diarize && options.hfToken) env.WHISPER_HF_TOKEN = options.hfToken;
  if (options.llmPostprocess && options.llmApiKey) env.WHISPER_LLM_API_KEY = options.llmApiKey;

  startJobLog(options.youtube || options.input || 'is', args);

  try {
    activeJob = spawn(pythonPath, args, { env, cwd: appDir });
  } catch (err) {
    return { ok: false, error: `Python başlatılamadı: ${err.message}` };
  }

  // Nadiren stdio akışları oluşmayabilir — null erişip handler'ları patlatmaktansa erken dön
  if (!activeJob.stdout || !activeJob.stderr) {
    try { activeJob.kill(); } catch (_) {}
    activeJob = null;
    return { ok: false, error: 'Python süreç akışları (stdout/stderr) oluşturulamadı.' };
  }

  let stdoutBuf = '';
  let stderrBuf = '';

  activeJob.stdout.setEncoding('utf-8');
  activeJob.stderr.setEncoding('utf-8');

  const handleLine = (raw) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const event = JSON.parse(line);
      // Görev çubuğunda ilerleme göster; bitiş/hatada pencereyi vurgula
      if ((event.type === 'progress' || event.type === 'download_progress' || event.type === 'llm_progress')
          && typeof event.percent === 'number') {
        setTaskbarProgress(Math.min(event.percent, 100) / 100);
      } else if (event.type === 'done' || event.type === 'error') {
        setTaskbarProgress(-1);
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
          mainWindow.flashFrame(true);
        }
      }
      writeJobLog(event);
      sendEvent(event);
    } catch (_) {
      writeJobLog({ type: 'log', level: 'info', message: line });
      sendEvent({ type: 'log', level: 'info', message: line });
    }
  };

  activeJob.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    // Tek seferde böl, son parça (tamamlanmamış satır) tamponda kalsın —
    // satır başına slice yerine O(n) tarama; uzun videoda binlerce segment olayında önemli
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop();
    // Güvenlik: newline'sız patolojik uzun satır tamponu sınırsız şişirmesin
    if (stdoutBuf.length > 1_000_000) stdoutBuf = stdoutBuf.slice(-100_000);
    for (const raw of lines) handleLine(raw);
  });

  activeJob.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
    // Sınırsız büyümesini önle — sadece son kısım gerekli
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-4000);
    const text = chunk.toString();
    // tqdm progress bar / huggingface warnings — sessizce yut
    const trimmed = text.trim();
    if (!trimmed) return;
    if (/Loading\s+weights:\s+\d+%/.test(trimmed)) return;
    if (/it\/s\]/.test(trimmed) && /\d+%\|/.test(trimmed)) return;
    if (/UserWarning.*huggingface_hub/.test(trimmed)) return;
    if (/FutureWarning/.test(trimmed)) return;
    if (/warnings\.warn\(/.test(trimmed)) return;
    if (/Some weights of .* were not initialized/.test(trimmed)) return;
    if (/You should probably TRAIN this model/.test(trimmed)) return;
    writeJobLog({ type: 'log', level: 'error', message: trimmed });
    sendEvent({ type: 'log', level: 'error', message: trimmed });
  });

  activeJob.on('close', (code) => {
    stopPowerBlocker();
    setTaskbarProgress(-1);
    const exitEvent = { type: 'exit', code, stderr: stderrBuf.slice(-1000) };
    writeJobLog(exitEvent);
    endJobLog();
    sendEvent(exitEvent);
    activeJob = null;
  });

  activeJob.on('error', (err) => {
    stopPowerBlocker();
    setTaskbarProgress(-1);
    let message = err.message;
    if (err.code === 'ENOENT') {
      message = 'Python bulunamadı. Python 3.10/3.11 kurup PATH\'e ekleyin veya install.bat ile venv oluşturun, sonra start.bat ile başlatın.';
    }
    writeJobLog({ type: 'error', message });
    endJobLog();
    sendEvent({ type: 'error', message });
    activeJob = null;
  });

  startPowerBlocker();
  return { ok: true };
});

// yt-dlp güncelleme — YouTube indirme hatalarının başlıca nedeni eski yt-dlp sürümüdür
let updateJob = null;
ipcMain.handle('maintenance:updateYtdlp', async () => {
  if (activeJob) return { ok: false, error: 'Bir iş çalışırken güncelleme yapılamaz.' };
  if (updateJob) return { ok: false, error: 'Güncelleme zaten çalışıyor.' };
  const pythonPath = resolvePython();
  // resolvePython mutlak yol döndürürse venv var; 'python'/'py' ise venv yok →
  // global yorumlayıcıyı güncellemek transkripsiyonun kullandığı yt-dlp'yi etkilemez
  if (!path.isAbsolute(pythonPath)) {
    return { ok: false, error: 'Python sanal ortamı (venv) bulunamadı. Önce install.bat çalıştırın.' };
  }
  return new Promise((resolve) => {
    let out = '';
    try {
      // Nightly kanal, YouTube'un sık değişen istemci/PO-token davranışlarına
      // stable sürümden önce uyum sağlar; [default] EJS çözücüsünü de getirir.
      updateJob = spawn(
        pythonPath,
        ['-m', 'pip', 'install', '--upgrade', '--pre', 'yt-dlp[default]'],
        { windowsHide: true },
      );
    } catch (err) {
      updateJob = null;
      return resolve({ ok: false, error: err.message });
    }
    if (updateJob.stdout) updateJob.stdout.on('data', (d) => { out += d; });
    if (updateJob.stderr) updateJob.stderr.on('data', (d) => { out += d; });
    updateJob.on('error', (err) => {
      updateJob = null;
      resolve({ ok: false, error: err.code === 'ENOENT' ? 'Python bulunamadı (install.bat ile venv oluşturun).' : err.message });
    });
    updateJob.on('close', (code) => {
      updateJob = null;
      if (code === 0) {
        const m = out.match(/Successfully installed[^\r\n]*/i);
        const already = /Requirement already satisfied[^\r\n]*yt[-_]dlp/i.test(out);
        resolve({ ok: true, message: m ? m[0].trim() : (already ? 'yt-dlp zaten güncel.' : 'Güncelleme tamamlandı.') });
      } else {
        resolve({ ok: false, error: (out.slice(-400).trim() || `pip çıkış kodu ${code}`) });
      }
    });
  });
});

ipcMain.handle('transcribe:cancel', async () => {
  if (!activeJob) return { ok: false, error: 'Çalışan iş yok.' };
  try {
    killActiveJob();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
