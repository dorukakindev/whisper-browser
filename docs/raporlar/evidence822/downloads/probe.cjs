'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const cp=require('node:child_process'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
let ROOT=__dirname; while(!fs.existsSync(path.join(ROOT,'src','main.js'))) {const p=path.dirname(ROOT);if(p===ROOT)throw Error('repo not found');ROOT=p;}
const OUT=path.resolve(process.env.AUDIT822_OUT||path.join(ROOT,'.uiprev/audit822-downloads-'+Date.now()));
fs.mkdirSync(OUT,{recursive:true});
const main=fs.readFileSync(path.join(ROOT,'src/main.js'),'utf8'),renderer=fs.readFileSync(path.join(ROOT,'src/renderer/renderer.js'),'utf8'),preload=fs.readFileSync(path.join(ROOT,'src/preload.js'),'utf8');
function between(source,start,end){const a=source.indexOf(start);assert(a>=0,start);const b=source.indexOf(end,a);assert(b>a,end);return source.slice(a,b);}
function hash(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
const python=path.join(ROOT,'backend/venv/Scripts/python.exe'),ffmpeg=process.env.AUDIT822_FFMPEG||'ffmpeg',ffprobe=process.env.AUDIT822_FFPROBE||'ffprobe';
const oldPath=path.join(OUT,'existing.mp4');
let made=cp.spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=160x90:r=10:d=2','-c:v','libx264','-pix_fmt','yuv420p',oldPath],{encoding:'utf8',windowsHide:true});assert.equal(made.status,0,made.stderr);
function duration(file){let r=cp.spawnSync(ffprobe,['-v','error','-show_entries','format=duration','-of','json',file],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return Number(JSON.parse(r.stdout).format.duration);}
const beforeHash=hash(oldPath),beforeDuration=duration(oldPath), handlers=new Map(),signals=[],logs=[],spawnCalls=[],backendEvents=[];
let selection={canceled:false,filePath:oldPath},authorized=true,dialogCalls=0,lastResult=null;
const sandbox={require,console,path,setTimeout,clearTimeout,Buffer,process,
  mediaJobs:{download:null}, appResourceRoot:()=>ROOT,resolvePython:()=>python,pythonRuntimeEnv:extra=>({...process.env,...extra}),
  spawn:(exe,args,opts)=>{const index=spawnCalls.length,trace=path.join(OUT,`helper-${index}.json`);spawnCalls.push({exe,args,trace});return cp.spawn(exe,[path.join(__dirname,'clip-helper.py'),...args.slice(1)],{...opts,env:{...opts.env,AUDIT822_ROOT:ROOT,AUDIT822_TRACE:trace}});},
  ...require(path.join(ROOT,'src/ndjson-lines')), ...require(path.join(ROOT,'src/argv-escape')),
  sanitizeProcessDetail:s=>s,writeJobLog:()=>{},terminateProcessTree:p=>p.kill(),
  ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorizedBrowserSender:()=>authorized,
  normalizeBrowserUrl:s=>s,isProtectedBrowserHost:()=>false, windowsSafeFileName:s=>s,
  dialog:{showSaveDialog:async()=>{dialogCalls++;return selection;}},dt:(tr,en)=>en,
  mainWindow:{isDestroyed:()=>false,webContents:{send:(_channel,event)=>backendEvents.push(event)}},
  player:{abA:30,abB:40,browserPageUrl:'https://fixture.invalid/watch',browserPageTitle:'fixture822'},
  youtubeCookieBrowser:()=>'',setBrowserSignal:(text,ok)=>signals.push({text,ok}),logLine:(text,type)=>logs.push({text,type}),
};
vm.createContext(sandbox);
vm.runInContext(between(main,'function runMediaCommand(', '// Invidious API için basit wrapper'),sandbox);
vm.runInContext(between(main,"ipcMain.handle('browser:clip:export'", "ipcMain.handle('pdf:open'"),sandbox);
const binding=preload.match(/exportBrowserClip: (\(payload\) => ipcRenderer\.invoke\('browser:clip:export', payload\))/);assert(binding);
sandbox.ipcRenderer={invoke:async(name,payload)=>{lastResult=await handlers.get(name)({},payload);return lastResult;}};
sandbox.window={api:{exportBrowserClip:vm.runInContext(`(${binding[1]})`,sandbox)}};
vm.runInContext(between(renderer,'async function exportBrowserAbClip()', 'async function startBrowserLiveAsrCapture('),sandbox);
(async()=>{
  await sandbox.exportBrowserAbClip();
  assert.equal(lastResult.ok,true);assert.equal(lastResult.data.start,30);assert.equal(lastResult.data.end,40);
  assert.equal(hash(oldPath),beforeHash);assert.equal(duration(oldPath),2);assert.equal(signals.at(-1).ok,true);
  const stale={result:lastResult,signal:signals.at(-1),beforeHash,afterHash:hash(oldPath),beforeDuration,afterDuration:duration(oldPath),requestedDuration:10,trace:JSON.parse(fs.readFileSync(spawnCalls[0].trace,'utf8'))};
  assert(!stale.trace.calls.some(c=>c.type==='network_blocked'));
  selection={canceled:false,filePath:path.join(OUT,'fresh.mp4')};await sandbox.exportBrowserAbClip();
  assert.equal(lastResult.ok,false);assert.equal(signals.at(-1).ok,false);
  const fresh={result:lastResult,signal:signals.at(-1),trace:JSON.parse(fs.readFileSync(spawnCalls[1].trace,'utf8')),fileExists:fs.existsSync(selection.filePath)};
  assert(fresh.trace.calls.some(c=>c.type==='network_blocked'));assert.equal(fresh.fileExists,false);
  let spawns=spawnCalls.length;selection={canceled:true};await sandbox.exportBrowserAbClip();assert.equal(lastResult.canceled,true);assert.equal(spawnCalls.length,spawns);
  sandbox.player.abB=25;await sandbox.exportBrowserAbClip();assert.equal(spawnCalls.length,spawns);
  sandbox.player.abB=40;authorized=false;const denied=await handlers.get('browser:clip:export')({},{});assert.equal(denied.ok,false);assert.equal(spawnCalls.length,spawns);
  // Native DownloadItem control paths use the real manager; no new manager defect is asserted.
  const {createBrowserDownloads}=require(path.join(ROOT,'src/browser-downloads')),session=new EventEmitter();
  class Item extends EventEmitter{paused=false;getFilename(){return 'fixture.m4b';}setSaveDialogOptions(){}getSavePath(){return oldPath;}getTotalBytes(){return 100;}getReceivedBytes(){return 10;}isPaused(){return this.paused;}canResume(){return true;}pause(){this.paused=true;}resume(){this.paused=false;this.emit('updated',{},'progressing');}cancel(){this.emit('done',{},'cancelled');}}
  const manager=createBrowserDownloads({publish:()=>{},exists:()=>true,reveal:()=>{},delay:1});manager.attach(session);const item=new Item();session.emit('will-download',{preventDefault(){throw Error('unexpected admission rejection');}},item);const id=manager.snapshot().items[0].id;
  assert(manager.action(id,'pause').ok);assert(manager.action(id,'resume').ok);item.emit('done',{},'completed');assert.equal(manager.activeCount(),0);assert(manager.action(id,'open-player').ok);assert.equal(item.listenerCount('updated'),0);
  const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'),'utf8'));
  const reviewed=registry.scenarios.filter(r=>['F43','F44','F48'].includes(r.family));assert.equal(reviewed.length,60);
  fs.writeFileSync(path.join(OUT,'registry-reviewed.json'),JSON.stringify({reviewedCount:reviewed.length,rows:reviewed},null,2));
  const result={sourceRevision:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),newBugs:1,stale,fresh,controls:{saveCanceledNoSpawn:true,invalidRangeNoSpawn:true,unauthorizedNoSpawn:true,nativeManagerPauseResumeCompletedCleanup:true},dialogCalls,spawnCount:spawnCalls.length,limits:'Real renderer/preload/handler/runMediaCommand/media.main/yt-dlp process_ie_result; controlled authorization, dialog, URL policies, extractor metadata; new-file network is deliberately blocked. Existing fixture is real FFmpeg MP4. No live Electron/dialog/site or source decoding.'};
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
