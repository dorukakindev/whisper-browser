'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','app-settings',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');require('../src/main');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(75);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'parent');
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1440,1000);win.showInactive();
 await until(()=>run("return !!window.AppSettingsUI && !!document.getElementById('mhSettings')"),'settings entry');
 await run("await initialSettingsReady;window.UiLocale.set('tr',false);applyUiTheme('dark');window.originalKey=document.getElementById('translateApiKey');window.originalParent=originalKey.closest('.field').parentElement;document.getElementById('mhSettings').focus();document.getElementById('mhSettings').click();return true");
 await until(()=>run("return !!document.getElementById('appSettingsDialog')?.open"),'settings dialog');
 assert(await run("return document.getElementById('translateApiKey')===originalKey && originalKey.closest('dialog')?.id==='appSettingsDialog'"),'Same real control, not a copied secret form');
 await run("document.getElementById('translateEndpointPreset').value='https://api.openai.com/v1';document.getElementById('translateEndpointPreset').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('translateModel').value='gpt-5.4-mini';document.getElementById('translateModel').dispatchEvent(new Event('input',{bubbles:true}));originalKey.value='fixture-key-no-real-credential';originalKey.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('appSettingsSave').click();return true");
 await until(()=>run("return document.getElementById('appSettingsStatus').textContent==='Ayarlar kaydedildi.'"),'secure settings save');
 assert(await run("const settings=await window.api.loadSettings();return settings.translate.model==='gpt-5.4-mini' && settings.translate.apiKey==='fixture-key-no-real-credential'"),'Existing settings store receives edits');
 async function capture(name){await run('await document.fonts.ready;return true');await wait(180);const m=await run("const d=document.getElementById('appSettingsDialog'),r=d.getBoundingClientRect(),main=d.querySelector('main'),save=document.getElementById('appSettingsSave').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:main.scrollWidth,client:main.clientWidth,save:save.bottom}");assert(m.left>=0&&m.top>=0&&m.right<=m.width+1&&m.bottom<=m.height+1);assert(m.scroll<=m.client+1);assert(m.save<=m.height);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 await capture('settings-ai-dark-tr');
 await run("document.querySelector('[data-secret-target=translateApiKey]').click();document.getElementById('appSettingsClose').click();return true");
 await until(()=>run("return !document.getElementById('appSettingsDialog')"),'close restores controls');
 assert(await run("return originalKey===document.getElementById('translateApiKey') && originalKey.type==='password' && originalKey.closest('.field').parentElement===originalParent && document.activeElement.id==='mhSettings'"),'Restore actual control, mask key and return focus');
 await run("await window.AppSettingsUI.open('cleanup');return true");assert(await run("return !!document.querySelector('#appSettingsDialog #llmPostprocess')"));
 await run("await window.AppSettingsUI.close();await window.AppSettingsUI.open('manga');return true");assert(await run("return !!document.querySelector('#appSettingsDialog #mangaApiKey')"));
 await run("document.querySelector('[data-app-settings=general]').click();return true");assert(await run("return !!document.querySelector('#appSettingsDialog #uiTheme') && !!document.querySelector('#appSettingsDialog #uiLocale')"));
 await run("document.getElementById('uiLocale').value='en';document.getElementById('uiLocale').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('uiTheme').value='light';document.getElementById('uiTheme').dispatchEvent(new Event('change',{bubbles:true}));return true");
 await until(()=>run("return document.documentElement.dataset.theme==='light' && document.querySelector('#appSettingsDialog h1').textContent==='Settings'"),'live appearance controls');
 win.setMinimumSize(0,0);win.setContentSize(720,680);await wait(150);await run("document.querySelector('[data-app-settings=ai]').click();return true");await capture('settings-ai-light-en-compact');
 await run("document.getElementById('appSettingsDialog').dispatchEvent(new Event('cancel',{cancelable:true}));document.getElementById('appSettingsDialog').close();return true");
 assert(await run("return document.querySelectorAll('#translateApiKey').length===1 && document.getElementById('uiLocale').closest('header')!==null"),'No duplicate IDs; original locale control restored');
 console.log(JSON.stringify({ok:true,out,providerCalls:0}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
