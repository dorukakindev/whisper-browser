'use strict';
// Actual isolated Windows main/preload/renderer + test-owned Python parent/grandchild.
// Only the helper's deadline timer is manually fired; process termination is real.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),i=process.argv.indexOf('--python');assert(i>=0,'--python required');const python=path.resolve(process.argv[i+1]);assert(fs.existsSync(python));
const out=path.join(root,'.uiprev','caption-stop',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,inputDir:out,ui:{uiLocale:'en',uiTheme:'dark'}}));
global.fetch=async()=>{throw Error('Controlled caption-stop test: external requests disabled');};
let ledger;const jobsModule=require('../src/assistant-jobs'),create=jobsModule.createJobs;jobsModule.createJobs=options=>(ledger=create(options));
const rawSpawn=cp.spawn,rawTimeout=setTimeout,owned=[],deadlines=new Map();let armed=false,capturing=null;
const source="import subprocess,sys,json,time; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)'],creationflags=subprocess.CREATE_NO_WINDOW); print(json.dumps({'type':'log','message':'Controlled helper ready','fixtureChildPid':p.pid}),flush=True); time.sleep(120)";
cp.spawn=(exe,args,options)=>{
 if(!armed||!args?.some(a=>String(a).endsWith('media.py'))||!args.includes('subs')&&!args.includes('probe'))return rawSpawn(exe,args,options);
 armed=false;const proc=rawSpawn(python,['-u','-c',source],options),entry={proc,kind:args.includes('probe')?'probe':'subs',grandchild:null,beforeClose:null,closed:false};owned.push(entry);capturing=entry;
 let buf='';proc.stdout.on('data',chunk=>{buf+=String(chunk);const index=buf.indexOf('\n');if(index>=0){try{entry.grandchild=JSON.parse(buf.slice(0,index)).fixtureChildPid;}catch{}}});
 proc.once('close',()=>{entry.beforeClose=ledger.snapshot().jobs.find(j=>j.id===proc.assistantJobId)?.state;entry.closed=true;});return proc;
};
global.setTimeout=(fn,ms,...args)=>{if(capturing&&ms===(capturing.kind==='probe'?30000:300000)){deadlines.set(capturing,fn);capturing=null;return {unref(){}};}return rawTimeout(fn,ms,...args);};
const wait=ms=>new Promise(r=>rawTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(40);}throw Error('Timeout: '+label);}
const gone=pid=>{try{process.kill(pid,0);return false;}catch(e){if(e.code==='ESRCH')return true;throw e;}};
let win,view;require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await parent('await initialSettingsReady;return true');win.setContentSize(1440,1000);win.showInactive();
 const results=[];
 for(const mode of ['deadline','explicit-stop','probe-deadline']){
  armed=true;const count=owned.length;
  const invocation=mode==='probe-deadline'?"window.api.probeYoutube('https://www.youtube.com/watch?v=abcdefghijk')":"window.api.downloadYoutubeSubs({url:'https://www.youtube.com/watch?v=abcdefghijk',lang:'en',inputDir:"+JSON.stringify(out)+"})";
  await parent('window.captionStopResult=null;window.captionStopTask='+invocation+'.then(result=>window.captionStopResult=result);return true');
  await until(()=>owned.length>count&&owned.at(-1).grandchild&&deadlines.has(owned.at(-1)),'actual child and grandchild ready');
  const entry=owned.at(-1),id=entry.proc.assistantJobId;assert(id);assert.equal(ledger.snapshot().jobs.find(j=>j.id===id).state,'running');const began=Date.now();
  if(mode.includes('deadline'))deadlines.get(entry)();
  else{const result=await parent('return window.api.cancelAssistantJob({id:'+JSON.stringify(id)+'})');assert.equal(result.status,'accepted');}
  await until(()=>entry.closed,'actual helper close');
  await until(()=>gone(entry.grandchild),'actual grandchild exit');
  await until(()=>parent('return !!window.captionStopResult'),'IPC result after closure');
  const result=await parent('return window.captionStopResult'),row=ledger.snapshot().jobs.find(j=>j.id===id);
  assert.equal(entry.beforeClose,'cancelling','Ledger cannot become terminal before the native close event');assert.equal(result.ok,false);
  if(mode.includes('deadline')){assert.equal(result.code,'timeout');assert.equal(row.state,'failed');assert.equal(row.failureCode,'timeout');assert(result.error.includes('timed out'));}
  else{assert.equal(result.cancelled,true);assert.equal(result.error,'Cancelled.');assert.equal(row.state,'stopped');}
  results.push({mode,elapsedMs:Date.now()-began,beforeClose:entry.beforeClose,helperClosed:entry.closed,grandchildGone:gone(entry.grandchild),state:row.state,failureCode:row.failureCode,result:{ok:result.ok,code:result.code,cancelled:result.cancelled,error:result.error}});
 }
 view=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(view);const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run("document.getElementById('bubble').click();document.getElementById('jobs').open=true;return true");
 await until(()=>run("return document.getElementById('jobRows').textContent.includes('timed out')"),'timeout reason in Jobs');
 await wait(200);fs.writeFileSync(path.join(out,'caption-stop-jobs-en-dark.png'),(await view.webContents.capturePage()).toPNG());
 const result={ok:true,results,processTree:'real Windows Python parent/grandchild for each helper; timeout callback accelerated, kill and close not mocked',limits:'No live YouTube/model/Whisper/GPU; no real 5-minute wait; failed-stop retry is unit-controlled'};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));app.exit(0);
}).catch(error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'error.txt'),error.stack);for(const entry of owned){for(const pid of [entry.proc.exitCode===null?entry.proc.pid:null,entry.grandchild])if(pid&&!gone(pid))rawSpawn('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true});}rawTimeout(()=>app.exit(1),500);});
rawTimeout(()=>{console.error('Caption native stop exceeded 55 seconds');for(const entry of owned)if(entry.proc.exitCode===null)rawSpawn('taskkill',['/PID',String(entry.proc.pid),'/T','/F'],{windowsHide:true});app.exit(2);},55000).unref();
