'use strict';
// Actual main/preload and renderer routing with synthetic audio acquisition.
// No live source, Whisper, translation provider or TTS acceptance is claimed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const out=path.join(root,'.uiprev','network-stream-'+Date.now());fs.mkdirSync(out,{recursive:true});
 const env={...process.env,WHISPER_RESOURCE_SOAK_USER_DATA:path.join(out,'profile'),NETWORK_STREAM_SMOKE_OUT:out};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'ignore',timeout:45000});
 const report=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));assert.equal(r.status,0,JSON.stringify(report));assert.equal(report.ok,true);console.log(JSON.stringify({out,...report}));
}else{
 const {app,session}=require('electron'),out=process.env.NETWORK_STREAM_SMOKE_OUT;
 app.setPath('userData',process.env.WHISPER_RESOURCE_SOAK_USER_DATA);
 const finish=(report,code)=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.exit(code);};
 setTimeout(()=>finish({ok:false,error:'deadline'},1),35000);
 const Module=require('node:module'),load=Module._load;let acquisitions=0;
 Module._load=function(request,parent,isMain){
  if(parent?.filename===path.join(root,'src','main.js')&&request==='./stremio-whisper-audio')return {createStreamAudioPreparer:opts=>{
   const prepare=async()=>{acquisitions++;const file=path.join(out,'synthetic-audio.wav');fs.writeFileSync(file,Buffer.alloc(44));opts.grantMedia(file);return {path:file,bytes:44};};prepare.discard=async()=>{};return prepare;
  }};
  return load.call(this,request,parent,isMain);
 };
 app.on('browser-window-created',(_event,win)=>{if(win.getParentWindow())return;win.webContents.once('did-finish-load',async()=>{
  try{
   await session.defaultSession.protocol.handle('https',()=>new Response('',{status:404}));
   const report=await win.webContents.executeJavaScript(`(async()=>{
    await initialSettingsReady;
    const source=await api.mediaHub({action:'network',url:'https://media.fixture.invalid/movie.mkv'});
    if(!source.ok)throw Error('network source failed');
    await MediaHubUI.playStream(source,0,{autoplay:false});
    const video=document.getElementById('playerVideo');Object.defineProperty(video,'duration',{configurable:true,value:120});
    syncSubtitlePrimaryAction();
    const eligible=playerSubtitleCreationState().available&&!document.getElementById('makeSubsBtn').disabled;
    let started;startTranscribeSafe=async opts=>{started=opts;return {ok:true,jobId:'synthetic-job'};};
    optsProblem=()=>'';
    await startProgressivePlayerTranscription({translateOverride:true});
    const context=BrowserDubAudioUI.context();
    return {eligible,networkOwner:MediaHubUI.whisperSource()?.owner,transcriptionStarted:!!started?.input?.endsWith('synthetic-audio.wav'),translationChained:started?.translate===true&&started?.translateKeepSource===true,localPathEmpty:!player.localPath,dubUsesStreamIdentity:context.mode==='player'&&context.source===source.key,jobOwnsSource:player.job?.mediaKey===source.key&&player.job?.generation===player.generation};
   })()`);
   for(const key of ['eligible','transcriptionStarted','translationChained','localPathEmpty','dubUsesStreamIdentity','jobOwnsSource'])assert.equal(report[key],true,key);
   assert.equal(report.networkOwner,'mediaHub');assert.equal(acquisitions,1);
   finish({ok:true,actualMainPreload:true,syntheticAudio:true,...report},0);
  }catch(error){finish({ok:false,error:error.message},1);}
 });});
 require('../src/main.js');
}
