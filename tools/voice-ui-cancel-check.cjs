'use strict';
// Actual production UI/IPC/GPU acceptance in a disposable native profile.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const assert=require('node:assert/strict'),{randomInt}=require('node:crypto');
const {terminateProcessTreeAndWait}=require('../src/process-lifecycle');
if(!process.argv.includes('--run-real-voice-ui-cancel')){console.error('Explicit --run-real-voice-ui-cancel required');app.exit(2);return;}
function arg(name){const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],name+' required');return path.resolve(process.argv[i+1]);}
const engine=arg('--engine'),reference=arg('--reference'),transcript=arg('--transcript'),video=arg('--video');
for(const file of [reference,transcript,video,path.join(engine,'.venv','Scripts','python.exe')])assert(fs.statSync(file).isFile());
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','voice-ui-cancel',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;process.env.HF_HUB_OFFLINE='1';process.env.PYTHONUTF8='1';
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const source=path.join(out,'Sentetik arayüz kabul.srt'),number=randomInt(10000,99999);
fs.writeFileSync(source,`\uFEFF1\n00:00:00,000 --> 00:00:40,000\nBu arayüz denemesinde uzun bir cümleyi seslendiriyoruz. Bugün birlikte kitap okuyup yeni hikayeler öğreneceğiz. Her cümlenin doğal akışını korumak için dikkatli çalışıyoruz. Deneme numarası ${number}.\n`);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,outputDir:path.join(out,'transcribed'),ui:{uiLocale:'tr',uiTheme:'dark'}}));
fs.writeFileSync(path.join(profile,'dub-settings.json'),JSON.stringify({engine,reference,transcript,keepEngine:true,verification:'detailed',timingMode:'video',profile:'quality',concurrency:4,grouping:'akici',naturalSpeech:false,autoFit:false}));
const originalSpawn=cp.spawn,hosts=[],events=[],transcribeEvents=[],whisperSpawns=[];
cp.spawn=function(...args){
 if(Array.isArray(args[1])&&args[1].some(a=>typeof a==='string'&&/[\\/]transcribe\.py$/.test(a)))whisperSpawns.push({voiceHostStillAlive:hosts.some(h=>h.exitCode==null&&h.signalCode==null)});
 const child=originalSpawn(...args);if(Array.isArray(args[1])&&args[1].some(a=>typeof a==='string'&&a.endsWith('dub_worker.py')))hosts.push(child);return child;
};
let picked=source;
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[picked]});
global.fetch=async()=>{throw Error('Synthetic acceptance background network disabled');};
let win,run,finished=false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,ms=30000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await pause(80);}throw Error('Timeout: '+label);}
async function snapshot(name){
 // A done IPC can precede the result dialog's first painted animation frame.
 // Wait for finite transitions, without waiting forever for progress pulses.
 await run("await Promise.race([Promise.allSettled(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished)),new Promise(r=>setTimeout(r,800))]);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
async function clean(){if(run)try{await run('return api.cancelDub()');}catch{}for(const host of hosts)if(host.exitCode==null&&host.signalCode==null)await terminateProcessTreeAndWait(host,{spawn:originalSpawn});}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1280,960);win.showInactive();
 const send=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,...args)=>{if(channel==='dub:event')events.push(args[0]);if(channel==='transcribe:event')transcribeEvents.push(args[0]);return send(channel,...args);};
 run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run("document.getElementById('dubMainOpen').click();return true");
 await until(()=>run("return document.getElementById('dubGeneratorDialog').open"),'voice dialog');
 await run("document.getElementById('dubChooseSrt').click();return true");
 await until(()=>run("return !document.getElementById('dubGeneratorStart').disabled"),'SRT/reference ready');
 await run("document.getElementById('dubGeneratorStart').click();return true");
 await until(()=>events.some(e=>e.type==='activity'&&e.stage==='synthesis'),'real synthesis',120000);
 assert.equal(hosts.length,1);
 const busy=await run("return {dub:await api.startDub({id:'blocked-second-job'}),whisper:await api.startTranscribe({})}");
 assert.equal(busy.dub.ok,false);assert.match(busy.dub.error,/üretim|iş|finish|wait/i);assert.equal(busy.whisper.busy,true);
 assert.equal(hosts.length,1,'rejected duplicate must not create a second engine');
 const before=await run("return {startDisabled:document.getElementById('dubGeneratorStart').disabled,stopDisabled:document.getElementById('dubGeneratorCancel').disabled}");
 assert.deepEqual(before,{startDisabled:true,stopDisabled:false});
 await run("document.getElementById('dubGeneratorCancel').scrollIntoView({block:'center'});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 await snapshot('synthesis');
 const bounds=await run("const r=document.getElementById('dubGeneratorCancel').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}");
 const started=performance.now();
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...bounds});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...bounds});
 await until(()=>events.some(e=>e.type==='cancelled'),'UI cancelled',15000);
 await until(()=>run("return document.getElementById('dubGeneratorStart').disabled===false&&document.getElementById('dubGeneratorCancel').disabled===true"),'controls restored');
 const stopped=await run("return {status:document.getElementById('dubGeneratorStatus').textContent,details:document.getElementById('dubGeneratorDetails').textContent}");
 assert.match(stopped.status,/Durduruldu|Stopped/);assert(!alive(hosts[0].pid));
 await snapshot('cancelled');
 const stopMilliseconds=Math.round(performance.now()-started);
 await run("document.getElementById('dubGeneratorStart').click();return true");
 await until(()=>events.some(e=>e.type==='done'),'restart done',240000);
 const done=events.find(e=>e.type==='done');assert(done.path&&fs.statSync(done.path).size>44);assert.equal(hosts.length,2);
 await until(()=>run("return !document.getElementById('dubGeneratorStart').disabled"),'ready again');await snapshot('completed');
 assert(alive(hosts[1].pid),'ready voice engine must still exist before the next task');
 picked=video;
 await run(`document.getElementById('dubGeneratorDialog').close();await initialSettingsReady;const files=await selectVideoWithGeneration();if(!files?.length)throw Error('Fixture not selected');setInputFile(files[0]);state.outputDir=${JSON.stringify(path.join(out,'transcribed'))};for(const [id,value] of Object.entries({model:'tiny',engine:'faster',device:'cpu',computeType:'int8',language:'en',formats:'srt,ass,json',splitMode:'none',clipStart:'0:02',clipEnd:'0:10'}))document.getElementById(id).value=value;for(const id of ['translate','translateForSpeech','vadFilter','diarize','llmPostprocess','translateCache','resume'])document.getElementById(id).checked=false;const problem=optsProblemInfo(buildOptsFromUI());if(problem)throw Error(problem.message);document.getElementById('startBtn').click();return true`);
 await until(()=>transcribeEvents.some(e=>e.type==='done'),'Whisper after warm voice',120000);
 assert.equal(whisperSpawns.length,1);assert.equal(whisperSpawns[0].voiceHostStillAlive,false,'Whisper cannot spawn until the warm voice host has closed');
 assert(!alive(hosts[1].pid));
 await snapshot('whisper-after-voice');
 await clean();assert(hosts.every(host=>!alive(host.pid)));
 const result={complete:true,realGpu:true,nativePointerStop:true,duplicateDubRejected:true,whisperBusyRejected:true,hostCount:hosts.length,controlsBefore:before,stopped,stopMilliseconds,restartQuality:done.quality,whisperAfterVoice:{completed:true,device:'cpu',model:'tiny',range:[2,10],spawnedAfterVoiceHostClosed:true},observedHostsClosed:true,limits:'Synthetic local SRT/reference/video. UI and IPC through production app. Not YouTube, OS shutdown, OOM, every cancellation stage, GPU Whisper overlap, or a human voice-quality judgment.'};
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'events-private.json'),JSON.stringify(events,null,2));
 finished=true;console.log(JSON.stringify({out,complete:true,stopMilliseconds}));app.exit(0);
}).catch(async error=>{await clean();console.error(error.stack);fs.writeFileSync(path.join(out,'events-private.json'),JSON.stringify(events,null,2));try{await snapshot('failure');}catch{}app.exit(1);});
setTimeout(()=>{if(!finished)void clean().finally(()=>app.exit(2));},420000).unref();
