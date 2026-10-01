'use strict';

// R334 — renderer.js fonksiyon-kapsamı + UI monkey-fuzz sürücüsü.
// Gerçek Electron uygulamasını açar, ana pencerenin WebContents'ine CDP
// `Profiler.startPreciseCoverage` bağlar, bilinen yüzeyleri deterministik
// gezer + tohumlu rastgele tıklama/klavye fırtınası koşturur, console
// hatalarını hasat eder, precise-coverage JSON'unu diske yazar.
//
// Çıktılar:
//   $FUZZ_COV_DIR/renderer-coverage.json  — takePreciseCoverage sonucu
//   stdout: console hataları + özet
//
// Çalıştırma: xvfb-run -a npx electron tools/ui-fuzz-coverage.js --disable-gpu
//   FUZZ_STEPS=400 FUZZ_COV_DIR=/home/ubuntu/v8cov-renderer

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-cov-'));
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const COV_DIR = process.env.FUZZ_COV_DIR || out;
fs.mkdirSync(COV_DIR, { recursive: true });
const FUZZ_STEPS = Number(process.env.FUZZ_STEPS) || 400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 15000, stepMs = 150) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// Deterministik PRNG (mulberry32) — tekrarlanabilir fırtına.
let seed = 0xC0FFEE;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const ERROR_ALLOW = [/Autofill/i];
const errors = [];

app.setAppPath(path.resolve(__dirname, '..'));
require('../src/main.js');

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html')),
      'Ana pencere', 90000);
    const wc = win.webContents;
    wc.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 3 && !ERROR_ALLOW.some((rx) => rx.test(message))) {
        errors.push({ message: String(message).slice(0, 300), line, sourceId });
      }
    });
    const run = (code) => wc.executeJavaScript(`(async()=>{${code}})()`, true);
    await until(() => wc.isLoading() ? null : true, 'yükleniyor', 90000);
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);

    // ── Precise coverage ──
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Profiler.enable');
    await wc.debugger.sendCommand('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    console.log('[fuzz-cov] precise coverage bağlı');

    // ── 1) Bilinen yüzeyler: hızlı deterministik tur ──
    await run(`document.querySelectorAll('details').forEach((d) => { d.open = true; }); return true;`);
    for (const tab of ['subs', 'ai', 'library', 'tools']) {
      await run(`if (typeof setSideTab === 'function') setSideTab(${JSON.stringify(tab)}); return true;`);
      await wait(120);
    }
    await run(`if (typeof openPlayer === 'function') openPlayer(); return true;`);
    await wait(250);
    // Tarayıcı yüzeyi: yeni sekme + NTP etkileşimi + menüler
    await run(`if (typeof openBrowserTab === 'function') openBrowserTab(); return true;`);
    await wait(250);
    await run(`for (const sel of ['#browserMoreBtn', '#moreBtn', '#appMenuBtn']) {
      const el = document.querySelector(sel); if (el) { el.click(); break; } } return true;`);
    await wait(200);
    await run(`document.querySelectorAll('details[open]').forEach((d) => { d.open = false; }); return true;`);

    // ── 2) Monkey fırtına: tohumlu rastgele tık + klavye ──
    const CLICKABLE = 'button, [role="button"], summary, a, input, select, textarea, label, .chip, .tab, [data-action], [data-tab], details summary';
    for (let i = 0; i < FUZZ_STEPS; i++) {
      try {
        const action = rnd();
        if (action < 0.7) {
          // Rastgele tıklanabilir öğeye tık
          await run(`const els = [...document.querySelectorAll(${JSON.stringify(CLICKABLE)})]
            .filter((el) => { const r = el.getBoundingClientRect();
              return r.width > 2 && r.height > 2 && !el.disabled &&
                getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null; });
            if (!els.length) return 'none';
            const el = els[${Math.floor(rnd() * 10000)} % els.length];
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            el.click(); return el.tagName + ':' + (el.id || el.className || '');`);
        } else if (action < 0.9) {
          // Rastgele klavye olayı
          const key = pick(['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', ' ', 'a', 'b', 'k', '1']);
          await run(`const ev = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true });
            document.activeElement?.dispatchEvent(ev) || document.body.dispatchEvent(ev); return true;`);
        } else {
          // Odaklı input'a rastgele yazı
          await run(`const inp = [...document.querySelectorAll('input[type="text"], input:not([type]), textarea')]
            .find((el) => el.offsetParent !== null && !el.disabled && !el.readOnly);
            if (!inp) return 'none';
            inp.focus(); inp.value = 'fz' + Math.random().toString(36).slice(2, 8);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
        }
        if (i % 50 === 0) console.log(`[fuzz] ${i}/${FUZZ_STEPS}`);
        await wait(30 + Math.floor(rnd() * 60));
      } catch (error) {
        // Fırtına sırasında tek adım hatası ölümcül değil — kayda geç.
        errors.push({ message: `fuzz-adım-${i}: ${String(error && error.message || error).slice(0, 200)}`, line: 0, sourceId: 'fuzz' });
      }
    }

    // ── 3) Kapsam hasadı ──
    const cov = await wc.debugger.sendCommand('Profiler.takePreciseCoverage');
    await wc.debugger.sendCommand('Profiler.stopPreciseCoverage').catch(() => {});
    wc.debugger.detach();
    const covPath = path.join(COV_DIR, 'renderer-coverage.json');
    fs.writeFileSync(covPath, JSON.stringify(cov.result, null, 0));
    const fn = cov.result.find((r) => r.url.includes('renderer.js'));
    const total = fn ? fn.functions.length : 0;
    const dead = fn ? fn.functions.filter((f) => f.ranges.every((r) => r.count === 0)).length : 0;
    console.log(`[fuzz-cov] renderer.js: ${total} fonksiyon bloğu, ${dead} hiç çalışmadı → ${covPath}`);
    if (errors.length) {
      console.log(`[fuzz-cov] ${errors.length} console/fuzz hatası:`);
      for (const e of errors.slice(0, 40)) console.log('  -', e.message, `(${e.sourceId || ''}:${e.line || 0})`);
      exitCode = errors.some((e) => e.sourceId !== 'fuzz') ? 1 : 0;
    } else {
      console.log('[fuzz-cov] console hatası yok');
    }
  } catch (error) {
    console.error('[fuzz-cov] FATAL:', error);
    exitCode = 1;
  } finally {
    app.exit(exitCode);
  }
});
