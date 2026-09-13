const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { buildDarkReaderCssScript } = require('../src/browser-dark-mode');
const { buildBrowserLinkHintsScript } = require('../src/browser-link-hints');
const {
  buildBrowserMediaPreferenceScript,
  buildBrowserMediaProbeScript,
} = require('../src/browser-media-controller');

const BRIDGE_CHANNEL = 'browser:trusted-bridge';
const ISOLATED_WORLD_ID = 999;

async function run() {
  await app.whenReady();
  const received = [];
  const onBridge = (_event, message) => received.push(message);
  ipcMain.on(BRIDGE_CHANNEL, onBridge);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
      <style>button,a,video{display:block;width:180px;height:32px;margin:8px} video{width:640px;height:360px}</style>
      <main><button id="main-action">Ana eylem</button><a href="#hedef">Bağlantı</a></main>
      <section id="shadow-host"></section>
      <iframe id="same-origin-frame" srcdoc="<button id='frame-action'>Çerçeve eylemi</button>"></iframe>
      <iframe id="opaque-frame" name="opaque-frame" sandbox="allow-scripts"
        srcdoc="<button id='opaque-action'>Yalıtılmış çerçeve eylemi</button>"></iframe>
      <script>
        const root = document.getElementById('shadow-host').attachShadow({ mode: 'open' });
        root.innerHTML = '<button id="shadow-action">Gölge eylemi</button><video id="shadow-video"></video>';
        window.__hintClicks = 0;
        document.getElementById('main-action').addEventListener('click', () => { window.__hintClicks += 1; });
        window.__audioStats = { sources: 0, compressors: 0 };
        const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
        if (NativeAudioContext) {
          window.AudioContext = class InstrumentedAudioContext extends NativeAudioContext {
            createMediaElementSource(...args) { window.__audioStats.sources += 1; return super.createMediaElementSource(...args); }
            createDynamicsCompressor(...args) { window.__audioStats.compressors += 1; return super.createDynamicsCompressor(...args); }
          };
        }
      </script>`));
    const result = await window.webContents.executeJavaScriptInIsolatedWorld(
      ISOLATED_WORLD_ID,
      [{ code: `(() => ({
        bridgeType: typeof globalThis.__whisperTrustedBridgeSend,
        pageAction: globalThis.__whisperTrustedBridgeSend?.('page-action', {
          action: 'retry', id: 'block-1', bridgeToken: 'smoke-token'
        }),
        pageBlocks: globalThis.__whisperTrustedBridgeSend?.('page-blocks', {
          blocks: [], bridgeToken: 'smoke-token'
        }),
        unknown: globalThis.__whisperTrustedBridgeSend?.('unknown-action', {})
      }))()` }],
      true,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(result, {
      bridgeType: 'function',
      pageAction: true,
      pageBlocks: true,
      unknown: false,
    });
    assert.equal(received.some((message) => message?.type === 'page-action'
      && message.payload?.action === 'retry'), true);
    assert.equal(received.some((message) => message?.type === 'page-blocks'), true);
    assert.equal(received.some((message) => message?.type === 'unknown-action'), false);

    const mediaPreference = await window.webContents.executeJavaScript(
      buildBrowserMediaPreferenceScript({
        rate: 1.5,
        enforceRate: true,
        preservesPitch: true,
        brightness: 1.2,
        contrast: 0.9,
        normalizeAudio: true,
      }), true);
    assert.equal(mediaPreference?.handled, true);
    assert.equal(mediaPreference.media?.playbackRate, 1.5);
    const initialMedia = await window.webContents.executeJavaScript(`(() => {
      const video = document.getElementById('shadow-host').shadowRoot.getElementById('shadow-video');
      return {
        preservesPitch: video.preservesPitch,
        filter: video.style.filter,
        diagnostics: window.__whisperMediaController.diagnostics(),
        audioStats: window.__audioStats,
      };
    })()`, true);
    assert.equal(initialMedia.preservesPitch, true);
    assert.equal(initialMedia.filter, 'brightness(1.2) contrast(0.9)');
    assert.equal(initialMedia.diagnostics.candidateCount, 1);
    assert.equal(initialMedia.diagnostics.observerCount, 2);
    assert.equal(initialMedia.audioStats.sources, 1, 'Gerçek AudioContext medya kaynağı kurulmadı.');
    assert.equal(initialMedia.audioStats.compressors, 1, 'Gerçek DynamicsCompressor kurulmadı.');

    const rateFightback = await window.webContents.executeJavaScript(`(async () => {
      const video = document.getElementById('shadow-host').shadowRoot.getElementById('shadow-video');
      video.playbackRate = 1;
      video.dispatchEvent(new Event('ratechange'));
      await Promise.resolve();
      return video.playbackRate;
    })()`, true);
    assert.equal(rateFightback, 1.5, 'Site hız sıfırlaması gerçek DOM olayında geri alınmadı.');

    const detached = await window.webContents.executeJavaScript(`(async () => {
      const host = document.getElementById('shadow-host');
      window.__detachedMediaHost = host;
      host.remove();
      await new Promise((resolve) => setTimeout(resolve, 30));
      ${buildBrowserMediaProbeScript()};
      return window.__whisperMediaController.diagnostics();
    })()`, true);
    assert.equal(detached.candidateCount, 0, 'DOM dışındaki medya adayı bırakılmadı.');
    assert.equal(detached.observerCount, 1, 'Kopmuş shadow root gözlemcisi bırakılmadı.');

    const reattached = await window.webContents.executeJavaScript(`(async () => {
      const host = window.__detachedMediaHost;
      document.body.appendChild(host);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const video = host.shadowRoot.getElementById('shadow-video');
      return {
        media: ${buildBrowserMediaProbeScript()},
        filter: video.style.filter,
        preservesPitch: video.preservesPitch,
        diagnostics: window.__whisperMediaController.diagnostics(),
        audioStats: window.__audioStats,
      };
    })()`, true);
    assert.equal(reattached.media.playbackRate, 1.5);
    assert.equal(reattached.filter, 'brightness(1.2) contrast(0.9)');
    assert.equal(reattached.preservesPitch, true);
    assert.equal(reattached.diagnostics.candidateCount, 1);
    assert.equal(reattached.diagnostics.observerCount, 2);
    assert.equal(reattached.audioStats.sources, 1,
      'Sökülüp takılan aynı video için ikinci MediaElementSource oluşturuldu.');

    window.webContents.setZoomFactor(1.25);
    const captureGeometry = await window.webContents.executeJavaScript(`(() => {
      const bounds = document.getElementById('shadow-host').shadowRoot
        .getElementById('shadow-video').getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    })()`, true);
    const zoom = window.webContents.getZoomFactor();
    const captureRect = {
      x: Math.max(0, Math.floor(captureGeometry.x * zoom)),
      y: Math.max(0, Math.floor(captureGeometry.y * zoom)),
      width: Math.max(2, Math.floor(captureGeometry.width * zoom)),
      height: Math.max(2, Math.floor(captureGeometry.height * zoom)),
    };
    const capturedFrame = await window.webContents.capturePage(captureRect);
    assert.equal(capturedFrame.isEmpty(), false, 'Zoom uygulanmış gerçek video kırpması boş döndü.');
    assert.ok(capturedFrame.getSize().width >= captureRect.width
      && capturedFrame.getSize().height >= captureRect.height,
    'DPR uygulanmış görüntü üretim koordinatlarının altında kaldı.');
    window.webContents.setZoomFactor(1);

    const hints = await window.webContents.executeJavaScript(buildBrowserLinkHintsScript(), true);
    assert.equal(hints?.active, true);
    assert.ok(hints.count >= 4, 'Ana belge, shadow DOM ve iframe ipuçları birlikte bulunamadı.');
    await window.webContents.executeJavaScript(
      "document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true,cancelable:true}))", true);
    assert.equal(await window.webContents.executeJavaScript('window.__hintClicks', true), 1,
      'Gerçek Electron belgesinde ipucu tuşu hedefi etkinleştirmedi.');
    assert.equal(await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-whisper-link-hints]')", true), false,
    'Link ipucu katmanı seçimden sonra temizlenmedi.');

    const opaqueFrame = window.webContents.mainFrame.framesInSubtree
      .find((frame) => frame.name === 'opaque-frame');
    assert.ok(opaqueFrame, 'Yalıtılmış iframe WebFrameMain olarak bulunamadı.');
    const opaqueHints = await opaqueFrame.executeJavaScript(buildBrowserLinkHintsScript(), true);
    assert.equal(opaqueHints?.active, true, 'Cross-origin/opaque iframe kendi ipucu yüzeyini kuramadı.');
    assert.equal(opaqueHints.count, 1);
    await opaqueFrame.executeJavaScript(
      "document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true,cancelable:true}))", true);
    assert.equal(await opaqueFrame.executeJavaScript(
      "!!document.querySelector('[data-whisper-link-hints]')", true), false,
    'Yalıtılmış iframe link ipucu katmanı seçimden sonra temizlenmedi.');

    const darkReaderBundle = fs.readFileSync(require.resolve('darkreader/darkreader.js'), 'utf8');
    const darkResult = await window.webContents.executeJavaScriptInIsolatedWorld(
      ISOLATED_WORLD_ID,
      [{ code: buildDarkReaderCssScript(darkReaderBundle) }],
      true,
    );
    assert.equal(darkResult?.ok, true, darkResult?.error || 'Dark Reader CSS üretimi başarısız.');
    assert.ok(darkResult.css.length > 100, 'Dark Reader boş CSS üretti.');
    assert.match(darkResult.css, /darkreader/i);
    assert.equal(await window.webContents.executeJavaScript(
      "typeof globalThis.DarkReader", true), 'undefined', 'Dark Reader sayfanın ana dünyasına sızdı.');
    assert.equal(await window.webContents.executeJavaScriptInIsolatedWorld(
      ISOLATED_WORLD_ID, [{ code: "typeof globalThis.DarkReader" }], true), 'undefined',
    'Dark Reader isolated world içinde temizlenmedi.');
    const cssKey = await window.webContents.insertCSS(darkResult.css, { cssOrigin: 'user' });
    assert.equal(typeof cssKey, 'string');
    await window.webContents.removeInsertedCSS(cssKey);
    console.log('electron-browser-trusted-bridge: güvenilir köprü, gerçek medya/shadow/iframe yaşam döngüsü, link ipuçları ve Dark Reader isolated world akışı geçti.');
  } finally {
    ipcMain.removeListener(BRIDGE_CHANNEL, onBridge);
    if (!window.isDestroyed()) window.destroy();
    app.quit();
  }
}

run().catch((error) => {
  console.error(error);
  app.exit(1);
});
