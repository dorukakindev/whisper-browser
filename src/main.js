const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, Notification, powerSaveBlocker, clipboard, screen, session, components } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const {
  browserNavigationCapabilities,
  cueFingerprint,
  cuesToSrt,
  isLikelySubtitleResponse,
  normalizeCues,
  parseSubtitlePayload,
  parseHlsSubtitleTracks,
  parseHlsSegments,
  isHlsSubtitlePlaylist,
  parseDashSubtitleTracks,
  parseDashSubtitleMatchers,
  matchDashSubtitleUrl,
  dashSegmentOffset,
  cuesUseLocalSegmentTimeline,
  parseMp4WebVtt,
  findSubtitleUrls,
  subtitleLanguage,
} = require('./browser-subtitles');
const {
  adapterAcceptsResponse,
  browserAdapterForUrl,
  browserResponseAdapter,
  redactCaptureUrl,
} = require('./browser-adapters');
const {
  browserDrmFailureMessage,
  isProtectedBrowserHost,
  sanitizeBrowserUserAgent,
} = require('./browser-drm');

let mainWindow;
let mainWindowClosing = false;
let activeJob = null;
let powerBlockerId = null;
let browserView = null;
let browserVisible = false;
let browserBounds = null;
let browserTrackTimer = null;
let browserMediaTimer = null;
let browserCaptureTimer = null;
let browserCaptureBusy = false;
let browserDebuggerReady = false;
const browserPendingResponses = new Map();
const browserSeenTracks = new Set();
const browserTrackBuffers = new Map();
const browserTrackPublications = new Map();
const browserSeenManifests = new Map();
let browserDashSubtitleMatchers = [];
let browserLastDrmStatus = '';
let browserLastDrmFailure = '';
let browserOverlay = { source: [], translation: [], mode: 'translation', offset: 0 };
let browserDiagnostics = null;
let widevineComponentStatus = { available: false, ready: false, detail: 'Castlabs bileşen API’si bulunamadı' };
let widevineReadinessPromise = null;

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
const LOG_SKIP = new Set(['segment', 'progress', 'download_progress', 'llm_progress', 'preview_refresh', 'translation_chunk', 'translation_refresh']);
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

// ===== Oynatıcı: YouTube bilgi/indirme (backend/media.py) =====
// Not: YouTube video+ses BİRLEŞİK formatı (360p) çoğu videoda artık sunulmuyor;
// bu yüzden asıl yol indirip birleştirmek. Birleşik format varsa "hızlı izle" açılır.
// Oynatici medya surecleri TURE GORE ayri tutulur. Eskiden hepsi tek bir
// mediaJob degiskenini paylasiyordu: indirme surerken "Bilgi al" veya
// "altyaziyi indir" denince yeni surec mediaJob'un uzerine yaziliyor, sonra
// "Indirmeyi iptal et" yanlis sureci olduruyor ya da kisa is bitip mediaJob'u
// null yaptigi icin "Indirme yok" deniyordu.
const mediaJobs = { probe: null, download: null, subs: null };

function runMediaCommand(cmdArgs, onEvent, kind = 'probe') {
  return new Promise((resolve) => {
    const appDir = app.getAppPath();
    const script = path.join(appDir, 'backend', 'media.py');
    let proc;
    try {
      proc = spawn(resolvePython(), [script, ...cmdArgs], { cwd: appDir, windowsHide: true });
    } catch (err) {
      return resolve({ ok: false, error: `Python başlatılamadı: ${err.message}` });
    }
    mediaJobs[kind] = proc;
    let buf = '';
    let result = null;
    let errText = '';
    proc.stdout.setEncoding('utf-8');
    proc.stderr.setEncoding('utf-8');
    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (_) { continue; }
        if (ev.type === 'probe' || ev.type === 'downloaded' || ev.type === 'subs') result = ev;
        else if (ev.type === 'error') errText = ev.message || 'bilinmeyen hata';
        if (onEvent) onEvent(ev);
      }
    });
    proc.stderr.on('data', (c) => { errText = String(c).slice(-500); });
    proc.on('close', (code) => {
      if (mediaJobs[kind] === proc) mediaJobs[kind] = null;   // baskasinin isini silme
      if (result) resolve({ ok: true, data: result });
      else resolve({ ok: false, error: errText || `Süreç ${code} koduyla bitti` });
    });
    proc.on('error', (err) => {
      if (mediaJobs[kind] === proc) mediaJobs[kind] = null;
      resolve({ ok: false, error: err.message });
    });
  });
}

ipcMain.handle('media:probe', async (_e, url) => {
  const input = typeof url === 'object' && url ? url : { url };
  if (!input.url) return { ok: false, error: 'URL boş' };
  const args = ['probe', '--url', input.url];
  if (['chrome', 'edge', 'firefox', 'brave', 'vivaldi', 'opera'].includes(input.cookieBrowser)) {
    args.push('--cookie-browser', input.cookieBrowser);
  }
  return runMediaCommand(args, null, 'probe');
});

ipcMain.handle('media:download', async (_e, opts) => {
  const o = opts || {};
  if (!o.url) return { ok: false, error: 'URL boş' };
  const outDir = o.outputDir || path.join(app.getPath('userData'), 'videos');
  const args = ['download', '--url', o.url, '--output-dir', outDir];
  if (o.height) args.push('--height', String(o.height));
  if (o.audioLang) args.push('--audio-lang', o.audioLang);
  if (['chrome', 'edge', 'firefox', 'brave', 'vivaldi', 'opera'].includes(o.cookieBrowser)) {
    args.push('--cookie-browser', o.cookieBrowser);
  }
  return runMediaCommand(args, (ev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media:event', ev);
    }
  }, 'download');
});

// YouTube'un KENDI altyazisini indir (elle yazilmis veya otomatik). Bizim
// urettigimizle karsilastirmak / ikinci altyazi olarak gostermek icin.
// Videonun yanindaki altyazi dosyalarini bul. Renderer dosya sistemine
// erisemedigi icin varlik kontrolu burada yapilir - eskiden "<ad>.srt" secenegi
// dosya yokken de listeye ekleniyordu ve secilince hata veriyordu.
ipcMain.handle('media:findSiblingSubs', async (_e, videoPath) => {
  try {
    if (!videoPath || typeof videoPath !== 'string') return { ok: true, files: [] };
    const dir = path.dirname(videoPath);
    const stem = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      const ext = path.extname(name).toLowerCase();
      if (!['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) continue;
      // "film.srt", "film.tr.srt", "film.en.srt" ... hepsi ayni koke bagli
      const base = path.basename(name, ext).toLowerCase();
      if (base === stem || base.startsWith(stem + '.')) {
        out.push(path.join(dir, name));
      }
    }
    out.sort();
    return { ok: true, files: out };
  } catch (err) {
    return { ok: false, error: err.message, files: [] };
  }
});

ipcMain.handle('media:downloadSubs', async (_e, opts) => {
  const o = opts || {};
  if (!o.url) return { ok: false, error: 'URL boş' };
  const outDir = o.outputDir || path.join(app.getPath('userData'), 'videos');
  const args = [
    'subs', '--url', o.url,
    '--sub-lang', o.lang || 'en',
    '--sub-auto', o.auto ? 'true' : 'false',
    '--output-dir', outDir,
  ];
  if (['chrome', 'edge', 'firefox', 'brave', 'vivaldi', 'opera'].includes(o.cookieBrowser)) {
    args.push('--cookie-browser', o.cookieBrowser);
  }
  return runMediaCommand(args, (ev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media:event', ev);
    }
  }, 'subs');
});

ipcMain.handle('media:cancelDownload', async () => {
  const job = mediaJobs.download;      // probe/altyazi isleri iptalden etkilenmez
  if (!job) return { ok: false, error: 'İndirme yok' };
  try {
    if (process.platform === 'win32' && job.pid) {
      spawn('taskkill', ['/pid', String(job.pid), '/T', '/F'], { windowsHide: true });
    } else {
      job.kill('SIGTERM');
    }
  } catch (_) {}
  return { ok: true };
});

// Altyazı dosyasını oynatıcı için oku (renderer'ın dosya sistemine erişimi yok)
// cp1254 (Türkçe Windows) dosya latin-1 okunmuşsa Türkçe harfler "Ð Ý Þ ð ý þ"
// olarak donar. Backend'deki read_subtitle_text ile aynı mantık — oynatıcı da dış
// altyazı dosyalarını (indirilmiş, eski) doğru göstersin.
const CP1254_FIXUP = { 'Ð': 'Ğ', 'Ý': 'İ', 'Þ': 'Ş', 'ð': 'ğ', 'ý': 'ı', 'þ': 'ş' };
const MOJIBAKE_MARKERS = ['Ã§', 'Ã¼', 'Ã¶', 'Ä±', 'ÄŸ', 'Ã‡', 'Ãœ', 'Ã–', 'Ä°'];

function decodeSubtitleBuffer(buf) {
  let text = buf.toString('utf-8').replace(/^\uFEFF/, '');
  let note = '';
  // Geçersiz UTF-8 → U+FFFD çıkar; bu durumda cp1254/latin-1 varsay
  if (text.includes('\uFFFD')) {
    text = buf.toString('latin1');
    for (const [bad, good] of Object.entries(CP1254_FIXUP)) {
      text = text.split(bad).join(good);
    }
    note = 'cp1254';
  }
  // Çift kodlanmış UTF-8 ("Ã§ocuk")
  const marks = MOJIBAKE_MARKERS.reduce((a, m) => a + text.split(m).length - 1, 0);
  if (marks > 0) {
    const fixed = Buffer.from(text, 'latin1').toString('utf-8');
    const after = MOJIBAKE_MARKERS.reduce((a, m) => a + fixed.split(m).length - 1, 0);
    if (after < marks) { text = fixed; note = 'çift kodlama onarıldı'; }
  }
  // cp1254'ün latin-1 okunup UTF-8 kaydedilmiş hali (geçerli UTF-8 ama harfler bozuk)
  const suspicious = 'ÐÝÞðýþ'.split('').reduce((a, c) => a + text.split(c).length - 1, 0);
  const hasTurkish = /[ğışİĞŞ]/.test(text);
  const hasForeign = /[áéíóúÁÉÍÓÚæÆøåÅ]/.test(text);
  if (suspicious >= 3 && !hasTurkish && !hasForeign) {
    for (const [bad, good] of Object.entries(CP1254_FIXUP)) {
      text = text.split(bad).join(good);
    }
    note = 'Türkçe karakterler onarıldı';
  }
  return { text, note };
}

ipcMain.handle('media:readSubtitle', async (_e, filePath) => {
  try {
    const { text, note } = decodeSubtitleBuffer(fs.readFileSync(filePath));
    return { ok: true, text, note };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Oynatıcıda düzeltilen altyazıyı diske yaz. İlk yazımda .bak yedeği alınır —
// kullanıcı izlerken yaptığı düzeltmeyi geri alabilsin.
// ===== Klasör izleme =====
// Bir klasöre yeni video düşünce kuyruğa eklenir. Kopyalama bitmeden işlememek için
// dosya boyutu iki ölçüm arasında DEĞİŞMEYİNCE "hazır" sayılır (subgen'de de aynı sorun).
let watchTimer = null;
let watchDir = null;
const watchSeen = new Map();      // yol -> {size, stableCount, queued}
const WATCH_INTERVAL = 5000;
const WATCH_STABLE_TICKS = 2;     // ~10 sn boyunca boyut değişmemeli

function scanWatchFolder() {
  if (!watchDir) return;
  let entries;
  try {
    entries = fs.readdirSync(watchDir, { withFileTypes: true });
  } catch (_) {
    return;                        // klasör silinmiş/erişilemiyor — sessizce geç
  }
  const found = [];
  for (const ent of entries) {
    const full = path.join(watchDir, ent.name);
    if (ent.isDirectory()) {
      // Bir seviye alt klasör (dizi bölümleri klasörlenmiş olabilir)
      try {
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          if (sub.isFile()) found.push(path.join(full, sub.name));
        }
      } catch (_) {}
    } else if (ent.isFile()) {
      found.push(full);
    }
  }

  const ready = [];
  for (const file of found) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!MEDIA_EXTS.has(ext)) continue;
    // Yanında altyazı varsa zaten işlenmiş say (tekrar tekrar çevirmesin)
    const stem = file.replace(/\.[^.]+$/, '');
    if (fs.existsSync(stem + '.srt')) { watchSeen.set(file, { queued: true }); continue; }
    let size;
    try { size = fs.statSync(file).size; } catch (_) { continue; }
    const prev = watchSeen.get(file);
    if (!prev) {
      watchSeen.set(file, { size, stableCount: 0, queued: false });
      continue;
    }
    if (prev.queued) continue;
    if (prev.size === size) {
      prev.stableCount += 1;
      if (prev.stableCount >= WATCH_STABLE_TICKS) {
        prev.queued = true;
        ready.push(file);
      }
    } else {
      prev.size = size;
      prev.stableCount = 0;        // hâlâ kopyalanıyor
    }
  }

  if (ready.length && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('watch:newFiles', ready);
  }
}

ipcMain.handle('watch:start', async (_e, dir) => {
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'Klasör bulunamadı' };
  watchDir = dir;
  watchSeen.clear();
  // İlk tarama: mevcut dosyalar "görülmüş" sayılır ki açılışta hepsi kuyruğa dolmasın
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isFile()) watchSeen.set(full, { queued: true });
    }
  } catch (_) {}
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(scanWatchFolder, WATCH_INTERVAL);
  return { ok: true, path: dir };
});

ipcMain.handle('watch:stop', async () => {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
  watchDir = null;
  watchSeen.clear();
  return { ok: true };
});

// Altyazi dosyasina yazmadan once BIR KEZ .bak alinir; yazma atomiktir
// (once .tmp, sonra rename) - yazma sirasinda cokme olursa dosya yarim kalmaz.
function backupOnce(filePath) {
  const bak = filePath + '.bak';
  if (!fs.existsSync(bak) && fs.existsSync(filePath)) fs.copyFileSync(filePath, bak);
  return bak;
}

function writeSubtitleAtomic(filePath, text) {
  // SRT/ASS çıktılarımız BOM'lu (Windows oynatıcıları için) — aynı biçimi koru
  const data = '\uFEFF' + String(text).replace(/^\uFEFF/, '');
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

ipcMain.handle('media:writeSubtitle', async (_e, payload) => {
  const { path: filePath, text } = payload || {};
  if (!filePath || typeof text !== 'string') return { ok: false, error: 'Eksik parametre' };
  try {
    const bak = backupOnce(filePath);
    writeSubtitleAtomic(filePath, text);
    return { ok: true, backup: bak };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('media:saveSubtitleCopy', async (_e, payload) => {
  const { sourcePath, text } = payload || {};
  if (typeof text !== 'string') return { ok: false, error: 'Altyazı metni eksik.' };
  const parsed = path.parse(sourcePath || 'altyazi.srt');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Düzeltilmiş altyazıyı farklı kaydet',
    defaultPath: path.join(parsed.dir || app.getPath('downloads'), `${parsed.name}.duzeltilmis.srt`),
    filters: [{ name: 'SubRip altyazı', extensions: ['srt'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    writeSubtitleAtomic(result.filePath, text);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Oynaticidan alinan kare (PNG data URL) diske kaydedilir.
ipcMain.handle('media:saveImage', async (_e, payload) => {
  const { dataUrl, suggestedName } = payload || {};
  if (!dataUrl || !/^data:image\/png;base64,/.test(dataUrl)) {
    return { ok: false, error: 'Geçersiz görüntü' };
  }
  try {
    const prev = loadSettings() || {};
    const dir = prev.outputDir && fs.existsSync(prev.outputDir)
      ? prev.outputDir : app.getPath('pictures');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Ekran görüntüsünü kaydet',
      defaultPath: path.join(dir, suggestedName || 'kare.png'),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

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

// ---- İş geçmişi (ayrı dosya — settings.json'ı şişirmesin) ----
// Amac: "bu videoyu daha once cevirmis miydim, hangi modelle, ne kadar surdu,
// ciktilar nerede?" sorusu. Ayarlarla ayni dosyada tutulsa ayar yazan her
// debounce kaydi gecmisi de yeniden yazardi.
const HISTORY_LIMIT = 300;

function historyPath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function loadHistory() {
  try {
    const list = JSON.parse(fs.readFileSync(historyPath(), 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(list) {
  try {
    fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
    fs.writeFileSync(historyPath(), JSON.stringify(list.slice(0, HISTORY_LIMIT), null, 2), 'utf-8');
    return true;
  } catch (_) {
    return false;
  }
}

// Ayni medya tekrar islenirse ESKI kayit silinir: gecmis "en son ne yaptim"
// listesi, ayni filmin on kopyasi degil.
function addHistory(rec) {
  const list = loadHistory().filter((h) => !(h.input && rec.input && h.input === rec.input));
  list.unshift(rec);
  saveHistory(list);
}

// ---- İzleme kütüphanesi ----
// İş geçmişinden bilinçli olarak ayrıdır: burada transkripsiyon işi değil,
// oynatılan medya, kaldığı konum, video bazlı tercihler ve koleksiyonlar tutulur.
const WATCH_LIBRARY_LIMIT = 1000;
const subtitleSearchCache = new Map();

function watchLibraryPath() {
  return path.join(app.getPath('userData'), 'watch-library.json');
}

function loadWatchLibrary() {
  try {
    const list = JSON.parse(fs.readFileSync(watchLibraryPath(), 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveWatchLibrary(list) {
  try {
    fs.mkdirSync(path.dirname(watchLibraryPath()), { recursive: true });
    const ordered = list.slice().sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
    fs.writeFileSync(watchLibraryPath(), JSON.stringify(ordered.slice(0, WATCH_LIBRARY_LIMIT), null, 2), 'utf-8');
    return true;
  } catch (_) {
    return false;
  }
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))];
}

function upsertWatchItem(patch) {
  if (!patch || typeof patch.key !== 'string' || !patch.key.trim()) return null;
  const list = loadWatchLibrary();
  const index = list.findIndex((item) => item.key === patch.key);
  const previous = index >= 0 ? list[index] : {};
  const sessions = Array.isArray(previous.sessions) ? previous.sessions.slice(-39) : [];
  if (patch.session && patch.session.id) {
    const sessionIndex = sessions.findIndex((s) => s.id === patch.session.id);
    if (sessionIndex >= 0) sessions[sessionIndex] = { ...sessions[sessionIndex], ...patch.session };
    else sessions.push(patch.session);
  }
  const now = Date.now();
  const merged = {
    ...previous,
    ...patch,
    key: patch.key,
    firstWatched: previous.firstWatched || patch.firstWatched || now,
    lastWatched: patch.lastWatched || now,
    collections: patch.collections === undefined
      ? uniqueStrings(previous.collections)
      : uniqueStrings(patch.collections),
    subtitlePaths: uniqueStrings([...(previous.subtitlePaths || []), ...(patch.subtitlePaths || [])]),
    prefs: { ...(previous.prefs || {}), ...(patch.prefs || {}) },
    sessions,
  };
  delete merged.session;
  merged.totalWatchSeconds = sessions.reduce((total, s) => total + Math.max(0, Number(s.watchSeconds) || 0), 0);
  if (index >= 0) list.splice(index, 1);
  list.unshift(merged);
  saveWatchLibrary(list);
  return merged;
}

function subtitleTextForSearch(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return '';
    const cached = subtitleSearchCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.text;
    // Oynatici ile kutuphane aramasi AYNI kodlama yolunu kullanmali. Aksi
    // halde cp1254 bir dosya videoda dogru gorunurken aramada mojibake olur ve
    // Turkce kelimeler bulunamaz.
    const text = decodeSubtitleBuffer(fs.readFileSync(filePath)).text;
    subtitleSearchCache.set(filePath, { mtimeMs: stat.mtimeMs, text });
    return text;
  } catch (_) {
    return '';
  }
}

function subtitleSeconds(block) {
  // WebVTT, bir saatin altindaki cue'larda HH alanini atlayabilir:
  // MM:SS.mmm. SRT'nin HH:MM:SS,mmm bicimi de ayni regex ile korunur.
  const match = String(block).match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->/);
  if (match) return (+(match[1] || 0)) * 3600 + (+match[2]) * 60 + (+match[3]) + (+match[4].padEnd(3, '0')) / 1000;
  const ass = String(block).match(/^Dialogue\s*:\s*[^,]*,(\d+):(\d{2}):(\d{2})[.](\d{1,2}),/i);
  return ass ? (+ass[1]) * 3600 + (+ass[2]) * 60 + (+ass[3]) + (+ass[4].padEnd(2, '0')) / 100 : 0;
}

function subtitleSearchBlocks(text) {
  const source = String(text || '');
  if (/^Dialogue\s*:/im.test(source)) {
    return source.split(/\r?\n/).filter((line) => /^Dialogue\s*:/i.test(line)).map((line) => {
      const colon = line.indexOf(':');
      const fields = line.slice(colon + 1).split(',');
      return { raw: line, plain: fields.slice(9).join(',').replace(/\\N/gi, ' ').replace(/\{[^}]*\}/g, '').trim() };
    });
  }
  return source.split(/\r?\n\s*\r?\n/).map((block) => ({
    raw: block,
    plain: block.replace(/^\s*\d+\s*$/gm, '').replace(/^.*-->.*$/gm, '')
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));
}

function searchWatchLibrary(query) {
  const q = String(query || '').trim().toLocaleLowerCase('tr');
  const list = loadWatchLibrary();
  if (!q) return list.map((item) => ({ ...item, matches: [] }));
  const results = [];
  for (const item of list) {
    const basic = [item.title, item.sourceRef, ...(item.collections || [])]
      .join(' ').toLocaleLowerCase('tr').includes(q);
    const matches = [];
    for (const subtitlePath of item.subtitlePaths || []) {
      const text = subtitleTextForSearch(subtitlePath);
      if (!text) continue;
      for (const block of subtitleSearchBlocks(text)) {
        const plain = block.plain;
        if (!plain.toLocaleLowerCase('tr').includes(q)) continue;
        matches.push({ subtitlePath, seconds: subtitleSeconds(block.raw), snippet: plain.slice(0, 220) });
        if (matches.length >= 5) break;
      }
      if (matches.length >= 5) break;
    }
    if (basic || matches.length) results.push({ ...item, matches });
  }
  return results;
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

// ===== YouTube akışı için başlık düzeltmesi =====
// YouTube CDN'i (googlevideo) CORS başlığı GÖNDERMİYOR — ölçtük: yanıtta
// Access-Control-Allow-Origin yok. Bu yüzden normal bir web sayfasında hls.js
// manifesti çekemez. Electron'da yanıt başlığını biz ekleyebiliyoruz (FreeTube'un
// da yaptığı); ayrıca istek başlığındaki Origin/Referer YouTube'a çevrilir, aksi
// halde CDN yabancı Origin'i reddedebiliyor.
// Kapsam bilinçli olarak DAR: yalnızca googlevideo host'ları.
const YT_MEDIA_FILTER = { urls: ['https://*.googlevideo.com/*'] };

function installYoutubeStreamHeaders() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeSendHeaders(YT_MEDIA_FILTER, (details, callback) => {
    const headers = { ...details.requestHeaders };
    headers.Origin = 'https://www.youtube.com';
    headers.Referer = 'https://www.youtube.com/';
    callback({ requestHeaders: headers });
  });
  ses.webRequest.onHeadersReceived(YT_MEDIA_FILTER, (details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    // Chromium bu kaynağı çapraz-origin okumaktan alıkoyuyordu
    delete headers['Cross-Origin-Resource-Policy'];
    delete headers['cross-origin-resource-policy'];
    callback({ responseHeaders: headers });
  });
}

// ===== İzleme ekranı / Tarayıcı modu =====
// Üçüncü taraf sayfaları renderer DOM'una <webview> olarak yerleştirmiyoruz.
// Ayrı bir WebContentsView hem Electron'ın önerdiği güncel mimariyi kullanır
// hem de ziyaret edilen sayfanın uygulamanın preload/Node yetkilerine erişmesini
// engeller. Görünüm yalnızca renderer'ın bildirdiği boş alana çizilir.
const BROWSER_PARTITION = 'persist:whisper-browser';

function sendBrowserEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser:event', payload);
  }
}

function freshBrowserDiagnostics(url = '') {
  const adapter = browserAdapterForUrl(url);
  return {
    adapter: { id: adapter.id, label: adapter.label, help: adapter.help },
    pageUrl: redactCaptureUrl(url),
    counts: { cdp: 0, page: 0, textTrack: 0, manifest: 0, parsed: 0, rejected: 0, errors: 0 },
    recent: [],
  };
}

function publishBrowserDiagnostics() {
  if (browserDiagnostics) sendBrowserEvent({ type: 'capture-status', diagnostics: browserDiagnostics });
}

function noteBrowserCapture(strategy, candidate = {}, outcome = 'aday', detail = '') {
  if (!browserDiagnostics) browserDiagnostics = freshBrowserDiagnostics(
    browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : '');
  if (browserDiagnostics.counts[strategy] !== undefined) browserDiagnostics.counts[strategy]++;
  if (outcome === 'parsed') browserDiagnostics.counts.parsed++;
  else if (outcome === 'rejected') browserDiagnostics.counts.rejected++;
  else if (outcome === 'error') browserDiagnostics.counts.errors++;
  const adapter = browserResponseAdapter(browserDiagnostics.pageUrl, candidate.url || '');
  browserDiagnostics.recent.unshift({
    at: Date.now(), strategy, outcome,
    service: adapter.label,
    mime: String(candidate.mimeType || candidate.mime || '').slice(0, 80),
    url: redactCaptureUrl(candidate.url || ''),
    detail: String(detail || '').slice(0, 160),
  });
  browserDiagnostics.recent = browserDiagnostics.recent.slice(0, 12);
  publishBrowserDiagnostics();
}

function normalizeBrowserUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

function safeBrowserBounds(raw) {
  if (!mainWindow || mainWindow.isDestroyed() || !raw) return null;
  const content = mainWindow.getContentBounds();
  const x = Math.max(0, Math.round(Number(raw.x) || 0));
  const y = Math.max(0, Math.round(Number(raw.y) || 0));
  const width = Math.max(1, Math.min(Math.round(Number(raw.width) || 1), content.width - x));
  const height = Math.max(1, Math.min(Math.round(Number(raw.height) || 1), content.height - y));
  if (x >= content.width || y >= content.height) return null;
  return { x, y, width, height };
}

function browserNavigationState(extra = {}) {
  if (!browserView || browserView.webContents.isDestroyed()) {
    return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, ...extra };
  }
  const wc = browserView.webContents;
  const { canGoBack, canGoForward } = browserNavigationCapabilities(wc);
  return {
    url: wc.getURL() === 'about:blank' ? '' : wc.getURL(),
    title: wc.getTitle() || '',
    loading: wc.isLoading(),
    canGoBack,
    canGoForward,
    ...extra,
  };
}

function browserSubtitleDir() {
  const dir = path.join(app.getPath('userData'), 'browser-subtitles');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resetBrowserCaptureState() {
  browserPendingResponses.clear();
  browserSeenTracks.clear();
  browserTrackBuffers.clear();
  browserTrackPublications.clear();
  browserSeenManifests.clear();
  browserDashSubtitleMatchers = [];
  browserLastDrmFailure = '';
  const url = browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : '';
  browserDiagnostics = freshBrowserDiagnostics(url === 'about:blank' ? '' : url);
  publishBrowserDiagnostics();
}

function browserManifestFingerprint(body) {
  const text = String(body || '');
  return `${text.length}:${text.slice(0, 384)}:${text.slice(-384)}`;
}

function browserTrackStreamKey(sourceUrl, language = '') {
  const raw = String(sourceUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    let pathname = u.pathname;
    // Segmentli VTT/HLS URL'lerinde dosya adı her parçada değişir
    // (seg-001.vtt, chunk_002.vtt veya yalnızca 000123.vtt). Bunları aynı
    // altyazı akışına bağla; sabit captions/en.vtt yolu olduğu gibi kalır.
    pathname = pathname.replace(/(?:segment|seg|chunk|part|fragment|frag)[-_]?\d+(?=\.[^/]+$)/i, '__segment__')
      .replace(/\/\d{1,8}(?=\.[^/]+$)/, '/__segment__');
    // İmzalı URL'lerde expire/sig/range gibi sorgular her parçada değişebilir;
    // aynı path'i tek akış olarak birleştiriyoruz.
    const params = [...u.searchParams.entries()]
      .filter(([key]) => !/^(expire|expires|sig|signature|token|range|rn|rbuf|ms|mv|mt|ip|ipbits|start|end|segment|part|offset)$/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.origin}${pathname}${query ? `?${query}` : ''}|${String(language || '').toLowerCase()}`;
  } catch (_) { return `${raw}|${String(language || '').toLowerCase()}`; }
}

function storeBrowserTrack(cues, meta = {}) {
  let normalized = normalizeCues(cues).slice(0, 20000);
  if (!normalized.length) return null;
  const streamKey = String(meta.streamKey || '');
  if (streamKey) {
    const previous = browserTrackBuffers.get(streamKey) || [];
    const merged = [...previous, ...normalized]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .filter((cue, index, all) => index === 0
        || Math.abs(cue.start - all[index - 1].start) > 0.015
        || cue.text !== all[index - 1].text)
      .slice(0, 20000);
    browserTrackBuffers.set(streamKey, merged);
    normalized = merged;
  }
  if (normalized.length < 2) return null;
  const fingerprint = cueFingerprint(normalized);
  if (!fingerprint) return null;
  const publicationKey = streamKey || fingerprint;
  const previousPublication = browserTrackPublications.get(publicationKey);
  if (previousPublication && previousPublication.fingerprint === fingerprint) return null;
  // Çok uzun oturumlarda sınırsız büyümesin; aynı sayfa yenilenince yakın
  // geçmişteki izleri yine de tekrar bildirmeyelim.
  browserSeenTracks.add(fingerprint);
  if (browserSeenTracks.size > 240) browserSeenTracks.delete(browserSeenTracks.values().next().value);
  const lang = String(meta.language || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  const suffix = lang ? `.${lang}` : '';
  const stableId = previousPublication ? previousPublication.id : fingerprint;
  const filePath = previousPublication?.path || path.join(browserSubtitleDir(), `web-${stableId}${suffix}.srt`);
  fs.writeFileSync(filePath, `\uFEFF${cuesToSrt(normalized)}`, 'utf-8');
  const track = {
    id: stableId,
    path: filePath,
    language: lang,
    label: String(meta.label || lang || 'Web altyazısı').slice(0, 120),
    format: String(meta.format || 'web'),
    cueCount: normalized.length,
    // Renderer, segmentli bir akisin hâlâ büyüyüp büyümediğini bununla anlar;
    // ilk küçük parça yazılır yazılmaz eksik dosyayı çevirmeye başlamaz.
    updatedAt: Date.now(),
    pageUrl: browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : '',
    sourceUrl: String(meta.sourceUrl || '').slice(0, 1000),
  };
  browserTrackPublications.set(publicationKey, { fingerprint, id: stableId, path: filePath });
  sendBrowserEvent({ type: 'subtitle-found', track });
  return track;
}

async function fetchBrowserText(url, maxBytes = 12 * 1024 * 1024) {
  if (!browserView || browserView.webContents.isDestroyed()) throw new Error('Tarayıcı kapalı.');
  const safe = normalizeBrowserUrl(url);
  if (!safe) throw new Error('Geçersiz altyazı adresi.');
  // WebContents oturumuyla yapılan fetch aynı cookie deposunu kullanır, fakat
  // sayfanın CSP/CORS kısıtına bağlı değildir. İmzalı CDN altyazılarında bu,
  // page-world fetch'e göre daha güvenilir.
  const response = await browserView.webContents.session.fetch(safe, {
    method: 'GET', credentials: 'include', redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Altyazı yanıtı güvenli boyut sınırını aşıyor.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('Altyazı yanıtı güvenli boyut sınırını aşıyor.');
  return buffer.toString('utf-8');
}

async function fetchAndStoreBrowserSubtitle(url, meta = {}) {
  const text = await fetchBrowserText(url);
  const parsed = parseSubtitlePayload(text, '', url);
  if (!parsed.cues.length) return { parsed, text, stored: null };
  const language = meta.language || subtitleLanguage({ url });
  return { parsed, text, stored: storeBrowserTrack(parsed.cues, {
    language,
    label: meta.label || language || 'Sayfada bulunan altyazı',
    format: parsed.format,
    sourceUrl: url,
    streamKey: meta.streamKey || browserTrackStreamKey(url, language),
  }) };
}

async function captureHlsSubtitlePlaylist(playlistBody, playlistUrl, meta = {}) {
  if (!isHlsSubtitlePlaylist(playlistBody, playlistUrl)) return false;
  const language = meta.language || subtitleLanguage({ url: playlistUrl });
  const streamKey = browserTrackStreamKey(playlistUrl, language);
  const parts = parseHlsSegments(playlistBody, playlistUrl).slice(0, 1600);
  const collected = [];
  // Yalnızca altyazı olduğu doğrulanmış playlist işlenir. Altışarlı gruplar
  // uzun filmlerde hızlıdır ama CDN'i yüzlerce eşzamanlı istekle boğmaz.
  for (let index = 0; index < parts.length; index += 6) {
    const batch = await Promise.all(parts.slice(index, index + 6).map(async (segment) => {
      try {
        const partBody = await fetchBrowserText(segment.url, 2 * 1024 * 1024);
        const part = parseSubtitlePayload(partBody, '', segment.url);
        if (!part.cues.length) return false;
        const hasTimestampMap = /X-TIMESTAMP-MAP/i.test(partBody);
        const likelyLocalTimeline = !hasTimestampMap && segment.start > 0
          && cuesUseLocalSegmentTimeline(part.cues, segment.duration);
        collected.push(...part.cues.map((cue) => likelyLocalTimeline
          ? { ...cue, start: cue.start + segment.start, end: cue.end + segment.start }
          : cue));
        return true;
      } catch (_) { return false; }
    }));
    void batch;
  }
  if (!collected.length) return false;
  storeBrowserTrack(collected, {
    language, label: meta.label || language || 'HLS altyazısı', format: 'hls-vtt',
    sourceUrl: playlistUrl, streamKey,
  });
  return true;
}

async function processBrowserCapturedPayload(responseBuffer, candidate = {}, strategy = 'cdp') {
  try {
    const body = responseBuffer.toString('utf-8');
    const mime = String(candidate.mimeType || '').toLowerCase();
    const isManifest = /mpegurl|dash\+xml/i.test(mime) || /\.(m3u8|mpd)(?:[?#]|$)/i.test(candidate.url || '');
    if (isManifest) {
      noteBrowserCapture('manifest', candidate, 'aday', strategy);
      const manifestKey = browserTrackStreamKey(candidate.url);
      const manifestFingerprint = browserManifestFingerprint(body);
      if (browserSeenManifests.get(manifestKey) !== manifestFingerprint) {
        // Canlı HLS/DASH manifestleri aynı URL altında yenilenir. URL'yi sonsuza
        // dek kilitlemek yeni altyazı parçalarını sessizce kaçırıyordu.
        browserSeenManifests.set(manifestKey, manifestFingerprint);
        const isHls = /mpegurl|\.m3u8(?:[?#]|$)/i.test(mime + candidate.url);
        if (!isHls) {
          const discoveredMatchers = parseDashSubtitleMatchers(body, candidate.url);
          for (const matcher of discoveredMatchers) {
            if (!browserDashSubtitleMatchers.some((item) => item.pattern === matcher.pattern)) {
              browserDashSubtitleMatchers.push(matcher);
            }
          }
          browserDashSubtitleMatchers = browserDashSubtitleMatchers.slice(-64);
        }
        const tracks = isHls ? parseHlsSubtitleTracks(body, candidate.url)
          : parseDashSubtitleTracks(body, candidate.url);
        let storedCount = 0;
        for (const discovered of tracks.slice(0, 24)) {
          try {
            const fetched = await fetchBrowserText(discovered.url);
            const parsed = parseSubtitlePayload(fetched, '', discovered.url);
            if (parsed.cues.length) {
              if (storeBrowserTrack(parsed.cues, {
                language: discovered.language, label: discovered.label, format: parsed.format,
                sourceUrl: discovered.url,
                streamKey: browserTrackStreamKey(discovered.url, discovered.language),
              })) storedCount++;
            } else if (isHls && await captureHlsSubtitlePlaylist(fetched, discovered.url, discovered)) storedCount++;
          } catch (_) {}
        }
        if (!tracks.length && isHls && await captureHlsSubtitlePlaylist(body, candidate.url, {
          language: subtitleLanguage(candidate), label: 'HLS altyazısı',
        })) storedCount++;
        noteBrowserCapture(strategy, candidate, storedCount ? 'parsed' : 'rejected',
          storedCount ? `${storedCount} altyazı izi` : 'Manifestte kullanılabilir altyazı izi bulunamadı');
      } else {
        noteBrowserCapture(strategy, candidate, 'rejected', 'Aynı manifest daha önce işlendi');
      }
      return true;
    }
    const parsed = parseSubtitlePayload(body, candidate.mimeType, candidate.url);
    if (!parsed.cues.length && candidate.dashTrack?.format === 'vtt') {
      parsed.cues = parseMp4WebVtt(responseBuffer, candidate.dashTrack);
      if (parsed.cues.length) parsed.format = 'dash-wvtt';
    }
    if (parsed.cues.length && candidate.dashTrack) {
      const offset = dashSegmentOffset(candidate.dashTrack);
      const segmentDuration = Number(candidate.dashTrack.duration || 0) / Math.max(1, Number(candidate.dashTrack.timescale) || 1);
      const likelyLocalTimeline = offset > 0 && cuesUseLocalSegmentTimeline(parsed.cues, segmentDuration);
      if (likelyLocalTimeline) parsed.cues = parsed.cues.map((cue) => ({
        ...cue, start: cue.start + offset, end: cue.end + offset,
      }));
    }
    if (!parsed.cues.length && /json/i.test(mime)) {
      // Netflix/Max gibi oyuncular timed-text URL'sini JSON manifest içinde
      // taşır; yanıt URL'sinin kendisinde "subtitle" geçmeyebilir.
      let storedFromJson = 0;
      for (const subtitleUrl of findSubtitleUrls(body, candidate.url)) {
        try {
          const result = await fetchAndStoreBrowserSubtitle(subtitleUrl, { label: 'Manifest altyazısı' });
          if (result.stored) storedFromJson++;
        } catch (_) {}
      }
      if (storedFromJson) {
        noteBrowserCapture(strategy, candidate, 'parsed', `${storedFromJson} manifest altyazısı`);
        return true;
      }
    }
    if (!parsed.cues.length) {
      noteBrowserCapture(strategy, candidate, 'rejected', 'Altyazı zaman kodu ayrıştırılamadı');
      return false;
    }
    const language = candidate.dashTrack?.language || subtitleLanguage(candidate);
    const stored = storeBrowserTrack(parsed.cues, {
      language,
      label: candidate.dashTrack?.label || language || 'Sayfada bulunan altyazı',
      format: parsed.format,
      sourceUrl: candidate.url,
      streamKey: browserTrackStreamKey(candidate.url, language),
    });
    noteBrowserCapture(strategy, candidate, stored ? 'parsed' : 'rejected',
      stored ? `${parsed.cues.length} satır · ${parsed.format}` : 'Aynı altyazı daha önce işlendi');
    return true;
  } catch (error) {
    noteBrowserCapture(strategy, candidate, 'error', error && error.message || 'Yakalama hatası');
    return false;
  }
}

async function captureBrowserResponse(pendingKey) {
  const candidate = browserPendingResponses.get(pendingKey);
  browserPendingResponses.delete(pendingKey);
  if (!candidate || !browserView || browserView.webContents.isDestroyed() || !browserDebuggerReady) return;
  try {
    const result = await browserView.webContents.debugger.sendCommand(
      'Network.getResponseBody', { requestId: candidate.requestId }, candidate.sessionId || undefined);
    const responseBuffer = result.base64Encoded
      ? Buffer.from(result.body || '', 'base64')
      : Buffer.from(String(result.body || ''), 'utf-8');
    await processBrowserCapturedPayload(responseBuffer, candidate, 'cdp');
  } catch (error) {
    // Bazı önbellek/ServiceWorker yanıtlarının gövdesi CDP'den okunamaz. DOM
    // TextTrack ve sayfa içi fetch/XHR kancası aynı altyazı için diğer yollardır.
    noteBrowserCapture('cdp', candidate, 'error', error && error.message || 'Yanıt gövdesi okunamadı');
  }
}

async function attachBrowserDebugger() {
  if (!browserView || browserView.webContents.isDestroyed()) return;
  const wc = browserView.webContents;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Network.enable', { maxResourceBufferSize: 12 * 1024 * 1024 });
    await wc.debugger.sendCommand('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    }).catch(() => {});
    browserDebuggerReady = true;
  } catch (err) {
    browserDebuggerReady = false;
    sendBrowserEvent({ type: 'capture-warning', message: `Ağ altyazısı izlenemedi: ${err.message}` });
  }
}

function browserTrackProbeScript() {
  return `(async () => {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    const videos = roots.flatMap(root => [...root.querySelectorAll('video')]);
    const video = videos.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    if (!video) return [];
    const tracks = [];
    const changed = [];
    for (const track of [...(video.textTracks || [])]) {
      const previousMode = track.mode;
      // Birçok platform iz kapalıyken cue listesini yüklemez. Kısa süreli
      // hidden modu cue'ları doldurur; sonra sitenin görünürlük tercihini geri
      // yükleyerek çift altyazı basmasını engelleriz.
      if (previousMode === 'disabled' && !(track.cues && track.cues.length)) {
        try { track.mode = 'hidden'; changed.push(track); } catch (_) {}
      }
    }
    if (changed.length) await new Promise(resolve => setTimeout(resolve, 450));
    for (const track of [...(video.textTracks || [])]) {
      const list = track.cues ? [...track.cues].slice(0, 20000) : [];
      if (changed.includes(track)) {
        try { track.mode = 'disabled'; } catch (_) {}
      }
      if (list.length < 2) continue;
      const element = [...video.querySelectorAll('track')].find((candidate) => candidate.track === track);
      tracks.push({
        language: track.language || '', label: track.label || track.language || 'HTML5 altyazı',
        sourceUrl: element ? (element.src || '') : '',
        cues: list.map(c => ({ start: c.startTime, end: c.endTime, text: c.text || '' }))
      });
    }
    return tracks;
  })()`;
}

function browserCaptureHookScript() {
  return `(() => {
    if (window.__whisperCaptureInstalled) return true;
    window.__whisperCaptureInstalled = true;
    window.__whisperCaptureQueue = [];
    window.__whisperCaptureSeen = new Set();
    window.__whisperSourceOffsets = [];
    const MAX_TEXT = 2 * 1024 * 1024;
    const hinted = /(?:caption|subtitle|timedtext|texttrack|webvtt|ttml|dfxp|sami|json3|srv3|\\.vtt(?:[?#]|$)|\\.srt(?:[?#]|$)|\\.m3u8(?:[?#]|$)|\\.mpd(?:[?#]|$))/i;
    const acceptedMime = /(?:text\\/vtt|ttml|x-subrip|mpegurl|dash\\+xml)/i;
    const push = (entry) => {
      const body = String(entry.body || '');
      if (!body || body.length > MAX_TEXT) return;
      const key = String(entry.url || '') + '|' + body.length + '|' + body.slice(0, 96) + '|' + body.slice(-96);
      if (window.__whisperCaptureSeen.has(key)) return;
      window.__whisperCaptureSeen.add(key);
      if (window.__whisperCaptureSeen.size > 120) window.__whisperCaptureSeen.delete(window.__whisperCaptureSeen.values().next().value);
      const offsets = window.__whisperSourceOffsets || [];
      const recent = offsets.length ? offsets[offsets.length - 1] : null;
      window.__whisperCaptureQueue.push({ ...entry, sourceOffset: recent ? recent.offset : 0 });
      window.__whisperCaptureQueue = window.__whisperCaptureQueue.slice(-32);
    };
    const inspectResponse = (url, response) => {
      try {
        const mime = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
        if (!hinted.test(String(url || '')) && !acceptedMime.test(mime)) return;
        const length = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0) || 0;
        if (length > MAX_TEXT) return;
        response.clone().text().then((body) => push({ url: String(url || response.url || ''), mimeType: mime, body, via: 'fetch' })).catch(() => {});
      } catch (_) {}
    };
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function(...args) {
        const result = originalFetch.apply(this, args);
        result.then((response) => inspectResponse(response.url || (args[0] && args[0].url) || args[0], response)).catch(() => {});
        return result;
      };
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__whisperUrl = String(url || '');
      this.__whisperListening = false;
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      if (!this.__whisperListening) {
        this.__whisperListening = true;
        this.addEventListener('loadend', () => {
          try {
            const mime = this.getResponseHeader('content-type') || '';
            if (!hinted.test(this.__whisperUrl || '') && !acceptedMime.test(mime)) return;
            if (this.responseType && this.responseType !== 'text') return;
            const body = String(this.responseText || '');
            push({ url: this.responseURL || this.__whisperUrl || '', mimeType: mime, body, via: 'xhr' });
          } catch (_) {}
        }, { once: true });
      }
      return originalSend.apply(this, args);
    };
    if (window.SourceBuffer && SourceBuffer.prototype && typeof SourceBuffer.prototype.appendBuffer === 'function') {
      const originalAppend = SourceBuffer.prototype.appendBuffer;
      SourceBuffer.prototype.appendBuffer = function(data) {
        try {
          const offset = Number(this.timestampOffset);
          if (Number.isFinite(offset)) {
            const list = window.__whisperSourceOffsets;
            const last = list[list.length - 1];
            if (!last || Math.abs(last.offset - offset) > 0.001) {
              list.push({ offset, at: performance.now(), bytes: data && data.byteLength || 0 });
              window.__whisperSourceOffsets = list.slice(-24);
            }
          }
        } catch (_) {}
        return originalAppend.call(this, data);
      };
    }
    return true;
  })()`;
}

function browserCaptureDrainScript() {
  return `(() => {
    const queue = Array.isArray(window.__whisperCaptureQueue) ? window.__whisperCaptureQueue.splice(0, 32) : [];
    return queue;
  })()`;
}

function browserMediaProbeScript() {
  return `(() => {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    const videos = roots.flatMap(root => [...root.querySelectorAll('video')]);
    const v = videos.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    if (!v) return null;
    return { currentTime: Number(v.currentTime) || 0,
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      paused: !!v.paused, muted: !!v.muted, volume: Number(v.volume) || 0,
      area: Math.max(0, v.clientWidth * v.clientHeight) };
  })()`;
}

function browserFrames() {
  if (!browserView || browserView.webContents.isDestroyed()) return [];
  const main = browserView.webContents.mainFrame;
  const frames = main && Array.isArray(main.framesInSubtree) ? main.framesInSubtree : [];
  return frames.length ? frames : (main ? [main] : []);
}

async function executeBrowserFrames(script) {
  const results = await Promise.all(browserFrames().map((frame) =>
    frame.executeJavaScript(script, true).catch(() => null)));
  return results.filter((result) => result !== null && result !== undefined);
}

function browserMediaCommandScript(command, value) {
  const safeCommand = JSON.stringify(String(command || ''));
  const safeValue = JSON.stringify(Math.max(0, Number(value) || 0));
  return `(async () => {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    const videos = roots.flatMap(scope => [...scope.querySelectorAll('video')]);
    const video = videos.sort((a,b) => (b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0];
    if (!video) return false;
    const command = ${safeCommand};
    if (command === 'seek') video.currentTime = ${safeValue};
    else if (command === 'play-pause') {
      if (video.paused) await video.play(); else video.pause();
    } else if (command === 'play') await video.play();
    else return false;
    return true;
  })()`;
}

function startBrowserPolling() {
  stopBrowserPolling();
  browserTrackTimer = setInterval(async () => {
    if (!browserVisible || !browserView || browserView.webContents.isDestroyed()) return;
    try {
      const frameTracks = await executeBrowserFrames(browserTrackProbeScript());
      for (const tracks of frameTracks) for (const track of tracks || []) {
        const stored = storeBrowserTrack(track.cues, {
          language: track.language, label: track.label, format: 'html5-track', sourceUrl: track.sourceUrl || 'dom:texttrack',
          streamKey: browserTrackStreamKey(track.sourceUrl || `dom:${track.language}:${track.label}`, track.language),
        });
        if (stored) noteBrowserCapture('textTrack', {
          url: track.sourceUrl || 'dom:texttrack', mimeType: 'text/html5-track',
        }, 'parsed', `${track.cues.length} satır`);
      }
    } catch (_) {}
  }, 2600);
  browserCaptureTimer = setInterval(async () => {
    if (browserCaptureBusy || !browserVisible || !browserView || browserView.webContents.isDestroyed()) return;
    browserCaptureBusy = true;
    try {
      await executeBrowserFrames(browserCaptureHookScript());
      const batches = await executeBrowserFrames(browserCaptureDrainScript());
      for (const entries of batches) for (const entry of entries || []) {
        if (!entry || typeof entry.body !== 'string') continue;
        const pageUrl = browserView.webContents.getURL();
        const adapter = browserResponseAdapter(pageUrl, entry.url);
        if (!adapterAcceptsResponse(adapter, entry)) continue;
        await processBrowserCapturedPayload(Buffer.from(entry.body, 'utf-8'), {
          url: String(entry.url || ''),
          mimeType: String(entry.mimeType || ''),
          sourceOffset: Number(entry.sourceOffset) || 0,
        }, 'page');
      }
    } catch (_) {
      // Bir alt frame erişilemez olduğunda diğer yakalama yolları sürer.
    } finally {
      browserCaptureBusy = false;
    }
  }, 900);
  browserMediaTimer = setInterval(async () => {
    if (!browserVisible || !browserView || browserView.webContents.isDestroyed()) return;
    try {
      const media = (await executeBrowserFrames(browserMediaProbeScript()))
        .sort((a, b) => Number(b.area || 0) - Number(a.area || 0))[0];
      if (media) sendBrowserEvent({ type: 'media', media });
    } catch (_) {}
  }, 500);
}

function stopBrowserPolling() {
  if (browserTrackTimer) clearInterval(browserTrackTimer);
  if (browserMediaTimer) clearInterval(browserMediaTimer);
  if (browserCaptureTimer) clearInterval(browserCaptureTimer);
  browserTrackTimer = null;
  browserMediaTimer = null;
  browserCaptureTimer = null;
  browserCaptureBusy = false;
}

function browserOverlayScript(payload) {
  const encoded = JSON.stringify(payload || {}).replace(/[\u2028\u2029]/g, ' ');
  return `(() => {
    const data = ${encoded};
    window.__whisperBrowserSubs = data;
    let root = document.getElementById('__whisper_browser_subtitles');
    if (!root) {
      root = document.createElement('div');
      root.id = '__whisper_browser_subtitles';
      root.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:Inter,Segoe UI,sans-serif;text-shadow:0 2px 5px #000,0 0 2px #000;';
      const source = document.createElement('div'); source.dataset.kind = 'source';
      const translation = document.createElement('div'); translation.dataset.kind = 'translation';
      root.append(source, translation); document.documentElement.appendChild(root);
    }
    const findCue = (cues, t) => {
      let lo = 0, hi = cues.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1, c = cues[mid];
        if (t < c.start) hi = mid - 1; else if (t > c.end) lo = mid + 1; else return c; }
      return null;
    };
    if (!window.__whisperBrowserSubLoop) {
      window.__whisperBrowserSubLoop = true;
      const tick = () => {
        const state = window.__whisperBrowserSubs || {};
        const roots = [document];
        for (let i = 0; i < roots.length; i++) {
          for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
        }
        const videos = roots.flatMap(scope => [...scope.querySelectorAll('video')]);
        const video = videos.sort((a,b) => (b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0];
        const box = document.getElementById('__whisper_browser_subtitles');
        if (!video || !box || state.mode === 'off') { if (box) box.style.display = 'none'; requestAnimationFrame(tick); return; }
        const rect = video.getBoundingClientRect();
        box.style.display = 'flex'; box.style.left = Math.max(0, rect.left) + 'px';
        box.style.width = Math.max(0, rect.width) + 'px';
        box.style.top = Math.max(rect.top, rect.bottom - Math.max(96, rect.height * .17)) + 'px';
        const t = (Number(video.currentTime) || 0) - (Number(state.offset) || 0);
        const src = findCue(state.source || [], t); const tr = findCue(state.translation || [], t);
        const srcEl = box.querySelector('[data-kind="source"]'); const trEl = box.querySelector('[data-kind="translation"]');
        srcEl.textContent = src && (state.mode === 'source' || state.mode === 'both') ? src.text : '';
        trEl.textContent = tr && (state.mode === 'translation' || state.mode === 'both') ? tr.text : '';
        srcEl.style.cssText = 'max-width:88%;padding:3px 8px;border-radius:5px;background:rgba(5,7,10,.74);color:#f5f5f5;font-size:clamp(15px,2vw,25px);line-height:1.35;white-space:pre-line;';
        trEl.style.cssText = 'max-width:88%;padding:4px 9px;border-radius:5px;background:rgba(5,7,10,.82);color:#e0ad5d;font-weight:650;font-size:clamp(16px,2.15vw,27px);line-height:1.35;white-space:pre-line;';
        srcEl.style.display = srcEl.textContent ? '' : 'none'; trEl.style.display = trEl.textContent ? '' : 'none';
        requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    }
    return true;
  })()`;
}

async function applyBrowserOverlay() {
  if (!browserView || browserView.webContents.isDestroyed()) return false;
  try {
    const results = await executeBrowserFrames(browserOverlayScript(browserOverlay));
    return results.some(Boolean);
  } catch (_) { return false; }
}

async function prepareWidevineComponents() {
  if (!components || typeof components.whenReady !== 'function') return widevineComponentStatus;
  widevineComponentStatus = { available: true, ready: false, detail: 'Widevine bileşeni hazırlanıyor' };
  const readiness = components.whenReady().then(() => {
    const status = typeof components.status === 'function' ? components.status() : null;
    widevineComponentStatus = { available: true, ready: true, detail: 'Widevine bileşeni hazır', status };
    if (browserView && !browserView.webContents.isDestroyed()) setTimeout(() => reportBrowserDrmSupport(), 0);
    return widevineComponentStatus;
  }).catch((error) => {
    const message = error && error.message
      ? error.message : (error && error.errors ? 'Widevine bileşeni kurulamadı' : String(error || 'Bilinmeyen hata'));
    widevineComponentStatus = { available: true, ready: false, detail: message.slice(0, 240) };
    return widevineComponentStatus;
  });
  // Başlangıçta 15 saniyelik genel açılış sınırı olsa bile bu promise'i sakla.
  // Korumalı bir siteye gidilirken CDM kurulumu tamamlanmadan sayfa yüklenmesin.
  widevineReadinessPromise = readiness;
  // Bileşen sunucusu çevrimdışıysa uygulamanın tümü açılmaz halde kalmasın.
  // Kurulum arka planda sürer; DRM sayfası açıldığında EME ayrıca doğrulanır.
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      widevineComponentStatus = { available: true, ready: false, detail: 'Widevine kurulumu arka planda sürüyor' };
      resolve(widevineComponentStatus);
    }, 15000);
  });
  const result = await Promise.race([readiness, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

async function waitForProtectedPlayback(url) {
  if (!isProtectedBrowserHost(url) || widevineComponentStatus.ready || !widevineReadinessPromise) return;
  // Component Updater çevrimdışıysa sonsuza kadar gezinmeyi kilitleme; bu süreden
  // sonra sayfa yine açılır ve teşhis paneli gerçek durumu gösterir.
  await Promise.race([
    widevineReadinessPromise,
    new Promise((resolve) => setTimeout(resolve, 30000)),
  ]);
}

async function reportBrowserDrmSupport() {
  if (!browserView || browserView.webContents.isDestroyed()) return;
  let host = '';
  try { host = new URL(browserView.webContents.getURL()).hostname.toLowerCase(); } catch (_) {}
  if (!/(^|\.)(netflix\.com|hulu\.com|max\.com|hbomax\.com|discoveryplus\.com)$/.test(host)) return;
  const result = await browserView.webContents.executeJavaScript(`(async () => {
    if (!navigator.requestMediaKeySystemAccess) return { supported: false, reason: 'EME yok' };
    try {
      await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
        initDataTypes: ['cenc'],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
      }]);
      return { supported: true };
    } catch (error) { return { supported: false, reason: error && error.name || 'desteklenmiyor' }; }
  })()`, true).catch((error) => ({ supported: false, reason: error.message }));
  const statusKey = `${host}:${result.supported}:${result.reason || ''}`;
  if (statusKey === browserLastDrmStatus) return;
  browserLastDrmStatus = statusKey;
  sendBrowserEvent({
    type: 'drm-status', host, supported: !!result.supported,
    reason: result.reason || '', component: widevineComponentStatus,
  });
}

function ensureBrowserView() {
  if (browserView && !browserView.webContents.isDestroyed()) return browserView;
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const browserSession = session.fromPartition(BROWSER_PARTITION, { cache: true });
  browserSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  });
  browserView = new WebContentsView({
    webPreferences: {
      partition: BROWSER_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'user-gesture-required',
    },
  });
  browserView.setBackgroundColor('#08090a');
  browserView.setVisible(false);
  mainWindow.contentView.addChildView(browserView);
  const wc = browserView.webContents;
  // Birçok yayın sitesi `Electron/x` belirtecini desteklenmeyen tarayıcı diye
  // reddediyor. Chromium sürümünü değiştirmeden yalnızca Electron ürün adını
  // kaldır; navigator.userAgent ve istek başlıkları aynı kimliği kullansın.
  wc.setUserAgent(sanitizeBrowserUserAgent(wc.getUserAgent()));
  wc.setWindowOpenHandler(({ url }) => {
    const safe = normalizeBrowserUrl(url);
    if (safe) setTimeout(() => wc.loadURL(safe), 0);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!normalizeBrowserUrl(url)) event.preventDefault();
  });
  wc.on('did-start-loading', () => sendBrowserEvent({ type: 'navigation', ...browserNavigationState({ loading: true }) }));
  wc.on('did-stop-loading', () => sendBrowserEvent({ type: 'navigation', ...browserNavigationState({ loading: false }) }));
  wc.on('did-navigate', () => {
    resetBrowserCaptureState();
    sendBrowserEvent({ type: 'navigation', ...browserNavigationState() });
  });
  wc.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame) resetBrowserCaptureState();
    sendBrowserEvent({ type: 'navigation', ...browserNavigationState() });
  });
  wc.on('page-title-updated', (_event, title) => sendBrowserEvent({ type: 'title', title: title || '' }));
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) sendBrowserEvent({ type: 'load-error', code, message: description, url });
  });
  wc.on('console-message', (details, _level, legacyMessage) => {
    const message = browserDrmFailureMessage((details && details.message) || legacyMessage);
    if (!message || message === browserLastDrmFailure) return;
    browserLastDrmFailure = message;
    sendBrowserEvent({ type: 'drm-playback-error', message });
  });
  wc.on('dom-ready', () => {
    attachBrowserDebugger();
    executeBrowserFrames(browserCaptureHookScript()).catch(() => {});
    applyBrowserOverlay();
    reportBrowserDrmSupport();
  });
  wc.debugger.on('detach', () => { browserDebuggerReady = false; });
  wc.debugger.on('message', (_event, method, params, sessionId) => {
    if (method === 'Target.attachedToTarget' && params && params.sessionId) {
      wc.debugger.sendCommand('Network.enable', { maxResourceBufferSize: 12 * 1024 * 1024 }, params.sessionId).catch(() => {});
      return;
    }
    if (method === 'Network.responseReceived') {
      const response = params.response || {};
      const dashTrack = matchDashSubtitleUrl(response.url, browserDashSubtitleMatchers);
      const adapter = browserResponseAdapter(wc.getURL(), response.url);
      if (dashTrack || isLikelySubtitleResponse(response)
        || adapterAcceptsResponse(adapter, response)
        || /mpegurl|dash\+xml/i.test(String(response.mimeType || ''))
        || /\.(m3u8|mpd)(?:[?#]|$)/i.test(String(response.url || ''))
        || (/json/i.test(String(response.mimeType || ''))
          && /manifest|playback|timedtext|texttrack|caption/i.test(String(response.url || '')))) {
        const pendingKey = `${sessionId || 'root'}:${params.requestId}`;
        browserPendingResponses.set(pendingKey, {
          ...response, requestId: params.requestId, sessionId: sessionId || '',
          ...(dashTrack ? { dashTrack } : {}),
        });
      }
    } else if (method === 'Network.loadingFinished') {
      const pendingKey = `${sessionId || 'root'}:${params.requestId}`;
      if (browserPendingResponses.has(pendingKey)) captureBrowserResponse(pendingKey);
    } else if (method === 'Network.loadingFailed') {
      browserPendingResponses.delete(`${sessionId || 'root'}:${params.requestId}`);
    }
  });
  attachBrowserDebugger();
  return browserView;
}

function hideBrowserView(pause = true) {
  browserVisible = false;
  stopBrowserPolling();
  if (!browserView || browserView.webContents.isDestroyed()) return;
  browserView.setVisible(false);
  if (pause) executeBrowserFrames(`(() => {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    roots.flatMap(scope => [...scope.querySelectorAll('video,audio')])
      .forEach(media => { try { media.pause(); } catch (_) {} });
    return true;
  })()`).catch(() => {});
}

function destroyBrowserView() {
  stopBrowserPolling();
  resetBrowserCaptureState();
  browserDebuggerReady = false;
  if (!browserView) return;
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(browserView); } catch (_) {}
  try { if (!browserView.webContents.isDestroyed()) browserView.webContents.close({ waitForBeforeUnload: false }); } catch (_) {}
  browserView = null;
}

async function flushBrowserSession() {
  try {
    const browserSession = session.fromPartition(BROWSER_PARTITION, { cache: true });
    // localStorage / IndexedDB Chromium deposuna, kalıcı giriş çerezleri de
    // çerez deposuna yazılmış olsun. Böylece pencere kapanır kapanmaz süreç sona
    // erse bile sonraki açılış aynı site oturumuyla devam eder.
    browserSession.flushStorageData();
    await browserSession.cookies.flushStore();
  } catch (_) {}
}

function createWindow() {
  // Windows'ta bildirimlerin doğru uygulama adıyla görünmesi için
  if (process.platform === 'win32') app.setAppUserModelId('Whisper Altyazı');
  installYoutubeStreamHeaders();
  const st = loadWindowState();
  // Kayıtlı boyutu ekrana kelepçele — bozuk/devasa window-state.json ekran-dışı pencere üretmesin
  const work = screen.getPrimaryDisplay().workAreaSize;
  const initW = st && st.width >= 940 ? Math.min(st.width, work.width) : Math.min(1180, work.width);
  const initH = st && st.height >= 680 ? Math.min(st.height, work.height) : Math.min(820, work.height);
  mainWindow = new BrowserWindow({
    // Pozisyon kasıtlı olarak geri yüklenmiyor (ekran-dışı pencere riskini önlemek için)
    width: initW,
    height: initH,
    // Sistem başlık çubuğunu içerikten ayır. titleBarOverlay kullanıldığında
    // küçült/büyüt/kapat düğmeleri web içeriğinin üzerine çizilebildiği için
    // oynatıcı araçlarıyla çakışıyordu; normal çerçeve bu çakışmayı önler.
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
  mainWindowClosing = false;
  mainWindow.on('close', (event) => {
    if (mainWindowClosing) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    mainWindowClosing = true;
    saveWindowState();
    flushBrowserSession().finally(() => {
      destroyBrowserView();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowClosing = false;
  });
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

app.whenReady().then(async () => {
  await prepareWidevineComponents();
  createWindow();
});

app.on('window-all-closed', () => {
  killActiveJob();
  // Çalışan yt-dlp güncellemesi (pip) / burn-in (ffmpeg) / oynatıcı medya
  // süreçleri (yt-dlp indirme, probe, altyazı) varsa onları da öldür — orphan
  // kalmasın. Büyük bir YouTube indirmesi uygulama kapandıktan sonra arka planda
  // sürüp disk ve ağ kullanmaya devam ediyordu.
  for (const j of [updateJob, burninJob, ...Object.values(mediaJobs)]) {
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

ipcMain.handle('browser:show', (event, rawBounds) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'Yetkisiz istek.' };
  const view = ensureBrowserView();
  const bounds = safeBrowserBounds(rawBounds);
  if (!view || !bounds) return { ok: false, error: 'Tarayıcı alanı hazırlanamadı.' };
  browserBounds = bounds;
  view.setBounds(bounds);
  browserVisible = true;
  const hasPage = !!browserNavigationState().url;
  view.setVisible(hasPage);
  startBrowserPolling();
  return { ok: true, hasPage, diagnostics: browserDiagnostics, ...browserNavigationState() };
});

ipcMain.handle('browser:hide', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  hideBrowserView(true);
  return { ok: true };
});

ipcMain.handle('browser:setBounds', (event, rawBounds) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  const bounds = safeBrowserBounds(rawBounds);
  if (!bounds) return { ok: false };
  browserBounds = bounds;
  if (browserView && !browserView.webContents.isDestroyed()) browserView.setBounds(bounds);
  return { ok: true };
});

ipcMain.handle('browser:navigate', async (event, rawUrl) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'Yetkisiz istek.' };
  const url = normalizeBrowserUrl(rawUrl);
  if (!url) return { ok: false, error: 'Geçerli bir http veya https adresi girin.' };
  await waitForProtectedPlayback(url);
  const view = ensureBrowserView();
  if (!view) return { ok: false, error: 'Tarayıcı başlatılamadı.' };
  if (browserBounds) view.setBounds(browserBounds);
  browserVisible = true;
  resetBrowserCaptureState();
  view.setVisible(true);
  startBrowserPolling();
  try {
    await view.webContents.loadURL(url);
    return { ok: true, ...browserNavigationState() };
  } catch (err) {
    return { ok: false, error: err.message, url };
  }
});

ipcMain.handle('browser:command', async (event, command, value) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !browserView
      || browserView.webContents.isDestroyed()) return { ok: false, error: 'Tarayıcı açık değil.' };
  const wc = browserView.webContents;
  const history = wc.navigationHistory;
  try {
    const { canGoBack, canGoForward } = browserNavigationCapabilities(wc);
    if (command === 'back' && canGoBack) {
      if (history && typeof history.goBack === 'function') history.goBack(); else wc.goBack();
    } else if (command === 'forward' && canGoForward) {
      if (history && typeof history.goForward === 'function') history.goForward(); else wc.goForward();
    } else if (command === 'reload') {
      wc.reload();
    } else if (command === 'stop') {
      wc.stop();
    } else if (command === 'focus') {
      wc.focus();
    } else if (command === 'seek' || command === 'play-pause' || command === 'play') {
      const handled = (await executeBrowserFrames(browserMediaCommandScript(command, value))).some(Boolean);
      if (!handled) return { ok: false, error: 'Sayfada kontrol edilebilen video bulunamadı.' };
    } else {
      return { ok: false, error: 'Bu tarayıcı komutu desteklenmiyor.' };
    }
    return { ok: true, ...browserNavigationState() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browser:getState', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  return { ok: true, visible: browserVisible, diagnostics: browserDiagnostics, ...browserNavigationState() };
});

ipcMain.handle('browser:setOverlay', async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false };
  const mode = ['off', 'source', 'translation', 'both'].includes(payload && payload.mode)
    ? payload.mode : 'translation';
  browserOverlay = {
    source: normalizeCues(payload && payload.source).slice(0, 20000),
    translation: normalizeCues(payload && payload.translation).slice(0, 20000),
    mode,
    offset: Math.max(-30, Math.min(30, Number(payload && payload.offset) || 0)),
  };
  return { ok: await applyBrowserOverlay() };
});

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
    subtitle: { name: 'Altyazı', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
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

ipcMain.handle('media:listFolder', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return [];
  try { return scanMediaFromPaths([path.dirname(path.normalize(filePath))]); }
  catch (_) { return []; }
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Çıktı klasörü seç',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('history:list', async () => loadHistory());

ipcMain.handle('history:remove', async (_event, id) => {
  saveHistory(loadHistory().filter((h) => h.id !== id));
  return { ok: true };
});

ipcMain.handle('history:clear', async () => {
  saveHistory([]);
  return { ok: true };
});

ipcMain.handle('library:list', async () => loadWatchLibrary());

ipcMain.handle('library:upsert', async (_event, item) => {
  const saved = upsertWatchItem(item);
  return saved ? { ok: true, item: saved } : { ok: false, error: 'Geçersiz kütüphane kaydı' };
});

ipcMain.handle('library:remove', async (_event, key) => {
  saveWatchLibrary(loadWatchLibrary().filter((item) => item.key !== key));
  return { ok: true };
});

ipcMain.handle('library:search', async (_event, query) => searchWatchLibrary(query));

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
  // Chromium'un donanim hizlandirma durumu: video GERCEKTEN GPU'da mi coozuluyor?
  let gpuFeatures = null;
  try {
    const st = app.getGPUFeatureStatus() || {};
    gpuFeatures = {
      videoDecode: st.video_decode || 'bilinmiyor',
      canvas: st['2d_canvas'] || 'bilinmiyor',
      webgl: st.webgl || 'bilinmiyor',
    };
  } catch (_) {}
  return { venv, ffmpeg: !!ffmpegLine, gpu: gpuLine, vramMib, gpuFeatures };
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

// Zamanlama editoru icin dusuk cozumunurluklu ses tepe dizisi. 50 Hz mono
// PCM, saatlerce videoda bile birkac MB'dir; renderer'a en fazla 1800 nokta gider.
const waveformCache = new Map();
ipcMain.handle('media:waveform', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return { ok: false, error: 'Yerel medya dosyası bulunamadı.' };
  }
  let stamp;
  try { stamp = `${filePath}:${fs.statSync(filePath).mtimeMs}`; } catch (_) { stamp = filePath; }
  if (waveformCache.has(stamp)) return waveformCache.get(stamp);
  const ffmpeg = resolveFfTool('ffmpeg');
  const result = await new Promise((resolve) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    let p;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      p = spawn(ffmpeg, ['-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '50',
        '-f', 's16le', 'pipe:1'], { windowsHide: true });
    } catch (err) {
      return finish({ ok: false, error: err.message });
    }
    p.on('error', (err) => finish({ ok: false, error: err.message }));
    p.stdout.on('data', (buf) => {
      bytes += buf.length;
      if (bytes <= 12 * 1024 * 1024) chunks.push(buf);
      else try { p.kill(); } catch (_) {}
    });
    p.on('close', (code) => {
      if (settled) return;
      if (code !== 0 || !chunks.length || bytes > 12 * 1024 * 1024) {
        return finish({ ok: false, error: 'Ses dalga biçimi çıkarılamadı.' });
      }
      const data = Buffer.concat(chunks);
      const samples = Math.floor(data.length / 2);
      const count = Math.min(1800, samples);
      const points = [];
      for (let i = 0; i < count; i++) {
        const from = Math.floor(i * samples / count);
        const to = Math.max(from + 1, Math.floor((i + 1) * samples / count));
        let peak = 0;
        for (let j = from; j < to; j++) peak = Math.max(peak, Math.abs(data.readInt16LE(j * 2)));
        points.push(Math.round(peak / 32767 * 1000) / 1000);
      }
      finish({ ok: true, points, duration: samples / 50 });
    });
  });
  if (result.ok) {
    waveformCache.clear();
    waveformCache.set(stamp, result);
  }
  return result;
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
    // KODLAMA TESPITI ile oku. Duz 'utf-8' okumak eski cp1254 Turkce altyazilarda
    // s/g/i harflerini U+FFFD'ye cevirip dosyaya GERI YAZIYORDU - kalici bozulma.
    const { text: raw, note } = decodeSubtitleBuffer(fs.readFileSync(filePath));
    const shifted = shiftTimecodes(raw, offsetSec);
    const bak = backupOnce(filePath);
    writeSubtitleAtomic(filePath, shifted);
    return { ok: true, backup: bak, note };
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

// Bir isin sonucunu gecmise yazar. Baslik once URETILEN dosyadan alinir:
// YouTube'da yt-dlp dosyayi video basligiyla adlandirir, girdi URL'i ise
// "watch?v=..." gibi okunmaz bir seydir.
function recordJob(meta, event) {
  const files = Array.isArray(event.files) ? event.files : [];
  const base = files[0] || meta.input;
  const title = base ? String(base).split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'İsimsiz';
  addHistory({
    id: `${meta.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    title,
    source: meta.source,
    input: meta.input,
    video: meta.video,
    files,
    model: meta.model,
    engine: meta.engine,
    segments: event.segments || 0,
    language: event.language || '',
    perf: event.perf || null,
    ok: event.type === 'done',
    error: event.type === 'error' ? String(event.message || '') : '',
  });
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
  if (options.youtubeAudioLang) args.push('--youtube-audio-lang', String(options.youtubeAudioLang));
  if (['chrome', 'edge', 'firefox', 'brave', 'vivaldi', 'opera'].includes(options.youtubeCookieBrowser)) {
    args.push('--youtube-cookie-browser', options.youtubeCookieBrowser);
  }
  args.push('--quality-report', options.qualityReport !== false ? 'true' : 'false');
  args.push('--resume', options.resume !== false ? 'true' : 'false');
  if (options.device) args.push('--device', options.device);
  args.push('--snap-to-speech', options.snapToSpeech !== false ? 'true' : 'false');
  args.push('--fix-timings', options.fixTimings !== false ? 'true' : 'false');
  if (options.maxCps) args.push('--max-cps', String(options.maxCps));
  args.push('--merge-short', options.mergeShort !== false ? 'true' : 'false');
  args.push('--merge-incomplete', options.mergeIncomplete !== false ? 'true' : 'false');
  args.push('--merge-continuation', options.mergeContinuation ? 'true' : 'false');
  if (options.continuationGap) args.push('--continuation-gap', String(options.continuationGap));
  args.push('--fix-punctuation-collapse', options.fixPunctuationCollapse !== false ? 'true' : 'false');
  args.push('--fix-common-errors', options.fixCommonErrors !== false ? 'true' : 'false');
  args.push('--drop-repeated-hallucinations', options.dropRepeatedHallucinations !== false ? 'true' : 'false');
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
    args.push('--sync-fix-framerate', options.syncFixFramerate !== false ? 'true' : 'false');
    args.push('--sync-piecewise', options.syncPiecewise !== false ? 'true' : 'false');
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

  // Çeviri — LLM düzeltmesinden BAĞIMSIZ. (Bu satırlar bir ara yanlışlıkla yukarıdaki
  // llmPostprocess bloğunun içinde kalmıştı; çeviri yalnızca LLM düzeltme açıkken
  // çalışıyordu. Bu blok asla o if'in içine taşınmamalı.)
  // API anahtarı argv'de DEĞİL, ortam değişkeninde geçer.
  args.push('--translate', options.translate ? 'true' : 'false');
  if (options.translateTo) args.push('--translate-to', options.translateTo);
  if (options.translateBaseUrl) args.push('--translate-base-url', options.translateBaseUrl);
  if (options.translateModel) args.push('--translate-model', options.translateModel);
  if (options.translateWorkers) args.push('--translate-workers', String(options.translateWorkers));
  if (options.translateRegister) args.push('--translate-register', options.translateRegister);
  if (options.translateProfanity) args.push('--translate-profanity', options.translateProfanity);
  args.push('--translate-keep-source', options.translateKeepSource !== false ? 'true' : 'false');
  if (options.translateContext !== undefined && options.translateContext !== '') {
    args.push('--translate-context', String(options.translateContext));
  }
  // Yalnizca ceviri modu: --input bir ALTYAZI dosyasidir, ses/Whisper calismaz
  if (options.translateOnly) args.push('--translate-only', 'true');
  // Sohbet: soru + gecmis + baglam TEK dosyaya yazilir. argv'ye koymak uzun
  // metinlerde sinira takilir ve surec listesinde gorunur.
  if (options.chat) {
    try {
      const dir = path.join(app.getPath('userData'), 'tmp');
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, 'chat.json');
      fs.writeFileSync(p, JSON.stringify(options.chat), 'utf-8');
      args.push('--chat', 'true', '--chat-file', p);
    } catch (err) {
      return { ok: false, error: `Sohbet verisi yazilamadi: ${err.message}` };
    }
  }
  // Aciklama modu: tek blok/kelime, baglamiyla birlikte
  if (options.explain) {
    args.push('--explain', 'true');
    args.push('--explain-index', String(options.explainIndex || 0));
    args.push('--explain-kind', options.explainKind || 'sentence');
    if (options.explainWord) args.push('--explain-word', options.explainWord);
    if (options.explainTranslation) args.push('--explain-translation', options.explainTranslation);
  }
  args.push('--translate-cache', options.translateCache !== false ? 'true' : 'false');
  args.push('--cache-dir', path.join(app.getPath('userData'), 'cache'));
  args.push('--translate-refine', options.translateRefine ? 'true' : 'false');
  args.push('--dual-subtitle', options.dualSubtitle ? 'true' : 'false');
  if (options.audioPreprocess) args.push('--audio-preprocess', options.audioPreprocess);

  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  // Gizli anahtarları argv yerine ortam değişkeniyle geçir (process listesinde görünmesin)
  if (options.diarize && options.hfToken) env.WHISPER_HF_TOKEN = options.hfToken;
  if (options.llmPostprocess && options.llmApiKey) env.WHISPER_LLM_API_KEY = options.llmApiKey;
  if (options.translate && options.translateApiKey) env.WHISPER_TRANSLATE_API_KEY = options.translateApiKey;

  startJobLog(options.youtube || options.input || 'is', args);

  // Gecmise yazmak icin isin baglami; 'done'/'error' olayinda kullanilir.
  // Aciklama (--explain) ve on-izleme isleri gecmise GIRMEZ: cikti uretmezler.
  const jobMeta = {
    startedAt: Date.now(),
    input: options.youtube || options.input || '',
    source: options.youtube ? 'youtube' : 'local',
    video: options.youtube ? '' : (options.input || ''),
    model: options.model || '',
    engine: options.engine || '',
    skip: !!options.explain || !!options.skipHistory,
  };

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
      if ((event.type === 'done' || event.type === 'error') && !jobMeta.skip) {
        recordJob(jobMeta, event);
        jobMeta.skip = true;              // tek is = tek kayit
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
