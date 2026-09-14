// Gerçek MP4 + kontrollü EN/TR VTT ile Electron/IPC/video katmanı entegrasyon testi.
// Video: MDN CC0 flower.mp4; WHISPER_E2E_VIDEO ile yerel MP4 yolu verilebilir.
// node_modules/.bin/electron tests/electron-browser-video-e2e.smoke.js
// Yeniden açılış: aynı VIDEO_E2E_PROFILE ile VIDEO_E2E_RESTORE=1 kullanın.
// Çıktılar .uiprev/video-e2e/ altında. Canlı AI sağlayıcısı bu testin kapsamında değil.
const {app,BrowserWindow,webContents,session,dialog,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.VIDEO_E2E_OUT || path.join(root,'.uiprev','video-e2e'));fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.resolve(process.env.VIDEO_E2E_PROFILE||path.join(out,'profile-'+process.pid));
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,{recursive:true});
let soakProviderCalls=0;
let releaseIsolationProvider;
if(process.env.VIDEO_E2E_COMBINED_SOAK==='1'||process.env.VIDEO_E2E_ISOLATION==='1'){
 fs.writeFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'settings.json'),JSON.stringify({settingsVersion:3,translate:{apiKey:'controlled-test-value',endpointPreset:'custom',customBaseUrl:'https://soak-provider.test/v1',model:'controlled'},ui:{translateWorkers:1}}));
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://soak-provider.test/'))return realFetch(url,options);
  soakProviderCalls++;
  if(process.env.VIDEO_E2E_ISOLATION==='1')await new Promise(resolve=>{releaseIsolationProvider=resolve;});
  const body=JSON.parse(options.body),payload=JSON.parse(body.messages.at(-1).content);
  const content=payload.parts?JSON.stringify({text:payload.parts.map(()=> 'Kontrollü çeviri.').join(' '),parts:payload.parts.map(()=> 'Kontrollü çeviri.')}):'Kontrollü çeviri.';
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'content-type':'application/json'}});
 };
}
process.on('warning', warning => fs.appendFileSync(process.env.VIDEO_E2E_WARNINGS || path.join(out,'native-warnings.log'), String(warning.stack)+'\n'));
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const handle=ipcMain.handle.bind(ipcMain);
let quickFailPath='';
const aiRequests=[];let aiPageDelay=false,aiPageResolve=null,aiCancelFail=false;
ipcMain.handle=(channel,listener)=>handle(channel,async(...args)=>{
 if(process.env.VIDEO_E2E_AI==='1'){
  if(channel==='browser:page:context')return aiPageDelay?await new Promise(resolve=>{aiPageResolve=resolve;}):{ok:true,blocks:[{id:'S1',text:'Kontrollü sayfa metni'}]};
  if(channel==='transcribe:start'){aiRequests.push(args[1]);return {ok:true,jobId:args[1].jobId};}
  if(channel==='transcribe:cancel'){if(aiCancelFail){aiCancelFail=false;throw Error('Kontrollü iptal bağlantı hatası');}return {ok:true};}
 }
 if(channel==='settings:load'&&process.env.VIDEO_E2E_SETTINGS_DELAY)await new Promise(resolve=>setTimeout(resolve,Number(process.env.VIDEO_E2E_SETTINGS_DELAY)));
 if(channel==='media:writeSubtitle'&&quickFailPath&&args[1]?.path===quickFailPath){quickFailPath='';return {ok:false,error:'Kontrollü yazma hatası'};}
 const result=await listener(...args);
 if(process.env.VIDEO_E2E_FEATURES==='1'&&channel==='browser:setOverlay')fs.appendFileSync(path.join(out,'overlay-ipc.jsonl'),JSON.stringify({result,style:args[1]?.payload?.style})+'\n');
 return result;
});
require('../src/main.js');
assert.equal(app.getPath('userData'),process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'Test profili uygulanmalı');
ipcMain.handle=handle;
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
 if(process.env.VIDEO_E2E_FEATURES==='1')win.webContents.on('console-message',(_event,details)=>{
  fs.appendFileSync(path.join(out,'renderer-console.log'),String(details.message||details)+'\n');
 });
 const snapshot=async name=>{win.show();win.focus();const [w,h]=win.getContentSize();win.setContentSize(w+1,h);await wait(100);win.setContentSize(w,h);await wait(400);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 let initializationTimer;
 try { await Promise.race([run('await initialSettingsReady'),new Promise((_,reject)=>{initializationTimer=setTimeout(()=>reject(Error('Başlangıç ayarları hazır olmadı')),30000)})]); }
 finally { clearTimeout(initializationTimer); }
 win.setContentSize(1440,960);
 await run(`globalThis.modeTrace=[];const setModeOriginal=setSubtitleMode;setSubtitleMode=function(mode,announce){modeTrace.push({mode,restore:browserTabState()?.restoreSubtitleMode,selection:browserTabState()?.subtitleSelectionRestored,cues:player.cues.length,cues2:player.cues2.length});return setModeOriginal(mode,announce)};openPlayer();setWorkspaceMode('browser',false);setBrowserCaptureEnabled(true,false)`);
 await until(()=>run(`return player.browserActiveTabId`),'Tarayıcı sekmesi').catch(async error=>{fs.writeFileSync(path.join(out,'startup-diagnostic.json'),JSON.stringify(await run(`return {mode:player.workspaceMode,signal:document.getElementById('browserSignalText')?.textContent,pending:state.pendingPlayerLoad?.label,tabs:await window.api.showBrowser('',browserSlotBounds())}`),null,2));throw error});
 if(process.env.VIDEO_E2E_DURABLE==='read'){
  await until(()=>run(`return player.cues.length===3&&player.cues2.length===3&&browserTabState()?.subtitleSelectionRestored`),'Kalıcı izleri geri açma',30000);
  const restored=await run(`return {source:player.cues[0].text,translation:player.cues2[0].text,mode:currentSubtitleMode(),sourceOffset:browserTransformForChannel(false).offsetSeconds,translationOffset:browserTransformForChannel(true).offsetSeconds,time:player.browserTime}`);
  assert.equal(restored.source,'Kalıcı kaynak düzeltmesi');assert.equal(restored.translation,'Kalıcı ikinci dil düzeltmesi');
  assert.equal(restored.mode,'both');assert.equal(restored.sourceOffset,.2);assert.equal(restored.translationOffset,.4);
  await until(()=>run(`return Math.abs(player.browserTime-2.5)<.4`),'Video konumunun geri gelmesi');
  restored.time=await run(`return player.browserTime`);
  fs.writeFileSync(path.join(out,'durable-read.json'),JSON.stringify(restored,null,2));await snapshot('durable-restored');app.quit();return;
 }
 if(process.env.VIDEO_E2E_RECOVERY_REOPEN==='1'){
  await until(()=>run(`return browserTabState().subtitleSelectionRestored&&player.cues.length===2&&player.cues2.length===3`),'Kurtarılan dosyaları yeniden açma');
  assert.equal(await run(`return browserTransformForChannel(false).offsetSeconds`),.5);
  await run(`document.getElementById('browserVideoSubtitles').open=true;await inspectBrowserVideoSubtitles()`);
  assert.equal(await run(`return browserTabState().missingSubtitleFiles.length`),0);
  await snapshot('four-manager');fs.writeFileSync(path.join(out,'four-reopen-report.json'),JSON.stringify({restoredPair:true,offset:.5}));app.quit();return;
 }
 if(process.env.VIDEO_E2E_PAIR_RECOVERY==='1'){
  await until(()=>run(`return state.pendingPlayerLoad?.label==='Altyazı dosyası eksik'`),'İki eksik dosya');
  await run(`document.getElementById('browserVideoSubtitles').open=true;await inspectBrowserVideoSubtitles();toggleSettingsPage('browser-subtitles')`);
  assert.equal(await run(`return browserTabState().missingSubtitleFiles.length`),2);
  assert.match(await run(`return document.getElementById('browserPreferenceNotice').textContent`),/2 kayıtlı dosya/);
  await snapshot('four-missing-files');
  const movedSecond=path.join(out,'manual-second-moved.vtt'), movedFirst=path.join(out,'manual-moved.srt');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[movedSecond]});
  await run(`document.getElementById('browserReplaceSecondary').click()`);
  await until(()=>run(`return browserTabState().subtitleSelection.secondaryFile?.endsWith('manual-second-moved.vtt')`),'İkinci dosya kurtarma');
  await wait(300);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[movedFirst]});
  await run(`document.getElementById('browserReplacePrimary').click()`);
  await until(()=>run(`return browserTabState().subtitleSelectionRestored&&player.cues.length===2&&player.cues2.length===3`),'Çift dosya kurtarma');
  assert.equal(await run(`return browserSubtitleMode()`),'both');
  assert.equal(await run(`return browserTransformForChannel(false).offsetSeconds`),.5);
  await run(`await inspectBrowserVideoSubtitles()`);assert.equal(await run(`return browserTabState().missingSubtitleFiles.length`),0);
  const recovery=await run(`return await window.api.browserSubtitlePreference({action:'inspect',tabId:player.browserActiveTabId,mediaId:browserTabState().mediaId})`);
  assert.equal(recovery.recovery,'backup');
  await snapshot('four-recovered-files');fs.writeFileSync(path.join(out,'four-recovery-report.json'),JSON.stringify({twoMissing:true,secondFirst:true,mode:'both',offset:.5,backupRecovery:true}));app.quit();return;
 }
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
  if(process.env.VIDEO_E2E_NATIVE_FULLSCREEN==='1'){
   const original=await restoredPage.executeJavaScript(`(()=>{const v=document.querySelector('video');v.loop=true;v.play();return {parent:v.parentElement.tagName,style:v.getAttribute('style')||''}})()`,true);
   await restoredPage.executeJavaScript(`document.querySelector('video').requestFullscreen()`,true);await wait(800);
   assert.equal(await restoredPage.executeJavaScript(`document.querySelector('video').paused`),false,'Tam ekran geçişi oynatmayı kesmemeli');
   await restoredPage.executeJavaScript(`document.querySelector('video').pause();document.querySelector('video').currentTime=.8`);await wait(300);
   const bounds=await restoredPage.executeJavaScript(`(()=>{const r=document.getElementById('__whisper_browser_subtitles').getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,fullscreen:document.fullscreenElement?.tagName}})()`);
   assert(bounds.width>100&&bounds.height>20,JSON.stringify(bounds));
   const clickControl=async selector=>{
    const point=await restoredPage.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    restoredPage.focus();
    restoredPage.sendInputEvent({type:'mouseMove',...point});
    restoredPage.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    restoredPage.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await wait(400);
   };
   await clickControl('#__whisper_subtitle_toolbar > button');
   const scale=await run(`return Number(document.getElementById('browserOverlayScale').value)`);
   await restoredPage.executeJavaScript(`document.querySelector('[data-action="subtitle-larger"]').click()`);await wait(200);
   assert.equal(await run(`return Number(document.getElementById('browserOverlayScale').value)`),scale,'Sayfa kaynaklı sahte tıklama engellenmeli');
   await clickControl('[data-action="subtitle-larger"]');
   assert.equal(await run(`return Number(document.getElementById('browserOverlayScale').value)`),scale+5);
   await clickControl('[data-action="subtitle-toggle"]');
   assert.equal(await run(`return browserSubtitleMode()`),'off');
   assert(await restoredPage.executeJavaScript(`document.getElementById('__whisper_subtitle_toolbar').getBoundingClientRect().width>0`));
   await clickControl('[data-action="subtitle-toggle"]');
   assert.equal(await run(`return browserSubtitleMode()`),'both');
   await clickControl('[data-action="subtitle-source"]');assert.equal(await run(`return browserSubtitleMode()`),'source');
   await clickControl('[data-action="subtitle-both"]');
   await clickControl('[data-action="subtitle-later"]');
   assert(Math.abs(await run(`return browserTransformForChannel(false).offsetSeconds`)-.3)<.001);
   await clickControl('[data-action="subtitle-save"]');
   assert.equal(await run(`return !!player.browserSyncPreview?.dirty`),false);
   report.push({toolbar:'native click, forged click rejection, scale, hide/show, mode, offset and save passed'});
   fs.writeFileSync(path.join(out,'review-native-fullscreen.png'),(await restoredPage.capturePage()).toPNG());
   fs.writeFileSync(path.join(out,'native-fullscreen-report.json'),JSON.stringify(bounds,null,2));
   await restoredPage.executeJavaScript(`document.exitFullscreen()`);await wait(300);
   assert.equal(await restoredPage.executeJavaScript(`!!document.getElementById('__whisper_subtitle_toolbar')`),false);
   const after=await restoredPage.executeJavaScript(`(()=>{const v=document.querySelector('video');return {parent:v.parentElement.tagName,style:v.getAttribute('style')||'',wrappers:document.querySelectorAll('#__whisper_fullscreen_player').length}})()`);
   assert.equal(after.wrappers,0);assert.equal(after.parent,original.parent);assert.equal(after.style,original.style);
   await run(`document.getElementById('browserVideoSubtitles').open=true;await inspectBrowserVideoSubtitles()`);
   assert.match(await run(`return document.getElementById('browserPrimaryFileInfo').textContent`),/Birinci kanal:/);
   await run(`document.getElementById('browserResetVideoSync').click()`);await wait(300);
   assert.equal(await run(`return browserTransformForChannel(false).offsetSeconds`),0);
   const refused=await run(`return await window.api.browserSubtitlePreference({action:'forget',tabId:player.browserActiveTabId,mediaId:'wrong-video'})`);
   assert.equal(refused.ok,false);
   await run(`document.getElementById('browserForgetSubtitles').click()`);await wait(500);
   assert.equal(await run(`return player.cues.length+player.cues2.length`),0);
   const prefs=JSON.parse(fs.readFileSync(path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'browser-subtitle-preferences.json'),'utf8'));
   assert.equal(prefs.items.some(row=>row.url==='https://video-e2e.test/watch'),false);
   report.push({manager:'inspect, reset, wrong-media rejection, forget persisted passed'});
  }
  report.push({restart:restored});await snapshot('04-restored');fs.writeFileSync(path.join(out,'restore-report.json'),JSON.stringify(report,null,2));app.quit();return;
 }
 await until(()=>run(`return !player.browserWorkspaceShowBusy&&player.browserActiveTabId`),'Tarayıcı çalışma alanının hazırlanması');
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
 if(process.env.VIDEO_E2E_ISOLATION==='1'){
  const oldTab=await run(`return player.browserActiveTabId`);
  const result=await run(`return await window.api.startBrowserTranslation(player.browserActiveTabId,{trackId:${JSON.stringify(en.id)},targetLanguage:'tr',cues:[{id:'isolation',start:0,end:1,text:'Old video sentence.'}],completeTrack:true})`);
  assert.equal(result.ok,true,JSON.stringify(result));
  await until(()=>releaseIsolationProvider,'Bekleyen sağlayıcı isteği');
  await run(`await createBrowserTab()`);
  const foreground=await run(`return player.browserActiveTabId`);
  const events=[],send=win.webContents.send.bind(win.webContents);
  win.webContents.send=(channel,...args)=>{if(channel==='browser:event')events.push(args[0]);return send(channel,...args);};
  await page.executeJavaScript(`history.pushState({},'', '/other')`);
  await until(()=>events.some(event=>event.type==='navigation'&&event.tabId===oldTab&&event.url?.endsWith('/other')),'Arka plan video değişimi');
  releaseIsolationProvider();await wait(600);
  assert.equal(events.some(event=>event.type==='translation-result'),false,'Eski çeviri yeni videoya yayımlanmamalı');
  assert.equal(events.some(event=>event.type==='subtitle-found'&&event.track?.role==='translation'),false,'Eski çeviri yeni video adına kaydedilmemeli');
  assert.equal(await run(`return player.browserActiveTabId`),foreground);
  assert.equal(await run(`return player.cues.length+player.cues2.length`),0);
  await run(`await activateBrowserTab(${JSON.stringify(oldTab)})`);
  assert.equal(await run(`return player.browserTracks.some(track=>track.role==='translation')`),false);
  await snapshot('isolation');
  fs.writeFileSync(path.join(out,'isolation.json'),JSON.stringify({delayedProvider:true,backgroundNavigation:true,staleResultRejected:true,foregroundPreserved:true,oldTranslationNotRestored:true},null,2));
  app.quit();return;
 }
 if(process.env.VIDEO_E2E_BROWSER_BUGS==='1'){
  await page.executeJavaScript(`document.querySelector('video').pause()`);
  const message=await run(`return browserTabState().compatibilityMessage`);
  assert(!/Cloudflare/i.test(message),'Normal sayfa Cloudflare çözülmüş gibi gösterilmemeli');
  const general=await run(`return $('browserOverlayBottom').value`);
  await run(`$('browserWatchTools').open=true;renderBrowserWatchStyle();
    for(const [field,value] of [['overlayBottom',12],['overlayGap',24]]){
      const input=document.querySelector('[data-field="'+field+'"]');input.value=value;input.dispatchEvent(new Event('input'));}`);
  await until(()=>page.executeJavaScript(`document.getElementById('__whisper_browser_subtitles')?.style.gap==='24px'`),'Görünüm uygulanması');
  const context=await run(`const tab=browserTabState();return {tabId:tab.id,generation:tab.generation,mediaId:tab.mediaId||'',acquisitionId:tab.acquisitionId||'',operationId:tab.operationId||''}`);
  win.webContents.send('browser:event',{...context,type:'overlay-style',style:{bottomOffset:31}});
  await until(()=>run(`return effectiveBrowserProfile().values.overlayBottom===31`),'Sürüklenen konumun korunması');
  assert.equal(await run(`return $('browserOverlayBottom').value`),general);
  await wait(500);
  await snapshot('browser-bugs');
  fs.writeFileSync(path.join(out,'browser-video.png'),(await page.capturePage()).toPNG());
  fs.writeFileSync(path.join(out,'browser-bugs.json'),JSON.stringify({video:mediaInfo,overlay,message,dragOffset:31,generalPreserved:true,controlledDragEvent:true},null,2));
  app.quit();return;
 }
 if(process.env.VIDEO_E2E_DURABLE==='write'){
  const original=fs.readFileSync(en.path,'utf8');
  await run(`openCueEditor();browserQuickEditor.rows[0].text.value='Kalıcı kaynak düzeltmesi';browserQuickEditor.rows[1].text.value='Kalıcı ikinci dil düzeltmesi';await saveBrowserQuickEditor();closeBrowserQuickEditor();
    document.getElementById('browserSyncChannel').value='primary';nudgeBrowserSync(.2);saveBrowserSync();
    document.getElementById('browserSyncChannel').value='secondary';nudgeBrowserSync(.4);saveBrowserSync();await browserCommand('seek',2.5);await browserCommand('pause');saveActiveBrowserTabWorkspace();`);
  await wait(1800);fs.writeFileSync(en.path,original);
  fs.writeFileSync(path.join(out,'durable-write.json'),JSON.stringify({saved:true,sourceFileRefreshed:true}));app.quit();return;
 }
 if(process.env.VIDEO_E2E_FEATURES==='1'){
  const results={};
  await page.executeJavaScript(`document.querySelector('video').pause()`);
  await run(`$('browserWatchTools').open=true;renderBrowserWatchStyle();
    for(const [field,value] of [['overlayScale',130],['overlayOpacity',35],['overlayBottom',12],['overlayGap',24]]){
      const input=document.querySelector('[data-field="'+field+'"]');input.value=value;input.dispatchEvent(new Event('input'));}`);
  await until(()=>page.executeJavaScript(`document.getElementById('__whisper_browser_subtitles')?.style.gap==='24px'`),'İki dil aralığı');
  const appearance=await page.executeJavaScript(`(()=>{const box=document.getElementById('__whisper_browser_subtitles'),row=box.querySelector('[data-kind="source"]');return {gap:box.style.gap,bg:row.style.backgroundColor,size:row.style.fontSize}})()`);
  assert.equal(appearance.bg,'rgba(5, 7, 10, 0.35)');assert(appearance.size.includes('19.5'));results.appearance=appearance;
  await run(`openBrowserQuickEditor();const editor=browserQuickEditor;player.browserTime=1;alignQuickEditorRow(editor,editor.rows[0]);saveBrowserSync();
    player.browserTime=1.3;alignQuickEditorRow(editor,editor.rows[1]);saveBrowserSync();`);
  assert.deepEqual(await run(`return [browserTransformForChannel(false).offsetSeconds,browserTransformForChannel(true).offsetSeconds]`),[1,1.3]);results.channelSync=true;
  await run(`closeBrowserQuickEditor();$('browserSyncChannel').value='primary';resetBrowserSync();$('browserSyncChannel').value='secondary';resetBrowserSync();
    await browserCommand('seek',.8);renderBrowserCueAt(.8);openBrowserQuickEditor();
    browserQuickEditor.rows[0].text.value='Korunan eski düzeltme';await saveBrowserQuickEditor();closeBrowserQuickEditor();`);
  await run(`const stored=readSourceEdits(),scope=Object.keys(stored)[0];globalThis.remapOld={scope,record:stored[scope][0]};
    $('browserSubtitleReview').open=true;$('browserRemapPanel').open=true;renderBrowserRemap();
    $('browserRemapRecord').value=String(browserRemapChoices.findIndex(item=>item.scope===scope));
    $('browserRemapChannel').value=subtitleFindDescriptors()[0].channel;renderBrowserRemapCues();$('browserRemapCue').value='1';stageBrowserRemap();`);
  assert.equal(await run(`return browserQuickEditor.rows[0].text.value`),'Korunan eski düzeltme');
  assert.equal(await run(`return browserQuickEditor.rows[0].start.value`),'1.800');
  await run(`closeBrowserQuickEditor();openBrowserQuickEditor(false,{channel:subtitleFindDescriptors()[0].channel,index:1});`);
  assert.equal(await run(`return !!browserQuickEditor.remap`),true);
  await run(`await saveBrowserQuickEditor();closeBrowserQuickEditor();`);
  assert.equal(await run(`return readSourceEdits()[remapOld.scope].length`),1);
  assert.equal(await run(`return readSourceEdits()[remapOld.scope][0].base.start`),1.8);
  await run(`await applyCueEditHistory('undo')`);
  assert.equal(await run(`return readSourceEdits()[remapOld.scope][0].base.start`),0);results.remapUndo=true;
  await run(`const stored=readSourceEdits();stored['retired-test-track']=stored[remapOld.scope];delete stored[remapOld.scope];writeSourceEdits(stored);
    renderBrowserRemap();$('browserRemapRecord').value=String(browserRemapChoices.findIndex(item=>item.scope==='retired-test-track'));
    $('browserRemapChannel').value=subtitleFindDescriptors()[0].channel;renderBrowserRemapCues();$('browserRemapCue').value='1';stageBrowserRemap();
    await saveBrowserQuickEditor();closeBrowserQuickEditor();`);
  assert.equal(await run(`return !!readSourceEdits()['retired-test-track']`),false);
  assert.equal(await run(`return readSourceEdits()[remapOld.scope][0].base.start`),1.8);
  await run(`await applyCueEditHistory('undo')`);
  assert.equal(await run(`return readSourceEdits()['retired-test-track'][0].base.start`),0);results.changedTrackRemapUndo=true;
  await run(`await browserCommand('seek',.8);renderBrowserCueAt(.8);openBrowserQuickEditor();
    const original=buildOptsFromUI;buildOptsFromUI=()=>({...original(),translateApiKey:'controlled-test-value'});
    requestQuickTranslations(browserQuickEditor,browserQuickEditor.rows[1]);`);
  await until(()=>aiRequests.length===1,'Alternatif çeviri isteği');
  assert(aiRequests[0].chat.question.includes('alternatives'));
  const emit=async event=>{win.webContents.send('transcribe:event',{jobId:aiRequests.at(-1).jobId,...event});await wait(200);};
  await emit({type:'chat',text:JSON.stringify({alternatives:['Rüzgârda salınan çiçekler.','Çiçekler rüzgârla sallanıyor.','Çiçekleri rüzgâr oynatıyor.']})});
  await emit({type:'done',files:[]});await emit({type:'exit',code:0});
  assert.equal(await run(`return document.querySelectorAll('.browser-ai-alternative button').length`),3);
  await snapshot('features-ai');
  const originalTranslation=await run(`return player.cues2[0].text`);
  await run(`document.querySelector('.browser-ai-alternative button').click()`);
  assert.equal(await run(`return player.cues2[0].text`),originalTranslation);
  assert.equal(await run(`return browserQuickEditor.rows[1].text.value`),'Rüzgârda salınan çiçekler.');
  await snapshot('features-wide');fs.writeFileSync(path.join(out,'features-video.png'),(await page.capturePage()).toPNG());
  await run(`await saveBrowserQuickEditor();closeBrowserQuickEditor();await applyCueEditHistory('undo')`);
  assert.equal(await run(`return player.cues2[0].text`),originalTranslation);results.aiPreviewSaveUndo=true;
  await run(`document.querySelector('.browser-ai-alternative button').click()`);
  assert.equal(await run(`return player.cues2[0].text`),originalTranslation);results.staleAiRejected=true;
  win.setContentSize(1000,760);await wait(300);
  await run(`setPlayerSidebarCollapsed(false);$('browserWatchTools').open=false;$('browserSubtitleReview').open=true;$('browserRemapPanel').open=true;renderBrowserRemap();`);
  await snapshot('features-narrow');
  fs.writeFileSync(path.join(out,'features.json'),JSON.stringify(results,null,2));app.quit();return;
 }
 if(process.env.VIDEO_E2E_AI==='1'){
  await run(`const buildOriginal=buildOptsFromUI;buildOptsFromUI=()=>({...buildOriginal(),translateApiKey:'controlled-test-value'});setSideTab('ai');`);
  aiPageDelay=true;
  await run(`void aiChatSend('Eski sekme sorusu')`);await until(()=>aiPageResolve,'Bağlam isteği');
  const tabId=await run(`return player.browserActiveTabId`);
  await run(`player.browserActiveTabId='stale-test-tab'`);aiPageResolve({ok:true,blocks:[]});
  await until(()=>run(`return !aiChatPreparing`),'Eski isteğin bırakılması');assert.equal(aiRequests.length,0);
  await run(`player.browserActiveTabId=${JSON.stringify(tabId)};player.browserTime=.8`);
  aiPageResolve=null;await run(`void aiChatSend('Ne konuşuluyor?');void aiChatSend('Çift tıklama')`);
  await until(()=>aiPageResolve,'İkinci bağlam isteği');
  await run(`player.browserTime=4`);aiPageResolve({ok:true,blocks:[{id:'S1',text:'Sayfa metni'}]});
  await until(()=>aiRequests.length===1,'Tek AI isteği');
  assert.equal(aiRequests[0].chat.context.cumle,captions.en[0]);
  assert.equal(aiRequests[0].chat.context.transcript_evidence.position,.8);
  assert.equal(aiRequests[0].chat.context.sonraki.length,0);
  const emit=async(event)=>{win.webContents.send('transcribe:event',{jobId:aiRequests.at(-1).jobId,...event});await wait(200);};
  await emit({type:'chat',text:'Altyazıya göre çiçeklerden söz ediliyor [T1]. [T999] 09:59 00:00'});
  await emit({type:'done',files:[]});await emit({type:'exit',code:0});
  assert.equal(await run(`return document.querySelectorAll('.ai-transcript-link').length`),1);
  assert.equal(await run(`return document.querySelectorAll('.ai-time-link').length`),1);
  await run(`document.querySelector('.ai-transcript-link').click()`);
  await until(()=>page.executeJavaScript(`document.querySelector('video').currentTime<.3`),'Kanıta video seek');
  await run(`player.browserActiveTabId='stale-test-tab';player.browserTime=2;document.querySelector('.ai-time-link').click()`);
  assert.equal(await run(`return player.browserTime`),2);
  await run(`player.browserActiveTabId=${JSON.stringify(tabId)}`);aiPageDelay=false;
  await run(`await aiChatSend('Hata denemesi')`);await emit({type:'error',message:'Kontrollü bağlantı hatası'});await emit({type:'exit',code:1});
  assert.equal(await run(`return document.getElementById('aiChatRetry').classList.contains('hidden')`),false);
  await run(`document.getElementById('aiChatRetry').click()`);await until(()=>aiRequests.length===3,'Yeniden deneme');
  await run(`await cancelAiChat()`);await emit({type:'chat',text:'İptal sonrası geç yanıt'});await emit({type:'exit',code:0});
  assert.equal(await run(`return player.chatHistory.some(row=>row.content==='İptal sonrası geç yanıt')`),false);
  await run(`await aiChatSend('Boş yanıt')`);await emit({type:'chat',text:''});await emit({type:'exit',code:1});
  assert.equal(await run(`return state.running`),false);
  await run(`const originalTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===120000?80:ms,...args);await aiChatSend('Süre sınırı');window.setTimeout=originalTimeout;`);
  await until(()=>run(`return player.job?.cancelled`),'AI yanıt süresi sınırı');
  assert.match(await run(`return player.job.bubble.textContent`),/süresi aşıldı/);
  await emit({type:'exit',code:1});
  aiCancelFail=true;
  await run(`await aiChatSend('İptal bağlantısı');await cancelAiChat()`);
  await until(()=>run(`return player.job?.bubble.textContent.includes('doğrulanamadı')`),'İptal hatası görünürlüğü');
  assert.equal(await run(`return player.job.awaitingExit`),true);
  await run(`await cancelAiChat()`);await emit({type:'exit',code:1});
  if(process.env.VIDEO_E2E_COMBINED_SOAK==='1'){
   const seconds=Math.max(60,Number(process.env.VIDEO_E2E_SOAK_SECONDS)||600),samples=[],began=Date.now();let cycle=0;
   await page.executeJavaScript(`document.querySelector('video').loop=true;document.querySelector('video').play()`,true);
   while(Date.now()-began<seconds*1000){
    await wait(10000);cycle++;
    await page.executeJavaScript(`document.querySelector('video').currentTime=${[.6,2.2,4][cycle%3]}`);
    if(cycle%3===0){await run(`await aiChatSend('Bu replikte ne konuşuluyor?')`);await emit({type:'chat',text:'Yalnız verilen altyazı değerlendirilebilir [T1].'});await emit({type:'done',files:[]});await emit({type:'exit',code:0});}
    if(cycle%5===0){
     await run(`await window.api.setBrowserNetworkOnline(false)`);
     const calls=soakProviderCalls;
     const result=await run(`return await window.api.startBrowserTranslation(player.browserActiveTabId,{trackId:${JSON.stringify(en.id)},targetLanguage:'tr',cues:[{id:'soak-${cycle}',start:0,end:5,text:'Test sentence ${cycle}.'}],completeTrack:true})`);
     assert.equal(result.ok,true);await wait(200);assert.equal(soakProviderCalls,calls,'Çevrimdışı kuyruk sağlayıcıya gitmemeli');
     await run(`await window.api.setBrowserNetworkOnline(true)`);await until(()=>soakProviderCalls>calls,'Bağlantı sonrası çeviri');
    }
    if(cycle%6===0){const active=await run(`return player.browserActiveTabId`);await run(`await createBrowserTab();await activateBrowserTab(${JSON.stringify(active)})`);await page.executeJavaScript(`document.querySelector('video').play()`,true);}
    const diag=await page.executeJavaScriptInIsolatedWorld(999,[{code:'window.__whisperBrowserOverlayController.diagnostics()'}]);
    assert.equal(diag.overlayNodes,3);assert.equal(diag.mutationObservers,1);assert(page.listenerCount('did-stop-loading')<=2);
    samples.push({seconds:Math.round((Date.now()-began)/1000),overlayNodes:diag.overlayNodes,observers:diag.mutationObservers,listeners:page.listenerCount('did-stop-loading'),providerCalls:soakProviderCalls,aiRequests:aiRequests.length,workingSetKiB:app.getAppMetrics().filter(m=>m.type==='Tab').reduce((sum,m)=>sum+(m.memory?.workingSetSize||0),0)});
    fs.writeFileSync(path.join(out,'combined-soak.json'),JSON.stringify({elapsedSeconds:(Date.now()-began)/1000,cycles:cycle,samples},null,2));
   }
   await page.executeJavaScript(`document.querySelector('video').pause()`);
  }
  aiPageDelay=true;aiPageResolve=null;
  const requestCount=aiRequests.length;
  await run(`void aiChatSend('Hazırlık iptali')`);await until(()=>aiPageResolve,'İptal edilecek bağlam');
  await run(`await cancelAiChat()`);aiPageResolve({ok:true,blocks:[]});await wait(250);
  assert.equal(aiRequests.length,requestCount);
  aiPageDelay=false;
  await run(`player.generation++;await aiChatSend('Yeni video oturumu')`);
  assert.equal(aiRequests.at(-1).chat.history.length,0);
  await run(`await cancelAiChat()`);await emit({type:'exit',code:1});
  await snapshot('ai-reviewed');
  fs.writeFileSync(path.join(out,'ai-report.json'),JSON.stringify({stalePreparation:true,singleRequest:true,frozenContext:true,watchedScope:true,verifiedCitations:true,videoSeek:true,staleCitationBlocked:true,errorRetry:true,cancelLateReply:true,emptyReply:true,responseDeadline:true,cancelPreparation:true,cancelFailureRetry:true,historyIsolation:true},null,2));app.quit();return;
 }
 if(process.env.VIDEO_E2E_REVIEW_EDIT==='1'){
  const original=fs.readFileSync(en.path,'utf8');
  await run(`openCueEditor();browserQuickEditor.rows[0].text.value='Önizleme metni';document.getElementById('browserQuickPreview').click();`);
  await until(()=>page.executeJavaScript(`document.getElementById('__whisper_browser_subtitles')?.textContent.includes('Önizleme metni')`),'Kaydetmeden önizleme');
  assert.equal(fs.readFileSync(en.path,'utf8'),original);
  assert.equal(await run(`return player.cues[0].text`),captions.en[0]);
  await run(`closeBrowserQuickEditor()`);
  await until(()=>page.executeJavaScript(`document.getElementById('__whisper_browser_subtitles')?.textContent.includes('Flowers')`),'Önizlemeyi kapatma');
  await run(`openCueEditor();browserQuickEditor.rows[0].end.value='1.300';await replayBrowserQuickCue()`);
  await until(()=>page.executeJavaScript(`!document.querySelector('video').paused`),'Repliği oynatma');
  await until(()=>page.executeJavaScript(`document.querySelector('video').paused&&document.querySelector('video').currentTime>=1.3`),'Replik sonunda durma',6000);
  await run(`globalThis.reviewStorageOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===browserReviewRecordsKey)throw new Error('Kontrollü kota hatası');return reviewStorageOriginal.call(this,key,value)};await saveBrowserQuickEditor();Storage.prototype.setItem=reviewStorageOriginal`);
  assert.equal(fs.readFileSync(en.path,'utf8'),original,'Kota hatasında dosya geri yüklenmeli');
  assert.equal(await run(`return player.cues[0].text`),captions.en[0]);
  assert.match(await run(`return document.getElementById('browserQuickEditStatus').textContent`),/saklanamadı/);
  await run(`await saveBrowserQuickEditor()`);
  assert.equal(await run(`return player.cues[0].text`),'Önizleme metni');
  assert.equal(await run(`return Object.values(readSourceEdits()).flat().length`),1);
  await run(`await browserQuickHistory('undo')`);
  assert.equal(await run(`return Object.values(readSourceEdits()).flat().length`),0);
  await run(`await browserQuickHistory('redo');closeBrowserQuickEditor()`);
  fs.writeFileSync(en.path,original.replace(captions.en[0],'Site yenilendi'));
  await run(`await loadSubtitle(${JSON.stringify(en.path)},false,{silent:true});document.getElementById('browserSubtitleReview').open=true;renderBrowserSubtitleReview()`);
  assert.equal(await run(`return player.cues[0].text`),'Önizleme metni');
  assert.match(await run(`return document.getElementById('browserReviewConflicts').textContent`),/Site yenilendi/);
  await snapshot('review-conflict');
  await run(`document.querySelector('#browserReviewConflicts button').click()`);
  await until(()=>run(`return !document.querySelector('#browserReviewConflicts button')`),'Düzeltmeyi koruma');
  fs.writeFileSync(en.path,original.replace(captions.en[0],'İkinci site güncellemesi'));
  await run(`await loadSubtitle(${JSON.stringify(en.path)},false,{silent:true});renderBrowserSubtitleReview();document.querySelectorAll('#browserReviewConflicts button')[1].click()`);
  await until(()=>run(`return player.cues[0].text==='İkinci site güncellemesi'`),'Yeni kaynağı seçme');
  await run(`player.cuesRaw[0].text='Çok hızlı '.repeat(20);renderBrowserSubtitleReview();document.querySelector('#browserReviewIssues button').click()`);
  await until(()=>run(`return browserQuickEditor?.rows[0].index===0`),'Uyarıdan düzenleyiciye');
  win.setContentSize(820,760);await snapshot('review-narrow');
  fs.writeFileSync(path.join(out,'review-edit-report.json'),JSON.stringify({previewWithoutWrite:true,closeRestores:true,replayStops:true,storageFailureRollback:true,sourceUndoRedo:true,sourceRefreshPreserves:true,keepAndAcceptConflict:true,issueNavigation:true},null,2));app.quit();return;
 }
 if(process.env.VIDEO_E2E_QUICK==='1'){
  await run(`openCueEditor();`);
  assert.equal(await run(`return browserQuickEditor.rows.length`),2);
  await run(`const rows=browserQuickEditor.rows;rows[0].text.value='Rüzgârda çiçekler.';rows[0].start.value='0.100';rows[1].text.value='İkinci kanal düzeltildi.';rows[1].end.value='1.700';rows[0].text.dispatchEvent(new Event('input'));`);
  assert.equal(await run(`return quickEditorDirty()`),true);
  await run(`closeBrowserQuickEditor();openCueEditor()`);
  assert.equal(await run(`return browserQuickEditor.rows[0].text.value`),'Rüzgârda çiçekler.');
  const originalEn=fs.readFileSync(en.path,'utf8'),originalTr=fs.readFileSync(tr.path,'utf8');
  quickFailPath=tr.path;
  await run(`await saveBrowserQuickEditor()`);
  assert.match(await run(`return document.getElementById('browserQuickEditStatus').textContent`),/Kontrollü yazma hatası/);
  assert.equal(fs.readFileSync(en.path,'utf8'),originalEn,'İlk dosya geri yüklenmeli');
  assert.equal(fs.readFileSync(tr.path,'utf8'),originalTr);
  assert.equal(await run(`return player.cues[0].text`),captions.en[0]);
  assert.equal(await run(`return quickEditorDirty()`),true);
  await run(`await saveBrowserQuickEditor()`);
  assert.equal(await run(`return player.cues[0].text`),'Rüzgârda çiçekler.');
  assert.equal(await run(`return player.cues[0].start`),.1);
  assert.equal(await run(`return player.cues2[0].text`),'İkinci kanal düzeltildi.');
  assert.equal(await run(`return player.cues2[0].end`),1.7);
  assert.match(fs.readFileSync(en.path,'utf8'),/00:00:00.100/);
  assert.equal(await run(`return player.cueEditUndo.at(-1).files.length`),2);
  await snapshot('quick-saved');
  await run(`await browserQuickHistory('undo')`);
  assert.equal(await run(`return player.cues[0].text`),captions.en[0]);
  assert.equal(await run(`return player.cues2[0].end`),1.8);
  await run(`await browserQuickHistory('redo')`);
  assert.equal(await run(`return player.cues[0].start`),.1);
  await run(`browserQuickEditor.rows[0].text.value='Yanlış satıra yazılmamalı';browserQuickEditor.rows[0].text.dispatchEvent(new Event('input'));player.activeIdx=1;await saveBrowserQuickEditor()`);
  fs.writeFileSync(path.join(out,'quick-diagnostic.json'),JSON.stringify(await run(`return {status:document.getElementById('browserQuickEditStatus').textContent,rows:browserQuickEditor?.rows.map(r=>({channel:r.channel,index:r.index,before:r.before,raw:r.expectedRaw})),cues:player.cues,cues2:player.cues2}`),null,2));
  assert.equal(await run(`return player.cues[0].text`),'Yanlış satıra yazılmamalı');
  assert.equal(await run(`return player.cues[1].text`),captions.en[1]);
  await run(`closeBrowserQuickEditor();player.activeIdx=0;openCueEditor();browserQuickEditor.rows[0].start.value='3';browserQuickEditor.rows[0].end.value='2';await saveBrowserQuickEditor()`);
  assert.match(await run(`return document.getElementById('browserQuickEditStatus').textContent`),/0,08/);
  await run(`document.getElementById('browserQuickEditDiscard').click();`);
  win.setContentSize(820,760);await wait(400);await snapshot('quick-narrow');
  const layout=await run(`const p=document.getElementById('browserQuickEdit');return {width:p.clientWidth,scroll:p.scrollWidth,save:document.getElementById('browserQuickEditSave').getBoundingClientRect().right,viewport:innerWidth}`);
  assert(layout.width>=200&&layout.scroll<=layout.width+2&&layout.save<=layout.viewport);
  await run(`browserQuickEditor.rows[0].text.value='Eski video taslağı';browserQuickEditor.rows[0].text.dispatchEvent(new Event('input'));player.browserActiveTabId='changed-tab';await saveBrowserQuickEditor()`);
  assert.match(await run(`return document.getElementById('browserQuickEditStatus').textContent`),/Video veya altyazı değişti/);
  await run(`player.browserActiveTabId=browserQuickEditor.tabId;document.getElementById('browserQuickEditDiscard').click();closeBrowserQuickEditor();
    const track=player.browserTracks.find(t=>t.id===${JSON.stringify(tr.id)});track.role='translation';track.sourceTrackId=${JSON.stringify(en.id)};track.sourceHash='controlled-source';
    applyLoadedBrowserTranslation(track,true);renderBrowserCueAt(.8,.8,true);openCueEditor();
    const row=browserQuickEditor.rows.find(r=>r.role==='translation');row.text.value='Kullanıcının çevirisi';row.start.value='0.200';row.end.value='1.600';row.text.dispatchEvent(new Event('input'));await saveBrowserQuickEditor();`);
  assert.equal(await run(`return player.cues2[0].text`),'Kullanıcının çevirisi');
  assert.equal(await run(`return player.cues2[0].start`),.2);
  assert.equal(await run(`return browserTabState().subtitleEdits.at(0).timingOverride.end`),1.6);
  await run(`const map=browserBaseCueMap(${JSON.stringify(tr.id)});const first=[...map.values()][0];first.text='Gecikmiş model metni';refreshBrowserEditedChannel(${JSON.stringify(tr.id)});`);
  assert.equal(await run(`return player.cues2[0].text`),'Kullanıcının çevirisi');
  assert.equal(await run(`return player.cues2[0].start`),.2);
  await run(`await browserQuickHistory('undo')`);
  assert.equal(await run(`return player.cues2[0].text`),'Gecikmiş model metni');
  await run(`await browserQuickHistory('redo')`);
  assert.equal(await run(`return player.cues2[0].text`),'Kullanıcının çevirisi');
  fs.writeFileSync(path.join(out,'quick-report.json'),JSON.stringify({dualEdit:true,timing:true,draftRestore:true,writeFailureRollback:true,undoRedo:true,pinnedCue:true,invalidTiming:true,staleTab:true,lateModel:true,modelTimingUndoRedo:true,layout},null,2));app.quit();return;
 }
 assert(overlay.includes(captions.en[0])&&overlay.includes(captions.tr[0]),'Çift dil katmanında iki dil birlikte görünmedi: '+overlay);
 await page.executeJavaScript(`document.querySelector('video').currentTime=2.5`);await wait(1000);
 const seekText=await until(()=>page.executeJavaScript(`(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t.includes('garden')&&t.includes('Bahçeye')?t:null})()`),'İleri sarma katmanı');
  assert(seekText.includes(captions.en[1])&&seekText.includes(captions.tr[1]),'İleri sarma altyazıları güncellemedi');report.push({seek:'passed'});
 if(process.env.VIDEO_E2E_STRESS==='1'){
  const seeks=[];
  for(let index=0;index<60;index++){
   const slot=index%3, target=[.5,2.5,4.2][slot],began=Date.now();
   await page.executeJavaScript(`document.querySelector('video').pause();document.querySelector('video').currentTime=${target}`);
   await until(()=>page.executeJavaScript(`(()=>{const t=document.getElementById('__whisper_browser_subtitles')?.textContent||'';return t.includes(${JSON.stringify(captions.en[slot])})&&t.includes(${JSON.stringify(captions.tr[slot])})})()`),'Tekrarlı seek '+index,3000);
   seeks.push(Date.now()-began);
  }
  const diagnostics=await page.executeJavaScriptInIsolatedWorld(999,[{code:'window.__whisperBrowserOverlayController.diagnostics()'}]);
  assert.equal(diagnostics.overlayNodes,3);assert.equal(diagnostics.mutationObservers,1);
  assert(page.listenerCount('did-stop-loading')<=1);
  report.push({seekStress:{count:seeks.length,maxMs:Math.max(...seeks),samples:seeks,diagnostics}});
  await page.executeJavaScript(`document.querySelector('video').currentTime=2.5`);await wait(200);
 }
 await page.executeJavaScript(`document.querySelector('video').play()`);
 await until(()=>page.executeJavaScript(`document.querySelector('video').currentTime>2.6`),'Videonun ilerlemesi',5000);
 await page.executeJavaScript(`document.querySelector('video').pause()`);report.push({playback:'passed'});
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
 if(process.env.VIDEO_E2E_REVIEW==='1'){
  await wait(1200);
  const saved=await run(`return {path:player.subPath,mode:currentSubtitleMode(),offset:browserTransformForChannel(false).offsetSeconds}`);
  await run(`document.getElementById('browserAddress').value='https://video-e2e.test/other';await navigateBrowserFromAddress()`);await wait(700);
  await until(()=>run(`return player.subPath.endsWith('manual.vtt')&&player.cues.length===3`),'Video başına manuel dosya');
  await run(`document.getElementById('browserAddress').value='https://video-e2e.test/watch';await navigateBrowserFromAddress()`);
  await until(()=>run(`return player.subPath===${JSON.stringify(saved.path)}&&currentSubtitleMode()==='both'&&Math.abs(browserTransformForChannel(false).offsetSeconds-${saved.offset})<.001`),'Video başına dil ve senkron');
  report.push({perVideoRestore:'passed'});
  // Native browser focus path and shell renderer route must use the same commands.
  const size=await run(`return Number(document.getElementById('browserOverlayScale').value)`);
  page.focus();page.sendInputEvent({type:'keyDown',keyCode:'Up',modifiers:['control','alt']});await wait(300);
  assert.equal(await run(`return Number(document.getElementById('browserOverlayScale').value)`),size+5);
  report.push({nativeSubtitleShortcut:'passed'});
  await page.executeJavaScript(`document.documentElement.requestFullscreen()`,true);await wait(700);
  assert.equal(await page.executeJavaScript(`!!document.fullscreenElement`),true);
  await page.executeJavaScript(`document.querySelector('video').currentTime=.8`);await wait(700);
  const rects=await page.executeJavaScript(`(()=>{const root=document.getElementById('__whisper_browser_subtitles'),video=document.querySelector('video'),r=root.getBoundingClientRect(),v=video.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,videoTop:v.top,videoBottom:v.bottom,videoLeft:v.left,videoRight:v.right,nodes:document.querySelectorAll('[data-whisper-browser-overlay]').length}})()`);
  assert(rects.top>=rects.videoTop-1&&rects.bottom<=rects.videoBottom+1,JSON.stringify(rects));assert.equal(rects.nodes,1);
  fs.writeFileSync(path.join(out,'review-fullscreen.png'),(await page.capturePage()).toPNG());
  await page.executeJavaScript(`document.exitFullscreen()`);await wait(400);report.push({fullscreen:rects});
  await run(`renderBrowserSubtitleHealth()`);
  await snapshot('review-status');
  await page.executeJavaScript(`document.querySelector('video').style.width='320px';document.querySelector('video').currentTime=.8`);await wait(300);
  const longLayout=await page.executeJavaScriptInIsolatedWorld(999,[{code:`(()=>{window.__whisperBrowserOverlayController.update({mode:'both',source:[{start:0,end:5,text:'UzunKelime'.repeat(50)}],translation:[{start:0,end:5,text:'Uzun çeviri satırı '.repeat(30)}],style:{scale:1.8,width:98,maxLines:6}});const r=document.getElementById('__whisper_browser_subtitles').getBoundingClientRect(),v=document.querySelector('video').getBoundingClientRect();return {top:r.top,bottom:r.bottom,videoTop:v.top,videoBottom:v.bottom,rows:[...document.querySelectorAll('#__whisper_browser_subtitles > div')].map(e=>({width:e.getBoundingClientRect().width,videoWidth:v.width}))}})()`}]);
  assert(longLayout.top>=longLayout.videoTop-1&&longLayout.bottom<=longLayout.videoBottom+1,JSON.stringify(longLayout));
  assert(longLayout.rows.every(row=>row.width<=row.videoWidth),JSON.stringify(longLayout));report.push({longLayout});
  fs.writeFileSync(path.join(out,'review-long-lines.png'),(await page.capturePage()).toPNG());
  await page.executeJavaScript(`document.querySelector('video').style.width='95%'`);await run(`scheduleBrowserOverlaySync()`);await wait(400);
  // Gerçek kısa MP4 döngüsü; süre ortam değişkeniyle uzatılabilir. Uzun film testi değildir.
  const seconds=Math.max(30,Number(process.env.VIDEO_E2E_SOAK_SECONDS)||300);
  await page.executeJavaScript(`document.querySelector('video').loop=true;document.querySelector('video').play()`,true);
  const memory=[];const began=Date.now();
  while(Date.now()-began<seconds*1000){
   await wait(5000);
   const metric=app.getAppMetrics().filter(m=>m.type==='Tab').reduce((sum,m)=>sum+(m.memory?.workingSetSize||0),0);
   const diag=await page.executeJavaScriptInIsolatedWorld(999,[{code:`window.__whisperBrowserOverlayController?.diagnostics()`}]);
   assert(diag&&diag.overlayNodes===3,JSON.stringify(diag));assert(diag.pendingFrames<=3,JSON.stringify(diag));
   memory.push({seconds:Math.round((Date.now()-began)/1000),rendererWorkingSetKiB:metric,overlayNodes:diag.overlayNodes,pendingFrames:diag.pendingFrames,mediaListeners:diag.mediaListeners,mutationObservers:diag.mutationObservers,nativeStopListeners:page.listenerCount('did-stop-loading'),shellStopListeners:win.webContents.listenerCount('did-stop-loading')});
   fs.writeFileSync(path.join(out,'review-soak-progress.json'),JSON.stringify(memory,null,2));
  }
  await page.executeJavaScript(`document.querySelector('video').pause()`);
  report.push({soak:{elapsedSeconds:(Date.now()-began)/1000,samples:memory}});
 }
 await wait(1200);report.push({profile:process.env.WHISPER_RESOURCE_SOAK_USER_DATA});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.quit();
}).catch(async e=>{
 try { const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://video-e2e.test/'));if(w)fs.writeFileSync(path.join(out,'failure-page.json'),JSON.stringify(await w.executeJavaScript(`({time:document.querySelector('video')?.currentTime,paused:document.querySelector('video')?.paused,text:document.getElementById('__whisper_browser_subtitles')?.textContent,diagnostics:window.__whisperBrowserOverlayController?.diagnostics()})`),null,2)); } catch(_){}
 fs.writeFileSync(path.join(out,'error.txt'),e.stack);console.error(e);app.exit(1)
});
