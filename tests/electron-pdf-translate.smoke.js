'use strict';

// PDF çeviri uçtan-uca smoke'u: gerçek pdf.js çıkarımı + gerçek IPC +
// çeviri şeması, sağlayıcı olarak smoke'un kendi içindeki OpenAI-uyumlu
// stub (varsayılan: harici servis yok). --live-deepseek açık opt-in ile
// güvenli kayıtlı DeepSeek standard API, sentetik PDF ve ayrı profil kullanır.
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

const live=process.argv.includes('--live-deepseek'),previewAcceptance=process.argv.includes('--preview-acceptance'),root=path.resolve(__dirname,'..');
const out = live ? path.join(root,'.uiprev','pdf-live754-'+Date.now()) : fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-translate-'));
fs.mkdirSync(out,{recursive:true});app.setPath('downloads',out);
let liveKey='',liveCalls=0;
const nativeFetch=global.fetch;
const keyReady=live?new Promise((resolve,reject)=>{
 const broker=require('node:child_process').spawn(process.execPath,[path.join(root,'tools/assistant-deepseek-native.cjs'),'--credential-broker'],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const timer=setTimeout(()=>{broker.kill();reject(Error('Secure broker timeout'));},20000);
 broker.on('message',m=>{if(m?.type==='credential'&&m.key){liveKey=m.key;clearTimeout(timer);resolve();}else if(m?.type==='error'){clearTimeout(timer);reject(Error('Secure credential unavailable'));}});
 broker.on('error',()=>{clearTimeout(timer);reject(Error('Secure broker unavailable'));});broker.on('exit',()=>{if(!liveKey){clearTimeout(timer);reject(Error('Secure credential handoff failed'));}});
}):Promise.resolve();
keyReady.catch(()=>{});
if(live)global.fetch=async(url,options)=>{const allowed=provider.listening?'http://127.0.0.1:'+provider.address().port:null;if(allowed&&new URL(String(url)).origin===allowed)return nativeFetch(url,options);throw Error('Isolated PDF acceptance background network disabled');};
setTimeout(()=>app.exit(2),live?240000:120000).unref();
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
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw);
      if(live){
        await keyReady;assert.equal(body.model,'deepseek-ai/DeepSeek-V4.1-Flash-1017');assert(!body.service_tier);if(++liveCalls>12)throw Error('Live request budget exceeded');
        const response=await nativeFetch('https://api.deepinfra.com/v1/openai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+liveKey},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
        const answer=await response.text();assert(!answer.includes(liveKey));requests.push({n:liveCalls,status:response.status});res.writeHead(response.status,{'Content-Type':'application/json'});res.end(answer);return;
      }
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
      customBaseUrl: `http://127.0.0.1:${port}`, model: live?'deepseek-ai/DeepSeek-V4.1-Flash-1017':'test-model' },
    ui: { translateTo: 'tr',uiLocale:'tr',uiTheme:'dark' },
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
      await keyReady;
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

      await run(`await openPlayer();await openPdfReader(); return true;`);
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
      assert(translated.blocks.every((b) => b.status === 'translated' && (live?typeof b.t==='string'&&b.t.trim()&&!/^tr~ /.test(b.t):/^tr~ /.test(b.t))),
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
      assert(live?translated.blocks.every(b=>exportText.includes(b.t)):/tr~ /.test(exportText), `dışa aktarımda çeviri yok: ${exportText.slice(0, 120)}`);
      console.log('[pdf] durum+dışa aktarım doğrulandı');
      if(live||previewAcceptance){
        if(live)assert(translated.blocks.every(b=>!pageLines.flat().some(line=>b.t.includes(line))),'Source sentences must not survive as translations');
        win.setContentSize(1280,950);win.showInactive();
        await run(`setPdfReaderView('both');document.getElementById('pdfVoicePanel').classList.remove('hidden');document.getElementById('pdfVoiceFrom').value='2';document.getElementById('pdfVoiceTo').value='2';document.getElementById('pdfVoiceText').value='translation';document.getElementById('pdfVoicePreviewOpen').click();return true`);
        await until(()=>run("return !document.getElementById('pdfVoicePreview').hidden&&!document.getElementById('pdfVoicePreviewOpen').disabled"),'translated voice preview');
        const preview=await run("return {text:document.getElementById('pdfVoicePreviewText').value,pages:[...document.getElementById('pdfVoicePreviewPage').options].map(o=>o.value),context:PdfReaderExperience.context()}"),expected=translated.blocks.filter(b=>b.p==='2').map(b=>b.t).join('\n\n');
        assert.equal(preview.text,expected);assert.deepEqual(preview.pages,['2']);
        const failedProgress=await run("const r=player.pdfReader,previous=r.state.pages;r.state.pages={'1':[{status:'failed'}],'2':[{status:'translated',translation:'Controlled ready page'}]};updatePdfReaderProgress();const result={text:document.getElementById('pdfReaderProgress').textContent,complete:document.getElementById('pdfReaderProgress').classList.contains('is-complete')};r.state.pages=previous;updatePdfReaderProgress();return result;");assert.equal(failedProgress.complete,false);assert(failedProgress.text.startsWith('1/2'));
        const before=await run("return api.mediaWorkflows({action:'book-list'})");assert.equal(before.projects.length,0,'Preview must not create a project');
        assert(await run("const node=document.getElementById('pdfVoicePreviewText'),r=node.getBoundingClientRect(),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);return !document.getElementById('playerLayer').classList.contains('hidden')&&bottom>top&&right>left&&!!document.elementFromPoint((left+right)/2,(top+bottom)/2)?.closest('#pdfReader')"),'Preview must be on the visible reader, not hidden behind the home page');
        const previewLayout=await run("const n=document.getElementById('pdfVoicePreviewText'),p=document.getElementById('pdfReaderPages');return {height:n.getBoundingClientRect().height,readerHeight:p.getBoundingClientRect().height,viewport:innerHeight,contentSizing:CSS.supports('field-sizing','content')};");assert(previewLayout.contentSizing);assert(previewLayout.height<130,'Short preview should not reserve a tall empty editor');assert(previewLayout.readerHeight>previewLayout.viewport*.4);
        await wait(350);fs.writeFileSync(path.join(out,'translated-preview.png'),(await win.webContents.capturePage()).toPNG());
        const longPreview=await run("const n=document.getElementById('pdfVoicePreviewText');n.value='Controlled long preview text. '.repeat(2000);return {height:n.getBoundingClientRect().height,scroll:n.scrollHeight,client:n.clientHeight};");assert(longPreview.height<=180.1&&longPreview.scroll>longPreview.client,'Long preview must scroll inside its bound');
        win.setMinimumSize(360,500);win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
        await run("UiLocale.set('en',false);applyUiTheme('light');return true");await wait(250);
        const progressContrast=await run("const s=getComputedStyle(document.getElementById('pdfReaderProgress')),rgb=v=>v.match(/[0-9.]+/g).slice(0,3).map(Number),lum=v=>rgb(v).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0),probe=document.createElement('span');probe.style.backgroundColor='var(--bg-0)';document.body.append(probe);const a=lum(s.color),b=lum(getComputedStyle(probe).backgroundColor);probe.remove();return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);");assert(progressContrast>=4.5,'Completed page progress must remain readable in the light theme');
        const narrowPreview=await run("return {overflow:document.getElementById('pdfReader').scrollWidth>innerWidth+1,height:document.getElementById('pdfVoicePreviewText').getBoundingClientRect().height,width:innerWidth};");assert(!narrowPreview.overflow);fs.writeFileSync(path.join(out,'translated-preview-en-narrow.png'),(await win.webContents.capturePage()).toPNG());
        win.setContentSize(1280,950);win.webContents.setZoomFactor(1);await run("UiLocale.set('tr',false);applyUiTheme('dark');return true");
        await run("document.getElementById('pdfVoicePrepare').click();return true");
        await until(()=>run("return document.getElementById('mediaWorkflowsDialog').open"),'translated source opens production');
        const list=await run("return api.mediaWorkflows({action:'book-list'})");assert.equal(list.projects.length,1);
        const project=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(list.projects[0].id)}})`);
        assert(project.ok);assert.equal(project.project.chapters.length,1);assert.equal(project.project.chapters[0].text,preview.text);
        const result={ok:true,liveProvider:live,standardTier:live,previewLayout,longPreview,narrowPreview,progressContrast,failedProgress,requests:requests.length,translated,exported:true,selectedPages:preview.pages,previewText:preview.text,projectText:project.project.chapters[0].text,previewCreatedNoProject:true,realGeneration:false};
        fs.writeFileSync(path.join(out,'live-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,out,liveCalls}));
      }


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
