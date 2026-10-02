'use strict';

// Yeni-100 batch 4 — Tarayıcı yaşam döngüsü derinleştirme (gerçek Electron):
// wc.forcefullyCrashRenderer() ile sekme webContents'i çökertilip
// render-process-gone → temizlik → recreate-once zinciri uçtan uca sınanır.
// Senaryolar:
//  S1: Çökme → 'tab-crashed' olayı + ~1 sn sonra görünüm yeniden kurulur ve
//      restoredUrl'e geri yüklenir; tab.error temizlenir.
//  S2: Döngü koruması — yeniden kurulan görünüm henüz YÜKLENMEDEN tekrar
//      çökerse (did-stop-loading bütçeyi sıfırlamadı) üçüncü kurma YAPILMAZ.
//      Sağlıklı yüklenen sayfanın sonraki çökmede tekrar kurtarılması ise
//      kasıtlı sözleşmedir (did-stop-loading bütçeyi yeniler).
//  S3: Çökme → kurtarma zamanlayıcısı (<1 sn) dolmadan sekme kapatılırsa
//      görünüm dirilmez (timer guard: browserTabById !== tab).
//  S4: Arka plan sekmesi çöker → kendi başına toparlanır, aktif sekmenin
//      görünümü/URL'i etkilenmez.
//  S5: Tüm sekme nesneleri kapatılınca WebContents sayısı tabana döner
//      (çökmüş/yeniden kurulmuş görünümlerde sızıntı yok).
//
// Çalıştırma: node tests/run-electron-smokes.js lifecycle-deep
// Gerektirir: gerçek Electron; renderer sürecini forcefullyCrashRenderer ile
// öldürür (render-process-gone reason='crashed').

const { app, BrowserWindow, webContents } = require('electron');
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, '..', '.uiprev', 'lifecycle-deep');
fs.mkdirSync(out, { recursive: true });
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

// Basit fixture: marker'lı statik sayfa; /slow yanıtı ~3.5 sn geciktirir
// (yeniden kurulan görünümün yükleme-ortasında çökertilmesine pencere açar).
const server = http.createServer((req, res) => {
  const marker = req.url === '/page-b' ? 'PAGE-B-MARKER'
    : (req.url === '/slow' ? 'SLOW-MARKER' : 'PAGE-A-MARKER');
  const send = () => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><body><h1>${marker}</h1><title>${marker}</title></body></html>`);
  };
  if (req.url === '/slow') setTimeout(send, 3500); else send();
});

const report = { checks: [] };
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`[lifecycle-deep] ${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  assert(ok, `${name}: ${detail}`);
};

const watchdog = setTimeout(() => {
  console.error('[lifecycle-deep] 150 sn güvenlik sınırı aşıldı');
  try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  app.exit(1);
}, 150000);
watchdog.unref();

require('../src/main.js');

const crashLog = [];
app.on('web-contents-created', (_e, wc) => {
  wc.on('render-process-gone', (_ev, details = {}) => {
    crashLog.push({ id: wc.id, reason: details.reason, url: wc.getURL() });
    console.log(`[lifecycle-deep] render-process-gone id=${wc.id} reason=${details.reason} url=${wc.getURL()}`);
  });
});

// Sekme webContents'ini URL'inden bul (yeniden kurulan görünümün wc'si yenidir).
function wcByUrl(fragment) {
  return webContents.getAllWebContents()
    .find((wc) => !wc.isDestroyed() && (wc.getURL() || '').includes(fragment));
}

// Görünüm wc'lerinin id kümesi — yeni kurulanı id farkıyla yakalarız.
function wcIds() {
  return new Set(webContents.getAllWebContents().filter((wc) => !wc.isDestroyed()).map((wc) => wc.id));
}
function newViewWc(known) {
  return webContents.getAllWebContents().find((wc) => !wc.isDestroyed()
    && !known.has(wc.id) && !(wc.getURL() || '').includes('index.html')
    && !wc.isCrashed());
}

app.whenReady().then(async () => {
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;

    const win = await until(() => BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()), 'Ana pencere', 90000);
    const run = async (code) => Promise.race([
      win.webContents.executeJavaScript(`(async()=>{${code}})()`, true),
      new Promise((_, reject) => setTimeout(() => reject(new Error('renderer timeout')), 15000)),
    ]);
    await until(() => run('return typeof initialSettingsReady!=="undefined"?await initialSettingsReady.then(()=>true):false'), 'Ayarlar', 90000);
    await run(`window.__unhandledCount = 0;
      window.addEventListener('unhandledrejection', () => window.__unhandledCount++);
      window.__ev = [];
      window.api.onBrowserEvent((e) => { if (window.__ev.length < 400) window.__ev.push((e.type || '?') + '|' + String(e.tabId || '')); });
      return true;`);
    await run('openAppDialog = async () => true; return true;');
    await run(`openPlayer();setWorkspaceMode('browser', false);return true`);
    await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'İlk sekme');

    const tabState = (id) => run(`const t = player.browserTabs.find((x) => x.id === ${JSON.stringify(id)});
      return t ? { error: t.error || '', kind: t.errorKind || '', url: t.url || '' } : null;`);

    // ---- S1: çökme → recreate-once → restoredUrl'e geri yükleme ----
    const tabA = await run('return player.browserActiveTabId');
    await run(`return await navigateBrowser('http://127.0.0.1:${port}/page-a', ${JSON.stringify(tabA)})`);
    await until(() => wcByUrl('/page-a'), 'A sayfası yüklendi');
    const baseWc = webContents.getAllWebContents().length;

    wcByUrl('/page-a').forcefullyCrashRenderer();
    await until(async () => {
      const s = await tabState(tabA);
      return s && s.kind === 'crash' ? s : null;
    }, 'S1 tab-crashed olayı');
    check('S1 crash olayı renderer\'a ulaştı (errorKind=crash)', true);

    // recreate-once ~1 sn sonra görünümü yeniden kurup restoredUrl'e yükler.
    await until(() => wcByUrl('/page-a'), 'S1 görünüm yeniden kuruldu', 15000);
    await until(async () => {
      const s = await tabState(tabA);
      return s && s.error === '' && s.url.includes('/page-a') ? s : null;
    }, 'S1 hata temizlendi + sayfa geri yüklendi', 15000);
    check('S1 recreate-once sayfayı restoredUrl\'e geri yükledi', true);

    // ---- S2: döngü koruması — kurtarma görünümü yükleme ortasında çökerse ----
    // crashRecoveryAttempt yalnız did-stop-loading'de sıfırlanır; /slow yükü
    // bitmeden ikinci çökme gelirse üçüncü kurma yapılmaz.
    await run(`return await closeBrowserTab(${JSON.stringify(tabA)}), true;`);
    const tabSlow = await run('return (await createBrowserTab())?.id || null');
    assert(tabSlow, 'tabSlow açılamadı');
    await run(`return await navigateBrowser('http://127.0.0.1:${port}/slow', ${JSON.stringify(tabSlow)})`);
    await until(() => wcByUrl('/slow'), 'slow sayfa yüklendi', 15000);
    const slowWc = wcByUrl('/slow');
    const knownWc = wcIds();
    slowWc.forcefullyCrashRenderer();
    await until(async () => {
      const s = await tabState(tabSlow);
      return s && s.kind === 'crash' ? s : null;
    }, 'S2 ilk tab-crashed olayı');
    // ~1 sn sonra yeni görünüm kurulur ve /slow'a loadURL başlar (beklemede).
    const recreated = await until(async () => newViewWc(knownWc), 'S2 yeniden kurulan görünüm wc\'si', 10000);
    check('S2 yeniden kurulum başladı (yeni wc)', !!recreated);
    // Yük hâlâ beklemedeyken ikinci çökme → bütçe dolu → üçüncü kurma YOK.
    recreated.forcefullyCrashRenderer();
    try {
      await until(async () => {
        const s = await tabState(tabSlow);
        return s && s.kind === 'crash' ? s : null;
      }, 'S2 ikinci tab-crashed olayı', 15000);
    } catch (diagErr) {
      const evs = await run('return window.__ev.filter((x) => x.includes("crash") || x.includes("navigation") || x.includes("load-error")).slice(-20)');
      console.log('[lifecycle-deep] S2 teşhis crashLog:', JSON.stringify(crashLog), 'events:', JSON.stringify(evs));
      throw diagErr;
    }
    const afterSecond = newViewWc(new Set([...knownWc, recreated.id]));
    await wait(2600); // kurtarma penceresi + slow yanıt süresinin bir kısmı
    const third = newViewWc(new Set([...knownWc, recreated.id]));
    check('S2 yükleme-ortası ikinci çökmede üçüncü kurma yok', !third && !afterSecond);
    const s2 = await tabState(tabSlow);
    check('S2 crash hatası korunuyor (kullanıcı elle yükler)', s2 && s2.kind === 'crash');
    await run(`return await closeBrowserTab(${JSON.stringify(tabSlow)}), true;`);

    // ---- S3: çökme → timer dolmadan kapat → dirilme yok ----
    const tabB = await run('return (await createBrowserTab())?.id || null');
    assert(tabB, 'tabB açılamadı');
    await run(`return await navigateBrowser('http://127.0.0.1:${port}/page-b', ${JSON.stringify(tabB)})`);
    await until(() => wcByUrl('/page-b'), 'B sayfası yüklendi');
    wcByUrl('/page-b').forcefullyCrashRenderer();
    await until(async () => {
      const s = await tabState(tabB);
      return s && s.kind === 'crash' ? s : null;
    }, 'S3 tab-crashed olayı');
    await run(`return await closeBrowserTab(${JSON.stringify(tabB)}), true;`);
    await wait(2000); // kurtarma zamanlayıcısının dolacağı pencereyi geç
    check('S3 kapalı sekme dirilmedi', !wcByUrl('/page-b'));
    const tabsAfterClose = await run('return player.browserTabs.map((t) => t.id)');
    check('S3 sekme kaydı silindi', !tabsAfterClose.includes(tabB));

    // ---- S4: arka plan sekmesi çöker → aktif sekme etkilenmez ----
    const tabC = await run('return (await createBrowserTab())?.id || null');
    await run(`return await navigateBrowser('http://127.0.0.1:${port}/page-a', ${JSON.stringify(tabC)})`);
    await until(() => wcByUrl('/page-a'), 'C arka plan adayı yüklendi');
    // D'yi sonra yarat — C arka plana düşer, wc'si canlı kalır.
    const tabD = await run('return (await createBrowserTab())?.id || null');
    await run(`return await navigateBrowser('http://127.0.0.1:${port}/page-b', ${JSON.stringify(tabD)})`);
    await until(() => wcByUrl('/page-b'), 'D aktif sayfa');
    // tabC arka planda (D aktif) — /page-a'yı taşıyan wc'yi çökert.
    const staleA = webContents.getAllWebContents().find((wc) =>
      !wc.isDestroyed() && (wc.getURL() || '').includes('/page-a'));
    assert(staleA, 'arka plan A sekmesi bulunamadı');
    staleA.forcefullyCrashRenderer();
    await until(async () => {
      const s = await tabState(tabC);
      return s && s.kind === 'crash' ? s : null;
    }, 'S4 arka plan tab-crashed');
    await until(() => wcByUrl('/page-a'), 'S4 arka plan yeniden kuruldu', 15000);
    const dUrl = await run('const t = player.browserTabs.find((x) => x.id === ' + JSON.stringify(tabD) + '); return t ? t.url : null;');
    check('S4 aktif sekme URL\'i korundu', dUrl && dUrl.includes('/page-b'), dUrl);
    const activeId = await run('return player.browserActiveTabId');
    check('S4 aktif sekme değişmedi', activeId === tabD);

    // ---- S5: kapanış sonrası WebContents tabanına dönüş ----
    await run('for (const t of [...player.browserTabs]) await closeBrowserTab(t.id); return true;');
    await wait(1500);
    const endWc = webContents.getAllWebContents().length;
    check('S5 WebContents sızıntısı yok', endWc <= baseWc + 1, `${baseWc} → ${endWc}`);

    const unhandled = await run('return window.__unhandledCount || 0');
    check('S6 unhandledrejection yok', unhandled === 0, `count=${unhandled}`);

    console.log('[lifecycle-deep] TÜMÜ GEÇTİ');
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    server.close();
    app.exit(0);
  } catch (error) {
    console.error('[lifecycle-deep] FAIL', error && error.message);
    report.fatal = String(error && error.stack || error);
    try { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); } catch (_) {}
    try { server.close(); } catch (_) {}
    app.exit(1);
  }
});
