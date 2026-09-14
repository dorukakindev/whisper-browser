// Yerel sesli video, kontrollü HTTPS sayfası ve ayrı profil ile analiz araçları.
// node_modules/.bin/electron tests/electron-browser-analysis.smoke.js --disable-gpu
'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-analysis-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const ffmpeg = path.join(root, 'backend', 'bin', 'ffmpeg.exe');
const video = path.join(out, 'episode-a.mp4');
const other = path.join(out, 'episode-b.mp4');
if (!fs.existsSync(video)) {
  const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=c=navy:s=320x180:r=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000',
    '-t', '12', '-c:v', 'mpeg4', '-c:a', 'aac', '-y', video], { windowsHide: true });
  assert.equal(made.status, 0, String(made.stderr));
}
if (!fs.existsSync(other)) fs.copyFileSync(video, other);
const referenceSrt = path.join(out, 'reference.srt');
fs.writeFileSync(referenceSrt, Array.from({ length: 12 }, (_, index) => {
  const start = `00:00:${String(index).padStart(2, '0')},000`;
  const end = `00:00:${String(index + 1).padStart(2, '0')},000`;
  return `${index + 1}\n${start} --> ${end}\nCaptain ${index + 1}\n`;
}).join('\n'), 'utf8');
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
assert.equal(app.getPath('userData'), process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let latest;
  while (Date.now() < end) { latest = await fn(); if (latest) return latest; await wait(200); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(latest)}`);
}
const report = {};
app.whenReady().then(async () => {
  const bytes = fs.readFileSync(video);
  session.fromPartition('persist:whisper-browser').protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'browser-analysis.test') return new Response('Test dışında', { status: 404 });
    if (url.pathname === '/episode.mp4') {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
      if (range) {
        const first = Number(range[1]), last = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        return new Response(bytes.subarray(first, last + 1), { status: 206, headers: {
          'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${first}-${last}/${bytes.length}`, 'Content-Length': String(last - first + 1),
        } });
      }
      return new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' } });
    }
    return new Response('<!doctype html><meta charset="utf-8"><title>Dizi analiz testi</title><video controls muted autoplay loop src="/episode.mp4" style="width:90vw;height:70vh"></video>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();setWorkspaceMode("browser",false);setBrowserCaptureEnabled(true,false)');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi');
  const navigation = await run('document.getElementById("browserAddress").value="https://browser-analysis.test/watch";return navigateBrowserFromAddress()');
  assert.equal(navigation.ok, true, navigation.error);
  const page = await until(() => webContents.getAllWebContents().find((item) => item.getURL() === 'https://browser-analysis.test/watch'), 'Video sayfası');
  await until(() => page.executeJavaScript('document.querySelector("video")?.readyState >= 2'), 'Video çözme');
  await until(() => run('return !!browserTabState()?.mediaId'), 'Video kimliği');
  const extras = (action, payload = {}) => run(`return window.api.browserExtras({action:${JSON.stringify(action)},tabId:player.browserActiveTabId,generation:browserTabState().generation,mediaId:browserTabState().mediaId,...${JSON.stringify(payload)}})`);
  let chosen = video;
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  try {
    const opened = await extras('reference-open');
    assert.equal(opened.ok, true, opened.error);
    assert(opened.duration >= 11);
    report.reference = { name: opened.name, duration: opened.duration };
    const wave = await extras('reference-waveform');
    assert.equal(wave.ok, true, wave.error);
    assert(wave.points?.length >= 100);
    report.waveform = wave.points.length;
    const thumb = await extras('reference-thumbnail', { time: 2 });
    assert.equal(thumb.ok, true, thumb.error);
    assert.match(thumb.image, /^data:image\/jpeg;base64,/);
    report.thumbnail = 'JPEG kare';
    chosen = referenceSrt;
    const cues = Array.from({ length: 12 }, (_, index) => ({ start: index + .2, end: index + 1.2, text: `Captain ${index + 1}` }));
    const aligned = await extras('alignment-preview', { cues });
    assert.equal(aligned.ok, true, aligned.error);
    assert.equal(aligned.diagnostics?.autoApply, false);
    report.alignment = { confidence: aligned.diagnostics.confidence, changed: aligned.diagnostics.changedCount };
    const contextResult = await extras('series-context:save', { seriesName: 'Kuzey', profile: {
      synopsis: 'Kontrollü kullanıcı özeti.', addressStyle: 'Resmî hitap', terms: [{ source: 'Captain', target: 'Kaptan' }],
    } });
    assert.equal(contextResult.ok, true, contextResult.error);
    const loaded = await extras('series-context:get');
    assert.equal(loaded.context?.profile?.terms?.[0]?.target, 'Kaptan');
    await run('document.getElementById("browserFeatures").open=true;document.getElementById("bfContextSeries").value="Kuzey";document.getElementById("bfContextSynopsis").value="Kontrollü kullanıcı özeti.";document.getElementById("bfContextStyle").value="Resmî hitap";document.getElementById("bfContextTerms").value="Captain = Kaptan";document.getElementById("bfContextSave").click()');
    await until(() => run('return document.getElementById("bfContextStatus").textContent.includes("kaydedildi")'), 'UI dizi bağlamı kaydı');
    await run('document.getElementById("bfContextTerms").value="";document.getElementById("bfContextBind").click()');
    await until(() => run('return document.getElementById("bfContextTerms").value === "Captain = Kaptan"'), 'Dizi bağlama kayıtlı tercihleri korur');
    await run('player.browserTracks=[];player.browserLoadedTrackId="";player.browserLoadedTrackId2="";player.subRole="translation";player.sub2Role="source";player.cues=[{start:0,end:1,text:"Komutan"}];player.cues2=[{start:0,end:1,text:"Captain"}];document.getElementById("bfContextCheck").click()');
    await until(() => run('return document.querySelectorAll("#bfContextIssues .bf-result").length === 1'), 'Ters sıralı kaynak ve çeviri kontrolü');
    const checked = await extras('series-context:check', { cues: [{ start: 0, end: 1, text: 'Captain' }],
      translations: [{ start: 0, end: 1, text: 'Komutan' }] });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.issues?.length, 1);
    report.series = 'kaydet, geri oku, terim incelemesi';
    chosen = other;
    const intro = await extras('intro-detect');
    assert.equal(intro.ok, true, intro.error);
    assert.equal(intro.diagnostics?.autoSkip, false);
    report.intro = intro.candidates?.length || 0;
    const ocr = await extras('ocr-range', { start: 0, end: 1, crop: { x: 0, y: 0, width: 1, height: 1 } });
    assert.equal(ocr.ok, true, ocr.error);
    report.ocrRange = ocr.diagnostics?.frames || 0;
    await run('document.getElementById("browserFeatures").open=true;document.getElementById("browserVideoAnalysisTools").scrollIntoView({block:"center"})');
    await wait(250);
    fs.writeFileSync(path.join(out, 'ocr-ui.png'), (await win.webContents.capturePage()).toPNG());
    await run('document.getElementById("bfSeriesContext").scrollIntoView({block:"center"})');
    await wait(250);
    fs.writeFileSync(path.join(out, 'series-ui.png'), (await win.webContents.capturePage()).toPNG());
  } finally { dialog.showOpenDialog = originalPicker; }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  app.quit();
}).catch((error) => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  app.exit(1);
});
