'use strict';

// Yeni-100 madde 7 — PDF çeviri iptal→devam yolculuğu:
//   5 sayfalık gerçek PDF fixture → "tüm kitabı çevir" (3'lü paketler) →
//   ilk paket bitince iptal düğmesi → döngü paket arasında durur, tamamlanan
//   sayfalar durum dosyasında KORUNUR → yeniden "tüm kitabı çevir" →
//   5/5 sayfa çevrilir, export tüm içeriği taşır.
// Kullanıcı görünür sözleşme: iptal tamamlanan işi silmez; devam toparlar.
// Çalıştırma: xvfb-run -a node_modules/.bin/electron tests/electron-pdf-cancel-resume.smoke.js --disable-gpu

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pdfcancel-'));
const profileDir = path.join(out, 'ud');
fs.mkdirSync(profileDir, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profileDir;
const settingsPath = path.join(profileDir, 'settings.json');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label, timeoutMs = 30000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e && e.message; }
    await wait(stepMs);
  }
  throw new Error(`zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// OpenAI-uyumlu stub — yavaş yanıt (~350ms) ki iptal paket arasına düşsün.
const requests = [];
const provider = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => setTimeout(() => {
    try {
      const body = JSON.parse(raw);
      const user = JSON.parse(body.messages[body.messages.length - 1].content);
      let content;
      if (typeof user.metin === 'string') {
        content = `tr~ ${user.metin}`;
        requests.push('metin');
      } else {
        const items = {};
        for (const it of user.items || []) items[String(it.i)] = it.t ?? it.tr ?? '';
        const outItems = {}; const sents = {};
        for (const g of user.sentence_groups || []) {
          const parts = g.ids.map((i) => `tr~ ${items[String(i)] || ''}`);
          for (const [k, i] of g.ids.entries()) outItems[String(i)] = parts[k];
          sents[String(g.ids[0])] = parts.join(' ');
        }
        content = JSON.stringify({ sentences: sents, items: outItems, memory: {} });
        requests.push('groups');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
  }, 350));
});

provider.listen(0, '127.0.0.1', async () => {
  const port = provider.address().port;
  fs.writeFileSync(settingsPath, JSON.stringify({
    settingsVersion: 3,
    translate: { apiKey: 'test-key', endpointPreset: 'custom',
      customBaseUrl: `http://127.0.0.1:${port}`, model: 'test-model' },
    ui: { translateTo: 'tr' },
  }));

  // 5 sayfalık minimal geçerli PDF — 3'lü paket döngüsünü 2 tura böler.
  const pdfPath = path.join(out, 'fixture.pdf');
  const pageLines = [
    ['First page one text.', 'Second line here.'],
    ['Page two begins now.', 'More words follow.'],
    ['Third page content.', 'Additional sentence.'],
    ['Fourth page lines.', 'Final part of four.'],
    ['Last page five.', 'Closing words here.'],
  ];
  const pages = pageLines.map((lines, i) => {
    const stream = `BT /F1 18 Tf 72 720 Td ${lines.map((t) => `(${t}) Tj 0 -40 Td`).join(' ')} ET`;
    const pageId = 3 + i * 2; const contentId = 4 + i * 2;
    return [
      `${pageId} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 13 0 R>>>>/Contents ${contentId} 0 R>>endobj\n`,
      `${contentId} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    ].join('');
  }).join('');
  const pdf = [
    '%PDF-1.4\n',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    `2 0 obj<</Type/Pages/Kids[${[3, 5, 7, 9, 11].map((id) => `${id} 0 R`).join(' ')}]/Count 5>>endobj\n`,
    pages,
    '13 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n',
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  ].join('');
  fs.writeFileSync(pdfPath, pdf, 'latin1');

  app.setAppPath(root);
  require('../src/main.js');

  app.whenReady().then(async () => {
    try {
      const win = await until(() => BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()),
        'ana pencere', 120000);
      const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
      await until(() => run('return typeof initialSettingsReady !== "undefined"'
        + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'ayarlar', 120000);

      const exportPath = path.join(out, 'export.txt');
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pdfPath] });
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });

      await run('openPdfReader(); return true;');
      const pdfHash = await until(() => run('return player.pdfReader?.pdfHash || null'), 'pdfHash', 30000);
      for (const p of [1, 2, 3, 4, 5]) {
        await until(() => run(`return extractPdfReaderPage(${p}).then(() => (player.pdfReader.pages.get(${p})?.blocks || []).length)`),
          `sayfa-${p} metin`, 30000);
      }
      console.log('[pdfcancel] 5 sayfa metin çıkarıldı — çeviri başlıyor');

      // Tüm kitabı çevir (5 sayfa → 3+2 paket). İlk paket bitince iptal.
      await run('translateVisiblePdfPages(true); return true;');
      const firstBatch = await until(() => run(`const r = player.pdfReader;
        return r && r.translating && r.translationCompleted >= 3 ? r.translationCompleted : null`),
        'ilk paket tamamlandı', 60000);
      console.log(`[pdfcancel] ilk paket bitti (${firstBatch}/5) — kullanıcı iptali`);
      await run(`document.getElementById('pdfTranslateCancel').click(); return true;`);

      const afterCancel = await until(() => run(`const r = player.pdfReader;
        return r && !r.translating ? {
          done: r.translationCompleted, cancelled: r.cancelRequested,
          translated: Object.values(r.state?.pages || {})
            .flat().filter((b) => b && b.status === 'translated').length,
        } : null`), 'çeviri durdu', 30000);
      assert.equal(afterCancel.done, 3, `iptal ilk paketten SONRA durmadı: ${JSON.stringify(afterCancel)}`);
      assert.equal(afterCancel.translated, 3, `tamamlanan sayfalar kayboldu: ${JSON.stringify(afterCancel)}`);
      console.log(`[pdfcancel] iptal doğrulandı — ${afterCancel.translated} sayfa çevirisi korundu`);

      // Kalıcı durum dosyası iptal anında da tamamlananları içeriyor mu?
      const stateDir = path.join(profileDir, 'pdf-translations');
      const stateFile = await until(() => {
        const files = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.json')) : [];
        return files.length ? path.join(stateDir, files[0]) : null;
      }, 'durum dosyası', 15000);
      const savedAfterCancel = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const keptPages = Object.keys(savedAfterCancel.pages || {}).length;
      assert(keptPages >= 3, `kalıcı durumda ${keptPages} sayfa var — ilk paket korunmadı`);
      console.log(`[pdfcancel] kalıcı durum: ${keptPages} sayfa iptal sonrası diskte`);

      // Kullanıcı yeniden "tüm kitabı çevir" der → 5/5 çevrilir.
      await run('translateVisiblePdfPages(true); return true;');
      const resumed = await until(() => run(`const r = player.pdfReader;
        const done5 = [1,2,3,4,5].every((p) => (r.state?.pages?.[String(p)] || [])
          .length && r.state.pages[String(p)].every((b) => b.status === 'translated'));
        return r && !r.translating && done5 ? r.translationCompleted : null`), 'devam tamamlandı', 120000);
      assert(resumed >= 5, `devam sonrası tamamlanan ${resumed}/5`);
      console.log('[pdfcancel] devam turu 5/5 sayfayı çevirdi');

      // Export — tüm içerik dosyada.
      const exported = await run(`return window.api.exportPdfTranslation(${JSON.stringify(pdfHash)}, 'txt', 'tr');`);
      assert(exported && exported.ok, `export hatası: ${JSON.stringify(exported)}`);
      const exportedText = fs.readFileSync(exportPath, 'utf8');
      assert(/tr~ /.test(exportedText), 'export çeviri içermiyor');
      console.log('[pdfcancel] export doğrulandı');

      console.log('PASS: PDF iptal→devam — tamamlanan sayfa korunur, devam 5/5 tamamlar');
      win.close();
      app.exit(0);
    } catch (e) {
      console.error('[pdfcancel] hata:', e && e.stack || e);
      app.exit(1);
    }
  });
});
