'use strict';
// Native Windows UI, parent/overlay IPC and real command adapters. Engine events are fixtures.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-video',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');const {ipcMain}=require('electron'),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>handle(name,name==='transcribe:cancel'?async()=>({ok:true}):fn);require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(row=>row.webContents.getURL().includes('index.html')&&!row.webContents.isLoading());return win;},'main window');
 const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await until(()=>parent('return !!window.AssistantVideoCommands'),'video adapter');
 const view=win.contentView.children.find(row=>row.webContents?.getURL().includes('assistant-overlay.html'));assert(view);
 const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 // Force a visible compositor surface for native capture on Windows.
 win.setContentSize(1440,1000);win.show();win.webContents.focus();
 await parent(`await initialSettingsReady;window.UiLocale.set('tr',false);applyUiTheme('dark');
  document.body.classList.remove('media-home-active');document.getElementById('playerLayer').classList.remove('hidden');
  player.workspaceMode='browser';player.mediaKey='browser:assistant-video-fixture';player.generation++;
  player.browserMediaSeen=true;player.browserActiveTabId='fixture-video';player.browserPageUrl='https://www.youtube.com/watch?v=abcdefghijk';
  player.browserPageTitle='Kontrollü YouTube videosu';player.browserDuration=900;player.browserTime=0;
  player.browserTabs=[{id:'fixture-video',generation:1,url:player.browserPageUrl,mediaId:'fixture',browserTracks:[]}];player.browserTracks=[];
  document.getElementById('playerTitle').textContent=player.browserPageTitle;document.getElementById('translateApiKey').value='fixture-translation-key';document.getElementById('translateModel').value='fixture-translation';
  window.fixtureStarts=[];startTranscribeSafe=async opts=>{fixtureStarts.push({translate:opts.translate,start:opts.clipStart,end:opts.clipEnd});return {ok:true};};
  document.dispatchEvent(new Event('media-context-changed'));return true`);
 await until(()=>run("return document.getElementById('suggestions').textContent.includes('Yalnız Whisper')"),'video actions');
 await run("document.getElementById('bubble').click();return true");
 async function capture(name){
  await run('await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true');await wait(500);
  const bounds=await run("return {width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,send:document.getElementById('send').getBoundingClientRect().bottom,log:document.getElementById('log').clientHeight,headerTop:document.querySelector('header').getBoundingClientRect().top,scrollY,theme:document.documentElement.dataset.theme,lang:document.documentElement.lang,surface:getComputedStyle(document.getElementById('panel')).backgroundColor}");
  assert(bounds.scroll<=bounds.width+1&&bounds.send<=bounds.height&&bounds.log>70&&bounds.headerTop>=0&&bounds.scrollY===0,JSON.stringify(bounds));
  fs.writeFileSync(path.join(out,name+'.png'),(await view.webContents.capturePage()).toPNG());return bounds;
 }
 await capture('video-actions-dark');
 await run("document.getElementById('text').value='Whisper 05:00–10:00 altyazı çıkar';document.getElementById('form').requestSubmit();return true");
 await until(()=>parent('return fixtureStarts.length===1'),'Whisper command route');
 assert.deepEqual(await parent('return fixtureStarts[0]'),{translate:false,start:300,end:600});
 await until(()=>run("return document.getElementById('text').value===''&&!document.getElementById('cancel').hidden"),'accepted receipt and cancel');
 await capture('video-running-dark');
 await parent("playerJobEvent({type:'error',message:'Controlled engine failure'});playerJobEvent({type:'exit',code:1});return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('Whisper başarısız')&&document.getElementById('cancel').hidden"),'truthful failure');
 await parent(`player.browserTracks=[{id:'fixture-track',role:'source',path:'fixture.srt'}];
  useBrowserTrack=async(translate,id)=>{window.fixtureTrack={translate,id};player.browserTranslationTrackId=id;return {ok:true};};return true`);
 await run("document.getElementById('text').value='Videonun altyazısını Türkçeye çevir';document.getElementById('form').requestSubmit();return true");
 await until(()=>parent("return fixtureTrack?.id==='fixture-track'"),'caption command route');
 assert.equal(await parent('return fixtureStarts.length'),1,'Existing captions must not run Whisper');
 await parent("document.dispatchEvent(new CustomEvent('assistant-video-translation-state',{detail:{tabId:'fixture-video',generation:1,trackId:'fixture-track',progress:{total:8,completed:3,pending:1,queued:4}}}));return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('3/8 cümle')"),'caption progress');
 await capture('video-progress-dark');
 await parent("document.dispatchEvent(new CustomEvent('assistant-video-translation-state',{detail:{tabId:'fixture-video',generation:1,trackId:'fixture-track',progress:{total:8,completed:8,pending:0,queued:0,sourceComplete:true}}}));return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('8/8 cümle')&&document.getElementById('cancel').hidden"),'caption completion');

 await run("document.getElementById('text').value='Whisper ile videonun tamamını Türkçeye çevir';document.getElementById('form').requestSubmit();return true");
 await until(()=>parent('return fixtureStarts.length===2'),'whole video starts once');
 const full=await parent('return fixtureStarts[1]');assert.equal(full.translate,true);assert.equal(Number(full.start),0,'whole video starts at zero');assert.equal(Number(full.end),900,'whole video spans its full duration');
 assert.equal(await parent('return currentBrowserWhisperRange()'),null);
 await parent("player.job.percent=40;player.job.stage='transcribing';return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('%40')"),'actual job progress');
 await parent("player.job.assistantOutcome={loaded:true,sourceCount:3,translationCount:3};player.job.running=false;state.running=false;return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('3 kaynak satır · 3 çevrildi')&&document.getElementById('cancel').hidden"),'confirmed Whisper translation result');
 await run("document.getElementById('text').value='Whisper ile tüm videoyu 05:00–10:00 çevir';document.getElementById('form').requestSubmit();return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('Geçerli bir aralık')"),'conflicting full/range request');
 assert.equal(await parent('return fixtureStarts.length'),2,'ambiguous request never starts a whole video');
 await run("document.getElementById('text').value='Whisper 01:00–02:00 altyazı çıkar';document.getElementById('form').requestSubmit();return true");
 await until(()=>parent('return fixtureStarts.length===3'),'cancellable range job');
 await run("document.getElementById('cancel').click();return true");
 await until(()=>parent('return player.job.cancelled&&!state.running'),'controlled process acknowledged cancellation');await parent("playerJobEvent({type:'exit',code:1});return true");
 await until(()=>run("return document.getElementById('log').textContent.includes('Whisper durduruldu')&&document.getElementById('cancel').hidden"),'cancel confirmed by job exit');
 await capture('whole-video-and-cancel.png');
 await run("document.getElementById('text').value='Whisper 02:00–03:00 altyazı çıkar';document.getElementById('form').requestSubmit();return true");
 await until(()=>parent('return fixtureStarts.length===4'),'source ownership job');
 await parent("player.browserTabs[0].generation++;player.job.assistantOutcome={loaded:true,sourceCount:99,translationCount:0};return true");
 await until(()=>parent("return !AssistantVideoCommands.busy()"),'stale video receipt released');
 assert(await parent("return !document.getElementById('aiChatLog').textContent.includes('99 kaynak satır')"),'old video cannot be reported ready after navigation');

 win.setMinimumSize(0,0);win.setContentSize(720,680);
 await parent("window.UiLocale.set('en',false);applyUiTheme('light');return true");
 await until(()=>run("return document.documentElement.dataset.theme==='light'&&document.getElementById('suggestions').textContent.includes('Whisper only')"),'compact English actions');
 const compact=await capture('video-result-compact-light');
 const result={ok:true,out,compact,source:'synthetic YouTube identity',engine:'controlled launch and events',provider:'not called',wholeVideoClearsRange:true,ambiguousRangeRejected:true,translatedOutcome:true,cancelConfirmed:true,staleOutcomeRejected:true,nativeWindowsElectron:true};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(0);
}).catch(async error=>{try{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));fs.writeFileSync(path.join(out,'debug.json'),JSON.stringify(await w.webContents.executeJavaScript('({signal:document.getElementById("browserSignal")?.textContent,starts:window.fixtureStarts,log:document.getElementById("aiChatLog")?.textContent,running:state.running,job:player.job?.stage})')));}catch{}fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error);app.exit(1);});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Native video smoke exceeded 60 seconds');app.exit(2);},60000).unref();
