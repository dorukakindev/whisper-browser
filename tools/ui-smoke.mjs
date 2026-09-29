#!/usr/bin/env node
// Arayüz duman testi: renderer'ı başsız Chromium'da saplanmış (stub) window.api
// ile açar ve menülerdeki / araç çubuğundaki HER öğeye tıklayıp etkisini ölçer.
//
// Yakaladığı hata sınıfları (hepsi gerçek hatalardan çıkarıldı):
//   silent   tıklanınca hiçbir şey olmayan öğe: API çağrısı yok, menü dışı DOM
//            değişikliği yok, odak değişmedi, sinyal/diyalog yok ("çalışmayan buton")
//   error    tıklama ya da açılış sırasında sayfa hatası / işlenmemiş promise reddi
//   occluded panel/menü kapandıktan sonra native sayfa hâlâ örtülü kalıyor
//            (son setBrowserOccluded çağrısı true)
//   escape   açılan panel Esc ile kapanmıyor
//
// Her öğe iki senaryoda denenir: boş sekme ve yüklü bir http sayfası.
//
//   npm run smoke:ui                         # rapor: tmp/ui-smoke/report.json
//   npm run smoke:ui -- --strict             # herhangi bir bulgu varsa çıkış kodu 1
//   npm run smoke:ui -- --browser <yol>      # Chrome/Edge/Chromium yolu
//   npm run smoke:ui -- --only browserMoreMenu
//
// Bilerek etkisiz olan öğeler tools/ui-smoke-allow.json'da gerekçesiyle listelenir.
// Ek npm paketi gerekmez (Node 22'nin yerleşik WebSocket'i ile ham CDP).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const OUT = path.resolve(option('--out', path.join(ROOT, 'tmp', 'ui-smoke')));
const STRICT = flag('--strict');
const ONLY = option('--only');
const ALLOW_PATH = path.join(ROOT, 'tools', 'ui-smoke-allow.json');

function findBrowser() {
  const candidates = [option('--browser'), process.env.CHROME_PATH];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const dir of fs.readdirSync(pw).filter((name) => name.startsWith('chromium')).sort().reverse()) {
      candidates.push(path.join(pw, dir, 'chrome-linux', 'chrome'), path.join(pw, dir, 'chrome-win', 'chrome.exe'));
    }
  }
  for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
    candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

// window.api saplaması: her çağrı kaydedilir. Sekme listesi senaryoya göre boş
// ya da yüklü bir sayfadır; diğer çağrılar null döner (hata yolları da geri
// bildirim vermeli — sessiz kalmak tam da aradığımız hata).
const STUB = `(() => {
  const params = new URLSearchParams(location.search);
  const url = params.get('tab') || '';
  window.__smoke = { calls: [], errors: [], occluded: [] };
  const tab = { id: 't1', generation: 1, url, title: url ? 'Örnek sayfa' : '', loading: false, canGoBack: !!url, canGoForward: false };
  window.api = new Proxy({}, { get(_, key) {
    if (key === 'then') return undefined;
    if (typeof key === 'string' && /^on[A-Z]/.test(key)) return () => () => {};
    return (...callArgs) => {
      window.__smoke.calls.push(String(key));
      if (key === 'setBrowserOccluded') window.__smoke.occluded.push(!!callArgs[0]);
      if (key === 'showBrowser' || key === 'listBrowserTabs') return Promise.resolve({ ok: true, tabs: [tab], activeTabId: 't1' });
      if (key === 'copyText') return Promise.resolve(true);
      if (key === 'getSettings') return Promise.resolve({});
      return Promise.resolve(null);
    };
  } });
  addEventListener('error', (event) => window.__smoke.errors.push(String(event.message)));
  addEventListener('unhandledrejection', (event) => window.__smoke.errors.push('promise: ' + String(event.reason && event.reason.message || event.reason)));
})();`;

function stageRenderer() {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-smoke-'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(stage, 'src'), { recursive: true });
  const renderer = path.join(stage, 'src', 'renderer');
  fs.writeFileSync(path.join(renderer, 'ui-smoke-stub.js'), STUB);
  const htmlPath = path.join(renderer, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const first = html.indexOf('<script src=');
  fs.writeFileSync(htmlPath, `${html.slice(0, first)}<script src="ui-smoke-stub.js"></script>\n  ${html.slice(first)}`);
  return { stage, url: pathToFileURL(htmlPath).href };
}

// Denenecek menüler: [kök seçici, öğe seçici]. Kök bir <details> ise önce açılır.
const MENUS = [
  ['#appModeMenu', '[role^="menuitem"]'],
  ['#appMenu', '[role^="menuitem"]'],
  ['#browserSiteChipDetails', 'button'],
  ['#browserTranslateMenu', 'button[role="menuitem"]'],
  ['#browserPageQuickMenu', 'button'],
  ['#browserMoreMenu', 'button'],
];

// Sayfa içinde çalışır: öğeye tıklar ve etkisini ölçer.
const PROBE = `async (menuSel, index) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = document.querySelector(menuSel);
  if (!root) return { skip: 'menu-missing' };
  document.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  const openChain = (el) => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; };
  const items = [...root.querySelectorAll(${JSON.stringify('__ITEMSEL__')})];
  const item = items[index];
  if (!item) return { skip: 'item-missing' };
  openChain(item);
  await sleep(60);
  const label = (item.getAttribute('aria-label') || item.textContent || item.title || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const id = item.id || item.dataset.browserProxy || item.dataset.pageView || '';
  if (item.disabled || item.getAttribute('aria-disabled') === 'true') return { id, label, disabled: true };
  if (!item.getClientRects().length) return { id, label, hidden: true };
  const noise = /^(setBrowserOccluded|setBrowserBounds|showBrowser|listBrowserJobs|snapshotBrowserPage|updateBrowserSessionTab)$/;
  const callsBefore = window.__smoke.calls.length;
  const errorsBefore = window.__smoke.errors.length;
  const focusBefore = document.activeElement;
  const signalBefore = document.getElementById('browserSignalText')?.textContent || '';
  const menuRoot = item.closest('details') || root;
  // Öğeyi içeren bütün menü katmanları (⋯ menüsü + "Sayfa" alt grubu gibi).
  const menuChain = new Set([root]);
  for (let d = item.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) menuChain.add(d);
  const touched = new Set();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target) continue;
      // Menünün kendi kapanışı (details open / summary aria-expanded) etki sayılmaz.
      // Açık kalan menünün içindeki görünür değişiklik (ör. seçili görünüm) sayılır;
      // kapanan menünün içi zaten görünmez olduğundan aşağıdaki filtre eler.
      if (record.type === 'attributes' && menuChain.has(target) && record.attributeName === 'open') continue;
      if (record.type === 'attributes' && /^(aria-expanded|aria-disabled)$/.test(record.attributeName)) continue;
      touched.add(target);
      for (const node of record.addedNodes || []) if (node.nodeType === 1) touched.add(node);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  item.click();
  await sleep(450);
  observer.disconnect();
  // Yalnız kullanıcının görebileceği değişiklik etki sayılır: gizli bir
  // kabuktaki <details>'i açmak ya da görünmez menüyü yeniden kurmak ekranda
  // hiçbir şey göstermez (tarayıcı modunda "Görünüm düzeni" hatası buydu).
  const visible = (el) => el.isConnected && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.hidden, [hidden]');
  const visibleTouched = [...touched].filter(visible);
  const meaningful = visibleTouched.length;
  const touchedDesc = visibleTouched.slice(0, 4).map((el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
  const calls = window.__smoke.calls.slice(callsBefore).filter((name) => !noise.test(name));
  const errors = window.__smoke.errors.slice(errorsBefore);
  const focusMoved = document.activeElement !== focusBefore && !menuRoot.contains(document.activeElement)
    && document.activeElement !== document.body;
  const signal = (document.getElementById('browserSignalText')?.textContent || '') !== signalBefore;
  return { id, label, calls: calls.slice(0, 6), mutations: meaningful, touched: touchedDesc, focusMoved, signal, errors };
}`;

// Her denemeden önce uygulamayı nötr duruma döndürür. Önceki tıklamanın açtığı
// panel, çekmece ya da "sade görünüm" gibi kalıcı anahtar sonraki öğeleri
// gizleyip yanlış "etkisiz" sonuçları üretmesin.
const RESET = `(async () => {
  const quiet = (fn) => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (_) {} };
  document.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  quiet(() => closeBrowserTabMenu());
  quiet(() => closeBrowserTransientPanels());
  quiet(() => closeBrowserFind(false));
  quiet(() => setSettingsDrawer(false));
  quiet(() => closeBrowserSettings());
  quiet(() => setPlayerTaskCenter(false));
  quiet(() => setShortcutHelpOpen(false));
  quiet(() => setBrowserChromeCollapsed(false, false));
  quiet(() => { if (player.pdfReader) document.getElementById('pdfReaderClose')?.click(); });
  quiet(() => document.getElementById('mediaCatalogDialog')?.open && document.getElementById('mediaCatalogDialog').close());
  quiet(() => { const layer = document.getElementById('playerLayer'); layer?.classList.remove('hidden'); });
  if (player.workspaceMode !== 'browser') document.getElementById('workspaceBrowserMode')?.click();
  await new Promise((r) => setTimeout(r, 60));
  document.activeElement?.blur?.();
})()`;

// Paneller: aç, Esc'e bas, kapandı mı ve örtü kalktı mı?
const PANELS = [
  ['browserPlacesPanel', "document.getElementById('browserPlacesToggle').click()"],
  ['browserDownloadsPanel', "document.getElementById('browserDownloadsToggle').click()"],
  ['browserQrPanel', "document.getElementById('browserShowQr').click()"],
  ['browserCommandPalette', "document.getElementById('browserCommandPaletteToggle').click()"],
  ['browserFindBar', "document.getElementById('browserFindOpen').click()"],
];
const ESCAPE_PROBE = `async (panelId, openCode) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  (0, eval)(openCode);
  await sleep(250);
  const panel = document.getElementById(panelId);
  if (!panel || panel.classList.contains('hidden')) return { skip: 'did-not-open' };
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : panel;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await sleep(250);
  return { closed: panel.classList.contains('hidden'), occludedAfter: window.__smoke.occluded.at(-1) === true };
}`;

function loadAllow() {
  try { return JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8')); } catch (_) { return { silent: {} }; }
}

async function main() {
  const browser = findBrowser();
  if (!browser) { console.error('Chromium/Chrome/Edge bulunamadı. --browser <yol> veya CHROME_PATH verin.'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const { stage, url } = stageRenderer();
  const allow = loadAllow();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const port = 9800 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-smoke-profile-'));
  const child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--allow-file-access-from-files', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 150 && !target; i += 1) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); }
    catch (_) { /* henüz hazır değil */ }
    if (!target) await sleep(200);
  }
  if (!target) { child.kill(); throw new Error('Tarayıcı hata ayıklama bağlantısı açılmadı.'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (message) => { const data = JSON.parse(message.data); pending.get(data.id)?.(data); pending.delete(data.id); };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.exceptionDetails) return { evalError: result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text };
    return result.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

  const findings = [];
  const report = { browser, generatedAt: new Date().toISOString(), scenarios: [] };
  const scenarios = [['bos-sekme', ''], ['yuklu-sayfa', 'https://example.com/makale']];
  try {
    for (const [scenario, tabUrl] of scenarios) {
      const pageUrl = `${url}?tab=${encodeURIComponent(tabUrl)}`;
      await send('Page.navigate', { url: pageUrl }); await sleep(600);
      await evaluate('try { localStorage.clear(); } catch (_) {}');
      await send('Page.navigate', { url: pageUrl }); await sleep(1800);
      await evaluate(`document.getElementById('openPlayer')?.click()`); await sleep(500);
      await evaluate(`document.getElementById('workspaceBrowserMode')?.click()`); await sleep(900);
      const loadErrors = await evaluate('window.__smoke.errors.slice()');
      for (const message of loadErrors || []) findings.push({ kind: 'error', scenario, where: 'açılış', message });
      const run = { scenario, items: [], panels: [] };
      for (const [menuSel, itemSel] of MENUS) {
        if (ONLY && !menuSel.includes(ONLY)) continue;
        const probe = PROBE.replace(JSON.stringify('__ITEMSEL__'), JSON.stringify(itemSel));
        const count = await evaluate(`document.querySelector(${JSON.stringify(menuSel)})?.querySelectorAll(${JSON.stringify(itemSel)}).length || 0`);
        for (let index = 0; index < count; index += 1) {
          // Her tıklama temiz durumdan: açık paneller kapatılır, tarayıcı moduna dönülür.
          await evaluate(RESET);
          await sleep(150);
          const result = await evaluate(`(${probe})(${JSON.stringify(menuSel)}, ${index})`);
          if (!result || result.skip) continue;
          if (result.evalError) { findings.push({ kind: 'error', scenario, where: `${menuSel} #${index}`, message: result.evalError }); continue; }
          const key = `${menuSel} ${result.id || result.label}`;
          run.items.push({ key, ...result });
          if (result.disabled || result.hidden) continue;
          for (const message of result.errors) findings.push({ kind: 'error', scenario, where: key, message });
          const effect = result.calls.length || result.mutations || result.focusMoved || result.signal;
          const allowed = allow.silent?.[key] && (!allow.silent[key].scenario || allow.silent[key].scenario === scenario);
          if (!effect && !allowed) findings.push({ kind: 'silent', scenario, where: key, message: `"${result.label}" tıklanınca hiçbir şey olmadı` });
        }
      }
      if (!ONLY) {
        for (const [panelId, openCode] of PANELS) {
          await evaluate(RESET);
          await sleep(150);
          const result = await evaluate(`(${ESCAPE_PROBE})(${JSON.stringify(panelId)}, ${JSON.stringify(openCode)})`);
          run.panels.push({ panelId, ...result });
          if (result?.evalError) { findings.push({ kind: 'error', scenario, where: panelId, message: result.evalError }); continue; }
          if (!result || result.skip) continue;
          if (!result.closed) findings.push({ kind: 'escape', scenario, where: panelId, message: 'Esc paneli kapatmadı' });
          else if (result.occludedAfter) findings.push({ kind: 'occluded', scenario, where: panelId, message: 'panel kapandıktan sonra sayfa örtülü kaldı' });
        }
      }
      report.scenarios.push(run);
    }
  } finally {
    ws.close();
    child.kill();
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
  report.findings = findings;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const tested = report.scenarios.reduce((sum, run) => sum + run.items.filter((item) => !item.disabled && !item.hidden).length, 0);
  console.log(`ui-smoke: ${tested} tıklama, ${findings.length} bulgu → ${path.relative(process.cwd(), path.join(OUT, 'report.json'))}`);
  for (const finding of findings) console.log(`  [${finding.kind}] (${finding.scenario}) ${finding.where}: ${finding.message}`);
  if (STRICT && findings.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(2); });
