'use strict';
// Real Electron/main/preload, synthetic local media and an isolated profile.
const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { findMediaTool } = require('./media-runtime');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'media-home-smoke', `${Date.now()}-${process.pid}`);
fs.mkdirSync(out, { recursive: true });
const video = path.join(out, 'Türkçe film.mp4');
const music = path.join(out, 'Örnek müzik.m4a');
const subtitle = path.join(out, 'Türkçe çeviri.tr.srt');
fs.writeFileSync(subtitle,'\ufeff1\n00:00:00,500 --> 00:00:03,000\nBu gerçek ses üretmeyen sentetik bir altyazıdır.\n','utf8');
const ffmpeg = findMediaTool('ffmpeg');
assert(ffmpeg, 'ffmpeg is required for the local playback regression');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x1c3344:s=320x180:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
assert.equal(made.status, 0, made.stderr);
const madeAudio = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-metadata', 'title=Akşam Şarkısı', '-metadata', 'artist=İstanbul', '-metadata', 'album=Deneme', music], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
assert.equal(madeAudio.status, 0, madeAudio.stderr);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
let torrentFixture;
if(process.env.WHISPER_TORRENT_TEST==='1'){
  function encode(v){if(Buffer.isBuffer(v))return Buffer.concat([Buffer.from(v.length+':'),v]);if(typeof v==='string')return encode(Buffer.from(v));if(typeof v==='number')return Buffer.from('i'+v+'e');return Buffer.concat([Buffer.from('d'),...Object.keys(v).sort().flatMap(k=>[encode(k),encode(v[k])]),Buffer.from('e')]);}
  const bytes=fs.readFileSync(video),info={length:bytes.length,name:'fixture.mp4','piece length':262144,pieces:crypto.createHash('sha1').update(bytes).digest()},hash=crypto.createHash('sha1').update(encode(info)).digest('hex');
  const metadata=path.join(out,'fixture.torrent'),folder=path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'torrent-media',hash);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'fixture.mp4'),bytes);fs.writeFileSync(metadata,encode({info}));torrentFixture={hash,metadata};
}
app.setAppPath(root);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const consoleErrors = [];
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) { if (await fn()) return; await wait(100); }
  throw new Error(`Timed out: ${label}`);
}
app.whenReady().then(async () => {
  let win;
  await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()); return win; }, 'main window');
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', (_event, ...args) => { if (args[0] === 3) consoleErrors.push(String(args[1])); });
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await until(() => run('return !!window.MediaCatalogUI && document.body.classList.contains("media-home-active")'), 'home ready');
  await run('await initialSettingsReady;return true');
  win.setContentSize(1440, 1000);
  await run('window.UiLocale.set("tr",false);applyUiTheme("dark");return true');
  await wait(250);
  fs.writeFileSync(path.join(out, 'home-empty-tr.png'), (await win.webContents.capturePage()).toPNG());
  assert(await run('return document.querySelector(".mh-hero h1").textContent.includes("kütüphaneni")'));
  assert.equal(await run('window.homeStartClicks=0;document.getElementById("startBtn").addEventListener("click",e=>{homeStartClicks++;e.stopImmediatePropagation();e.preventDefault();},true);document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,bubbles:true}));return homeStartClicks'), 0);
  await run('document.querySelector("#mediaHome .mh-actions button:nth-child(2)").click();return true');
  await until(()=>run('return !!document.getElementById("mediaHubDialog")?.open'),'Open media opens modal hub');
  assert(await run('return document.body.classList.contains("media-home-active")'));
  await run('document.getElementById("mediaHubDialog").close();MediaHomeUI.openStudio();return true');
  assert(await run('return !document.body.classList.contains("media-home-active") && getComputedStyle(document.querySelector(".app-main")).display!=="none"'));
  assert.equal(await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,bubbles:true}));return homeStartClicks'), 1);
  await run('document.getElementById("youtubeUrl").value="https://example.com/preserve";document.getElementById("mediaHomeBack").click();return true');
  assert(await run('return document.getElementById("youtubeUrl").value==="https://example.com/preserve"'));
  // Catalog data uses the existing main-process contract; no private user library.
  const film = await run('return window.api.mediaCatalog({action:"save",item:{title:"Kuzeyin Hikâyesi",year:"2026",kind:"film",synopsis:"Sentetik kütüphane kaydı. Altyazı ve dublaj araçları mevcut oynatıcıda korunur.",watchStatus:"planned",favorite:true}})');
  assert.equal(film.ok, true, film.error);
  const series = await run('return window.api.mediaCatalog({action:"save",item:{title:"Gece Arşivi",kind:"series",year:"2025",episodes:[]}})');
  assert.equal(series.ok, true);
  const poster = path.join(out, 'synthetic-poster.png');
  // A solid synthetic image, not a copyrighted film poster or personal artwork.
  const rgba = Buffer.alloc(300 * 450 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 55; rgba[i + 1] = 88; rgba[i + 2] = 110; rgba[i + 3] = 255; }
  fs.writeFileSync(poster, nativeImage.createFromBitmap(rgba, { width: 300, height: 450 }).toPNG());
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [poster] });
  try { assert.equal((await run(`return window.api.mediaCatalog({action:'poster-file',id:${JSON.stringify(film.item.id)}})`)).ok, true); }
  finally { dialog.showOpenDialog = originalPicker; }
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
  try { assert.equal((await run(`return window.api.mediaCatalog({action:'source-file',id:${JSON.stringify(film.item.id)}})`)).ok, true); }
  finally { dialog.showOpenDialog = originalPicker; }
  const local = await run(`const r=await window.api.mediaCatalog({action:'play',id:${JSON.stringify(film.item.id)}});if(!r.ok)throw Error(r.error);return r.watchItem`);
  assert.equal((await run(`return window.api.updateWatchItem({...${JSON.stringify(local)},title:'Kuzeyin Hikâyesi',position:2,duration:8,lastWatched:Date.now()})`)).ok, true);
  await run(`await window.MediaCatalogUI.open({id:${JSON.stringify(film.item.id)}});return true`);
  assert(await run('return document.getElementById("mediaCatalogDialog").open && document.querySelector(".mc-detail h3").textContent==="Kuzeyin Hikâyesi"'));
  assert(await run('return globalAssistantContext().type==="library-title" && globalAssistantContext().title==="Kuzeyin Hikâyesi" && !!document.querySelector(".mx-assets")'), 'Selected title is explicit assistant context and has language preparation status');
  await run('document.querySelector(".mx-assets").scrollIntoView({block:"center"});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true'); await wait(250);
  fs.writeFileSync(path.join(out,'title-language-workflow-tr.png'),(await win.webContents.capturePage()).toPNG());
  await run('window.MediaExperience.openTasks();return true');
  assert(await run('return document.getElementById("globalTaskCenter").open && document.getElementById("globalTaskList").textContent.length>0'), 'Global task center is reachable over catalog');
  await run('document.getElementById("globalTaskCenter").close();return true');
  await run('document.getElementById("mediaCatalogDialog").close();return true');
  await until(() => run('return [...document.querySelectorAll(".mh-card-title")].some(n=>n.textContent==="Kuzeyin Hikâyesi")'), 'catalog refresh');
  await run('[...document.querySelectorAll(".mh-card")].find(n=>n.title==="Kuzeyin Hikâyesi")?.scrollIntoView({block:"center"});return true');
  await until(() => run('return !!document.querySelector(".mh-card img")'), 'poster');
  await until(() => run('return document.querySelector(".mh-hero h1").textContent==="Kuzeyin Hikâyesi"'), 'featured media');
  await run('document.querySelector(".mh-hero .mh-primary").click();return true');
  await until(() => run('const v=document.getElementById("playerVideo");return !document.getElementById("playerLayer").classList.contains("hidden") && v.readyState>=2 && v.currentSrc.includes("mp4")'), 'real local playback');
  await until(() => run('return document.getElementById("playerVideo").currentTime>=1.5'), 'resume position');
  if(process.env.WHISPER_NATIVE_TEST==='1'){
    const started=await run('return window.NativePlayerUI.start()');
    assert(started,await run('return document.getElementById("playerOsd")?.textContent || "Native startup failed"'));
    await until(()=>run('return window.NativePlayerUI.state().duration>0'),'native mpv duration');
    await run('await window.MediaListening.configure({film:"night",music:"off",voice:"dialogue"});await window.MediaListening.configure({film:"off",music:"off",voice:"dialogue"});return true');
    assert.equal((await run('return window.NativePlayerUI.command("profile","arbitrary-filter")')).ok,false,'Only fixed listening filters are accepted');
    assert(await run('return window.NativePlayerUI.active() && document.getElementById("playerVideo").duration>0'),'Native facade reports real playback state');
    await run('document.getElementById("playerVideo").pause();document.getElementById("playerVideo").currentTime=3;return true');
    await until(()=>run('return Math.abs(window.NativePlayerUI.state().time-3)<.4'),'native seek');
    const frame=await run('return window.api.nativePlayer({action:"snapshot",key:player.mediaKey,generation:player.generation})');
    assert(frame.ok && frame.image.startsWith('data:image/png;base64,'),'Native decoded frame can be captured for overlay composition');
    fs.writeFileSync(path.join(out,'native-decoded-frame.png'),Buffer.from(frame.image.split(',')[1],'base64'));
    const host=BrowserWindow.getAllWindows().find(w=>w.getParentWindow()===win);assert(host,'Native host belongs to the main window');const oldWindow=win.getBounds(),oldHost=host.getBounds();win.setPosition(oldWindow.x+20,oldWindow.y+10);await wait(250);assert(Math.abs(host.getBounds().x-oldHost.x-20)<=2,'Native video follows its owner window');win.setBounds(oldWindow);
    win.webContents.send('assistant:visibility',{expanded:true});
    await until(()=>run('return [...document.getElementById("playerVideo").parentElement.querySelectorAll("img")].some(img=>img.src.startsWith("data:image/png"))'),'Native frame behind assistant');
    win.webContents.send('assistant:visibility',{expanded:false});
    await run('await window.NativePlayerUI.stop();return true');
    assert.equal(await run('return window.NativePlayerUI.active()'),false,'Return to original Chromium controls');
  }
  await run('document.getElementById("playerVideo").pause();syncPlayerSpeedControl(1.25);document.getElementById("playerVideo").playbackRate=1.25;return true');
  dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[subtitle] });
  try { assert.equal(await run('return window.api.selectFile("subtitle")'),subtitle); } finally { dialog.showOpenDialog=originalPicker; }
  await run(`addSubtitleOption(${JSON.stringify(subtitle)},'',{role:"translation"});document.getElementById("playerSubSelect").value=${JSON.stringify(subtitle)};await loadSubtitle(${JSON.stringify(subtitle)},false,{role:"translation"});window.testProtectedWhisperOptions=JSON.stringify(buildOptsFromUI());await window.MediaExperience.openVoice();return true`);
  const voiceReview = await run('return {open:document.getElementById("dubGeneratorDialog").open,name:document.getElementById("dubSrtName").textContent,role:player.subRole,running:state.running,optionsEqual:window.testProtectedWhisperOptions===JSON.stringify(buildOptsFromUI())}');
  assert(voiceReview.open && voiceReview.name.includes('Türkçe çeviri') && !voiceReview.running && voiceReview.optionsEqual,JSON.stringify(voiceReview));
  await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true'); await wait(250);
  fs.writeFileSync(path.join(out,'voice-preparation-tr.png'),(await win.webContents.capturePage()).toPNG());
  await run('document.getElementById("dubGeneratorDialog").close();return true');
  dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[music] });
  let picked;
  try { picked = await run('return window.api.choosePlaybackAudio()'); } finally { dialog.showOpenDialog=originalPicker; }
  assert(picked.ok && picked.output.playbackAsset.kind==='local', JSON.stringify(picked));
  assert(await run(`return window.BrowserDubAudioUI.attachGenerated(${JSON.stringify(picked.output)},window.BrowserDubAudioUI.context())`));
  await run('document.getElementById("browserDubOffset").value="0.2";document.getElementById("browserDubOffset").dispatchEvent(new Event("input"));await flushWatchState(false,false);return true');
  const savedVoice = await run('return captureWatchPrefs()');
  assert.equal(savedVoice.dubPlayback.id, picked.output.playbackAsset.id); assert.equal(savedVoice.muted,false); assert.equal(savedVoice.speed,1.25); assert.equal(savedVoice.dubPlayback.offset,.2);
  const parkedVideo=await run('document.getElementById("playerVideo").pause();return {key:player.mediaKey,generation:player.generation,title:document.getElementById("playerTitle").textContent,cues:JSON.stringify(player.cues),src:document.getElementById("playerVideo").currentSrc,time:document.getElementById("playerVideo").currentTime}');
  await run('document.getElementById("playerBack").click();return true');
  await until(()=>run('return !document.getElementById("mediaHome").inert && !!document.getElementById("mhResumeWorkspace")'),'parked player session');
  await wait(400);assert(await run('return document.getElementById("playerVideo").paused && document.getElementById("browserDubAudio").paused'),'Parked video and voice are silent');
  fs.writeFileSync(path.join(out,'parked-session-tr.png'),(await win.webContents.capturePage()).toPNG());
  await run('document.getElementById("mhResumeWorkspace").click();return true');
  await until(()=>run('return !!window.BrowserDubAudioUI.snapshot() && !document.getElementById("playerLayer").classList.contains("hidden")'),'resume parked voice');
  const resumed=await run('return {key:player.mediaKey,generation:player.generation,title:document.getElementById("playerTitle").textContent,cues:JSON.stringify(player.cues),src:document.getElementById("playerVideo").currentSrc,time:document.getElementById("playerVideo").currentTime}');assert.deepEqual(resumed,parkedVideo,'Return keeps actual media, title, generation, subtitles and position');assert.equal(await run('return window.BrowserDubAudioUI.snapshot().id'),picked.output.playbackAsset.id);assert.equal(await run('return window.BrowserDubAudioUI.snapshot().offset'),.2);
  if(process.env.WHISPER_NATIVE_TEST==='1'){
    assert(await run('return window.NativePlayerUI.start()'),'Native engine can take over a dubbed video');
    assert.equal(await run('return captureWatchPrefs().dubPlayback.id'),picked.output.playbackAsset.id,'Dub attachment survives native takeover');
    await run('await window.NativePlayerUI.stop();return true');
  }
  await run('await window.BrowserDubAudioUI.stop();return true');
  assert(await run('await restoreWatchProfile(player.mediaKey);return !document.getElementById("browserDubStrip").classList.contains("hidden")'), 'Watch profile restores the saved voice through the existing playback flow');
  assert.equal(await run('return window.BrowserDubAudioUI.snapshot().offset'), .2);
  await run('await window.BrowserDubAudioUI.stop();return true');
  const absent = music + '.temporarily-missing'; fs.renameSync(music,absent);
  try {
    assert.equal(await run(`return window.BrowserDubAudioUI.restore(${JSON.stringify(savedVoice.dubPlayback)},player.mediaKey)`),false,'Missing saved voice does not select another asset');
    assert.equal(await run('return document.getElementById("playerVideo").muted'),false,'Missing attachment preserves original audio');
  } finally { fs.renameSync(absent,music); }
  assert.equal((await run('return window.api.restorePlaybackAudio("../../arbitrary")')).ok,false, 'Arbitrary path cannot become a restored voice');
  await run('document.getElementById("browserDubRemove").click();await new Promise(r=>setTimeout(r,50));await flushWatchState(false,false);return true');
  assert.equal(await run('return captureWatchPrefs().dubPlayback'),null,'Removing the dub clears remembered attachment');
  await run('document.getElementById("playerBack").click();return true');
  await until(() => run('return !document.getElementById("mediaHome").inert'), 'local player return');
  const results = [];
  win.showInactive();
  for (const [width, height, language, theme] of [[1920,1080,'tr','dark'],[1440,1000,'tr','dark'],[940,780,'en','light'],[680,900,'tr','dark']]) {
    win.setMinimumSize(400, 500); win.setContentSize(width, height);
    await run(`window.UiLocale.set(${JSON.stringify(language)},false);applyUiTheme(${JSON.stringify(theme)});return true`);
    await run('window.scrollTo(0,0);return true');
    win.webContents.invalidate();
    await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');
    await wait(400);
    const measure = await run('return {width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector(".mh-hero h1").textContent,home:document.body.classList.contains("media-home-active"),inert:document.getElementById("mediaHome").inert,layer:getComputedStyle(document.getElementById("playerLayer")).display}');
    assert(measure.scroll <= measure.width + 1, JSON.stringify(measure));
    assert.equal(measure.inert, false);
    assert.equal(measure.layer, 'none');
    results.push({ ...measure, language, theme });
    fs.writeFileSync(path.join(out, `home-${width}-${language}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await run('document.querySelector("[data-home-page=films]").click();document.getElementById("mhSearch").value="kuzeyin";document.getElementById("mhSearch").dispatchEvent(new Event("input"));return true');
  assert.equal(await run('return document.querySelectorAll(".mh-card").length'), 1);
  await run('document.querySelector(".mh-card").click();return true');
  await until(() => run('return document.getElementById("mediaTitleDialog")?.open && document.getElementById("mediaTitleDialog").textContent.includes("Kuzeyin Hikâyesi")'), 'card details');
  await run('document.getElementById("mediaTitleDialog").close();return true');
  await run('document.querySelector("#mediaHome .mh-actions button").click();return true');
  await until(() => run('return !document.getElementById("playerLayer").classList.contains("hidden")'), 'existing browser');
  assert(await run('return document.getElementById("mediaHome").inert'));
  await run('document.getElementById("playerBack").click();return true');
  await until(() => run('return !document.getElementById("mediaHome").inert'), 'return home');
  await run('document.querySelector("#mediaHome .mh-more").open=true;[...document.querySelectorAll("#mediaHome .mh-more button")].find(b=>/Subtitle.*voice|Altyazı.*ses/.test(b.textContent)).click();return true');
  await until(() => run('return document.getElementById("dubGeneratorDialog").open'), 'existing dub dialog');
  await run('document.getElementById("dubGeneratorDialog").close();return true');
  // Add real tagged audio through the new main boundary, then use the rendered music page.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [music] });
  try { const added = await run('return window.api.mediaShelf({action:"music-import"})'); assert.equal(added.ok, true, added.error); assert.equal(added.added, 1); }
  finally { dialog.showOpenDialog = originalPicker; }
  await run('document.getElementById("mhSearch").value="";document.getElementById("mhSearch").dispatchEvent(new Event("input"));document.querySelector("[data-home-mode=music]").click();return true');
  await until(() => run('return document.querySelector(".ms-track strong")?.textContent==="Akşam Şarkısı"'), 'tagged music');
  assert(await run('return document.querySelector(".ms-track small").textContent.includes("İstanbul")'));
  await run('document.querySelector(".ms-track button").click();return true');
  await until(() => run('return document.getElementById("mediaShelfAudio").readyState>=2'), 'audio playback');
  await run('document.querySelector(".ms-track input").click();const b=[...document.querySelectorAll(".ms-shelf button")].find(b=>b.textContent.includes("çalma listesi oluştur"));b.click();return true');
  await until(() => run('return !!document.querySelector(".ms-dialog[open] input")'), 'playlist form');
  await run('document.querySelector(".ms-dialog input").value="Gece listesi";document.querySelector(".ms-dialog form").requestSubmit();return true');
  await until(() => run('return [...document.querySelectorAll(".ms-shelf button")].some(b=>b.textContent.includes("Gece listesi"))'), 'saved playlist');
  win.setContentSize(1440, 1000); await wait(250); fs.writeFileSync(path.join(out, 'music-tr.png'), (await win.webContents.capturePage()).toPNG());
  const book = path.join(out, 'Kitap.txt'); fs.writeFileSync(book, 'Birinci paragraf.\n\nİkinci paragraf.\n\n<script>Bu düz metindir.</script>');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [book] });
  try { const added = await run('return window.api.mediaShelf({action:"book-import"})'); assert.equal(added.ok, true, added.error); }
  finally { dialog.showOpenDialog = originalPicker; }
  await run('document.querySelector("[data-home-mode=books]").click();return true');
  await until(() => run('return !!document.querySelector(".ms-book-grid .mh-card")'), 'book shelf');
  await run('document.querySelector(".ms-book-grid .mh-card").click();return true');
  await until(() => run('return !!document.querySelector(".ms-reader[open] .ms-prose")'), 'book reader');
  assert(await run('return document.querySelector(".ms-prose").textContent.includes("<script>") && !document.querySelector(".ms-prose script")'));
  await run('[...document.querySelectorAll(".ms-reader header button")].find(b=>b.textContent.includes("Yer imi")).click();return true');
  await until(() => run('return document.querySelector(".ms-reader .ms-status").textContent==="Kaydedildi."'), 'saved bookmark');
  fs.writeFileSync(path.join(out, 'reader-tr.png'), (await win.webContents.capturePage()).toPNG());
  assert(await run('return globalAssistantContext().type==="book-chapter" && globalAssistantContext().excerpt.length<=8000'), 'Book assistant receives only selected chapter excerpt');
  await run('document.querySelector(".ms-reader-close").click();return true');
  await until(() => run('return !document.querySelector(".ms-reader")'), 'close reader');
  assert.equal((await run('return window.api.mediaShelf({action:"list"})')).books[0].bookmarks.length, 1);
  const ratings = path.join(out, 'ratings.csv'); fs.writeFileSync(ratings, 'Name,Year,Rating,Review\nKuzeyin Hikâyesi,2026,4.5,Hikaye çok güçlü ve oyunculuk etkileyici.\nYeni Film,2024,4,Müzik ve görsel anlatım harika.\n');
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ratings] });
  try {
    await run('document.querySelector("[data-home-page=taste]").click();return true');
    await until(() => run('return document.querySelector(".ms-shelf button")?.textContent.includes("CSV")'), 'Letterboxd page');
    await run('document.querySelector(".ms-shelf button").click();return true');
    await until(() => run('return !!document.querySelector(".ms-dialog[open]")'), 'import preview');
    assert.equal((await run('return window.api.mediaCatalog({action:"list"})')).items.length, 2, 'Preview does not add films');
    await run('document.querySelector(".ms-dialog form").requestSubmit();return true');
    await until(async () => (await run('return window.api.mediaCatalog({action:"list"})')).items.length === 3, 'confirmed CSV import');
  } finally { dialog.showOpenDialog = originalPicker; }
  await until(()=>run('return !!document.querySelector(".mt-profile") && document.querySelectorAll(".mt-review").length===2'),'review taste profile');
  const taste=await run('return (await window.api.mediaShelf({action:"list"})).taste');
  assert.equal(taste.reviewCount,2);assert.equal(taste.rated,2);
  const analysis={version:1,summary:'Fixture evidence-based review analysis.',insights:[{aspect:'story',direction:'likes',reason:'The review explicitly praises the story.',evidence:[{id:taste.reviews.find(r=>r.title==='Kuzeyin Hikâyesi').id,quote:'Hikaye çok güçlü'}]}]};
  assert((await run(`return window.api.mediaShelf({action:"taste-analysis",analysis:${JSON.stringify(analysis)}})`)).ok,'Verified review quote accepted');
  const forged={...analysis,insights:[{...analysis.insights[0],evidence:[{id:analysis.insights[0].evidence[0].id,quote:'This is not in the review'}]}]};
  assert.equal((await run(`return window.api.mediaShelf({action:"taste-analysis",analysis:${JSON.stringify(forged)}})`)).ok,false,'Invented review quote rejected');
  assert(await run('return globalAssistantContext().type==="taste-profile"'),'Assistant recognizes profile context');
  await run('document.getElementById("mediaHome").scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');await wait(250);
  fs.writeFileSync(path.join(out,'taste-profile-tr.png'),(await win.webContents.capturePage()).toPNG());
  for(const [width,locale,theme]of [[940,'en','light'],[680,'tr','dark']]){
    win.setContentSize(width,900);await run(`window.UiLocale.set(${JSON.stringify(locale)},false);applyUiTheme(${JSON.stringify(theme)});return true`);await until(()=>run('return !!document.querySelector(".mt-profile")'),'responsive profile');await wait(200);
    assert(await run('return document.getElementById("mediaHome").scrollWidth<=innerWidth+2'),'Profile has no horizontal overflow');fs.writeFileSync(path.join(out,`taste-profile-${width}-${locale}.png`),(await win.webContents.capturePage()).toPNG());
  }
  win.setContentSize(1440,1000);await run('window.UiLocale.set("tr",false);applyUiTheme("dark");return true');await wait(250);
  await run('window.MediaHubUI.open();return true');
  assert(await run('return document.getElementById("mediaHubDialog").open && document.querySelectorAll(".mhx-tile").length===3'),'Unified media opening choices');
  await wait(250);fs.writeFileSync(path.join(out,'media-open-tr.png'),(await win.webContents.capturePage()).toPNG());
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[out]});let folder;
  try{folder=await run('return window.api.mediaHub({action:"folder-add"})');}finally{dialog.showOpenDialog=originalPicker;}
  assert(folder.ok && folder.folder.files.some(row=>row.name==='Türkçe film.mp4'),JSON.stringify({ok:folder.ok,error:folder.error}));
  const folderFile=folder.folder.files.find(row=>row.name==='Türkçe film.mp4');
  assert((await run(`return window.api.mediaHub({action:"folder-play",folderId:${JSON.stringify(folder.folder.id)},id:${JSON.stringify(folderFile.id)}})`)).ok,'Only a known selected folder file can be played');
  assert.equal((await run(`return window.api.mediaHub({action:"folder-play",folderId:${JSON.stringify(folder.folder.id)},id:"../../secret"})`)).ok,false,'Unknown folder path is rejected');
  const oldFile=path.join(out,'Moved fixture.mp4'),newFolder=path.join(out,'Relocated');fs.copyFileSync(video,oldFile);fs.mkdirSync(newFolder);const newFile=path.join(newFolder,path.basename(oldFile));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[oldFile]});try{assert((await run(`return window.api.mediaCatalog({action:'source-file',id:${JSON.stringify(film.item.id)}})`)).ok);}finally{dialog.showOpenDialog=originalPicker;}
  const moving=await run(`return (await window.api.mediaCatalog({action:'play',id:${JSON.stringify(film.item.id)}})).watchItem`);
  assert((await run(`return window.api.updateWatchItem({...${JSON.stringify(moving)},position:3,duration:8,prefs:${JSON.stringify(savedVoice)}})`)).ok);
  fs.renameSync(oldFile,newFile);
  const relink=await run(`return window.api.mediaHub({action:'relink-preview',folderId:${JSON.stringify(folder.folder.id)}})`);assert(relink.ok&&relink.patches.some(r=>r.old===oldFile),'Moved source has a reviewable exact match');
  const applied=await run(`return window.api.mediaHub({action:'relink-apply',token:${JSON.stringify(relink.token)}})`);assert(applied.ok,JSON.stringify(applied));
  const after=await run(`return (await window.api.mediaCatalog({action:'play',id:${JSON.stringify(film.item.id)}})).watchItem`);assert.equal(after.localPath,fs.realpathSync(newFile));assert.equal(after.position,3);assert.equal(after.prefs.dubPlayback.id,picked.output.playbackAsset.id,'Relinking preserves saved voice attachment');
  const scenes=await run(`return window.api.mediaHub({action:'scenes',path:${JSON.stringify(video)},duration:8})`);assert(scenes.ok&&scenes.rows.length===12,JSON.stringify({ok:scenes.ok,error:scenes.error}));assert(scenes.rows.every(r=>r.image.startsWith('data:image/jpeg;base64,')&&r.at>=0&&r.at<8),'Real ffmpeg timeline thumbnails');
  await run(`return window.api.mediaHub({action:"folder-remove",folderId:${JSON.stringify(folder.folder.id)}})`);
  await run('document.getElementById("mediaHubDialog").close();return true');
  if(torrentFixture){
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[torrentFixture.metadata]});let preview;try{preview=await run('return window.api.mediaTorrents({action:"preview",file:true})');}finally{dialog.showOpenDialog=originalPicker;}
    assert(preview.ok,JSON.stringify(preview));const stream=await run(`return window.api.mediaTorrents({action:'play',token:${JSON.stringify(preview.token)},index:0})`);assert(stream.ok,JSON.stringify(stream));
    await run(`await window.MediaHubUI.playStream(${JSON.stringify(stream)},4);return true`);
    await until(()=>run('return document.getElementById("playerVideo").readyState>=2 && document.getElementById("playerVideo").currentSrc.startsWith("whisper-media:")'),'real Electron torrent playback');
    await until(()=>run('return document.getElementById("playerVideo").currentTime>=3.5'),'torrent resume seek');
    assert(await run(`return player.mediaKey===${JSON.stringify(stream.key)} && !!player.localPath && player.localPath.endsWith('fixture.mp4')`),'Verified complete torrent is available to existing Whisper flow');
    await run('document.getElementById("playerVideo").pause();window.MediaHubUI.open("player");return true');await wait(250);fs.writeFileSync(path.join(out,'torrent-playback-tr.png'),(await win.webContents.capturePage()).toPNG());await run('document.getElementById("mediaHubDialog").close();return true');
    if(process.env.WHISPER_NATIVE_TEST==='1'){
      assert(await run('return window.NativePlayerUI.start()'),'Native torrent playback uses authenticated private stream');
      assert(await run('const v=document.getElementById("playerVideo").getBoundingClientRect(),c=document.getElementById("playerControls").getBoundingClientRect();return v.height>100 && v.bottom<=c.top+2'),'Native surface leaves controls visible and clickable');
      if(process.env.WHISPER_NATIVE_VISUAL==='1'){win.setTitle('Whisper isolated native visual check');win.show();console.log('NATIVE_VISUAL_READY');await wait(60000);}
      await run('await window.NativePlayerUI.stop();return true');
    }
  }
  assert.deepEqual(consoleErrors.filter(text => /uncaught|referenceerror|typeerror/i.test(text)), []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2));
  console.log(JSON.stringify({ ok: true, out, results }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
