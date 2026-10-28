'use strict';
// Native production renderer + preload + IPC; disposable profile and synthetic speech only.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function arg(key){const i=process.argv.indexOf(key);assert(i>=0,key+' required');return path.resolve(process.argv[i+1]);}
const reference=arg('--reference'),transcript=arg('--transcript'),engine=arg('--engine');
const real=process.argv.includes('--real-generation');
const out=path.join(root,'.uiprev','text-studio',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);
process.env.WHISPER_OPEN_TEXT_STUDIO='1';process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;process.env.HF_HUB_OFFLINE='1';process.env.PYTHONUTF8='1';
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
fs.writeFileSync(path.join(profile,'dub-settings.json'),JSON.stringify({reference,transcript,engine}));
fs.writeFileSync(path.join(profile,'text-studio-settings.json'),JSON.stringify({version:2,steps:17,max_chars:400}));
global.fetch=async()=>{throw Error('Synthetic text studio test: external requests disabled');};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[reference]});
let win,run;const events=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timeout: '+label);}
async function screenshot(name){await wait(350);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main window');
 win.setContentSize(1360,1000);win.showInactive();
 const send=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,...args)=>{if(channel==='dub:event')events.push(args[0]);return send(channel,...args);};
 run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 // Launcher flag opens the same Electron studio without spawning the old GUI.
 await until(()=>run("return document.getElementById('textVoiceStudio')?.open"),'launcher opens studio');
 await until(()=>run("return document.getElementById('textVoiceStudio')?.open&&document.getElementById('tv-reference').options.length>0"),'studio');
 assert.equal(await run("return document.getElementById('tv-transcript').value"),fs.readFileSync(transcript,'utf8'));
 const text='Bir kitap, bize yeni bir pencere açar. Bu kısa örnekte cümlelerin doğal ritmini ve sesin bütünlüğünü dinliyoruz.';
 await run("document.getElementById('tv-text').value="+JSON.stringify(text)+";document.getElementById('tv-text').dispatchEvent(new Event('input'));return true");
 assert.deepEqual(await run("return {steps:document.getElementById('tv-steps').value,chars:document.getElementById('tv-max_chars').value,start:document.getElementById('tv-start').disabled}"),{steps:'17',chars:'400',start:false});
 await screenshot('studio-tr-dark');
 await run("document.getElementById('tv-pick-reference').click();return true");
 await until(()=>run("return document.getElementById('tv-status').textContent.includes('Referans seçildi')"),'local reference');
 await run("document.getElementById('tv-transcript').value='Editable local transcript draft.';document.getElementById('tv-transcript').dispatchEvent(new Event('input'));document.getElementById('tv-refresh').click();return true");
 await wait(200);assert.equal(await run("return document.getElementById('tv-transcript').value"),'Editable local transcript draft.');
 // Restore synthetic exact words before real Hi-Fi generation; never change the original file.
 await run("document.getElementById('tv-transcript').value="+JSON.stringify(fs.readFileSync(transcript,'utf8'))+";document.querySelector('[data-preset=balanced]').click();return true");
 if(real){
  await run("document.getElementById('tv-preview').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&['done','error'].includes(e.type)),'real GPU text preview',240000);
  const result=events.find(e=>e.kind==='text'&&['done','error'].includes(e.type));assert.equal(result.type,'done',JSON.stringify(result));
  assert(require('../src/voice-output').validVoiceOutput(result.path));
  await until(()=>run("return !document.getElementById('tv-output').hidden&&document.getElementById('tv-audio').readyState>=1"),'WAV preview metadata');
  await screenshot('studio-complete-tr');
  const previous=result.path;
  await run("document.getElementById('tv-text').value="+JSON.stringify(text.repeat(20))+";document.getElementById('tv-text').dispatchEvent(new Event('input'));document.getElementById('tv-start').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='text_log'&&e.id!==result.id&&e.tail.includes('uretim basliyor')),'second real engine synthesis',120000);
  await run("document.getElementById('tv-stop').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='cancelled'),'real text cancellation',20000);
  assert(fs.existsSync(previous),'previous completed WAV survives cancellation');
  assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  await screenshot('studio-stopped-tr');
  await run("document.getElementById('tv-text').value="+JSON.stringify(text)+";document.getElementById('tv-text').dispatchEvent(new Event('input'));return true");
 }
 win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
 await run("UiLocale.set('en',false);applyUiTheme('light');document.querySelector('.text-voice-body').scrollTop=0;return true");
 await screenshot('studio-en-light-125');
 await run("const body=document.querySelector('.text-voice-body');body.scrollTop=body.scrollHeight;document.querySelector('.text-voice-rail section:last-child details').open=true;return true");
 await screenshot('studio-en-light-settings-125');
 await run("const d=document.getElementById('textVoiceStudio');d.close();return api.openTextVoiceUI()");
 await until(()=>run("return document.getElementById('textVoiceStudio').open"),'reopen retains studio');
 assert.equal(await run("return document.getElementById('tv-text').value"),text);
 const metrics=await run("const d=document.getElementById('textVoiceStudio'),r=d.getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,overflow:d.scrollWidth>d.clientWidth+1,title:document.getElementById('textVoiceTitle').textContent,startHeight:document.getElementById('tv-start').getBoundingClientRect().height,editorColor:getComputedStyle(document.getElementById('tv-text')).backgroundColor}");
 assert.equal(metrics.overflow,false);assert(metrics.left>=0&&metrics.right<=metrics.width+1);assert(metrics.startHeight>=40);assert.match(metrics.title,/words/);
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({complete:true,realGeneration:real,metrics,events},null,2));
 console.log(JSON.stringify({out,complete:true,realGeneration:real,metrics}));app.exit(0);
}).catch(async error=>{console.error(error.stack);try{await screenshot('failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),real?300000:60000).unref();
