"use strict";
// Opt-in acceptance: real local GPU, authored text/reference, isolated profile.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function arg(name){const i=process.argv.indexOf(name);assert(i>=0,name+' required');return fs.realpathSync(process.argv[i+1]);}
assert(process.argv.includes('--run-real-gpu'),'Explicit --run-real-gpu is required');
const reference=arg('--reference'),transcript=arg('--transcript'),engine=arg('--engine');
const gpu=spawnSync('nvidia-smi',['--query-gpu=memory.free','--format=csv,noheader,nounits'],{encoding:'utf8',windowsHide:true});
const free=Number(gpu.stdout?.trim().split(/\r?\n/)[0]);
if(gpu.status!==0||!Number.isFinite(free)||free<9500){console.error(`BLOCKED_ENV: real book GPU acceptance preflight reserves 9500 MiB free; observed ${Number.isFinite(free)?free:'unknown'} MiB. Other jobs are never stopped.`);process.exit(3);}
const out=path.join(root,'.uiprev','book-gpu',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;process.env.HF_HUB_OFFLINE='1';process.env.PYTHONUTF8='1';
app.commandLine.appendSwitch('disable-gpu');
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
fs.writeFileSync(path.join(profile,'dub-settings.json'),JSON.stringify({reference,transcript,engine,keepEngine:false,verification:'detailed'}));
const source=path.join(out,'Sentetik kitap.txt');
const text='Kütüphanenin kapısı bu sabah erkenden açıldı. Masanın üzerinde duran eski defter, yıllardır unutulmuş bir yolculuğun hikâyesini anlatıyordu. Genç okuyucu pencerenin yanına oturdu.\n\nDışarıda yağmur yavaşça yağıyordu. Okuyucu, defterin son sayfasındaki adresi dikkatle not etti ve ertesi gün oraya gitmeye karar verdi. Yolculuğa başlamadan önce arkadaşına haber verecekti.';
fs.writeFileSync(source,text);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
const m4b=path.join(out,'Sesli kitap.m4b');dialog.showSaveDialog=async()=>({canceled:false,filePath:m4b});
global.fetch=async()=>{throw Error('Authored GPU acceptance: external network disabled');};
let win,run;const events=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(100);}throw Error('Timeout: '+label);}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 const send=win.webContents.send.bind(win.webContents);win.webContents.send=(name,...args)=>{if(name==='dub:event')events.push(args[0]);return send(name,...args);};
 run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1280,950);win.showInactive();
 const call=(action,data={})=>run('return api.mediaWorkflows('+JSON.stringify({action,...data})+')');
 const imported=await call('book-import');assert(imported.ok,imported.error);const id=imported.project.id;
 await run('await MediaWorkflowsUI.openProject('+JSON.stringify(id)+');return true');
 async function produce(retryGroup){
  const prep=await call('book-prepare',{id,chapter:0,...(retryGroup?{retryGroup}:{})});assert(prep.ok,prep.error);
  const request={...prep.request,profile:'quality',concurrency:1,verification:'detailed'};
  if(retryGroup)assert.deepEqual(request.forceGroups,[retryGroup.key]);
  const start=await run('return api.startDub('+JSON.stringify(request)+')');assert(start.ok,start.error);
  await until(()=>events.some(e=>e.id===request.id&&['done','error','cancelled'].includes(e.type)),'real book synthesis',300000);
  const terminal=events.find(e=>e.id===request.id&&['done','error','cancelled'].includes(e.type));assert.equal(terminal.type,'done',terminal.error);
  const book=await call('book-open',{id});assert(book.ok);assert.equal(book.project.chapters[0].lastOutputId,request.id,'Real output must be captured by its exact prepared book job');
  const log=JSON.parse(fs.readFileSync(terminal.logPath,'utf8'));
  return {chapter:book.project.chapters[0],terminal,metrics:log.metrics};
 }
 const first=await produce();assert(first.chapter.groups.length>=2,'Acceptance needs at least two speech groups');
 const key=first.chapter.groups.at(-1).key;
 const repaired=await produce({key,output:first.chapter.output});
 assert.equal(repaired.metrics.generated_groups,1,'Only the selected group is regenerated');
 assert.equal(repaired.metrics.cached_groups,repaired.chapter.groups.length-1,'All other speech groups are reused');
 assert.equal(repaired.chapter.groups[0].text,first.chapter.groups[0].text);
 assert(Math.abs(repaired.chapter.groups[0].end-first.chapter.groups[0].end)<.01);
 await run('await MediaWorkflowsUI.openProject('+JSON.stringify(id)+');return true');
 fs.writeFileSync(path.join(out,'real-book-review.png'),(await win.webContents.capturePage()).toPNG());
 const needsReview=repaired.chapter.groups.some(g=>g.status!=='ready');
 const exported=await call('book-export',{id,chapters:[0]});
 if(needsReview){assert.equal(exported.ok,false,'Unreviewed real speech must not bypass export gate');}
 else {
  assert(exported.ok,exported.error);assert(fs.statSync(m4b).size>1000);
  const ffprobe=require('./media-runtime').findMediaTool('ffprobe');
  const probe=spawnSync(ffprobe,['-v','error','-show_format','-show_chapters','-of','json',m4b],{encoding:'utf8',windowsHide:true});assert.equal(probe.status,0,probe.stderr);
  const data=JSON.parse(probe.stdout);assert.equal(data.chapters.length,1);assert(Number(data.format.duration)>0);
 }
 const result={complete:true,realGpu:true,groups:repaired.chapter.groups.length,firstMetrics:first.metrics,repairMetrics:repaired.metrics,
  untouchedFirstGroupTiming:true,statuses:repaired.chapter.groups.map(g=>g.status),m4bExported:exported.ok,reviewGateBlocked:needsReview,humanListening:false};
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));app.quit();
}).catch(async error=>{console.error(error.stack);try{await run('return api.cancelDub()');}catch{}app.quit();process.exitCode=1;});
setTimeout(async()=>{try{await run('return api.cancelDub()');}catch{}app.quit();process.exitCode=2;},660000).unref();
