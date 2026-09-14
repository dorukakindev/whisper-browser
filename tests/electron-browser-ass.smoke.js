'use strict';

const { app, BrowserWindow, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { registerAssAssets, buildAssInstallScript, buildAssClearScript } = require('../src/browser-ass-renderer');

protocol.registerSchemesAsPrivileged([{ scheme: 'whisper-assets', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true,
} }]);
const profile = path.resolve(__dirname, '..', '.uiprev', `ass-profile-${process.pid}`);
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);

async function main() {
  const video = path.resolve(__dirname, '..', '.uiprev', 'browser-media-scene-test.mp4');
  if (!fs.existsSync(video)) {
    fs.mkdirSync(path.dirname(video), { recursive: true });
    const ffmpeg = path.resolve(__dirname, '..', 'backend', 'bin', 'ffmpeg.exe');
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=4', '-y', video], { windowsHide: true });
    if (result.status !== 0) throw new Error(`Test videosu üretilemedi: ${result.stderr?.toString() || 'FFmpeg eksik.'}`);
  }
  const partition = 'persist:whisper-browser';
  const browserSession = session.fromPartition(partition);
  registerAssAssets(browserSession);
  registerAssAssets(browserSession);
  if (!await browserSession.protocol.isProtocolHandled('whisper-assets')) throw new Error('ASS protokolü partition içinde kaydedilmedi.');
  const asset = await browserSession.fetch('whisper-assets://ass/jassub.js');
  if (!asset.ok || (await asset.text()).length < 1000) throw new Error('ASS varlığı partition içinde okunamadı.');
  const forbidden = await browserSession.fetch('whisper-assets://ass/../package.json');
  if (forbidden.ok) throw new Error('ASS varlık allowlist aşıldı.');
  const window = new BrowserWindow({ show: true, width: 760, height: 460, webPreferences: { partition, contextIsolation: true, nodeIntegration: false } });
  const file = path.resolve(__dirname, '..', '.uiprev', 'browser-ass-fixture.html');
  fs.writeFileSync(file, `<html><body style="margin:0;background:#222"><video src="${video.replace(/\\/g, '/')}" width="640" height="360" muted autoplay loop></video></body></html>`);
  await window.loadFile(file);
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,Hello ASS`;
  const result = await window.webContents.executeJavaScript(buildAssInstallScript(ass, 'ass-first', require('../src/browser-fonts').readFonts([path.resolve(__dirname, '../src/renderer/vendor/browser-ass/default.woff2')])), true);
  if (!result.ok) throw new Error(result.error);
  const canvas = await window.webContents.executeJavaScript('({ count: document.querySelectorAll("canvas.JASSUB").length, width: document.querySelector("canvas.JASSUB")?.width, style: document.querySelector("canvas.JASSUB")?.getAttribute("style"), time:document.querySelector("video")?.currentTime })', true);
  if (canvas.count !== 1) throw new Error('ASS canvas oluşturulmadı.');
  await new Promise(resolve => setTimeout(resolve, 800));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.resolve(__dirname, '..', '.uiprev', 'browser-ass-smoke.png'), image.toPNG());
  await window.webContents.executeJavaScript('globalThis.__assOldDetach = globalThis.__whisperAssState.detach; true', true);
  const replacement = await window.webContents.executeJavaScript(buildAssInstallScript(ass.replace('Hello ASS', 'Second ASS'), 'ass-second'), true);
  if (!replacement.ok) throw new Error(replacement.error);
  const oldAbort = await window.webContents.executeJavaScript(buildAssClearScript('ass-first'), true);
  if (oldAbort) throw new Error('Eski iptal yeni ASS katmanını temizledi.');
  const stale = await window.webContents.executeJavaScript('globalThis.__assOldDetach(); ({ active: !!globalThis.__whisperAssState, canvases: document.querySelectorAll("canvas.JASSUB").length })', true);
  if (!stale.active || stale.canvases !== 1) throw new Error('Eski ASS temizleme yeni görünümü kapattı.');
  const detached = await window.webContents.executeJavaScript('document.querySelector("video").remove(); new Promise(resolve => setTimeout(() => resolve({ active: !!globalThis.__whisperAssState, canvases: document.querySelectorAll("canvas.JASSUB").length }), 0))', true);
  if (detached.active || detached.canvases) throw new Error('Video DOM kaldırılınca ASS temizlenmedi.');
  const again = await window.webContents.executeJavaScript('document.body.innerHTML = `<video src="' + video.replace(/\\/g, '/') + '" width="640" height="360" muted autoplay loop></video>`; true', true);
  if (!again) throw new Error('Video yeniden kurulamadı.');
  const finalInstall = await window.webContents.executeJavaScript(buildAssInstallScript(ass, 'ass-final'), true);
  if (!finalInstall.ok) throw new Error(finalInstall.error);
  const cleared = await window.webContents.executeJavaScript(buildAssClearScript('ass-final'), true);
  if (!cleared) throw new Error('ASS temizlenemedi.');
  console.log(JSON.stringify({ result, canvas, oldAbort, stale, detached, cleared }));
  window.close();
}

app.whenReady().then(main).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
