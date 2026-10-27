'use strict';
// Native main/preload/renderer; controlled capture chooser and backend acceptance.
// No system audio, real model, GPU or external site is used.
const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','live-asr-owner648',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setPath('downloads',out);app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const handle=ipcMain.handle.bind(ipcMain);let starts=0;const stops=[];
ipcMain.handle=(name,fn)=>handle(name,name==='browser:liveAsr:start'?async()=>({ok:true,sessionId:'controlled-'+(++starts),model:'small'}):name==='browser:liveAsr:stop'?async(e,p)=>{stops.push(p?.sessionId);return fn(e,p);}:fn);
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await wait(40);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
 session.defaultSession.protocol.handle('https',()=>Response.error());
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1280,900);win.showInactive();const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run(`await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await openPlayer();setWorkspaceMode('browser',false);return true`);
 await until(()=>run(`return !!player.browserActiveTabId && !!browserTabState()`),'browser tab');
 await run(`openAppDialog=async()=>true;window.__picked=0;window.__stopped=0;navigator.mediaDevices.getDisplayMedia=()=>{window.__picked++;return new Promise(resolve=>window.__pickResolve=resolve);};window.__finishPick=()=>{const audio={stop(){window.__stopped++;},addEventListener(){}},video={stop(){window.__stopped++;}};window.__pickResolve({getTracks:()=>[audio,video],getAudioTracks:()=>[audio],getVideoTracks:()=>[video]});};return true`);
 const results=[];
 for(const [index,phase] of ['stop','navigate','backend'].entries()){
  await run(`void toggleBrowserLiveAsr();return true`);await until(()=>run(`return window.__picked===${index+1}`),'chooser '+phase);
  assert.equal(await run(`return player.browserLiveAsrStarting`),true);
  if(phase==='stop'){
   await run(`setSettingsPage('browser-subtitles');setSettingsDrawer(true);document.getElementById('browserLiveAsr').scrollIntoView({block:'center'});return true`);
   for(const [locale,theme] of [['tr','dark'],['en','light']]){
    await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');return true`);await wait(120);
    const label=await run(`return document.getElementById('browserLiveAsr').textContent`);assert.match(label,locale==='tr'?/iptal/:/Cancel/);
    assert(await run(`const n=document.getElementById('browserLiveAsr'),r=n.getBoundingClientRect();return n.checkVisibility() && r.width>40 && r.height>20 && r.top>=0 && r.bottom<=innerHeight`),'Cancel control is actually visible');
    assert(await run(`return !document.getElementById('browserLiveAsr').disabled`),'Cancel control remains enabled');
    fs.writeFileSync(path.join(out,'pending-'+locale+'-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   }
   await run(`document.getElementById('browserLiveAsr').click();return true`);
   assert(await run(`return player.browserLiveAsrStartIntent.cancelled`),'Real button click cancels before chooser returns');
  }else if(phase==='navigate')await run(`browserTabState().generation++;player.mediaKey+='-next';return true`);
  else win.webContents.send('browser:event',{type:'live-asr-state',active:false,sessionId:'controlled-'+starts,message:'Controlled backend exit'});
  await wait(60);await run(`window.__finishPick();return true`);
  await until(()=>run(`return !player.browserLiveAsrStarting`),'finished '+phase);
  assert(await run(`return !player.browserLiveAsrActive && !player.browserLiveAsrStream && !player.browserLiveAsrCapture`),'no revived capture '+phase);
  results.push({phase,tracksStopped:await run('return window.__stopped')});
 }
 assert.equal(starts,3);assert(stops.every(id=>/^controlled-\d+$/.test(id)));assert(results.every((r,i)=>r.tracksStopped===(i+1)*2));
 console.log(JSON.stringify({ok:true,out,starts,stops,results}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
