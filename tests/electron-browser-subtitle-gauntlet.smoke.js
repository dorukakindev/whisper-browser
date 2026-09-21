'use strict';

// Browser Subtitle Reliability Gauntlet — Bölüm 6 gerçek-Electron kabul katmanı.
// Gerçek Electron penceresi + gerçek in-app browser + hls.js oynatımı;
// fixture'lar mux.js'in gerçek CEA-608 fMP4 segmentleri ve gerçek VTT/HLS
// manifestleri; sağlayıcı deterministik sahte OpenAI-uyumlu uç nokta.
// Çalıştırma: node_modules/.bin/electron tests/electron-browser-subtitle-gauntlet.smoke.js

const { app, BrowserWindow, webContents, session } = require('electron');
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const assert = require('node:assert/strict');
const dns = require('dns');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.GAUNTLET_OUT || path.join(root, '.uiprev', 'subtitle-gauntlet'));
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.resolve(
  process.env.GAUNTLET_PROFILE || path.join(out, `profile-${process.pid}`));
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

// Sahte OpenAI-uyumlu sağlayıcı: gerçek HTTP sunucusu 127.0.0.1'de —
// main süreç session.fetch ile çıkarken gerçek ağ hattını kullanır.
// Her istek sayılır; yanıt kaynak metni koruyan deterministic çeviridir.
const providerStats = { requests: 0, seen: [] };
const providerServer = http.createServer((req, res) => {
  if (!req.url || !req.url.endsWith('/chat/completions')) { res.writeHead(404); return res.end('yok'); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    providerStats.requests += 1;
    let source = '';
    let pieceCount = 1;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const user = body.messages?.at(-1)?.content || '';
      const payload = JSON.parse(user);
      // Tek-parça cümleler {metin:...}, çok-parça cümleler {source,parts:...} alanı kullanır.
      source = String(payload.source ?? payload.metin ?? '');
      pieceCount = Math.max(1, Array.isArray(payload.parts) ? payload.parts.length : 1);
    } catch (_) {}
    providerStats.seen.push(source);
    const translated = source ? `TR:${source}` : 'TR: çeviri';
    const parts = Array.from({ length: pieceCount }, (_, i) => `${translated}·p${i}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: parts.join(' '), parts }) } }] }));
  });
});

// assertPublicBrowserSubtitleUrl gauntlet.test alan adını çözemez (yerel yok);
// halka açık bir IP döndürülür — istekler yine de protokol interceptor'ünden
// geçer, dış ağa çıkmaz.
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
// main.js require('dns').promises kullanır — callback patch'i onu kapsamaz.
const realPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async (host, opts) => {
  const name = String(host || '');
  if (name === 'gauntlet.test') {
    const all = typeof opts === 'object' && opts && opts.all;
    return all ? [{ address: '93.184.216.34', family: 4 }] : '93.184.216.34';
  }
  return realPromisesLookup.call(dns.promises, host, opts);
};

// session.fetch Chromium'un host resolver'ından geçer; protocol.handle ve
// webRequest onu bypass eder. gauntlet.test'i yerel HTTPS fixture sunucusuna
// eşlemek için resolver kuralı + self-signed cert gerekir (ana-süreç fetch'i
// gerçek ağ yolundan gider). Port sabit — resolver kuralı ready öncesi yazılmalı.
const GAUNTLET_HTTPS_PORT = 18393;
const certDir = path.join(out, 'tls');
fs.mkdirSync(certDir, { recursive: true });
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" `
    + '-days 2 -subj "/CN=gauntlet.test" -addext "subjectAltName=DNS:gauntlet.test" 2>/dev/null');
}
const fixtureTls = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };

app.setAppPath(root);
app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('host-resolver-rules', `MAP gauntlet.test 127.0.0.1:${GAUNTLET_HTTPS_PORT}`);
require('../src/main.js');

let providerPort = 0;
const providerReady = new Promise((resolve, reject) => {
  providerServer.once('error', reject);
  providerServer.listen(0, '127.0.0.1', () => {
    providerPort = providerServer.address().port;
    // Ayar dosyasını app başlamadan yaz: renderer başlangıç yüklemesi
    // bunu okur ve kendi varsayılanlarıyla ezmez (settings:save IPC'si
    // yarışı yerine deterministik taban).
    fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'settings.json'),
      JSON.stringify({
        settingsVersion: 3,
        translate: { endpointPreset: 'custom', customBaseUrl: `http://127.0.0.1:${providerPort}/v1`,
          model: 'gauntlet-model', apiKey: '' },
        ui: { translateTo: 'tr', translateWorkers: '1', uiLocale: 'tr' },
      }));
    resolve();
  });
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await wait(200);
  }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(last)}`);
}

// ── fixture içerik ────────────────────────────────────────────────────────
const MUX = path.join(root, 'node_modules', 'mux.js', 'test', 'segments');
const ceaInit = fs.readFileSync(path.join(MUX, 'dash-608-captions-init.mp4'));
const ceaSeg = fs.readFileSync(path.join(MUX, 'dash-608-captions-seg.m4s'));
const hlsJs = fs.readFileSync(path.join(root, 'node_modules', 'hls.js', 'dist', 'hls.min.js'));

const vttFor = (rows) => `WEBVTT\n\n${rows.map(([t, s]) => `${t}\n${s}`).join('\n\n')}\n`;
const segA = vttFor([['00:00.000 --> 00:04.000', 'First fixture cue']]);
const segB = vttFor([['00:00.000 --> 00:04.000', 'Second fixture cue']]);
const segC = vttFor([['00:00.000 --> 00:04.000', 'Third fixture cue']]);
const subPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n'
  + '#EXTINF:4,\nsub-0.vtt\n#EXTINF:4,\nsub-1.vtt\n#EXTINF:4,\nsub-2.vtt\n#EXT-X-ENDLIST\n';
// İki quality varyantı aynı CEA içeriğini taşır (kayan pencerede çift sayım olmamalı).
// EXTINF'i gerçek medya süresine (125 sn) eşitle: segment planı videoyu tam
// kapsasın — "eksiksiz yakalandı" pozitif yolu da uçtan uca doğrulanır.
const videoPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:125\n#EXT-X-MEDIA-SEQUENCE:0\n'
  + '#EXT-X-MAP:URI="cea-init.mp4"\n#EXTINF:125,\ncea-seg.m4s\n#EXT-X-ENDLIST\n';
const master = '#EXTM3U\n'
  + '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",URI="sub.m3u8"\n'
  + '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="Embedded",INSTREAM-ID="CC1"\n'
  + '#EXT-X-STREAM-INF:BANDWIDTH=800000,SUBTITLES="subs",CLOSED-CAPTIONS="cc"\nv1.m3u8\n'
  + '#EXT-X-STREAM-INF:BANDWIDTH=400000,SUBTITLES="subs",CLOSED-CAPTIONS="cc"\nv2.m3u8\n';
const page = `<!doctype html><meta charset="utf-8"><title>Gauntlet fixture</title>
<style>body{margin:0;background:#101418;color:#eee}video{width:100%;height:80vh;background:#000}</style>
<video id="v" controls muted></video>
<script src="hls.js"><\/script>
<script>
const v=document.getElementById('v');
const hls=new Hls({subtitleDisplay:true});
hls.on(Hls.Events.SUBTITLE_TRACK_LOADED,()=>{for(const t of v.textTracks)if(t.kind==='subtitles')t.mode='hidden';});
hls.loadSource('master.m3u8');hls.attachMedia(v);
v.addEventListener('loadeddata',()=>v.play().catch(()=>{}));
<\/script>`;

const dashMpd = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT12S">'
  + '<Period><AdaptationSet contentType="text" lang="tr" mimeType="application/ttml+xml">'
  + '<Representation id="tr"><BaseURL>./</BaseURL>'
  + '<SegmentList timescale="1000" duration="4000" startNumber="1">'
  + '<SegmentURL media="dash-0.m4s"/><SegmentURL media="dash-1.m4s"/><SegmentURL media="dash-2.m4s"/>'
  + '</SegmentList></Representation></AdaptationSet></Period></MPD>';
const dashSeg = (text) => `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="4s">${text}</p></div></body></tt>`;

let report = {};
app.whenReady().then(async () => {
  await providerReady;
  report = {};
  report.providerBaseUrl = `http://127.0.0.1:${providerPort}/v1`;
  const fixtureBodies = {
    'watch': { body: page, headers: { 'content-type': 'text/html' } },
    'hls.js': { body: hlsJs, headers: { 'content-type': 'text/javascript' } },
    'master.m3u8': { body: master, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
    'v1.m3u8': { body: videoPlaylist, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
    'v2.m3u8': { body: videoPlaylist, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
    'sub.m3u8': { body: subPlaylist, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
    'sub-0.vtt': { body: segA, headers: { 'content-type': 'text/vtt' } },
    'sub-1.vtt': { body: segB, headers: { 'content-type': 'text/vtt' } },
    'sub-2.vtt': { body: segC, headers: { 'content-type': 'text/vtt' } },
    'cea-init.mp4': { body: ceaInit, headers: { 'content-type': 'video/mp4' } },
    'cea-seg.m4s': { body: ceaSeg, headers: { 'content-type': 'video/mp4' } },
    'dash.mpd': { body: dashMpd, headers: { 'content-type': 'application/dash+xml' } },
    'dash-0.m4s': { body: dashSeg('DASH ilk bölüm'), headers: { 'content-type': 'application/ttml+xml' } },
    'dash-1.m4s': { body: dashSeg('DASH ikinci bölüm'), headers: { 'content-type': 'application/ttml+xml' } },
    'dash-2.m4s': { body: dashSeg('DASH üçüncü bölüm'), headers: { 'content-type': 'application/ttml+xml' } },
  };
  const ses = session.fromPartition('persist:whisper-browser');
  // Yerel HTTPS fixture sunucusu: host-resolver-rules gauntlet.test'i buraya
  // eşler; self-signed cert yalnız bu oturumun izole profili için kabul edilir.
  const fixtureServer = https.createServer(fixtureTls, (req, res) => {
    const pathname = new URL(req.url, 'https://x').pathname.replace(/^\//, '');
    const hit = fixtureBodies[pathname];
    if (!hit) { res.writeHead(404); return res.end('yok'); }
    res.writeHead(hit.status || 200, hit.headers || {});
    res.end(hit.body);
  });
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject);
    fixtureServer.listen(GAUNTLET_HTTPS_PORT, '127.0.0.1', resolve);
  });
  ses.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === 'gauntlet.test') return callback(0);
    return callback(-3); // Chromium varsayılan doğrulaması
  });
  ses.protocol.handle('https', (req) => {
    const url = new URL(req.url);
    if (url.hostname !== 'gauntlet.test') return new Response('not fixture', { status: 404 });
    const hit = fixtureBodies[url.pathname.replace(/^\//, '')];
    if (!hit) return new Response('yok', { status: 404 });
    return new Response(hit.body, { status: hit.status || 200, headers: hit.headers });
  });

  const win = await until(() => BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar');
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`),
    (await win.webContents.capturePage()).toPNG());

  await run(`openPlayer();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    setWorkspaceMode('browser', false);return true`);
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi');

  const nav = await run(`document.getElementById('browserAddress').value='https://gauntlet.test/watch';
    return await navigateBrowserFromAddress()`);
  assert.equal(nav.ok, true, JSON.stringify(nav));
  const videoPage = await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL() === 'https://gauntlet.test/watch'), 'Fixture sayfa');
  // Erken textTrack dökümü: hangi iz hangi cue'yu taşıyor (karışma teşhisi).
  await until(() => videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&[...v.textTracks].some(t=>(t.cues&&t.cues.length))?true:null})()`),
    'Sayfa textTrack cue', 20000).catch(() => null);
  report.earlyTextTracks = await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');
    return v?[...v.textTracks].map(t=>({kind:t.kind,label:t.label,lang:t.language,id:t.id,
      cues:[...(t.cues||[])].map(c=>c.startTime+'-'+c.endTime+':'+String(c.text||'').slice(0,30))})):null})()`);

  // hls.js VTT izleri + gömülü CEA planı algılanmalı.
  const tracks = await until(() => run(`const list=player.browserTracks||[];
    return list.some(t=>/English|sub/i.test(t.label||'')||t.language==='en')?list:null`),
    'VTT izleri yakalanmalı', 30000);
  report.tracks = tracks.map((t) => ({ id: t.id, language: t.language, cueCount: t.cueCount, format: t.format }));
  report.diagnostics = await run(`return browserTabState()?.diagnostics || null`);
  report.textTracksNow = await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');
    return v?[...v.textTracks].map(t=>({kind:t.kind,label:t.label,lang:t.language,mode:t.mode,
      cues:[...(t.cues||[])].map(c=>c.startTime+'-'+c.endTime+':'+String(c.text||'').slice(0,30))})):null})()`);
  const ceaPlan = await until(() => run(`const c=player.browserCeaCapture||browserTabState()?.ceaCapture;
    return c && (c.available||c.state)?c:null`), 'CEA yakalama planı', 15000)
    .catch(() => null);
  report.ceaPlan = ceaPlan || 'yok';
  await shot('01-tracks');

  // ── Tüm altyazıyı getir (gerçek CEA fMP4 yakalama) ─────────────────────
  const captureResult = await run(`return await window.api.captureFullBrowserSubtitle(player.browserActiveTabId,'start')`);
  report.captureStart = captureResult;
  if (captureResult?.ok !== false) {
    const done = await until(() => run(`const c=browserTabState()?.ceaCapture||player.browserCeaCapture;
      return c && ['complete','partial','error'].includes(c.state)?c:null`), 'CEA yakalama tamamlanma', 60000)
      .catch(() => null);
    report.ceaCapture = done || 'timeout';
  }
  await shot('02-cea-capture');

  // ── İzi seç ve çevir (sahte sağlayıcı, gerçek hattı) ───────────────────
  report.trackCues = await run(`return (player.browserTracks||[]).map(t=>({id:t.id,format:t.format,role:t.role,
    cues:(t.cues||[]).slice(0,6).map(c=>({start:c.start,end:c.end,text:String(c.text||'').slice(0,40)}))}))`);
  report.videoState = await videoPage.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return {t:v?.currentTime,dur:v?.duration,paused:v?.paused,tracks:[...v.textTracks].map(x=>({kind:x.kind,label:x.label,mode:x.mode,cues:x.cues?x.cues.length:0}))}})()`);
  const source = await run(`const t=(player.browserTracks||[]).find(t=>t.role!=='translation'&&(t.cueCount||0)>=3);
    return t?{id:t.id,cueCount:t.cueCount}:null`);
  assert(source, 'Kaynak iz bulunamadı');
  report.source = source;
  // Gerçek UI akışı: useBrowserTrack(translate=true) — "İzi seç ve çevir".
  await run(`return useBrowserTrack(true, ${JSON.stringify(source.id)})`);
  const transDone = await until(() => run(`const tab=browserTabState();
    if (tab && tab.browserTranslationComplete === true) return {complete:true};
    if (player.browserTranslationLastError) return {error:player.browserTranslationLastError};
    return null`), 'Çeviri tamamlandı', 120000);
  if (transDone.complete !== true) {
    const snapshot = await run(`return await window.api.getBrowserTranslationSnapshot(player.browserActiveTabId)`);
    report.translationDebug = { snapshot, providerSeen: providerStats.seen.slice(0, 10) };
  }
  assert.equal(transDone.complete, true, `çeviri tamamlanmadı: ${JSON.stringify(transDone)}`);
  const trState = await run(`const tab=browserTabState();
    return {liveTranslations:player.browserLiveTranslations?player.browserLiveTranslations.size:0,
      translationTrackId:player.browserTranslationTrackId,failed:player.browserTranslationFailed}`);
  report.translation = { state: trState, providerRequests: providerStats.requests };
  assert(trState.liveTranslations > 0, 'çeviri cue listesi boş');
  assert(providerStats.requests > 0, 'sağlayıcıya hiç istek gitmedi');
  const trCueSample = await run(`return [...(player.browserLiveTranslations||new Map()).values()].slice(0,3).map(c=>c.text)`);
  report.trCueSample = trCueSample;
  assert(trCueSample.every((t) => /^TR:/.test(t)), `çeviri sağlayıcıdan gelmedi: ${trCueSample}`);
  await shot('03-translated');

  // Görünüm modları: kaynak / ikisi / çeviri. Overlay yalnız aktif cue varken
  // dolu — videoyu bilinen cue penceresine sar ve oynat.
  await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');v.currentTime=1.0;return v.play().catch(()=>{})})()`);
  await run(`return setSubtitleMode('source')`);
  const sourceOnly = await until(() => videoPage.executeJavaScript(
    `(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t||null})()`), 'Kaynak katmanı');
  await run(`return setSubtitleMode('both')`);
  await videoPage.executeJavaScript(`(()=>{const v=document.querySelector('video');v.currentTime=1.0;return v.play().catch(()=>{})})()`);
  const both = await until(() => videoPage.executeJavaScript(
    `(()=>{const el=document.getElementById('__whisper_browser_subtitles');return el&&el.textContent.includes('TR:')?el.textContent:null})()`),
    'Çift dil katmanı');
  report.views = { sourceOnly: !!sourceOnly, both: !!both };
  await shot('04-both-views');
  await run(`return setSubtitleMode('translation')`);

  // Seek: video zamanına göre doğru cue gösterilmeli.
  await videoPage.executeJavaScript(`document.querySelector('video').currentTime=5`);
  await wait(600);
  const seekCue = await videoPage.executeJavaScript(
    `(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t})()`);
  report.seek = { at5: seekCue };
  await videoPage.executeJavaScript(`document.querySelector('video').currentTime=0.5`);
  await wait(600);

  // EN/TR arayüz geçişi + ölçek.
  await run(`window.UiLocale&&UiLocale.set('en');const c=document.getElementById('uiLocale');if(c){c.value='en';c.dispatchEvent(new Event('change',{bubbles:true}));}return true`);
  await wait(400);
  const enLabel = await run(`const b=document.getElementById('browserTrackCaptureFull');return b?b.textContent:''`);
  report.localeEn = enLabel;
  await shot('05-en');
  await run(`window.UiLocale&&UiLocale.set('tr');const c=document.getElementById('uiLocale');if(c){c.value='tr';c.dispatchEvent(new Event('change',{bubbles:true}));}return true`);
  await wait(400);
  for (const scale of [100, 125, 150]) {
    await run(`document.body.style.zoom=${scale / 100};return true`);
    await wait(250);
    await shot(`06-scale-${scale}`);
  }
  await run(`document.body.style.zoom=1;return true`);

  // Sekme yeniden yükleme: izler/çeviri korunur.
  await videoPage.reload();
  await until(() => videoPage.executeJavaScript('document.readyState==="complete"'), 'Sayfa yenilendi');
  await wait(1500);
  const tracksAfterReload = await run(`return (player.browserTracks||[]).length`);
  report.tracksAfterReload = tracksAfterReload;

  report.ok = true;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  providerServer.close();
  fixtureServer.close();
  app.exit(0);
}).catch((error) => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error && error.stack || error));
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  console.error(error);
  try { providerServer.close(); } catch (_) {}
  try { fixtureServer.close(); } catch (_) {}
  app.exit(1);
});
