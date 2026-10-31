'use strict';
// Production renderer/controller + native IPC/WebContents, using only synthetic
// local media in a cross-origin iframe. No provider, personal profile or site.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'.uiprev','browser-dub-mute',Date.now()+'-'+process.pid);
const profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
global.fetch=async()=>{throw Error('Controlled mute acceptance: external fetch disabled');};
const ffmpeg=require('./media-runtime').findMediaTool('ffmpeg');assert(ffmpeg,'FFmpeg required');
const video=path.join(out,'source.mp4'),wav=path.join(out,'dub.wav');
function make(args){const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(result.status,0,result.stderr);}
make(['-f','lavfi','-i','color=c=0x17191c:s=640x360:r=12:d=40','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=40','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',video]);
make(['-f','lavfi','-i','sine=frequency=660:sample_rate=24000:duration=40','-ac','1',wav]);
const videoBytes=fs.readFileSync(video),servers=[],sockets=new Set();
function serve(handler){const server=http.createServer(handler);servers.push(server);server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));}
function media(req,res){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),videoBytes.length-1):videoBytes.length-1;
 if(start>end||start>=videoBytes.length){res.writeHead(416,{'Content-Range':'bytes */'+videoBytes.length});res.end();return;}
 const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1};if(match)headers['Content-Range']=`bytes ${start}-${end}/${videoBytes.length}`;
 res.writeHead(match?206:200,headers);res.end(videoBytes.subarray(start,end+1));}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timeout: '+label);}
let win,view,frame,run;
const evidence={crossOriginIframe:true,syntheticMedia:true,realController:true,realIpc:true,realWebContentsMute:true,cases:[]};
function close(){for(const socket of sockets)socket.destroy();for(const server of servers)server.close();}
async function capture(name){fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
(async()=>{
 const child=await serve((req,res)=>{if(req.url==='/source.mp4')return media(req,res);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Synthetic iframe video</title><style>body{margin:0;background:#17191c}video{width:100%}</style><video controls loop preload="auto" src="/source.mp4"></video>');});
 const childUrl='http://127.0.0.1:'+child.address().port+'/video';
 const parent=await serve((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Local cross-origin dubbing acceptance</title><style>body{background:#101113;color:#ddd;font:16px sans-serif}iframe{width:900px;height:520px;border:0}</style><h1>Controlled cross-origin media</h1><iframe allow="autoplay" src="'+childUrl+'"></iframe>');});
 const target='http://127.0.0.1:'+parent.address().port+'/one';
 evidence.origins=[new URL(target).origin,new URL(childUrl).origin];assert.notEqual(...evidence.origins);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[wav]});
 require('../src/main');await app.whenReady();
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main app');
 win.setContentSize(1280,900);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run(`await initialSettingsReady;document.getElementById('openPlayer').click();setWorkspaceMode('browser',false);return true`);
 await until(()=>run('return !!player.browserActiveTabId'),'browser tab');
 await run('return navigateBrowser('+JSON.stringify(target)+')');
 await until(()=>{view=win.contentView.children.find(v=>v.webContents?.getURL()===target);return view;},'local top frame');
 async function ready(){
  await until(()=>{frame=view.webContents.mainFrame.framesInSubtree.find(f=>f.url===childUrl);return frame;},'cross-origin child');
  await until(()=>frame.executeJavaScript(`!!document.querySelector('video')&&document.querySelector('video').readyState>=3`,true),'real video decoder');
  await frame.executeJavaScript(`document.querySelector('video').volume=.05;document.querySelector('video').muted=false;document.querySelector('video').play()`,true);
  await until(()=>run('return BrowserDubAudioUI.context().hasMedia&&BrowserDubAudioUI.context().visible'),'media telemetry');
 }
 await ready();
 const asset=await run('return api.choosePlaybackAudio()');assert(asset.ok,asset.error);
 async function attach(){
  assert(await run('return BrowserDubAudioUI.attachGenerated({...'+JSON.stringify(asset.output)+',mix:{voice:.05}},BrowserDubAudioUI.context())'),'production attachment');
  await until(()=>run(`const a=document.getElementById('browserDubAudio');return a.readyState>=3&&!a.paused&&a.currentTime>0`),'decoded WAV playing');
  await until(()=>view.webContents.isAudioMuted(),'native source muted');
 }
 async function manual(value){const result=await run('return api.muteBrowserTab(BrowserDubAudioUI.context().tabId,'+value+')');assert(result.ok,result.error);assert.equal(view.webContents.isAudioMuted(),value);}
 async function stop(){await run('await BrowserDubAudioUI.stop();return true');assert(await run(`return document.getElementById('browserDubAudio').paused`));}
 await attach();
 evidence.decoded=await frame.executeJavaScript(`({readyState:document.querySelector('video').readyState,paused:document.querySelector('video').paused,muted:document.querySelector('video').muted})`,true);
 assert.equal(evidence.decoded.muted,false,'native tab mute must be separate from source element mute');
 await capture('attached');await stop();assert.equal(view.webContents.isAudioMuted(),false);evidence.cases.push('ordinary removal restores original');
 await attach();await manual(true);await stop();assert.equal(view.webContents.isAudioMuted(),true);evidence.cases.push('idempotent manual mute survives removal');
 await manual(false);await attach();await manual(false);
 // Force ordinary controller updates after the human choice: it must not
 // reacquire its revoked lease when the source seeks or pauses/resumes.
 await run(`await browserCommand('pause');await browserCommand('seek',3);await browserCommand('play');return true`);
 await wait(700);assert.equal(view.webContents.isAudioMuted(),false,'manual unmute survives subsequent controller ticks');
 await stop();assert.equal(view.webContents.isAudioMuted(),false);evidence.cases.push('manual unmute wins through seek/pause/resume/removal');
 await attach();const old=await run('return BrowserDubAudioUI.context()');
 const next=target.replace('/one','/two');await run('return navigateBrowser('+JSON.stringify(next)+')');
 await until(()=>run('return BrowserDubAudioUI.context().generation!=='+JSON.stringify(old.generation)),'new source generation');
 await ready();await until(()=>!view.webContents.isAudioMuted(),'old owned mute released on navigation');
 await until(()=>run(`return document.getElementById('browserDubAudio').paused&&!BrowserDubAudioUI.originalPlayback()`),'old replacement removed');
 evidence.cases.push('navigation releases old owned mute');evidence.generation={before:old.generation,after:(await run('return BrowserDubAudioUI.context()')).generation};
 await capture('navigation-restored');fs.writeFileSync(path.join(out,'native-iframe.png'),(await view.webContents.capturePage()).toPNG());
 evidence.limits='Synthetic local HTTP iframe and real decoders/IPC only; no live site, account, DRM, GPU or acoustic loopback measurement.';
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));close();app.exit(0);
})().catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,...evidence},null,2));try{if(win)await capture('failure');}catch{}close();app.exit(1);});
setTimeout(()=>{console.error('Native dubbing mute acceptance timed out');close();app.exit(2);},110000).unref();
