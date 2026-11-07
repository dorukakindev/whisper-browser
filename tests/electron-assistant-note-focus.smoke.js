'use strict';
// REAL product boundary (Linux/Windows Electron): the real main window, the real native overlay WebContentsView, the real note dialog
// and the real modal-state IPC. Only the overlay snapshot is injected. Not a Windows/LG acceptance when run on Linux.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-note-focus',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');require('../src/main');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'parent');
 const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);await until(()=>parent('return !!window.MediaExperience&&!!window.AssistantPodcastNoteUI'),'experience and note dialog');
 const view=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(view,'overlay view');
 const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 win.setContentSize(1280,900);win.show();await wait(400);
 await run('document.getElementById("bubble").click();return true');await wait(400);
 const card={id:'P33333333-3333-3333-3333-333333333333',kind:'podcast',show:'Show',episode:'Episode',role:'source',timed:true,seconds:12,end:15,quote:'The lighthouse blinks twice.',locator:{action:'podcast-search-resolve',query:'lighthouse',episode:'entry-A',token:'e'.repeat(64)},scope:{limit:6,more:false}};
 const snapshot={opened:true,locale:'en',theme:'dark',sourceToken:'t',conversation:'c',activeThread:'th',threads:[{id:'th',title:'T'}],model:'m',context:'Film',scope:'watched',suggestions:[],jobs:[],
  messages:[{id:'m1',role:'ai',status:'complete',text:'See [P1].',links:[{id:'b:one:answer:0',label:'P1',title:'Show · Episode',excerpt:'The lighthouse blinks twice.',action:'seek',usage:'cited',meta:'Original · 0:12–0:15'}],actions:[],steps:[]}]};
 view.webContents.send('assistant:snapshot',snapshot);await until(()=>run('return !!document.querySelector(".source-card")'),'rendered card');
 // the user opens the source card and presses "Save as note…" in the overlay
 await run('document.querySelector(".source-card").open=true;return true');await wait(150);
 await run('document.querySelector(".source-note").focus();document.querySelector(".source-note").click();return true');
 await wait(200);
 const before=await parent('return {open:!!document.getElementById("dubGeneratorDialog")?.open}');
 // the main window opens the real note dialog (real modal-state IPC hides the overlay), then the user closes it
 await parent('window.__noteOpening=window.AssistantPodcastNoteUI.open('+JSON.stringify(card)+');return true');await until(()=>parent('return window.AssistantPodcastNoteUI.isOpen()'),'note dialog open');
 await wait(500);const hiddenWhileOpen=await run('return document.visibilityState');
 await parent('document.querySelector("dialog.assistant-note-dialog button:last-of-type").click();return true');await until(()=>parent('return !window.AssistantPodcastNoteUI.isOpen()'),'note dialog closed');
 // the main window republishes its state after the dialog closed: the same card is drawn again, a pending return must survive that re-render
 await wait(300);view.webContents.send('assistant:snapshot',snapshot);await wait(900);
 const result=await run('return {active:document.activeElement?.dataset?.noteKey||document.activeElement?.id||document.activeElement?.tagName,hasFocus:document.hasFocus(),visibility:document.visibilityState,pending:window.AssistantFocusReturn.pending(),cardOpen:document.querySelector(".source-card")?.open,noteButtons:document.querySelectorAll(\"[data-note-control]\").length}');
 const focused=view.webContents.isFocused();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({hiddenWhileOpen,result,focused},null,2));console.log(JSON.stringify({out,hiddenWhileOpen,result,focused}));
 assert.equal(result.active,'b:one:answer:0','focus returns to the exact control that opened the dialog');assert.equal(focused,true,'the overlay web contents owns focus again');
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
