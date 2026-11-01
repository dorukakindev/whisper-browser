const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'.uiprev','design834-extra');
fs.mkdirSync(out,{recursive:true});app.setAppPath(root);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile-'+Date.now());
for(const f of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(f);
global.fetch=async()=>{throw Error('Design audit: external network disabled');};require(path.join(root,'src/main.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));let win;const records=[];
app.whenReady().then(async()=>{
 for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await wait(100);}
 if(!win)throw Error('No main window');win.showInactive();win.setMinimumSize(600,480);
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true');
 for(const c of ['dub:config','dub:references','dub:latest'])ipcMain.removeHandler(c);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true,engine:'fixture',reference:'Sentetik anlatıcı.wav',transcript:'Sentetik referans.txt',pronunciations:[]}));
 ipcMain.handle('dub:references',()=>({ok:true,references:[],activeId:null}));
 ipcMain.handle('dub:latest',()=>({ok:true,result:null}));
 async function shot(name){await run('await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');await wait(350);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());records.push({name,...await run('return {innerWidth,innerHeight,dpr:devicePixelRatio,zoom:visualViewport.scale}')});}
 win.setContentSize(1440,950);await shot('home-empty');
 await run('const b=[...document.querySelectorAll(".mh-tool button")].find(n=>n.textContent.includes("Stüdyoyu aç"));if(!b)throw Error("Missing studio entry");b.click();return true');await shot('studio-wide');
 win.setContentSize(900,750);await shot('studio-narrow');
 await run('await DubGeneratorUI.prepareCurrent();return true');await shot('dub-narrow');
 win.setContentSize(1440,950);await shot('dub-wide');
 fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({head:'8892c44b4e647e839b38eeb3ad99114901b036b3',kind:'native Windows current renderer; isolated empty profile; no production request',records},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});setTimeout(()=>app.exit(2),60000).unref();
