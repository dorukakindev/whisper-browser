'use strict';

// T2 — Tam yakalama eksiksizlik kanıtı (gerçek Electron + gerçek CEA fMP4).
// Büyüyen playlist (açık → kapalı), araya eklenen EXT-X-DISCONTINUITY,
// yenilenen imzalı URL, 403 eksik parça ve iptal/devam senaryoları
// `runBrowserHlsCeaFullCapture` defteri üzerinden uçtan uca koşulur.
// Çıktı SRT'si ürün parser'ı yerine bağımsız küçük bir orakla doğrulanır.
// Çalıştırma: node_modules/.bin/electron tests/electron-capture-completeness.smoke.js

const { app, BrowserWindow, webContents, session } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
const assert = require('node:assert/strict');
const dns = require('dns');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.GAUNTLET_OUT || path.join(root, '.uiprev', 'capture-completeness'));
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.resolve(
  process.env.GAUNTLET_PROFILE || path.join(out, `profile-${process.pid}`));
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const girdiDir = path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'GİRDİ');

const realLookup = dns.lookup;
dns.lookup = (host, opts, cb) => {
  const name = String(host || '');
  if (name === 'gauntlet.test') {
    const callback = typeof opts === 'function' ? opts : cb;
    const all = typeof opts === 'object' && opts && opts.all;
    return callback(null, all ? [{ address: '93.184.216.34', family: 4 }] : '93.184.216.34', 4);
  }
  return realLookup.call(dns, host, opts, cb);
};
const realPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async (host, opts) => {
  const name = String(host || '');
  if (name === 'gauntlet.test') {
    const all = typeof opts === 'object' && opts && opts.all;
    return all ? [{ address: '93.184.216.34', family: 4 }] : '93.184.216.34';
  }
  return realPromisesLookup.call(dns.promises, host, opts);
};

const HTTPS_PORT = 18403;
const certDir = path.join(out, 'tls');
fs.mkdirSync(certDir, { recursive: true });
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  const cert = spawnSync(process.env.OPENSSL_BIN || 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath,
    '-out', certPath, '-days', '2', '-subj', '/CN=gauntlet.test',
    '-addext', 'subjectAltName=DNS:gauntlet.test',
  ], { encoding: 'utf8' });
  if (cert.error || cert.status !== 0) {
    throw new Error(`TLS sertifikası üretilemedi: ${cert.error?.message || cert.stderr || cert.status}`);
  }
}
const fixtureTls = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };

app.setAppPath(root);
app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('host-resolver-rules', `MAP gauntlet.test 127.0.0.1:${HTTPS_PORT}`);
fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'settings.json'),
  JSON.stringify({
    settingsVersion: 3,
    inputDir: girdiDir,
    outputDir: path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'ÇIKTI'),
    ui: { translateTo: 'tr', uiLocale: 'tr' },
  }));
require('../src/main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    let timer;
    try {
      last = await Promise.race([
        Promise.resolve().then(fn),
        new Promise((resolve) => { timer = setTimeout(resolve, Math.min(5000, end - Date.now()), null); }),
      ]);
    } finally { clearTimeout(timer); }
    if (last) return last;
    await wait(200);
  }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(last)}`);
}

// ── fixture ────────────────────────────────────────────────────────────────
const MUX = path.join(root, 'node_modules', 'mux.js', 'test', 'segments');
const ceaInit = fs.readFileSync(path.join(MUX, 'dash-608-captions-init.mp4'));
const ceaSeg = fs.readFileSync(path.join(MUX, 'dash-608-captions-seg.m4s'));

// Oynatıcı videosu statik ve sonlu süreli: açık playlist'in video.duration'ı
// Infinity yapmasıyla 'duration-unknown' belirsizliği devreye girmesin —
// büyüme yalnız playlist tarafında simüle edilir.
const mediaPath = path.join(out, 'fixture-media.mp4');
if (!fs.existsSync(mediaPath)) {
  const ff = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mediaPath,
  ], { encoding: 'utf8' });
  if (ff.error || ff.status !== 0) {
    throw new Error(`fixture video üretilemedi: ${ff.error?.message || ff.stderr}`);
  }
}
const mediaMp4 = fs.readFileSync(mediaPath);

// Değişken sunucu durumu: playlist büyür, imzalar yenilenir, kesinti eklenir,
// parça 403 olur. fetchCount parça başına gerçek indirme sayısını tutar.
let phase = 'open';
const failSet = new Set();
const fetchCount = {};
const playlistFetches = [];
const SEG_COUNT = 4;
const playlistBody = () => {
  let body = '#EXTM3U\n#EXT-X-TARGETDURATION:125\n#EXT-X-MEDIA-SEQUENCE:0\n'
    + '#EXT-X-MAP:URI="cea-init.mp4"\n';
  const count = phase === 'open' ? 2 : SEG_COUNT;
  const sig = phase === 'open' ? 'a' : 'b';
  for (let i = 0; i < count; i += 1) {
    // Kapalı fazda seq 1 öncesine kesinti: tamamlanmış seq 1'in disc'i değişir.
    if (phase !== 'open' && i === 1) body += '#EXT-X-DISCONTINUITY\n';
    body += `#EXTINF:125,\nseg-${i}.m4s?sig=${sig}\n`;
  }
  if (phase !== 'open') body += '#EXT-X-ENDLIST\n';
  return body;
};
const master = '#EXTM3U\n'
  + '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="Embedded",INSTREAM-ID="CC1"\n'
  + '#EXT-X-STREAM-INF:BANDWIDTH=800000,CLOSED-CAPTIONS="cc"\nvv.m3u8\n';
const page = `<!doctype html><meta charset="utf-8"><title>T2 fixture</title>
<style>body{margin:0;background:#101418}video{width:100%;height:80vh;background:#000}</style>
<video id="v" controls muted src="media.mp4"></video>
<script>
// CEA planı ağ isteğiyle tetiklenir: master playlist'i getir.
fetch('master.m3u8').then(()=>fetch('vv.m3u8')).catch(()=>{});
const v=document.getElementById('v');
v.addEventListener('loadeddata',()=>v.play().catch(()=>{}));
<\/script>`;

// Bağımsız orak: ürün parser'ından bağımsız minimal SRT okuyucu.
function parseSrtFile(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const cues = [];
  const re = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*\n([\s\S]*?)(?=\n\s*\n|\s*$)/g;
  let m;
  while ((m = re.exec(text))) {
    const s = (+m[1] * 3600 + +m[2] * 60 + +m[3]) + (+m[4] / 1000);
    const e = (+m[5] * 3600 + +m[6] * 60 + +m[7]) + (+m[8] / 1000);
    cues.push({ start: s, end: e, text: m[9].trim() });
  }
  return cues;
}
const srtKey = (c) => `${c.start}|${c.end}|${c.text}`;
const listGirdi = () => fs.existsSync(girdiDir)
  ? fs.readdirSync(girdiDir).filter((f) => /\.srt$/i.test(f)) : [];

const report = {};
const watchdog = setTimeout(() => {
  const error = new Error('T2 smoke 150 saniyelik güvenlik sınırını aştı');
  try { fs.writeFileSync(path.join(out, 'error.txt'), error.stack); } catch (_) {}
  console.error(error);
  app.exit(1);
}, 150000);
watchdog.unref();

app.whenReady().then(async () => {
  console.log('[t2] Electron hazır');
  const ses = session.fromPartition('persist:whisper-browser');
  const fixtureServer = https.createServer(fixtureTls, (req, res) => {
    const pathname = new URL(req.url, 'https://x').pathname.replace(/^\//, '');
    if (pathname === 'vv.m3u8') {
      playlistFetches.push(`${phase}@${Date.now() % 100000}`);
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      return res.end(playlistBody());
    }
    const segMatch = pathname.match(/^seg-(\d+)\.m4s$/);
    if (segMatch) {
      fetchCount[segMatch[0]] = (fetchCount[segMatch[0]] || 0) + 1;
      if (failSet.has(pathname)) { res.writeHead(403); return res.end('forbidden'); }
      res.writeHead(200, { 'content-type': 'video/mp4' });
      return res.end(ceaSeg);
    }
    const bodies = {
      watch: { body: page, headers: { 'content-type': 'text/html' } },
      'media.mp4': { body: mediaMp4, headers: { 'content-type': 'video/mp4' } },
      'master.m3u8': { body: master, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
      'cea-init.mp4': { body: ceaInit, headers: { 'content-type': 'video/mp4' } },
    };
    const hit = bodies[pathname];
    if (!hit) { res.writeHead(404); return res.end('yok'); }
    res.writeHead(hit.status || 200, hit.headers || {});
    res.end(hit.body);
  });
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject);
    fixtureServer.listen(HTTPS_PORT, '127.0.0.1', resolve);
  });
  ses.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === 'gauntlet.test') return callback(0);
    return callback(-3);
  });
  ses.protocol.handle('https', (req) => {
    const url = new URL(req.url);
    if (url.hostname !== 'gauntlet.test') return new Response('not fixture', { status: 404 });
    const pathname = url.pathname.replace(/^\//, '');
    if (pathname === 'vv.m3u8') {
      playlistFetches.push(`page:${phase}@${Date.now() % 100000}`);
      return new Response(playlistBody(), { status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }
    if (/^seg-\d+\.m4s$/.test(pathname)) {
      fetchCount[pathname] = (fetchCount[pathname] || 0) + 1;
      if (failSet.has(pathname)) return new Response('forbidden', { status: 403 });
      return new Response(ceaSeg, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    const bodies = {
      watch: { body: page, headers: { 'content-type': 'text/html' } },
      'media.mp4': { body: mediaMp4, headers: { 'content-type': 'video/mp4' } },
      'master.m3u8': { body: master, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
      'cea-init.mp4': { body: ceaInit, headers: { 'content-type': 'video/mp4' } },
    };
    const hit = bodies[pathname];
    if (!hit) return new Response('yok', { status: 404 });
    return new Response(hit.body, { status: hit.status || 200, headers: hit.headers });
  });
  console.log('[t2] HTTPS fixture hazır');

  const win = await until(() => BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere');
  win.show();
  win.focus();
  const run = async (code) => {
    let timer;
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(`(async()=>{${code}})()`, true),
        new Promise((_, reject) => { timer = setTimeout(() =>
          reject(new Error(`Renderer isteği zaman aşımı: ${code.slice(0, 90)}`)), 15000); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar');
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`),
    (await win.webContents.capturePage()).toPNG());

  await run(`openPlayer();setWorkspaceMode('browser', false);return true`);
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi');
  const nav = await run(`document.getElementById('browserAddress').value='https://gauntlet.test/watch';
    return await navigateBrowserFromAddress()`);
  assert.equal(nav.ok, true, JSON.stringify(nav));
  console.log('[t2] Fixture sayfasına gidildi');
  await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL() === 'https://gauntlet.test/watch'), 'Fixture sayfa');

  const plan = await until(() => run(`const c=player.browserCeaCapture||browserTabState()?.ceaCapture;
    return c && c.available?c:null`), 'CEA planı', 30000);
  assert(plan.tracks?.some((t) => t.instreamId === 'CC1'), 'CC1 plan izinde olmalı');
  assert(plan.total >= 2, `açık fazda en az 2 parça planlanmalı: ${plan.total}`);
  report.planOpen = { total: plan.total, planComplete: plan.planComplete };

  // ── Aşama 1: açık playlist → 'partial' + dürüst mesaj, dosya YAZILMAZ ──
  const start1 = await run(`return await window.api.captureFullBrowserSubtitle(player.browserActiveTabId,'start')`);
  assert.equal(start1?.ok, true, `tam yakalama başlamalı: ${JSON.stringify(start1)}`);
  const openDone = await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
    return c && ['partial','complete','error'].includes(c.state)?c:null`),
    'açık playlist sonucu', 40000);
  report.openResult = { state: openDone.state, reason: openDone.planReason,
    completed: openDone.completed, total: openDone.total, missing: openDone.missing,
    complete: openDone.complete, message: openDone.message };
  assert.equal(openDone.state, 'partial', 'açık playlist complete iddia edemez');
  assert.equal(openDone.complete, false);
  assert.equal(openDone.planReason, 'open-playlist');
  assert(!/eksiksiz/i.test(openDone.message || ''), 'kısmi sonuç "eksiksiz" diyemez');
  assert(/sonlanmadı|korundu|yeniden/i.test(openDone.message || ''), 'kısmi mesaj gerçeği söylemeli');
  assert.equal(listGirdi().length, 0, 'complete olmadan GİRDİ klasörüne dosya yazılmaz');
  console.log('[t2] açık playlist dürüst kısmi sonuç:', JSON.stringify(report.openResult));
  const seg1FetchesAfterOpen = fetchCount['seg-1.m4s'] || 0;

  // ── Aşama 2: playlist kapanır (DISC eklenir, imza yenilenir) + kullanıcı
  // yeniden denemesi → resume → otomatik manifest yenileme → complete ──
  phase = 'closed';
  const start2 = await run(`return await window.api.captureFullBrowserSubtitle(player.browserActiveTabId,'start')`);
  assert.equal(start2?.ok, true, `kısmi sonuçtan devam başlatılabilir: ${JSON.stringify(start2)}`);
  let closed;
  try {
    closed = await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
      if(c){window.__t2log=window.__t2log||[];const s=[c.state,c.planReason,c.completed+'/'+c.total,'m'+c.missing,'c'+c.cueCount].join('|');
        if(window.__t2log[window.__t2log.length-1]!==s)window.__t2log.push(s)}
      return c&&['complete','error'].includes(c.state)&&c.planComplete===true?c:null`),
      'kapalı playlist complete', 90000);
  } catch (e) {
    report.stateLog = await run('return window.__t2log||[]');
    report.playlistFetches = playlistFetches;
    report.segFetches = { ...fetchCount };
    throw e;
  }
  report.closed = { state: closed.state, completed: closed.completed, total: closed.total,
    missing: closed.missing, cueCount: closed.cueCount, complete: closed.complete,
    message: closed.message };
  assert.equal(closed.state, 'complete', `büyüyen playlist kapanınca complete: ${JSON.stringify(report.closed)}`);
  assert.equal(closed.missing, 0);
  assert.equal(closed.total, SEG_COUNT,
    `defter kesinti eklenince şişmemeli — gerçekte ${closed.total} (eski disc:seq kimliği ${SEG_COUNT + 1} üretirdi)`);
  assert.equal(fetchCount['seg-1.m4s'], seg1FetchesAfterOpen,
    'disc değişen tamamlanmış parça yeniden indirilmemeli (seq-ankerli kimlik)');
  assert(closed.cueCount > 0, 'CEA cue çıkmalı');
  assert(/eksiksiz|kaydedildi/i.test(closed.message || ''), 'tam mesajı doğru olmalı');
  console.log('[t2] kapalı playlist tam sonuç:', JSON.stringify(report.closed));

  // Dosya ↔ UI tutarlılığı: GİRDİ SRT'si bağımsız orakla, iç track dosyasıyla
  // timestamp+metin kimliği üzerinden karşılaştırılır.
  const girdiFiles = listGirdi();
  assert(girdiFiles.length >= 1, 'complete sonrası GİRDİ klasöründe SRT olmalı');
  const girdiCues = parseSrtFile(path.join(girdiDir, girdiFiles[0]));
  const internalTrack = await run(`const t=(player.browserTracks||[]).find(t=>t.captureKind==='embedded-cea'||(t.instreamId||''));
    return t?{path:t.path,inputPath:t.inputPath,cueCount:t.cueCount}:null`);
  assert(internalTrack, 'yakalanan CEA track listede olmalı');
  assert(fs.existsSync(internalTrack.path), `iç track dosyası var olmalı: ${internalTrack.path}`);
  const internalCues = parseSrtFile(internalTrack.path);
  const girdiKeys = new Set(girdiCues.map(srtKey));
  const internalKeys = new Set(internalCues.map(srtKey));
  assert.deepEqual([...internalKeys].sort(), [...girdiKeys].sort(),
    'GİRDİ SRT içeriği bellekteki cue kümesiyle (timestamp+metin) birebir aynı olmalı');
  assert.equal(girdiCues.length, internalCues.length, 'dosya/bellek cue sayısı eşit');
  assert.equal(girdiCues.length, closed.cueCount,
    `dosya satır sayısı UI'daki cueCount ile eşit: ${girdiCues.length} vs ${closed.cueCount}`);
  assert.equal(new Set(girdiCues.map(srtKey)).size, girdiCues.length,
    'aynı (başlangıç,bitiş,metin) cue dosyada çoğaltılmamış — çift çözme yok');
  assert(girdiCues.every((c, i, a) => c.end > c.start && (i === 0 || a[i - 1].start <= c.start + 1e-6)),
    'cue sıralaması monoton, negatif süre yok');
  report.fileConsistency = { file: girdiFiles[0], fileCues: girdiCues.length,
    memoryCues: internalCues.length, uiCueCount: closed.cueCount, segFetches: fetchCount };
  console.log('[t2] dosya↔UI tutarlılığı doğrulandı:', JSON.stringify(report.fileConsistency));
  await shot('t2-01-complete');

  // ── Aşama 3: 403 eksik parça → 'partial' + dürüst eksik sayımı ─────────
  failSet.add('seg-2.m4s');
  const start403 = await run(`return await window.api.captureFullBrowserSubtitle(player.browserActiveTabId,'start')`);
  assert.equal(start403?.ok, true, 'yeniden yakalama başlatılabilir');
  await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
    return c&&c.state==='running'?c:null`), '403 koşusu running', 15000);
  const partial403 = await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
    return c && ['partial','error','complete'].includes(c.state)&&c.state!=='running'?c:null`),
    '403 sonucu', 60000);
  report.partial403 = { state: partial403.state, missing: partial403.missing,
    complete: partial403.complete, message: partial403.message };
  assert.equal(partial403.state, 'partial', `403 varken complete üretilemez: ${JSON.stringify(report.partial403)}`);
  assert(partial403.missing >= 1, '403 parça eksik sayılmalı');
  assert.equal(partial403.complete, false);
  assert(!/eksiksiz/i.test(partial403.message || ''), '403 sonucu eksiksiz diyemez');
  console.log('[t2] 403 dürüst kısmi sonuç:', JSON.stringify(report.partial403));

  // ── Aşama 4: 403 düzelir → kullanıcı yeniden dener → complete ───────────
  failSet.clear();
  const start3 = await run(`return await window.api.captureFullBrowserSubtitle(player.browserActiveTabId,'start')`);
  assert.equal(start3?.ok, true, 'kurtarma denemesi başlatılabilir');
  await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
    return c&&c.state==='running'?c:null`), 'kurtarma koşusu running', 15000);
  const recovered = await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
    return c && ['complete','error'].includes(c.state)?c:null`),
    'kurtarma sonucu', 60000);
  report.recovered = { state: recovered.state, missing: recovered.missing,
    completed: recovered.completed, total: recovered.total, message: recovered.message };
  assert.equal(recovered.state, 'complete', `403 düzelince complete: ${JSON.stringify(report.recovered)}`);
  assert.equal(recovered.missing, 0);
  console.log('[t2] kurtarma tam sonuç:', JSON.stringify(report.recovered));
  await shot('t2-02-recovered');

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[t2] PASS');
  fixtureServer.close();
  clearTimeout(watchdog);
  app.exit(0);
}).catch((error) => {
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  console.error(error);
  app.exit(1);
});
