'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-voice',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timed out: '+label);}
// Test-only IPC boundaries prevent reading the shared production voice configuration/store.
const {ipcMain}=require('electron'),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>handle(name,name==='dub:config'?async()=>({ok:true,ready:false,reference:'fixture-voice.wav',reason:'Controlled test; engine is not started.'}):name==='dub:references'?async()=>({ok:true,activeId:'fixture-voice',references:[{id:'fixture-voice',name:'Test reference',text:'Controlled reference transcript.',url:''}],folder:''}):name==='dub:latest'?async()=>({ok:true,output:null}):fn);
require('../src/main');app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 win.setContentSize(1440,1000);win.show();win.webContents.focus();
 await run(`await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await DubGeneratorUI.prepareCurrent();return true`);
 assert(await run(`return document.getElementById('dubGeneratorDialog').open&&!!DubGeneratorUI.assistant&&!!VoiceReferenceUI&&!!AssistantVoiceActions`));
 const status=await run(`return DubGeneratorUI.assistant.state()`);assert.equal(status.subtitleReady,false);assert(!JSON.stringify(status).includes('Desktop'));
 await run(`document.getElementById('voiceReferenceRecorder').open=true;document.getElementById('voiceReferenceRecorder').scrollIntoView({block:'start'});await document.fonts.ready;return true`);await wait(350);fs.writeFileSync(path.join(out,'voice-reference-dark.png'),(await win.webContents.capturePage()).toPNG());
 win.setMinimumSize(0,0);win.setContentSize(800,760);await run(`UiLocale.set('en',false);applyUiTheme('light');document.getElementById('voiceReferenceRecorder').scrollIntoView({block:'start'});return true`);await wait(350);
 const layout=await run(`const r=document.getElementById('dubGeneratorDialog').getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,local:!document.getElementById('voiceReferenceLocal').disabled}`);assert(layout.left>=0&&layout.right<=layout.width+1);assert(layout.local);fs.writeFileSync(path.join(out,'voice-reference-light.png'),(await win.webContents.capturePage()).toPNG());
 console.log(JSON.stringify({ok:true,out,layout,limits:'Real Windows renderer and isolated profile; no model/GPU/audio generation or personal credentials.'}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),45000).unref();
