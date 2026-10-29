'use strict';
// Native production renderer + preload + IPC; disposable profile and synthetic speech only.
const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function arg(key){const i=process.argv.indexOf(key);assert(i>=0,key+' required');return path.resolve(process.argv[i+1]);}
const reference=arg('--reference'),transcript=arg('--transcript'),engine=arg('--engine');
const real=process.argv.includes('--real-generation'),shared=process.argv.includes('--shared-references'),ownership=process.argv.includes('--event-ownership');
assert(!(real&&ownership),'Controlled ownership checks cannot be real GPU generation');
const starts=[],stops=[];
if(ownership){const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(channel,listener)=>handle(channel,async(event,request,...args)=>{
 if(channel==='dub:textVoice'&&request?.action==='start')return new Promise(resolve=>starts.push({request,resolve}));
 if(channel==='dub:cancel')return new Promise(resolve=>stops.push({request,resolve}));
 return listener(event,request,...args);
});}
const out=path.join(root,'.uiprev','text-studio',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);app.setPath('downloads',out);
process.env.WHISPER_OPEN_TEXT_STUDIO='1';process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;process.env.HF_HUB_OFFLINE='1';process.env.PYTHONUTF8='1';
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,ui:{uiLocale:'tr',uiTheme:'dark'}}));
fs.writeFileSync(path.join(profile,'dub-settings.json'),JSON.stringify({reference,transcript,engine}));
fs.writeFileSync(path.join(profile,'text-studio-settings.json'),JSON.stringify({version:2,steps:17,max_chars:400}));
global.fetch=async()=>{throw Error('Synthetic text studio test: external requests disabled');};
let picked=reference;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[picked]});
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
 assert.equal(await run("return document.getElementById('tv-preset-info').textContent"),'Özel ayarlar');
 await run("document.querySelector('[data-preset=book]').click();return true");
 assert.equal(await run("return document.querySelector('[data-preset=book]').getAttribute('aria-pressed')"),'true');
 await run("document.getElementById('tv-pause').value='1.8';document.getElementById('tv-pause').dispatchEvent(new Event('input'));return true");
 assert.equal(await run("return document.querySelectorAll('[data-preset][aria-pressed=true]').length"),0);
 assert.equal(await run("return document.getElementById('tv-preset-info').textContent"),'Özel ayarlar');
 await run("document.querySelector('[data-preset=balanced]').click();return true");
 await screenshot('studio-tr-dark');
 await run("document.getElementById('tv-pick-reference').click();return true");
 await until(()=>run("return document.getElementById('tv-status').textContent.includes('Referans seçildi')"),'local reference');
 await run("document.getElementById('tv-transcript').value='Editable local transcript draft.';document.getElementById('tv-transcript').dispatchEvent(new Event('input'));document.getElementById('tv-refresh').click();return true");
 await wait(200);assert.equal(await run("return document.getElementById('tv-transcript').value"),'Editable local transcript draft.');
 if(shared){
  await run("document.querySelector('.text-voice-library').open=true;document.getElementById('tv-reference-name').value='Ortak anlatıcı A';document.getElementById('tv-reference-name').dispatchEvent(new Event('input'));document.getElementById('tv-save-reference').click();return true");
  await until(()=>run("return document.getElementById('tv-status').textContent.includes('ortak listeye')"),'saved voice');
  const library=await run("return api.listVoiceReferences()");const a=library.references.find(v=>v.name==='Ortak anlatıcı A');assert(a);assert.equal(library.activeId,'');
  assert.equal(fs.readFileSync(transcript,'utf8').includes('Editable local transcript draft.'),false);
  await screenshot('shared-voice-tr');
  await run("document.getElementById('textVoiceStudio').close();return true");
  const book=path.join(out,'Synthetic book.txt');fs.writeFileSync(book,'A complete book chapter for a controlled reference choice test.');picked=book;
  const imported=await run("return api.mediaWorkflows({action:'book-import'})");assert(imported.ok,JSON.stringify(imported));
  const bookId=imported.project.id;
  await run("await MediaWorkflowsUI.openProject("+JSON.stringify(bookId)+");return true");
  await until(()=>run("return document.querySelector('.mw-voice-settings select[aria-label]')?.options.length>=2"),'book voice options');
  await run("const voice=document.querySelector('.mw-voice-settings select[aria-label]');voice.value="+JSON.stringify(a.id)+";voice.dispatchEvent(new Event('change'));return true");
  await until(async()=>{const r=await run("return api.mediaWorkflows({action:'book-open',id:"+JSON.stringify(bookId)+"})");return r.project.voicePreferences?.referenceId===a.id;},'book-specific voice');
  await run("const edit=document.querySelector('textarea[data-chapter]');edit.value='Unsaved book draft stays here.';edit.dispatchEvent(new Event('input'));document.querySelector('.mw-voice-settings').open=true;const manage=[...document.querySelectorAll('.mw-voice-settings button')].find(b=>b.textContent.includes('Referans sesleri yönet'));manage.click();return true");
  await until(()=>run("return document.getElementById('textVoiceStudio').open"),'book opens shared studio');
  await run("document.getElementById('tv-reference-name').value='Ortak anlatıcı B';document.getElementById('tv-reference-name').dispatchEvent(new Event('input'));document.getElementById('tv-save-reference').click();return true");
  await until(()=>run("return document.getElementById('tv-reference').selectedOptions[0]?.textContent==='Ortak anlatıcı B'"),'second voice');
  await run("document.getElementById('tv-default-reference').click();return true");
  await until(()=>run("return document.getElementById('tv-status').textContent.includes('varsayılan sesi güncellendi')"),'explicit default');
  await run("document.getElementById('textVoiceStudio').close();return true");
  await until(()=>run("return [...document.querySelector('.mw-voice-settings select[aria-label]').options].some(o=>o.textContent==='Ortak anlatıcı B')"),'live book refresh');
  assert.equal(await run("return document.querySelector('.mw-voice-settings select[aria-label]').value"),a.id);
  assert.equal(await run("return document.querySelector('textarea[data-chapter]').value"),'Unsaved book draft stays here.');
  await run("document.querySelector('.mw-voice-settings').scrollIntoView({block:'start'});return true");await screenshot('book-shared-voices-tr');
  win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
  await run("UiLocale.set('en',false);applyUiTheme('light');await MediaWorkflowsUI.openProject("+JSON.stringify(bookId)+");document.querySelector('.mw-voice-settings').open=true;document.querySelector('.mw-voice-settings').scrollIntoView({block:'start'});return true");
  await screenshot('book-shared-voices-en-light-125');
  assert.equal(await run("return document.querySelector('textarea[data-chapter]').value"),'Unsaved book draft stays here.');
  const bookMetrics=await run("const d=document.querySelector('dialog.mw-dialog'),s=document.querySelector('.mw-voice-settings'),r=s.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1,settingsOverflow:s.scrollWidth>s.clientWidth+1,left:r.left,right:r.right,viewport:innerWidth}");
  assert.equal(bookMetrics.overflow,false);assert.equal(bookMetrics.settingsOverflow,false);assert(bookMetrics.left>=0&&bookMetrics.right<=bookMetrics.viewport);
  win.setContentSize(1360,1000);win.webContents.setZoomFactor(1);await run("UiLocale.set('tr',false);applyUiTheme('dark');return true");

  await run("document.querySelector('dialog.mw-dialog').close();document.getElementById('dubMainOpen').click();document.getElementById('voiceReferenceRecorder').open=true;return true");
  await until(()=>run("return [...document.getElementById('voiceReferenceSelect').options].some(o=>o.textContent==='Ortak anlatıcı B')"),'dubbing shared list');
  await run("document.getElementById('dubGeneratorDialog').close();return api.openTextVoiceUI()");
  assert.equal(await run("return document.getElementById('tv-text').value"),text);
 }
 if(ownership){
  const status=()=>run("return document.getElementById('tv-status').textContent");
  const start=async()=>{const n=starts.length;await run("document.getElementById('tv-start').click();return true");await until(()=>starts.length===n+1,'controlled start request');return starts[n];};
  const emit=async(id,type,data={})=>{send('dub:event',{id,kind:'text',type,...data});await wait(100);};
  const first=await start();
  const initial=await status();
  for(const type of ['progress','status','text_log','error','cancelled','done'])await emit('text-previous-session',type,{done:9,total:10,error:'STALE ERROR',tail:'STALE LOG',name:'STALE OUTPUT'});
  assert.equal(await status(),initial,'Previous session events cannot adopt a pending request');
  assert.match(first.request.id||'',/^text-[0-9a-f-]{36}$/,'Start is correlated before asynchronous acceptance');
  assert.equal(await run("return document.getElementById('tv-output').hidden"),true);
  assert.equal(await run("return document.getElementById('tv-start').disabled"),true);
  await emit(first.request.id,'progress',{done:1,total:4});assert.match(await status(),/Ses \u00fcretiliyor/);
  await run("document.getElementById('tv-stop').click();return true");await until(()=>stops.length===1,'scoped stop');assert.equal(stops[0].request.id,first.request.id);
  const stoppingState=await status();await emit(first.request.id,'progress',{done:2,total:4});await emit(first.request.id,'status',{stage:'normalizing'});assert.equal(await status(),stoppingState,'Progress during cancellation must not claim the job resumed');assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  await emit(first.request.id,'cancelled');
  const second=await start();assert.notEqual(second.request.id,first.request.id);
  const secondState=await status();
  first.resolve({ok:false,error:'LATE START FAILURE'});stops[0].resolve({ok:false,error:'LATE STOP FAILURE'});await wait(150);
  assert.equal(await status(),secondState,'Late invoke replies cannot overwrite the next job');
  await emit(first.request.id,'progress',{done:99,total:100});assert.equal(await status(),secondState);
  second.resolve({ok:true,id:second.request.id});await wait(100);
  await emit(second.request.id,'error',{error:'CONTROLLED CURRENT FAILURE'});assert.match(await status(),/CONTROLLED CURRENT FAILURE/);
  assert.equal(await run("return document.getElementById('tv-start').disabled"),false);
  assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  await run("UiLocale.set('en',false);return true");assert.match(await status(),/CONTROLLED CURRENT FAILURE/);
  await screenshot('studio-owned-error-en');await run("UiLocale.set('tr',false);return true");
 }
 // Restore synthetic exact words before real Hi-Fi generation; never change the original file.
 await run("document.getElementById('tv-transcript').value="+JSON.stringify(fs.readFileSync(transcript,'utf8'))+";document.querySelector('[data-preset=balanced]').click();return true");
 if(real){
  await run("document.getElementById('tv-preview').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&['done','error'].includes(e.type)),'real GPU text preview',240000);
  const result=events.find(e=>e.kind==='text'&&['done','error'].includes(e.type));assert.equal(result.type,'done',JSON.stringify(result));
  assert(require('../src/voice-output').validVoiceOutput(result.path));
  await until(()=>run("return !document.getElementById('tv-output').hidden&&document.getElementById('tv-audio').readyState>=1"),'WAV preview metadata');
  await screenshot('studio-complete-tr');
  await until(()=>run("return document.getElementById('tv-history').options.length===1"),'completed voice history');
  const previous=result.path;
  await run("document.getElementById('tv-text').value="+JSON.stringify(text.repeat(20))+";document.getElementById('tv-text').dispatchEvent(new Event('input'));document.getElementById('tv-start').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='text_log'&&e.id!==result.id&&e.tail.includes('uretim basliyor')),'second real engine synthesis',120000);
  await run("document.getElementById('tv-stop').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='cancelled'),'real text cancellation',20000);
  assert(fs.existsSync(previous),'previous completed WAV survives cancellation');
  assert.equal((await run("return api.textVoice({action:'history'})")).results.length,1,'cancelled voice not listed');
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
 win.setMinimumSize(360,500);win.setContentSize(600,950);win.webContents.setZoomFactor(1.25);
 await run("UiLocale.set('tr',false);applyUiTheme('dark');document.querySelector('.text-voice-body').scrollTop=0;return true");
 await screenshot('studio-tr-narrow-125');
 const narrow=await run("const d=document.getElementById('textVoiceStudio'),b=document.querySelector('.text-voice-body').getBoundingClientRect(),footer=document.querySelector('.text-voice-footer').getBoundingClientRect();return {width:innerWidth,overflow:d.scrollWidth>d.clientWidth+1,bodyHeight:b.height,footerBottom:footer.bottom,height:innerHeight,buttons:['start','preview','stop'].map(id=>{const r=document.getElementById('tv-'+id).getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,minHeight:getComputedStyle(document.getElementById('tv-'+id)).minHeight,zoom:getComputedStyle(document.getElementById('tv-'+id)).zoom}})}");
 assert(narrow.width<=480,JSON.stringify(narrow));assert.equal(narrow.overflow,false);assert(narrow.bodyHeight>=200,JSON.stringify(narrow));assert(narrow.footerBottom<=narrow.height);for(const button of narrow.buttons){assert(button.left>=0&&button.right<=narrow.width);assert(button.height>=40,JSON.stringify(narrow));}
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({complete:true,realGeneration:real,sharedReferences:shared,eventOwnership:ownership,controlledStarts:starts.length,controlledStops:stops.length,metrics,narrow,events},null,2));
 console.log(JSON.stringify({out,complete:true,realGeneration:real,metrics}));app.exit(0);
}).catch(async error=>{console.error(error.stack);try{await screenshot('failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),real?300000:60000).unref();
