'use strict';
// Real HTMLAudioElement decoding/error events; media context and mute IPC are fixtures.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','audio-layer602-'+Date.now());fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');require('../src/main');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let win;const deadline=Date.now()+20000;while(Date.now()<deadline){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await sleep(50);}assert(win);
 const wav=require('./helpers/wav-fixture')(72000).toString('base64');
 const result=await win.webContents.executeJavaScript('(async()=>{'+`
 await initialSettingsReady;UiLocale.set('en',false);
 const voice=new Audio(),music=new Audio();voice.muted=true;music.muted=true;
 const make=(bytes,type)=>URL.createObjectURL(new Blob([bytes],{type}));
 const good=make(Uint8Array.from(atob(${JSON.stringify(wav)}),c=>c.charCodeAt(0)),'audio/wav'),bad=make('not a valid media file','audio/wav');
 const ctx={mode:'player',tabId:'fixture',mediaKey:'fixture',generation:1,mediaId:'one',visible:true,playbackRate:1,priorMuted:false},errors=[],muted=[];
 const dub=new BrowserDubAudio({audio:voice,musicAudio:music,context:()=>ctx,mute:async(_,v)=>{muted.push(v);return {ok:true}},error:m=>errors.push(m)});
 await dub.attach({url:good,name:'Synthetic silence.wav',layers:{music:{url:bad}}},ctx);
 let active=false;for(let i=0;i<70;i++){dub.update({currentTime:0,playbackRate:1,paused:false,readyState:4});await new Promise(r=>setTimeout(r,20));if(dub.session?.musicFailed&&!voice.paused){active=true;break;}}
 const optional={sessionAlive:!!dub.session,voicePlaying:!voice.paused,musicFailed:!!dub.session?.musicFailed,errors:errors.slice(),muted:muted.slice()};
 voice.src=bad;voice.load();for(let i=0;i<70&&dub.session;i++)await new Promise(r=>setTimeout(r,20));
 const primary={sessionAlive:!!dub.session,muted:muted.slice()};await dub.remove();URL.revokeObjectURL(good);URL.revokeObjectURL(bad);return {active,optional,primary};
 `+'})()',true);
 assert(result.active,JSON.stringify(result));assert(result.optional.sessionAlive&&result.optional.voicePlaying&&result.optional.musicFailed);assert(result.optional.errors.some(x=>x.includes('dubbed voice continues')));assert(!result.optional.muted.includes(false));assert.equal(result.primary.sessionAlive,false);assert.equal(result.primary.muted.at(-1),false);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,...result,limits:'real HTMLAudioElement, synthetic muted WAV, fixture player/IPC; no GPU/YouTube'},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
