'use strict';
// Opt-in real-media acceptance. No model, provider, profile or network access.
// electron tests/electron-real-dub-scene.accept.js --scene=<new local result folder>
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const argument=process.argv.find(value=>value.startsWith('--scene='));
if(!argument){console.log('Real media acceptance requires --scene=<local result folder>');app.exit(2);}
else {
const folder=path.resolve(argument.slice(8)),root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(folder,'native-player-profile'));app.commandLine.appendSwitch('disable-gpu');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await delay(25);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
  for(const name of ['dense-video.mp4','dense-scene.wav','dense-scene.sync.json','dense-scene.quality.json','known-music.wav'])assert(fs.statSync(path.join(folder,name)).isFile());
  const source=pathToFileURL(path.join(root,'src/renderer')).href;
  const html='<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+pathToFileURL(path.join(root,'tools/voxcpm2/scene-review.css')).href+'"><main><h1>Hızlı sahne · gerçek dublaj oynatımı</h1><p>Üretim oynatma denetleyicisi, videoyu konuşmaya göre yavaşlatır. Test sesi dışarı verilmez.</p><video id="video" muted playsinline></video><p id="state"></p><section><h2>Türkçe cümle</h2><p id="sentence"></p></section><audio id="voice" muted controls></audio><audio id="music" muted></audio></main><script src="'+source+'/dub-sync-map.js"></script><script src="'+source+'/dub-workspace-model.js"></script><script src="'+source+'/browser-dub-audio.js"></script></html>';
  const file=path.join(folder,'real-player.html');if(fs.existsSync(file))throw Error('Use a fresh player output');fs.writeFileSync(file,html);
  const win=new BrowserWindow({width:1150,height:950,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadFile(file);win.showInactive();
  const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  const packet={url:pathToFileURL(path.join(folder,'dense-scene.wav')).href,background:{url:pathToFileURL(path.join(folder,'known-music.wav')).href},sync:JSON.parse(fs.readFileSync(path.join(folder,'dense-scene.sync.json'),'utf8')),rows:JSON.parse(fs.readFileSync(path.join(folder,'dense-scene.quality.json'),'utf8')).groups};
  await run('window.video=document.getElementById("video");window.voice=document.getElementById("voice");window.music=document.getElementById("music");video.src='+JSON.stringify(pathToFileURL(path.join(folder,'dense-video.mp4')).href)+';window.failures=[];window.ctx=()=>({mode:"player",tabId:"fixture",mediaKey:"dense-source",generation:1,priorMuted:true,playbackRate:1,visible:true});window.controller=new BrowserDubAudio({audio:voice,backgroundAudio:music,context:ctx,mute:async(_id,muted)=>{video.muted=muted;return {ok:true};},setRate:async request=>{video.playbackRate=request.rate;return {ok:true};},error:value=>failures.push(value)});return await controller.attach('+JSON.stringify(packet)+',ctx());');
  await until(()=>run('return video.readyState>=3&&voice.readyState>=3&&music.readyState>=3'),'real metadata');
  await run('window.pulse=setInterval(()=>{controller.update({currentTime:video.currentTime,paused:video.paused,ended:video.ended,playbackRate:video.playbackRate,readyState:video.readyState});const mapped=DubSyncMap.at(controller.session.sync,video.currentTime);document.getElementById("state").textContent="Video "+video.currentTime.toFixed(2)+" sn · Ses "+voice.currentTime.toFixed(2)+" sn · Video hızı "+video.playbackRate.toFixed(2)+"×";const row=controller.session.rows.find(row=>mapped.time>=row.audioStart&&mapped.time<row.audioEnd);document.getElementById("sentence").textContent=row?.text||"";},40);return true');
  const evidence=[];
  for(const time of [4,28,56]){
    await run('video.pause();video.currentTime='+time+';return true');await until(()=>run('return !video.seeking'),'seek');
    await run('await video.play();return true');
    await until(()=>run('return !voice.paused&&video.currentTime>'+JSON.stringify(time+.6)),'real audio progression');
    const sample=await run('const mapped=DubSyncMap.at(controller.session.sync,video.currentTime);return {video:video.currentTime,audio:voice.currentTime,expectedAudio:mapped.time,drift:Math.abs(mapped.time-voice.currentTime),videoRate:video.playbackRate,audioRate:voice.playbackRate,musicVolume:music.volume,musicPlaying:!music.paused,frames:video.getVideoPlaybackQuality().totalVideoFrames,errors:failures}');
    assert(sample.drift<.35,JSON.stringify(sample));assert(sample.videoRate<1);assert(sample.frames>0);assert.equal(sample.errors.length,0);evidence.push(sample);
    if(time===4)assert(sample.musicVolume<.75,'music must duck while voice is active');
    await run('video.pause();controller.update({currentTime:video.currentTime,paused:true,playbackRate:video.playbackRate,readyState:4});return true');
    await until(()=>run('return voice.paused&&music.paused'),'pause all');
  }
  fs.writeFileSync(path.join(folder,'real-player.png'),(await win.webContents.capturePage()).toPNG());
  await run('clearInterval(pulse);await controller.remove();return true');assert(await run('return video.playbackRate===1&&voice.paused&&music.paused'));
  fs.writeFileSync(path.join(folder,'real-player-evidence.json'),JSON.stringify({actualDecodedMedia:true,audible:false,evidence},null,2));console.log(JSON.stringify({ok:true,evidence}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),60000).unref();
}
