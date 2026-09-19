'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'media-catalog-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${Date.now()}-${process.pid}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const video = path.join(out, 'catalog-film.mp4');
const ffmpeg = path.join(root, 'backend', 'bin', 'ffmpeg.exe');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
  'color=c=blue:s=320x180:r=12:d=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
  '-c:v', 'mpeg4', '-c:a', 'aac', video], { windowsHide: true });
assert.equal(made.status, 0, String(made.stderr));
const poster = path.join(out, 'catalog-poster.jpg');
const posterMade = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', video,
  '-frames:v', '1', poster], { windowsHide: true });
assert.equal(posterMade.status, 0, String(posterMade.stderr));
const db = path.join(out, `synthetic-nmdb-${Date.now()}-${process.pid}.sqlite`);
const python = path.join(root, 'backend', 'venv', 'Scripts', 'python.exe');
const createDb = String.raw`
import sqlite3, sys
db=sqlite3.connect(sys.argv[1]); db.executescript('''
CREATE TABLE works(id INTEGER PRIMARY KEY,title TEXT,original_title TEXT,year TEXT,kind TEXT,imdb_id TEXT,tmdb_id TEXT);
CREATE TABLE filmler(id INTEGER PRIMARY KEY,izleme_durumu TEXT,favori INTEGER,poster_yolu TEXT,konu_ozeti TEXT);
CREATE TABLE work_legacy_links(work_id INTEGER,legacy_film_id INTEGER);
CREATE TABLE media_files(id INTEGER PRIMARY KEY,work_id INTEGER,path TEXT,filename TEXT,is_primary INTEGER);
INSERT INTO works VALUES(1,'Sentetik Kuzey','North','2024','Film','tt1234567','');
INSERT INTO filmler VALUES(11,'İzlenecek',0,'','İçe aktarma testi');
INSERT INTO work_legacy_links VALUES(1,11);
INSERT INTO works VALUES(2,'Sentetik Dizi','Series','2023','Dizi','','tv:42');
INSERT INTO filmler VALUES(12,'İzlenecek',0,'','Sentetik bölüm');
INSERT INTO work_legacy_links VALUES(2,12);
'''); db.commit(); db.close()
`;
const created = spawnSync(python, ['-c', createDb, db], { encoding: 'utf8', windowsHide: true });
assert.equal(created.status, 0, created.stderr);
const dbBefore = fs.readFileSync(db);
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
assert.equal(app.getPath('userData'), process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const deadline = Date.now() + timeout; let value;
  while (Date.now() < deadline) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1440, 960);
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  const api = (action, payload = {}) => run(`return window.api.mediaCatalog({action:${JSON.stringify(action)},...${JSON.stringify(payload)}})`);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('window.UiLocale?.set("tr", false);applyUiTheme("dark");document.getElementById("mediaCatalogOpen").click();return true');
  await until(() => run('return document.getElementById("mediaCatalogDialog").open && !!document.getElementById("mcGrid")'), 'Katalog penceresi');
  const click = text => run(`const bs=[...document.querySelectorAll('#mediaCatalogRoot button')];const b=bs.find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Buton yok: '+${JSON.stringify(text)}+'; mevcut='+bs.map(x=>x.textContent.trim()).join('|'));b.click();return true`);
  const fill = (label, value) => run(`const l=[...document.querySelectorAll('#mediaCatalogRoot label')].find(x=>x.querySelector('span')?.textContent.trim()===${JSON.stringify(label)});const input=l?.querySelector('input,textarea,select');if(!input)throw Error('Alan yok: '+${JSON.stringify(label)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));return true`);
  await click('Film ekle'); await fill('Başlık', 'Sentetik Kuzey'); await fill('Yıl', '2024');
  await fill('IMDb kimliği', 'tt1234567'); await fill('İzleme durumu', 'completed');
  await click('Kataloğa ekle');
  await until(() => run('return [...document.querySelectorAll(".mc-detail h3")].some(x=>x.textContent==="Sentetik Kuzey")'), 'Film UI kaydı');
  const listed = await api('list');
  assert.equal(listed.ok, true, listed.error);
  const film = listed.items.find(item => item.title === 'Sentetik Kuzey');
  assert(film && film.kind === 'film' && film.watchStatus === 'completed');
  await click('Düzenle'); await fill('Konu', 'Manuel açıklama güncellendi'); await click('Değişiklikleri kaydet');
  await until(async () => (await api('list')).items.find(item => item.id === film.id)?.synopsis === 'Manuel açıklama güncellendi', 'Film UI güncelleme');
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [poster] });
  try {
    await click('Afiş seç');
    await until(async () => (await api('list')).items.find(item => item.id === film.id)?.hasPoster, 'Native afiş bağı');
    const posterData = await api('poster', { id: film.id });
    assert.equal(posterData.ok, true, posterData.error);
    assert.match(posterData.image, /^data:image\/(?:png|jpeg);base64,/);
    await run('document.querySelector(".mc-detail-poster")?.scrollIntoView();return true');
    await until(() => run('return document.querySelector(".mc-detail-poster img")?.src.startsWith("data:image/")'), 'Afiş ayrıntı görüntüsü', 5000).catch(async error => {
      throw new Error(`${error.message}; UI=${JSON.stringify(await run('return {heading:document.querySelector(".mc-detail h3")?.textContent,html:document.querySelector(".mc-detail-poster")?.outerHTML,busy:document.getElementById("mediaCatalogRoot").getAttribute("aria-busy"),message:document.getElementById("mediaCatalogRoot").textContent.slice(0,400)}'))}`);
    });
  } finally { dialog.showOpenDialog = originalPicker; }
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
  try {
    await click('Yerel dosya bağla');
    await until(async () => (await api('list')).items.find(item => item.id === film.id)?.source?.type === 'local', 'Yerel dosya bağı');
  } finally { dialog.showOpenDialog = originalPicker; }
  const playback = await api('play', { id: film.id });
  assert.equal(playback.ok, true, playback.error);
  assert.equal(playback.watchItem.localPath.toLowerCase(), video.toLowerCase());
  await click('Oynat');
  await until(() => run('return player.localPath?.toLowerCase().endsWith("catalog-film.mp4") && player.workspaceMode !== "browser"'), 'Yerel video oynatma');
  await until(() => run('return document.getElementById("playerVideo")?.readyState>=2 && document.getElementById("playerVideo")?.duration>7'), 'Yerel video çözme');
  const playerState = await run('return {path:player.localPath,mode:player.workspaceMode,time:document.getElementById("playerVideo")?.currentTime||0}');
  assert.equal(playerState.path.toLowerCase(), video.toLowerCase());
  await run('const v=document.getElementById("playerVideo");v.pause();await new Promise(r=>{v.addEventListener("seeked",r,{once:true});v.currentTime=2.25});await flushWatchState(false,false);return true');
  const resumed = await api('play', { id: film.id });
  assert.equal(resumed.ok, true, resumed.error); assert(resumed.watchItem.position >= 1.7 && resumed.watchItem.position <= 2.6);
  await run('document.getElementById("mediaCatalogOpen").click();return true');
  await until(() => run('return document.getElementById("mediaCatalogDialog").open'), 'Katalog yeniden açma');
  await until(() => run('return [...document.querySelectorAll(".mc-card")].some(x=>x.textContent.includes("Sentetik Kuzey"))'), 'Film katalog kartı');
  await run('const c=[...document.querySelectorAll(".mc-card")].find(x=>x.textContent.includes("Sentetik Kuzey"));c.click();return true');
  await until(() => run('return document.querySelector(".mc-detail h3")?.textContent==="Sentetik Kuzey"'), 'Film ayrıntısı');
  await click('Kaldığın yerden devam et');
  const actualResumed = await until(() => run('const v=document.getElementById("playerVideo");return !document.getElementById("mediaCatalogDialog").open && v?.readyState>=2 && v.currentTime>=1.7 ? v.currentTime : null'), 'Gerçek video devamı');
  assert(actualResumed <= 2.6, `Video yanlış konuma açıldı: ${actualResumed}`);
  await run('document.getElementById("mediaCatalogOpen").click();return true');
  await until(() => run('return document.getElementById("mediaCatalogDialog").open'), 'Katalog üçüncü açma');
  await click('Film ekle'); await fill('Başlık', 'Geçici Film'); await click('Kataloğa ekle');
  await until(() => run('return document.querySelector(".mc-detail h3")?.textContent==="Geçici Film" && document.getElementById("mediaCatalogRoot").getAttribute("aria-busy")!=="true"'), 'Geçici UI kayıt');
  await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
  await click('Sil');
  await until(() => run('return [...document.querySelectorAll("#mediaCatalogRoot button")].some(x=>x.textContent.trim()==="Silme işlemini onayla")'), 'Silme onayı', 5000).catch(async error => {
    throw new Error(`${error.message}; UI=${JSON.stringify(await run('return {heading:document.querySelector(".mc-detail h3")?.textContent,buttons:[...document.querySelectorAll("#mediaCatalogRoot button")].map(x=>x.textContent.trim()),busy:document.getElementById("mediaCatalogRoot").getAttribute("aria-busy")}'))}`);
  });
  await click('Silme işlemini onayla');
  await until(async () => !(await api('list')).items.some(item => item.title === 'Geçici Film'), 'Film UI silme');
  await click('Diziler'); await click('Dizi ekle'); await fill('Başlık', 'Manuel Dizi');
  await fill('İzleme durumu', 'planned'); await click('Kataloğa ekle');
  await until(() => run('return document.querySelector(".mc-detail h3")?.textContent==="Manuel Dizi"'), 'Dizi UI kaydı');
  const withSeries = await api('list');
  const series = withSeries.items.find(item => item.title === 'Manuel Dizi');
  assert(series && series.kind === 'series' && series.watchStatus === 'planned', JSON.stringify(series));
  await click('Bölüm ekle'); await fill('Sezon', '1'); await fill('Bölüm no', '2');
  await fill('Başlık', 'İkinci Bölüm'); await fill('İzleme durumu', 'planned'); await click('Bölümü kaydet');
  await until(async () => (await api('list')).items.find(item => item.id === series.id)?.episodes?.length === 1, 'Bölüm UI kaydı');
  assert.equal((await api('list')).items.find(item => item.id === series.id).episodes[0].watchStatus, 'planned');
  await run('document.querySelector(".mc-episode-actions button:nth-child(2)").click();return true');
  await fill('İzleme durumu', 'completed'); await click('Bölümü kaydet');
  await until(async () => (await api('list')).items.find(item => item.id === series.id)?.episodes?.[0]?.watchStatus === 'completed', 'Bölüm tamamlandı');
  const episode = (await api('list')).items.find(item => item.id === series.id).episodes[0];
  assert.equal(episode.watchStatus, 'completed');
  await run('const i=document.querySelector(".mc-episode input[type=url]");i.value="https://example.test/watch/episode-2";i.dispatchEvent(new Event("input",{bubbles:true}));const row=i.closest(".mc-episode");[...row.querySelectorAll("button")].find(b=>b.textContent==="Adresi bağla").click();return true');
  await until(async () => (await api('list')).items.find(item => item.id === series.id)?.episodes?.[0]?.source?.type === 'browser', 'Bölüm browser URL bağı');
  const watchlist = await run('document.querySelector(".mc-nav button:nth-child(3)").click();return [...document.querySelectorAll(".mc-card")].map(x=>x.textContent)');
  assert(watchlist.some(text => text.includes('Manuel Dizi')));
  await run('document.querySelector(".mc-nav button:nth-child(1)").click();return true');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [db] });
  try {
    await click('Eski arşivi içe aktar');
    await until(() => run('return document.querySelectorAll(".mc-import-row").length===2'), 'nMDB UI önizleme');
    const previewText = await run('return document.querySelector(".mc-import")?.textContent');
    assert(previewText.includes('Sentetik Kuzey') && previewText.includes('Sentetik Dizi'));
    await run('for(const i of document.querySelectorAll(".mc-import-row input")){i.checked=true;i.dispatchEvent(new Event("change",{bubbles:true}))}return true');
    await click('Seçilileri içe aktar');
    await until(() => run('return !document.querySelector(".mc-import") && document.getElementById("mediaCatalogRoot").getAttribute("aria-busy")==="false" && document.querySelector(".mc-feedback")?.textContent.includes("İçe aktarma tamamlandı")'), 'nMDB UI uygulama');
    await until(async () => (await api('list')).items.some(item => item.title === 'Sentetik Dizi'), 'nMDB kalıcı kayıt');
    let after = (await api('list')).items;
    assert.equal(after.find(item => item.title === 'Sentetik Kuzey').watchStatus, 'completed', 'Mevcut izleme durumu değişti.');
    const count = after.length;
    await click('Eski arşivi içe aktar');
    await until(() => run('return document.querySelectorAll(".mc-import-row").length===2'), 'Tekrar nMDB önizleme');
    await run('for(const i of document.querySelectorAll(".mc-import-row input")){i.checked=true;i.dispatchEvent(new Event("change",{bubbles:true}))}return true');
    await click('Seçilileri içe aktar');
    await until(() => run('return !document.querySelector(".mc-import") && document.getElementById("mediaCatalogRoot").getAttribute("aria-busy")==="false" && document.querySelector(".mc-feedback")?.textContent.includes("İçe aktarma tamamlandı")'), 'Tekrar nMDB UI bitişi');
    after = (await api('list')).items;
    assert.equal(after.length, count, 'Tekrar içe aktarma kopya oluşturdu.');
    assert.equal(after.find(item => item.title === 'Sentetik Kuzey').watchStatus, 'completed');
  } finally { dialog.showOpenDialog = originalPicker; }
  assert(dbBefore.equals(fs.readFileSync(db)), 'Sentetik nMDB kaynak veritabanı değişti.');
  await run('document.getElementById("mediaCatalogDialog").showModal();return true').catch(() => {});
  await run('document.getElementById("mediaCatalogDialog").scrollTop=0;return true');
  await until(() => run('return document.getElementById("mediaCatalogRoot").getAttribute("aria-busy")==="false"'), 'Katalog işlem bitişi');
  await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
  await wait(450);
  const colors = await run(`const d=document.getElementById('mediaCatalogDialog');const s=getComputedStyle(d);
    const rules=[];for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules){
      if(rule.selectorText?.includes('mediaCatalogDialog'))rules.push({selector:rule.selectorText,background:rule.style.background,color:rule.style.color,priority:rule.style.getPropertyPriority('background')});
    }}catch{}}return {theme:document.documentElement.dataset.theme,bg:s.backgroundColor,text:s.color,
      token:s.getPropertyValue('--bg-0'),textToken:s.getPropertyValue('--text'),inline:d.style.cssText,
      htmlBg:getComputedStyle(document.documentElement).backgroundColor,bodyBg:getComputedStyle(document.body).backgroundColor,rules}`);
  fs.writeFileSync(path.join(out, 'theme-diagnostic.json'), JSON.stringify(colors, null, 2));
  fs.writeFileSync(path.join(out, 'catalog-open.png'), (await win.webContents.capturePage()).toPNG());
  assert.equal(colors.bg, 'rgb(10, 12, 15)', 'Koyu temada katalog dialog zemini açık kaldı.');
  await run('document.querySelector(".mc-nav button:nth-child(2)").click();return true');
  await until(() => run('return [...document.querySelectorAll(".mc-card")].some(x=>x.textContent.includes("Manuel Dizi"))'), 'Dizi katalog listesi');
  await run('const c=[...document.querySelectorAll(".mc-card")].find(x=>x.textContent.includes("Manuel Dizi"));c.click();return true');
  await until(() => run('return document.querySelector(".mc-detail h3")?.textContent==="Manuel Dizi"'), 'Dizi ayrıntısı');
  await run('document.getElementById("mediaCatalogDialog").scrollTop=0;document.querySelector(".mc-content").scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
  fs.writeFileSync(path.join(out, 'series-detail.png'), (await win.webContents.capturePage()).toPNG());
  win.setContentSize(900, 700);
  await run('document.getElementById("mediaCatalogDialog").scrollTop=0;document.querySelector(".mc-content").scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
  await wait(300);
  fs.writeFileSync(path.join(out, 'series-narrow.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ ok: true, filmId: film.id, seriesId: series.id,
    episode: episode.title, resumed: resumed.watchItem.position, actualResumed, imported: (await api('list')).items.length,
    colors, snapshots: ['catalog-open.png', 'series-detail.png', 'series-narrow.png'] }));
  app.quit();
}).catch(error => { fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error)); console.error(error); app.exit(1); });
