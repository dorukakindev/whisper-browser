'use strict';
// Real app renderer and CSS, synthetic profile/catalog/controlled book IPC.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'tmp/audit-fixes/design817');
fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, `profile-${Date.now()}`);
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
global.fetch = async () => { throw Error('Design fixture blocks external requests'); };
// Book display fixture only: production UI/ReaderAudioControl run unchanged;
// backend narration is not exercised and no provider/GPU is contacted.
const fixture = { id: 'design817-book', title: 'Okuma tercihi', source: '', selectedChapters: [0, 1], chapters: [0, 1].map(id => ({ id, title: `Bölüm ${id + 1}`, text: `Bölüm ${id + 1} için kontrollü okuma metni.`, status: 'ready', output: 'fixture-output', textHash: `hash-${id}`, groups: [] })) };
const rawHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => rawHandle(channel, channel === 'media-workflows:request' ? async (event, request = {}) => {
  if (request.action === 'book-list') return { ok: true, projects: [fixture] };
  if (request.id === fixture.id) {
    if (request.action === 'book-listen') return { ok: true, path: path.join(out, 'silent.wav'), chapter: fixture.chapters[request.chapter].title, groups: [{ text: fixture.chapters[request.chapter].text, start: 0, end: 2 }], position: 0, outputId: 'fixture-output', textHash: `hash-${request.chapter}`, duration: 2 };
    if (request.action.includes('bookmark')) return { ok: true, bookmarks: [] };
    return { ok: true, project: fixture, groups: [], rows: [], voices: [] };
  }
  return handler(event, request);
} : handler);
// Silent playable media avoids audible output during rendering acceptance.
const wav = Buffer.alloc(44 + 16000 * 2 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40); fs.writeFileSync(path.join(out, 'silent.wav'), wav);
require('../src/main');
let win; const rows = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
async function until(check, name) { for (let n = 0; n < 250; n++) { if (await check()) return; await wait(80); } throw Error(`Timed out: ${name}`); }
async function viewport(width, height, zoom = 1) { win.setContentSize(width, height); win.webContents.setZoomFactor(zoom); await wait(180); }
async function capture(name, script) {
  win.focus(); await run('await document.fonts.ready;await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),new Promise(r=>setTimeout(r,250))]);');
  await wait(600); const metrics = script ? await run(script) : {};
  await win.webContents.capturePage(); await wait(120);
  fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG()); rows.push({ name, ...metrics }); return metrics;
}
app.whenReady().then(async () => {
  await until(() => { win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()); return win; }, 'main renderer');
  win.webContents.setAudioMuted(true); win.webContents.setBackgroundThrottling(false); win.setSkipTaskbar(true); win.showInactive(); await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");');
  await viewport(1000, 760); await run('await AppSettingsUI.open("ai");');
  for (const language of ['tr','en']) {
  await run(`UiLocale.set(${JSON.stringify(language)},false);`); await wait(100);
  for (const query of ['Flex', 'DeepInfra', 'model', 'API']) {
    const result = await run(`const input=document.getElementById('appSettingsSearch');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));return {query:input.value,noMatches:!document.getElementById('appSettingsNoMatches').classList.contains('hidden'),count:document.querySelectorAll('[data-app-settings]:not(.hidden)').length};`);
    if (result.noMatches) console.log(await run('return [...document.querySelectorAll("[data-app-settings]")].map(n=>({id:n.dataset.appSettings,index:n.dataset.search}));'));
    assert(!result.noMatches && result.count > 0, query); rows.push({ id: 'D01', ...result });
  }
  }
  await run('UiLocale.set("tr",false);');
  await run('const q=document.getElementById("appSettingsSearch");q.value="Flex";q.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-app-settings]:not(.hidden)").click();'); assert.equal(await run('return document.getElementById("appSettingsSearch").value'), 'Flex'); await capture('01-settings-flex');
  await run('AppSettingsUI.close();MediaHomeUI.openStudio();document.getElementById("primarySettingsOpen").open=true;');
  for (const width of [940, 1000, 1440]) for (const zoom of [1, 1.25]) {
    await viewport(width, 760, zoom); await run('document.getElementById("model").scrollIntoView({block:"center"});');
    const result = await capture(`02-model-${width}-${zoom}`, 'const status=document.getElementById("modelInstallStatus"),field=document.querySelector(".model-field");return {width:innerWidth,statusWidth:status.clientWidth,statusScroll:status.scrollWidth,font:getComputedStyle(status).fontSize,maintenanceClosed:!document.querySelector(".model-management").open,fieldWidth:field.clientWidth};'); assert(result.statusWidth >= 160 && result.statusScroll <= result.statusWidth + 1); assert.equal(result.maintenanceClosed, true);
  }
  await viewport(1000, 760); await run('document.querySelector(".model-management").open=true;document.querySelector(".model-management").scrollIntoView({block:"center"});');
  let m = await capture('03-model-management-open', 'return {fonts:[...document.querySelectorAll(".model-management-row button,.model-management-row label,.model-management-row input,.model-management-row select")].map(n=>parseFloat(getComputedStyle(n).fontSize))};'); assert(m.fonts.every(font => font >= 12));
  const prefix = 'D:\\Sentetik_Tasarim_Denetimi\\Video_Projeleri\\2026\\Uzun_Ortak_Klasor_Adi\\';
  await run(`updateFolderPathDisplay('inputDir',${JSON.stringify(prefix + 'GIRDI')});updateFolderPathDisplay('outputDir',${JSON.stringify(prefix + 'CIKTI')});document.getElementById('inputDir').scrollIntoView({block:'center'});`);
  await capture('04-folder-tails'); win.focus(); win.webContents.focus(); await run('document.getElementById("inputDir").focus();'); await wait(80); win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'}); win.webContents.sendInputEvent({type:'char',keyCode:'\r'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'}); await wait(100);
  m = await capture('05-folder-keyboard-detail', 'const d=document.querySelector(".folder-path-dialog");return {open:d.open,value:d.querySelector("textarea").value,readOnly:d.querySelector("textarea").readOnly};'); assert.equal(m.value, prefix + 'GIRDI'); assert(m.open && m.readOnly); await run('document.querySelector(".folder-path-dialog").close();');
  await viewport(940, 680); await run('document.getElementById("openPlayer").click();await new Promise(r=>setTimeout(r,250));openBrowserCommandPalette();');
  const paletteMetrics = 'const p=document.getElementById("browserCommandPalette"),hint=p.querySelector(".browser-command-hint");return {height:innerHeight,palette:p.getBoundingClientRect().toJSON(),hint:hint.getBoundingClientRect().toJSON(),list:document.getElementById("browserCommandList")?.getBoundingClientRect().toJSON()};';
  for (const language of ['tr', 'en']) for (const zoom of [1, 1.25, 1.5]) {
    await viewport(940, 680, zoom); await run(`UiLocale.set(${JSON.stringify(language)},false);applyUiTheme(${JSON.stringify(language === 'en' ? 'light' : 'dark')});`);
    m = await capture(`06-palette-${language}-${zoom}`, paletteMetrics); assert(m.palette.bottom <= m.height + 1 && m.hint.bottom <= m.height + 1, `${language} ${zoom}`);
  }
  await viewport(1440, 900); await run('closeBrowserCommandPalette();setBrowserSideRailPref("panel");document.getElementById("playerLayer").style.setProperty("--side-w","55%");const root=document.getElementById("browserQuickPlaces");root.classList.remove("hidden");const list=document.getElementById("browserQuickPlacesList");list.replaceChildren(...Array.from({length:4},(_,i)=>{const tile=document.createElement("button");tile.className="browser-quick-place";tile.textContent="Yer imi "+(i+1);return tile;}));');
  m = await capture('07-quickplaces-narrow-panel', 'const list=document.getElementById("browserQuickPlacesList");return {workspace:document.querySelector(".browser-workspace").clientWidth,columns:getComputedStyle(list).gridTemplateColumns,client:list.clientWidth,scroll:list.scrollWidth};'); assert(m.columns.split(' ').length === 2 && m.scroll <= m.client + 1);
  const toolbarMetrics = 'const w=document.querySelector(".browser-workspace").getBoundingClientRect(),nav=document.querySelector(".browser-nav").getBoundingClientRect(),address=document.querySelector(".browser-address-wrap").getBoundingClientRect(),actions=document.querySelector(".browser-toolbar-actions").getBoundingClientRect();return {width:w.width,nav:nav.toJSON(),address:address.toJSON(),actions:actions.toJSON(),left:w.left,right:w.right,moreVisible:!!document.querySelector(".browser-more > summary")?.getClientRects().length};';
  for (const ratio of ['55%','70%']) {
    await run(`document.getElementById('playerLayer').style.setProperty('--side-w',${JSON.stringify(ratio)});`);
    m = await capture(`07b-toolbar-panel-${ratio.replace('%','')}`, toolbarMetrics);
    assert(m.nav.right <= m.address.left + 1); assert(m.address.right <= m.actions.left + 1 || m.actions.top >= m.address.bottom - 1);
    assert(m.nav.left >= m.left && m.actions.right <= m.right + 1 && m.moreVisible);
  }
  assert(await run('let reached=false;const target=document.getElementById("browserDubAdd");target.disabled=false;target.addEventListener("click",event=>{event.preventDefault();event.stopImmediatePropagation();reached=true;},{capture:true,once:true});document.querySelector("#browserMoreMenu [data-browser-proxy=browserDubAdd]").click();return reached;'));
  await viewport(940, 680); await run('const p=document.querySelector(".player-layer");p.style.removeProperty("--side-w");UiLocale.set("tr",false);applyUiTheme("dark");');
  for (const [name, title] of [['long', 'Uzun_Kesintisiz_Dosya_Adindan_Gelen_'.repeat(5)], ['words', 'Uzun Türkçe ve English başlık '.repeat(8)], ['short', 'Kuzeyin Hikâyesi']]) {
    await run(`MediaCatalogUI.close();const r=await window.api.mediaCatalog({action:'save',item:{kind:'film',title:${JSON.stringify(title)},year:2026,watchStatus:'planned',synopsis:'Sentetik tasarım denetimi.'}});if(!r.ok)throw Error(r.error);await MediaCatalogUI.open({id:r.item.id});`);
    m = await capture(`08-catalog-${name}`, 'const hero=document.querySelector(".mc-detail-hero");return {client:hero.clientWidth,scroll:hero.scrollWidth,title:hero.querySelector("h3").textContent};'); assert(m.scroll <= m.client + 1);
  }
  await run('MediaCatalogUI.close();await MediaWorkflowsUI.openProject("design817-book");');
  await run('await MediaWorkflowsUI.assistant.execute("book_chapter",{chapter:1,operation:"listen"},()=>false);');
  await until(() => run('return !!document.querySelector(".mw-reading-text")'), 'book reader');
  await run('const font=document.querySelector(".mw-reader-tools input[type=range]");font.value="27";font.dispatchEvent(new Event("input",{bubbles:true}));');
  await run('await MediaWorkflowsUI.assistant.execute("book_chapter",{chapter:2,operation:"listen"},()=>false);');
  m = await capture('09-book-font-next-chapter', 'return {font:getComputedStyle(document.querySelector(".mw-reading-text")).fontSize,value:document.querySelector(".mw-reader-tools input[type=range]").value,stored:localStorage.getItem("whisper.bookReaderFontSize")};'); assert.equal(m.font, '27px'); assert.equal(m.value, '27'); assert.equal(m.stored, '27');
  await run('await MediaWorkflowsUI.assistant.execute("book_chapter",{chapter:1,operation:"listen"},()=>false);await document.querySelector("#mediaWorkflowsDialog audio").onended();');
  assert.equal(await run('return getComputedStyle(document.querySelector(".mw-reading-text")).fontSize'), '27px');
  rows.push({ id: 'G817-02', automaticAdvanceHandler: true, font: '27px' });
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  await run('await initialSettingsReady;await MediaWorkflowsUI.openProject("design817-book");await MediaWorkflowsUI.assistant.execute("book_chapter",{chapter:1,operation:"listen"},()=>false);');
  assert.equal(await run('return getComputedStyle(document.querySelector(".mw-reading-text")).fontSize'), '27px');
  rows.push({ id: 'G817-02', rendererReload: true, font: '27px' });
  fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify({ ok: true, electron: process.versions.electron, rows, scope: 'Native app CSS/layout; book IPC synthetic, not real narration/GPU.' }, null, 2));
  console.log(JSON.stringify({ ok: true, out, captures: rows.filter(row => row.name).length })); app.exit(0);
}).catch(error => { fs.writeFileSync(path.join(out, 'error.txt'), error.stack); console.error(error.stack); app.exit(1); });
setTimeout(() => app.exit(2), 90000).unref();
