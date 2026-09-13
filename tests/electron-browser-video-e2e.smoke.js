// Gerçek MP4 + kontrollü EN/TR VTT ile Electron/IPC/video katmanı entegrasyon testi.
// Video: MDN CC0 flower.mp4; WHISPER_E2E_VIDEO ile yerel MP4 yolu verilebilir.
// node_modules/.bin/electron tests/electron-browser-video-e2e.smoke.js
// Yeniden açılış: aynı VIDEO_E2E_PROFILE ile VIDEO_E2E_RESTORE=1 kullanın.
// Çıktılar .uiprev/video-e2e/ altında. Canlı AI sağlayıcısı bu testin kapsamında değil.
const {app,BrowserWindow,webContents,session,dialog}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.uiprev','video-e2e');fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=process.env.VIDEO_E2E_PROFILE||path.join(out,'profile-'+process.pid);
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
require('../src/main.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report=[];
async function until(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(last)return last;await wait(200)}throw Error(label+' zaman aşımı: '+JSON.stringify(last));}
app.whenReady().then(async()=>{
 const media=fs.readFileSync(process.env.WHISPER_E2E_VIDEO || path.join(root,'.uiprev','flower.mp4'));
 const captions={en:['Flowers move in the wind.','Look at the garden.','A quiet moment in nature.'],tr:['Çiçekler rüzgârda hareket ediyor.','Bahçeye bak.','Doğada sakin bir an.']};
 const times=['00:00:00.000 --> 00:00:01.800','00:00:01.800 --> 00:00:03.500','00:00:03.500 --> 00:00:05.100'];
 const vtt=lang=>'WEBVTT\n\n'+captions[lang].map((s,i)=>times[i]+'\n'+s).join('\n\n')+'\n';
 session.fromPartition('persist:whisper-browser').protocol.handle('https',req=>{
  const url=new URL(req.url);
  if(url.hostname!=='video-e2e.test')return new Response('Sadece test sayfası',{status:404});
  if(url.pathname.endsWith('.vtt'))return new Response(vtt(url.pathname.includes('tr')?'tr':'en'),{headers:{'Content-Type':'text/vtt; charset=utf-8'}});
  if(url.pathname==='/flower.mp4'){
   const range=/bytes=(\d+)-(\d*)/.exec(req.headers.get('range')||'');
   if(range){const a=Number(range[1]),b=range[2]?Math.min(Number(range[2]),media.length-1):media.length-1;return new Response(media.subarray(a,b+1),{status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${a}-${b}/${media.length}`,'Content-Length':String(b-a+1)}})}
   return new Response(media,{headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes'}});
  }
  const tracks=url.pathname==='/other'?'':`<track kind="subtitles" src="/en.vtt" srclang="en" label="English" default><track kind="subtitles" src="/tr.vtt" srclang="tr" label="Türkçe">`;
  return new Response(`<!doctype html><meta charset="utf-8"><title>Gerçek video · altyazı testi</title><style>body{margin:0;background:#14181c;color:#eee;font:18px sans-serif;padding:24px}video{width:95%;max-height:70vh}h1{font-size:20px}</style><h1>Gerçek video · çift dil ve senkron kontrolü</h1><video controls muted preload="auto" src="/flower.mp4">${tracks}</video><script>for(const t of document.querySelector('video').textTracks)t.mode='hidden';</script>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 });
 const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading()),'Pencere');
 const run=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
 const snapshot=async name=>{win.show();win.focus();const [w,h]=win.getContentSize();win.setContentSize(w+1,h);await wait(100);win.setContentSize(w,h);await wait(400);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 await wait(1200);win.setContentSize(1440,960);
 await run(`globalThis.modeTrace=[];const setModeOriginal=setSubtitleMode;setSubtitleMode=function(mode,announce){modeTrace.push({mode,restore:browserTabState()?.restoreSubtitleMode,selection:browserTabState()?.subtitleSelectionRestored,cues:player.cues.length,cues2:player.cues2.length});return setModeOriginal(mode,announce)};openPlayer();setWorkspaceMode('browser',false);setBrowserCaptureEnabled(true,false)`);
 await until(()=>run(`return player.browserActiveTabId`),'Tarayıcı sekmesi').catch(async error=>{fs.writeFileSync(path.join(out,'startup-diagnostic.json'),JSON.stringify(await run(`return {mode:player.workspaceMode,signal:document.getElementById('browserSignalText')?.textContent,pending:state.pendingPlayerLoad?.label,tabs:await window.api.showBrowser('',browserSlotBounds())}`),null,2));throw error});
 if(process.env.VIDEO_E2E_MISSING==='1'){
  await until(()=>run(`return state.pendingPlayerLoad?.label==='Altyazı dosyası eksik'`),'Eksik dosya bildirimi');
  const moved=path.join(out,'manual-moved.srt');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[moved]});
  await run(`await state.pendingPlayerLoad.run()`);
  const result=await run(`return {path:player.subPath,offset:browserTransformForChannel(false).offsetSeconds,pending:!!state.pendingPlayerLoad,secondary:player.sub2Path,secondaryCues:player.cues2.length,mode:currentSubtitleMode()}`);
  assert.equal(result.path,moved);assert.equal(result.offset,.5);assert.equal(result.pending,false);
  if(process.env.VIDEO_E2E_PAIR==='1'){assert.equal(result.secondary,path.join(out,'manual-second.vtt'));assert.equal(result.secondaryCues,3);assert.equal(result.mode,'both');}
  fs.writeFileSync(path.join(out,'manual-missing-report.json'),JSON.stringify(result,null,2));app.quit();return;
 }
 if(process.env.VIDEO_E2E_RESTORE==='1' && process.env.VIDEO_E2E_MANUAL==='1'){
  const result=await until(()=>run(`return player.subPath.endsWith('manual.srt')&&player.cues.length===2&&browserTabState()?.subtitleSelectionRestored?{offset:browserTransformForChannel(false).offsetSeconds,mode:currentSubtitleMode()}:null`),'Elle yüklenen dosyanın yeniden açılması',30000);
  assert.equal(result.offset,.5);assert.equal(result.mode,'source');
  fs.writeFileSync(path.join(out,'manual-restore-report.json'),JSON.stringify(result,null,2));app.quit();return;
 }
 if(process.env.VIDEO_E2E_RESTORE==='1'){
  const restored=await until(()=>run(`return player.cues.length===3&&player.cues2.length===3&&browserTabState()?.subtitleSelectionRestored?{url:player.browserPageUrl,mode:currentSubtitleMode(),offset:browserTransformForChannel(false).offsetSeconds}:null`),'Yeniden açılışta çift dil',30000);
  fs.writeFileSync(path.join(out,'mode-trace.json'),JSON.stringify(await run(`return modeTrace`),null,2));assert.equal(restored.mode,'both');assert.equal(restored.offset,.2);
  const restoredPage=webContents.getAllWebContents().find(w=>w.getURL()==='https://video-e2e.test/watch');
  await restoredPage.executeJavaScript(`document.querySelector('video').currentTime=.8`);await wait(700);
  fs.writeFileSync(path.join(out,'04-restored-video.png'),(await restoredPage.capturePage()).toPNG());
  report.push({restart:restored});await snapshot('04-restored');fs.writeFileSync(path.join(out,'restore-report.json'),JSON.stringify(report,null,2));app.quit();return;
 }
 const nav=await run(`document.getElementById('browserAddress').value='https://video-e2e.test/watch';return await navigateBrowserFromAddress()`);assert.equal(nav.ok,true,JSON.stringify(nav));
 const page=await until(()=>webContents.getAllWebContents().find(w=>w.getURL()==='https://video-e2e.test/watch'),'Video sayfası');
 const mediaInfo=await until(()=>page.executeJavaScript(`(()=>{const v=document.querySelector('video');return v.readyState>=2?{duration:v.duration,width:v.videoWidth,height:v.videoHeight}:null})()`),'Video çözme');
 assert(mediaInfo.width>0&&mediaInfo.duration>4);report.push({video:mediaInfo});
 const tracks=await until(()=>run(`return player.browserTracks.filter(t=>t.cueCount>=3).length>=2?player.browserTracks.map(t=>({id:t.id,language:t.language,role:t.role,path:t.path})):null`),'İki VTT izi');
 report.push({tracks});
 const en=tracks.find(t=>t.language==='en'),tr=tracks.find(t=>t.language==='tr');assert(en&&tr);
 await run(`document.getElementById('browserTrackSelect').value=${JSON.stringify(en.id)};document.getElementById('browserTrackSelect2').value=${JSON.stringify(tr.id)};await useBrowserTrackPair();setSubtitleMode('both')`);
 await page.executeJavaScript(`document.querySelector('video').currentTime=0.8`);await wait(1200);
 const overlay=await until(()=>page.executeJavaScript(`(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t.includes('Flowers')&&t.includes('Çiçekler')?t:null})()`),'Çift dil katmanı');
 report.push({overlay});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report,null,2));
 await snapshot('01-dual');
 assert(overlay.includes(captions.en[0])&&overlay.includes(captions.tr[0]),'Çift dil katmanında iki dil birlikte görünmedi: '+overlay);
 await page.executeJavaScript(`document.querySelector('video').currentTime=2.5`);await wait(1000);
 const seekText=await until(()=>page.executeJavaScript(`(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t.includes('garden')&&t.includes('Bahçeye')?t:null})()`),'İleri sarma katmanı');
  assert(seekText.includes(captions.en[1])&&seekText.includes(captions.tr[1]),'İleri sarma altyazıları güncellemedi');report.push({seek:'passed'});
 await page.executeJavaScript(`document.querySelector('video').play()`);await wait(400);
 const advanced=await page.executeJavaScript(`document.querySelector('video').currentTime`);assert(advanced>2.6);await page.executeJavaScript(`document.querySelector('video').pause()`);report.push({playback:'passed'});
 await run(`document.getElementById('browserSyncChannel').value='primary';nudgeBrowserSync(0.4)`);
 await page.executeJavaScript(`document.querySelector('video').currentTime=1.9`);await wait(700);
 const shifted=await page.executeJavaScript(`document.getElementById('__whisper_browser_subtitles')?.textContent||''`);
 assert(shifted.includes(captions.en[0])&&shifted.includes(captions.tr[1]),'Dillerin ayrı senkronu çalışmadı: '+shifted);await run(`cancelBrowserSyncPreview()`);report.push({independentSync:'passed'});
 const firstTab=await run(`return player.browserActiveTabId`);await run(`await createBrowserTab()`);
 assert.equal(await run(`return player.cues.length+player.cues2.length`),0,'Yeni sekme eski altyazıları taşıdı');
 await run(`await activateBrowserTab(${JSON.stringify(firstTab)})`);await wait(500);
 assert.equal(await run(`return player.cues.length===3&&player.cues2.length===3`),true,'Sekmeye dönüşte çift dil kayboldu');report.push({tabs:'passed'});
 await run(`document.getElementById('browserAddress').value='https://video-e2e.test/other';await navigateBrowserFromAddress()`);await wait(800);
 assert.equal(await run(`return player.cues.length+player.cues2.length`),0,'Başka sayfada önceki altyazılar kaldı');report.push({navigationReset:'passed'});
 const manual=path.join(out,'manual.srt');fs.writeFileSync(manual,'1\n00:00:00,000 --> 00:00:02,000\nElle yüklenen Türkçe altyazı\n\n2\n00:00:02,000 --> 00:00:05,100\nİkinci elle yüklenen satır\n');
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[manual]});
 await run(`await loadManualBrowserSubtitle();setSubtitleMode('source')`);
 await page.executeJavaScript(`document.querySelector('video').currentTime=0.5`);await wait(900);
 const manualText=await until(()=>page.executeJavaScript(`(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t.includes('Elle yüklenen')?t:null})()`),'Elle yüklenen katman');assert(manualText.includes('Elle yüklenen'));report.push({manualLoad:'passed'});
 await run(`document.getElementById('browserSyncChannel').value='primary';nudgeBrowserSync(0.5)`);
 assert.equal(await run(`return browserTransformForChannel(false).offsetSeconds`),0.5,'Elle yüklenen dosyada senkron çalışmadı');
 report.push({manualSync:'passed'});
 await run(`saveBrowserSync()`);
 for(const format of ['srt','vtt','ass']){
  const output=path.join(out,'manual-synced.'+format);dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
  await run(`document.getElementById('browserExportTiming').value='synchronized';document.getElementById('browserExportFormat').value=${JSON.stringify(format)};await exportSelectedBrowserTrack()`);
  assert(fs.existsSync(output),'Dışa aktarma dosyası oluşmadı: '+format);
  const parsed=require('../src/browser-subtitles').parseSubtitlePayload(fs.readFileSync(output,'utf8'),'',output).cues;
  assert.equal(parsed.length,2);assert.equal(parsed[0].start,.5);assert(parsed[0].text.includes('Elle yüklenen'));report.push({export:format,shift:parsed[0].start});
 }
 await snapshot('02-manual');
 if(process.env.VIDEO_E2E_MANUAL==='1'){
  if(process.env.VIDEO_E2E_PAIR==='1'){
   const second=path.join(out,'manual-second.vtt');fs.writeFileSync(second,vtt('tr'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[second]});
   await run(`const file=await window.api.selectFile('subtitle');addSubtitleOption(file);document.getElementById('playerSubSelect2').value=file;await loadSubtitle(file,true);setSubtitleMode('both')`);
  }
  await run(`saveActiveBrowserTabWorkspace()`);await wait(1200);app.quit();return;}
 const manualVtt=path.join(out,'manual.vtt');fs.writeFileSync(manualVtt,vtt('tr'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[manualVtt]});
 await run(`await loadManualBrowserSubtitle()`);assert.equal(await run(`return player.cues.length`),3);assert.equal(await run(`return browserTransformForChannel(false).offsetSeconds`),0);report.push({manualVtt:'passed'});
 await run(`document.getElementById('browserAddress').value='https://video-e2e.test/watch';await navigateBrowserFromAddress()`);
 await until(()=>run(`return player.browserTracks.filter(t=>t.cueCount>=3).length>=2`),'Geri dönen izler').catch(async e=>{fs.writeFileSync(path.join(out,'return-diagnostic.json'),JSON.stringify({renderer:await run(`return {url:player.browserPageUrl,tracks:player.browserTracks,capture:player.browserCaptureEnabled,signal:document.getElementById('browserSignalText').textContent,tab:browserTabState()}`),page:await page.executeJavaScript(`({html:document.querySelector('video')?.outerHTML,tracks:[...document.querySelector('video').textTracks].map(t=>({language:t.language,mode:t.mode,cues:t.cues?.length}))})`)},null,2));throw e});
 await run(`document.getElementById('browserTrackSelect').value=player.browserTracks.find(t=>t.language==='en').id;document.getElementById('browserTrackSelect2').value=player.browserTracks.find(t=>t.language==='tr').id;await useBrowserTrackPair();document.getElementById('browserSyncChannel').value='primary';nudgeBrowserSync(.2);saveBrowserSync();setSubtitleMode('both');saveActiveBrowserTabWorkspace()`);
 await wait(1200);report.push({profile:process.env.WHISPER_RESOURCE_SOAK_USER_DATA});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.quit();
}).catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack);console.error(e);app.exit(1)});
