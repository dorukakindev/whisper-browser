'use strict';
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','product600-'+Date.now());fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setPath('downloads',out);app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const pdf=path.join(out,'fixture.pdf');fs.writeFileSync(pdf,require('./helpers/pdf-fixture')());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[pdf]});
require('../src/main');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await delay(60);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 win.setContentSize(1200,900);win.show();const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);
 await until(()=>run('return !!window.BookTextPreparationUI&&!!window.MediaWorkflowsUI'),'scripts');
 await run('await initialSettingsReady;return true');
 const imported=await run('return window.api.mediaWorkflows({action:"book-import"})');assert(imported.ok,imported.error);
 const id=imported.project.id,source='Bu bilgi\u00ad\nsayar çalışıyor. o-\nkuma örneği. Özel Anka-\nra korunur.';
 const saved=await run('return window.api.mediaWorkflows({action:"book-save",id:'+JSON.stringify(id)+',chapter:0,text:'+JSON.stringify(source)+'})');assert(saved.ok,saved.error);
 for(const [locale,theme,width] of [['tr','dark',1200],['en','light',760]]){
 win.setMinimumSize(640,600);win.setContentSize(width,900);
 await run('UiLocale.set('+JSON.stringify(locale)+',false);applyUiTheme('+JSON.stringify(theme)+');await MediaWorkflowsUI.openProject('+JSON.stringify(id)+');return true');
 await until(()=>run('return !!document.querySelector(".mw-text-preparation")'),'preparation');
 const preview=await run('const root=document.querySelector(".mw-text-preparation");root.open=true;root.querySelector("button").click();root.scrollIntoView({block:"start"});await document.fonts.ready;return {rows:root.querySelectorAll(".mw-text-suggestion").length,value:document.querySelector("textarea[data-chapter]").value}');
 assert.equal(preview.rows,2);assert.equal(preview.value,source);
 await delay(200);fs.writeFileSync(path.join(out,locale+'-'+theme+'-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
 const result=await run('const root=document.querySelector(".mw-text-preparation"),sel=root.querySelector("select");sel.value="join";sel.dispatchEvent(new Event("change"));root.querySelectorAll("button")[1].click();const value=document.querySelector("textarea[data-chapter]").value;root.querySelectorAll("button")[2].click();return {value,restored:document.querySelector("textarea[data-chapter]").value,overflow:root.scrollWidth>root.clientWidth+1}');
 assert(result.value.includes('bilgisayar'));assert.equal(result.restored,source);assert.equal(result.overflow,false);
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,source:'synthetic PDF/text, isolated profile',states:['tr-dark-1200','en-light-760'],providerCalls:0,gpu:false},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
