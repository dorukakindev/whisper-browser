'use strict';
// Native production renderer + preload + IPC; disposable profile and synthetic speech only.
const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function arg(key){const i=process.argv.indexOf(key);assert(i>=0,key+' required');return path.resolve(process.argv[i+1]);}
const audition=process.argv.includes('--audition');
const reference=arg('--reference'),transcript=arg('--transcript'),engine=arg('--engine');
const real=process.argv.includes('--real-generation'),shared=process.argv.includes('--shared-references'),ownership=process.argv.includes('--event-ownership'),referenceRefresh=process.argv.includes('--reference-refresh');
assert(!(real&&ownership),'Controlled ownership checks cannot be real GPU generation');
const configFailure=process.argv.includes('--initialization-failure'),initialization=configFailure||process.argv.includes('--initialization'),configReplies=[];
const starts=[],stops=[];let copiedDetail='',copyReply=true,holdRefresh=false;const refreshReplies=[];
if(ownership||referenceRefresh||initialization){const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(channel,listener)=>handle(channel,async(event,request,...args)=>{
 if(initialization&&channel==='dub:textVoice'&&request?.action==='config'){const result=await listener(event,request,...args);return new Promise(resolve=>configReplies.push({result,resolve}));}
 if(channel==='dub:references'&&holdRefresh){const result=await listener(event,request,...args);return new Promise(resolve=>refreshReplies.push({result,resolve}));}
 if(ownership&&channel==='dub:textVoice'&&request?.action==='start')return new Promise(resolve=>starts.push({request,resolve}));
 if(ownership&&channel==='dub:cancel')return new Promise(resolve=>stops.push({request,resolve}));
 if(ownership&&channel==='clipboard:write'){copiedDetail=request;return copyReply;}
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
let win,run;const events=[];let realAcceptance=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timeout: '+label);}
async function screenshot(name){await wait(350);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main window');
 win.setContentSize(1360,1000);win.showInactive();
 const send=win.webContents.send.bind(win.webContents);win.webContents.send=(channel,...args)=>{if(channel==='dub:event')events.push(args[0]);return send(channel,...args);};
 run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 if(initialization){
  await until(()=>configReplies.length===1,'initial config request held');
  await until(()=>run("return document.getElementById('textVoiceStudio')?.open"),'loading dialog');
  assert.equal(await run("return ['text','pick-reference','load','steps'].every(id=>document.getElementById('tv-'+id).disabled)"),true,'Initial config must lock edits until the saved reference/settings are known');
  await screenshot('studio-initializing-tr');
  await run("void TextVoiceStudioUI.open();void TextVoiceStudioUI.open();return true");await wait(150);
  assert.equal(configReplies.length,1,'Concurrent opens must share one config request');
  await run("document.getElementById('textVoiceStudio').close();document.body.tabIndex=-1;document.body.focus();return true");
  configReplies[0].resolve(configFailure?{ok:false,error:'Synthetic closed config failure'}:configReplies[0].result);await wait(150);
  assert.equal(await run("return document.getElementById('textVoiceStudio').open"),false,'Late config cannot reopen a closed dialog');
  assert.equal(await run("return document.activeElement===document.body"),true,'Late config cannot steal focus');
  if(configFailure){
   await run("void TextVoiceStudioUI.open();return true");await until(()=>configReplies.length===2,'retry after closed failure');
   configReplies[1].resolve({ok:false,error:'Synthetic visible config failure'});
   await until(()=>run("return document.getElementById('tv-error-detail').textContent==='Synthetic visible config failure'"),'visible config failure');
   assert.equal(await run("return document.getElementById('tv-pick-reference').disabled&&!document.getElementById('tv-config-retry').hidden&&!document.getElementById('tv-config-retry').disabled"),true,'Unknown settings must retain a safe explicit retry');
   await screenshot('studio-config-error-tr');
   await run("document.getElementById('tv-config-retry').click();return true");await until(()=>configReplies.length===3,'retry after visible failure');
   configReplies[2].resolve(configReplies[2].result);
   await until(()=>run("return !document.getElementById('tv-pick-reference').disabled"),'retry config ready');
   assert.equal(configReplies.length,3);
  }else{
   await run("return TextVoiceStudioUI.open()");
   assert.equal(configReplies.length,1,'Successful initial config can be reused');
  }
 }
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
 assert.equal(await run("const retry=document.getElementById('tv-config-retry');return retry.hidden&&getComputedStyle(retry).display==='none'"),true,'Ready studio must not display configuration recovery');
 const paneLayout=await run("const rail=document.querySelector('.text-voice-rail'),editor=document.querySelector('.text-voice-manuscript'),before=editor.getBoundingClientRect().top;rail.scrollTop=rail.scrollHeight;const moved=rail.scrollTop;const after=editor.getBoundingClientRect().top;rail.scrollTop=0;return {moved,editorStable:before===after,railOverflow:getComputedStyle(rail).overflowY,editorOverflow:getComputedStyle(editor).overflowY,keyboardReachable:rail.tabIndex===0&&editor.tabIndex===0,labelled:!!document.getElementById(rail.getAttribute('aria-labelledby'))&&!!document.getElementById(editor.getAttribute('aria-labelledby'))};");
 assert(paneLayout.moved>0&&paneLayout.editorStable&&paneLayout.keyboardReachable&&paneLayout.labelled,JSON.stringify(paneLayout));assert.equal(paneLayout.railOverflow,'auto');assert.equal(paneLayout.editorOverflow,'auto');
 // Real native keyboard input: navigating presets never silently applies settings.
 const key=async(keyCode)=>{win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Return'||keyCode===' ')win.webContents.sendInputEvent({type:'char',keyCode:keyCode==='Return'?'\r':' '});win.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(100);};
 const presetState=()=>run("return {focus:document.activeElement.dataset.preset||document.activeElement.id,steps:document.getElementById('tv-steps').value,chars:document.getElementById('tv-max_chars').value,pressed:Array.from(document.querySelectorAll('[data-preset][aria-pressed=true]')).map(b=>b.dataset.preset),tabStops:document.querySelectorAll('[data-preset][tabindex=\"0\"]').length}");
 await run("document.querySelector('[data-preset=balanced]').focus();return true");
 await key('Right');assert.equal((await presetState()).focus,'book');assert.deepEqual((await presetState()).pressed,['balanced']);
 await key('Return');assert.deepEqual((await presetState()).pressed,['book']);assert.equal((await presetState()).chars,'600');
 await key('End');assert.equal((await presetState()).focus,'fast');assert.deepEqual((await presetState()).pressed,['book']);
 await key(' ');assert.deepEqual((await presetState()).pressed,['fast']);assert.equal((await presetState()).steps,'10');
 await key('Right');assert.equal((await presetState()).focus,'balanced');
 await key('Left');assert.equal((await presetState()).focus,'fast');
 await key('Home');assert.equal((await presetState()).focus,'balanced');
 assert.equal((await presetState()).tabStops,1);
 await key('Tab');assert.equal((await presetState()).focus,'tv-mode');
 await run("document.getElementById('tv-steps').value='17';document.getElementById('tv-steps').dispatchEvent(new Event('input'));return true");
 assert.deepEqual((await presetState()).pressed,[]);assert.equal((await presetState()).tabStops,1,'Custom values keep the toolbar keyboard reachable');
 await run("document.querySelector('[data-preset=balanced]').focus();return true");await key('Return');
 await screenshot('studio-keyboard-presets');
 if(audition){
  await run("const ref=document.getElementById('tv-reference-audio'),out=document.getElementById('tv-audio');document.getElementById('tv-output').hidden=false;out.src=ref.src;out.load();return true");
  await until(()=>run("return ['tv-reference-audio','tv-audio'].every(id=>document.getElementById(id).readyState>=2)"),'real WAV players');
  await run("return document.getElementById('tv-reference-audio').play().then(()=>true)");await wait(100);
  await run("return document.getElementById('tv-audio').play().then(()=>true)");await wait(100);
  assert.equal(await run("return document.getElementById('tv-reference-audio').paused&&!document.getElementById('tv-audio').paused"),true,'Output playback must stop the reference');
  const outputPosition=await run("return document.getElementById('tv-audio').currentTime");
  await run("return document.getElementById('tv-reference-audio').play().then(()=>true)");await wait(100);
  assert.equal(await run("return !document.getElementById('tv-reference-audio').paused&&document.getElementById('tv-audio').paused"),true,'Reference playback must stop the output');
  assert(Math.abs((await run("return document.getElementById('tv-audio').currentTime"))-outputPosition)<.15,'Switching preserves playback position');
  await run("document.getElementById('textVoiceStudio').close();return true");await wait(100);
  assert.equal(await run("return ['tv-reference-audio','tv-audio'].every(id=>document.getElementById(id).paused)"),true,'Closing stops both players');
  await run("return TextVoiceStudioUI.open()");
  await run("document.getElementById('tv-output').hidden=true;return true");
 }
 await screenshot('studio-tr-dark');
 await run("document.getElementById('tv-pick-reference').click();return true");
 await until(()=>run("return document.getElementById('tv-status').textContent.includes('Referans seçildi')"),'local reference');
 await run("document.getElementById('tv-transcript').value='Editable local transcript draft.';document.getElementById('tv-transcript').dispatchEvent(new Event('input'));document.getElementById('tv-refresh').click();return true");
 await wait(200);assert.equal(await run("return document.getElementById('tv-transcript').value"),'Editable local transcript draft.');
 if(referenceRefresh){
  const local=path.join(out,'local-refresh.wav');fs.copyFileSync(reference,local);picked=local;
  await run("document.getElementById('tv-pick-reference').click();return true");await until(()=>run("return document.getElementById('tv-reference-name').value==='local-refresh'"),'local fixture reference');
  await run("document.getElementById('tv-transcript').value='UNSAVED EXACT DRAFT';document.getElementById('tv-transcript').dispatchEvent(new Event('input'));return true");
  const localId=await run("return document.getElementById('tv-reference').value");
  fs.unlinkSync(local);
  await run("document.getElementById('tv-refresh').click();return true");await wait(250);
  assert.equal(await run("return document.getElementById('tv-start').disabled"),true,'Removed local reference cannot remain ready after refresh');
  assert.equal(await run("return document.getElementById('tv-reference-audio').hidden&&!document.getElementById('tv-reference-audio').getAttribute('src')"),true,'Unavailable reference cannot leave an old audio preview');
  assert.equal(await run("return document.getElementById('tv-transcript').value"),'UNSAVED EXACT DRAFT');
  assert.equal(await run("return document.getElementById('tv-reference').value"),localId,'Missing selection is explicit, never silently replaced');
  await screenshot('studio-reference-unavailable-tr');
  fs.copyFileSync(reference,local);await run("document.getElementById('tv-refresh').click();return true");await until(()=>run("return !document.getElementById('tv-start').disabled"),'local restored');
  assert.equal(await run("return document.getElementById('tv-transcript').value"),'UNSAVED EXACT DRAFT');
  await run("document.querySelector('.text-voice-library').open=true;document.getElementById('tv-reference-name').value='Reference refresh fixture';document.getElementById('tv-reference-name').dispatchEvent(new Event('input'));document.getElementById('tv-save-reference').click();return true");
  await until(()=>run("return !document.getElementById('tv-save-reference').disabled&&document.getElementById('tv-reference').selectedOptions[0]?.textContent==='Reference refresh fixture'"),'shared fixture saved');
  const list=await run("return api.listVoiceReferences()"),item=list.references.find(v=>v.name==='Reference refresh fixture');assert(item);
  const bytes=fs.readFileSync(item.path);fs.unlinkSync(item.path);
  await run("document.getElementById('tv-refresh').click();return true");await wait(250);
  assert.equal(await run("return document.getElementById('tv-start').disabled&&document.getElementById('tv-default-reference').disabled&&document.getElementById('tv-reference-audio').hidden"),true,'Missing library audio disables every use action and preview');
  assert.equal(await run("return document.getElementById('tv-reference').value"),item.id);
  await run("UiLocale.set('en',false);return true");assert.match(await run("return document.getElementById('tv-reference').selectedOptions[0].textContent"),/Unavailable/);
  await screenshot('studio-reference-unavailable-en');
  win.setMinimumSize(360,500);win.setContentSize(600,950);win.webContents.setZoomFactor(1.25);await run("UiLocale.set('tr',false);applyUiTheme('light');return true");await screenshot('studio-reference-unavailable-tr-narrow');assert.equal(await run("return document.getElementById('textVoiceStudio').scrollWidth>document.getElementById('textVoiceStudio').clientWidth+1"),false);win.setContentSize(1360,1000);win.webContents.setZoomFactor(1);await run("applyUiTheme('dark');return true");
  fs.writeFileSync(item.path,bytes);await run("document.getElementById('tv-refresh').click();return true");await until(()=>run("return !document.getElementById('tv-start').disabled"),'library restored');
  assert.equal(await run("return document.getElementById('tv-transcript').value"),'UNSAVED EXACT DRAFT');
  assert.equal(await run("return document.getElementById('tv-reference').value"),item.id);await run("UiLocale.set('tr',false);return true");
  holdRefresh=true;await run("document.getElementById('tv-refresh').click();return true");await until(()=>refreshReplies.length===1,'first delayed refresh');
  assert.equal(await run("return document.getElementById('tv-start').disabled"),true,'Reference checks lock production until verified');
  await run("return api.openTextVoiceUI()");await until(()=>refreshReplies.length===2,'newer refresh after reopen');
  holdRefresh=false;refreshReplies[1].resolve(refreshReplies[1].result);await until(()=>run("return !document.getElementById('tv-start').disabled"),'newest refresh applied');
  refreshReplies[0].resolve({...refreshReplies[0].result,references:[]});await wait(150);
  assert.equal(await run("return document.getElementById('tv-reference').value"),item.id);assert.equal(await run("return document.getElementById('tv-start').disabled"),false,'Late empty list cannot invalidate a newer verified reference');
  assert.equal(await run("return document.getElementById('tv-transcript').value"),'UNSAVED EXACT DRAFT');
  picked=reference;
 }
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
  await emit(first.request.id,'progress',{done:4,total:4});assert.equal(await run("return document.getElementById('tv-progress').value"),99,'All counters cannot claim the output is ready');
  await emit(first.request.id,'status',{stage:'postprocess'});assert.equal(await status(),'Ses parçaları birleştiriliyor ve son işlem yapılıyor…');await screenshot('studio-postprocess-tr');
  await run("UiLocale.set('en',false);return true");assert.equal(await status(),'Joining audio and applying final processing…');
  await emit(first.request.id,'status',{stage:'output_check'});assert.equal(await status(),'Checking the audio file…');await run("UiLocale.set('tr',false);return true");
  await run("document.getElementById('tv-stop').click();return true");await until(()=>stops.length===1,'scoped stop');assert.equal(stops[0].request.id,first.request.id);
  const stoppingState=await status();await emit(first.request.id,'progress',{done:2,total:4});await emit(first.request.id,'status',{stage:'normalizing'});assert.equal(await status(),stoppingState,'Progress during cancellation must not claim the job resumed');assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  await emit(first.request.id,'cancelled');
  const second=await start();assert.notEqual(second.request.id,first.request.id);
  const secondState=await status();
  first.resolve({ok:false,error:'LATE START FAILURE'});stops[0].resolve({ok:false,error:'LATE STOP FAILURE'});await wait(150);
  assert.equal(await status(),secondState,'Late invoke replies cannot overwrite the next job');
  await emit(first.request.id,'progress',{done:99,total:100});assert.equal(await status(),secondState);
  second.resolve({ok:true,id:second.request.id});await wait(100);
  const failureDetail='CONTROLLED CURRENT FAILURE\n'+('Synthetic engine detail: <b>not markup</b> '+String.fromCharCode(304,351,305,107)+' / '+ 'long-token'.repeat(15)+'\n').repeat(35);
  const focusBeforeError=await run("return document.activeElement.id");await emit(second.request.id,'error',{error:failureDetail});assert.equal(await run("return document.activeElement.id"),focusBeforeError,'Failure must not steal keyboard focus');assert.equal(await status(),'\u00dcretim tamamlanamad\u0131','Long details cannot occupy the footer status');
  assert.equal(await run("return document.getElementById('tv-start').disabled"),false);
  assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  assert.equal(await run("return document.getElementById('tv-error-detail').textContent"),failureDetail);
  assert.equal(await run("return document.getElementById('tv-error').querySelector('b')"),null,'Engine details are text, never HTML');
  await run("document.getElementById('tv-error-open').click();return true");
  assert.equal(await run("return document.activeElement===document.querySelector('#tv-error>summary')"),true);
  copyReply=false;await run("document.getElementById('tv-error-copy').click();return true");await until(()=>run("return document.getElementById('tv-error-copy-status').textContent.includes('kopyalanamad')"),'copy failure is visible');assert.equal(await status(),'\u00dcretim tamamlanamad\u0131');
  copyReply=true;copiedDetail='';await run("document.getElementById('tv-error-copy').click();return true");await until(()=>copiedDetail===failureDetail,'exact synthetic detail copied through IPC');
  await run("UiLocale.set('en',false);return true");assert.equal(await status(),'Production did not complete');
  assert.equal(await run("return document.getElementById('tv-error-detail').textContent"),failureDetail,'Locale cannot translate engine evidence');
  assert.equal(await run("return document.getElementById('tv-error').open"),true);
  const retry=await start();assert.equal(retry.request.text,second.request.text);assert.equal(retry.request.transcript,second.request.transcript);assert.equal(retry.request.referenceId,second.request.referenceId);assert.deepEqual(retry.request.settings,second.request.settings);
  assert.equal(await run("return document.getElementById('tv-error').hidden&&document.getElementById('tv-error-detail').textContent===''") ,true,'New attempt clears old feedback');
  retry.resolve({ok:true,id:retry.request.id});await wait(100);await emit(retry.request.id,'error',{error:failureDetail});
  await run("document.getElementById('tv-error-open').click();return true");
  await screenshot('studio-owned-error-en');await run("UiLocale.set('tr',false);return true");
 }
 // Restore synthetic exact words before real Hi-Fi generation; never change the original file.
 await run("document.getElementById('tv-transcript').value="+JSON.stringify(fs.readFileSync(transcript,'utf8'))+";document.querySelector('[data-preset=balanced]').click();return true");
 if(real){
  const freshSeed=require('node:crypto').randomInt(1,2147483647);await run("document.getElementById('tv-seed').value="+freshSeed+";document.getElementById('tv-seed').dispatchEvent(new Event('input'));document.getElementById('tv-preview').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&['done','error'].includes(e.type)),'real GPU text preview',240000);
  const result=events.find(e=>e.kind==='text'&&['done','error'].includes(e.type));assert.equal(result.type,'done',JSON.stringify(result));
  assert(require('../src/voice-output').validVoiceOutput(result.path));
  const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
  execFileSync('C:/ffmpeg/bin/ffmpeg.exe',['-v','error','-i',result.path,'-f','null','-'],{stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true});
  const completedHash=createHash('sha256').update(fs.readFileSync(result.path)).digest('hex');
  const stages=events.filter(e=>e.id===result.id&&e.type==='status').map(e=>e.stage);assert.deepEqual(stages,['model_load','synthesis','postprocess','output_check']);
  const completedSummary=JSON.parse(fs.readFileSync(result.logPath,'utf8'));for(const stage of stages)assert(Number.isFinite(completedSummary.phases[stage])&&completedSummary.phases[stage]>=0,JSON.stringify(completedSummary.phases));
  assert.equal(await run("return document.getElementById('tv-progress').value"),100);
  await until(()=>run("return !document.getElementById('tv-output').hidden&&document.getElementById('tv-audio').readyState>=1"),'WAV preview metadata');
  await screenshot('studio-complete-tr');
  await until(()=>run("return document.getElementById('tv-history').options.length===1"),'completed voice history');
  const previous=result.path;let cancellationStarted=0;
  await run("document.getElementById('tv-text').value="+JSON.stringify(text.repeat(20))+";document.getElementById('tv-text').dispatchEvent(new Event('input'));document.getElementById('tv-start').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='text_log'&&e.id!==result.id&&e.tail.includes('uretim basliyor')),'second real engine synthesis',120000);
  cancellationStarted=Date.now();await run("document.getElementById('tv-stop').click();return true");
  await until(()=>events.some(e=>e.kind==='text'&&e.type==='cancelled'),'real text cancellation',20000);
  const cancelled=events.find(e=>e.kind==='text'&&e.type==='cancelled'),cancelledSummary=JSON.parse(fs.readFileSync(cancelled.logPath,'utf8'));
  assert.equal(createHash('sha256').update(fs.readFileSync(previous)).digest('hex'),completedHash,'Cancellation cannot alter the previous completed PCM container');
  realAcceptance={freshSeed,completedId:result.id,elapsedSeconds:result.elapsedSeconds,stages,phases:completedSummary.phases,progress:completedSummary.progress,fullDecode:true,completedHashPreserved:true,cancelledId:cancelled.id,cancellationMilliseconds:Date.now()-cancellationStarted,cancelledResult:cancelledSummary.result,cancelledPhases:cancelledSummary.phases,humanListening:false};
  assert(fs.existsSync(previous),'previous completed WAV survives cancellation');
  assert.equal((await run("return api.textVoice({action:'history'})")).results.length,1,'cancelled voice not listed');
  assert.equal(await run("return document.getElementById('tv-stop').disabled"),true);
  await screenshot('studio-stopped-tr');
  await run("document.getElementById('tv-text').value="+JSON.stringify(text)+";document.getElementById('tv-text').dispatchEvent(new Event('input'));return true");
 }
 win.setContentSize(1000,950);win.webContents.setZoomFactor(1.25);
 await run("UiLocale.set('en',false);applyUiTheme('light');document.querySelector('.text-voice-body').scrollTop=0;return true");
 const secondaryContrast=await run("return ['load','error-copy'].map(id=>{const node=document.getElementById('tv-'+id),probe=document.createElement('span');probe.style.backgroundColor='var(--bg-3)';node.parentElement.append(probe);const expectedBackground=getComputedStyle(probe).backgroundColor;probe.remove();const s=getComputedStyle(node),rgb=value=>value.match(/[0-9.]+/g).slice(0,3).map(Number),lum=value=>rgb(value).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0),a=lum(s.color),b=lum(s.backgroundColor);return {id,expectedBackground,color:s.color,background:s.backgroundColor,bg3:s.getPropertyValue('--bg-3'),contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};})");
 console.log(JSON.stringify({secondaryContrast}));for(const button of secondaryContrast){assert(button.contrast>=4.5,JSON.stringify(button));assert.equal(button.background,button.expectedBackground,'Theme changes must not leave an old button surface behind');}
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
 if(ownership){
  await run("document.getElementById('tv-error-open').click();return true");
  const errorLayout=await run("const error=document.getElementById('tv-error'),summary=error.querySelector('summary'),r=summary.getBoundingClientRect(),footer=document.querySelector('.text-voice-footer').getBoundingClientRect();return {open:error.open,summaryVisible:r.top>=0&&r.bottom<=footer.top,scrollable:document.getElementById('tv-error-detail').scrollHeight>document.getElementById('tv-error-detail').clientHeight,detailCount:document.getElementById('tv-error-detail').textContent.length};");
  assert(errorLayout.open&&errorLayout.summaryVisible&&errorLayout.scrollable,JSON.stringify(errorLayout));
 }
 await screenshot('studio-tr-narrow-125');
 const narrow=await run("const d=document.getElementById('textVoiceStudio'),b=document.querySelector('.text-voice-body').getBoundingClientRect(),footer=document.querySelector('.text-voice-footer').getBoundingClientRect();return {width:innerWidth,overflow:d.scrollWidth>d.clientWidth+1,bodyHeight:b.height,footerBottom:footer.bottom,height:innerHeight,buttons:['start','preview','stop'].map(id=>{const r=document.getElementById('tv-'+id).getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,minHeight:getComputedStyle(document.getElementById('tv-'+id)).minHeight,zoom:getComputedStyle(document.getElementById('tv-'+id)).zoom}})}");
 assert(narrow.width<=480,JSON.stringify(narrow));assert.equal(narrow.overflow,false);assert(narrow.bodyHeight>=200,JSON.stringify(narrow));assert(narrow.footerBottom<=narrow.height);for(const button of narrow.buttons){assert(button.left>=0&&button.right<=narrow.width);assert(button.height>=40,JSON.stringify(narrow));}
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({complete:true,audition,realGeneration:real,initialization,configFailure,configRequests:configReplies.length,sharedReferences:shared,eventOwnership:ownership,referenceRefresh,realAcceptance,controlledStarts:starts.length,controlledStops:stops.length,secondaryContrast,paneLayout,metrics,narrow,events},null,2));
 console.log(JSON.stringify({out,complete:true,realGeneration:real,metrics}));app.exit(0);
}).catch(async error=>{console.error(error.stack);try{await screenshot('failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),real?300000:60000).unref();
