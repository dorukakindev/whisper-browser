'use strict';
// Real isolated app and Windows parent/grandchild; synthetic backend replaces model work only.
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),at=process.argv.indexOf('--python');assert(at>=0);const python=path.resolve(process.argv[at+1]);
const out=path.join(root,'.uiprev','transcription-quit755-'+Date.now()),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'en',uiTheme:'dark'}}));
global.fetch=async()=>{throw Error('Synthetic quit acceptance: no network');};dialog.showMessageBox=async()=>({response:0});
const rawSpawn=cp.spawn,owned=[];let armed=false,grandchild=null,closed=false,quitCalls=0,closedBeforeResume=false;
const code="import subprocess,sys,json,time; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)'],creationflags=subprocess.CREATE_NO_WINDOW); print(json.dumps({'type':'log','message':'Controlled transcription ready','fixtureChildPid':p.pid}),flush=True); time.sleep(120)";
cp.spawn=(exe,args,options)=>{if(!armed||!args?.some(x=>String(x).endsWith('transcribe.py')))return rawSpawn(exe,args,options);armed=false;const proc=rawSpawn(python,['-u','-c',code],options);owned.push(proc);let buf='';proc.stdout.on('data',chunk=>{buf+=String(chunk);const i=buf.indexOf('\n');if(i>=0){try{grandchild=JSON.parse(buf.slice(0,i)).fixtureChildPid;}catch{}}});proc.once('close',()=>{closed=true;});return proc;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(50);}throw Error('Timeout: '+label);}
const gone=pid=>{try{process.kill(pid,0);return false;}catch(e){if(e.code==='ESRCH')return true;throw e;}};
require('../src/main');
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'window');const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);await run('await initialSettingsReady;return true');
 armed=true;const started=await run(`return api.startTranscribe({youtube:'https://www.youtube.com/watch?v=abcdefghijk',model:'tiny',device:'cpu',computeType:'int8',outputDir:${JSON.stringify(out)},formats:'srt'})`);assert(started.ok,JSON.stringify(started));await until(()=>grandchild,'real child ready');
 app.quit=()=>{quitCalls++;closedBeforeResume=closed;};let prevented=0;const event={preventDefault(){prevented++;}};const began=Date.now();app.emit('before-quit',event);app.emit('before-quit',event);
 assert.equal(prevented,2,'both attempts held');assert.equal(quitCalls,0,'cannot resume synchronously while child is alive');await until(()=>closed&&quitCalls>0,'child closure and resumed quit');await until(()=>gone(grandchild),'grandchild closure');assert(closedBeforeResume);assert(gone(owned[0].pid));assert.equal(quitCalls,1);
 const result={ok:true,prevented,resumedQuit:quitCalls,parentGone:true,grandchildGone:true,closedBeforeResume,elapsedMs:Date.now()-began,realWindowsTree:true,modelWork:false};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));app.exit(0);
}).catch(error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'error.txt'),error.stack);for(const proc of owned)if(proc.exitCode===null)rawSpawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true});setTimeout(()=>app.exit(1),600);});
setTimeout(()=>{for(const proc of owned)if(proc.exitCode===null)rawSpawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true});app.exit(2);},45000).unref();
