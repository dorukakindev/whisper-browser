'use strict';

// T1 — Gerçek Electron kanıtı: oynayan videoda geriye/ileriye seek sonrası
// SAYFADA GÖRÜNEN overlay metninin o anki video zamanındaki cue ile
// eşleştiğini ölçer. Deterministik vm katmanının (browser-overlay-timing.test)
// üstüne gerçek Chromium oynatma saati + gerçek overlay enjeksiyonu ekler.
//
// Kırmızı senaryo: ara sınır bekleyen uzun timer varken geriye seek yapılırsa
// eski kod overlay'i onlarca saniye bayat cue'da tutar; düzeltme sonrası
// tüm örneklerde görünen metin orak cue ile eşleşmeli.
//
// Çalıştırma: npm path'i üzerinden `electron tests/electron-overlay-timing.smoke.js`
// Medya ffmpeg ile üretilir; ffmpeg yoksa test FAIL (atlamaz).

const { app, BrowserWindow, webContents } = require('electron');
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const out = path.join(__dirname, '..', '.uiprev', 'overlay-timing-smoke');
fs.mkdirSync(out, { recursive: true });
// İzole profil: gerçek kullanıcı userData'sına dokunulmaz.
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 250) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// 60 sn'lik sentetik video — yerel fixture, kişisel medya yok.
const mediaPath = path.join(out, 'timing-oracle.mp4');
if (!fs.existsSync(mediaPath)) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=duration=60:size=320x180:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=60',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    '-movflags', '+faststart', '-y', mediaPath]);
}

const mediaBody = fs.readFileSync(mediaPath);
const page = `<!doctype html><meta charset="utf-8"><title>Timing oracle</title>
<style>body{margin:0;background:#101418}video{width:100%;height:80vh;background:#000}</style>
<video id="v" controls muted playsinline src="/media.mp4"></video>
<script>const v=document.getElementById('v');
v.addEventListener('canplay',()=>v.play().catch(()=>{}));
<\/script>`;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname === '/watch') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
  if (pathname === '/media.mp4') {
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m?.[1] || 0);
      const end = m && m[2] ? Number(m[2]) : mediaBody.length - 1;
      res.writeHead(206, {
        'content-type': 'video/mp4', 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${mediaBody.length}`,
        'content-length': end - start + 1,
      });
      return res.end(mediaBody.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': mediaBody.length });
    return res.end(mediaBody);
  }
  res.writeHead(404); res.end('yok');
});

// Cue çizelgesi: 0-16 arası 2 sn'lik sık cue'lar; sonra uzak cue 50-54.
// Böylece t=14.x'te bekleyen sınır ~35 sn ötede → eski kodda geriye seek
// sonrası tüm ara sınırlar kaçar, overlay bayat kalır.
const cues = [];
for (let s = 0; s < 16; s += 2) cues.push({ start: s, end: s + 2, text: `cue-${s}-${s + 2}` });
cues.push({ start: 50, end: 54, text: 'cue-50-54' });
const expectedAt = (t) => {
  const c = cues.find((x) => x.start <= t && t < x.end);
  return c ? c.text : '';
};

const report = { checks: [] };
const watchdog = setTimeout(() => {
  console.error('[overlay-timing] 150 sn güvenlik sınırı aşıldı');
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  app.exit(1);
}, 150000);
watchdog.unref();

// Gerçek uygulama main sürecini bu Electron sürecine yükle.
require('../src/main.js');

app.whenReady().then(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  console.log('[overlay-timing] Fixture http://127.0.0.1:' + port);

  const win = await until(() => BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere');
  win.show(); win.focus();
  const run = async (code) => Promise.race([
    win.webContents.executeJavaScript(`(async()=>{${code}})()`, true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('renderer timeout')), 15000)),
  ]);
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`),
    (await win.webContents.capturePage()).toPNG());
  await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar');

  await run(`openPlayer();setWorkspaceMode('browser', false);return true`);
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi');
  const nav = await run(`document.getElementById('browserAddress').value='http://127.0.0.1:${port}/watch';
    return await navigateBrowserFromAddress()`);
  assert.equal(nav.ok, true, JSON.stringify(nav));
  const videoPage = await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL().startsWith(`http://127.0.0.1:${port}/watch`)), 'Fixture sayfa');

  await until(() => videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&v.readyState>=2?v.currentTime:null})()`),
    'Video decode başladı', 30000);
  await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');v.muted=true;return v.play()})()`);

  // Overlay'i üretim IPC yoluyla kur (kaynak modu, kimlik transform).
  const overlayResult = await run(`return await window.api.setBrowserOverlay(player.browserActiveTabId, {
    mode:'source', offset:0,
    source:${JSON.stringify(cues)}, translation:[],
    sourceTransform:{scale:1,offsetSeconds:0}, translationTransform:{scale:1,offsetSeconds:0},
    style:{scale:1,opacity:.9,bottomOffset:8,width:88,maxLines:2}
  })`);
  assert.equal(overlayResult?.ok, true, 'overlay kurulamadı: ' + JSON.stringify(overlayResult));
  console.log('[overlay-timing] Overlay kuruldu');

  const readOverlay = `(()=>{const root=document.getElementById('__whisper_browser_subtitles');
    const e=root?root.querySelector('[data-kind="source"]'):null;
    const v=document.querySelector('video');
    return {text:e?e.textContent:'',t:v?v.currentTime:-1}})()`;

  // Oynatmayı t≈14'e getir: görünür cue 12-14; bekleyen sınır uzak cue 50 (~35sn).
  // Önce tanı akışı: t≈9'dan 13.2'ye her ~250 ms'de metin+teşhis örnekle.
  const preSamples = [];
  await until(() => videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>=9.0?v.currentTime:null})()`),
    'Oynatma 9s', 60000);
  for (let i = 0; i < 20; i++) {
    const s = await videoPage.executeJavaScript(readOverlay);
    const d = await videoPage.executeJavaScriptInIsolatedWorld(999, [{
      code: `(()=>{const c=globalThis.__whisperBrowserOverlayController;
        if(!c)return null;const dg=c.diagnostics();
        return {cb:dg.boundaryCallbacks,pf:dg.pendingFrames,run:dg.running,
          rc:dg.renderCount,fb:dg.fallbackRenders,lr:dg.lastRenderVideoTime,
          ab:dg.armedBoundary,ad:dg.armedDelayMs,fk:dg.frameKind,
          tp:dg.timerProbeDelayMs,mt:dg.mediaTime}})()`,
    }]).then((r) => r?.[0] ?? r).catch(() => null);
    preSamples.push({ t: s?.t, text: s?.text, diag: d });
    if (s && s.t >= 13.4) break;
    await wait(200);
  }
  report.preSamples = preSamples;
  const preSeek = await videoPage.executeJavaScript(readOverlay);
  report.preSeek = preSeek;
  // Seek öncesi sağlık: görünen metin o anki cue veya bir önceki 600 ms
  // içinde kapanan cue olmalı (sınır→vfc/raf→render gecikmesi üst sınırı).
  const preOk = [preSeek.t, preSeek.t - 0.6].map(expectedAt).includes(preSeek.text);
  assert(preOk, `seek öncesi metin: ${preSeek.text} @${preSeek.t}`);
  await shot('01-preseek');

  // Oynatma SÜRERKEN geriye seek → 5.0
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.currentTime=5.0;return v.currentTime})()`);
  const seekIssuedAt = Date.now();
  await until(() => videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&Math.abs(v.currentTime-5)<0.4?v.currentTime:null})()`),
    'Seek 5.0 oturdu');

  // 4.5 sn boyunca her ~200 ms'de görünen metni ve video zamanını örnek.
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 4500) {
    const s = await videoPage.executeJavaScript(readOverlay);
    if (s && s.t >= 0) samples.push({ t: s.t, text: s.text, wallMs: Date.now() - seekIssuedAt });
    const d = await videoPage.executeJavaScriptInIsolatedWorld(999, [{
      code: `(()=>{const c=globalThis.__whisperBrowserOverlayController;
        if(!c)return null;const dg=c.diagnostics();
        return {cb:dg.boundaryCallbacks,pf:dg.pendingFrames,run:dg.running,
          rc:dg.renderCount,fb:dg.fallbackRenders,lr:dg.lastRenderVideoTime,
          ab:dg.armedBoundary,ad:dg.armedDelayMs,fk:dg.frameKind,
          tp:dg.timerProbeDelayMs,mt:dg.mediaTime}})()`,
    }]).then((r) => r?.[0] ?? r).catch(() => null);
    if (d) samples[samples.length - 1].diag = d;
    await wait(200);
  }
  await shot('02-postseek');
  report.samples = samples;
  report.sampleCount = samples.length;
  report.postDiagnostics = await videoPage.executeJavaScriptInIsolatedWorld(999, [{
    code: `(()=>{const c=globalThis.__whisperBrowserOverlayController;
      const v=document.querySelector('video');
      return {ctrl:c?c.diagnostics():null,
        media:{t:v?.currentTime,paused:v?.paused,rate:v?.playbackRate,
          rvfc:typeof v?.requestVideoFrameCallback}}})()`,
  }]).then((r) => r?.[0] ?? r);
  console.log('[overlay-timing] post-seek tanı:', JSON.stringify(report.postDiagnostics));

  // Orak: her örnekte görünen metin o andaki video zamanının cue'su olmalı.
  // Seek'in ilk 400 ms'i seeked olayının isolated-world dinleyicisine
  // ulaşıp ilk çerçevenin çizilmesi için gerekçeli üst sınırdır (tek render
  // ~0.3 ms + IPC/event kuyruğu); örnek kendi kaydettiği currentTime'a göre
  // yargılanır, duvar saati kayması sayılmaz.
  const mismatches = [];
  for (const s of samples) {
    if (s.wallMs < 400) continue;
    const exp = expectedAt(s.t);
    if (s.text !== exp) mismatches.push({ ...s, expected: exp });
  }
  report.mismatches = mismatches;
  report.wrongCueEstimateMs = mismatches.length * 200;
  console.log(`[overlay-timing] ${samples.length} örnek, ${mismatches.length} uyumsuz (~${report.wrongCueEstimateMs} ms yanlış cue)`);
  assert.equal(mismatches.length, 0,
    `Seek sonrası bayat cue örnekleri: ${JSON.stringify(mismatches.slice(0, 8))}`);

  // --- T2 genişleme: oynatma hızı, duraklat/devam, pencere görünürlüğü ---
  // Her senaryo aynı orakla yargılanır: görünen metin, örneğin kendi
  // kaydettiği video zamanındaki cue olmalı.
  report.expanded = {};
  async function sampleWhile(durationMs) {
    const out = [];
    const t0 = Date.now();
    while (Date.now() - t0 < durationMs) {
      const s = await videoPage.executeJavaScript(readOverlay);
      if (s && s.t >= 0) out.push({ t: s.t, text: s.text });
      await wait(200);
    }
    const bad = out.filter((s) => s.text !== expectedAt(s.t)).map((s) => ({ ...s, expected: expectedAt(s.t) }));
    return { samples: out.length, tStart: out[0]?.t, tEnd: out[out.length - 1]?.t,
      mismatchCount: bad.length, mismatches: bad.slice(0, 6) };
  }

  // Hız: 2x ve 0.5x altında aktif cue doğruluğu (cue-yoğun 0-16s bölgesinde kal)
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.currentTime=6.0;v.playbackRate=2;return v.currentTime})()`);
  report.expanded.rate2 = await sampleWhile(3000);
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.currentTime=4.0;v.playbackRate=0.5;return v.currentTime})()`);
  report.expanded.rate05 = await sampleWhile(3000);
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.playbackRate=1;return v.playbackRate})()`);

  // Duraklat/devam: pause'da görünen metin o andaki cue'da sabit kalmalı,
  // resume'da doğru cue ile ilerlemeli.
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.currentTime=8.0;return v.currentTime})()`);
  await until(() => videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return Math.abs(v.currentTime-8)<0.4?v.currentTime:null})()`),
    'Pause öncesi seek 8.0');
  await wait(500);
  await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');v.pause();return v.paused})()`);
  await wait(600);
  const paused1 = await videoPage.executeJavaScript(readOverlay);
  await wait(500);
  const paused2 = await videoPage.executeJavaScript(readOverlay);
  report.expanded.paused = { paused1, paused2,
    stable: paused1.text === paused2.text && paused1.text === expectedAt(paused1.t) };
  await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');return v.play()})()`);
  report.expanded.resume = await sampleWhile(2000);

  // Görünürlük: pencereyi gizle → document.hidden değişimini ölç → geri getir
  // → toparlanmayı ölç. document.hidden iken controller bilinçli olarak render
  // ve sınır planlamasını atlar (kaynak tasarrufu: overlay zaten görünmez);
  // bayat metnin gizli dönemde kalması hata değildir. Kabul kriteri: sayfanın
  // gerçekten 'hidden' olduğu ve reshow sonrası ilk örnekte doğru cue.
  await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');v.currentTime=6.0;return v.currentTime})()`);
  win.hide();
  await wait(700);
  const visState = await videoPage.executeJavaScript('(()=>document.visibilityState)()');
  const hiddenSample = await sampleWhile(2500);
  hiddenSample.visibilityState = visState;
  hiddenSample.staleSamples = hiddenSample.mismatchCount;
  hiddenSample.note = 'document.hidden iken donma bilinçli tasarım — visibilitychange→render reshow toparlanmasını sağlar.';
  report.expanded.hidden = hiddenSample;
  assert.equal(visState, 'hidden',
    'win.hide() fixture sayfasına visibilitychange olarak ulaşmadı — senaryo gizliliği ölçmedi');
  win.show(); win.focus();
  await wait(400);
  report.expanded.reshow = await sampleWhile(1500);

  const expandedBad = [];
  for (const key of ['rate2', 'rate05', 'resume', 'reshow']) {
    const e = report.expanded[key];
    if (e?.mismatchCount) expandedBad.push({ key, count: e.mismatchCount, sample: e.mismatches });
  }
  if (!report.expanded.paused?.stable) {
    expandedBad.push({ key: 'paused', got: report.expanded.paused });
  }
  console.log('[overlay-timing] genişleme:', JSON.stringify(
    Object.fromEntries(Object.entries(report.expanded).map(([k, v]) => [k, {
      n: v.samples, bad: v.mismatchCount, t: [v.tStart, v.tEnd], vis: v.visibilityState,
      stable: v.stable,
    }]))));
  assert.equal(expandedBad.length, 0,
    `Hız/duraklat/görünürlük senaryolarında bayat cue: ${JSON.stringify(expandedBad)}`);

  report.ok = true;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[overlay-timing] PASS');
  server.close();
  app.exit(0);
}).catch((error) => {
  clearTimeout(watchdog);
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  fs.writeFileSync(path.join(out, 'error.txt'), String(error && error.stack || error));
  console.error(error);
  try { server.close(); } catch (_) {}
  app.exit(1);
});
