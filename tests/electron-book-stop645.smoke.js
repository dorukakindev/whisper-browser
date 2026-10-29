'use strict';
// Actual Windows main/preload/book UI. Controlled IPC latency; no model starts.
const {app,BrowserWindow,dialog,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','book-stop645',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setPath('downloads',out);app.setAppPath(root);for(const flag of ['disable-gpu','disable-renderer-backgrounding','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
const source=path.join(out,'kitap.pdf');fs.writeFileSync(source,require('./helpers/pdf-fixture')(['An original chapter for cancellation acceptance.']));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
const wav=path.join(out,'controlled.wav');fs.writeFileSync(wav,require('./helpers/wav-fixture')(240000));
const workflows=require('../src/media-workflows'),register=workflows.registerMediaWorkflows;let service;
workflows.registerMediaWorkflows=options=>(service=register(options));
let hold=null,entered=false,release=null,dubStarts=0,unprepared=0,allowStart=false,planRequests=0,lastVoiceRequest;
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>handle(name,name==='dub:start'?async(e,r)=>{
 dubStarts++;if(!allowStart)return {ok:false,error:'Unexpected model start in controlled cancellation test'};
 lastVoiceRequest=r;setTimeout(()=>{service.capture({id:r.id,path:wav,quality:{groups:[{key:'1',text:'A real persisted chapter 1000.',audioStart:0,audioEnd:10,status:'ready'}]}});e.sender.send('dub:event',{id:r.id,type:'done'});},30);return {ok:true};
}:name==='dub:plan'?async()=>{planRequests++;return {ok:true,groups:[{key:'1'}]};}:name==='media-workflows:request'?async(e,r)=>{
 const result=await fn(e,r);if(r.action==='book-unprepare'&&result.released)unprepared++;
 if(r.action===hold){entered=true;await new Promise(resolve=>release=resolve);}return result;
}:fn);
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(40);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1280,900);win.showInactive();
 await run(`await initialSettingsReady;UiLocale.set('en',false);applyUiTheme('dark');await openPlayer();await openPdfReader();return true`);await until(()=>run(`return !!BookAssistantUI.assistant.state()`),'reader');
 const prepared=await run(`return AssistantAppActions.execute('prepare_book_narration',{from:1,to:1,text:'original'},AssistantAppActions.snapshot())`);assert.equal(prepared.status,'completed');
 const state=await run(`return MediaWorkflowsUI.assistant.state()`);assert(state?.id);
 assert(await run(`return document.querySelector('[data-book-stop]').disabled`),'Idle stop is disabled');
 for(const phase of ['book-save','book-prepare','book-save-close']){
  hold=phase==='book-save-close'?'book-save':phase;entered=false;release=null;
  await run(`const input=document.querySelector('textarea[data-chapter]');input.value+=' Edited.';input.dispatchEvent(new Event('input'));Array.from(document.querySelectorAll('.mw-transport button')).find(b=>b.textContent==='Generate selected chapters').click();return true`);
  await until(()=>entered,'held '+phase);
  assert(await run(`return !document.querySelector('[data-book-stop]').disabled`),'Stop is available while own preparation runs');
  if(phase==='book-save-close')await run(`document.getElementById('mediaWorkflowsDialog').close();return true`);
  else await run(`Array.from(document.querySelectorAll('.mw-transport button')).find(b=>b.textContent==='Stop').click();return true`);
  hold=null;release();
  await until(()=>run(`return !MediaWorkflowsUI.assistant.state()?.busy`),'stopped '+phase);
  assert.equal(dubStarts,0,'No synthesis may start after '+phase+' cancellation');
  if(phase!=='book-save-close')assert(await run(`return document.querySelector('[data-book-stop]').disabled`),'Stop returns to disabled after cancellation');
  const book=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(state.id)}})`);assert.equal(book.project.chapters[0].activeJob??null,null,'No unstarted running marker remains');
  if(phase==='book-prepare'){
   assert.equal(unprepared,1);
   for(const [name,width,locale,theme] of [['book-actions-en-dark',1280,'en','dark'],['book-actions-tr-light-narrow',700,'tr','light']]){
    win.setMinimumSize(360,500);win.setContentSize(width,900);win.webContents.setZoomFactor(width===700?1.25:1);
    await run(`UiLocale.set(${JSON.stringify(locale)},false);applyUiTheme(${JSON.stringify(theme)});await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});document.querySelector('.mw-transport-secondary').open=true;document.querySelector('.mw-transport').scrollIntoView({block:'end',behavior:'instant'});return true`);
    await wait(350);
    const layout=await run(`const editor=document.querySelector('textarea[data-chapter]'),bar=document.querySelector('.mw-transport'),d=document.getElementById('mediaWorkflowsDialog');return {overlaps:editor.getBoundingClientRect().bottom>bar.getBoundingClientRect().top,overflow:d.scrollWidth>d.clientWidth+1,stopDisabled:bar.querySelector('[data-book-stop]').disabled,secondary:!!bar.querySelector('.mw-transport-secondary'),width:innerWidth};`);
    if(width===700)assert(layout.width<=560,JSON.stringify(layout));
    assert.equal(layout.overlaps,false);assert.equal(layout.overflow,false);assert(layout.stopDisabled&&layout.secondary);
    fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
   }
   win.setContentSize(1280,900);win.webContents.setZoomFactor(1);await run(`UiLocale.set('en',false);applyUiTheme('dark');await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});return true`);
  }
 }
 // A controlled persisted project checks the full 1,000-chapter UI boundary,
 // not the PDF importer or real speech generation.
 await wait(80);
 const storage=require('../src/voice-storage').voiceStorage(app),manifest=path.join(storage.input,'Kitap projeleri',state.id,'project.json');
 const large=JSON.parse(fs.readFileSync(manifest,'utf8'));large.format='txt';large.chapters=Array.from({length:1000},(_,id)=>({id,title:'Chapter '+(id+1),text:'A real persisted chapter '+(id+1)+'.',status:'pending'}));large.selectedChapters=[0];fs.writeFileSync(manifest,JSON.stringify(large));
 const largeUi=await run(`const before=performance.now();await MediaWorkflowsUI.openProject(${JSON.stringify(state.id)});await new Promise(requestAnimationFrame);return {milliseconds:performance.now()-before,chapters:document.querySelectorAll('.mw-chapter').length,domNodes:document.getElementById('mediaWorkflowsDialog').querySelectorAll('*').length,heapBytes:performance.memory?.usedJSHeapSize||null};`);
 assert.equal(largeUi.chapters,1000);assert(largeUi.milliseconds<10000,'UI must finish within the bounded native smoke window');
 await run(`document.querySelectorAll('.mw-chapter button')[999].click();return true`);await until(()=>run(`return document.querySelector('textarea[data-chapter]')?.dataset.chapter==='999'`),'last chapter editor');
 const selected=await run(`return AssistantAppActions.execute('select_book_chapters',{from:998,to:1000},AssistantAppActions.snapshot())`);assert.equal(selected.status,'completed');
 const savedSelection=await run(`return api.mediaWorkflows({action:'book-open',id:${JSON.stringify(state.id)}})`);assert.deepEqual(savedSelection.project.selectedChapters,[997,998,999]);
 assert(await run(`return MediaWorkflowsUI.assistant.state().currentChapter===1000&&document.querySelectorAll('.mw-chapter input:checked').length===3`),'Last chapter and exact selected range remain accessible');
 await run(`document.querySelector('.mw-chapter:last-child').scrollIntoView({block:'nearest',behavior:'instant'});return true`);await wait(100);fs.writeFileSync(path.join(out,'last-chapter-selection.png'),(await win.webContents.capturePage()).toPNG());
 await run(`return AssistantAppActions.execute('select_book_chapters',{from:1000,to:1000},AssistantAppActions.snapshot())`);allowStart=true;
 const accepted=await run(`return AssistantAppActions.execute('start_book_narration',{},AssistantAppActions.snapshot())`);assert.equal(accepted.status,'accepted');assert.equal(accepted.jobId,lastVoiceRequest.id);
 await until(()=>run(`return !MediaWorkflowsUI.assistant.state()?.busy`),'controlled book completion');
 const listen=await run(`return AssistantAppActions.execute('book_chapter',{chapter:1000,operation:'listen'},AssistantAppActions.snapshot())`);assert.equal(listen.status,'completed');
 await until(()=>run(`return document.querySelector('#mediaWorkflowsDialog .mw-body > audio')?.readyState>=1`),'actual local WAV metadata');
 assert(await run(`const a=document.querySelector('#mediaWorkflowsDialog .mw-body > audio');a.muted=true;a.currentTime=.5;a.dispatchEvent(new Event('timeupdate'));a.pause();return a.duration===10&&!!document.querySelector('.mw-spoken[aria-current="true"]')`),'Silent local WAV loads and its actual group can be highlighted');
 const regenerated=await run(`return AssistantAppActions.execute('book_chapter',{chapter:1000,operation:'regenerate'},AssistantAppActions.snapshot())`);assert.equal(regenerated.status,'accepted');assert.equal(regenerated.jobId,lastVoiceRequest.id);assert.equal(lastVoiceRequest.forceAll,true);
 await until(()=>run(`return !MediaWorkflowsUI.assistant.state()?.busy`),'controlled regeneration');assert.equal(dubStarts,2);assert.equal(planRequests,1);
 console.log(JSON.stringify({ok:true,out,phases:3,cancelledPhaseStarts:0,dubStarts,unprepared,largeUi,lastChapter:1000,selected:[998,999,1000],assistant:['select','start accepted','listen/highlight','regenerate accepted'],realModel:false}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),50000).unref();
