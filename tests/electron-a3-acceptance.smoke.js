'use strict';

// A3 kabul matrisi — 56 A sınıfı düzeltmenin gerçek Electron yolları:
//   1. Ana pencere render-process-gone kurtarma diyaloğu + yeniden yükleme
//   2. Ana pencere unresponsive kurtarma diyaloğu (10 sn bekleyiş)
//   3. Sekme kapatma koruması (form verisi + sabitlenmiş sekme)
//   4. Altyazı ofsetinin doğru sekmeye uygulanması (eski sekme reddi)
//   5. playbackRate'in gerçek IPC üzerinden uygulanması + site sıfırlamasına karşı koruma
//   6. cancelTooLate terminal durumu (renderer 'iptal yetişemedi' yolu)
//   7. browser-session paket içe aktarma + yeniden başlatma + grant reddi
//   + manga stale-edit rollback (sayfa overlay'i depo değerine geri döner)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { findMediaTool } = require('./media-runtime');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');

let electronProcess = null;
let server = null;
let userDataDir = '';
let fixtureDir = '';

const ISOLATED_WORLD_ID = 999;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out.')), ms);
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
      exceptions.push(details.exception?.description || details.text || 'Unknown renderer exception');
    }
  });
  return {
    socket,
    exceptions,
    opened: withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }), 5000, 'DevTools connection'),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function closeCdpClient(client) {
  const socket = client?.socket;
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    socket.addEventListener('close', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    try { socket.close(); } catch (_) { clearTimeout(timer); resolve(); }
  });
}

async function evaluate(client, expression, timeout = 15000, extra = {}) {
  const result = await withTimeout(client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    ...extra,
  }), timeout, 'Runtime evaluation: ' + String(expression).replace(/\s+/gu, ' ').slice(0, 96));
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(predicate, timeoutMs, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(intervalMs);
  }
  return null;
}

async function openBrowserWorkspace(renderer, siteUrl) {
  const ready = await waitFor(async () => evaluate(renderer,
    "document.readyState === 'complete' && typeof setWorkspaceMode === 'function' && typeof browserCommand === 'function'",
    3000).catch(() => false), 20000);
  assert.equal(ready, true, 'Main renderer did not become ready.');
  await evaluate(renderer, "(() => { document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('browser', false); setTimeout(() => { if(!player.browserActiveTabId) void showBrowserWorkspace(); }, 0); return true; })()");
  const tabId = await waitFor(async () => evaluate(renderer,
    "player.browserActiveTabId || ''", 3000).catch(() => ''), 15000);
  assert.ok(tabId, 'Browser workspace did not create an active tab.');
  const navigation = await evaluate(renderer,
    "(async () => { document.getElementById('browserAddress').value = " + JSON.stringify(siteUrl)
      + "; return Promise.race([navigateBrowserFromAddress(), new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 15000))]); })()",
    20000);
  assert.equal(navigation?.ok, true, 'Local browser navigation failed: ' + JSON.stringify(navigation));
  return tabId;
}

async function pageTarget(devtoolsPort, url) {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
      const list = response.ok ? await response.json() : [];
      return list.find((entry) => entry.type === 'page' && entry.url === url) || null;
    } catch (_) {
      return null;
    }
  }, 15000, 200);
  assert.ok(target?.webSocketDebuggerUrl, 'WebContentsView page target was not found for ' + url);
  const client = createCdpClient(target.webSocketDebuggerUrl);
  await client.opened;
  await client.call('Runtime.enable');
  return client;
}

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-a3-'));
  const ffmpeg = findMediaTool('ffmpeg') || 'ffmpeg';
  const videoFixture = path.join(fixtureDir, 'timeline.mp4');
  const imageFixture = path.join(fixtureDir, 'manga.png');
  const madeVideo = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=320x180:rate=24:duration=4', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-y', videoFixture,
  ], { windowsHide: true });
  assert.equal(madeVideo.status, 0, 'Video fixture üretilemedi: ' + (madeVideo.stderr?.toString() || ''));
  const madeImage = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=800x1200:rate=1:duration=1', '-frames:v', '1', '-y', imageFixture,
  ], { windowsHide: true });
  assert.equal(madeImage.status, 0, 'Manga görsel fixture üretilemedi: ' + (madeImage.stderr?.toString() || ''));

  const mangaRegion = {
    text_box: [80, 60, 180, 300], bubble_box: [60, 40, 200, 340],
    source: 'Hello there', translation: 'Merhaba dünya', kind: 'speech', shape: 'rect',
  };
  const mangaApiReply = JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ regions: [mangaRegion] }) } }],
  });

  server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/chat/completions') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(mangaApiReply);
      });
      return;
    }
    if (request.url === '/manga.png') {
      const body = fs.readFileSync(imageFixture);
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      response.end(body);
      return;
    }
    if (request.url === '/timeline.mp4') {
      const body = fs.readFileSync(videoFixture);
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range || '');
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(body.length - 1, range[2] ? Number(range[2]) : body.length - 1);
        response.writeHead(206, {
          'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${body.length}`,
          'Content-Length': end - start + 1,
        });
        response.end(body.subarray(start, end + 1));
      } else {
        response.writeHead(200, { 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Content-Length': body.length });
        response.end(body);
      }
      return;
    }
    if (request.url === '/other') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><title>İkinci sekme</title><main>başka sayfa</main>');
      return;
    }
    // Manga aday taraması isSafeMangaImageUrl ile localhost http adresini
    // reddeder; data-URI kaynağı desteklenen güvenli yoldur.
    const mangaDataUri = 'data:image/png;base64,' + fs.readFileSync(imageFixture).toString('base64');
    const html = [
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A3 kabul sayfası</title>',
      '<style>body{margin:0;background:#111;color:#eee} video{width:640px;height:360px;background:#000} .reader img{width:640px;height:960px;display:block}</style>',
      '</head><body>',
      '<input id="note" type="text" placeholder="taslak">',
      '<video id="v" controls muted preload="auto"><source src="/timeline.mp4" type="video/mp4"></video>',
      '<div class="reader"><img id="manga-img" src="' + mangaDataUri + '" alt="chapter page"></div>',
      '</body></html>',
    ].join('');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const siteUrl = 'http://127.0.0.1:' + server.address().port + '/';

  // Manga çevirisi için localhost mock endpoint'i — API anahtarı gerektirmez.
  userDataDir = path.join(os.tmpdir(), 'whisper-a3-' + randomUUID());
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    settingsVersion: 3, glossary: [],
    ui: { browserHardwareAcceleration: false },
    manga: { endpointPreset: 'custom', customBaseUrl: `http://127.0.0.1:${server.address().port}` },
  }));

  const devtoolsPort = 23000 + Math.floor(Math.random() * 1000);
  const mainInspectPort = 25000 + Math.floor(Math.random() * 1000);
  const electronEnv = { ...process.env, WHISPER_RESOURCE_SOAK_USER_DATA: userDataDir };
  // CI/ajan oturumları ELECTRON_RUN_AS_NODE=1 ile gelebiliyor; Electron bunu
  // görürse saf Node olarak açılır ve app undefined kalır.
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  // Linux'ta Electron altından spawn edilen ikinci Electron örneğinin zygote
  // süreçleri SIGTRAP ile düşüyor (konteyner kısıtı); renderer/gpu hiç
  // başlayamıyor. --no-zygote zygote'u tamamen devre dışı bırakır; yalnızca
  // test çocuğuna uygulanır, ürün kodu ve Windows koşusu etkilenmez.
  const childLinuxArgs = process.platform === 'linux'
    ? ['--no-sandbox', '--no-zygote', '--disable-gpu']
    : [];
  electronProcess = spawn(process.execPath, [
    '--inspect=' + mainInspectPort,
    ...childLinuxArgs,
    projectRoot,
    '--remote-debugging-port=' + devtoolsPort,
    '--user-data-dir=' + userDataDir,
  ], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: electronEnv,
  });

  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron exited early: ' + electronProcess.exitCode);
    try {
      const response = await fetch('http://127.0.0.1:' + devtoolsPort + '/json/list');
      return response.ok ? response.json() : null;
    } catch (_) {
      return null;
    }
  }, 20000, 250);
  assert.ok(targets, 'Electron DevTools target did not open.');
  const rendererTarget = targets.find((entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  assert.ok(rendererTarget?.webSocketDebuggerUrl, 'Main renderer target was not found.');
  const renderer = createCdpClient(rendererTarget.webSocketDebuggerUrl);
  await renderer.opened;
  await renderer.call('Runtime.enable');

  const mainTarget = await waitFor(async () => {
    try {
      const response = await fetch('http://127.0.0.1:' + mainInspectPort + '/json/list');
      const list = response.ok ? await response.json() : [];
      return list[0] || null;
    } catch (_) {
      return null;
    }
  }, 10000, 100);
  assert.ok(mainTarget?.webSocketDebuggerUrl, 'Electron main-process inspector target was not found.');
  const main = createCdpClient(mainTarget.webSocketDebuggerUrl);
  await main.opened;
  await main.call('Runtime.enable');

  const requirePath = JSON.stringify(path.join(projectRoot, 'package.json'));
  const mainEval = (body, timeout = 15000) => evaluate(main, `(async () => {
    const req = process.getBuiltinModule('module').createRequire(${requirePath});
    const electron = req('electron');
    return (${body})(electron);
  })()`, timeout);

  // === Ana süreç enstrümantasyonu: diyalog/restart casusları ===
  const instrumented = await mainEval(`(electron) => {
    globalThis.__a3 = { dialogs: [], reloads: 0, relaunch: 0, exits: [], openDialogPath: '', nextResponse: 0 };
    electron.dialog.showMessageBox = async (win, opts) => {
      globalThis.__a3.dialogs.push({ title: String(opts?.title || ''), buttons: opts?.buttons || [] });
      return { response: globalThis.__a3.nextResponse };
    };
    electron.dialog.showOpenDialog = async () => (
      { canceled: false, filePaths: [globalThis.__a3.openDialogPath || ''] });
    electron.app.relaunch = () => { globalThis.__a3.relaunch += 1; };
    electron.app.exit = (code) => { globalThis.__a3.exits.push(code); };
    const wc = electron.BrowserWindow.getAllWindows()[0].webContents;
    const originalReload = wc.reload.bind(wc);
    wc.reload = () => { globalThis.__a3.reloads += 1; };
    globalThis.__a3.mainWc = wc;
    return !!wc;
  }`);
  assert.equal(instrumented, true, 'Ana süreç enstrümantasyonu kurulamadı.');

  // === Yol 1: ana pencere render-process-gone kurtarması ===
  await evaluate(main, "(() => { globalThis.__a3.nextResponse = 0; globalThis.__a3.mainWc.emit('render-process-gone', {}, { reason: 'crashed' }); return true; })()");
  const crashDialog = await waitFor(async () => evaluate(main,
    "globalThis.__a3.dialogs.find((d) => d.title === 'Arayüz çöktü') || null", 2000).catch(() => null), 10000);
  assert.ok(crashDialog, 'render-process-gone kurtarma diyaloğu gösterilmedi.');
  assert.deepEqual(crashDialog.buttons, ['Arayüzü yeniden yükle', 'Uygulamayı kapat']);
  const reloadedAfterCrash = await waitFor(async () => evaluate(main,
    'globalThis.__a3.reloads', 2000).catch(() => 0).then((count) => count >= 1), 8000);
  assert.equal(reloadedAfterCrash, true, 'Kurtarma diyaloğu onayında ana pencere yeniden yüklenmedi.');

  // === Yol 2: ana pencere unresponsive kurtarması ===
  await evaluate(main, "(() => { globalThis.__a3.nextResponse = 1; globalThis.__a3.mainWc.emit('unresponsive'); return true; })()");
  const unresponsiveDialog = await waitFor(async () => evaluate(main,
    "globalThis.__a3.dialogs.find((d) => d.title === 'Arayüz yanıt vermiyor') || null", 2000).catch(() => null), 16000, 250);
  assert.ok(unresponsiveDialog, 'unresponsive kurtarma diyaloğu 10 sn penceresinde gösterilmedi.');
  assert.deepEqual(unresponsiveDialog.buttons, ['Beklemeye devam et', 'Arayüzü yeniden yükle']);
  const reloadedAfterUnresponsive = await waitFor(async () => evaluate(main,
    'globalThis.__a3.reloads', 2000).catch(() => 0).then((count) => count >= 2), 8000);
  assert.equal(reloadedAfterUnresponsive, true, 'unresponsive diyaloğunda yeniden yükleme seçimi uygulanmadı.');

  // === Tarayıcı workspace + sekme kurulumu ===
  const tabA = await openBrowserWorkspace(renderer, siteUrl);
  const pageA = await pageTarget(devtoolsPort, siteUrl);

  // === Yol 4: altyazı ofseti doğru sekmeye uygulanır ===
  // Gerçek yol: renderer senkronu (scheduleBrowserOverlaySync) aktif sekmenin
  // offset'ini browser:setOverlay üzerinden ana sürece yazar; sekme kaydı
  // snapshot'ta görünür.
  const offsetWrittenA = await waitFor(async () => {
    await evaluate(renderer,
      "(() => { if (player.browserActiveTabId !== " + JSON.stringify(tabA) + ") return 'inactive';"
        + " player.offset = 2.5; scheduleBrowserOverlaySync(); return 'set'; })()", 5000).catch(() => 'err');
    return evaluate(renderer,
      "(async () => (await window.api.getBrowserState()).tabs.find((t) => t.id === " + JSON.stringify(tabA) + ")?.offset)()",
      5000).then((v) => v === 2.5).catch(() => false);
  }, 10000, 300);
  assert.equal(offsetWrittenA, true, 'Aktif sekmenin ofseti sekme kaydına yazılmadı.');
  // Gerçek UI yolu: renderer createBrowserTab() kendi sekme durumunu da eşitler.
  const tabB = await evaluate(renderer,
    `(async () => {
      const tab = await createBrowserTab();
      if (!tab?.id) return { error: 'sekme açılamadı' };
      document.getElementById('browserAddress').value = ${JSON.stringify(siteUrl + 'other')};
      const nav = await navigateBrowserFromAddress();
      return { id: tab.id, nav: nav?.ok === true, navError: nav?.error || '' };
    })()`, 30000);
  assert.ok(tabB?.id && tabB.nav === true, 'İkinci sekme oluşturulamadı/gezdirilemedi: ' + JSON.stringify(tabB));
  await pageTarget(devtoolsPort, siteUrl + 'other');
  // Sekme değişimi renderer senkronunu tetikler — player.offset aktif sekmeye
  // aittir; B için yeni değer verip senkronu çalıştır. Gezinme olay işleyicisi
  // player.offset'i sıfırlayabilir; değer kayda düşene dek yeniden kur.
  const offsetWrittenB = await waitFor(async () => {
    await evaluate(renderer,
      "(() => { if (player.browserActiveTabId !== " + JSON.stringify(tabB.id) + ") return 'inactive';"
        + " player.offset = -1.5; scheduleBrowserOverlaySync(); return 'set'; })()", 5000).catch(() => 'err');
    return evaluate(renderer,
      "(async () => (await window.api.getBrowserState()).tabs.find((t) => t.id === " + JSON.stringify(tabB.id) + ")?.offset)()",
      5000).then((v) => v === -1.5).catch(() => false);
  }, 10000, 300);
  if (!offsetWrittenB) {
    const diag = await evaluate(renderer,
      "(() => ({ active: player.browserActiveTabId, offset: player.offset, mode: player.workspaceMode,"
        + " tabs: (player.browserTabs || []).map((t) => ({ id: t.id, offset: t.offset })) }))()", 5000).catch((e) => String(e));
    assert.fail('Sekme B ofseti sekme kaydına yazılmadı. ' + JSON.stringify(diag));
  }
  const staleOverlay = await evaluate(renderer,
    "(async () => window.api.setBrowserOverlay(" + JSON.stringify(tabA)
      + ", { offset: 9, mode: 'source', source: [], translation: [] }))()", 10000);
  assert.equal(staleOverlay?.ok, false, 'Eski sekme overlay isteği reddedilmedi: ' + JSON.stringify(staleOverlay));
  const tabOffsets = await evaluate(renderer,
    "(async () => (await window.api.getBrowserState()).tabs.map((t) => ({ id: t.id, offset: t.offset })))()", 10000);
  const offsetA = tabOffsets.find((t) => t.id === tabA)?.offset;
  const offsetB = tabOffsets.find((t) => t.id === tabB.id)?.offset;
  assert.equal(offsetA, 2.5, 'Sekme A ofseti bozuldu (eski sekme isteği yazmış olabilir): ' + JSON.stringify(tabOffsets));
  assert.equal(offsetB, -1.5, 'Sekme B ofseti kaydedilmedi: ' + JSON.stringify(tabOffsets));

  // === Yol 3: sekme kapatma koruması ===
  await evaluate(pageA,
    "(() => { const i = document.getElementById('note'); i.value = 'kaydedilmemiş taslak'; i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; })()");
  const pinnedSet = await evaluate(renderer,
    "(async () => window.api.setBrowserTabPinned(" + JSON.stringify(tabA) + ", true))()", 10000);
  assert.equal(pinnedSet?.ok, true, 'Sekme sabitlenemedi: ' + JSON.stringify(pinnedSet));
  const pinnedClose = await evaluate(renderer,
    "(async () => window.api.closeBrowserTab(" + JSON.stringify(tabA) + ", false))()", 15000);
  assert.equal(pinnedClose?.requiresConfirmation, true, 'Sabitlenmiş sekme onaysız kapatıldı: ' + JSON.stringify(pinnedClose));
  assert.equal(pinnedClose?.pinned, true, 'Koruma nedeni sabit sekme değil: ' + JSON.stringify(pinnedClose));
  await evaluate(renderer,
    "(async () => window.api.setBrowserTabPinned(" + JSON.stringify(tabA) + ", false))()", 10000);
  const formClose = await evaluate(renderer,
    "(async () => window.api.closeBrowserTab(" + JSON.stringify(tabA) + ", false))()", 15000);
  assert.equal(formClose?.requiresConfirmation, true, 'Form verisi olan sekme onaysız kapatıldı: ' + JSON.stringify(formClose));
  assert.equal(Array.isArray(formClose?.reasons) && formClose.reasons.includes('form_or_login'), true,
    'Koruma nedeni form_or_login değil: ' + JSON.stringify(formClose));
  const forceClosed = await evaluate(renderer,
    "(async () => window.api.closeBrowserTab(" + JSON.stringify(tabA) + ", true))()", 15000);
  assert.equal(forceClosed?.ok, true, 'Zorla kapatma reddedildi: ' + JSON.stringify(forceClosed));
  const remainingTabs = await evaluate(renderer,
    "(async () => (await window.api.getBrowserState()).tabs.map((t) => t.id))()", 10000);
  assert.equal(remainingTabs.includes(tabA), false, 'Zorla kapatılan sekme listede kaldı.');
  assert.equal(remainingTabs.includes(tabB.id), true, 'Yanlış sekme kapatıldı.');

  // Sekme B'yi zengin sayfaya taşı (video + manga görseli) — gerçek UI yolu
  const navB = await evaluate(renderer,
    `(async () => {
      document.getElementById('browserAddress').value = ${JSON.stringify(siteUrl)};
      const nav = await navigateBrowserFromAddress();
      return { ok: nav?.ok === true, active: player.browserActiveTabId, error: nav?.error || '' };
    })()`, 30000);
  assert.equal(navB?.ok, true, 'Sekme B ana sayfaya taşınamadı: ' + JSON.stringify(navB));
  assert.equal(navB.active, tabB.id, 'Gezinme beklenmeyen sekmeye gitti: ' + JSON.stringify(navB));
  const pageB = await pageTarget(devtoolsPort, siteUrl);
  await evaluate(pageB,
    "new Promise((resolve) => { const v = document.getElementById('v'); if (!v || v.readyState >= 1) return resolve(true); v.addEventListener('loadedmetadata', () => resolve(true), { once: true }); setTimeout(() => resolve(false), 8000); })",
    12000);

  // === Yol 5: kayıtlı playbackRate uygulaması + site sıfırlamasına karşı koruma ===
  const rateResult = await evaluate(renderer,
    "(async () => window.api.browserCommand(" + JSON.stringify(tabB.id)
      + ", 'media-preference', { rate: 1.75, enforceRate: true, preservesPitch: true }))()", 15000);
  assert.equal(rateResult?.ok, true, 'media-preference komutu reddedildi: ' + JSON.stringify(rateResult));
  const appliedRate = await evaluate(pageB,
    "(() => { const v = document.getElementById('v'); return v ? v.playbackRate : null; })()");
  assert.equal(appliedRate, 1.75, 'playbackRate gerçek sayfa medyasına uygulanmadı: ' + JSON.stringify({ rateResult, appliedRate }));
  const fightback = await evaluate(pageB, `(async () => {
    const v = document.getElementById('v');
    v.playbackRate = 1;
    v.dispatchEvent(new Event('ratechange'));
    await new Promise((resolve) => setTimeout(resolve, 120));
    return v.playbackRate;
  })()`);
  assert.equal(fightback, 1.75, 'enforceRate site sıfırlamasına karşı hızı geri alamadı.');

  // === Manga stale-edit rollback (izole dünya köprüsü) ===
  await evaluate(renderer, `(() => { window.__mangaRejected = 0; window.__mangaAccepted = 0;
    window.api.onBrowserEvent((e) => {
      if (e?.type === 'manga-edit-rejected') window.__mangaRejected += 1;
      if (e?.type === 'manga-edit') window.__mangaAccepted += 1;
    }); return true; })()`);
  const mangaStarted = await evaluate(renderer,
    "(async () => window.api.startBrowserManga(" + JSON.stringify(tabB.id) + ", { maxImages: 1 }))()", 90000);
  assert.equal(mangaStarted?.ok, true, 'Manga çevirisi mock endpoint ile tamamlanamadı: ' + JSON.stringify(mangaStarted));

  const mangaWc = await mainEval(`(electron) => {
    const wc = electron.webContents.getAllWebContents().find((entry) => entry.getURL() === ${JSON.stringify(siteUrl)});
    return wc ? wc.id : null;
  }`);
  assert.ok(mangaWc, 'Manga sayfası webContents bulunamadı.');
  const runIsolated = (code, timeout = 15000) => evaluate(main, `(async () => {
      const req = process.getBuiltinModule('module').createRequire(${requirePath});
      const wc = req('electron').webContents.fromId(${mangaWc});
      return wc.executeJavaScriptInIsolatedWorld(${ISOLATED_WORLD_ID}, [{ code: ${JSON.stringify(code)} }], true);
    })()`, timeout);

  const mangaState = await runIsolated(`(() => {
    const s = window.__whisperMangaOverlay;
    const region = document.querySelector('[data-whisper-manga-region]');
    return { hasState: !!s, token: s?.bridgeToken || '', imageId: region?.dataset.imageId || '',
      index: Number(region?.dataset.index), translation: region?.dataset.translation || '',
      text: region?.querySelector('[data-whisper-manga-text]')?.textContent || '' };
  })()`);
  assert.equal(mangaState?.hasState, true, 'Manga overlay state izole dünyada kurulmadı: ' + JSON.stringify(mangaState));
  assert.ok(mangaState.token, 'Manga bridgeToken okunamadı.');
  const storedTranslation = mangaState.translation;
  assert.ok(storedTranslation.length > 0, 'Manga bölge çevirisi boş.');

  // Kabul edilen düzenleme: depo 'edit-1'e geçer.
  const acceptScript = `(() => {
    const s = window.__whisperMangaOverlay;
    const region = document.querySelector('[data-whisper-manga-region]');
    region.dataset.translation = 'edit-1';
    region.querySelector('[data-whisper-manga-text]').textContent = 'edit-1';
    return globalThis.__whisperTrustedBridgeSend('manga-edit', {
      id: ${JSON.stringify(mangaState.imageId)}, index: ${mangaState.index},
      translation: 'edit-1', pre: ${JSON.stringify(storedTranslation)}, preHidden: false,
      bridgeToken: s.bridgeToken,
    });
  })()`;
  assert.equal(await runIsolated(acceptScript), true, 'Manga düzenleme köprüsü mesajı reddedildi.');
  const accepted = await waitFor(async () => evaluate(renderer, 'window.__mangaAccepted', 2000).catch(() => 0).then((n) => n >= 1), 5000);
  assert.equal(accepted, true, 'Geçerli manga düzenlemesi depolanmadı.');

  // Eski düzenleme: pre, depodaki 'edit-1' ile uyuşmuyor → ret + DOM geri alınmalı.
  const staleScript = `(() => {
    const s = window.__whisperMangaOverlay;
    const region = document.querySelector('[data-whisper-manga-region]');
    region.dataset.translation = 'stale-edit';
    region.querySelector('[data-whisper-manga-text]').textContent = 'stale-edit';
    return globalThis.__whisperTrustedBridgeSend('manga-edit', {
      id: ${JSON.stringify(mangaState.imageId)}, index: ${mangaState.index},
      translation: 'stale-edit', pre: ${JSON.stringify(storedTranslation)}, preHidden: false,
      bridgeToken: s.bridgeToken,
    });
  })()`;
  assert.equal(await runIsolated(staleScript), true, 'Stale manga düzenleme mesajı gönderilemedi.');
  const rejected = await waitFor(async () => evaluate(renderer, 'window.__mangaRejected', 2000).catch(() => 0).then((n) => n >= 1), 5000);
  assert.equal(rejected, true, 'Stale manga düzenlemesi manga-edit-rejected olayı üretmedi.');
  const reverted = await waitFor(async () => runIsolated(
    "(() => { const r = document.querySelector('[data-whisper-manga-region]'); return r ? { translation: r.dataset.translation, text: r.querySelector('[data-whisper-manga-text]')?.textContent } : null; })()"
  ).then((value) => value?.translation === 'edit-1' && value?.text === 'edit-1' ? value : null).catch(() => null), 8000, 150);
  assert.ok(reverted, 'Stale manga düzenlemesi sayfada geri alınmadı — overlay depodan ayrıştı: ' + JSON.stringify(reverted));

  // === Yol 6: cancelTooLate terminal durumu ===
  await evaluate(renderer, "(() => { state.running = true; state.cancelled = false; state.awaitingExit = false; return true; })()");
  await evaluate(main, "(() => { globalThis.__a3.mainWc.send('transcribe:event', { type: 'done', files: [], segments: 0 }); return true; })()");
  await delay(250);
  await evaluate(main, "(() => { globalThis.__a3.mainWc.send('transcribe:event', { type: 'exit', code: 0, cancelTooLate: true, cancelled: true }); return true; })()");
  const cancelTooLateSeen = await waitFor(async () => evaluate(renderer,
    "(() => ({ cancelled: state.cancelled, log: document.getElementById('log')?.textContent || '' }))()",
    2000).then((value) => value && value.log.includes('yetişemedi') ? value : null).catch(() => null), 8000);
  assert.ok(cancelTooLateSeen, 'cancelTooLate exit olayı renderer günlüğüne düşmedi.');
  assert.equal(cancelTooLateSeen.cancelled, false, 'cancelTooLate çıkışı işi iptal edilmiş gibi işaretledi.');

  // === Yol 7: browser-session paket içe aktarma + yeniden başlatma ===
  const outsideDir = path.join(fixtureDir, 'outside');
  fs.mkdirSync(outsideDir, { recursive: true });
  const evilSrt = path.join(outsideDir, 'evil.srt');
  fs.writeFileSync(evilSrt, '1\n00:00:01,000 --> 00:00:02,000\ncrafted\n');
  const craftedSession = {
    version: 8, restoreEnabled: true, cleanExit: true, savedAt: Date.now(),
    activeTabId: 'imported-tab',
    tabs: [{ id: 'imported-tab', url: siteUrl, title: 'imported',
      subtitleSelection: { primaryId: 'a', secondaryId: '', primaryFile: evilSrt, secondaryFile: evilSrt } }],
  };
  const wbp = path.join(fixtureDir, 'crafted.wbp');
  fs.writeFileSync(wbp, gzipSync(Buffer.from(JSON.stringify({
    format: 'whisper-workspace', version: 1, created: new Date().toISOString(),
    sourceRoot: outsideDir, mappings: [],
    files: [{ name: 'browser-session.json', data: Buffer.from(JSON.stringify(craftedSession)).toString('base64') }],
    rendererValues: {},
  }))));
  await mainEval(`(electron) => { globalThis.__a3.openDialogPath = ${JSON.stringify(wbp)}; return true; }`);
  const preview = await evaluate(renderer,
    "(async () => window.api.mediaCatalog({ action: 'package-preview' }))()", 20000);
  assert.equal(preview?.ok !== false && !!preview?.token, true, 'Paket önizlemesi başarısız: ' + JSON.stringify(preview));
  const applied = await evaluate(renderer,
    "(async () => window.api.mediaCatalog({ action: 'package-apply', token: " + JSON.stringify(preview.token) + " }))()", 30000);
  const restartState = await waitFor(async () => evaluate(main,
    '({ relaunch: globalThis.__a3.relaunch, exits: globalThis.__a3.exits.length })', 2000)
    .then((value) => value?.relaunch >= 1 && value?.exits >= 1 ? value : null).catch(() => null), 10000);
  assert.ok(restartState, 'Paket uygulaması yeniden başlatmayı tetiklemedi: ' + JSON.stringify({ applied, restartState }));
  const restoredSession = JSON.parse(fs.readFileSync(path.join(userDataDir, 'browser-session.json'), 'utf8'));
  assert.equal(restoredSession.tabs?.length, 1, 'İçe aktarılan sekme oturum dosyasına yazılmadı.');
  assert.equal(restoredSession.tabs[0].subtitleSelection?.primaryFile, undefined,
    'İçe aktarılan oturumdaki primaryFile temizlenmedi — grant açığı sürüyor.');
  assert.equal(restoredSession.tabs[0].subtitleSelection?.secondaryFile, undefined,
    'İçe aktarılan oturumdaki secondaryFile temizlenmedi.');

  assert.equal(renderer.exceptions.length, 0, 'Main renderer exceptions: ' + renderer.exceptions.join(' | '));
  await Promise.all([
    closeCdpClient(pageA), closeCdpClient(pageB),
    closeCdpClient(renderer), closeCdpClient(main),
  ]);
  console.log('electron-a3-acceptance: 7 kabul yolu + manga stale-edit rollback geçti '
    + JSON.stringify({ crashDialog: true, unresponsiveDialog: true, tabProtection: true,
      offsetIsolation: { A: offsetA, B: offsetB }, rate: appliedRate, fightback,
      cancelTooLate: cancelTooLateSeen.cancelled === false, packageRestart: restartState.relaunch >= 1,
      mangaRevert: reverted.translation }));
}

async function cleanup() {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 10000,
    });
  }
  electronProcess = null;
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  server = null;
  for (const dir of [userDataDir, fixtureDir]) {
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
  userDataDir = '';
  fixtureDir = '';
}

run().then(async () => {
  await cleanup();
  console.log('electron-a3-acceptance-smoke: passed');
  // Node'un yerleşik WebSocket istemcisi, bütün CDP soketleri kapatılmış olsa
  // bile Windows'ta olay döngüsünde artık kullanılmayan bir tutamaç bırakabiliyor.
  // Bu bağımsız smoke sürecinin sahip olduğu tüm kaynaklar cleanup'tan geçti;
  // koşturucunun 15 dakikalık zaman aşımına düşmemesi için başarıyı kesin kapat.
  process.exit(0);
}).catch(async (error) => {
  await cleanup();
  console.error(error.stack || error.message);
  process.exit(1);
});
