'use strict';

// Yeni-100 madde 1 — tam kullanıcı yolculuğu tek koşuda:
//   dosya seç (gerçek dropZone/diyalog) → GERÇEK tiny/CPU transkripsiyon
//   (flite konuşma WAV'ı) → LLM çevirisi (süreç-içi OpenAI-uyumlu stub
//   sağlayıcı) → çıktı .srt + .tr.srt → oynatıcıda cue düzenle (saveCueEdit,
//   gerçek dosya yazımı) → "farklı kaydet" dışa aktarımı (saveSubtitleCopy,
//   atomik yazı + doğrulama).
// Parça parça başka smoke'larda kilitli adımları TEK akışta birleştirir;
// kayıt zincirindeki boşlukları (ara adımların birbirini bozması) yakalar.
//
// Çalıştırma: xvfb-run -a node_modules/.bin/electron tests/electron-journey-full.smoke.js --disable-gpu

const { app, BrowserWindow, dialog } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-journey-'));
const userData = path.join(out, 'ud');
const inputDir = path.join(out, 'in');
const outputDir = path.join(out, 'out');
for (const d of [userData, inputDir, outputDir]) fs.mkdirSync(d, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userData;
const settingsPath = path.join(userData, 'settings.json');
const clipPath = path.join(inputDir, 'konusma.wav');
const exportPath = path.join(out, 'disa-aktar.srt');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label, timeoutMs = 30000, stepMs = 200) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e && e.message; }
    await wait(stepMs);
  }
  throw new Error(`zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};

// OpenAI-uyumlu mini sağlayıcı — pdf-translate smoke'uyla aynı protokol:
// {metin} → "tr~ <metin>"; {sentence_groups/items} → sentences+items zarfı.
const providerRequests = [];
const provider = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    try {
      const body = JSON.parse(raw);
      const user = JSON.parse(body.messages[body.messages.length - 1].content);
      let content;
      if (typeof user.metin === 'string') {
        content = `tr~ ${user.metin}`;
        providerRequests.push('metin');
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
        providerRequests.push('groups');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
  });
});

provider.listen(0, '127.0.0.1', async () => {
  const port = provider.address().port;
  fs.writeFileSync(settingsPath, JSON.stringify({
    settingsVersion: 3,
    inputDir, outputDir,
    ui: { uiLocale: 'en' },
    translate: { apiKey: 'test-key', endpointPreset: 'custom',
      customBaseUrl: `http://127.0.0.1:${port}`, model: 'test-model' },
  }));

  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i',
      "flite=text='The meeting starts at nine thirty. And he left before anyone noticed.':voice=slt",
      '-ar', '16000', '-ac', '1', '-y', clipPath], { timeout: 30000 });
    console.log('[journey] fixture hazır:', clipPath, fs.statSync(clipPath).size, 'bayt');
  } catch (e) {
    console.error('[journey] fixture üretilemedi:', e.message);
    app.exit(2); return;
  }

  app.setAppPath(root);
  app.commandLine.appendSwitch('disable-gpu');
  require('../src/main.js');

  try {
    app.whenReady().then(async () => {
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [clipPath] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });

      const win = await until(() => BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()),
        'ana pencere', 120000);
      const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
      await until(() => run('return typeof initialSettingsReady !== "undefined"'
        + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'ayarlar', 120000);

      // Olay dinleyicisi — renderer kendi dinleyicisine ek olarak ayrı bir
      // abone kaydedilir (api.onEvent unsubscribe döndürür).
      await run(`window.__jobEvents = [];
        window.api.onEvent((ev) => window.__jobEvents.push(ev));
        const set = (id, v) => { const el = document.getElementById(id);
          el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
        set('model', 'tiny'); set('engine', 'faster'); set('device', 'cpu');
        set('formats', 'srt'); set('translateTo', 'tr');
        set('translateEndpointPreset', 'custom');
        set('translateBaseUrl', ${JSON.stringify(`http://127.0.0.1:${port}`)});
        set('translateModel', 'test-model'); set('translateApiKey', 'test-key');
        const on = (id) => { const el = document.getElementById(id); if (el && !el.checked) el.click(); };
        const off = (id) => { const el = document.getElementById(id); if (el && el.checked) el.click(); };
        on('translate'); on('langSuffix');
        off('diarize'); off('llmPostprocess');
        return true;`);

      // 1) Dosya seçimi — gerçek dropZone akışı (dialog stub'lı).
      await run('document.getElementById("dropZone").click(); return true;');
      await until(() => run(`return (state.inputFile || state.inputPath || '')
        .replace(/\\\\/g, '/')`), 'girdi dosyası UI\'a düştü');
      console.log('[journey] girdi seçildi → transkripsiyon başlıyor (tiny/cpu, gerçek model)');

      await run('document.getElementById("startBtn").click(); return true;');
      await until(() => run('return state.running === true'), 'iş başladı', 30000);

      // 2) done/error olayı — gerçek transkripsiyon + stub çeviri.
      const events = await until(() => run(`{
        const ev = window.__jobEvents.filter((e) => e.type === 'done' || e.type === 'error');
        return ev.length ? ev : null;
      }`), 'done/error', 240000);
      assert.equal(events[0].type, 'done', `iş hatası: ${JSON.stringify(events[0]).slice(0, 400)}`);
      console.log('[journey] transkripsiyon+çeviri tamamlandı, sağlayıcı istekleri:', providerRequests.length);

      // langSuffix açıkken kaynak dosya da dil eki alır: konusma.en.srt.
      const srtPath = path.join(outputDir, 'konusma.en.srt');
      const trPath = path.join(outputDir, 'konusma.tr.srt');
      await until(() => fs.existsSync(srtPath) && fs.statSync(srtPath).size > 50, 'srt çıktısı', 15000);
      await until(() => fs.existsSync(trPath) && fs.statSync(trPath).size > 20, 'tr.srt çıktısı', 15000);
      const srtText = fs.readFileSync(srtPath, 'utf8');
      const trText = fs.readFileSync(trPath, 'utf8');
      assert(/-->/ .test(srtText), 'srt cue içermiyor');
      assert(providerRequests.length > 0, 'çeviri sağlayıcısı çağrılmadı');
      assert(/tr~ /.test(trText), `çeviri içeriği yok: ${trText.slice(0, 200)}`);
      console.log('[journey] .srt + .tr.srt yazıldı (sağlayıcı', providerRequests.length, 'istek)');

      // 3) Oynatıcıda cue düzenleme — çıktıyı yükle, ilk cue'yu değiştir,
      //    gerçek dosya yazımı (saveCueEdit → writeSubtitleAtomic).
      await run(`openPlayer(${JSON.stringify({ video: clipPath, files: [srtPath, trPath] })}); return true;`);
      await until(() => run('return player.cues.length > 0'), 'player cues yüklendi', 20000);
      const edit = await run(`
        player.cueEditTarget = { index: 0, path: player.subPath,
          mediaKey: player.mediaKey, signature: cueSignature(player.cues[0]) };
        document.getElementById('subtitleEditBox').value = 'DÜZENLENEN İLK SATIR';
        await saveCueEdit();
        return JSON.stringify({ text: player.cues[0].text, editorOpen: !!player.cueEditTarget });`);
      const editResult = JSON.parse(edit);
      assert.equal(editResult.text, 'DÜZENLENEN İLK SATIR', `cue güncellenmedi: ${edit}`);
      assert.equal(editResult.editorOpen, false, 'editör kapanmadı');
      assert(fs.readFileSync(player_subPath(), 'utf8').includes('DÜZENLENEN İLK SATIR'),
        'düzenleme diske yazılmadı');
      console.log('[journey] cue düzenleme diske yazıldı');

      // 4) Dışa aktar — "farklı kaydet" diyaloğu (stub) + atomik yazım.
      const exported = await run(`return window.api.saveSubtitleCopy(
        ${JSON.stringify(srtPath)}, ${JSON.stringify(fs.readFileSync(srtPath, 'utf8'))});`);
      assert.equal(exported.ok, true, `dışa aktarım hatası: ${JSON.stringify(exported)}`);
      assert(fs.existsSync(exportPath) && fs.readFileSync(exportPath, 'utf8').includes('DÜZENLENEN İLK SATIR'),
        'dışa aktarılan dosya düzenlenmiş metni içermiyor');
      console.log('[journey] dışa aktarım doğrulandı:', exportPath);

      console.log('PASS: tam yolculuk — seç → transkribe → çevir → düzenle → dışa aktar');
      win.close();
      app.exit(0);
    });
  } catch (e) {
    console.error('[journey] hata:', e && e.stack || e);
    app.exit(1);
  }

  function player_subPath() { return path.join(outputDir, 'konusma.en.srt'); }
});
