'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const media=require('../src/browser-media-controller');
const {createAssistantOverlay}=require('../src/assistant-overlay');
const out=path.resolve(__dirname,'../tmp/independent-flow-audit/native');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(out,'profile-'+process.pid));app.commandLine.appendSwitch('disable-gpu');
let win;const rows=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 try{
  win=new BrowserWindow({show:false,width:900,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.setAudioMuted(true);
  const wc=win.webContents,run=s=>wc.executeJavaScript(s,true);
  async function fresh(html){await wc.loadURL('data:text/html,'+encodeURIComponent('<style>video{width:320px;height:180px}</style>'+html));await run(media.buildBrowserMediaProbeScript());}
  await fresh('<video id="v"></video>');
  await run(media.buildBrowserMediaPreferenceScript({brightness:1.2}));
  await run(media.buildBrowserMediaCommandScript('dub-rate',{rate:.8,baseRate:1}));
  await run('window.saved=document.getElementById("v");saved.style.filter="blur(2px)";saved.playbackRate=1.7;saved.remove();true');
  await wait(50);let state=await run('({filter:saved.style.filter,rate:saved.playbackRate})');assert.deepEqual(state,{filter:'blur(2px)',rate:1.7});
  await run('document.body.append(saved);true');await wait(50);await run(media.buildBrowserMediaPreferenceScript({}));
  assert.equal(await run('saved.style.filter'),'blur(2px)');rows.push({flow:'detach-site-ownership-reattach',passed:true,...state});
  await fresh('<video id="old"></video><video id="next" muted></video>');
  await run('window.old=document.getElementById("old");__whisperMediaController.muteForAd(old);old.remove();true');await wait(50);
  await run(media.buildBrowserMediaProbeScript());assert.equal(await run('document.getElementById("next").muted'),true);
  rows.push({flow:'ad-mute-replacement',passed:true});
  await fresh('<video id="v"></video><iframe srcdoc="<style>video{width:320px;height:180px}</style><video id=other></video>"></iframe>');
  for(let i=0;i<30&&wc.mainFrame.framesInSubtree.length<2;i++)await wait(30);
  const child=wc.mainFrame.framesInSubtree.find(f=>f!==wc.mainFrame);assert(child);
  const source=fs.readFileSync(path.resolve(__dirname,'../src/main.js'),'utf8'),start=source.indexOf("ipcMain.handle('browser:command'"),end=source.indexOf("ipcMain.handle('browser:adblock:getState'",start);
  let handler,firstCalls=0,otherMutations=0;
  const first={executeJavaScript:async script=>{if(++firstCalls===2)await run('document.getElementById("v").outerHTML="<video id=replacement></video>";true');return run(script);}};
  const second={executeJavaScript:async script=>{if(script.includes('const command ='))otherMutations++;return child.executeJavaScript(script,true);}};
  const owner={},tab={id:'native-fixture'};
  const ctx=vm.createContext({ipcMain:{handle:(_name,fn)=>handler=fn},authorizedBrowserSender:()=>true,activeRequestedBrowserTab:()=>tab,
   mainWindow:{webContents:owner},browserView:{webContents:wc},browserStateGeneration:1,browserEventContext:()=>({tabId:tab.id}),browserNavigationCapabilities:()=>({}),browserNavigationState:()=>({}),
   browserFrames:()=>[first,second],buildBrowserMediaProbeScript:media.buildBrowserMediaProbeScript,buildBrowserMediaCommandScript:media.buildBrowserMediaCommandScript,
   dt:(_tr,en)=>en,withTimeout:p=>p,isCurrentBrowserContext:()=>true,rankBrowserMediaCandidates:rows=>rows});
  vm.runInContext(source.slice(start,end),ctx);
  const command=await handler({sender:owner},{tabId:tab.id,command:'loop'});assert.equal(command.stale,true);assert.equal(otherMutations,0);
  assert.equal(await child.executeJavaScript('document.getElementById("other").loop',true),false);
  rows.push({flow:'native-frame-source-change-command',passed:true,stale:command.stale,otherMutations});
  // Navigation creates a new controller and rejects the old document token.
  const token=(await run(media.buildBrowserMediaProbeScript())).docToken;
  await fresh('<video id="after-nav"></video>');assert((await run(media.buildBrowserMediaCommandScript('loop',0,token))).stale);
  assert.equal(await run('document.getElementById("after-nav").loop'),false);rows.push({flow:'navigation-stale-token-negative',passed:true});
  const captureStart=source.indexOf('async function captureBrowserFullPage('),captureEnd=source.indexOf('\nasync function captureBrowserVideoFrame(',captureStart);
  const captureContext=vm.createContext({Buffer,nativeImage,browserDebuggerAttachPromise:null,browserDebuggerReady:false,browserDebuggerAttachAttempts:new WeakMap(),browserFullPageCaptureOwners:new WeakMap()});
  vm.runInContext(source.slice(captureStart,captureEnd),captureContext);
  win.showInactive();await wait(100);
  const positiveCapture=await captureContext.captureBrowserFullPage(wc);assert(!positiveCapture.isEmpty());
  const captures=await Promise.allSettled([captureContext.captureBrowserFullPage(wc),captureContext.captureBrowserFullPage(wc)]);
  rows.push({flow:'concurrent-full-page-capture',outcomes:captures.map(r=>r.status==='fulfilled'?{status:r.status,empty:r.value.isEmpty()}:{status:r.status,error:r.reason.message})});
  assert(captures.every(r=>r.status==='fulfilled'&&!r.value.isEmpty()),JSON.stringify(rows.at(-1)));
  const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer/renderer.js'),'utf8');
  const keyStart=renderer.indexOf("document.addEventListener('keydown'",renderer.indexOf('// Klavye: oynatıcı açıkken'));
  const keyEnd=renderer.indexOf('\n});',keyStart)+4;assert(keyStart>0&&keyEnd>keyStart);
  await run('document.body.innerHTML="<div id=playerLayer></div><video id=playerVideo></video><dialog id=modal><button id=close>Close</button><input id=text value=ab></dialog>";window.$=id=>document.getElementById(id);window.player={workspaceMode:"player"};window._activeModal=null;window.auditCloses=0;window.closePlayer=()=>window.auditCloses++;window.closePlayerDetailsMenus=()=>{};true');
  await run(renderer.slice(keyStart,keyEnd));await run('modal.showModal();document.getElementById("close").focus();true');
  const key=async keyCode=>{wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode});await wait(40);};
  await key('Backspace');assert.equal(await run('window.auditCloses'),0);assert(await run('modal.open'));
  await run('document.getElementById("text").focus();document.getElementById("text").setSelectionRange(2,2);true');await key('Backspace');assert.equal(await run('document.getElementById("text").value'),'a');
  await key('Escape');assert.equal(await run('modal.open'),false);assert.equal(await run('window.auditCloses'),0);
  rows.push({flow:'native-modal-keyboard-edit-escape-negative',passed:true});
  createAssistantOverlay({window:win,WebContentsView,ipcMain});await wait(150);
  const overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(overlay);
  const event={sender:wc,senderFrame:wc.mainFrame};
  ipcMain.emit('assistant:modal-state',event,true);assert.equal(overlay.getVisible(),false);
  win.hide();win.setSize(940,680);assert.equal(overlay.getVisible(),false);
  ipcMain.emit('assistant:modal-state',event,false);assert.equal(overlay.getVisible(),true);
  rows.push({flow:'native-overlay-background-resize-modal-resume-negative',passed:true});
  fs.writeFileSync(path.join(out,'matrix.json'),JSON.stringify({electron:process.versions.electron,rows,limits:['Muted synthetic video elements; real audio decoding/GPU/provider not exercised','Production main command handler extracted into controlled authorization context; frames/controller/native view are actual Chromium']},null,2));
  console.log(JSON.stringify({ok:true,rows}));
 }catch(error){console.error(error.stack);process.exitCode=1;}
 finally{win?.destroy();app.exit(process.exitCode||0);}
});setTimeout(()=>app.exit(2),30000).unref();
