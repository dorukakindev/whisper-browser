'use strict';
// Kuyruk g6: çift altyazı — uzun metin/büyük font/sürüklenmiş konum/tam ekranda
// altyazıların birbirini veya kontrolleri kapatmaması (B-393-* düzeltmeleri).
// Gerçek uygulama + gerçek video fixture (ffmpeg varsa) ile ölçülür; ffmpeg
// yoksa fixture'sız temel kontroller koşulur.
//   electron tests/electron-subtitle-overlap.smoke.js
const { app, BrowserWindow } = require('electron');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wb-sub2-'));
app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Altyazı-örtüşme smoke\'u zaman aşımı'); app.exit(1); }, 120000);
require('../src/main.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) {
    try { value = await fn(); } catch { value = null; }
    if (value) return value;
    await wait(150);
  }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
const fails = [];
function check(ok, label) { if (!ok) fails.push(label); }

const ffTool = (name) => {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const local = path.join(root, 'backend', 'bin', exe);
  return fs.existsSync(local) ? local : name;
};

app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true)
    .catch((e) => { throw new Error(`EVAL[${code.slice(0, 90)}]: ${e.message}`); });
  await until(() => run('return typeof openPlayer === "function" && typeof renderCue === "function"'), 'Renderer init');
  await until(() => run('try { openPlayer(); return !document.getElementById("playerLayer").classList.contains("hidden"); } catch { return false; }'), 'Oynatıcı katmanı');

  // Video fixture: kontroller ancak kaynak yüklüyken gerçek boyutta render olur.
  const videoPath = path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'fixture.mp4');
  const gen = spawnSync(ffTool('ffmpeg'), [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoPath,
  ], { encoding: 'utf8', timeout: 30000 });
  const hasVideo = gen.status === 0 && fs.existsSync(videoPath);
  if (!hasVideo) console.log('[sub2] ffmpeg bulunamadı — kontrol-çubuğu kontrolleri sınırlı');
  if (hasVideo) {
    await run(`setPlayerSource('file://${videoPath.replace(/\\/g, '/')}', 'fixture.mp4', 'local:${videoPath.replace(/\\/g, '/')}', { localPath: ${JSON.stringify(videoPath)} }); return true`);
    await until(() => run('return document.getElementById("playerVideo").readyState >= 1'), 'Video hazır');
  }

  const LONG = 'Bu çok uzun bir altyazı satırıdır ve birçok kelimeden oluşmaktadır. '.repeat(8).trim();
  const MEASURE = `const R=(el)=>el?[el.getBoundingClientRect().top|0,el.getBoundingClientRect().bottom|0,el.getBoundingClientRect().height|0]:null;
    const st=document.getElementById('playerStage');
    const ov=document.getElementById('subtitleOverlay'), ov2=document.getElementById('subtitleOverlay2');
    const ctl=document.querySelector('.player-controls');
    return JSON.stringify({
      ov:R(ov), ov2:R(ov2), stack:R(document.getElementById('subtitleStack')),
      ctl:ctl&&ctl.getBoundingClientRect().height>0?[ctl.getBoundingClientRect().top|0,ctl.getBoundingClientRect().bottom|0]:null,
      clip1:ov?ov.scrollHeight-ov.clientHeight:0, clip2:ov2?ov2.scrollHeight-ov2.clientHeight:0,
      inner1:ov&&ov.firstElementChild?ov.firstElementChild.getBoundingClientRect().height|0:0,
      inner2:ov2&&ov2.firstElementChild?ov2.firstElementChild.getBoundingClientRect().height|0:0 })`;
  const overlap = (a, b) => a && b && a[1] > b[0] + 1 && b[1] > a[0] + 1;

  // --- 1) Yığın + büyük font + uzun metin: metin kesilmesin, kontrollere binmesin
  await run(`player.cues=[{start:0,end:9999,text:${JSON.stringify(LONG)}}];
    player.cues2=[{start:0,end:9999,text:${JSON.stringify(LONG)}}];
    document.getElementById('playerStage').style.setProperty('--sub-size','44px');
    document.getElementById('playerStage').classList.remove('idle');
    renderCue(); return true`);
  await wait(150); // rAF içinde scheduleFitSubtitleOverlays çalışır
  let m = JSON.parse(await run(MEASURE));
  check(m.clip1 <= 6 && m.clip2 <= 6, `Yığın uzun metin kesildi: clip1=${m.clip1} clip2=${m.clip2}`);
  if (m.ctl) check(m.stack[1] <= m.ctl[0] + 1, `Yığın kontrollere bindi: stack.alt=${m.stack[1]} ctl.üst=${m.ctl[0]}`);
  check(!overlap(m.ov, m.ov2), 'Yığın düzende iki altyazı birbirine bindi');

  // --- 2) Ayrı düzen + uzun metin: ikinci altyazı ana banda inmesin
  await run(`document.getElementById('playerStage').classList.add('sub-split'); renderCue(); return true`);
  await wait(150);
  m = JSON.parse(await run(MEASURE));
  check(!overlap(m.ov2, m.ov), `Ayrı düzende altyazılar çakıştı: ov=${m.ov} ov2=${m.ov2}`);
  if (m.ctl) {
    check(m.ov[1] <= m.ctl[0] + 1, `Ayrı düzende ana altyazı kontrollere bindi: ${m.ov[1]}>${m.ctl[0]}`);
    check(m.ov2[1] <= m.ctl[0] + 1, `Ayrı düzende ikinci altyazı kontrollere bindi: ${m.ov2[1]}>${m.ctl[0]}`);
  }
  check(m.clip1 <= 6 && m.clip2 <= 6, `Ayrı düzende metin kesildi: clip1=${m.clip1} clip2=${m.clip2}`);

  // --- 3) Ayrı düzen + kayıtlı yüksek konum (%85): kontrol bandına inemez
  await run(`player.sub2Top=85; applySubtitlePos(); return true`);
  await wait(150);
  m = JSON.parse(await run(MEASURE));
  if (m.ctl) check(m.ov2[1] <= m.ctl[0] + 1, `Sürüklenmiş ikinci altyazı kontrollere bindi: ov2.alt=${m.ov2[1]} ctl.üst=${m.ctl[0]}`);
  check(!overlap(m.ov2, m.ov), `Sürüklenmiş ikinci altyazı ana banda bindi: ov=${m.ov} ov2=${m.ov2}`);

  // --- 4) Yığına dön + kısa metin: gereksiz küçültme olmamalı
  await run(`document.getElementById('playerStage').classList.remove('sub-split');
    player.sub2Top=null; applySubtitlePos();
    player.cues=[{start:0,end:9999,text:'kısa bir satır'}]; player.cues2=[{start:0,end:9999,text:'short line'}];
    renderCue(); return true`);
  await wait(150);
  m = JSON.parse(await run(MEASURE));
  check(m.inner1 >= 30 && m.inner2 >= 30, `Kısa metin gereksiz küçüldü: inner1=${m.inner1} inner2=${m.inner2}`);

  // --- 5) Tam ekran: aynı sözleşme fullscreen'da da geçerli
  await run(`player.cues=[{start:0,end:9999,text:${JSON.stringify(LONG)}}]; player.cues2=[{start:0,end:9999,text:${JSON.stringify(LONG)}}];
    document.getElementById('playerStage').style.setProperty('--sub-size','36px'); renderCue();
    try { await document.getElementById('playerStage').requestFullscreen(); } catch (e) {}
    return true`);
  await wait(400);
  m = JSON.parse(await run(MEASURE));
  check(m.clip1 <= 8 && m.clip2 <= 8, `Tam ekranda metin kesildi: clip1=${m.clip1} clip2=${m.clip2}`);
  if (m.ctl) check(m.stack[1] <= m.ctl[0] + 1, `Tam ekranda yığın kontrollere bindi: ${m.stack[1]}>${m.ctl[0]}`);
  await run(`try { await document.exitFullscreen(); } catch (e) {} return true`);

  if (fails.length) {
    console.error('FAIL:', fails.join(' | '));
    app.exit(1);
  }
  console.log(`PASS: altyazı-örtüşme smoke — ${hasVideo ? 'video-fixture ile' : 'fixturesız'} tüm senaryolar geçti`);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
process.on('exit', () => clearTimeout(watchdog));
