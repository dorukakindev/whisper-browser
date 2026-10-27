'use strict';
// Actual app routes and views, controlled upstream failures; no credentials/site.
const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','media-errors649',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.setPath('downloads',out);app.commandLine.appendSwitch('disable-gpu');
let mode='failure';const prior=global.fetch;
global.fetch=async(url,options)=>{
 const value=String(url);if(!value.startsWith('https://v3-cinemeta.strem.io/'))return prior(url,options);
 if(mode==='failure'||value.includes('/meta/')||(mode==='partial'&&value.includes('/series/')))return new Response('controlled unavailable',{status:503});
 return new Response(JSON.stringify({metas:value.includes('/movie/')?[{id:'tt1234567',name:'Controlled Witness',releaseInfo:'2024',genres:['Drama']}]:[]}));
};
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await wait(40);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
 session.defaultSession.protocol.handle('https',()=>Response.error());
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');win.showInactive();
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true),results=[];
 const shot=async name=>{await run(`await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true`);await wait(180);fs.writeFileSync(path.join(out,name),(await win.webContents.capturePage()).toPNG());};
 await run(`await initialSettingsReady;return true`);
 for(const [locale,theme,width] of [['tr','dark',940],['en','light',1280]]){
  win.setContentSize(width,900);mode='failure';
  await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');document.querySelector('[data-home-page=discover]').click();return true`);
  await until(()=>run(`return document.querySelector('.md-footer')`),'discover');
  await run(`await Array.from(document.querySelectorAll('.md-footer button')).find(b=>b.textContent===${JSON.stringify(locale==='tr'?'Yeniden dene':'Retry')}).click();return true`);
  await until(()=>run(`return document.querySelector('.md-status')?.textContent.includes(${JSON.stringify(locale==='tr'?'erişilemiyor':'unavailable')})`),'localized discovery error');
  await shot('discover-error-'+locale+'.png');
  await run(`void MediaDiscoveryUI.openDetail({kind:'film',providerId:'tt1234567',title:'Controlled Witness'});return true`);
  await until(()=>run(`return document.querySelector('.md-detail .md-status')?.textContent.includes(${JSON.stringify(locale==='tr'?'erişilemiyor':'unavailable')})`),'detail error');
  assert(await run(`return !document.querySelector('.md-detail').textContent.includes('HTTP 503')`));await run(`document.querySelector('.md-detail button').click();return true`);
  await run(`await MediaSearchUI.open('Controlled Witness ${locale}');await document.querySelector('.mhs-dialog>.mh-action').onclick();return true`);
  const error=await run(`return document.querySelector('.mhs-dialog .mh-status').textContent`);assert.match(error,locale==='tr'?/Çevrimiçi arama tamamlanamadı/:/Online search could not be completed/);
  await shot('search-error-'+locale+'.png');
  mode='partial';await run(`await document.querySelector('.mhs-dialog>.mh-action').onclick();return true`);
  const partial=await run(`return document.querySelector('.mhs-dialog .mh-status').textContent`);assert.match(partial,locale==='tr'?/Kısmi.*1.*Diziler/:/Partial.*1.*Series/);assert.equal(await run(`return document.querySelectorAll('.mhs-remote .mhs-row').length`),1);
  await shot('search-partial-'+locale+'.png');
  mode='success';await run(`await document.querySelector('.mhs-dialog>.mh-action').onclick();return true`);assert.equal(await run(`return document.querySelector('.mhs-dialog>.mh-action').disabled`),false);
  assert.match(await run(`return document.querySelector('.mhs-dialog .mh-status').textContent`),locale==='tr'?/Çevrimiçi eşleşme: 1/:/Online matches: 1/);
  await run(`document.querySelector('.mhs-dialog header button').click();return true`);results.push({locale,width,error,partial});
 }
 console.log(JSON.stringify({ok:true,out,results}));app.exit(0);
}).catch(async e=>{console.error(e);const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(w){console.error(await w.webContents.executeJavaScript(`JSON.stringify({locale:UiLocale.get(),status:document.querySelector('.md-status')?.textContent,errors:typeof MediaDiscoveryErrors,buttons:Array.from(document.querySelectorAll('.md-footer button')).map(b=>({text:b.textContent,disabled:b.disabled}))})`));fs.writeFileSync(path.join(out,'failure.png'),(await w.webContents.capturePage()).toPNG());}app.exit(1);});
