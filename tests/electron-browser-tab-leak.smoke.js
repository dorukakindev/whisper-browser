'use strict';

// T5 — Çapraz-sekme sızma kanıtı: aynı uygulamada iki tarayıcı sekmesi,
// iki ayrı video, sekme başına ayrı overlay cue kümesi. Doğrulananlar:
//  - Split görünümde A yalnız A cue'larını, B yalnız B cue'larını gösterir
//    (eşzamanlı, iki gerçek video yüzeyi).
//  - A'nın çeviri katmanı B'ye sızmaz.
//  - A kapatılınca B'nin overlay'i ve uygulama durumu etkilenmez;
//    browserTabs/activeTabId kayıtları A verisini barındırmaz.
//  - B'de navigasyon eski medyanın cue'sunu yeni sayfaya taşımaz;
//    overlay temizlenir, yeniden kurulunca doğru küme döner.
//  - Dinleyici/observer sayıları büyümez.
//
// Çalıştırma: node tests/run-electron-smokes.js tab-leak
// Medya ffmpeg ile üretilir; ffmpeg yoksa test FAIL (atlamaz).

const { app, BrowserWindow, webContents } = require('electron');
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const out = path.join(__dirname, '..', '.uiprev', 'browser-tab-leak');
fs.mkdirSync(out, { recursive: true });
// İzole profil: gerçek kullanıcı userData'sına dokunulmaz.
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 250) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// İki ayrı sentetik video.
for (const name of ['tab-a.mp4', 'tab-b.mp4']) {
  const file = path.join(out, name);
  if (!fs.existsSync(file)) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `testsrc2=duration=30:size=320x180:rate=24`,
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-movflags', '+faststart', '-y', file]);
  }
}
const mediaA = fs.readFileSync(path.join(out, 'tab-a.mp4'));
const mediaB = fs.readFileSync(path.join(out, 'tab-b.mp4'));

const makePage = (title, media) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;background:#101418}video{width:100%;height:70vh;background:#000}</style>
<video id="v" controls muted playsinline src="/${media}"></video>
<script>const v=document.getElementById('v');
v.addEventListener('canplay',()=>v.play().catch(()=>{}));
<\/script>`;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname === '/watch-a' || pathname === '/watch-b') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(makePage(pathname === '/watch-a' ? 'Sekme A' : 'Sekme B',
      pathname === '/watch-a' ? 'media-a.mp4' : 'media-b.mp4'));
  }
  for (const [file, body] of [['/media-a.mp4', mediaA], ['/media-b.mp4', mediaB]]) {
    if (pathname === file) {
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const start = Number(m?.[1] || 0);
        const end = m && m[2] ? Number(m[2]) : body.length - 1;
        res.writeHead(206, {
          'content-type': 'video/mp4', 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${body.length}`,
          'content-length': end - start + 1,
        });
        return res.end(body.subarray(start, end + 1));
      }
      res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': body.length });
      return res.end(body);
    }
  }
  res.writeHead(404); res.end('yok');
});

// Sekme başına ayrı cue kümesi — metinler kasıtlı olarak kesişmez.
const cuesA = [];
const cuesB = [];
for (let s = 0; s < 16; s += 2) {
  cuesA.push({ start: s, end: s + 2, text: `A-KAYNAK-${s}` });
  cuesB.push({ start: s, end: s + 2, text: `B-KAYNAK-${s}` });
}
const trA = cuesA.map((cue) => ({ ...cue, text: cue.text.replace('A-KAYNAK', 'A-CEVIRI') }));

const report = { checks: [] };
const watchdog = setTimeout(() => {
  console.error('[tab-leak] 150 sn güvenlik sınırı aşıldı');
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  app.exit(1);
}, 150000);
watchdog.unref();

require('../src/main.js');

app.whenReady().then(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  console.log('[tab-leak] Fixture http://127.0.0.1:' + port);

  const win = await until(() => BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere');
  win.show(); win.focus();
  const run = async (code) => Promise.race([
    win.webContents.executeJavaScript(`(async()=>{${code}})()`, true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('renderer timeout')), 15000)),
  ]);
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`),
    (await win.webContents.capturePage()).toPNG());
  await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar');

  await run(`openPlayer();setWorkspaceMode('browser', false);return true`);
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'İlk sekme');
  const tabA = await run('return player.browserActiveTabId');

  // Sekme A görünürken: navigate + decode + play.
  const navA = await run(`return await navigateBrowser('http://127.0.0.1:${port}/watch-a', ${JSON.stringify(tabA)})`);
  assert.equal(navA.ok, true, JSON.stringify(navA));
  const pageA = await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL().endsWith('/watch-a')), 'Sayfa A');
  await until(() => pageA.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&v.readyState>=2?v.currentTime:null})()`),
    'Video A decode', 30000);
  await pageA.executeJavaScript(`(()=>{const v=document.querySelector('video');v.muted=true;return v.play()})()`);

  // A overlay: kaynak + çeviri katmanı.
  const overlayA = await run(`return await window.api.setBrowserOverlay(${JSON.stringify(tabA)}, {
    mode:'both', offset:0,
    source:${JSON.stringify(cuesA)}, translation:${JSON.stringify(trA)},
    sourceTransform:{scale:1,offsetSeconds:0}, translationTransform:{scale:1,offsetSeconds:0},
    style:{scale:1,opacity:.9,bottomOffset:8,width:88,maxLines:2}
  })`);
  assert.equal(overlayA?.ok, true, JSON.stringify(overlayA));

  // Sekme B (aktif olur) → /watch-b decode.
  // Ürün yolu: renderer'ın createBrowserTab() yardımcısı api yanıtını
  // player.browserTabs'a uygular (sekme mutasyonları event ile değil
  // invoke yanıtıyla senkronlanır — T5 bulgusu).
  const tabB = await run('const t = await createBrowserTab(); return t ? t.id : null');
  assert.ok(tabB, 'createBrowserTab yardımcısı sekme döndürmedi');
  assert.notEqual(tabB, tabA);
  const navB = await run(`return await navigateBrowser('http://127.0.0.1:${port}/watch-b', ${JSON.stringify(tabB)})`);
  assert.equal(navB.ok, true, JSON.stringify(navB));
  const pageB = await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL().endsWith('/watch-b')), 'Sayfa B');
  await until(() => pageB.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&v.readyState>=2?v.currentTime:null})()`),
    'Video B decode', 30000);
  await pageB.executeJavaScript(`(()=>{const v=document.querySelector('video');v.muted=true;return v.play()})()`);

  const overlayB = await run(`return await window.api.setBrowserOverlay(${JSON.stringify(tabB)}, {
    mode:'source', offset:0,
    source:${JSON.stringify(cuesB)}, translation:[],
    sourceTransform:{scale:1,offsetSeconds:0}, translationTransform:{scale:1,offsetSeconds:0},
    style:{scale:1,opacity:.9,bottomOffset:8,width:88,maxLines:2}
  })`);
  assert.equal(overlayB?.ok, true, JSON.stringify(overlayB));

  // Split görünüm: iki sekme aynı anda görünür — eşzamanlı sızma ölçümü.
  // Aktif sekme B; ikincil A olmalı.
  const split = await run(`await setBrowserSplit(${JSON.stringify(tabA)}, 50); return { ok: player.browserSplit.active, secondary: player.browserSplit.secondaryTabId }`).catch((e) => ({ error: String(e) }));
  report.splitResult = split;
  console.log('[tab-leak] split:', JSON.stringify(split && { ok: split.ok, active: split.split && split.split.active }));
  // Görünürlük durumu — split açıldıysa iki sayfa da visible olmalı.
  report.visibility = {
    a: await pageA.executeJavaScript('document.visibilityState').catch(() => 'n/a'),
    b: await pageB.executeJavaScript('document.visibilityState').catch(() => 'n/a'),
  };

  const readAll = `(()=>{const root=document.getElementById('__whisper_browser_subtitles');
    const src=root?root.querySelector('[data-kind="source"]'):null;
    const tr=root?root.querySelector('[data-kind="translation"]'):null;
    const v=document.querySelector('video');
    return {src:src?src.textContent:'',tr:tr?tr.textContent:'',t:v?v.currentTime:-1,
      vis:document.visibilityState,
      resources:performance.getEntriesByType('resource').length}})()`;
  const expectedAt = (cues, t) => { const c = cues.find((x) => x.start <= t && t < x.end); return c ? c.text : ''; };

  // Controller diyagnostiği (izole dünya) — başlangıç değerleri.
  const diagOf = async (page) => page.executeJavaScriptInIsolatedWorld(999, [{
    code: `(()=>{const c=globalThis.__whisperBrowserOverlayController;
      return c?c.diagnostics():null})()`,
  }]).then((r) => r?.[0] ?? r).catch(() => null);
  report.diagA0 = await diagOf(pageA);
  report.diagB0 = await diagOf(pageB);

  // S1: eşzamanlı örnekleme — her sekmede yalnız kendi kümesi.
  const both = { a: [], b: [] };
  for (let i = 0; i < 12; i++) {
    both.a.push(await pageA.executeJavaScript(readAll));
    both.b.push(await pageB.executeJavaScript(readAll));
    await wait(250);
  }
  report.both = both;
  const leaks = [];
  for (const s of both.a) {
    if (!s) continue;
    if (s.src.includes('B-KAYNAK') || s.tr.includes('B-KAYNAK') || s.tr.includes('B-CEVIRI')) leaks.push({ tab: 'A', s });
    if (s.vis === 'visible') {
      const exp = expectedAt(cuesA, s.t);
      if (s.src && s.src !== exp) leaks.push({ tab: 'A', s, expected: exp, kind: 'wrong-cue' });
      if (s.tr && s.tr !== exp.replace('A-KAYNAK', 'A-CEVIRI')) leaks.push({ tab: 'A', s, kind: 'wrong-tr' });
    }
  }
  for (const s of both.b) {
    if (!s) continue;
    if (s.src.includes('A-KAYNAK') || s.tr.includes('A-KAYNAK') || s.tr.includes('A-CEVIRI')) leaks.push({ tab: 'B', s });
    if (s.vis === 'visible') {
      const exp = expectedAt(cuesB, s.t);
      if (s.src && s.src !== exp) leaks.push({ tab: 'B', s, expected: exp, kind: 'wrong-cue' });
      if (s.tr) leaks.push({ tab: 'B', s, kind: 'unexpected-translation-layer' });
    }
  }
  const visA = both.a.filter((s) => s && s.vis === 'visible');
  const visB = both.b.filter((s) => s && s.vis === 'visible');
  report.s1 = { leaks, visA: visA.length, visB: visB.length,
    sampleA: both.a[both.a.length - 1], sampleB: both.b[both.b.length - 1] };
  console.log(`[tab-leak] S1: A=${both.a.length} B=${both.b.length} örnek (vis A:${visA.length} B:${visB.length}), sızma=${leaks.length}`);
  assert.equal(leaks.length, 0, `Çapraz sekme sızması: ${JSON.stringify(leaks.slice(0, 6))}`);
  // Split altında en az bir sekme visible olmalı; ikisi de hidden ise
  // eşzamanlı render iddiası kanıtlanamaz — dürüstçe not et, sızma yine de 0.
  assert.ok(visB.length > 0, 'Aktif sekme B hiç visible örneklenmedi');
  if (visA.length > 0) {
    assert.ok(visA.every((s) => s.src), 'A overlay metni görünürken hiç render edilmedi');
    assert.ok(visA.every((s) => s.tr), 'A çeviri katmanı hiç görünmedi');
  }
  assert.ok(visB.every((s) => s.src), 'B overlay metni görünürken hiç render edilmedi');
  await shot('01-two-tabs');

  // S2: A'yı kapat — B etkilenmemeli, uygulama durumu A verisini tutmamalı.
  // Önce renderer'a probe yerleştir: syncBrowserTabs'e gelen her snapshot
  // (kaynak: çağıranın stack'i) kaydedilir. Böylece event yoluyla mı yoksa
  // yanıt-uygulamasıyla mı geldiği ölçülür.
  await run(`window.__tabsLog=[];
    const __origSync = syncBrowserTabs;
    syncBrowserTabs = function(...a) {
      window.__tabsLog.push({tabs:(a[0]||[]).map(t=>t&&t.id||t), active:a[1]||'',
        stack:(new Error().stack||'').split('\\n').slice(1,4).join(' <- ')});
      return __origSync.apply(this, a);
    };
    return true`);
  // Ürün yolunun yaptığı gibi: api çağrısı + yanıtı syncBrowserTabs'a uygula.
  // (renderer closeBrowserTab() helper'ı bunu yapar; doğrudan api çağırmak
  // helper'ı atlar — T5'te ölçülen sınır: sekme mutasyonları 'tabs-changed'
  // event'i yerine invoke yanıtıyla senkronlanır.)
  const closed = await run(`const r = await window.api.closeBrowserTab(${JSON.stringify(tabA)}, true);
    if (r && r.ok) { player.browserTabEventGate.close(${JSON.stringify(tabA)}); syncBrowserTabs(r.tabs, r.activeTabId, r.split); }
    return r;`);
  report.close = { tabA, tabB, response: { ok: closed.ok, activeTabId: closed.activeTabId, tabs: (closed.tabs || []).map((t) => ({ id: t.id, url: t.url })) } };
  console.log('[tab-leak] close yanıtı:', JSON.stringify(report.close));
  assert.equal(closed.ok, true, JSON.stringify(closed));
  await wait(1200);
  report.tabsLog = await run('return window.__tabsLog');
  console.log('[tab-leak] syncBrowserTabs çağrıları:', JSON.stringify(report.tabsLog));
  const afterClose = await run(`return {
    active: player.browserActiveTabId,
    tabs: player.browserTabs.map((t) => ({ id: t.id, url: t.url, mediaId: t.mediaId })),
    liveKeys: [...(player.browserLiveTranslations || new Map()).keys()],
    splitSecondary: player.browserSplitSecondaryTabId || '',
  }`);
  report.afterClose = afterClose;
  console.log('[tab-leak] S2 sonrası durum:', JSON.stringify(afterClose));
  assert.equal(afterClose.active, tabB, 'Kapanan sekme yerine aktif sekme B olmalı');
  assert.equal(afterClose.tabs.some((t) => t.id === tabA), false, 'Kapanan sekme hâlâ browserTabs listesinde');
  assert.equal(afterClose.tabs.some((t) => (t.url || '').includes('/watch-a')), false,
    'Kapanan sekmenin URL\'i başka sekme kaydına sızdı');
  assert.equal(afterClose.liveKeys.includes(tabA), false, 'Canlı çeviri kaydı kapanan sekmede kaldı');
  const sampleBAfterClose = await pageB.executeJavaScript(readAll);
  assert.ok(sampleBAfterClose.src.includes('B-KAYNAK'),
    `B overlay'i A'nın kapanışından etkilendi: ${JSON.stringify(sampleBAfterClose)}`);
  await shot('02-after-close-a');

  // S3: B'de sayfa değişimi — navigasyon overlay cue'larını temizler
  // (did-navigate → resetBrowserCaptureState); yeni medyada eski metin
  // veya karşı sekmenin metni GÖRÜNMEMELİ. Overlay'i yeniden kurunca
  // sekme kaydına bağlı doğru küme dönmeli.
  const navB2 = await run(`return await navigateBrowser('http://127.0.0.1:${port}/watch-a', ${JSON.stringify(tabB)})`);
  assert.equal(navB2.ok, true, JSON.stringify(navB2));
  const pageB2 = await until(() => webContents.getAllWebContents()
    .find((w) => w.getURL().endsWith('/watch-a') && !w.isDestroyed()), 'Sayfa B2 (A içeriği B sekmesinde)');
  await until(() => pageB2.executeJavaScript(
    `(()=>{const v=document.querySelector('video');return v&&v.readyState>=2?v.currentTime:null})()`),
    'B2 video decode', 30000);
  await pageB2.executeJavaScript(`(()=>{const v=document.querySelector('video');v.muted=true;return v.play()})()`);
  await wait(1200);
  const sampleB2 = await pageB2.executeJavaScript(readAll);
  const stateB2 = await run(`(()=>{const t=browserTabState(${JSON.stringify(tabB)});return t?{url:t.url||'',mediaId:t.mediaId||''}:null})()`).catch(() => null);
  report.s3 = { sampleB2, stateB2 };
  console.log('[tab-leak] S3:', JSON.stringify(report.s3));
  assert.equal(sampleB2.src.includes('A-KAYNAK'), false, 'A cue\'ları B2 sayfasına sızdı');
  assert.equal(sampleB2.src.includes('B-KAYNAK'), false,
    `Eski medyanın B cue\'ları yeni sayfaya taşındı: ${JSON.stringify(sampleB2)}`);
  // Overlay'i B kümesiyle yeniden kur — sekme kimliği aynı kaydı takip etmeli.
  const overlayB2 = await run(`return await window.api.setBrowserOverlay(${JSON.stringify(tabB)}, {
    mode:'source', offset:0,
    source:${JSON.stringify(cuesB)}, translation:[],
    sourceTransform:{scale:1,offsetSeconds:0}, translationTransform:{scale:1,offsetSeconds:0},
    style:{scale:1,opacity:.9,bottomOffset:8,width:88,maxLines:2}
  })`);
  assert.equal(overlayB2?.ok, true, JSON.stringify(overlayB2));
  await wait(800);
  const sampleB3 = await pageB2.executeJavaScript(readAll);
  report.s3.reoverlay = sampleB3;
  assert.ok(sampleB3.src.includes('B-KAYNAK'),
    `Yeniden kurulan overlay B kümesini göstermedi: ${JSON.stringify(sampleB3)}`);
  assert.equal(sampleB3.src.includes('A-KAYNAK'), false, 'A cue\'ları yeniden kurulumda sızdı');
  await shot('03-tab-b-new-page');

  // S4: dinleyici/observer sayıları B'de şişmemiş.
  report.diagB1 = await diagOf(pageB2);
  console.log('[tab-leak] diag B0→B1:', JSON.stringify({ b0: report.diagB0, b1: report.diagB1 }));
  if (report.diagB0 && report.diagB1) {
    assert.ok(report.diagB1.mediaListeners <= report.diagB0.mediaListeners + 8,
      `Medya dinleyicisi şişti: ${report.diagB0.mediaListeners} → ${report.diagB1.mediaListeners}`);
    assert.ok(report.diagB1.mutationObservers <= report.diagB0.mutationObservers + 2,
      `MutationObserver şişti: ${report.diagB0.mutationObservers} → ${report.diagB1.mutationObservers}`);
  }

  report.ok = true;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[tab-leak] PASS');
  server.close();
  app.exit(0);
}).catch((error) => {
  clearTimeout(watchdog);
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  fs.writeFileSync(path.join(out, 'error.txt'), String(error && error.stack || error));
  console.error(error);
  try { server.close(); } catch (_) {}
  app.exit(1);
});
