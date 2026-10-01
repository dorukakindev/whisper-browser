'use strict';
// R395 (kuyruk-g8): altyazi yazimi basarisizsa kullanici taslagi kaybolmamali
// ve tekrar deneme calismali. Gercek uygulama + gercek IPC; hata enjeksiyonu
// klasor izniyle (0555 → EACCES, 0755 → basari). Yetki diyalogu main'de
// otomatik onaylanir.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const root = '/home/ubuntu/repos/whisper-browser';
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r395-'));
const subDir = path.join(userDir, 'subs');
fs.mkdirSync(subDir, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = userDir;
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require(root + '/src/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond) => { if (!cond) { failures++; console.log(`FAIL ${name}`); } else console.log(`ok ${name}`); };

dialog.showMessageBox = (...a) => Promise.resolve({ response: 1, checkboxChecked: false });

app.whenReady().then(async () => {
  const end = Date.now() + 30000; let win;
  while (Date.now() < end) {
    win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading());
    if (win) break; await wait(200);
  }
  win.setContentSize(1280, 860); win.show(); win.focus(); await wait(1200);
  const run = (c) => win.webContents.executeJavaScript(`(async()=>{${c}})()`, true).catch((e) => 'EVALERR ' + e.message);
  const subPath = path.join(subDir, 'test.srt');
  const srt = (t) => [0, 1, 2].map((i) => `${i + 1}\n${t0(i * 10)} --> ${t0(i * 10 + 5)}\n${t} ${i}`).join('\n\n');
  function t0(s) { return `00:00:${String(s).padStart(2, '0')},000`; }
  fs.writeFileSync(subPath, srt('Ham satir'), 'utf8');

  await run('openPlayer(); return 1'); await wait(300);
  console.log(await run(`player.workspaceMode='local';
    player.cues = Array.from({length:3},(_,i)=>({start:i*10,end:i*10+5,text:'Ham satir '+i,rawText:'Ham satir '+i}));
    player.cuesRaw = player.cues;
    player.subPath = ${JSON.stringify(subPath)};
    player.subRaw = '';
    player.subFormat = 'srt';
    player.mediaKey = 'local:test';
    player.cueEditTarget = { index: 2, path: player.subPath, mediaKey: player.mediaKey, signature: cueSignature(player.cues[2]) };
    document.getElementById('subtitleEditBox').value = 'Kullanicinin duzenlemesi taslak';
    return 'hazir'`));

  // 1) Klasor salt-okunur → gercek IPC EACCES → taslak/bellek korunur.
  fs.chmodSync(subDir, 0o555);
  await run(`await saveCueEdit();
    return JSON.stringify({
      draft: document.getElementById('subtitleEditBox').value,
      cueText: player.cues[2].text,
      undoLen: player.cueEditUndo.length,
      target: !!player.cueEditTarget,
    })`).then((r) => {
    if (String(r).startsWith('EVALERR')) { check('basarisiz yazim eval', false); console.log(r); return null; }
    console.log(r);
    const d = JSON.parse(r);
    check('taslak korunur (editBox degeri)', d.draft === 'Kullanicinin duzenlemesi taslak');
    check('cue.text degismedi', d.cueText === 'Ham satir 2');
    check('undo gecmisi eklenmedi', d.undoLen === 0);
  });
  check('disk dosyasi bozulmadi (eski metin)', fs.readFileSync(subPath, 'utf8').includes('Ham satir 2'));
  check('yarim tmp dosyasi kalmadi', !fs.existsSync(subPath + '.tmp'));

  // 2) Izin geri verilir → ayni taslaqla tekrar deneme basarili.
  fs.chmodSync(subDir, 0o755);
  await run(`await saveCueEdit();
    return JSON.stringify({
      cueText: player.cues[2].text,
      undoLen: player.cueEditUndo.length,
      subRaw: (player.subRaw||'').includes('duzenlemesi'),
      editorGone: !player.cueEditTarget,
    })`).then((r) => {
    if (String(r).startsWith('EVALERR')) { check('tekrar deneme eval', false); console.log(r); return null; }
    console.log(r);
    const d = JSON.parse(r);
    check('cue.text guncellendi', d.cueText === 'Kullanicinin duzenlemesi taslak');
    check('undo kaydi eklendi', d.undoLen === 1);
    check('subRaw yeni icerigi tasiyor', d.subRaw === true);
    check('editor basariyla kapandi', d.editorGone === true);
  });
  check('disk dosyasi yeni metni iceriyor', fs.readFileSync(subPath, 'utf8').includes('duzenlemesi'));

  console.log(failures ? `FAIL ${failures} kontrol` : 'PASS: kayit-hatasi/tekrar-deneme sozlesmesi gecti');
  app.exit(failures ? 1 : 0);
}).catch((e) => { console.error(e); app.exit(1); });
