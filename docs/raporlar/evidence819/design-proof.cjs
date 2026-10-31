'use strict';
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const out=path.resolve(process.env.AUDIT819_OUT||path.join(root,'.uiprev','audit819-proof-'+Date.now()));
fs.mkdirSync(out,{recursive:true});app.setAppPath(root);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('force-device-scale-factor','1');
const fixture=path.join(out,'synthetic-book.txt');
fs.writeFileSync(fixture,'Synthetic Book\n\nThis chapter is synthetic interface-audit content. It contains no personal data.');
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
global.fetch=async()=>{throw Error('Audit819 isolated main fetch');};
require(path.join(root,'src/main'));
let win,overlay;const rows=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn,label){for(let i=0;i<220;i++){if(await fn())return;await wait(70);}throw Error('Missing '+label);}
async function key(keyCode){win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(250);}
async function shot(name,metrics){await run('await document.fonts.ready');await wait(650);const result=typeof metrics==='string'?await run(metrics):metrics||{};const capture=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(capture.data,'base64'));rows.push({name,...result});return result;}
async function ax(name){const {nodes}=await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');const rows=nodes.filter(n=>!n.ignored&&['dialog','heading','textbox','button'].includes(n.role?.value)).map(n=>({role:n.role.value,name:n.name?.value||''}));fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(rows,null,2)+'\n');return rows;}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1000,760);win.showInactive();await run('await initialSettingsReady;UiLocale.set("en",false);applyUiTheme("dark");');
 win.webContents.debugger.attach('1.3');
 await until(async()=>{overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));return overlay&&!overlay.webContents.isLoading()&&await overlay.webContents.executeJavaScript('!!document.getElementById("bubble")');},'native assistant');
 const project=await run('const r=await window.api.mediaWorkflows({action:"book-import"});if(!r.ok)throw Error(r.error);await MediaWorkflowsUI.openProject(r.project.id);return {id:r.project.id,title:r.project.title,chapters:r.project.chapters.length};');
 const named=await ax('01-workspace-ax');assert(named.some(n=>n.role==='dialog'&&n.name==='Production workspace'));
 await run('[...document.getElementById("mediaWorkflowsDialog").querySelectorAll("button")].find(n=>n.textContent==="Rename project").click();');
 await until(()=>run('return !!document.querySelector(".mw-confirm[open]")'),'rename confirm');
 let a=await ax('02-rename-ax');assert(a.some(n=>n.role==='dialog'&&!n.name));assert(a.some(n=>n.role==='heading'&&n.name==='Project name'));assert(a.some(n=>n.role==='textbox'&&n.name==='Name'));
 await shot('01-rename-dialog','const d=document.querySelector(".mw-confirm");return {heading:d.querySelector("h2").textContent,ariaLabel:d.getAttribute("aria-label"),labelledby:d.getAttribute("aria-labelledby"),describedby:d.getAttribute("aria-describedby")};');
 await run('document.querySelector(".mw-confirm").close();await new Promise(r=>setTimeout(r,150));[...document.getElementById("mediaWorkflowsDialog").querySelectorAll("button")].find(n=>n.textContent==="Archive project").click();');
 await until(()=>run('return !!document.querySelector(".mw-confirm[open]")'),'archive confirm');a=await ax('03-archive-ax');assert(a.some(n=>n.role==='dialog'&&!n.name));assert(a.some(n=>n.role==='heading'&&n.name==='Archive project?'));
 await shot('02-archive-dialog','return {heading:document.querySelector(".mw-confirm h2").textContent};');
 await run('document.querySelector(".mw-confirm").close();document.getElementById("mediaWorkflowsDialog").close();await AppSettingsUI.open("general");');
 const theme='const n=document.getElementById("uiTheme");return {locale:UiLocale.get(),heading:document.querySelector(".aps-header h1").textContent,label:n.closest(".field").querySelector(".field-label").textContent,aria:n.getAttribute("aria-label"),options:[...n.options].map(n=>n.textContent)};';
 let m=await shot('03-locale-before',theme);assert.equal(m.locale,'en');assert.equal(m.label,'Interface theme');
 await run('document.getElementById("uiLocale").focus();');await key('End');await key('Enter');
 m=await shot('04-locale-stale',theme);assert.equal(m.locale,'tr');assert.equal(m.heading,'Ayarlar');assert.equal(m.label,'Interface theme');assert.equal(m.aria,'Interface theme');
 await run('AppSettingsUI.close();await new Promise(r=>setTimeout(r,400));await AppSettingsUI.open("general");');
 m=await shot('05-locale-reopen-control',theme);assert.equal(m.label,'Arayüz teması');assert.equal(m.aria,'Arayüz teması');
 const b=overlay.getBounds(),save=await run('return document.getElementById("appSettingsSave").getBoundingClientRect().toJSON();');
 const bubble=await overlay.webContents.executeJavaScript('({hidden:document.getElementById("bubble").hidden,rect:document.getElementById("bubble").getBoundingClientRect().toJSON()})');
 assert(overlay.getVisible()&&!bubble.hidden);const rect={left:b.x+bubble.rect.left,top:b.y+bubble.rect.top,right:b.x+bubble.rect.right,bottom:b.y+bubble.rect.bottom};
 const overlap={width:Math.max(0,Math.min(rect.right,save.right)-Math.max(rect.left,save.left)),height:Math.max(0,Math.min(rect.bottom,save.bottom)-Math.max(rect.top,save.top))};assert(overlap.width>0&&overlap.height>0);
 const point={x:b.x+20,y:b.y+18};assert(point.x>save.left&&point.x<save.right&&point.y>save.top&&point.y<save.bottom);
 await shot('06-native-bubble-cover',{viewport:await run('return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};'),overlayBounds:b,bubbleWindowRect:rect,save,overlap,testPoint:point,visible:true});
 await run('window.audit819SaveClicks=0;document.getElementById("appSettingsSave").addEventListener("click",()=>window.audit819SaveClicks++);');
 for(const type of ['mouseDown','mouseUp'])overlay.webContents.sendInputEvent({type,button:'left',clickCount:1,x:20,y:18});
 await until(()=>overlay.webContents.executeJavaScript('!document.getElementById("panel").hidden'),'assistant expanded');
 const after={expanded:await overlay.webContents.executeJavaScript('!document.getElementById("panel").hidden'),modal:await run('return document.getElementById("appSettingsDialog").open;'),saveClicks:await run('return window.audit819SaveClicks;'),overlayBounds:overlay.getBounds()};
 assert(after.expanded&&after.modal&&after.saveClicks===0);await shot('07-native-assistant-over-modal',after);
 const check=await run(`return window.api.mediaWorkflows({action:"book-open",id:${JSON.stringify(project.id)}});`);assert(check.ok&&check.project.title===project.title&&!check.project.archived);
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({revision:'2285a8202e20c836c7dafc53d06af667c60f34f6',platform:process.platform,electron:process.versions.electron,gpuDisabled:true,forcedDeviceScaleFactor:1,input:'Native sendInputEvent to parent for select; targeted native child WebContents for overlay point (not OS mouse hit testing)',bookFixture:{characters:fs.readFileSync(fixture,'utf8').length,chapters:project.chapters,cancelPreservedTitle:true},rows},null,2)+'\n');console.log(JSON.stringify({ok:true,out,captures:rows.length}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),90000).unref();
