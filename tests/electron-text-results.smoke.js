'use strict';
// Reopen a previous synthetic production in a NEW Electron process, without spawning a voice engine.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),i=process.argv.indexOf('--production-root');assert(i>=0);
const out=fs.realpathSync(path.resolve(process.argv[i+1]));
assert(out.startsWith(path.join(root,'.uiprev','text-studio')+path.sep),'Only disposable synthetic production profiles are allowed');
const profile=path.join(out,'profile');assert(fs.existsSync(path.join(out,'acceptance.json')));
app.setAppPath(root);app.setPath('downloads',out);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Synthetic result restoration: network disabled');};
let win,run,held;const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(60);}throw Error('Timeout: '+label);}
async function screenshot(name){await pause(350);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'new process');
 win.setContentSize(1360,1000);win.showInactive();run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run("return api.openTextVoiceUI()");
 await until(()=>run("return document.getElementById('tv-history').options.length===1"),'restored history');
 const item=(await run("return api.textVoice({action:'history'})")).results[0];
 await run("document.getElementById('tv-text').value='A new manuscript must stay unchanged.';document.getElementById('tv-text').dispatchEvent(new Event('input'));document.querySelector('.text-voice-history').open=true;document.getElementById('tv-history-open').click();return true");
 await until(()=>run("return !document.getElementById('tv-output').hidden&&document.getElementById('tv-audio').readyState>=1"),'old WAV decoded in new process');
 assert.equal(await run("return document.getElementById('tv-text').value"),'A new manuscript must stay unchanged.');
 await run("document.querySelector('.text-voice-history').scrollIntoView({block:'start'});return true");await screenshot('restored-history-tr');
 win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
 await run("UiLocale.set('en',false);applyUiTheme('light');document.querySelector('.text-voice-history').scrollIntoView({block:'start'});return true");await screenshot('restored-history-en-light-125');
 const metrics=await run("const d=document.getElementById('textVoiceStudio'),h=document.querySelector('.text-voice-history');return {overflow:d.scrollWidth>d.clientWidth+1,historyOverflow:h.scrollWidth>h.clientWidth+1,buttonHeight:document.getElementById('tv-history-open').getBoundingClientRect().height,boxes:[...document.querySelectorAll('.text-voice-history,.text-voice-history-row,.text-voice-output,#tv-audio,.text-voice-rail,.text-voice-manuscript,.text-voice-body')].map(n=>({id:n.id||n.className,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,position:getComputedStyle(n).position,gridRows:getComputedStyle(n).gridTemplateRows,gridRow:getComputedStyle(n).gridRow,flex:getComputedStyle(n).flex})),outputContainsAudio:(()=>{const a=document.getElementById('tv-audio').getBoundingClientRect(),o=document.getElementById('tv-output').getBoundingClientRect();return a.top>=o.top&&a.bottom<=o.bottom;})()}");
 assert(!metrics.overflow&&!metrics.historyOverflow);assert(metrics.buttonHeight>=40);assert(metrics.outputContainsAudio,'audio controls must stay inside the output card');const manuscript=metrics.boxes.find(b=>b.id==='text-voice-manuscript'),rail=metrics.boxes.find(b=>b.id==='text-voice-rail');assert(manuscript.bottom<=rail.top+1,'narrow manuscript and settings must not overlap');
 // A file removed outside the app is revalidated at the moment of reopening.
 held=item.path+'.held-by-test';fs.renameSync(item.path,held);
 await run("document.getElementById('tv-history-open').click();return true");
 await until(()=>run("return document.getElementById('tv-history').options.length===0"),'missing audio removed from ready list');
 assert.equal((await run("return api.textVoice({action:'open-result',id:"+JSON.stringify(item.id)+"})")).ok,false);
 fs.renameSync(held,item.path);held=null;
 fs.writeFileSync(path.join(out,'restoration.json'),JSON.stringify({complete:true,newProcess:true,oldAudioDecoded:true,manuscriptPreserved:true,missingAudioRejected:true,realGeneration:false,metrics},null,2));
 console.log(JSON.stringify({out,complete:true,newProcess:true,metrics}));app.exit(0);
}).catch(async error=>{if(held)try{fs.renameSync(held,held.replace(/\.held-by-test$/,''));}catch{}console.error(error.stack);try{await screenshot('restore-failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),60000).unref();
