'use strict';
// Sonuç modalı "zaman kaydır" aracının uçtan uca doğrulaması:
// gerçek UI tıklaması → window.api.shiftSubs → IPC → onay diyaloğu
// (stub'lı auto-onay/red) → shiftTimecodes → .bak + atomik yazı → log satırı.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'subtitle-shift-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
// TR tohumlu profil: doğrulanan metinler (log + diyalog başlığı) Türkçe sabit.
fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, 'settings.json'),
  JSON.stringify({ settingsVersion: 3, ui: { uiLocale: 'tr' } }));

const srt = path.join(out, 'kaydir.srt');
const SRT_ORIGINAL = '1\n00:00:01,000 --> 00:00:02,000\nBirinci satır\n\n2\n00:00:05,000 --> 00:00:06,500\nİkinci satır\n';
fs.writeFileSync(srt, SRT_ORIGINAL, 'utf8');
const srtDenied = path.join(out, 'reddedilen.srt');
fs.writeFileSync(srtDenied, SRT_ORIGINAL, 'utf8');
const video = path.join(out, 'klip.mp4');
fs.writeFileSync(video, Buffer.from('not a real video'), 'utf8');

app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
const dialogs = [];
app.whenReady().then(async () => {
  const originalBox = dialog.showMessageBox;
  let consent = 1;
  dialog.showMessageBox = async (win, opts) => {
    dialogs.push({ title: String(opts?.title || ''), buttons: opts?.buttons || [] });
    return { response: consent };
  };
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
    const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
    const lastLog = 'const L=[...document.querySelectorAll("#log .log-line")].map(e=>e.textContent);return L.slice(-3);';
    const logText = async () => (await run(lastLog)).join(' | ');

    // 1) Mutlu yol: modal açık + SRT çıktısı + onay diyaloğu auto-onaylı.
    await run(`showResultModal({files:[${JSON.stringify(srt)}],segments:2,language:'en'});`
      + 'document.getElementById("shiftSeconds").value="1.5";'
      + 'document.getElementById("applyShift").click();return true');
    const shifted = await until(() => {
      const text = fs.readFileSync(srt, 'utf8');
      return text.includes('00:00:02,500 --> 00:00:03,500') ? text : null;
    }, 'Kaydırılmış zaman kodu');
    assert(shifted.includes('00:00:06,500 --> 00:00:08,000'), 'İkinci blok kaymadı.');
    assert.equal(fs.readFileSync(srt + '.bak', 'utf8'), SRT_ORIGINAL, '.bak orijinali korumadı.');
    assert(dialogs.some(d => d.title === 'Altyazı dosyasına erişim'), 'Onay diyaloğu sorulmadı.');
    assert((await logText()).includes('Zaman kaydırıldı (+1.5s)'), 'Başarı logu yazılmadı: ' + (await logText()));

    // 2) Onay reddi: hiç yetkilendirilmemiş ikinci dosyada diyalog reddedilir —
    // dosya değişmemeli, hata logu düşmeli.
    consent = 0;
    await run(`showResultModal({files:[${JSON.stringify(srtDenied)}],segments:2,language:'en'});`
      + 'document.getElementById("shiftSeconds").value="2";'
      + 'document.getElementById("applyShift").click();return true');
    await until(() => logText().then(t => t.includes('Kaydırma başarısız') ? t : null), 'Red hata logu');
    assert((await logText()).includes('onaylanmadı'), 'Red nedeni loga yansımadı: ' + (await logText()));
    assert.equal(fs.readFileSync(srtDenied, 'utf8'), SRT_ORIGINAL, 'Reddedilen kaydırma dosyayı değiştirdi.');
    consent = 1;

    // 3) Geçersiz girdi: IPC'ye hiç çıkmadan uyarı.
    const dialogCount = dialogs.length;
    await run('document.getElementById("shiftSeconds").value="abc";'
      + 'document.getElementById("applyShift").click();return true');
    await until(() => logText().then(t => t.includes('Geçerli bir kaydırma değeri') ? t : null), 'Geçersiz girdi uyarısı');
    assert.equal(dialogs.length, dialogCount, 'Geçersiz girdide onay diyaloğu açıldı.');

    // 4) Altyazı olmayan çıktı listesi: uyarı, IPC yok.
    await run(`showResultModal({files:[${JSON.stringify(video)}],segments:0,language:'en'});`
      + 'document.getElementById("shiftSeconds").value="1";'
      + 'document.getElementById("applyShift").click();return true');
    await until(() => logText().then(t => t.includes('Kaydırılacak SRT/VTT çıktısı yok') ? t : null), 'Altyazısız uyarı');
    assert.equal(dialogs.length, dialogCount, 'Altyazısız dosyada onay diyaloğu açıldı.');

    // 5) Negatif kaydırma blok budaması: mevcut dosyada 1. blok
    // (2.5→3.5s) -3.6s ile tamamen 0 öncesine kayar ve silinir; 2. blok
    // (6.5→8.0s → 2.9→4.4s) kelepçeli olarak kalır.
    await run(`showResultModal({files:[${JSON.stringify(srt)}],segments:2,language:'en'});`
      + 'document.getElementById("shiftSeconds").value="-3.6";'
      + 'document.getElementById("applyShift").click();return true');
    await until(() => {
      const text = fs.readFileSync(srt, 'utf8');
      return !text.includes('Birinci satır') ? text : null;
    }, 'Negatif kaydırma blok budaması', 15000);
    const shiftedBack = fs.readFileSync(srt, 'utf8');
    assert(shiftedBack.includes('00:00:02,900 --> 00:00:04,400'), 'Kalan blok kelepçeli kaymadı.');
    assert(shiftedBack.includes('İkinci satır'), 'Kalan blok metni kayboldu.');

    console.log(JSON.stringify({ ok: true, dialogs: dialogs.length, shifted: shifted.split('\n')[1] }));
  } finally { dialog.showMessageBox = originalBox; }
  app.quit();
}).catch(error => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  console.error(error); app.exit(1);
});
