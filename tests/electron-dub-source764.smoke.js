'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-source764-'+Date.now()),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Controlled ownership test: no network');};
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));require('../src/main');
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(50);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'window');const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);await run('await initialSettingsReady;return true');win.setContentSize(1280,950);win.showInactive();

 for(const channel of ['dub:config','dub:latest'])ipcMain.removeHandler(channel);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true}));ipcMain.handle('dub:latest',()=>({ok:true,output:null}));
 let picks=0,starts=0;ipcMain.removeHandler('dialog:openFile');ipcMain.handle('dialog:openFile',()=>{picks++;return 'C:/fixture/manual.srt';});
 ipcMain.removeHandler('dub:start');ipcMain.handle('dub:start',()=>{starts++;return {ok:true};});
 await run("player.subPath='C:/fixture/source.srt';player.sub2Path='C:/fixture/translation.tr.srt';player.sub2Role='translation';player.browserTracks=[{path:player.subPath},{path:player.sub2Path}];window.BrowserDubAudioUI={context:()=>({mode:'browser',tabId:'tab',mediaKey:'video',source:'video',generation:1,visible:true,hasMedia:true,subtitleRange:{start:300,end:600}})};document.getElementById('browserDubGenerate').click();return true");
 await until(()=>run("return document.getElementById('dubSrtName').textContent==='translation.tr.srt'"),'automatic translation');
 assert.equal(await run("return document.getElementById('dubRangeStart').value"),'5:00');assert.equal(await run("return document.getElementById('dubRangeEnd').value"),'10:00');assert.equal(picks,0);assert.equal(starts,0);
 await wait(200);fs.writeFileSync(path.join(out,'automatic-subtitle-tr.png'),(await win.webContents.capturePage()).toPNG());
 await run("document.getElementById('dubChooseSrt').click();return true");await until(()=>run("return document.getElementById('dubSrtName').textContent==='manual.srt'"),'manual selection');
 await run("document.getElementById('dubGeneratorDialog').close();await DubGeneratorUI.prepareCurrent();return true");assert.equal(await run("return document.getElementById('dubSrtName').textContent"),'manual.srt');
 const result={ok:true,realRendererPreloadIPC:true,controlledContext:true,translationAdopted:true,rangeInherited:true,manualPreserved:true,picks,starts,liveYoutube:false,actualGpu:false};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));app.exit(0);
}).catch(error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'error.txt'),error.stack);app.exit(1);});setTimeout(()=>app.exit(2),60000).unref();
