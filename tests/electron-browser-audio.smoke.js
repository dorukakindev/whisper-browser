'use strict';

const { app, BrowserWindow } = require('electron');
const { findMediaTool } = require('./media-runtime');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { buildBrowserMediaPreferenceScript } = require('../src/browser-media-controller');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };

async function main() {
  const preview = path.resolve(__dirname, '..', '.uiprev');
  fs.mkdirSync(preview, { recursive: true });
  const fixture = path.join(preview, 'browser-audio-fixture.mp4');
  const page = path.join(preview, 'browser-audio-fixture.html');
  const ffmpeg = findMediaTool('ffmpeg') || 'ffmpeg';
  const generated = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=48000:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=15:d=4',
    '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]', '-map', '3:v', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture], { encoding: 'utf8' });
  assert(generated.status === 0, `ffmpeg fixture üretilemedi: ${generated.stderr}`);
  fs.writeFileSync(page, '<!doctype html><meta charset="utf-8"><video src="browser-audio-fixture.mp4" controls></video>');
  const win = new BrowserWindow({ show: true, width: 480, height: 300,
    webPreferences: { contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(page);
  await win.webContents.executeJavaScript(`(() => {
    const Original = window.AudioContext;
    window.__audioContexts = 0;
    window.AudioContext = class extends Original { constructor() { super(); window.__audioContexts += 1; } };
    const video = document.querySelector('video');
    window.__rates = [];
    video.addEventListener('ratechange', () => window.__rates.push({rate: video.playbackRate, time: video.currentTime}));
    return true;
  })()`, true);
  const initial = await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({}), true);
  assert(initial.preference.silenceSpeedEnabled === false, 'Varsayılan hızlandırma açık.');
  const untouched = await win.webContents.executeJavaScript('({count:window.__audioContexts,rate:document.querySelector("video").playbackRate})', true);
  assert(untouched.count === 0 && untouched.rate === 1, 'Kapalı varsayılan WebAudio veya hızı değiştirdi.');
  await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({
    rate: 1, enforceRate: true, silenceSpeedEnabled: true,
    silenceSpeedRate: 3, silenceThresholdDb: -45,
  }), true);
  await win.webContents.executeJavaScript('document.querySelector("video").play()', true);
  for (let attempt = 0; attempt < 28; attempt++) {
    const position = await win.webContents.executeJavaScript('document.querySelector("video").currentTime', true);
    if (position >= 3.9) break;
    await delay(250);
  }
  const playback = await win.webContents.executeJavaScript(`({ rates: window.__rates,
    time: document.querySelector('video').currentTime,
    rate: document.querySelector('video').playbackRate,
    contexts: window.__audioContexts })`, true);
  assert(playback.contexts === 1, 'Etkin ses işleme için tek AudioContext bekleniyordu.');
  assert(playback.rates.some(item => item.rate >= 2.9 && item.time >= .8 && item.time < 3),
    'Gerçek sessiz aralıkta hız 3x olmadı.');
  assert(playback.rates.some(item => item.rate <= 1.01 && item.time >= 2.5),
    'Ton dönünce baz hız geri gelmedi: ' + JSON.stringify(playback));
  assert(!playback.rates.some(item => item.rate <= 1.01 && item.time > 1 && item.time < 2.5),
    'Sessizlikte kendi ratechange olayı hızla mücadele etti.');
  await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({ audioProfile: 'night' }), true);
  await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({ audioProfile: 'dialogue' }), true);
  await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({ audioProfile: 'off' }), true);
  const after = await win.webContents.executeJavaScript('({rate:document.querySelector("video").playbackRate,contexts:window.__audioContexts})', true);
  assert(after.rate === 1 && after.contexts === 1, 'Profil geçişi baz hızı veya grafik yeniden kullanımını bozdu.');
  await win.webContents.executeJavaScript(`(() => { const video = document.querySelector('video');
    video.src = 'https://cross-origin.invalid/clip.mp4'; video.load(); return true; })()`, true);
  await delay(150);
  await win.webContents.executeJavaScript(buildBrowserMediaPreferenceScript({
    silenceSpeedEnabled: true, silenceSpeedRate: 3, audioProfile: 'night',
  }), true);
  const cors = await win.webContents.executeJavaScript('({rate:document.querySelector("video").playbackRate,contexts:window.__audioContexts})', true);
  assert(cors.rate === 1 && cors.contexts === 1, 'CORS erişimi olmayan kaynakta hız/grafik değişti.');
  console.log(JSON.stringify({ ok: true, playback, after, cors }));
  win.close();
  fs.rmSync(page, { force: true });
  fs.rmSync(fixture, { force: true });
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(main).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
