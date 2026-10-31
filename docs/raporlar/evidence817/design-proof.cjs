'use strict';
// Report evidence only. Real Windows Electron renderer; synthetic profile/data.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const out=path.resolve(process.env.DESIGN817_OUT||path.join(root,'.uiprev','design817-proof-'+Date.now()));
fs.mkdirSync(out,{recursive:true});app.setAppPath(root);
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'synthetic-profile');
app.commandLine.appendSwitch('disable-gpu');
global.fetch=async()=>{throw Error('Design817: main-process external requests disabled');};
require(path.join(root,'src/main'));
let win;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function capture(name,code){await run('await document.fonts.ready');await wait(500);const metrics=code?await run(code):{};fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());rows.push({name,...metrics});return metrics;}
async function viewport(w,h,z=1){win.setContentSize(w,h);win.webContents.setZoomFactor(z);await wait(200);}
app.whenReady().then(async()=>{
 for(let i=0;i<250;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await wait(80);}
 assert(win,'main window');win.showInactive();await run('await initialSettingsReady');
 // All recorded content sizes are >= current product's 940x680 minimum.
 await viewport(1440,900);await run('UiLocale.set("tr",false);applyUiTheme("dark");');
 await capture('01-home-baseline');
 await viewport(1000,760);await run('await AppSettingsUI.open("ai");const q=document.getElementById("appSettingsSearch");q.value="Flex";q.dispatchEvent(new Event("input",{bubbles:true}));');
 let m=await capture('02-settings-flex','const d=document.getElementById("appSettingsDialog");return {query:document.getElementById("appSettingsSearch").value,noMatches:!document.getElementById("appSettingsNoMatches").classList.contains("hidden"),visibleCategories:[...d.querySelectorAll("[data-app-settings]:not(.hidden)")].length,flexTextPresent:d.innerText.includes("Flex")};');
 assert(m.noMatches&&m.visibleCategories===0&&m.flexTextPresent);
 await run('AppSettingsUI.close();MediaHomeUI.openStudio();document.getElementById("primarySettingsOpen").open=true;document.getElementById("model").scrollIntoView({block:"center"});');
 m=await capture('03-model-management','const n=document.querySelector(".model-management-row");return {rowWidth:n.getBoundingClientRect().width,controls:[...n.querySelectorAll("span,button,label,input,select")].map(n=>({tag:n.tagName,text:(n.textContent||n.value||"").trim().slice(0,90),fontSize:getComputedStyle(n).fontSize,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))};');
 assert(m.controls.some(n=>n.fontSize==='9px'));
 // Only display text is seeded: this verifies layout, not folder-picker/persistence.
 const pathPrefix='D:\\Sentetik_Tasarim_Denetimi\\Video_Projeleri\\2026\\Uzun_Ortak_Klasor_Adi\\';
 await run(`const a=document.getElementById("inputDir"),b=document.getElementById("outputDir"),base=${JSON.stringify(pathPrefix)};a.textContent=base+"GIRDI";b.textContent=base+"CIKTI";a.scrollIntoView({block:"center"});`);
 m=await capture('04-long-paths','return {paths:["inputDir","outputDir"].map(id=>{const n=document.getElementById(id);return {id,text:n.textContent,client:n.clientWidth,scroll:n.scrollWidth,title:n.title,tabIndex:n.tabIndex};})};');assert(m.paths.every(n=>n.scroll>n.client&&!n.title&&n.tabIndex===-1));
 await viewport(940,680);await run('document.getElementById("openPlayer").click();await new Promise(r=>setTimeout(r,300));openBrowserCommandPalette();');
 const paletteMetrics='const p=document.getElementById("browserCommandPalette");return {viewport:{width:innerWidth,height:innerHeight},palette:p.getBoundingClientRect().toJSON(),hint:p.querySelector(".browser-command-hint").getBoundingClientRect().toJSON()};';
 m=await capture('05-palette-normal',paletteMetrics);assert(m.palette.bottom<=m.viewport.height);
 await viewport(940,680,1.25);m=await capture('06-palette-zoom125',paletteMetrics);assert(m.palette.bottom>m.viewport.height&&m.hint.top>m.viewport.height);
 await run('UiLocale.set("en",false);applyUiTheme("light");');m=await capture('07-palette-en-light-zoom125',paletteMetrics);assert(m.palette.bottom>m.viewport.height);
 await viewport(940,680);await run('closeBrowserCommandPalette();UiLocale.set("tr",false);applyUiTheme("dark");const r=await window.api.mediaCatalog({action:"save",item:{kind:"film",title:"Uzun_Kesintisiz_Dosya_Adindan_Gelen_".repeat(5),year:2026,watchStatus:"planned",synopsis:"Sentetik tasarım denetimi."}});if(!r.ok)throw Error("save synthetic title");await MediaCatalogUI.open({id:r.item.id});');
 const catalogMetrics='const n=document.querySelector(".mc-detail-hero");return {titleLength:n.querySelector("h3").textContent.length,client:n.clientWidth,scroll:n.scrollWidth};';
 m=await capture('08-catalog-long-title',catalogMetrics);assert(m.scroll>m.client);
 await run('MediaCatalogUI.close();const r=await window.api.mediaCatalog({action:"save",item:{kind:"film",title:"Kuzeyin Hikâyesi",year:2026,watchStatus:"planned",synopsis:"Sentetik tasarım denetimi."}});await MediaCatalogUI.open({id:r.item.id});');
 m=await capture('09-catalog-normal-title',catalogMetrics);assert(m.scroll===m.client);
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome,gpuDisabled:true,profile:'synthetic only',rows},null,2)+'\n');
 console.log(JSON.stringify({ok:true,captures:rows.length,out}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});
setTimeout(()=>app.exit(2),90000).unref();
