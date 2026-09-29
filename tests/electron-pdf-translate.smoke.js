'use strict';

// PDF çeviri uçtan-uca smoke'u: gerçek pdf.js çıkarımı + gerçek IPC +
// çeviri şeması, sağlayıcı olarak smoke'un kendi içindeki OpenAI-uyumlu
// stub (harici servis yok — her ortamda deterministik).
//
//   mini sağlayıcı (main içinde http.createServer, ephemeral port)
//     → settings.json tohumlanır (translate.customBaseUrl → stub)
//     → fixture PDF (elle yazılmış minimal tek sayfa, 3 metin satırı)
//     → dialog.showOpenDialog stub → openPdfReader() gerçek yolu
//     → renderPdfReaderPage ile gerçek pdf.js metin çıkarımı
//     → translateVisiblePdfPages(true) — gerçek UI akışı
//     → state.pages'te 'tr~ ' çevirileri + diskte pdf-translations/*.json
//     → pdf:export txt çıktısı çeviri içerir
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-pdf-translate.smoke.js --disable-gpu

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-translate-'));
const profileDir = path.join(out, 'profile');
fs.mkdirSync(profileDir, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profileDir;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 20000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// OpenAI-uyumlu mini sağlayıcı: sentence_groups/items şemasına "tr~ <kaynak>"
// döndürür; istek sayısını requests dizisine kaydeder.
const requests = [];
const provider = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try {
      const body = JSON.parse(raw);
      const user = JSON.parse(body.messages[body.messages.length - 1].content);
      let content;
      if (typeof user.metin === 'string') {
        // Tek parça cue protokolü: {metin, onceki, sonraki, ...} → düz çeviri metni.
        content = `tr~ ${user.metin}`;
        requests.push({ n: requests.length + 1, kind: 'metin' });
      } else {
        // Gruplu protokol: sentence_groups/items → {sentences, items} zarfı.
        const items = {};
        for (const it of user.items || []) items[String(it.i)] = it.t ?? it.tr ?? '';
        const outItems = {}; const sents = {};
        for (const g of user.sentence_groups || []) {
          const parts = g.ids.map((i) => `tr~ ${items[String(i)] || ''}`);
          for (const [k, i] of g.ids.entries()) outItems[String(i)] = parts[k];
          sents[String(g.ids[0])] = parts.join(' ');
        }
        content = JSON.stringify({ sentences: sents, items: outItems, memory: {} });
        requests.push({ n: requests.length + 1, kind: 'groups', groups: (user.sentence_groups || []).length });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
});

provider.listen(0, '127.0.0.1', async () => {
  const port = provider.address().port;
  // Ayarları uygulama yüklenmeden tohumla: çeviri sağlayıcısı = yerel stub.
  fs.writeFileSync(path.join(profileDir, 'settings.json'), JSON.stringify({
    settingsVersion: 3,
    translate: { apiKey: 'test-key', endpointPreset: 'custom',
      customBaseUrl: `http://127.0.0.1:${port}`, model: 'test-model' },
    ui: { translateTo: 'tr' },
  }));

  // Minimal geçerli PDF fixture'ı — 2 sayfa (xref'siz gövde pdf.js tarafından
  // taranır; çok-sayfa 3'lü paket döngüsü de gerçekten koşar).
  const pdfPath = path.join(out, 'fixture.pdf');
  const pageLines = [
    ['Hello world.', 'This is a test.', 'Third sentence here.'],
    ['Second page begins.', 'More text follows.', 'End of fixture.'],
  ];
  const pageObjects = pageLines.map((lines, i) => {
    const stream = `BT /F1 18 Tf 72 720 Td ${lines.map((t) => `(${t}) Tj 0 -40 Td`).join(' ')} ET`;
    const pageId = 3 + i * 2; const contentId = 4 + i * 2;
    return [
      `${pageId} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 7 0 R>>>>/Contents ${contentId} 0 R>>endobj\n`,
      `${contentId} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    ].join('');
  }).join('');
  const pdf = [
    '%PDF-1.4\n',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>endobj\n',
    pageObjects,
    '7 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n',
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  ].join('');
  fs.writeFileSync(pdfPath, pdf, 'latin1');

  app.setAppPath(path.resolve(__dirname, '..'));
  require('../src/main.js');

  let renderProcessGone = 0;
  app.whenReady().then(async () => {
    try {
      const win = await until(() => BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
        'Ana pencere', 90000);
      const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
      win.webContents.on('render-process-gone', () => { renderProcessGone += 1; });
      await until(() => run('return typeof initialSettingsReady !== "undefined"'
        + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
      console.log(`[pdf] hazır, sağlayıcı :${port}`);

      // pdf:open dosya seçicisini fixture'a yönlendir (seçici yolu → doğrudan grant).
      const exportPath = path.join(out, 'export.txt');
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pdfPath] });
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });

      await run(`openPdfReader(); return true;`);
      const pdfHash = await until(() => run('return player.pdfReader?.pdfHash || null'), 'PDF okuyucu', 30000);
      assert(pdfHash, 'pdfHash alınamadı');
      console.log(`[pdf] açıldı: ${pdfHash.slice(0, 12)}…`);

      // Gerçek pdf.js çıkarımı → reader.pages doluncaya kadar (2 sayfa)
      await until(() => run('return extractPdfReaderPage(1).then(() => (player.pdfReader.pages.get(1)?.blocks || []).length)'),
        'sayfa-1 metin çıkarımı', 30000);
      await until(() => run('return extractPdfReaderPage(2).then(() => (player.pdfReader.pages.get(2)?.blocks || []).length)'),
        'sayfa-2 metin çıkarımı', 30000);

      // Gerçek UI akışı — "tüm kitabı çevir"
      await run('translateVisiblePdfPages(true); return true;');
      const translated = await until(() => run(`const r = player.pdfReader;
        const state = r && r.state && r.state.pages || {};
        const ready = ['1', '2'].every((p) => (state[p] || []).length);
        return r && !r.translating && ready ? {
          blocks: Object.entries(state).flatMap(([p, blocks]) =>
            blocks.map((b) => ({ p, status: b.status, t: b.translation }))),
          done: r.translationCompleted, failed: r.translationFailed,
        } : null;`), 'çeviri tamamlanması', 60000);
      assert.equal(translated.failed || 0, 0, `başarısız sayfa: ${JSON.stringify(translated)}`);
      assert(translated.blocks.length >= 2, `çevrilmiş blok yetersiz: ${translated.blocks.length}`);
      assert(translated.blocks.every((b) => b.status === 'translated' && /^tr~ /.test(b.t)),
        `beklenmeyen bloklar: ${JSON.stringify(translated.blocks)}`);
      assert(translated.blocks.some((b) => b.p === '1') && translated.blocks.some((b) => b.p === '2'),
        'iki sayfada da çeviri bekleniyor');
      console.log(`[pdf] ${translated.blocks.length} blok çevrildi (${requests.length} istek)`);

      // Durum dosyası diske yazıldı mı
      const stateDir = path.join(profileDir, 'pdf-translations');
      const stateFiles = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.json')) : [];
      assert(stateFiles.length >= 1, 'pdf-translations durum dosyası yok');
      const saved = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
      assert(saved.pages && saved.pages['1'] && saved.pages['2'], 'durum dosyasında sayfalar yok');

      // Dışa aktarım çeviri içeriyor mu (gerçek IPC; kaydetme diyaloğu stub'lı)
      const exported = await run(`return window.api.exportPdfTranslation(${JSON.stringify(pdfHash)}, 'txt', 'tr');`);
      assert(exported && exported.ok, `export başarısız: ${JSON.stringify(exported)}`);
      assert(fs.existsSync(exportPath), 'export dosyası yazılmadı');
      const exportText = fs.readFileSync(exportPath, 'utf8');
      assert(/tr~ /.test(exportText), `dışa aktarımda çeviri yok: ${exportText.slice(0, 120)}`);
      console.log('[pdf] durum+dışa aktarım doğrulandı');

      assert.equal(renderProcessGone, 0, 'Renderer süreci çöktü');
      console.log('PASS: PDF çeviri E2E — 2 sayfa aç→çıkar→çevir→durum→dışa aktar');
      win.close();
      app.exit(0);
    } catch (error) {
      console.error('[pdf] hata:', error && error.stack || error);
      app.exit(1);
    }
  });
});
