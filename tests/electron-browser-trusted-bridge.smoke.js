const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

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
    await window.loadURL('data:text/html;charset=utf-8,<main>trusted bridge smoke</main>');
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
    console.log('electron-browser-trusted-bridge: page-action ve page-blocks isolated world 999 üzerinden geçti; bilinmeyen tip reddedildi.');
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
