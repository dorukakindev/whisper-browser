'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
function option(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const smoke = process.argv.includes('--smoke');
const requestedCycles = Number(option('cycles', smoke ? 8 : 400));
const cycles = smoke ? Math.max(1, requestedCycles || 8) : Math.max(200, requestedCycles || 400);
const warmup = Math.max(0, Number(option('warmup', smoke ? 2 : 20)) || 0);
const requestedHibernationCycles = Number(option('hibernation-cycles', smoke ? 2 : 50));
const hibernationCycles = smoke
  ? Math.max(1, requestedHibernationCycles || 2)
  : Math.max(50, requestedHibernationCycles || 50);
const explicitOutput = option('output', '');
const keepProfile = process.argv.includes('--keep-profile');
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-resource-soak-'));
const profileDir = path.join(runRoot, 'profile');
const reportPath = explicitOutput ? path.resolve(explicitOutput) : path.join(runRoot, 'report.json');
fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
function fixturePage(cycle) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Soak ${cycle}</title></head>
<body><main id="fixture"></main><script>
(() => {
  const listeners = [];
  const fixture = document.getElementById('fixture');
  for (let i = 0; i < 120; i++) {
    const button = document.createElement('button');
    button.textContent = 'fixture-' + i;
    const listener = () => i;
    button.addEventListener('click', listener);
    listeners.push(listener);
    fixture.appendChild(button);
  }
  window.__fixtureResourceSnapshot = () => ({ listeners: listeners.length, nodes: fixture.childElementCount });
  window.__fixtureCaptureReady = false;
  setTimeout(async () => {
    try {
      const response = await fetch('/captions.vtt?cycle=${cycle}&auto=1');
      await response.text();
      window.__fixtureCaptureReady = true;
    } catch (_) { window.__fixtureCaptureReady = false; }
  }, 15);
})();
</script></body></html>`;
}
// Video döngüsü fixture'ı: hls.js + gerçek mux.js CEA-608 fMP4 segmentleri ile
// gerçek oynatma. Seek/kalite/altyazı-izi opsları soak döngüsünden tetiklenir.
const MUX = path.join(ROOT, 'node_modules', 'mux.js', 'test', 'segments');
const ceaInit = fs.existsSync(path.join(MUX, 'dash-608-captions-init.mp4'))
  ? fs.readFileSync(path.join(MUX, 'dash-608-captions-init.mp4')) : null;
const ceaSeg = fs.existsSync(path.join(MUX, 'dash-608-captions-seg.m4s'))
  ? fs.readFileSync(path.join(MUX, 'dash-608-captions-seg.m4s')) : null;
const hlsJs = fs.existsSync(path.join(ROOT, 'node_modules', 'hls.js', 'dist', 'hls.min.js'))
  ? fs.readFileSync(path.join(ROOT, 'node_modules', 'hls.js', 'dist', 'hls.min.js')) : null;
function fixtureVideoPage(cycle) {
  return `<!doctype html><meta charset="utf-8"><title>Soak video ${cycle}</title>
<style>body{margin:0;background:#101418}video{width:100%;height:70vh;background:#000}</style>
<video id="v" controls muted></video>
<script src="/hls.js"><\/script>
<script>
const v=document.getElementById('v');
const hls=new Hls({subtitleDisplay:true});
window.__gauntletHls=hls;
hls.on(Hls.Events.SUBTITLE_TRACK_LOADED,()=>{for(const t of v.textTracks)if(t.kind==='subtitles')t.mode='hidden';});
hls.loadSource('/master.m3u8?cycle=${cycle}');hls.attachMedia(v);
v.addEventListener('loadeddata',()=>v.play().catch(()=>{}));
<\/script>`;
}
// Her video döngüsü benzersiz URI'ler kullanır (`?c=N`): sabit URI'lerin aynı
// gövdeyle tekrar sunulması üretim tarafında doğru biçimde dedup'a düşer ve
// döngü "yakalanamadı" olur — bu fixture hatasıdır, ürün hatası değil.
const videoMaster = (c) => '#EXTM3U\n'
  + `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",URI="/sub.m3u8?c=${c}"\n`
  + '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",LANGUAGE="en",NAME="Embedded",INSTREAM-ID="CC1"\n'
  + `#EXT-X-STREAM-INF:BANDWIDTH=800000,SUBTITLES="subs",CLOSED-CAPTIONS="cc"\n/v1.m3u8?c=${c}\n`
  + `#EXT-X-STREAM-INF:BANDWIDTH=400000,SUBTITLES="subs",CLOSED-CAPTIONS="cc"\n/v2.m3u8?c=${c}\n`;
const videoPlaylist = () => '#EXTM3U\n#EXT-X-TARGETDURATION:125\n#EXT-X-MEDIA-SEQUENCE:0\n'
  + '#EXT-X-MAP:URI="/cea-init.mp4"\n#EXTINF:125,\n/cea-seg.m4s\n#EXT-X-ENDLIST\n';
const subPlaylist = (c) => '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n'
  + `#EXTINF:4,\n/sub-0.vtt?c=${c}\n#EXTINF:4,\n/sub-1.vtt?c=${c}\n#EXTINF:4,\n/sub-2.vtt?c=${c}\n#EXT-X-ENDLIST\n`;
const subCue = (c, i) => `WEBVTT\n\n00:00.000 --> 00:04.000\nSoak video ${c} cue ${i}\n`;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/page') {
    const body = fixturePage(Number(url.searchParams.get('cycle')) || 0);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/captions.vtt') {
    const cycle = Number(url.searchParams.get('cycle')) || 0;
    const body = `WEBVTT\n\n00:00.000 --> 00:01.000\nSoak ${cycle} bir\n\n00:01.000 --> 00:02.000\nSoak ${cycle} iki\n`;
    response.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  // 403 yolu: retry/refresh karar yolunu gerçek hata ile çalıştırır.
  if (url.pathname === '/captions-403.vtt') {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('forbidden');
    return;
  }
  if (url.pathname === '/video') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixtureVideoPage(Number(url.searchParams.get('cycle')) || 0));
    return;
  }
  const cyc = Number(url.searchParams.get('c')) || Number(url.searchParams.get('cycle')) || 0;
  const staticFixture = {
    '/hls.js': { body: hlsJs, type: 'text/javascript' },
    '/master.m3u8': { body: videoMaster(cyc), type: 'application/vnd.apple.mpegurl' },
    '/v1.m3u8': { body: videoPlaylist(), type: 'application/vnd.apple.mpegurl' },
    '/v2.m3u8': { body: videoPlaylist(), type: 'application/vnd.apple.mpegurl' },
    '/sub.m3u8': { body: subPlaylist(cyc), type: 'application/vnd.apple.mpegurl' },
    '/sub-0.vtt': { body: subCue(cyc, 0), type: 'text/vtt' },
    '/sub-1.vtt': { body: subCue(cyc, 1), type: 'text/vtt' },
    '/sub-2.vtt': { body: subCue(cyc, 2), type: 'text/vtt' },
    '/cea-init.mp4': { body: ceaInit, type: 'video/mp4' },
    '/cea-seg.m4s': { body: ceaSeg, type: 'video/mp4' },
  }[url.pathname];
  if (staticFixture && staticFixture.body) {
    response.writeHead(200, { 'content-type': staticFixture.type, 'cache-control': 'no-store' });
    response.end(staticFixture.body);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('bulunamadı');
});
// Sahte OpenAI-uyumlu sağlayıcı: çeviri başlat/iptal soak op'ları gerçek
// scheduler + ağ hattını çalıştırsın diye yerel HTTP sunucusu.
const providerServer = http.createServer((req, res) => {
  if (!req.url || !req.url.endsWith('/chat/completions')) { res.writeHead(404); return res.end('yok'); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let source = ''; let pieceCount = 1;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const payload = JSON.parse(body.messages?.at(-1)?.content || '');
      source = String(payload.source ?? payload.metin ?? '');
      pieceCount = Math.max(1, Array.isArray(payload.parts) ? payload.parts.length : 1);
    } catch (_) {}
    const translated = source ? `TR:${source}` : 'TR: çeviri';
    const parts = Array.from({ length: pieceCount }, (_, i) => `${translated}·p${i}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: parts.join(' '), parts }) } }] }));
  });
});
function cleanup() {
  server.close();
  providerServer.close();
  if (!keepProfile) {
    try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch (_) {}
  }
}
server.listen(0, '127.0.0.1', async () => {
  await new Promise((resolve) => providerServer.listen(0, '127.0.0.1', resolve));
  const providerPort = providerServer.address().port;
  // Ayar dosyası spawn'dan önce yazılır — izole profil kendi sağlayıcısıyla açılır.
  fs.writeFileSync(path.join(profileDir, 'settings.json'), JSON.stringify({
    settingsVersion: 3,
    translate: { endpointPreset: 'custom', customBaseUrl: `http://127.0.0.1:${providerPort}/v1`,
      model: 'soak-model', apiKey: '' },
    ui: { translateTo: 'tr', translateWorkers: '1', uiLocale: 'tr' },
  }));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`Soak fixture: ${fixtureUrl}`);
  console.log(`Geçici userData: ${profileDir}`);
  console.log(`Döngü: ${cycles} (+ ${warmup} ısınma) · hibernasyon: ${hibernationCycles}${smoke ? ' · kısa smoke' : ''}`);
  // Windows'ta start.bat PATH'e cuDNN ekler; Linux'ta Electron'u doğrudan
  // node_modules/.bin üzerinden başlatmak aynı etkiyi verir.
  const isWindows = process.platform === 'win32';
  const spawnCmd = isWindows ? 'cmd.exe' : require('electron');
  const spawnArgs = isWindows ? ['/d', '/s', '/c', 'start.bat'] : ['.', '--disable-gpu'];
  const child = spawn(spawnCmd, spawnArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      WHISPER_RESOURCE_SOAK: '1',
      WHISPER_RESOURCE_SOAK_CYCLES: String(cycles),
      WHISPER_RESOURCE_SOAK_WARMUP: String(warmup),
      WHISPER_RESOURCE_SOAK_HIBERNATION_CYCLES: String(hibernationCycles),
      WHISPER_RESOURCE_SOAK_FIXTURE_URL: fixtureUrl,
      WHISPER_RESOURCE_SOAK_OUTPUT: reportPath,
      WHISPER_RESOURCE_SOAK_USER_DATA: profileDir,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  // Watchdog döngü sayısına göre ölçeklenir — video döngüleri daha yavaş.
  const watchdog = setTimeout(() => {
    console.error('Soak watchdog süresi doldu; süreç sonlandırılıyor.');
    child.kill();
  }, Math.max(10 * 60 * 1000, cycles * 8000 + 15 * 60 * 1000));
  child.on('error', error => {
    clearTimeout(watchdog);
    console.error(`Electron başlatılamadı: ${error.message}`);
    cleanup();
    process.exitCode = 1;
  });
  child.on('exit', code => {
    clearTimeout(watchdog);
    let report = null;
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); }
    catch (error) { console.error(`Soak raporu okunamadı: ${error.message}`); }
    if (report) {
      report.meaningful = !smoke && cycles >= 200
        && Number(report.hibernation?.attempts) >= 50;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`Soak raporu: ${reportPath}`);
      console.log(`Sonuç: ${report.verdict && report.verdict.pass ? 'GEÇTİ' : 'KALDI'}`);
      if (!report.meaningful) console.log('Not: kısa smoke yalnız yürütme yolunu doğrular; kaynak bütçesi kanıtı değildir.');
      for (const check of (report.verdict && report.verdict.checks) || []) {
        console.log(`  ${check.pass ? 'OK' : 'FAIL'} ${check.name}: ${check.value} (${check.direction} ${check.budget})`);
      }
    }
    cleanup();
    const valid = code === 0 && report && report.verdict && report.verdict.pass
      && (smoke || report.meaningful !== false);
    if (!valid) process.exitCode = 1;
  });
});
