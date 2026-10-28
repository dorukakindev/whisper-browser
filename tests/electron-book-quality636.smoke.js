"use strict";
// Real Windows UI and book persistence; synthetic WAV/report, no model or personal profile.
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','book-quality636',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setPath('downloads',out);app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const source=path.join(out,'kitap.pdf'),wav=path.join(out,'controlled.wav');fs.writeFileSync(source,require('./helpers/pdf-fixture')(['This whole chapter requires listening, not approval of a subset.']));fs.writeFileSync(wav,require('./helpers/wav-fixture')(48000));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
const workflows=require('../src/media-workflows'),register=workflows.registerMediaWorkflows;let service;workflows.registerMediaWorkflows=options=>(service=register(options));
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const stop=Date.now()+15000;while(Date.now()<stop){if(await fn())return;await wait(70);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1280,900);win.showInactive();
 await run(`await initialSettingsReady;UiLocale.set('en',false);applyUiTheme('dark');await openPlayer();await openPdfReader();return true`);await until(()=>run(`return !!BookAssistantUI.assistant.state()`),'reader');
 const prepared=await run(`return AssistantAppActions.execute('prepare_book_narration',{from:1,to:1,text:'original'},AssistantAppActions.snapshot())`);assert.equal(prepared.status,'completed');
 await until(()=>run('return !!MediaWorkflowsUI.assistant.state()'),'production');
 const state=await run(`return MediaWorkflowsUI.assistant.state()`),prep=await run(`return api.mediaWorkflows({action:'book-prepare',id:${JSON.stringify(state.id)},chapter:0})`);assert(prep.ok,prep.error);
 service.capture({id:prep.request.id,path:wav,qualityIncomplete:true,qualityUnavailable:true,quality:{groups:[{key:'0',text:'Subset only.',audioStart:0,audioEnd:.5,status:'ready'}]}});
 const project=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(state.id)}})`);assert.equal(project.project.chapters[0].status,'review');assert(project.project.chapters[0].qualityMissing);assert.equal(project.project.chapters[0].groups[0].text,project.project.chapters[0].text);
 const blocked=await run(`return api.mediaWorkflows({action:'book-export-preview',id:${JSON.stringify(state.id)},chapters:[0]})`);assert.equal(blocked.ok,false);
 await run(`await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});return true`);await until(()=>run(`return document.querySelector('dialog[open]').textContent.includes('Automatic verification is missing')`),'quality warning');await run(`Array.from(document.querySelectorAll('dialog[open] p')).find(p=>p.textContent.includes('Automatic verification is missing')).scrollIntoView({block:'center',behavior:'instant'});return true`);await wait(150);fs.writeFileSync(path.join(out,'quality-review-en.png'),(await win.webContents.capturePage()).toPNG());
 win.setMinimumSize(0,0);win.setContentSize(800,760);await run(`UiLocale.set('tr',false);applyUiTheme('light');await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});return true`);await until(()=>run(`return document.querySelector('dialog[open]').textContent.includes('Otomatik doğrulama eksik')`),'TR warning');assert(await run(`const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1`));await run(`Array.from(document.querySelectorAll('dialog[open] p')).find(p=>p.textContent.includes('Otomatik doğrulama eksik')).scrollIntoView({block:'center',behavior:'instant'});return true`);await wait(150);fs.writeFileSync(path.join(out,'quality-review-tr-light.png'),(await win.webContents.capturePage()).toPNG());
 const nextPrep=await run(`return api.mediaWorkflows({action:'book-prepare',id:${JSON.stringify(state.id)},chapter:0})`);assert(nextPrep.ok,nextPrep.error);
 service.capture({id:nextPrep.request.id,path:wav,quality:{groups:Array.from({length:101},(_,i)=>({key:String(i+1),text:'Controlled review passage '+(i+1),audioStart:i/100,audioEnd:(i+1)/100,status:'review'}))}});
 const captured=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(state.id)}})`);assert.equal(captured.project.chapters[0].groups.length,101);
 win.setContentSize(1280,900);await run(`UiLocale.set('en',false);applyUiTheme('dark');await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});return true`);
 await until(()=>run(`return document.querySelectorAll('.mw-review-group').length===25`),'review pagination mount');
 assert.equal(await run(`return document.querySelectorAll('.mw-review-group').length`),25,'Only the current review page is mounted');
 await run(`const input=document.querySelector('.mw-review-page input');input.value='5';input.dispatchEvent(new Event('change'));return true`);
 assert.equal(await run(`return document.querySelectorAll('.mw-review-group').length`),1);assert(await run(`return document.querySelector('.mw-review-group').textContent.includes('101')&&document.querySelector('.mw-review-pager button:last-child').disabled`),'Last review group remains accessible');
 assert.equal(await run(`return document.querySelector('.mw-review-time').textContent`),'0:01.000 – 0:01.010','A short group must not display identical rounded endpoints');
 await run(`document.querySelector('.mw-review-pager').scrollIntoView({block:'center',behavior:'instant'});return true`);await wait(100);fs.writeFileSync(path.join(out,'review-page-en.png'),(await win.webContents.capturePage()).toPNG());
 win.setContentSize(800,760);await run(`UiLocale.set('tr',false);applyUiTheme('light');await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});return true`);
 await until(()=>run(`return document.querySelector('.mw-review-pager')?.textContent.includes('İnceleme sayfası')`),'Turkish review page');
 assert(await run(`const p=document.querySelector('.mw-review-pager'),input=p.querySelector('input'),b=p.getBoundingClientRect();return input.value==='5'&&p.textContent.includes('İnceleme sayfası')&&b.width>0&&b.right<=innerWidth+1`),'Page position and Turkish controls survive a narrow rerender');
 await run(`document.querySelector('.mw-review-pager').scrollIntoView({block:'center',behavior:'instant'});return true`);await wait(100);fs.writeFileSync(path.join(out,'review-page-tr-light.png'),(await win.webContents.capturePage()).toPNG());
 await run(`const input=document.querySelector('.mw-review-page input');input.value='1';input.dispatchEvent(new Event('change'));return true`);
 async function click(selector){
  const point=await run(`const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});const b=n.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}`);
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({...point,type,button:'left',clickCount:1});
 }
 await click('.mw-review-group .mw-review-actions button:last-child');
 await until(()=>run(`return !!document.querySelector('.mw-confirm[open]')`),'approval confirmation');
 await click('.mw-confirm button[type="submit"]');
 await until(()=>run(`return document.querySelector('.mw-review-group')?.dataset.groupKey==='2'`),'approved group removed');
 assert(await run(`return document.activeElement===document.querySelector('.mw-review-group button')`),'Focus follows the next review group');
 const approved=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(state.id)}})`);
 assert.equal(approved.project.chapters[0].groups[0].status,'ready');
 assert(approved.project.chapters[0].groups[0].manualApproval.audioHash);
 console.log(JSON.stringify({ok:true,out,partialCannotExport:true,wholeChapterReview:true,reviewPagination:{total:101,mounted:25,lastAccessible:true},modelAudio:false,manualApprovalAndFocus:true}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),45000).unref();
