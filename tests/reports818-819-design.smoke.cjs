'use strict';
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.AUDIT818_OUT||path.join(root,'tmp/reports818-823/design-native'));fs.mkdirSync(out,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile-'+process.pid);app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Audit818 isolated main fetch');};require(path.join(root,'src/main'));
let win;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function key(keyCode){win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(250);}
async function shot(name,code){await run('await document.fonts.ready');await wait(550);const result=await run(code);rows.push({...result,capture:name});if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(capture.data,'base64'));return result;}
app.whenReady().then(async()=>{
 // Controlled empty voice configuration avoids loading any machine reference asset.
 const isolatedIpc=require('electron').ipcMain;for(const channel of ['invidious:feed','invidious:search']){isolatedIpc.removeHandler(channel);isolatedIpc.handle(channel,()=>({ok:true,videos:[],items:[],instance:'synthetic offline fixture'}));}
 const {ipcMain}=require('electron');ipcMain.removeHandler('dub:textVoice');ipcMain.handle('dub:textVoice',(_e,r)=>r.action==='config'?{ok:true,libraryId:'synthetic-voice',referenceName:'Synthetic voice (not loaded)',transcript:'',url:'',engine:'Synthetic engine fixture',engineReady:false,settings:{mode:'auto',motor:'nano',steps:10,batch:1,max_chars:180,cfg:2,temperature:1,pause:1,seed:1,normalize:true,polish:true,align:false}}:r.action==='history'?{ok:true,results:[]}:{ok:false,error:'No production in audit'});ipcMain.removeHandler('dub:references');ipcMain.handle('dub:references',()=>({ok:true,references:[]}));
 for(let i=0;i<250;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await wait(80);}assert(win);win.showInactive();win.webContents.setAudioMuted(true);win.webContents.setBackgroundThrottling(false);await run('await initialSettingsReady');
 win.setContentSize(940,680);await wait(200);await run('UiLocale.set("tr",false);applyUiTheme("dark");await TextVoiceStudioUI.open();');
 const measure='const nodes=[".text-voice-head",".text-voice-body",".text-voice-footer"];return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},nodes:nodes.map(s=>{const n=document.querySelector(s);return {selector:s,rect:n.getBoundingClientRect().toJSON(),client:n.clientHeight,scroll:n.scrollHeight};})};';
 let m=await shot('01-textvoice-100',measure);assert(m.nodes[1].client>0);
 win.webContents.setZoomFactor(1.5);await wait(250);m=await shot('02-textvoice-150',measure);assert(m.nodes[1].client>0);
 win.webContents.setZoomFactor(2);await wait(250);m=await shot('03-textvoice-200',measure);assert(m.nodes[1].client>=240);assert(m.nodes[1].scroll>500);
 await run('UiLocale.set("en",false);applyUiTheme("light");');m=await shot('04-textvoice-en-light-200',measure);assert(m.nodes[1].client>=240);
 await run('document.getElementById("textVoiceStudio").close();');win.webContents.setZoomFactor(1);win.setContentSize(1000,760);await wait(250);
 await run('MediaHomeUI.openStudio();document.getElementById("openPlayer").click();setWorkspaceMode("player");await AppSettingsUI.open("general");document.getElementById("appSettingsClose").focus();');
 const modal='return {layerHidden:document.getElementById("playerLayer").classList.contains("hidden"),home:document.body.classList.contains("media-home-active"),dialog:!!document.getElementById("appSettingsDialog")?.open,focus:document.activeElement.id};';
 m=await shot('05-modal-before',modal);assert(!m.layerHidden&&m.dialog&&!m.home);await key('Backspace');await wait(1500);m=await shot('06-modal-after-backspace',modal);assert(!m.layerHidden&&m.dialog&&!m.home);
 // Control: native dialog Escape belongs to the modal, with underlying player intact.
 await run('AppSettingsUI.close();MediaHomeUI.openStudio();document.getElementById("openPlayer").click();setWorkspaceMode("player");await AppSettingsUI.open("general");document.getElementById("appSettingsClose").focus();');await key('Escape');m=await shot('07-modal-escape-control',modal);assert(!m.layerHidden&&!m.dialog);
 // The language select changes through Chromium native keyboard input, not dispatchEvent.
 await run('UiLocale.set("tr",false);await AppSettingsUI.open("general");document.getElementById("uiLocale").focus();');
 const focus='return {focusId:document.activeElement.id,focusTag:document.activeElement.tagName,locale:UiLocale.get(),selectValue:document.getElementById("uiLocale").value,dialog:!!document.getElementById("appSettingsDialog")?.open};';
 m=await shot('08-language-before',focus);assert.equal(m.focusId,'uiLocale');await key('Home');await key('Enter');m=await shot('09-language-after',focus);assert.equal(m.locale,'en');assert.equal(m.focusId,'uiLocale');
 await additionalChecks();
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({revision:'3dee62d3 + working tree reports818-823 fixes',platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome,gpuDisabled:true,input:'Electron sendInputEvent native keydown/keyup',rows},null,2)+'\n');console.log(JSON.stringify({ok:true,out,captures:fs.readdirSync(out).filter(name=>name.endsWith('.png')).length}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),90000).unref();

async function additionalChecks(){
 await run('AppSettingsUI.close();openManagedModal(document.getElementById("appDialog"),document.getElementById("appDialogCancel"));');
 await key('Backspace');await wait(1500);assert(await run('return !document.getElementById("playerLayer").classList.contains("hidden")&&!!_activeModal;'));
 await run('closeManagedModal(document.getElementById("appDialog"));');
 rows.push({name:'managed-modal-backspace-control',playerPreserved:true});
 win.webContents.setZoomFactor(2);win.setContentSize(940,680);
 await run('await TextVoiceStudioUI.open();document.getElementById("tv-status").textContent="Synthetic long error. ".repeat(150);document.getElementById("tv-text").focus();document.getElementById("tv-text").scrollIntoView({block:"center"});');
 let long=await shot('studio-long-status-editor','const b=document.querySelector(".text-voice-body"),e=document.getElementById("tv-text"),r=e.getBoundingClientRect();return {body:b.clientHeight,visible:r.bottom>0&&r.top<innerHeight};');assert(long.body>100&&long.visible);
 await run('document.getElementById("tv-name").focus();document.getElementById("tv-name").scrollIntoView({block:"center"});');
 long=await shot('studio-long-status-actions','const r=document.getElementById("tv-name").getBoundingClientRect();return {visible:r.top>=0&&r.bottom<=innerHeight};');assert(long.visible);
 await run('document.getElementById("textVoiceStudio").close();');
 for(const locale of ['en','tr'])for(const theme of ['dark','light'])for(const zoom of [1,1.25,1.5,2]){
  win.webContents.setZoomFactor(zoom);win.setContentSize(940,680);await wait(100);
  await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');await TextVoiceStudioUI.open();`);
  const m=await shot(`studio-${locale}-${theme}-${zoom}`,`const shell=document.querySelector('.text-voice-shell'),body=document.querySelector('.text-voice-body');const editor=document.getElementById('tv-text')||document.querySelector('.text-voice-editor');editor.focus();editor.scrollIntoView({block:'center'});return {body:body.clientHeight,shellClient:shell.clientHeight,shellScroll:shell.scrollHeight,editor:editor.getBoundingClientRect().toJSON(),viewport:innerHeight,focus:document.activeElement===editor};`);
  assert(m.body>100);assert(m.focus);assert(m.editor.bottom>0&&m.editor.top<m.viewport);
  await run('document.getElementById("textVoiceStudio").close();');
 }
 win.webContents.setZoomFactor(1);win.setContentSize(1000,760);
 await run('UiLocale.set("en",false);await AppSettingsUI.open("general");document.getElementById("uiLocale").focus();');
 await key('End');await key('Enter');
 const translated=await run('const n=document.getElementById("uiTheme");return {focus:document.activeElement.id,label:n.closest(".field").querySelector(".field-label").textContent,aria:n.getAttribute("aria-label"),options:[...n.options].map(o=>o.textContent)};');
 await key('Home');await key('Enter');
 assert.equal(await run('return document.activeElement.id;'),'uiLocale');
 assert.equal(await run('return document.getElementById("uiTheme").getAttribute("aria-label");'),'Interface theme');
 await key('End');await key('Enter');
 assert.equal(translated.focus,'uiLocale');assert.equal(translated.label,'Arayüz teması');assert.equal(translated.aria,'Arayüz teması');assert.deepEqual(translated.options,['Sistem ayarını kullan','Koyu','Açık']);rows.push({name:'locale-authored-labels',...translated});
 await run('const n=document.getElementById("uiTheme");window.auditThemeValue=n.value;const secret=document.getElementById("translateApiKey");secret.value="Synthetic Name Light";document.getElementById("appSettingsSearch").value="tema";document.getElementById("appSettingsSearch").focus();document.getElementById("appSettingsSearch").setSelectionRange(4,4);');
 await key('Backspace');assert.equal(await run('return document.getElementById("appSettingsSearch").value;'),'tem');
 assert(await run('return !document.getElementById("playerLayer").classList.contains("hidden");'));
 assert.equal(await run('return document.getElementById("translateApiKey").value;'),'Synthetic Name Light');
 await run('document.getElementById("translateApiKey").value="";document.getElementById("uiLocale").focus();');
 await key('Tab');assert(await run('return !!document.activeElement.closest("#appSettingsDialog");'));
 const overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(overlay);
 for(const size of [[940,680],[1440,900]])for(const zoom of [1,1.5,2]){
  win.setContentSize(...size);win.webContents.setZoomFactor(zoom);await wait(150);assert.equal(overlay.getVisible(),false);
 }
 win.webContents.setZoomFactor(1);win.setContentSize(1000,760);await wait(200);
 await shot('settings-native-overlay-hidden','return {modal:document.getElementById("appSettingsDialog").open,focus:document.activeElement.id};');
 await run('AppSettingsUI.close();');await wait(300);assert(overlay.getVisible());
 win.webContents.setZoomFactor(1);win.setContentSize(1000,760);
 const fixture=path.join(out,'synthetic-book.txt');fs.writeFileSync(fixture,'Synthetic Book\n\nThis chapter is synthetic interface test content with no personal data.');
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
 const project=await run('UiLocale.set("en",false);const r=await window.api.mediaWorkflows({action:"book-import"});if(!r.ok)throw Error(r.error);await MediaWorkflowsUI.openProject(r.project.id);return {id:r.project.id,title:r.project.title};');
 for(const [button,heading]of [['Rename project','Project name'],['Archive project','Archive project?']]){
  await run(`[...document.getElementById('mediaWorkflowsDialog').querySelectorAll('button')].find(n=>n.textContent==='${button}').click();`);await wait(300);
  const {nodes}=await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');const ax=nodes.filter(n=>!n.ignored&&['dialog','textbox','button'].includes(n.role?.value)).map(n=>({role:n.role.value,name:n.name?.value||'',description:n.description?.value||''}));
  assert(ax.some(n=>n.role==='dialog'&&n.name===heading));if(button==='Rename project')assert(ax.some(n=>n.role==='textbox'&&n.name==='Name'));else assert(ax.find(n=>n.role==='dialog'&&n.name===heading).description);
  fs.writeFileSync(path.join(out,button.replace(' ','-')+'-ax.json'),JSON.stringify(ax,null,2));
  await shot(button.replace(' ','-'),'return {name:document.querySelector(".mw-confirm h2").textContent};');
  await key('Escape');await wait(150);assert(await run('return !document.querySelector(".mw-confirm");'));assert.equal(overlay.getVisible(),false);
 }
 const check=await run(`return window.api.mediaWorkflows({action:'book-open',id:${JSON.stringify(project.id)}});`);assert(check.ok&&check.project.title===project.title&&!check.project.archived);
 await run('document.getElementById("mediaWorkflowsDialog").close();');await wait(250);assert(overlay.getVisible());
 rows.push({name:'native-overlay-modal-stack',hiddenAcrossSixSizes:true,restoredAfterLastClose:true,cancelPreservedTitle:true});
}
