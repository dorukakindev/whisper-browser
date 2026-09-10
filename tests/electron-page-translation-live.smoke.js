'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const WORLD_ID = 999;
let child = null;
let server = null;
let tempProfile = '';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(intervalMs);
  }
  return null;
}

function client(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(payload.error.message));
    else waiter.resolve(payload.result);
  });
  return {
    socket,
    opened: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
  };
}

async function evaluate(target, expression) {
  const result = await target.call('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function target(port, predicate, timeoutMs = 20000) {
  return waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const rows = response.ok ? await response.json() : [];
      return rows.find(predicate) || null;
    } catch (_) { return null; }
  }, timeoutMs, 200);
}

function copyTranslationProfile(destination) {
  const source = process.env.WHISPER_LIVE_USER_DATA
    || path.join(process.env.APPDATA || '', 'whisper-altyazi');
  assert.ok(source && fs.existsSync(source), 'Canlı çeviri profili bulunamadı.');
  for (const name of ['settings.json', 'secrets.safe.json', 'secrets.safe.json.bak', 'Local State']) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(destination, name));
  }
  assert.ok(fs.existsSync(path.join(destination, 'settings.json')), 'Çeviri ayarları bulunamadı.');
  assert.ok(fs.existsSync(path.join(destination, 'secrets.safe.json')), 'Şifreli anahtar kasası bulunamadı.');
}

async function isolatedState(main, pageUrl) {
  return evaluate(main, `(async () => {
    const req = process.getBuiltinModule('module').createRequire(process.execPath);
    const wc = req('electron').webContents.getAllWebContents().find((entry) => entry.getURL() === ${JSON.stringify('PAGE_URL')});
    if (!wc) return null;
    return wc.executeJavaScriptInIsolatedWorld(${WORLD_ID}, [{ code: \`(() => {
      const state = window.__whisperPageTranslateState;
      if (!state?.refs) return null;
      const active = [...state.refs.values()].filter((ref) => ref.active).map((ref) => ({
        original: ref.originals.join('').replace(/\\s+/g, ' ').trim(),
        translation: String(ref.translation || '').replace(/\\s+/g, ' ').trim(),
        overlay: String(ref.overlay?.textContent || '').replace(/\\s+/g, ' ').trim(),
        hidden: !!ref.overlay?.hidden,
      }));
      return { view: state.view, autoContinue: state.config?.autoContinue !== false, active };
    })()\` }], true);
  })()`.replace(JSON.stringify('PAGE_URL'), JSON.stringify(pageUrl)));
}

async function run() {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Translation acceptance</title>'
    + '<style>body{font:18px/1.5 system-ui;max-width:760px;margin:30px auto}</style></head><body>'
    + '<article><h1>A practical guide to patient observation</h1>'
    + '<p>Careful observation reveals patterns that hurried reading often misses.</p>'
    + '<p>Context from the sentences before and after a passage helps preserve its intended meaning.</p>'
    + '<h2>Working method</h2><p>Translate the argument as a connected whole, then review each paragraph.</p></article>'
    + '<aside>Reader comments should remain outside the article scope.</aside></body></html>';
  server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const pageUrl = `http://127.0.0.1:${server.address().port}/article`;
  const root = path.resolve(__dirname, '..');
  tempProfile = path.join(os.tmpdir(), `whisper-page-live-${randomUUID()}`);
  fs.mkdirSync(tempProfile, { recursive: true });
  copyTranslationProfile(tempProfile);

  const rendererPort = 26000 + Math.floor(Math.random() * 1000);
  const mainPort = 28000 + Math.floor(Math.random() * 1000);
  child = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    `--inspect=${mainPort}`, root, `--remote-debugging-port=${rendererPort}`, `--user-data-dir=${tempProfile}`,
  ], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, WHISPER_RESOURCE_SOAK_USER_DATA: tempProfile },
  });

  const rendererInfo = await target(rendererPort, (entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  const mainInfo = await target(mainPort, () => true, 10000);
  assert.ok(rendererInfo?.webSocketDebuggerUrl, 'Ana renderer DevTools hedefi bulunamadı.');
  assert.ok(mainInfo?.webSocketDebuggerUrl, 'Ana süreç DevTools hedefi bulunamadı.');
  const renderer = client(rendererInfo.webSocketDebuggerUrl);
  const main = client(mainInfo.webSocketDebuggerUrl);
  await Promise.all([renderer.opened, main.opened]);
  await Promise.all([renderer.call('Runtime.enable'), main.call('Runtime.enable')]);

  const ready = await waitFor(() => evaluate(renderer,
    "document.readyState === 'complete' && typeof setWorkspaceMode === 'function' && typeof navigateBrowserFromAddress === 'function'"
  ).catch(() => false), 20000);
  assert.equal(ready, true, 'Uygulama rendererı hazır olmadı.');
  await evaluate(renderer, "(() => { document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('browser', false); setTimeout(() => { if (!player.browserActiveTabId) void showBrowserWorkspace(); }, 0); return true; })()");
  const tabId = await waitFor(() => evaluate(renderer, 'player.browserActiveTabId || null').catch(() => null), 15000);
  assert.ok(tabId, 'Tarayıcı sekmesi oluşturulamadı.');
  const navigation = await evaluate(renderer, `(async () => {
    document.getElementById('browserAddress').value = ${JSON.stringify(pageUrl)};
    return navigateBrowserFromAddress();
  })()`);
  assert.equal(navigation?.ok, true, `Yerel makale açılamadı: ${JSON.stringify(navigation)}`);
  assert.ok(await target(rendererPort, (entry) => entry.type === 'page' && entry.url === pageUrl, 15000),
    'Makale WebContents hedefi bulunamadı.');

  const controls = await evaluate(renderer, `(() => {
    const scope = document.getElementById('browserPageScope');
    scope.value = 'article';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    player.browserPageView = 'both';
    player.browserPageAutoContinue = true;
    renderBrowserPageReport();
    const button = document.getElementById('browserPageTranslate');
    button.click();
    return { visible: getComputedStyle(button).display !== 'none', views: document.querySelectorAll('[data-page-view]').length };
  })()`);
  assert.equal(controls.visible, true, 'Sayfa çevirisi ana eylemi görünür değil.');
  assert.equal(controls.views, 3, 'Üçlü sayfa görünümü seçici eksik.');

  const completed = await waitFor(async () => {
    const state = await evaluate(renderer, `({ busy: player.browserPageTranslateBusy,
      translated: player.browserPageTranslated, failed: player.browserPageFailed,
      error: player.browserPageError, completion: player.browserPageCompletion })`).catch(() => null);
    if (state?.error) throw new Error(`Canlı sayfa çevirisi hatası: ${state.error}`);
    return state && !state.busy && state.translated > 0 ? state : null;
  }, 60000, 300);
  assert.ok(completed, 'Canlı sayfa çevirisi tamamlanmadı.');
  assert.equal(completed.failed, 0, `Bazı bloklar çevrilemedi: ${JSON.stringify(completed)}`);

  const both = await isolatedState(main, pageUrl);
  assert.equal(both?.view, 'both', 'İki dilli görünüm uygulanmadı.');
  assert.ok(both.active.length >= 3, 'Makaledeki yeterli sayıda blok çevrilmedi.');
  assert.ok(both.active.every((row) => row.translation && row.translation !== row.original), 'Bir blok kaynak metin olarak kaldı.');
  assert.ok(both.active.every((row) => row.overlay === row.translation && !row.hidden), 'Çeviri katmanı görünür değil.');

  await evaluate(renderer, "document.querySelector('[data-page-view=translation]').click()");
  assert.ok(await waitFor(async () => (await isolatedState(main, pageUrl))?.view === 'translation', 5000),
    'Yalnız çeviri görünümü çalışmadı.');
  await evaluate(renderer, "document.querySelector('[data-page-view=original]').click()");
  assert.ok(await waitFor(async () => (await isolatedState(main, pageUrl))?.view === 'original', 5000),
    'Orijinal görünüm çalışmadı.');
  await evaluate(renderer, "document.getElementById('browserPageAutoContinue').click()");
  assert.ok(await waitFor(async () => (await isolatedState(main, pageUrl))?.autoContinue === false, 5000),
    'Otomatik devam kapatılamadı.');

  console.log('electron-page-translation-live: ' + JSON.stringify({
    translated: completed.translated, failed: completed.failed, activeDomBlocks: both.active.length,
    views: ['both', 'translation', 'original'], autoContinueDisabled: true, isolatedProfile: true,
  }));
  renderer.socket.close();
  main.socket.close();
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (child && child.exitCode == null) {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(3000),
    ]);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tempProfile && path.basename(tempProfile).startsWith('whisper-page-live-')) {
    fs.rmSync(tempProfile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  }
});
