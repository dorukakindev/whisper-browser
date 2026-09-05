'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

let electronProcess = null;
let server = null;
let userDataDir = '';

function silentWav(seconds = 12, sampleRate = 8000) {
  const samples = Math.max(1, Math.round(seconds * sampleRate));
  const dataBytes = samples * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVEfmt ', 8, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  return output;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı.`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.id && pending.has(payload.id)) {
      const waiter = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) waiter.reject(new Error(payload.error.message));
      else waiter.resolve(payload.result);
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails || {};
      exceptions.push(details.exception?.description || details.text || 'Bilinmeyen renderer istisnası');
    }
  });
  return {
    socket,
    exceptions,
    opened: withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }), 5000, 'DevTools bağlantısı'),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression, timeout = 15000) {
  const result = await withTimeout(client.call('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  }), timeout, 'Runtime değerlendirmesi');
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(predicate, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function run() {
  const wav = silentWav();
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:11.500\nElectron tarayıcı altyazısı\n';
  server = http.createServer((request, response) => {
    if (request.url === '/captions.vtt') {
      response.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(vtt);
      return;
    }
    if (request.url === '/silence.wav') {
      const match = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range || '');
      if (match) {
        const start = Math.min(wav.length - 1, Number(match[1]));
        const end = match[2] ? Math.min(wav.length - 1, Number(match[2])) : wav.length - 1;
        response.writeHead(206, {
          'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${wav.length}`,
          'Content-Length': end - start + 1,
        });
        response.end(wav.subarray(start, end + 1));
      } else {
        response.writeHead(200, {
          'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': wav.length,
        });
        response.end(wav);
      }
      return;
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Subtitle smoke</title>
      <style>body{margin:0;background:#111;color:#fff}video{display:block;width:640px;height:360px;background:#000}</style>
      </head><body><video controls muted autoplay preload="auto" crossorigin="anonymous">
      <source src="/silence.wav" type="audio/wav"><track kind="subtitles" src="/captions.vtt" srclang="en" label="English" default>
      </video><script>const v=document.querySelector('video');const t=v.textTracks[0];t.mode='showing';v.play().catch(()=>{});</script>
      </body></html>`;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const siteUrl = `http://127.0.0.1:${server.address().port}/`;

  const projectRoot = path.resolve(__dirname, '..');
  userDataDir = path.join(os.tmpdir(), `whisper-local-browser-profile-${randomUUID()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const devtoolsPort = 20000 + Math.floor(Math.random() * 1000);
  electronProcess = spawn(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    projectRoot, `--remote-debugging-port=${devtoolsPort}`, `--user-data-dir=${userDataDir}`,
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });

  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error(`Electron erken kapandı: ${electronProcess.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
      return response.ok ? response.json() : null;
    } catch (_) { return null; }
  }, 20000, 300);
  assert.ok(targets, 'Electron DevTools hedefi açılmadı.');
  const rendererTarget = targets.find((entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  assert.ok(rendererTarget?.webSocketDebuggerUrl, 'Ana renderer hedefi bulunamadı.');
  const renderer = createCdpClient(rendererTarget.webSocketDebuggerUrl);
  await renderer.opened;
  await renderer.call('Runtime.enable');

  const ready = await waitFor(async () => evaluate(renderer,
    "document.readyState === 'complete' && typeof setWorkspaceMode === 'function' && typeof useBrowserTrack === 'function'",
    3000).catch(() => false), 20000);
  assert.equal(ready, true, 'Renderer tarayıcı yüzeyi hazır olmadı.');

  await evaluate(renderer, `(() => {
    player.browserCaptureEnabled = true;
    document.getElementById('playerLayer').classList.remove('hidden');
    setWorkspaceMode('browser', false);
    return true;
  })()`);
  const workspace = await waitFor(async () => evaluate(renderer, `(() => ({
    tabId: player.browserActiveTabId,
    signal: document.getElementById('browserSignalText')?.textContent || ''
  }))()`, 3000).then((value) => value.tabId ? value : null).catch(() => null), 15000);
  if (!workspace?.tabId) {
    const diagnostics = await evaluate(renderer, `(() => {
      const snapshot = (id) => {
        const element = document.getElementById(id);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          className: element.className,
          display: getComputedStyle(element).display,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      };
      return {
        mode: player.workspaceMode,
        slotBounds: browserSlotBounds(),
        layer: snapshot('playerLayer'),
        body: snapshot('playerLayer')?.rect,
        workspace: snapshot('browserWorkspace'),
        slot: snapshot('browserViewSlot'),
        signal: document.getElementById('browserSignalText')?.textContent || '',
      };
    })()`);
    assert.fail(`Browser çalışma alanı açılmadı: ${JSON.stringify({ diagnostics, exceptions: renderer.exceptions })}`);
  }

  const navigation = await evaluate(renderer, `(async () => {
    document.getElementById('browserAddress').value = ${JSON.stringify(siteUrl)};
    return Promise.race([
      navigateBrowserFromAddress(),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 15000))
    ]);
  })()`, 20000);
  assert.equal(navigation?.ok, true, `Browser gezinme başarısız: ${JSON.stringify(navigation)}`);

  const track = await waitFor(async () => evaluate(renderer, `(() => {
    const item = player.browserTracks.find((candidate) => Number(candidate.cueCount) > 0 || (candidate.cues || []).length > 0);
    return item ? { id: item.id, label: item.label, cueCount: item.cueCount, role: item.role || 'source' } : null;
  })()`, 3000).catch(() => null), 25000);
  assert.ok(track?.id, 'Browser WebVTT izi yakalanmadı.');

  const browserResult = await evaluate(renderer, `(async () => {
    const trackId = ${JSON.stringify(track.id)};
    document.getElementById('browserTrackSelect').value = trackId;
    await Promise.race([
      useBrowserTrack(false, trackId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('İz yükleme zaman aşımı')), 15000))
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      ok: player.browserLoadedTrackId === trackId
        && player.cues.some((cue) => cue.text.includes('Electron tarayıcı altyazısı')),
      stage: 'loaded',
      tabId: player.browserActiveTabId,
      track: ${JSON.stringify(track)},
      selected: document.getElementById('browserTrackSelect').value,
      playerText: player.cues.map((cue) => cue.text).join(' | '),
      subRole: player.subRole,
    };
  })()`, 20000);
  console.log('Electron browser capture result:', JSON.stringify(browserResult));
  assert.equal(browserResult?.ok, true, JSON.stringify(browserResult));
  assert.match(browserResult.playerText, /Electron tarayıcı altyazısı/u);
  assert.equal(browserResult.subRole, 'source');
  assert.equal(browserResult.selected, browserResult.track.id);
  assert.equal(renderer.exceptions.length, 0, `Renderer istisnaları: ${renderer.exceptions.join(' | ')}`);

  const browserTargets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
  const pageTarget = browserTargets.find((entry) => entry.type === 'page' && entry.url === siteUrl);
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'WebContentsView sayfa hedefi bulunamadı.');
  const page = createCdpClient(pageTarget.webSocketDebuggerUrl);
  await page.opened;
  await page.call('Runtime.enable');
  const overlay = await waitFor(async () => evaluate(page, `(() => {
    const root = document.getElementById('__whisper_browser_subtitles');
    return root ? { exists: true, text: root.textContent || '', display: getComputedStyle(root).display } : null;
  })()`, 3000).catch(() => null), 10000);
  console.log('Electron browser overlay result:', JSON.stringify(overlay));
  assert.equal(overlay?.exists, true, 'Browser overlay kökü oluşmadı.');
  assert.match(overlay.text, /Electron tarayıcı altyazısı/u);
  assert.notEqual(overlay.display, 'none');

  page.socket.close();
  renderer.socket.close();
}

async function cleanup() {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
  }
  electronProcess = null;
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  if (userDataDir) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
  userDataDir = '';
}

run().then(async () => {
  await cleanup();
  console.log('electron-browser-subtitle-smoke: passed');
}).catch(async (error) => {
  await cleanup();
  console.error(error.stack || error.message);
  process.exit(1);
});
