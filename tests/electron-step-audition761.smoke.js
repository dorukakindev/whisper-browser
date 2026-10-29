'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const index=process.argv.indexOf('--path');assert(index>=0,'--path required');const source=path.resolve(process.argv[index+1]);
const out=path.resolve(__dirname,'../.uiprev/step-audition761-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1200,height:860,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await win.loadFile(path.join(source,'listen.html'));win.showInactive();
 const read=s=>win.webContents.executeJavaScript(s,true);
 await read('Promise.all([...document.querySelectorAll("audio")].map(audio=>audio.readyState>=1?true:new Promise((resolve,reject)=>{audio.addEventListener("loadedmetadata",resolve,{once:true});audio.addEventListener("error",()=>reject(Error("Audio metadata unavailable")),{once:true});audio.load();})))');
 const evidence=[];
 for(const [width,zoom]of [[1200,1],[600,1.25]]){
  win.setMinimumSize(300,400);win.setContentSize(width,900);win.webContents.setZoomFactor(zoom);await wait(150);
  const metrics=await read('(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,columns:getComputedStyle(document.querySelector(".samples")).gridTemplateColumns,players:[...document.querySelectorAll("audio")].map(a=>({duration:a.duration,ready:a.readyState,width:a.getBoundingClientRect().width})),mappingClosed:!document.querySelector("details").open}))()');
  assert(!metrics.overflow);assert(metrics.mappingClosed);assert.equal(metrics.players.length,2);assert(metrics.players.every(a=>a.ready>=1&&a.duration>0&&a.width>200));
  evidence.push({width,zoom,...metrics});fs.writeFileSync(path.join(out,`audition-${width}-${zoom}.png`),(await win.webContents.capturePage()).toPNG());
 }
 fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify({ok:true,evidence},null,2));console.log(JSON.stringify({ok:true,out,evidence}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1)});setTimeout(()=>app.exit(2),20000).unref();
