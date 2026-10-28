'use strict';
// Probes an authored export through the real preload/main IPC in an isolated profile.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-export-labels',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
for(const flag of ['disable-gpu','disable-renderer-backgrounding','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
const video=path.resolve(process.env.EXPORT_ACCEPTANCE_VIDEO);assert(fs.existsSync(video));
let picked=video;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[picked]});
global.fetch=async()=>{throw Error('Synthetic mix acceptance: external network disabled');};
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
let win,run;const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timeout: '+label);}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1280,900);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run("return api.selectVideo()");
 const tracks=await run("return api.probeTracks("+JSON.stringify(video)+")");
 assert(tracks.ok,JSON.stringify(tracks));
 assert.deepEqual(tracks.tracks.map(t=>t.title),['Türkçe dublaj','Original']);
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({complete:true,realMainIpc:true,tracks:tracks.tracks},null,2));
 console.log(JSON.stringify({complete:true,realMainIpc:true,labels:tracks.tracks.map(t=>t.title)}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),60000).unref();
