'use strict';
// Design harness: runs the REAL src/main in an isolated profile with an offline fetch and takes screenshots.
//   Windows:  npx electron tools/design-harness/shoot.js
//   env:      STEPS=<steps file>  SHOT_DIR=<out dir>  DESIGN_FIXTURE=podcasts,library,art  HARNESS_TIMEOUT=<ms>
// Output: <SHOT_DIR>/*.png and LOG.json (console warnings/errors, per-step value, ms, optional DOM counters/profile).
// It never touches your personal profile (userData is the isolated profile folder) and opens no file dialogs.
const { app, BrowserWindow, session, screen } = require('electron'), fs = require('node:fs'), path = require('node:path');
const root = process.env.WB_ROOT || path.resolve(__dirname, '..', '..');
const out = process.env.SHOT_DIR || path.join(root, 'tmp', 'design-shots', String(Date.now()));
const profile = path.join(out, 'profile'); fs.mkdirSync(profile, { recursive: true });
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppPath(root); process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
const fixtures = (process.env.DESIGN_FIXTURE || '').split(',').filter(Boolean);
if (fixtures.includes('podcasts')) require('./fixture-podcasts')({ root, profile, app });
if (fixtures.includes('library')) require('./fixture-library')({ root, profile, app });
if (fixtures.includes('stremio')) require('./fixture-stremio')({ root, profile, app });
if (process.env.SEED) require(path.resolve(process.env.SEED))({ root, profile, app });
const realFetch=global.fetch;
global.fetch=async(input,init)=>{const url=new URL(String(input?.url||input));if(fixtures.includes('discovery')){const response=require('./fixture-discovery')(url);if(response)return response;}if(fixtures.includes('stremio')&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port===String(process.env.STREMIO_FIXTURE_PORT||47123))return realFetch(input,init);throw Error('Controlled offline harness');};
require(root + '/src/main');
const steps = require(path.resolve(process.env.STEPS || path.join(__dirname, 'steps.example.js')));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = { errors: [], steps: [] };
let win; const run = (code) => win.webContents.executeJavaScript('(async()=>{' + code + '})()', true);
async function until(fn, label, ms = 25000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (_) {} await wait(150); } throw Error('timeout: ' + label); }
app.whenReady().then(async () => {
  await until(() => { win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()); return win; }, 'window');
  win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2) log.errors.push({ level, message: String(message).slice(0, 400), at: path.basename(source || '') + ':' + line }); });
  if (fixtures.some(f=>['podcasts','library','art','stremio'].includes(f))) require('./fixture-art')(session);
  if (process.env.PROTO) require(path.resolve(process.env.PROTO))(session);
  const dbg = win.webContents.debugger; try { dbg.attach('1.3'); } catch (_) {}
  const counters = async () => { try { await dbg.sendCommand('HeapProfiler.collectGarbage'); return await dbg.sendCommand('Memory.getDOMCounters'); } catch (e) { return { error: String(e.message) }; } };
  if(process.env.DESIGN_DISPLAY){
    const displays=screen.getAllDisplays(),chosen=displays.find(d=>d.label===process.env.DESIGN_DISPLAY)||screen.getPrimaryDisplay();
    log.display={label:chosen.label,bounds:chosen.bounds,scaleFactor:chosen.scaleFactor};
    win.setBounds(chosen.bounds);if(process.env.DESIGN_FULLSCREEN==='1')win.setFullScreen(true);
  }
  win.show(); win.setMinimumSize(420, 480);
  await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true');
  for (const s of steps) {
    const t0 = Date.now();
    try {
      if (s.size) { if(win.isFullScreen()){win.setFullScreen(false);await until(()=>!win.isFullScreen(),'leave fullscreen');await wait(250);}win.setContentSize(s.size[0], s.size[1]); await wait(250); }
      let value = null, prof = null;
      if (s.seq) {
        value = [];
        for (const item of s.seq) {
          if (item.click) {
            const r = await run(`const n=document.querySelector(${JSON.stringify(item.click)});if(!n)return null;n.scrollIntoView({block:'nearest'});const b=n.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),w:b.width,h:b.height}`);
            if (!r || !r.w) { value.push({ click: item.click, missing: true }); continue; }
            win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await wait(60);
            win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await wait(40);
            win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
          }
          if (item.key) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: item.key }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: item.key }); }
          if (item.code) value.push({ label: item.label, v: await run(item.code) });
          await wait(item.wait ?? 250);
          if (item.shot) { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, item.shot + '.png'), img.toPNG()); }
        }
      }
      if (s.profile) { await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 }); await dbg.sendCommand('Profiler.start'); }
      if (s.code) value = await run(s.code);
      if (s.profile) {
        const { profile } = await dbg.sendCommand('Profiler.stop'); const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
        profile.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame, key = (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').slice(-2).join('/') + ':' + (cf.lineNumber + 1); self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000); });
        const parent = new Map(); profile.nodes.forEach((n) => (n.children || []).forEach((c) => parent.set(c, n.id)));
        const incl = new Map(), callers = new Map(), name = (n) => (n.callFrame.functionName || '(anon)') + ' ' + (n.callFrame.url || '').split('/').slice(-2).join('/') + ':' + (n.callFrame.lineNumber + 1);
        profile.samples.forEach((id, i) => { const dt = (profile.timeDeltas[i] || 0) / 1000; const seen = new Set(); let cur = id; const first = byId.get(id);
          while (cur) { const n = byId.get(cur); if (n.callFrame.url) { const k = name(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } } cur = parent.get(cur); }
          if (/^(getBoundingClientRect|getPropertyValue|getClientRects|querySelectorAll|focus|scrollIntoView|\(program\))$/.test(first.callFrame.functionName)) { let c = id; while (c && !byId.get(c).callFrame.url) c = parent.get(c); const who = c ? name(byId.get(c)) : '(native root)'; const k = first.callFrame.functionName + ' <- ' + who; callers.set(k, (callers.get(k) || 0) + dt); } });
        value = { value, inclusive: [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [k, Math.round(v)]), nativeCallers: [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, Math.round(v)]) };
        prof = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v)]);
      }
      await wait(s.wait ?? 600);
      let dom = null; if (s.counters) dom = await counters();
      if (s.shot) { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, s.shot + '.png'), img.toPNG()); }
      log.steps.push({ name: s.name || s.shot, ms: Date.now() - t0, value, dom, prof });
    } catch (e) { log.steps.push({ name: s.name || s.shot, error: String(e.message || e).slice(0, 300) }); }
  }
  fs.writeFileSync(path.join(out, 'LOG.json'), JSON.stringify(log, null, 1)); app.exit(0);
}).catch((e) => { fs.writeFileSync(path.join(out, 'FATAL.txt'), String(e.stack || e)); app.exit(2); });
setTimeout(() => { fs.writeFileSync(path.join(out, 'TIMEOUT.txt'), 'harness timeout'); app.exit(3); }, Number(process.env.HARNESS_TIMEOUT || 170000)).unref();
