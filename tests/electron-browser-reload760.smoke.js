'use strict';
// Real native navigation/reload and HTML5 decoder; a local YouTube-shaped page,
// not a live YouTube site. Dialog/plan/latest replies are deliberately delayed.
const {app,BrowserWindow,ipcMain,session,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','browser-reload760-'+Date.now()),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
global.fetch=async()=>{throw Error('Native reload acceptance: remote fetch disabled');};
const ffmpeg=require('./media-runtime').findMediaTool('ffmpeg');assert(ffmpeg,'FFmpeg required');
const {spawnSync}=require('node:child_process'),videoFile=path.join(out,'synthetic.mp4'),audioFile=path.join(out,'synthetic.wav');
function make(args){const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(result.status,0,result.stderr);}
make(['-f','lavfi','-i','color=c=0x17191c:s=640x360:r=25:d=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=12','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',videoFile]);
make(['-f','lavfi','-i','sine=frequency=660:sample_rate=24000:duration=12','-ac','1',audioFile]);
const media=fs.readFileSync(videoFile);
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
let win,view;const evidence={liveYoutube:false,realNavigation:true,realMediaDecoder:true,controlledDeferredReplies:true};
app.whenReady().then(async()=>{
 await session.fromPartition('persist:whisper-browser').protocol.handle('https',request=>{
  if(new URL(request.url).pathname==='/fixture.mp4'){
   const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range')||'');
   const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),media.length-1):media.length-1;
   if(start>end||start>=media.length)return new Response(null,{status:416,headers:{'content-range':'bytes */'+media.length}});
   const headers={'content-type':'video/mp4','content-length':String(end-start+1),'accept-ranges':'bytes'};
   if(match)headers['content-range']=`bytes ${start}-${end}/${media.length}`;
   return new Response(new Uint8Array(media.subarray(start,end+1)),{status:match?206:200,headers});
  }
  return new Response('<!doctype html><meta charset="utf-8"><title>Native reload fixture</title><style>body{margin:0;background:#101113;color:white;font:16px sans-serif}h1{font-size:18px;padding:20px}video{display:block;width:min(900px,95vw);margin:auto}</style><h1>Sentetik video · gerçek tarayıcı yeniden yükleme</h1><video controls muted autoplay playsinline src="/fixture.mp4"></video>',{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');win.setContentSize(1280,950);win.showInactive();
 const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);
 await run(`await initialSettingsReady;document.getElementById('openPlayer').click();setWorkspaceMode('browser',false);return true`);
 await until(()=>run(`return !!player.browserActiveTabId&&!player.browserWorkspaceShowBusy`),'browser');
 await run(`return navigateBrowser('https://www.youtube.com/watch?v=jNQXAC9IVRw')`);
 await until(()=>{view=win.contentView.children.find(v=>v.webContents?.getURL().startsWith('https://www.youtube.com/watch'));return view;},'native page');
 async function ready(){await until(()=>view.webContents.executeJavaScript(`!!document.querySelector('video')&&document.querySelector('video').readyState>=3`),'video decoder');await until(()=>run(`return BrowserDubAudioUI.context().hasMedia`),'renderer media context');}
 await ready();await run(`document.getElementById('browserWhisperRangeSettings').click();document.getElementById('browserWhisperRangeEnabled').checked=true;document.getElementById('browserWhisperRangeStart').value='0:02';document.getElementById('browserWhisperRangeEnd').value='0:06';document.getElementById('browserWhisperRangeApply').click();return true`);assert.deepEqual(await run('return currentBrowserWhisperRange()'),{start:2,end:6});evidence.initial=await run('return BrowserDubAudioUI.context()');
 async function reload(){const prior=await run('return BrowserDubAudioUI.context()');await run(`return browserCommand('reload')`);await until(()=>run(`return BrowserDubAudioUI.context().generation!==${JSON.stringify(prior.generation)}`),'new real generation');await ready();const next=await run('return BrowserDubAudioUI.context()');assert.equal(next.source,prior.source);assert.equal(next.tabId,prior.tabId);assert.deepEqual(next.subtitleRange,{start:2,end:6});evidence.reloads=(evidence.reloads||[]).concat([{before:prior.generation,after:next.generation}]);}
 let picker,plan,lookup,holdLookup=false;
 for(const channel of ['dub:config','dub:latest','dialog:openFile','dub:plan'])ipcMain.removeHandler(channel);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true}));ipcMain.handle('dub:latest',()=>holdLookup?new Promise(resolve=>lookup=resolve):({ok:true,output:null}));ipcMain.handle('dialog:openFile',()=>new Promise(resolve=>picker=resolve));ipcMain.handle('dub:plan',()=>new Promise(resolve=>plan=resolve));
 await run(`document.getElementById('browserDubGenerate').click();return true`);await until(()=>run(`return document.getElementById('dubGeneratorDialog').open&&!document.getElementById('dubChooseSrt').disabled`),'studio');
 await run(`document.getElementById('dubChooseSrt').click();return true`);await until(()=>picker,'picker');await reload();picker('C:/fixture/old.srt');await until(()=>run(`return !document.getElementById('dubChooseSrt').disabled`),'picker settles');assert.equal(await run(`return document.getElementById('dubSrtName').textContent`),'—');evidence.oldPickerRejected=true;
 picker=null;await run(`document.getElementById('dubChooseSrt').click();return true`);await until(()=>picker,'new picker');picker('C:/fixture/current.srt');await until(()=>run(`return document.getElementById('dubSrtName').textContent==='current.srt'`),'current SRT');await run(`document.getElementById('dubPlanPrepare').click();return true`);await until(()=>plan,'plan');await reload();await run(`document.getElementById('dubGeneratorDetails').textContent='Güncel oturum';return true`);plan({ok:false,error:'Old plan error'});await until(()=>run(`return !document.getElementById('dubPlanPrepare').disabled`),'plan settles');assert.equal(await run(`return document.getElementById('dubGeneratorDetails').textContent`),'Güncel oturum');evidence.oldPlanErrorRejected=true;
 holdLookup=true;await run(`document.getElementById('browserDubGenerate').click();return true`);await until(()=>lookup,'latest lookup');await reload();lookup({ok:true,output:{name:'Old voice',url:'file:///old.wav',range:{start:40,end:50},quality:{groups:[]}}});await wait(200);assert.equal(await run(`return document.getElementById('dubGeneratedPreview').getAttribute('src')`),null);evidence.oldLookupRejected=true;
 await run(`document.getElementById('dubGeneratorDialog').close();return true`);await wait(200);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[audioFile]});
 const asset=await run(`return api.choosePlaybackAudio()`);assert(asset.ok,asset.error);
 assert(await run(`window.reloadExpected=BrowserDubAudioUI.context();return BrowserDubAudioUI.attachGenerated(${JSON.stringify(asset.output)},reloadExpected)`));
 await until(()=>run(`return document.getElementById('browserDubAudio').readyState>=3`),'WAV decoder');
 await run(`return browserCommand('pause')`);await until(()=>view.webContents.executeJavaScript(`document.querySelector('video').paused`),'source paused before seek');const seek=await run(`return browserCommand('seek',3)`);evidence.seek=seek;await until(()=>view.webContents.executeJavaScript(`document.querySelector('video').paused&&Math.abs(document.querySelector('video').currentTime-3)<.15`),'paused source seeks to requested time');evidence.pausedSeekConfirmed=true;await run(`return browserCommand('play')`);
 await until(()=>run(`return !document.getElementById('browserDubAudio').paused&&document.getElementById('browserDubAudio').currentTime>1`),'native dub play');
 assert(view.webContents.isAudioMuted(),'Source tab is muted while dub plays');
 const playing=await run(`return {reportedVideoTime:player.browserTime,audio:document.getElementById('browserDubAudio').currentTime,paused:document.getElementById('browserDubAudio').paused}`);playing.actualVideoTime=await view.webContents.executeJavaScript(`document.querySelector('video').currentTime`);assert(Math.abs(playing.audio-playing.actualVideoTime)<.65,JSON.stringify(playing));
 await reload();await until(()=>run(`return document.getElementById('browserDubAudio').paused`),'old dub stops after real reload');
 assert.equal(view.webContents.isAudioMuted(),false,'New original source is not left muted');
 evidence.realWavPlayback={...playing,reloadStoppedAudio:true,tabMuteRestored:true};
 evidence.adGuard=await view.webContents.executeJavaScript(`({active:!!window.__whisperYoutubeAdGuard?.active,videoTime:document.querySelector('video').currentTime,readyState:document.querySelector('video').readyState})`);
 assert(evidence.adGuard.active,'Ad guard must remain enabled');
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));app.exit(0);
}).catch(async e=>{console.error(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message,...evidence},null,2));try{if(win)fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());}catch{}app.exit(1);});setTimeout(()=>app.exit(2),120000).unref();
