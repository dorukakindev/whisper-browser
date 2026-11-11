'use strict';
// Actual Windows mpv host/pipe/process close; synthetic silent media only.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','native-stop762-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');
process.env.WHISPER_NATIVE_TEST='1';process.env.WHISPER_MPV_PATH=process.env.WHISPER_MPV_PATH||path.join(process.env.LOCALAPPDATA,'Luna Player','mpv','mpv.exe');assert(fs.existsSync(process.env.WHISPER_MPV_PATH));
const ffmpeg=require('./media-runtime').findMediaTool('ffmpeg'),video=path.join(out,'silent.mp4');assert(ffmpeg);const made=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x17191c:s=640x360:d=30','-c:v','libx264','-preset','ultrafast',video],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(made.status,0,made.stderr);
const rawSpawn=cp.spawn,owned=[];cp.spawn=(exe,args,options)=>{const proc=rawSpawn(exe,args,options);if(exe===process.env.WHISPER_MPV_PATH){const row={proc,closed:false};owned.push(row);proc.once('close',()=>row.closed=true);}return proc;};
const {registerNativePlayer}=require('../src/native-player');let native,win,latest={};const headless=process.env.WHISPER_NATIVE_HEADLESS==='1';
const NativeWindow=headless?class extends BrowserWindow{showInactive(){}}:BrowserWindow;
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await wait(30);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:900,height:650,webPreferences:{sandbox:true}});await win.loadURL('data:text/html,<body style="background:%2317191c;color:white">Synthetic native shutdown acceptance</body>');if(!headless)win.showInactive();
 const originalSend=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,row)=>{if(channel==='native-player:event')latest=row;return originalSend(channel,row);};
 native=registerNativePlayer({app,ipcMain,BrowserWindow:NativeWindow,owner:()=>win,authorized:()=>true,authorizeMedia:async()=>video,torrents:{},dialog:{}});
 const start=()=>native.handler({}, {action:'start',path:video,key:'synthetic',generation:1,bounds:{x:20,y:30,width:640,height:360}});
 assert((await start()).ok);
 const cmd=(command,value)=>native.handler({}, {action:'command',key:'synthetic',generation:1,command,value});
 assert((await cmd('mute',true)).ok);assert((await cmd('speed',.125)).ok);await until(()=>latest.speed===.125,'effective 0.125 rate');
 assert((await cmd('seek',4)).ok);assert((await cmd('play')).ok);await until(()=>latest.time>4.05,'native playback advances');assert((await cmd('pause')).ok);await until(()=>latest.paused===true,'native pause');
 const actualLowRate=latest.speed,advancedPosition=latest.time;
 assert((await cmd('text',{primary:'Synthetic source',secondary:'Sentetik çeviri',primaryRole:'source',secondaryRole:'translation'})).ok);
 assert((await cmd('speed',1.5)).ok);await until(()=>latest.speed===1.5,'restored preferred rate');
 assert((await native.handler({}, {action:'layout',key:'synthetic',generation:1,bounds:{x:20,y:30,width:320,height:180},hidden:false})).ok);
 const t=Date.now();assert((await native.handler({}, {action:'stop'})).ok);assert(owned[0].closed,'IPC stop must await close');const stopMs=Date.now()-t;
 assert((await start()).ok);let prevented=0,resumed=0,closedBeforeQuit=false;app.quit=()=>{resumed++;closedBeforeQuit=owned[1].closed;};const q=Date.now();app.emit('before-quit',{preventDefault(){prevented++;}});app.emit('before-quit',{preventDefault(){prevented++;}});assert.equal(resumed,0);await until(()=>resumed===1,'confirmed quit');assert(closedBeforeQuit);assert.equal(prevented,2);assert(owned.every(row=>row.closed));
 const evidence={ok:true,actualMpv:true,headless,noPersonalProfile:true,actualLowRate,restoredRate:1.5,advancedPosition,subtitleCommand:true,layoutCommand:true,syntheticVideo:true,ipcStopClosed:true,stopMs,quitMs:Date.now()-q,prevented,resumed,closedBeforeQuit,ownedProcesses:owned.length};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({out,...evidence}));app.exit(0);
}).catch(error=>{console.error(error.stack);for(const row of owned)if(!row.closed)rawSpawn('taskkill',['/PID',String(row.proc.pid),'/T','/F'],{windowsHide:true});setTimeout(()=>app.exit(1),500);});setTimeout(()=>app.exit(2),45000).unref();
