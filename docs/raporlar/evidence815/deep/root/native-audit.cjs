'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','deep-audit815-'+Date.now());fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-renderer-backgrounding');
require(path.join(root,'src/main.js'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let win;for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await wait(100);}if(!win)throw Error('No main renderer');
 const wc=win.webContents,run=code=>wc.executeJavaScript('(async()=>{'+code+'})()',true),results=[];
 await run('await document.fonts.ready;return true');await wc.executeJavaScript(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
 const surfaces=[
  ['initial',''],
  ['settings-ai',`await window.AppSettingsUI.open('ai');`],
  ['settings-general',`await window.AppSettingsUI.open('general');`],
  ['settings-metadata',`await window.AppSettingsUI.open('metadata');`],
  ['settings-cleanup',`await window.AppSettingsUI.open('cleanup');`],
  ['settings-manga',`await window.AppSettingsUI.open('manga');`],
  ['backup',`window.AppSettingsUI.close();window.MediaToolsUI.open('backup');`],
  ['health',`window.MediaToolsUI.open('health');`],
  ['listening',`window.MediaToolsUI.open('audio');`],
  ['global-search',`document.getElementById('mediaToolsDialog')?.close();await window.MediaSearchUI.open();`],
  ['catalog',`document.querySelectorAll('dialog[open]').forEach(d=>d.close());await window.MediaCatalogUI.open();`],
  ['playback-tools',`document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.MediaHubUI.open('player');`]
 ];
 for(const [name,code]of surfaces){
  try{await run(code+'return true');await wait(350);const state=await run(`const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),locale:window.UiLocale?.get?.()};`);results.push({name,...state});const image=await wc.capturePage();fs.writeFileSync(path.join(out,name+'.png'),image.toPNG());}catch(error){results.push({name,error:error.message});}
 }
 fs.writeFileSync(path.join(out,'axe.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,surfaces:results.map(r=>({name:r.name,error:r.error,violations:r.violations?.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length}))}))},null,2));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
setTimeout(()=>app.exit(2),120000);
