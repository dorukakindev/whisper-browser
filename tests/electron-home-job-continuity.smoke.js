'use strict';
// Real app/workspace/IPC/scheduler with a deliberately held synthetic provider.
// Home must preserve the source and partial translation before and after return.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','home-job-continuity',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({ui:{translateEndpointPreset:'custom',translateBaseUrl:'http://127.0.0.1:12345/v1',uiLocale:'en'}}));
global.fetch=async()=>{throw Error('Home continuity acceptance: remote fetch disabled');};
const ffmpeg=require('./media-runtime').findMediaTool('ffmpeg');assert(ffmpeg,'FFmpeg required');
const video=path.join(out,'source.mp4');
const made=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x17191c:s=640x360:r=12:d=30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',video],{encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(made.status,0,made.stderr);
const media=fs.readFileSync(video),sockets=new Set(),calls=[];let aborted=0;
const schedulerModule=require('../src/browser-translation-scheduler'),Original=schedulerModule.BrowserTranslationScheduler;
schedulerModule.BrowserTranslationScheduler=class extends Original{constructor(options){super({...options,maxConcurrent:1,translate:(sentence,call)=>new Promise(resolve=>{
 const held={sentence:sentence.text,resolved:false,release(){this.resolved=true;resolve({text:'Pencereyi aç.',parts:sentence.pieces.map(()=> 'Pencereyi aç.')});}};
 calls.push(held);call.signal.addEventListener('abort',()=>{aborted++;},{once:true});
})});}};
const server=http.createServer((req,res)=>{
 if(req.url==='/source.mp4'){
  const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),media.length-1):media.length-1;
  if(start>end||start>=media.length){res.writeHead(416,{'Content-Range':'bytes */'+media.length});res.end();return;}
  const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1};if(match)headers['Content-Range']=`bytes ${start}-${end}/${media.length}`;
  res.writeHead(match?206:200,headers);res.end(media.subarray(start,end+1));return;
 }
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Controlled job continuity source</title><style>body{margin:0;background:#17191c;color:#ddd;font:18px sans-serif}video{width:90vw}</style><h1>Local source: keep this workspace</h1><video muted autoplay loop controls src="/source.mp4"></video>');
});server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timeout: '+label);}
let win,run,view;const evidence={realApp:true,realScheduler:true,provider:'controlled deferred fixture',localHttp:true,cases:[]};
function close(){for(const socket of sockets)socket.destroy();server.close();}
async function shot(name){await run('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true');await wait(100);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const target='http://127.0.0.1:'+server.address().port+'/source';
 require('../src/main');await app.whenReady();
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main app');win.setContentSize(1280,900);win.showInactive();
 run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run(`await initialSettingsReady;document.getElementById('openPlayer').click();setWorkspaceMode('browser',false);return true`);
 await until(()=>run('return !!player.browserActiveTabId&&!player.browserWorkspaceShowBusy'),'browser');await run('return navigateBrowser('+JSON.stringify(target)+')');
 await until(()=>{view=win.contentView.children.find(v=>v.webContents?.getURL()===target);return view;},'native source');
 await until(()=>view.webContents.executeJavaScript(`document.querySelector('video')?.readyState>=3`,true),'video decoder');
 await until(()=>run('return !!browserTabState()?.mediaId&&BrowserDubAudioUI.context().hasMedia'),'stable source identity');
 const identity=()=>run(`return {tab:player.browserActiveTabId,key:player.mediaKey,mediaId:browserTabState()?.mediaId,generation:browserTabState()?.generation,url:player.browserPageUrl}`);
 evidence.identity=await identity();
 const started=await run(`player.browserTranslationTrackId='home-continuity';browserTabState().browserTranslationTrackId='home-continuity';return api.startBrowserTranslation(player.browserActiveTabId,{trackId:'home-continuity',sourceLanguage:'en',targetLanguage:'tr',completeTrack:true,cues:[{id:'one',start:0,end:1,text:'Open the window.'},{id:'two',start:5,end:6,text:'Close the door.'},{id:'three',start:10,end:11,text:'Watch the road.'}]})`);assert(started.ok,started.error);assert.equal(started.sentenceCount,3);
 await until(()=>calls.length===1,'first controlled provider request');
 const snapshot=()=>run('return api.getBrowserTranslationSnapshot(player.browserActiveTabId)');
 async function home(){await run(`document.getElementById('browserMediaHome').click();return true`);await until(()=>run(`return document.getElementById('playerLayer').classList.contains('hidden')&&!!document.getElementById('mhResumeWorkspace')`),'Home return card');assert.equal(aborted,0,'Home must not abort provider');assert.deepEqual(await identity(),evidence.identity);assert.equal(view.webContents.getURL(),target);}
 async function resume(){await run(`document.getElementById('mhResumeWorkspace').click();return true`);await until(()=>run(`return !document.getElementById('playerLayer').classList.contains('hidden')`),'return to workspace');assert.deepEqual(await identity(),evidence.identity);await until(()=>view.getBounds().x>=0,'native source visible again');}
 await home();await shot('home-pending');calls[0].release();
 await until(async()=>{const s=await snapshot();return s.results?.length===1&&calls.length===2;},'partial completion while Home');
 assert(await run(`return document.getElementById('playerLayer').classList.contains('hidden')`),'partial completion cannot steal focus');
 evidence.cases.push('first result progresses while Home');await resume();
 const partial=await snapshot();assert.equal(partial.results.length,1);assert.equal(partial.trackId,'home-continuity');assert.equal(aborted,0);
 await until(()=>run('return player.browserLiveTranslations.size===1'),'partial result restored in renderer');
 evidence.partial={results:partial.results.length,state:partial.state,providerCalls:calls.length};await shot('returned-pending');evidence.cases.push('return preserves source and partial progress while next request pending');
 await home();calls[1].release();await until(()=>calls.length===3,'third provider request while Home');calls[2].release();
 await until(async()=>{const s=await snapshot();return s.results?.length===3;},'all translations complete while Home');
 assert(await run(`return document.getElementById('playerLayer').classList.contains('hidden')`),'final completion cannot steal focus');evidence.cases.push('completion while Home stays on Home');
 await resume();await until(()=>run('return player.browserLiveTranslations.size===3&&browserTabState().browserTranslationComplete===true'),'completed results restored');
 assert.equal(aborted,0);assert.equal(calls.length,3,'return must not restart provider work');assert.equal(view.webContents.getURL(),target);evidence.cases.push('same source and completed results on explicit return');
 await shot('returned-complete');fs.writeFileSync(path.join(out,'native-source.png'),(await view.webContents.capturePage()).toPNG());
 evidence.providerCalls=calls.length;evidence.aborted=aborted;evidence.limits='Real native app, local video, IPC and scheduler with controlled provider replies; no live model quality, remote site, transcription backend, account or GPU test.';
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({ok:true,...evidence},null,2));console.log(JSON.stringify({ok:true,out,...evidence}));close();app.exit(0);
})().catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,aborted,calls:calls.length,...evidence},null,2));try{if(win)await shot('failure');}catch{}close();app.exit(1);});
setTimeout(()=>{console.error('Home continuity acceptance timeout');close();app.exit(2);},100000).unref();
