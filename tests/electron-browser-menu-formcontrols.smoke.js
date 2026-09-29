'use strict';
// R235: details menülerindeki form kontrollerinin klavye davranışı —
// wireDetailsMenuNav ok/Home/End'i menü gezintisi için kullanır ama select,
// range ve metin alanlarında aynı tuşların yerleşik anlamı vardır. Kapısız
// eski kodda kontroldeki her ok basımı odağı başka öğeye kaydırıyordu.
// electron tests/electron-browser-menu-formcontrols.smoke.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'menu-formcontrols');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const watchdog = setTimeout(() => { console.error('Menü form kontrolü testi zaman aşımı'); app.exit(1); }, 90000);
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1280, 860); win.show(); win.focus();
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  const activeEl = () => run('return document.activeElement?.id || document.activeElement?.tagName');
  const key = async (keyCode) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); await wait(200); };

  // Bölünmüş görünüm menüsü: select + range + düğme içerir. Menü AI panelinin
  // alt bilgisinde yaşar; #playerLayer ve #aiChat gizli ataları focus()u yutar —
  // oynatıcı katmanı ve AI sekmesi gerçek UI yoluyla açılır.
  await run('openPlayer();setSideTab("ai");return true');
  await until(() => run(`return !document.getElementById('aiChat').classList.contains('hidden')`), 'AI paneli');
  await run(`const m = document.getElementById('browserSplitMenu'); m.open = true; return true`);
  await until(() => run(`return document.getElementById('browserSplitMenu').open === true`), 'Menü açık');

  // 1) Range: ←/→ değeri ayarlar, odak yerinde kalır (eskiden items[0]'a sıçrardı).
  const before = await run(`const r = document.getElementById('browserSplitRatio'); r.focus(); return Number(r.value)`);
  assert.equal(await activeEl(), 'browserSplitRatio', 'range odaklandı');
  await key('Right');
  assert.equal(await activeEl(), 'browserSplitRatio', '→ sonrası odak range üzerinde kalmalı');
  const after = await run(`return Number(document.getElementById('browserSplitRatio').value)`);
  assert.equal(after, before + 1, '→ range değerini artırmalı');
  await key('Left');
  assert.equal(await activeEl(), 'browserSplitRatio', '← sonrası odak yine range üzerinde');

  // 2) Select: ↑/↓ seçeneği değiştirir, odak yerinde kalır.
  await run(`const s = document.getElementById('browserSplitSecondary'); s.focus(); return true`);
  assert.equal(await activeEl(), 'browserSplitSecondary', 'select odaklandı');
  await key('Down');
  assert.equal(await activeEl(), 'browserSplitSecondary', '↓ sonrası odak select üzerinde kalmalı');
  await key('Home');
  assert.equal(await activeEl(), 'browserSplitSecondary', 'Home sonrası odak select üzerinde kalmalı');

  // 3) Düğme: ok gezintisi hâlâ çalışır — son öğeden ↓ ilk öğeye sarar.
  await run(`document.getElementById('browserSplitClose').focus(); return true`);
  assert.equal(await activeEl(), 'browserSplitClose', 'düğme odaklandı');
  await key('Down');
  const landed = await activeEl();
  assert.notEqual(landed, 'browserSplitClose', 'düğmede ↓ menü gezintisi odağı taşımalı');
  fs.writeFileSync(path.join(out, 'menu-formcontrols-done.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, nav: `range ${before}→${after}, select korundu, düğme gezindi → ${landed}` }));
  clearTimeout(watchdog); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
