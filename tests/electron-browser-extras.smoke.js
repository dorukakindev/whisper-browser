// Yerel video + ağ dışı HTTPS fixture ile yeni browser araçlarının gerçek Electron/IPC testi.
// node_modules/.bin/electron tests/electron-browser-extras.smoke.js --disable-gpu
'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-extras-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
assert.equal(app.getPath('userData'), process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await wait(200);
  }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(last)}`);
}
const report = {};
app.whenReady().then(async () => {
  const media = fs.readFileSync(require('./browser-feature-fixture').ensureVideo(path.join(root, '.uiprev', 'feature-test.mp4')));
  session.fromPartition('persist:whisper-browser').protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'browser-extras.test') return new Response('Test adresi dışında.', { status: 404 });
    if (url.pathname === '/movie.mp4') {
      const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
        return new Response(media.subarray(start, end + 1), { status: 206, headers: {
          'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${media.length}`, 'Content-Length': String(end - start + 1),
        } });
      }
      return new Response(media, { headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' } });
    }
    return new Response('<!doctype html><meta charset="utf-8"><title>Browser araç testi</title><body style="margin:0;background:#191919;color:#eee"><video controls autoplay muted loop src="/movie.mp4" style="width:90vw;height:70vh"></video></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  win.setContentSize(1440, 960);
  await run('openPlayer();setWorkspaceMode("browser",false);setBrowserCaptureEnabled(true,false)');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Tarayıcı sekmesi').catch(async (error) => {
    const diagnostic = await run('return {mode:player.workspaceMode,busy:player.browserWorkspaceShowBusy,tabId:player.browserActiveTabId,signal:document.getElementById("browserSignalText")?.textContent,pending:state.pendingPlayerLoad?.label}').catch((reason) => ({ error: String(reason) }));
    fs.writeFileSync(path.join(out, 'startup-diagnostic.json'), JSON.stringify(diagnostic, null, 2));
    throw error;
  });
  const navigation = await run('document.getElementById("browserAddress").value="https://browser-extras.test/watch";return navigateBrowserFromAddress()');
  assert.equal(navigation.ok, true, JSON.stringify(navigation));
  const page = await until(() => webContents.getAllWebContents().find((item) => item.getURL() === 'https://browser-extras.test/watch'), 'Video sayfası');
  await until(() => page.executeJavaScript('document.querySelector("video")?.readyState >= 2'), 'Video çözme');
  await until(() => run('return !!browserTabState()?.mediaId'), 'Video kimliği');
  await run('setSideTab("tools");document.getElementById("browserFeatures").open=true');
  assert.equal(await run('return document.getElementById("bfSkipAuto").checked'), false);
  assert.equal(await run('return document.getElementById("browserFeatures").getBoundingClientRect().width > 100'), true);
  const extras = (action, payload = {}) => run(`return window.api.browserExtras({action:${JSON.stringify(action)},tabId:player.browserActiveTabId,generation:browserTabState().generation,mediaId:browserTabState().mediaId,...${JSON.stringify(payload)}})`);
  const first = await extras('skip-list');
  assert.equal(first.ok, true, JSON.stringify(first));
  const saved = await extras('skip-save', { record: { id: 'smoke-intro', scope: 'media', kind: 'intro', start: 1, end: 3, autoSkip: false } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert(saved.records.some((record) => record.id === 'smoke-intro' && record.autoSkip === false));
  const listed = await extras('skip-list');
  assert(listed.records.some((record) => record.id === 'smoke-intro'));
  const deleted = await extras('skip-delete', { id: 'smoke-intro' });
  assert.equal(deleted.ok, true, JSON.stringify(deleted));
  assert(!deleted.records.some((record) => record.id === 'smoke-intro'));
  report.skips = 'kaydet/listele/sil; otomatik atlama varsayılan kapalı';
  await run('document.getElementById("bfSkipStart").value="4";document.getElementById("bfSkipEnd").value="6";document.querySelector("[data-bf-action=skip-save]").click()');
  await until(() => run('return document.getElementById("bfSkipRecords").textContent.includes("0:04–0:06")'), 'UI aralık kaydı');
  assert.equal(await run('return document.getElementById("bfSkipAuto").checked'), false);
  await run('document.querySelector("#bfSkipRecords button").click()');
  await until(() => run('return document.getElementById("bfSkipRecords").textContent.includes("kayıtlı aralık yok")'), 'UI aralık silme');
  report.skipUi = 'form, sonuç ve silme bağlandı';
  const semantic = await extras('semantic-search', { query: 'garden', cues: [
    { start: 0, end: 1, text: 'A quiet garden.' }, { start: 2, end: 3, text: 'Busy road.' },
  ] });
  assert.equal(semantic.ok, true, semantic.error);
  assert.equal(semantic.hits?.length, 2);
  report.semantic = semantic.hits.length;
  const frame = await extras('ocr-frame');
  assert.equal(frame.ok, true, JSON.stringify(frame));
  assert.match(frame.image, /^data:image\//);
  const ocr = await extras('ocr-read', { crop: { x: 0, y: 0, width: 1, height: 1 } });
  assert.equal(ocr.ok, true, ocr.error);
  report.ocr = 'kare ve OCR tamam';
  const assFile = path.join(out, 'sample.ass');
  fs.writeFileSync(assFile, '[Script Info]\nTitle: Smoke\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:04.00,Default,,0,0,0,,Kontrollü ASS satırı\n');
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [assFile] });
  try {
    const ass = await extras('ass-load');
    assert.equal(ass.ok, true, ass.error);
    report.ass = 'yüklendi';
    assert.equal((await extras('ass-clear')).ok, true);
  } finally { dialog.showOpenDialog = originalPicker; }
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(root, '.uiprev', 'feature-test.mp4')] });
  try {
    const sceneResult = await extras('scenes');
    assert.equal(sceneResult.ok, true, sceneResult.error);
    assert(sceneResult.scenes?.length > 0);
    assert.match(sceneResult.scenes[0].thumbnail, /^data:image\/jpeg;base64,/);
    report.scenes = sceneResult.scenes.length;
  } finally { dialog.showOpenDialog = originalPicker; }
  win.show(); win.focus();
  await wait(400);
  fs.writeFileSync(path.join(out, 'wide.png'), (await win.webContents.capturePage()).toPNG());
  win.setContentSize(760, 880);
  await run('setPlayerSidebarCollapsed(false);syncResponsivePlayerLayout();document.getElementById("browserFeatures").open=true');
  await wait(400);
  fs.writeFileSync(path.join(out, 'narrow.png'), (await win.webContents.capturePage()).toPNG());
  const mini = await extras('mini-open');
  assert.equal(mini.ok, true, mini.error);
  report.mini = 'açıldı';
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  app.quit();
}).catch((error) => {
  fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error));
  app.exit(1);
});
