'use strict';
const { app, BrowserWindow, webContents, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'browser-analysis-ui-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${process.pid}-${Date.now()}`);
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });
const ffmpeg = path.join(root, 'backend', 'bin', 'ffmpeg.exe');
const video = path.join(out, 'episode.mp4');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
  'color=c=navy:s=320x180:r=6:d=42', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=42',
  '-c:v', 'mpeg4', '-c:a', 'aac', '-y', video], { windowsHide: true });
assert.equal(made.status, 0, String(made.stderr));
const reference = Array.from({ length: 28 }, (_, index) => {
  const start = 1 + index * 1.3 + (index % 3) * .08;
  return { start, end: start + .55 + (index % 2) * .15, text: `Sahne ${index + 1}` };
});
const target = reference.map(cue => ({ ...cue, start: cue.start + 3, end: cue.end + 3 }));
const stamp = seconds => {
  const ms = Math.round(seconds * 1000);
  return `00:${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = path.join(out, 'reference.srt');
fs.writeFileSync(srt, reference.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n'), 'utf8');
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  while (Date.now() < end) { value = await fn(); if (value) return value; await wait(150); }
  throw new Error(`${label} zaman aşımı: ${JSON.stringify(value)}`);
}
app.whenReady().then(async () => {
  const bytes = fs.readFileSync(video);
  session.fromPartition('persist:whisper-browser').protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'browser-analysis-ui.test') return new Response('Test dışında', { status: 404 });
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
    return new Response('<!doctype html><meta charset="utf-8"><video controls muted autoplay loop src="/episode.mp4" style="width:90vw;height:70vh"></video>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  const win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()), 'Ana pencere');
  win.setContentSize(1440, 960);
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return typeof initialSettingsReady !== "undefined" ? await initialSettingsReady.then(()=>true) : false'), 'Ayarlar');
  await run('openPlayer();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));setWorkspaceMode("browser",false);setBrowserCaptureEnabled(true,false)');
  await until(() => run('return !player.browserWorkspaceShowBusy && player.browserActiveTabId'), 'Sekme');
  const nav = await run('document.getElementById("browserAddress").value="https://browser-analysis-ui.test/watch";return navigateBrowserFromAddress()');
  assert.equal(nav.ok, true, nav.error);
  const page = await until(() => webContents.getAllWebContents().find(item => item.getURL() === 'https://browser-analysis-ui.test/watch'), 'Video sayfası');
  await until(() => page.executeJavaScript('document.querySelector("video")?.readyState >= 2'), 'Video çözme');
  await until(() => run('return !!browserTabState()?.mediaId'), 'Medya kimliği');
  await run(`player.cues=${JSON.stringify(target)};player.cuesRaw=player.cues.map(c=>({...c}));player.browserDuration=42;setSideTab('tools');document.getElementById('browserFeatures').open=true;document.getElementById('browserAnalysisTools').open=true;return true`);
  const originalPicker = dialog.showOpenDialog;
  let chosen = video;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  try {
    await run('document.getElementById("baReference").click();return true');
    await until(() => run('return document.getElementById("baReferenceName").textContent.includes("episode.mp4")'), 'UI referans açma');
    await run('document.getElementById("baWaveform").click();return true');
    const wave = await until(() => run('return player.timeline.waveform.length >= 100 && !document.getElementById("timelineDrawer").classList.contains("hidden") ? {points:player.timeline.waveform.length,status:document.getElementById("timelineStatus").textContent,canvas:document.getElementById("timelineCanvas").width} : null'), 'UI dalga biçimi');
    assert(wave.canvas > 0 && wave.status.includes('Referans video sesi'));
    const thumb = await run(`const seek=document.getElementById('baSeek');seek.value='500';seek.dispatchEvent(new Event('input',{bubbles:true}));return true`);
    assert.equal(thumb, true);
    const preview = await until(() => run('return document.getElementById("baThumbImage").src.startsWith("data:image/jpeg;base64,") && !document.getElementById("baThumbImage").hidden ? {time:document.getElementById("baThumbTime").textContent,cue:document.getElementById("baThumbCue").textContent} : null'), 'Kare ve replik önizlemesi');
    assert(preview.time && preview.cue);
    chosen = srt;
    await run('document.getElementById("baAlign").click();return true');
    const draft = await until(() => run('return !document.getElementById("baApply").disabled ? {text:document.getElementById("baAlignment").textContent,changes:document.querySelectorAll("#baAlignment button").length} : null'), 'Senkron taslağı', 60000);
    assert(draft.changes > 0 && draft.text.includes('satır değişecek'));
    const before = await run('return player.cues.map(c=>c.start)');
    await run('document.getElementById("baApply").click();return true');
    const applied = await until(() => run('return player.timeline.undo.length && Math.abs(player.cues[0].start - 1)<.5 ? {first:player.cues[0].start,undo:player.timeline.undo.length,dirty:document.getElementById("timelineDrawer").classList.contains("dirty")} : null'), 'Taslak uygulama');
    assert(applied.dirty);
    await run('document.getElementById("timelineUndo").click();return true');
    const undone = await run('return player.cues.map(c=>c.start)');
    assert(Math.abs(undone[0] - before[0]) < .01, 'Geri al orijinal zamanı döndürmedi.');
    await run('document.getElementById("baAlign").click();document.getElementById("baCancel").click();return true');
    await until(() => run('return document.getElementById("baStatus").textContent.includes("durduruldu") && document.getElementById("baCancel").disabled'), 'UI iptal');
    assert.equal(await run('return document.getElementById("baApply").disabled'), true,
      'İptal edilmiş önizleme uygulanabilir kaldı.');
    await run('document.getElementById("timelineClose").click();document.getElementById("browserFeatures").open=true;document.getElementById("browserAnalysisTools").open=true;document.getElementById("browserAnalysisTools").scrollIntoView({block:"center"});return true');
    await wait(300);
    fs.writeFileSync(path.join(out, 'analysis-ui.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ wave, preview, draft, applied, undone: undone[0] }, null, 2));

    const encoded = path.join(out, 'turkish-1254.srt');
    fs.writeFileSync(encoded, Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'), Buffer.from([0xDE, 0xFD, 0xF0]), Buffer.from('\n')]));
    chosen = encoded;
    await run(`document.querySelector('[data-bf-action="encoding-preview"]').click()`);
    await until(() => run(`return !!document.querySelector('#bfEncodingPreview select')`), 'Kodlama önizlemesi');
    await run(`const select=document.querySelector('#bfEncodingPreview select');select.value='windows-1254';select.dispatchEvent(new Event('change'));`);
    assert(await run(`return document.querySelector('#bfEncodingPreview pre').textContent.includes('Şığ')`));
    await run(`document.querySelector('#bfEncodingPreview button').click()`);
    await until(() => run(`return player.cues.some(c=>c.text.includes('Şığ'))`), 'Kodlama kopyası');
    assert.equal(fs.readFileSync(encoded).includes(Buffer.from([0xDE, 0xFD, 0xF0])), true);
    await run(`document.getElementById('bdRun').closest('details').open=true;document.getElementById('bdEnd').value='100';document.getElementById('bdRun').click()`);
    await until(() => run(`return !document.getElementById('bdRun').disabled && document.getElementById('bdStatus').textContent.includes('Aralık')`), 'Konuşma aralığı doğrulama');
    await run(`document.getElementById('bdRun').closest('details').scrollIntoView({block:'center'})`);
    await wait(200); fs.writeFileSync(path.join(out, 'dialogue-ui.png'), (await win.webContents.capturePage()).toPNG());

    console.log(JSON.stringify({ ok: true, wave, preview, changes: draft.changes, applied, undone: undone[0] }));
  } finally { dialog.showOpenDialog = originalPicker; }
  app.quit();
}).catch(error => { fs.writeFileSync(path.join(out, 'error.txt'), String(error.stack || error)); console.error(error); app.exit(1); });
