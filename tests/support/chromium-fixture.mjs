// Kontrollü Chromium düzeneği: gerçek renderer HTML/CSS/JS'sini başsız Chromium'da,
// sahte (stub) window.api ile açar. Ek npm paketi gerekmez (Node'un yerleşik WebSocket'i ile ham CDP).
// Mock, canlı sağlayıcı/Electron/mpv/GPU başarısı değildir; yalnız renderer mantığını ve görünümü sınar.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function findChromium(explicit = '') {
  const candidates = [explicit, process.env.CHROME_PATH];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const dir of fs.readdirSync(pw).filter(name => name.startsWith('chromium')).sort().reverse()) {
      candidates.push(path.join(pw, dir, 'chrome-linux64', 'chrome'), path.join(pw, dir, 'chrome-linux', 'chrome'), path.join(pw, dir, 'chrome-win', 'chrome.exe'));
    }
  }
  for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
    candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || '';
}

// src/ ağacını geçici klasöre kopyalar ve index.html'e stub betiklerini ilk <script src=> öncesine ekler.
export function stageRenderer(stubFiles, { rootDir = ROOT } = {}) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-fixture-'));
  fs.cpSync(path.join(rootDir, 'src'), path.join(stage, 'src'), { recursive: true });
  const renderer = path.join(stage, 'src', 'renderer');
  const tags = [];
  for (const [index, file] of stubFiles.entries()) {
    const name = `fixture-stub-${index}.js`;
    fs.copyFileSync(file, path.join(renderer, name));
    tags.push(`<script src="${name}"></script>`);
  }
  const htmlPath = path.join(renderer, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const first = html.indexOf('<script src=');
  fs.writeFileSync(htmlPath, `${html.slice(0, first)}${tags.join('\n  ')}\n  ${html.slice(first)}`);
  return { stage, url: pathToFileURL(htmlPath).href, cleanup: () => fs.rmSync(stage, { recursive: true, force: true }) };
}

function hash(text) { let value = 2166136261; for (const char of String(text)) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; }
const esc = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

// Kontrollü afiş/arka plan: https://images.metahub.space/{poster|background}/…/{ttId}/img?t=Başlık&y=Yıl
export function artworkSvg(url) {
  const parsed = new URL(url);
  const id = parsed.pathname.match(/tt\d+/)?.[0] || parsed.pathname;
  const wide = /background|backdrop|\/w1280|\/w780/.test(parsed.pathname);
  const seed = hash(id), hue = seed % 360, hue2 = (hue + 40 + (seed >> 8) % 80) % 360;
  const title = parsed.searchParams.get('t') || id, year = parsed.searchParams.get('y') || '';
  const [w, h] = wide ? [1280, 720] : [300, 450];
  const words = title.split(/\s+/); const lines = []; let line = '';
  for (const word of words) { if ((line + ' ' + word).trim().length > (wide ? 26 : 12)) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  if (line) lines.push(line);
  const size = wide ? 64 : 30, text = wide ? '' : lines.slice(0, 4).map((value, index) => `<text x="${wide ? 90 : 24}" y="${(wide ? 420 : 300) + index * size * 1.15}" font-family="Georgia,serif" font-size="${size}" fill="#fff" fill-opacity=".92">${esc(value)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 46% 22%)"/><stop offset="1" stop-color="hsl(${hue2} 52% 11%)"/></linearGradient><radialGradient id="r" cx=".7" cy=".25" r=".6"><stop offset="0" stop-color="hsl(${hue2} 80% 62%)" stop-opacity=".55"/><stop offset="1" stop-color="hsl(${hue2} 80% 62%)" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#r)"/><circle cx="${w * .72}" cy="${h * .3}" r="${h * .16}" fill="hsl(${hue2} 70% 70%)" fill-opacity=".35"/>${text}${year && !wide ? `<text x="24" y="${h - 26}" font-family="sans-serif" font-size="18" fill="#f4b94b">${esc(year)}</text>` : ''}</svg>`;
}

export async function launch({ browser = '', width = 1440, height = 900, scale = 1, extraArgs = [] } = {}) {
  const executable = findChromium(browser);
  if (!executable) throw new Error('Chromium bulunamadı. --browser <yol> ya da CHROME_PATH kullan.');
  let target, child, profile, lastErr = '';
  for (let attempt = 0; attempt < 3 && !target; attempt += 1) {
    const port = 9400 + Math.floor(Math.random() * 500);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-fixture-profile-'));
    child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb', ...extraArgs, `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let exited = false;
    child.on('exit', (code, signal) => { exited = true; lastErr = `exit=${code} signal=${signal}`; });
    child.stderr.on('data', data => { lastErr = String(data).trim().slice(-300); });
    for (let i = 0; i < 150 && !target && !exited; i += 1) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page'); } catch { /* henüz hazır değil */ }
      if (!target) await sleep(200);
    }
    if (!target) { try { child.kill(); } catch { /* çıkmış */ } fs.rmSync(profile, { recursive: true, force: true }); }
  }
  if (!target) throw new Error(`Tarayıcı hata ayıklama bağlantısı açılmadı (${lastErr || 'zaman aşımı'}).`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { ws.onopen = resolve; });
  let seq = 0; const pending = new Map(); const listeners = new Set();
  ws.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } else for (const listener of listeners) listener(data);
  };
  // Donmuş bir sayfa Input/Runtime çağrılarını yanıtsız bırakır; zaman aşımı koşuyu kilitlemek yerine açık hata üretir.
  const send = (method, params = {}, { timeout = 20000 } = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(Error(`${method}: ${timeout} ms içinde yanıt yok (sayfa donmuş olabilir)`), { timeout: true })); }, timeout);
    pending.set(id, reply => { clearTimeout(timer); reply.error ? reject(Object.assign(Error(`${method}: ${reply.error.message}`), { cdp: reply.error })) : resolve(reply.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const pageErrors = [], dialogs = [];
  listeners.add(event => {
    if (event.method === 'Runtime.exceptionThrown') pageErrors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') pageErrors.push('console.error: ' + event.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ').slice(0, 300));
    if (event.method === 'Page.javascriptDialogOpening') {
      // Sayfa diyaloğu CDP girişini bloklar; kaydet ve reddet (iptal), testin kilitlenmesini önle.
      dialogs.push(`${event.params.type}: ${String(event.params.message).slice(0, 200)}`);
      void send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }
    if (event.method === 'Fetch.requestPaused') {
      const { requestId, request } = event.params;
      if (/^https:\/\/(images\.metahub\.space|image\.tmdb\.org)\//.test(request.url)) {
        const body = Buffer.from(artworkSvg(request.url)).toString('base64');
        void send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'image/svg+xml' }, { name: 'access-control-allow-origin', value: '*' }], body }).catch(() => {});
      } else void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }, { urlPattern: 'http://*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  const evaluate = async (expression, { awaitPromise = true, timeout = 20000 } = {}) => {
    // Hiç çözülmeyen kapı (hold) tüm koşuyu kilitlemesin: her değerlendirme zaman aşımıyla sınırlı.
    let timer; const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`evaluate zaman aşımı (${timeout} ms): ${String(expression).slice(0, 140)}`)), timeout); });
    const result = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }), limit]).finally(() => clearTimeout(timer));
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const api = {
    send, evaluate, pageErrors, dialogs, executable,
    on: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    viewport: (w, h, deviceScaleFactor = scale, extra = {}) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor, mobile: false, ...extra }),
    goto: async url => { await send('Page.navigate', { url }); },
    screenshot: async (file, { clip } = {}) => {
      const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); return file;
    },
    until: async (expression, label, timeout = 15000) => {
      const deadline = Date.now() + timeout; let last;
      while (Date.now() < deadline) { try { last = await evaluate(`Boolean(${expression})`); if (last) return true; } catch (error) { last = error.message; } await sleep(60); }
      throw new Error(`Zaman aşımı: ${label} (${expression}) son=${last}`);
    },
    // Gerçek fare: öğeyi görünür kılar, merkezine basar/bırakır; odak ve hover kullanıcıdaki gibi çalışır.
    click: async (expression, { clickCount = 1, wait = 5000 } = {}) => {
      const probe = `(()=>{const e=${expression};if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const top=document.elementFromPoint(x,y);return {x,y,hit:!!top&&(top===e||e.contains(top)),cover:top?top.tagName+'.'+String(top.className).split(' ')[0]:'yok'};})()`;
      const deadline = Date.now() + wait; let point;
      while (Date.now() < deadline) { point = await evaluate(probe); if (point?.hit) break; await sleep(60); }
      if (!point) throw new Error(`Tıklanacak öğe yok: ${expression}`);
      if (!point.hit) throw new Error(`Öğe tıklanabilir değil (üstünde ${point.cover}): ${expression}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount });
      return point;
    },
    wheel: (x, y, deltaY) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }),
    listeners: async () => {
      const count = async expression => { const { result } = await send('Runtime.evaluate', { expression }); const { listeners } = await send('DOMDebugger.getEventListeners', { objectId: result.objectId }); return listeners.length; };
      return { doc: await count('document'), win: await count('window'), body: await count('document.body') };
    },
    type: async text => { await send('Input.insertText', { text }); },
    key: async (key, { code = key, modifiers = 0 } = {}) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, ...(key === 'Enter' ? { text: '\r' } : {}), windowsVirtualKeyCode: { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ' ': 32 }[key] || 0 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ' ': 32 }[key] || 0 });
    },
    close: async () => { try { ws.close(); } catch { /* kapalı */ } try { child.kill(); } catch { /* çıkmış */ } await sleep(150); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch { /* geçici profil; işletim sistemi temizler */ } },
  };
  return api;
}
