'use strict';
// Real native overlay, isolated profile, synthetic source metadata; no provider/GPU claim.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','product200-source',Date.now()+'-'+process.pid);
fs.mkdirSync(path.join(out,'profile'),{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(fn,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await fn())return;await wait(80);}throw Error('Timeout: '+label);}
require('../src/main');
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await until(()=>parent('return !!window.AssistantSourcePreview&&!!window.AssistantWorkspace'),'source UI');
 const view=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(view);
 const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await parent("await initialSettingsReady;UiLocale.set('tr',false);await MediaHomeUI.returnHome();return true");
 await run("document.getElementById('bubble').click();return true");
 const states=[];
 for(const [width,height,locale,theme] of [[1440,1000,'tr','dark'],[820,760,'tr','dark'],[640,620,'en','light']]){
  win.setMinimumSize(0,0);win.setContentSize(width,height);win.showInactive();
  await parent(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');globalAssistantContext=()=>null;player.workspaceMode='browser';player.browserTime=90;player.browserPageTitle='Uzun video başlığı · source scope acceptance';player.browserPageUrl='https://www.youtube.com/watch?v=abcdefghijk';currentBrowserYoutubeUrl=()=>player.browserPageUrl;currentBrowserWhisperRange=()=>({start:300,end:600});subtitleContextLanguage=role=>role==='source'?'en':'tr';aiVideoRows=()=>[{start:0,end:90,text:'Synthetic source fixture',translation:'Sentetik kaynak'}];document.getElementById('aiTranscriptScope').value='watched';document.dispatchEvent(new CustomEvent('media-context-changed'));return true`);
  await until(()=>run(`return document.documentElement.lang==='${locale}'&&!document.getElementById('sourcePreview').hidden&&document.getElementById('sourcePreviewDetail').textContent.includes('5:00–10:00')`),'localized source receipt');
  await run("document.getElementById('sourceBox').open=true;await document.fonts.ready;return true");await wait(180);
  const layout=await run("const preview=document.getElementById('sourcePreview'),detail=document.getElementById('sourcePreviewDetail'),send=document.getElementById('send'),form=document.getElementById('form');return {summary:preview.textContent,detail:detail.textContent,width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,sendBottom:send.getBoundingClientRect().bottom,workspaceBottom:document.getElementById('assistantWorkspace').getBoundingClientRect().bottom,formTop:form.getBoundingClientRect().top}");
  assert(layout.scroll<=layout.width+1);assert(layout.sendBottom<=layout.height+1);assert(layout.workspaceBottom<=layout.formTop+1);assert(layout.detail.includes('5:00–10:00'));
  fs.writeFileSync(path.join(out,`source-${width}-${locale}-${theme}.png`),(await view.webContents.capturePage()).toPNG());states.push({width,height,locale,theme,...layout});
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,states,provider:'not used',fixture:'synthetic source metadata'},null,2));console.log(JSON.stringify({ok:true,out,states:states.length}));app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error.stack);app.exit(1);});
setTimeout(()=>app.exit(2),60000).unref();
