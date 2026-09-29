'use strict';

// Burn-in ffmpeg uçtan-uca E2E: gerçek uygulama içinde burnin:start IPC'si
// → gerçek ffmpeg `subtitles=` filtresi → .altyazili.mp4 çıktısı.
// Doğrulanan zincir (hiçbir halkası mock değil):
//   - authorizeMediaFile/authorizeSubtitleFile onay diyaloğu (stub'lı kabul)
//   - stageBurninSubtitle ASCII geçici dosyası (Türkçe karakterli içerikle)
//   - ffprobe süre ölçümü → -progress ilerleme olayları
//   - ffmpeg spawn → burnin:event 'start'→'progress'→'done' akışı
//   - Çıktı dosyasının varlığı + ffprobe ile süre/akış doğrulaması
//   - Kurtarma kaydının temizlenmesi + geçici dosya artığı kalmaması
//   - SRT/ASS dışı uzantının reddi + çakışan iş kapısı
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-burnin-ffmpeg.smoke.js --disable-gpu

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'burnin-e2e-'));
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};
const stepTimeout = (promise, ms, label) => Promise.race([
  promise,
  wait(ms).then(() => Promise.reject(new Error(`adım zaman aşımı: ${label}`))),
]);

// FFmpeg'i resolveFfTool ile aynı öncelikle bul: backend/bin sonra PATH.
const repoRoot = path.resolve(__dirname, '..');
const ffTool = (name) => {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const local = path.join(repoRoot, 'backend', 'bin', exe);
  return fs.existsSync(local) ? local : name;
};

let renderProcessGone = 0;
app.setAppPath(repoRoot);
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => stepTimeout(
      win.webContents.executeJavaScript(`(async()=>{${code}})()`, true), 30000, code.slice(0, 60));
    win.webContents.on('render-process-gone', () => { renderProcessGone += 1; });
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    console.log('[burnin] pencere+ayarlar hazır');

    // Onay diyalogları (medya + altyazı erişimi) headless'ta kullanıcı bekler;
    // smoke gerçek authorize yolunu koşarken onayı otomatik geçer.
    dialog.showMessageBox = async () => ({ response: 1 });

    // Fixture: 2 sn renk+sine mp4 + Türkçe karakterli SRT (gerçek ffmpeg).
    const videoPath = path.join(out, 'kaynak-video.mp4');
    const gen = spawnSync(ffTool('ffmpeg'), [
      '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=2:r=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-shortest', videoPath,
    ], { encoding: 'utf8' });
    assert.equal(gen.status, 0, `fixture ffmpeg: ${(gen.stderr || '').slice(-300)}`);
    const subPath = path.join(out, 'altyazi-dosyasi.srt');
    fs.writeFileSync(subPath,
      '1\n00:00:00,000 --> 00:00:01,000\nMerhaba dünya, şğü öç\n\n'
      + '2\n00:00:01,000 --> 00:00:02,000\nİkinci satır geliyor\n',
      'utf8');

    // Uzantı reddi: .txt gömülemez (IPC seviyesinde, authorize öncesi erken yol).
    const rejected = await run(`return window.api.burnInStart(${JSON.stringify(videoPath)}, ${JSON.stringify(path.join(out, 'x.txt'))});`);
    assert.equal(rejected.ok, false, `txt reddedilmeliydi: ${JSON.stringify(rejected)}`);
    assert(/altyazı|SRT|ASS/i.test(rejected.error || ''), `hata metni: ${rejected.error}`);
    console.log('[burnin] uzantı reddi doğrulandı');

    // Olay toplayıcı: renderer'ın gerçek dinleyicisiyle aynı kanal.
    await run(`window.__burnEvents = [];
      window.api.onBurnInEvent((ev) => window.__burnEvents.push(ev));
      return true;`);

    const started = await run(`return window.api.burnInStart(${JSON.stringify(videoPath)}, ${JSON.stringify(subPath)});`);
    assert.equal(started.ok, true, `burnin:start: ${JSON.stringify(started)}`);

    // Çakışan iş kapısı: aynı anda ikinci çağrı reddedilmeli.
    const second = await run(`return window.api.burnInStart(${JSON.stringify(videoPath)}, ${JSON.stringify(subPath)});`);
    assert.equal(second.ok, false, 'çakışan gömme reddedilmeli');
    assert(/çalışıyor/i.test(second.error || ''), `kapı metni: ${second.error}`);

    const done = await until(() => run(`return window.__burnEvents.find((e) => e.type === 'done' || e.type === 'error') || null`),
      'burnin done/error', 120000);
    assert.equal(done.type, 'done', `gömme hatası: ${JSON.stringify(done)}`);
    const events = await run('return window.__burnEvents;');
    assert(events.some((e) => e.type === 'start'), 'start olayı yok');
    assert(events.some((e) => e.type === 'progress'), 'progress olayı yok');
    console.log(`[burnin] bitti: ${path.basename(done.file)} (${events.length} olay)`);

    // Çıktı doğrulaması: <ad>.altyazili.mp4 + ffprobe süre/akış.
    const outPath = path.join(out, 'kaynak-video.altyazili.mp4');
    assert.equal(done.file, outPath, 'outPath beklentisi');
    assert(fs.existsSync(outPath), 'çıktı dosyası yok');
    const probe = spawnSync(ffTool('ffprobe'), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath,
    ], { encoding: 'utf8' });
    const dur = parseFloat(probe.stdout.trim());
    assert(dur > 1.5 && dur < 4, `süre beklentisi: ${dur}`);
    const streams = spawnSync(ffTool('ffprobe'), [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name',
      '-of', 'csv=p=0', outPath,
    ], { encoding: 'utf8' });
    assert(/h264,video/.test(streams.stdout), `video akışı: ${streams.stdout}`);
    assert(/aac,audio/.test(streams.stdout), `ses akışı: ${streams.stdout}`);

    // Artıklar: geçici .tmp dosyası + recovery kaydı temizlenmiş olmalı.
    assert(fs.readdirSync(out).filter((f) => /\.tmp\.(mp4|mkv)$/.test(f)).length === 0,
      `tmp artığı: ${fs.readdirSync(out)}`);
    const recovery = await run('return window.api.getBurnInRecovery();');
    assert(!recovery || !recovery.available, `recovery kaldı: ${JSON.stringify(recovery)}`);
    console.log('[burnin] çıktı+artık doğrulandı');

    assert.equal(renderProcessGone, 0, 'Renderer süreci çöktü');
    console.log('PASS: burn-in ffmpeg E2E — onay→hazırlama→ilerleme→çıktı→temizlik');
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('[burnin] hata:', error && error.stack || error);
    app.exit(1);
  }
});
