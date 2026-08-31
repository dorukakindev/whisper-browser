/**
 * Electron'a bagli main.js dogrudan import edilemedigi icin eklenti akisinin
 * uc noktalarini ve UI koprusunu kaynak sozlesmesi olarak korur.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  OK  ${message}`);
}

ok(main.includes("const BROWSER_EXTENSIONS_FILE = 'browser-extensions.json';"), 'eklenti ayri ve kalici bir dosyada tutuluyor');
ok(main.includes('browserSession.extensions') && main.includes('typeof api.loadExtension'),
  'yeni ve eski Electron eklenti API fallbacki var');
ok(main.includes("ipcMain.handle('browser:extensions:add'")
  && main.includes("ipcMain.handle('browser:extensions:toggle'")
  && main.includes("ipcMain.handle('browser:extensions:open'")
  && main.includes("ipcMain.handle('browser:extensions:remove'"),
  'ekle, ac/kapat, popup ve kaldir IPC uclari var');
ok(main.includes('await loadConfiguredBrowserExtensions();'), 'kayitli eklentiler pencere acilmadan yukleniyor');
ok(main.includes('BUNDLED_PROTON_EXTENSION_PATH')
  && main.includes('ensureBundledBrowserExtensions();'),
  'Proton VPN eklentisi ilk açılışta otomatik kaydediliyor');
ok(preload.includes('addBrowserExtension') && preload.includes('toggleBrowserExtension')
  && preload.includes('removeBrowserExtension'), 'eklenti IPC koprusu preload uzerinden sinirli');
ok(html.includes('id="browserExtensionsToggle"') && html.includes('id="browserExtensionsPanel"')
  && html.includes('id="browserExtensionAdd"'), 'tarayici panelinde eklenti yonetimi gorunur');
ok(renderer.includes('renderBrowserExtensions') && renderer.includes('browserExtensionAdd')
  && renderer.includes('toggleBrowserExtension') && renderer.includes('openBrowserExtension'),
  'eklenti UI aksiyonlari rendererda bagli');
ok(css.includes('.browser-extensions') && css.includes('.browser-extension-row'),
  'eklenti paneli mevcut koyu/kehribar tasarim tokenlarini kullaniyor');

console.log('\n9 tarayici eklentisi sozlesme testi gecti.');
