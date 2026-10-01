// 100-kuyruk batch 5 (güvenlik/IPC tur-2) — browser-preload köprüsü ve web-
// içerikli IPC yüzeyi kilit ratchet'i. Denetimde doğrulanan invariant'ların
// gerilemesini kaynak seviyesinde yakalar; davranışı kanıtlanabilen kısımlar
// (köprü descriptor + tip whitelist) gerçek kod yürütülerek test edilir.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'src');
const preload = fs.readFileSync(path.join(root, 'browser-preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  PASS', name); }

// --- 41/42: __whisperTrustedBridgeSend descriptor + tip whitelist ---
test('trusted-bridge göndericisi non-configurable/writable/enumerable + tip beyaz listesi', () => {
  const sent = [];
  const window = {
    addEventListener() {},
    __emitter: (ch, payload) => sent.push({ ch, payload }),
  };
  const sandbox = {
    require: (name) => {
      assert.strictEqual(name, 'electron');
      return { ipcRenderer: { send: (ch, payload) => sent.push({ ch, payload }),
        on: () => {} } };
    },
    window, document: { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [] },
    globalThis: null, console,
    setTimeout, clearTimeout, MutationObserver: undefined, WeakSet,
    URL, location: { href: 'https://x/' }, Buffer,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // preload dosyası document/location/window global'larını okur — dosyayı olduğu
  // gibi bağlamda çalıştırıp gerçek descriptor'ı denetleriz.
  vm.runInContext(preload, sandbox);
  const desc = Object.getOwnPropertyDescriptor(sandbox.globalThis ?? sandbox, '__whisperTrustedBridgeSend')
    || Object.getOwnPropertyDescriptor(sandbox, '__whisperTrustedBridgeSend');
  assert.ok(desc, 'köprü tanımlı');
  assert.strictEqual(desc.configurable, false, 'configurable:false');
  assert.strictEqual(desc.enumerable, false, 'enumerable:false');
  assert.strictEqual(desc.writable, false, 'writable:false');
  assert.strictEqual(typeof desc.value, 'function');
  // Bilinmeyen tip reddedilir ve IPC'ye taşınmaz.
  assert.strictEqual(desc.value('evil', {}), false);
  assert.strictEqual(sent.length, 0, 'bilinmeyen tip IPC göndermedi');
  for (const type of ['manga-edit', 'overlay-style', 'subtitle-control', 'page-blocks', 'page-action', 'reading-position']) {
    assert.strictEqual(desc.value(type, {}), true, `tip kabul: ${type}`);
  }
  assert.strictEqual(sent.length, 6);
  assert.ok(sent.every((s) => s.ch === 'browser:trusted-bridge'));
  // Beyaz liste kaynakta da kilitlidir.
  assert.match(preload, /configurable:\s*false[\s\S]*enumerable:\s*false[\s\S]*writable:\s*false/);
  assert.match(preload, /\['manga-edit', 'overlay-style', 'subtitle-control', 'page-blocks', 'page-action', 'reading-position'\]/);
});

test('keşif sinyalleri yalnızca tip + sayısal sayaç taşır (içerik/URL/HTML taşınmaz)', () => {
  // discoveryCounts ürettiği nesnenin alanları sabit küme ve sayısal-kelepçeli.
  const m = preload.match(/function discoveryCounts\(video, track\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'discoveryCounts bulunamadı');
  for (const field of m[1].match(/(\w+):/g) || []) {
    assert.ok(['mediaCount:', 'trackCount:', 'cueCount:'].includes(field), `izinsiz alan: ${field}`);
  }
  assert.match(m[1], /Math\.min\(1000,/, 'media/track sayacı kelepçeli');
  assert.match(m[1], /Math\.min\(20000,/, 'cue sayacı kelepçeli');
  // Sinyal yükü yalnız {type, ...details} — details yalnız discoveryCounts'tan gelir.
  assert.match(preload, /signalBrowserDiscovery\(type, details = \{\}\)/);
  assert.match(preload, /ipcRenderer\.send\('browser:discovery-signal', payload\)/);
  // Preload'da cue metni veya URL'nin discovery-signal'a girdiği yol yoktur:
  // discovery çağrılarında ikinci argüman hep discoveryCounts'tur.
  for (const call of preload.matchAll(/signalBrowserDiscovery\(([^;]+)\)/g)) {
    if (/details/.test(call[1])) continue; // counts zarfı
    assert.match(call[1], /discoveryCounts\(|mediaCount/, `içerikli sinyal: ${call[1]}`);
  }
});

test('open-link yalnız güvenilir yeni-sekme jesti + http(s) + indirme değil', () => {
  assert.match(preload, /if \(!event\.isTrusted\) return;/);
  assert.match(preload, /button === 1 \|\| \(button === 0 && \(!!event\.ctrlKey \|\| !!event\.metaKey\)\)/);
  assert.match(preload, /anchor\.hasAttribute\('download'\)/);
  assert.match(preload, /!\['http:', 'https:'\]\.includes\(parsed\.protocol\)/);
  assert.match(preload, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);/);
});

test('page-mutated gözlemcisi opt-in, debounce süreli ve içeriksizdir', () => {
  assert.match(preload, /ipcRenderer\.on\('browser:find-state'/);
  assert.match(preload, /payload\.active\) startPageFindObserver\(\);\s*else stopPageFindObserver\(\)/);
  assert.match(preload, /ipcRenderer\.send\('browser:page-mutated'\)(?!\s*,)/, 'page-mutated yük taşımaz');
  assert.match(preload, /setTimeout\(\(\) => \{[\s\S]*?350\)/, 'mutasyon debounce ~350ms');
});

test('trusted-bridge ana-taraf kabulü: ana-frame + sekme-görünümü göndericisi + aktif-sekme daralması', () => {
  const start = main.indexOf("ipcMain.on('browser:trusted-bridge'");
  const body = main.slice(start, start + 2600);
  assert.match(body, /event\.senderFrame !== event\.sender\.mainFrame/);
  assert.match(body, /candidate\.view\.webContents === event\.sender/, 'gönderici gerçek sekme görünümü olmalı');
  assert.match(body, /message\.type !== 'page-blocks' && message\.type !== 'page-action' && tab\.id !== browserActiveTabId/,
    'aktif olmayan sekme yalnız sayfa-blok/eylem tiplerini gönderebilir');
  assert.match(body, /\['subtitle-earlier', 'subtitle-later', 'subtitle-larger', 'subtitle-smaller', 'subtitle-source', 'subtitle-translation', 'subtitle-both', 'subtitle-toggle', 'subtitle-save'\]/,
    'subtitle-control eylem beyaz listesi');
});

test('web içerikli openExternal: webContents başına 3 sn sınır + politika süzgeci', () => {
  const start = main.indexOf('function openExternalFromWebContent');
  const body = main.slice(start, start + 700);
  assert.match(body, /browserExternalOpenAt\.get\(key\) \|\| 0\) < 3000/);
  assert.match(body, /return openExternalByPolicy\(rawUrl\)/, 'her zaman politika kararından geçer');
  assert.match(main, /const browserExternalOpenAt = new WeakMap\(\);/, 'zaman damgası webContents anahtarlı (bellekten sayfa izi sızmaz)');
});

test('pencere açma handler\'ı: dış→red+hız sınırlı açılış, iç→popup tavanı + seçenekleri', () => {
  const start = main.indexOf('function browserWindowOpenHandler');
  const body = main.slice(start, start + 1500);
  assert.match(body, /decideUrlPolicy\(url, 'browser-window-open'/);
  assert.match(body, /decision\.action === 'external'\)[\s\S]*?action: 'deny'/);
  assert.match(body, /!browserPopupWindows\.canAdd\(\)/);
  assert.match(body, /outlivesOpener: false/);
  assert.match(body, /overrideBrowserWindowOptions: browserPopupWindowOptions\(\)/);
  assert.match(main, /const MAX_BROWSER_POPUPS = 10;/);
  assert.match(main, /createWindowRegistry\(MAX_BROWSER_POPUPS\)/);
});

test('kapanış el sıkışması ve sync kaydetme kanalları kimlik doğrular', () => {
  const flushStart = main.indexOf("ipcMain.on('library:flush-before-close-complete'");
  assert.match(main.slice(flushStart, flushStart + 900), /event\.sender !== pending\.sender/,
    'yalnız handshake başlatan renderer ACK verir');
  const upsertStart = main.indexOf("ipcMain.on('library:upsert-before-close'");
  assert.match(main.slice(upsertStart, upsertStart + 500),
    /event\.sender !== mainWindow\.webContents[\s\S]*?senderFrame !== mainWindow\.webContents\.mainFrame/);
  for (const ch of ["queue:saveSync", "settings:saveSync"]) {
    const i = main.indexOf(`ipcMain.on('${ch}'`);
    assert.match(main.slice(i, i + 300), /authorizedBrowserSender\(event\)/, `${ch} gönderici korumalı`);
  }
});

test('sayfa kaynağı telemetrisi ölçemediğini yalan söylemez (null-dürüstlüğü)', () => {
  const m = preload.match(/function browserPageResourceTelemetry\(\) \{[\s\S]*?return \{([\s\S]*?)\};/);
  assert.ok(m);
  for (const f of ['resizeObservers', 'mediaListeners', 'overlayNodes', 'pendingFrames']) {
    assert.match(m[1], new RegExp(`${f}: null`), `${f} null olmalı`);
  }
  // pagehide'da gözlemci ve zamanlayıcılar kapanır.
  assert.match(preload, /discoveryObserver\?\.disconnect\(\)/);
  assert.match(preload, /if \(discoveryFlushTimer\) clearTimeout\(discoveryFlushTimer\)/);
  assert.match(preload, /stopPageFindObserver\(\);/);
});

console.log(`browser-preload-ratchet: ${passed} kontrol geçti`);
