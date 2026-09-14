'use strict';

const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserMiniPlayer } = require('../src/browser-mini-player');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function main() {
  const preview = path.resolve(__dirname, '..', '.uiprev');
  const videoPath = path.join(preview, 'browser-media-scene-test.mp4');
  require('./browser-feature-fixture').ensureVideo(videoPath);
  const fixture = path.join(preview, 'browser-mini-fixture.html');
  fs.writeFileSync(fixture, `<!doctype html><html lang="tr"><meta charset="utf-8"><style>
    body{margin:0;background:#151719;color:white}video{width:100%;height:100%;object-fit:contain}
    #captions{position:fixed;bottom:12%;width:100%;text-align:center;font:24px sans-serif;text-shadow:0 2px 4px #000}
    #translation{color:#e8bd72}
    </style><video src="browser-media-scene-test.mp4" muted autoplay loop playsinline></video>
    <div id="captions"><div id="source">Original subtitle</div><div id="translation">Çeviri altyazısı</div></div></html>`);
  const owner = new BrowserWindow({ show: true, width: 900, height: 650 });
  const view = new WebContentsView();
  const tab = { view, closing: false };
  owner.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  await view.webContents.loadFile(fixture);
  await view.webContents.executeJavaScript('document.querySelector("video").play()', true);
  const originalId = view.webContents.id;
  let commanded = false;
  const mini = createBrowserMiniPlayer({ BrowserWindow, ipcMain, owner: () => owner,
    restore: () => view.setBounds({ x: 0, y: 0, width: 900, height: 600 }),
    command: async () => { commanded = true; return { ok: true }; } });
  assert(mini.open(tab).ok, 'Küçük pencere açılmadı.');
  let popup = BrowserWindow.getAllWindows().find(item => item !== owner);
  assert(popup && popup.isAlwaysOnTop(), 'Pencere üstte tutulmuyor.');
  await delay(500);
  const ipcResult = await popup.webContents.executeJavaScript('window.mini.command("play-pause")', true);
  assert(ipcResult.ok && commanded, 'Küçük pencerenin IPC komutu uygulanmadı.');
  let state = await view.webContents.executeJavaScript(`({playing:!document.querySelector('video').paused,
    source:document.querySelector('#source')?.textContent,
    translation:document.querySelector('#translation')?.textContent,
    time:document.querySelector('video').currentTime})`, true);
  assert(state.playing && state.source === 'Original subtitle' && state.translation === 'Çeviri altyazısı',
    'Video ve çift altyazı mini pencerede birlikte kalmadı.');
  assert(view.webContents.id === originalId && !view.webContents.isDestroyed(), 'Taşıma webContents kimliğini değiştirdi.');
  const image = await popup.capturePage();
  fs.writeFileSync(path.join(preview, 'browser-mini-smoke.png'), image.toPNG());
  const contentImage = await view.webContents.capturePage();
  fs.writeFileSync(path.join(preview, 'browser-mini-content-smoke.png'), contentImage.toPNG());
  mini.close();
  assert(!view.webContents.isDestroyed(), 'Kapatma video webContents nesnesini öldürdü.');
  assert(owner.contentView.children.includes(view), 'Kapatma görünümü ana pencereye döndürmedi.');
  assert(mini.open(tab).ok, 'Yeniden açma başarısız.');
  popup = BrowserWindow.getAllWindows().find(item => item !== owner && !item.isDestroyed());
  assert(popup, 'Yeniden açılan pencere bulunamadı.');
  tab.closing = true;
  mini.close();
  assert(!owner.contentView.children.includes(view), 'Kapanan sekme ana pencereye geri bağlandı.');
  assert(!view.webContents.isDestroyed(), 'Sekme kapanışında sahiplik kararı verilmeden webContents öldü.');
  view.webContents.close();
  owner.close();
  fs.rmSync(fixture, { force: true });
  console.log(JSON.stringify({ ok: true, originalId, state,
    snapshots: ['browser-mini-smoke.png', 'browser-mini-content-smoke.png'] }));
}

app.whenReady().then(main).then(() => app.quit()).catch(error => {
  console.error(error);
  app.exit(1);
});
