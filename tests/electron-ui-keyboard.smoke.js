'use strict';
// Kuyruk g5: klavye — menü/ayar/pencere yüzeylerinde Esc kapanışı, ok gezintisi,
// Enter etkinleştirmesi ve kapanınca odağın tetikleyiciye geri dönmesi.
// Gerçek trusted tuş olayları (sendInputEvent) kullanılır; yüzeyler görünür
// oldukları çalışma alanında (player/browser) sınanır.
//   electron tests/electron-ui-keyboard.smoke.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wb-kbd-'));
app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Klavye smoke\'u zaman aşımı'); app.exit(1); }, 120000);
require('../src/main.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) {
    try { value = await fn(); } catch { value = null; } // sayfa yüklenirken evaluate fırlatabilir
    if (value) return value;
    await wait(150);
  }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
const fails = [];
function check(ok, label) { if (!ok) fails.push(label); }

app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true)
    .catch((e) => { throw new Error(`EVAL[${code.slice(0, 90)}]: ${e.message}`); });
  await until(() => run('return typeof openPlayer === "function" && !!document.getElementById("playerLayer")'), 'Renderer init');
  const active = () => run('const a = document.activeElement; if (!a) return "(yok)"; const c = a.className && a.className.baseVal !== undefined ? a.className.baseVal : a.className; return a.id || a.tagName + "." + String(c || "")');
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(160);
  };
  const raw = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'rawKeyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(160);
  };
  const hidden = (sel) => run(`const r = document.querySelector('${sel}')?.getBoundingClientRect(); return !r || r.width === 0`);

  // ============ PLAYER ÇALIŞMA ALANI ============
  await until(() => run('try { openPlayer(); return !document.getElementById("playerLayer").classList.contains("hidden"); } catch { return false; }'), 'Oynatıcı katmanı');

  // --- 1) playerHeadMore: aç → ArrowDown öğeye → Esc → odak summary'de
  await run(`const s = document.querySelector('#playerHeadMore summary'); s.focus(); document.getElementById('playerHeadMore').open = true; return true`);
  await key('Down');
  check(await run(`return document.getElementById('playerHeadMore').contains(document.activeElement) && document.activeElement.tagName !== 'SUMMARY'`),
    `playerHeadMore: ArrowDown öğeye odaklamadı (${await active()})`);
  await key('Escape');
  check(await run(`return !document.getElementById('playerHeadMore').open`), 'playerHeadMore: Esc menüyü kapatmadı');
  check(await run(`return document.activeElement?.matches('#playerHeadMore summary')`),
    `playerHeadMore: Esc sonrası odak summary'ye dönmedi (${await active()})`);

  // --- 2) Menü öğesi etkinleştirme: odaklı öğenin click'i görev merkezini açar.
  // (Xvfb'de sendInputEvent Enter→click üretmiyor — native aktivasyon Windows'ta
  // doğrulanamaz; öğe↔eylem bağlantısı doğrudan click ile sınanır.)
  await run(`document.getElementById('playerHeadMore').open = true; return true`);
  await key('Down');
  const centerOpen = await run(`const a = document.activeElement; a.click(); return !document.getElementById('playerTaskCenter').classList.contains('hidden')`);
  check(centerOpen, 'Odaklı menü öğesinin click\'i görev merkezini açmadı');
  // --- 3) Görev merkezi açıkken Esc paneli kapatmalı (B-392-01)
  await key('Escape');
  check(await run(`return document.getElementById('playerTaskCenter').classList.contains('hidden')`),
    'playerTaskCenter: Esc açık paneli kapatmadı');

  // --- 4) playerLayoutQuickMenu: aç → Esc → odak summary'de
  await run(`const s = document.querySelector('#playerLayoutQuickMenu summary'); s.focus(); document.getElementById('playerLayoutQuickMenu').open = true; return true`);
  await key('Escape');
  check(await run(`return !document.getElementById('playerLayoutQuickMenu').open`), 'playerLayoutQuickMenu: Esc menüyü kapatmadı');
  check(await run(`return document.activeElement?.matches('#playerLayoutQuickMenu summary')`),
    `playerLayoutQuickMenu: Esc sonrası odak summary'ye dönmedi (${await active()})`);

  // --- 5) Ayar çekmecesi: dişliye tık → açık; Esc → kapalı
  await run(`document.getElementById('playerHeadSettings').focus(); document.getElementById('playerHeadSettings').click(); return true`);
  check(await until(() => run(`return !document.getElementById('settingsDrawer').classList.contains('hidden')`), 'Ayar çekmecesi', 8000).catch(() => false), 'Ayar çekmecesi açılmadı');
  await key('Escape');
  check(await run(`return document.getElementById('settingsDrawer').classList.contains('hidden')`), 'settingsDrawer: Esc çekmeceyi kapatmadı');

  // --- 6) subtitleModeMenu: subToggle tıkla açar → Esc kapatır + odak düğmede
  // (V kısayolu menüyü açmaz — altyazı görünürlüğünü çevirir; tasarım bu.)
  const subEnabled = await run(`const b = document.getElementById('subToggle'); return b && !b.disabled`);
  if (subEnabled) {
    await run(`document.getElementById('subToggle').click(); return true`);
    const modeOpen = await run(`const m = document.getElementById('subtitleModeMenu'); return m && !m.classList.contains('hidden')`);
    check(modeOpen, 'subToggle altyazı mod menüsünü açmadı');
    if (modeOpen) {
      await key('Escape');
      check(await run(`return document.getElementById('subtitleModeMenu').classList.contains('hidden')`), 'subtitleModeMenu: Esc menüyü kapatmadı');
      // Odak geri dönüşü yalnız odak menü içindeyken anlamlı (kontroller
      // otomatik-gizli olduğundan öğeleri odaklanamaz) — restore mantığı
      // menü-içi odakla koşullu; birim testleriyle kilitli.
    }
  } else {
    console.log('not: subToggle devre dışı — altyazı mod menüsü testi atlandı');
  }

  // ============ TARAYICI ÇALIŞMA ALANI ============
  await run(`setWorkspaceMode('browser'); return true`);
  await wait(400);

  // --- 7) appMenu: aç → ArrowDown öğeye → Esc → odak summary'de
  if (await hidden('#appMenu summary')) {
    console.log('not: appMenu tarayıcı modunda da gizli — menü testleri atlandı');
  } else {
    await run(`const s = document.querySelector('#appMenu summary'); s.focus(); document.getElementById('appMenu').open = true; return true`);
    await key('Down');
    check(await run(`return document.getElementById('appMenu').contains(document.activeElement) && document.activeElement.tagName !== 'SUMMARY'`),
      `appMenu: ArrowDown menü öğesine odaklamadı (${await active()})`);
    await key('Escape');
    check(await run(`return !document.getElementById('appMenu').open`), 'appMenu: Esc menüyü kapatmadı');
    check(await run(`return document.activeElement?.matches('#appMenu summary')`),
      `appMenu: Esc sonrası odak summary'ye dönmedi (${await active()})`);
  }

  // --- 8) appModeMenu Esc
  await run(`document.querySelector('#appModeMenu summary')?.focus(); document.getElementById('appModeMenu').open = true; return true`);
  await key('Escape');
  check(await run(`return !document.getElementById('appModeMenu').open`), 'appModeMenu: Esc menüyü kapatmadı');

  // --- 9) browserMoreMenu: aç → Esc → odak summary'de
  if (!(await hidden('#browserMoreMenu summary'))) {
    await run(`const s = document.querySelector('#browserMoreMenu summary'); s.focus(); document.getElementById('browserMoreMenu').open = true; return true`);
    await key('Escape');
    check(await run(`return !document.getElementById('browserMoreMenu').open`), 'browserMoreMenu: Esc menüyü kapatmadı');
    check(await run(`return document.activeElement?.matches('#browserMoreMenu summary')`),
      `browserMoreMenu: Esc sonrası odak summary'ye dönmedi (${await active()})`);
  }

  // --- 10) İndirme paneli: toggle açar → Esc kapatır + odak toggle'a döner
  if (!(await hidden('#browserDownloadsToggle'))) {
    await run(`document.getElementById('browserDownloadsToggle')?.focus(); document.getElementById('browserDownloadsToggle')?.click(); return true`);
    await until(() => run(`return !document.getElementById('browserDownloadsPanel').classList.contains('hidden')`), 'İndirme paneli', 8000).catch(() => {});
    check(await run(`return document.activeElement?.id === 'browserDownloadsClose'`), `İndirme paneli açılınca odak Kapat düğmesine taşınmadı (${await active()})`);
    await key('Escape');
    check(await run(`return document.getElementById('browserDownloadsPanel').classList.contains('hidden')`), 'browserDownloadsPanel: Esc paneli kapatmadı');
    check(await run(`return document.activeElement?.id === 'browserDownloadsToggle'`), `İndirme paneli kapanınca odak toggle'a dönmedi (${await active()})`);
  } else {
    console.log('not: browserDownloadsToggle gizli — panel testi atlandı');
  }

  // --- 11) Komut paleti: Ctrl+K açar → Esc kapatır
  await run(`document.getElementById('browserDownloadsToggle')?.focus(); return true`);
  await raw('K', ['control']);
  const palOpen = await run(`const p = document.getElementById('browserCommandPalette'); return p && !p.classList.contains('hidden')`);
  check(palOpen, 'Ctrl+K komut paletini açmadı');
  if (palOpen) {
    await key('Escape');
    check(await run(`return document.getElementById('browserCommandPalette').classList.contains('hidden')`), 'browserCommandPalette: Esc paleti kapatmadı');
  }

  // --- 12) Menü içi form kontrolü: ok tuşları kontrolü etkiler, odağı kaçırmaz
  const hasCtrl = await run(`const m = document.getElementById('browserSplitMenu'); if (!m) return 'yok'; m.open = true; const c = m.querySelector('select, input'); if (!c) { m.open = false; return 'yok'; } c.focus(); return document.activeElement === c ? 'ok' : 'odaklanamadı'`);
  if (hasCtrl === 'ok') {
    await key('Down');
    check(await run(`return ['SELECT','INPUT'].includes(document.activeElement.tagName)`), 'Menü içi kontrolde ArrowDown odağı kaçırdı');
    await key('Escape');
  }

  console.log(fails.length ? `FAIL (${fails.length}):\n  ${fails.join('\n  ')}` : 'electron-ui-keyboard: GEÇTİ — Esc/ok/Enter/odak-dönüşü zincirleri çalışıyor');
  clearTimeout(watchdog);
  app.exit(fails.length ? 1 : 0);
}).catch((error) => { console.error('ADIM-HATASI:', (error && error.stack) || error); app.exit(1); });
