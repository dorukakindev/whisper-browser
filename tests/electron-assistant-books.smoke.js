'use strict';
const {app,BrowserWindow,dialog,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-books',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setPath('downloads',out);app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const source=path.join(out,'Türkçe kitap.pdf');fs.writeFileSync(source,require('./helpers/pdf-fixture')(['First page source evidence.','Second page chosen evidence.','Third page not selected.']));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
let starts=0,rejectStart=true;const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>handle(name,name==='dub:config'?async()=>({ok:true,ready:true,reference:'fixture.wav'}):name==='dub:references'?async()=>({ok:true,activeId:'fixture',folder:'',references:[]}):name==='dub:start'?async()=>{starts++;return rejectStart?{ok:false,error:'Controlled engine rejection'}:{ok:true};}:fn);
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1440,1000);win.show();win.webContents.focus();
 await run(`await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await openPlayer();await openPdfReader();return true`);await until(()=>run(`return !!player.pdfReader?.pages.get(1)&&!!BookAssistantUI.assistant.state()`),'PDF text');
 const context=await run(`return await AssistantAppActions.execute('get_book_context',{},AssistantAppActions.snapshot())`);assert(context.reader.source.text.includes('First page'));assert(context.reader.canPrepare);assert.equal(starts,0);
 // Retain an old owner to verify page movement invalidates a queued action.
 await run(`window.oldBookOwner=AssistantAppActions.snapshot();document.getElementById('pdfReaderPage').value='2';document.getElementById('pdfReaderPage').dispatchEvent(new Event('change'));return true`);
 await until(()=>run(`return player.pdfReader.currentPage===2&&!!player.pdfReader.pages.get(2)`),'page 2');assert(await run(`try{await AssistantAppActions.execute('prepare_book_narration',{from:1,to:1},oldBookOwner);return false}catch(_){return true}`));
 const prepared=await run(`return AssistantAppActions.execute('prepare_book_narration',{from:2,to:2,text:'original'},AssistantAppActions.snapshot())`);assert.equal(prepared.status,'completed');assert.equal(starts,0);await until(()=>run(`return !!MediaWorkflowsUI.assistant.state()`),'production');
 const production=await run(`return MediaWorkflowsUI.assistant.state()`);assert.equal(production.total,1);assert.deepEqual(production.selected,[1]);
 assert(await run(`const c=await api.mediaWorkflows({action:'book-open',id:MediaWorkflowsUI.assistant.state().id});return c.project.chapters[0].text.includes('Second page')&&!c.project.chapters[0].text.includes('Third page')`));
 assert(await run(`try{await AssistantAppActions.execute('select_book_chapters',{from:2,to:2},AssistantAppActions.snapshot());return false}catch(_){return true}`));
 assert.equal((await run(`return AssistantAppActions.execute('select_book_chapters',{from:1,to:1},AssistantAppActions.snapshot())`)).status,'completed');
 assert(await run(`try{await AssistantAppActions.execute('preview_book_export',{},AssistantAppActions.snapshot());return false}catch(_){return true}`),'Missing chapter audio cannot pass M4B preview');
 let layout=null;
 if(process.argv.includes('--layout-acceptance')){
  assert.equal(await run(`return document.querySelector('.mw-editor>h2').textContent`),'Sayfa 2');
  const persisted=await run(`return (await api.mediaWorkflows({action:'book-open',id:MediaWorkflowsUI.assistant.state().id})).project.chapters[0].title`);
  assert.equal(persisted,'Page / Sayfa 2','Presentation must not rewrite the stored chapter');
  await run(`UiLocale.set('en',false);return true`);
  assert.equal(await run(`return document.querySelector('.mw-editor>h2').textContent`),'Page 2');
  assert.match(await run(`return document.querySelector('.mw-summary .mw-muted').textContent`),/1 chapter · 0 ready/);
  assert.equal(await run(`return document.querySelector('.mw-chapter input').getAttribute('aria-label')`),'Select: Page 2');
  await run(`UiLocale.set('tr',false);return true`);
  const short=await run(`return document.querySelector('.mw-editor>textarea').getBoundingClientRect().height`);
  const original=await run(`return document.querySelector('.mw-editor>textarea').value`);
  await run(`const text=document.querySelector('.mw-editor>textarea');text.value='A long paragraph for checking the reading surface. '.repeat(400);text.dispatchEvent(new Event('input'));return true`);
  await wait(100);
  const long=await run(`const text=document.querySelector('.mw-editor>textarea');return {height:text.getBoundingClientRect().height,max:parseFloat(getComputedStyle(text).maxHeight),scroll:text.scrollHeight,client:text.clientHeight}`);
  assert(short>=180&&short<=185,JSON.stringify({short,long}));assert(long.height>short&&long.height<=long.max+1&&long.scroll>long.client,JSON.stringify({short,long}));
  await run(`const text=document.querySelector('.mw-editor>textarea');text.value=${JSON.stringify(original)};text.dispatchEvent(new Event('input'));return true`);
  const controls=await run(`const a=document.querySelector('.mw-range').getBoundingClientRect(),b=document.querySelector('.mw-book-search').getBoundingClientRect();return {rangeTop:a.top,searchTop:b.top,rangeRight:a.right,searchLeft:b.left}`);assert(Math.abs(controls.rangeTop-controls.searchTop)<2&&controls.rangeRight<=controls.searchLeft,JSON.stringify(controls));
  layout={short,long,controls,liveLocale:true,storedTitlePreserved:true};
 }
 await run(`await document.fonts.ready;return true`);await wait(350);fs.writeFileSync(path.join(out,'selected-page-production-tr.png'),(await win.webContents.capturePage()).toPNG());
 win.setMinimumSize(0,0);win.setContentSize(800,760);if(layout)win.webContents.setZoomFactor(1.25);await run(`UiLocale.set('en',false);applyUiTheme('light');await MediaWorkflowsUI.openProject(${JSON.stringify(production.id)});return true`);await until(()=>run(`return !!MediaWorkflowsUI.assistant.state()`),'compact production');await wait(350);assert(await run(`const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&document.querySelector('dialog[open]').scrollWidth<=document.querySelector('dialog[open]').clientWidth+1`));fs.writeFileSync(path.join(out,'production-en-light.png'),(await win.webContents.capturePage()).toPNG());
 if(layout){
  await run(`document.querySelector('.mw-transport').scrollIntoView({block:'center'});return true`);await wait(150);
  const actions=await run(`const node=document.querySelector('.mw-transport'),r=node.getBoundingClientRect(),d=document.querySelector('dialog[open]'),head=d.querySelector('header').getBoundingClientRect(),box=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,headerBottom:head.bottom,dialogBottom:box.bottom,overflow:d.scrollWidth>d.clientWidth+1,buttons:[...node.querySelectorAll('button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height}))}`);
  assert(!actions.overflow&&actions.top>=actions.headerBottom&&actions.bottom<=actions.dialogBottom,JSON.stringify(actions));
  layout.compactActions=actions;fs.writeFileSync(path.join(out,'production-en-light-actions-125.png'),(await win.webContents.capturePage()).toPNG());
 }
 assert(await run(`try{await AssistantAppActions.execute('start_book_narration',{},AssistantAppActions.snapshot());return false}catch(_){return true}`),'A rejected engine must not be reported accepted');assert.equal(starts,1);
 rejectStart=false;await until(()=>run(`return !MediaWorkflowsUI.assistant.state()?.busy`),'rejection cleanup');const accepted=await run(`return AssistantAppActions.execute('start_book_narration',{},AssistantAppActions.snapshot())`);assert.equal(accepted.status,'accepted');assert.equal(starts,2);

 if(layout)fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(layout,null,2));
 console.log(JSON.stringify({ok:true,out,layout,starts,selectedSourcePage:2,productionChapters:1,limits:'Real Windows/PDF text extraction/book preparation; controlled engine acceptance only. No GPU/model/audio/paid provider.'}));app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});setTimeout(()=>app.exit(2),60000).unref();
