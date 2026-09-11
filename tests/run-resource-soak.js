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
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('bulunamadı');
});
function cleanup() {
  server.close();
  if (!keepProfile) {
    try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch (_) {}
  }
}
server.listen(0, '127.0.0.1', () => {
  const fixtureUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`Soak fixture: ${fixtureUrl}`);
  console.log(`Geçici userData: ${profileDir}`);
  console.log(`Döngü: ${cycles} (+ ${warmup} ısınma)${smoke ? ' · kısa smoke' : ''}`);
  const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start.bat'], {
    cwd: ROOT,
    env: {
      ...process.env,
      WHISPER_RESOURCE_SOAK: '1',
      WHISPER_RESOURCE_SOAK_CYCLES: String(cycles),
      WHISPER_RESOURCE_SOAK_WARMUP: String(warmup),
      WHISPER_RESOURCE_SOAK_FIXTURE_URL: fixtureUrl,
      WHISPER_RESOURCE_SOAK_OUTPUT: reportPath,
      WHISPER_RESOURCE_SOAK_USER_DATA: profileDir,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const watchdog = setTimeout(() => {
    console.error('Soak 10 dakika içinde tamamlanmadı; süreç sonlandırılıyor.');
    child.kill();
  }, 10 * 60 * 1000);
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
      report.meaningful = !smoke && cycles >= 200;
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
