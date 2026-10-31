'use strict';
// Opt-in Windows acceptance: cached tiny/faster-whisper on CPU, real production
// subprocess and queue. Only speech, profile and output files are synthetic.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
assert.equal(process.platform,'win32','This acceptance uses Windows SAPI speech');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','whisper-home-continuity',Date.now()+'-'+process.pid),profile=path.join(out,'profile'),output=path.join(out,'output'),audio=path.join(out,'controlled-speech.wav');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(output,{recursive:true});app.setAppPath(root);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;process.env.HF_HUB_OFFLINE='1';process.env.PYTHONIOENCODING='utf-8';process.env.PYTHONUTF8='1';process.env.TTS_FIXTURE_OUTPUT=audio;
process.env.PATH=[path.join(root,'backend','bin'),path.resolve(root,'../../backend/bin'),process.env.PATH].join(path.delimiter);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const hub=process.env.HF_HUB_CACHE||process.env.HUGGINGFACE_HUB_CACHE||(process.env.HF_HOME?path.join(process.env.HF_HOME,'hub'):path.join(process.env.USERPROFILE,'.cache','huggingface','hub'));
assert(require('../src/model-manager').repositoryHasUsableSnapshot(path.join(hub,'models--Systran--faster-whisper-tiny')),'A usable cached tiny model is required; this test does not download it');
cp.execFileSync('powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.Speech; $speaker=[System.Speech.Synthesis.SpeechSynthesizer]::new(); $speaker.Rate=0; $speaker.SetOutputToWaveFile($env:TTS_FIXTURE_OUTPUT); $speaker.Speak(('The library is open today. We can read a book together. The window faces the garden. Please bring the blue notebook. ' * 8)); $speaker.Dispose()"],{stdio:'pipe',timeout:20000,windowsHide:true});assert(fs.statSync(audio).size>10000);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,outputDir:output,ui:{uiLocale:'en',model:'tiny',engine:'faster',device:'cpu',computeType:'int8',language:'en'}}));
global.fetch=async()=>{throw Error('Whisper Home acceptance: external fetch disabled');};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[audio]});
// Observe the actual process without changing its executable, arguments, stream,
// timing or events. This distinguishes model work from a mocked UI receipt.
const rawSpawn=cp.spawn,children=[],events=[];
cp.spawn=function(exe,args,options){const proc=rawSpawn(exe,args,options);if(args?.some(value=>String(value).endsWith('transcribe.py'))){
 const child={pid:proc.pid,exe,args:[...args],closed:false,code:null};children.push(child);let buffer='';
 proc.stdout?.on('data',chunk=>{buffer+=String(chunk);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{events.push(JSON.parse(line));}catch{}}});
 proc.once('close',code=>{child.closed=true;child.code=code;});
 }return proc;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(fn,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
let win,run;const evidence={realBackend:true,model:'tiny',engine:'faster',device:'cpu',computeType:'int8',offline:true,speech:'Windows SAPI synthetic English',cases:[]};
async function shot(name){await run('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true');await wait(100);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main app');win.setContentSize(1280,900);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run(`await initialSettingsReady;const set=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};set('model','tiny');set('engine','faster');set('device','cpu');set('computeType','int8');set('language','en');for(const id of ['translate','diarize','enableTranslation','showOriginal']){const el=document.getElementById(id);if(el?.checked)el.click();}document.getElementById('dropZone').click();return true`);
 await until(()=>run('return !!state.inputFile'),'selected normal input');await run(`document.getElementById('queueAddBtn').click();return true`);
 await until(()=>run('return state.queue.length===1'),'selected file in normal queue');
 await run(`const item=state.queue[0];Object.assign(item.opts,{model:'tiny',engine:'faster',device:'cpu',computeType:'int8',language:'en',translate:false,vadFilter:false,splitMode:'none',beamSize:1,outputDir:${JSON.stringify(output)}});setWorkspaceMode('player',false);openPlayer({video:${JSON.stringify(audio)},files:[]});return true`);
 await until(()=>run(`return document.getElementById('playerVideo').readyState>=3&&player.localPath===${JSON.stringify(audio)}`),'local speech decoder');
 const identity=()=>run('return {mode:player.workspaceMode,key:player.mediaKey,path:player.localPath,generation:player.generation}');evidence.identity=await identity();
 await run(`document.getElementById('startQueueBtn').click();return true`);
 await until(()=>children.length===1&&children[0].pid&&!children[0].closed,'real transcribe.py pending');
 const jobId=await run('return state.activeJobId');assert(jobId);evidence.jobId=jobId;
 await run(`document.getElementById('playerBack').click();return true`);
 await until(()=>run(`return document.getElementById('playerLayer').classList.contains('hidden')&&!!document.getElementById('mhResumeWorkspace')`),'Home while process pending');
 assert(!children[0].closed,'First Home transition must occur during real backend work');assert.equal(await run('return state.activeJobId'),jobId);assert.deepEqual(await identity(),evidence.identity);evidence.cases.push('Home while real subprocess pending preserves job/source');
 await shot('home-real-backend-pending');
 await run(`document.getElementById('mhResumeWorkspace').click();return true`);
 await until(()=>run(`return !document.getElementById('playerLayer').classList.contains('hidden')`),'return during real backend work');assert.deepEqual(await identity(),evidence.identity);assert.equal(await run('return state.activeJobId'),jobId);assert(!children[0].closed,'Explicit return must happen while real model is still pending');evidence.cases.push('return while pending preserves same backend job');
 await shot('returned-real-backend-pending');
 await run(`document.getElementById('playerBack').click();return true`);await until(()=>run(`return document.getElementById('playerLayer').classList.contains('hidden')`),'second Home');
 assert(!children[0].closed,'Second Home must occur before actual model completion');
 await until(()=>children[0].closed,'real tiny backend completion',150000);assert.equal(children[0].code,0,JSON.stringify(events.filter(e=>e.type==='error')));
 await until(()=>run(`return !state.queueRunning&&!state.running&&!state.activeJobId&&state.queue[0].status==='done'`),'normal queue terminal state');
 const done=events.find(event=>event.type==='done');assert(done,'Real backend must emit done');assert(done.segments>0,JSON.stringify(done));
 const srt=done.files?.find(file=>file.endsWith('.srt'));assert(srt&&fs.existsSync(srt),'Real SRT artifact exists');const text=fs.readFileSync(srt,'utf8');assert.match(text,/-->/);assert.match(text,/library|book|window|garden|notebook/i,'Recognized text must contain synthetic speech words');
 assert(await run(`return document.getElementById('playerLayer').classList.contains('hidden')`),'real completion must not steal Home');assert.deepEqual(await identity(),evidence.identity);evidence.cases.push('real transcription completes while Home without changing source');await shot('home-completed');
 await run(`document.getElementById('mhResumeWorkspace').click();return true`);await until(()=>run(`return !document.getElementById('playerLayer').classList.contains('hidden')`),'explicit return after real completion');
 assert.deepEqual(await identity(),evidence.identity);await until(()=>run('return player.cues.length>0'),'real SRT loaded in original player');
 evidence.result=await run('return {cues:player.cues.length,path:player.subPath,queueStatus:state.queue[0].status,queueFiles:state.queue[0].files}');assert.equal(path.resolve(evidence.result.path),path.resolve(srt));assert.equal(children.length,1,'Returning Home must not restart backend');evidence.cases.push('real SRT is available on original source after explicit return');
 await shot('returned-real-result');evidence.backend={pid:children[0].pid,exitCode:children[0].code,events:events.map(e=>e.type),segments:done.segments,srt};evidence.limits='Cached tiny CPU transcription on local SAPI speech; no model download, translation provider, GPU, remote media or personal profile.';
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));app.exit(0);
}).catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,children,events,...evidence},null,2));try{if(run){await shot('failure');await run('return api.cancelTranscribe?.()');}}catch{}app.exit(1);});
setTimeout(()=>{console.error('Whisper Home acceptance timeout');for(const child of children)if(!child.closed&&child.pid)rawSpawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});app.exit(2);},180000).unref();
