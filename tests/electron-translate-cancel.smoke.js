'use strict';
// R396 (kuyruk-g9): iptal edilen ceviri isinin gec olaylari oyuncu durumuna
// karismamali; is karti 'Iptal edildi' gosterip kapanmali.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const root = '/home/ubuntu/repos/whisper-browser';
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r396-'));
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require(root + '/src/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond) => { if (!cond) { failures++; console.log(`FAIL ${name}`); } else console.log(`ok ${name}`); };

app.whenReady().then(async () => {
  const end = Date.now() + 30000; let win;
  while (Date.now() < end) {
    win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading());
    if (win) break; await wait(200);
  }
  win.setContentSize(1280, 860); win.show(); win.focus(); await wait(1200);
  const run = (c) => win.webContents.executeJavaScript(`(async()=>{${c}})()`, true).catch((e) => 'EVALERR ' + e.message);
  await run('openPlayer(); return 1'); await wait(300);

  const chunk = JSON.stringify({ type: 'translation_chunk', segments: [{ index: 5, start: 1, end: 2, text: 'gec gelen parca' }] });
  // 1) Calisan ceviri isi: translation_chunk cues2'ye yazmali (kontrol).
  console.log(await run(`
    player.mediaKey = 'local:cancel-test'; player.workspaceMode = 'local';
    player.cues2 = [{start:0,end:1,text:'eski ceviri'}];
    player.job = { running: true, mediaKey: player.mediaKey, kind: 'translate',
      liveTranslation: new Map(), cancelled: false, browserTabId: '', workspaceMode: 'local' };
    document.getElementById('playerJobBar').classList.remove('hidden');
    playerJobEvent(${chunk});
    return JSON.stringify({n: player.cues2.length, text: player.cues2.map(c=>c.text).join('|')})`));
  // 2) Iptal sonrasi ayni olay cues2'yi degistirmemeli.
  await run(`
    player.cues2 = [{start:0,end:1,text:'korunan'}];
    player.job.cancelled = true;
    playerJobEvent(${chunk});
    return JSON.stringify({n: player.cues2.length, text: player.cues2[0].text})`)
    .then((r) => { console.log(r); const d = JSON.parse(r);
      check('iptal sonrasi chunk cues2 ye yazmiyor', d.n === 1 && d.text === 'korunan'); });
  // 3) Iptalli isin exit'i: kart 'Iptal edildi' gosterir ve kapanir.
  await run(`
    const bar = document.getElementById('playerJobBar');
    bar.classList.remove('hidden');
    playerJobEvent({ type: 'exit' });
    return JSON.stringify({
      text: document.getElementById('playerJobText').textContent,
      visible: !bar.classList.contains('hidden'),
      job: !!player.job, running: state.running })`)
    .then((r) => { console.log(r); const d = JSON.parse(r);
      check('iptal exit karti "Iptal edildi" diyor', /ptal/.test(d.text));
      check('iptal exitte is temizlendi', d.job === false && d.running === false); });
  await wait(1400);
  await run(`return JSON.stringify({visible: !document.getElementById('playerJobBar').classList.contains('hidden')})`)
    .then((r) => { console.log(r); const d = JSON.parse(r);
      check('is karti iptalden sonra gizlendi', d.visible === false); });
  // 4) Medya degisimi: baska mediaKey'e ait canli chunk dusurulur.
  await run(`
    player.cues2 = [{start:0,end:1,text:'korunan2'}];
    player.job = { running: true, mediaKey: 'local:eski-video', kind: 'translate',
      liveTranslation: new Map(), cancelled: false, browserTabId: '', workspaceMode: 'local' };
    player.mediaKey = 'local:yeni-video';
    playerJobEvent(${chunk});
    return JSON.stringify({n: player.cues2.length, text: player.cues2[0].text})`)
    .then((r) => { console.log(r); const d = JSON.parse(r);
      check('medya degisiminde eski isin chununu yazmiyor', d.n === 1 && d.text === 'korunan2'); });
  // 5) Medya degisimi sifirlamasi: eski videonun eksik-ceviri sayaci yeni
  //    medyanin butonuna 'Eksik cevirileri tamamla (N)' olarak sizmamali.
  await run(`
    player.translationRetryAvailable = 4;
    resetMediaBoundState();
    return JSON.stringify({ retry: player.translationRetryAvailable })`)
    .then((r) => { console.log(r); const d = JSON.parse(r);
      check('medya degisiminde eksik-ceviri sayaci sifirlandi', d.retry === 0); });
  console.log(failures ? `FAIL ${failures} kontrol` : 'PASS: iptal/medya-degisimi karisma sozlesmesi gecti');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
// append handled in-file; placeholder
