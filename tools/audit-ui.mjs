#!/usr/bin/env node
// Arayüz denetimi: renderer'ı başsız Chromium'da saplanmış (stub) window.api ile açar,
// açık/koyu tema × TR/EN × genişlik matrisinde görünür metinlerin WCAG kontrastını ölçer
// ve her yüzeyin ekran görüntüsünü alır.
//
//   npm run audit:ui                       # rapor + ekran görüntüleri (tmp/ui-audit)
//   npm run audit:ui -- --strict           # kontrast hatası varsa çıkış kodu 1
//   npm run audit:ui -- --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
//
// Tarayıcı sırası: --browser, CHROME_PATH, Playwright Chromium (/opt/pw-browsers),
// Windows/macOS/Linux'ta yaygın Chrome/Edge/Chromium yolları. Ek npm paketi gerekmez
// (Node 22'nin yerleşik WebSocket'i ile ham CDP).

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
const OUT = path.resolve(option('--out', path.join(ROOT, 'tmp', 'ui-audit')));
const STRICT = flag('--strict');

function findBrowser() {
  const candidates = [option('--browser'), process.env.CHROME_PATH];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const dir of fs.readdirSync(pw).filter((name) => name.startsWith('chromium')).sort().reverse()) {
      candidates.push(path.join(pw, dir, 'chrome-linux', 'chrome'), path.join(pw, dir, 'chrome-win', 'chrome.exe'));
    }
  }
  const programFiles = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const base of programFiles) {
    candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

// Renderer'ın ihtiyaç duyduğu dosyaları geçici klasöre kopyala ve window.api saplamasını
// renderer betiklerinden ÖNCE yükle. Kaynak ağacına dokunulmaz.
function stageRenderer() {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-audit-'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(stage, 'src'), { recursive: true });
  const renderer = path.join(stage, 'src', 'renderer');
  fs.writeFileSync(path.join(renderer, 'ui-audit-stub.js'), `(() => {
    const noop = () => Promise.resolve(null);
    window.api = new Proxy({}, { get(_, key) {
      if (key === 'then') return undefined;
      if (typeof key === 'string' && /^on[A-Z]/.test(key)) return () => () => {};
      return noop;
    } });
    window.__uiAuditErrors = [];
    addEventListener('error', (event) => window.__uiAuditErrors.push(String(event.message)));
  })();`);
  const htmlPath = path.join(renderer, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const first = html.indexOf('<script src=');
  fs.writeFileSync(htmlPath, `${html.slice(0, first)}<script src="ui-audit-stub.js"></script>\n  ${html.slice(first)}`);
  return { stage, url: pathToFileURL(htmlPath).href };
}

const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const blend = (t, b) => { const a = t[3]; return [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1]; };
  const bgOf = (el) => { const stack = []; let e = el;
    while (e) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null;
      const b = parse(cs.backgroundColor); if (b && b[3] > 0) { stack.push(b); if (b[3] >= 1) break; } e = e.parentElement; }
    let c = stack.length && stack[stack.length - 1][3] >= 1 ? stack.pop()
      : (parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]);
    while (stack.length) c = blend(stack.pop(), c); return c; };
  const out = []; const root = document.querySelector(window.__uiAuditScope || 'body'); if (!root) return out;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode; if (!node.nodeValue.trim()) continue;
    const el = node.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const rect = el.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) continue;
    if (el.closest('[hidden],.hidden,:disabled,[aria-disabled="true"]')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= +getComputedStyle(e).opacity;
    const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
    const mixed = blend([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const a = lum(mixed); const b = lum(bg); const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({ text: node.nodeValue.trim().slice(0, 50),
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
      ratio: +ratio.toFixed(2), need, color: cs.color });
  }
  return out;
})()`;

const SURFACES = [
  ['browser-home', '#playerLayer', ''],
  ['address-results', '#browserAddressResults', `(() => {
    const panel = document.getElementById('browserAddressResults'); if (!panel) return;
    const rows = [['S', 'Wikipedia: Özgür Ansiklopedi', 'https://tr.wikipedia.org', 'Açık sekme'],
      ['G', 'YouTube — uzun bir video başlığı ile taşma denemesi', 'https://www.youtube.com/watch?v=abc', 'Geçmiş'],
      ['A', '"altyazı" için git veya ara', 'Varsayılan arama motoru', 'Web']];
    panel.innerHTML = rows.map((r, i) => '<div class="browser-address-result' + (i ? '' : ' is-selected') + '" role="option" data-address-result="' + i + '"><span class="browser-address-result-mark">' + r[0] + '</span><span class="browser-address-result-copy"><strong>' + r[1] + '</strong><small>' + r[2] + '</small></span><span class="browser-address-result-kind">' + r[3] + '</span></div>').join('');
    panel.classList.remove('hidden'); })()`],
  ['find-bar', '#browserFindBar', `document.getElementById('browserAddressResults')?.classList.add('hidden'); document.getElementById('browserFindBar')?.classList.remove('hidden')`],
  ['places', '#browserPlacesPanel', `document.getElementById('browserFindBar')?.classList.add('hidden'); document.getElementById('browserPlacesPanel')?.classList.remove('hidden')`],
  ['downloads', '#browserDownloadsPanel', `document.getElementById('browserPlacesPanel')?.classList.add('hidden'); document.getElementById('browserDownloadsPanel')?.classList.remove('hidden')`],
];

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('Chromium/Chrome/Edge bulunamadı. --browser <yol> veya CHROME_PATH verin.');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const { stage, url } = stageRenderer();
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-audit-profile-'));
  const child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let target;
  for (let i = 0; i < 75 && !target; i += 1) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); }
    catch (_) { /* tarayıcı henüz hazır değil */ }
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
    return result.result?.exceptionDetails ? { error: result.result.exceptionDetails.text } : result.result?.result?.value;
  };
  const shot = async (file, clip) => {
    const result = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.writeFileSync(file, Buffer.from(result.result.data, 'base64'));
  };
  await send('Page.enable'); await send('Runtime.enable');
  const report = { browser, generatedAt: new Date().toISOString(), runs: [] };
  let failures = 0;
  try {
    for (const width of [1400, 1100, 900]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const locale of ['tr', 'en']) {
        await send('Page.navigate', { url }); await sleep(1500);
        await evaluate(`localStorage.setItem('whisper.uiLocale', '${locale}')`);
        await send('Page.navigate', { url }); await sleep(2200);
        await evaluate(`document.getElementById('openPlayer')?.click()`); await sleep(1000);
        for (const theme of ['dark', 'light']) {
          await evaluate(`document.documentElement.dataset.theme = '${theme}'`); await sleep(250);
          for (const [name, scope, prepare] of SURFACES) {
            if (width !== 1400 && name !== 'browser-home') continue;
            if (prepare) { await evaluate(prepare); await sleep(200); }
            await evaluate(`window.__uiAuditScope = '${scope}'`);
            const problems = await evaluate(CONTRAST);
            const list = Array.isArray(problems) ? problems : [];
            failures += list.length;
            const file = path.join(OUT, `${name}-${theme}-${locale}-${width}.png`);
            const rect = await evaluate(`(() => { const r = document.querySelector('${scope}')?.getBoundingClientRect(); return r && r.width ? { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(${width}, r.width + 24), height: Math.min(900, r.height + 24) } : null; })()`);
            await shot(file, rect && name !== 'browser-home' ? rect : null);
            report.runs.push({ surface: name, theme, locale, width, screenshot: path.relative(OUT, file), contrastFailures: list });
            console.log(`${list.length ? 'FAIL' : ' ok '}  ${name.padEnd(16)} ${theme.padEnd(5)} ${locale} ${width}px  kontrast hatası: ${list.length}`);
            for (const item of list.slice(0, 5)) console.log(`        ${item.ratio}:1 < ${item.need}  ${item.selector}  "${item.text}"`);
          }
        }
        const errors = await evaluate('window.__uiAuditErrors || []');
        if (Array.isArray(errors) && errors.length) report.runs.push({ locale, width, scriptErrors: errors.slice(0, 20) });
      }
    }
  } finally {
    ws.close(); child.kill();
    fs.rmSync(stage, { recursive: true, force: true });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* Windows kilidi */ }
  }
  report.totalContrastFailures = failures;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nRapor: ${path.join(OUT, 'report.json')} · toplam kontrast hatası: ${failures}`);
  if (STRICT && failures) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
