'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','hidden783-'+Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});
app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');
global.fetch=async()=>{throw Error('Synthetic layout acceptance: network disabled');};
require('../src/main');let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await wait(100);}throw Error('Native window not ready');}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;});win.showInactive();
 await run("await initialSettingsReady;document.getElementById('mediaHome')?.classList.add('hidden');return true");
 const rows=[];
 for(const [language,theme,width]of [['tr','dark',1360],['en','light',800]]){
  win.setMinimumSize(640,480);win.setContentSize(width,1000);
  await run(`UiLocale.set('${language}',false);applyUiTheme('${theme}');document.getElementById('dubGeneratorDialog').showModal();document.getElementById('dubQualityResults').open=true;document.getElementById('dubQualityResults').scrollIntoView({block:'center'});return true`);
  const result=await run("const b=document.getElementById('dubListenPrevious');return {hidden:b.hidden,display:getComputedStyle(b).display,rects:b.getClientRects().length};");
  rows.push({language,theme,width,...result});
  await run('await document.fonts.ready;return true');await wait(400);
  fs.writeFileSync(path.join(out,language+'-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  assert(result.hidden&&result.display==='none'&&result.rects===0,'Unavailable previous take must not occupy the layout: '+JSON.stringify(result));
  const matrix=await run("const host=document.createElement('div');document.body.append(host);const rows=[];for(const cls of ['btn btn-secondary','dub-generator-row','text-voice-fields','mw-actions']){const n=document.createElement('div');n.className=cls;host.append(n);n.hidden=true;const hidden=getComputedStyle(n).display;n.hidden=false;const shown=getComputedStyle(n).display;rows.push({cls,hidden,shown});n.remove();}const until=document.createElement('div');until.hidden='until-found';host.append(until);const untilFound=getComputedStyle(until).display;host.remove();return {rows,untilFound};");
  assert(matrix.rows.every(r=>r.hidden==='none'&&r.shown!=='none'),JSON.stringify(matrix));assert.notEqual(matrix.untilFound,'none');rows.push(matrix);
  await run("document.getElementById('dubGeneratorDialog').close();return true");
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,rows},null,2));console.log(JSON.stringify({ok:true,out,rows}));app.exit(0);
}).catch(error=>{console.error(error.stack);console.log(JSON.stringify({ok:false,out}));app.exit(1);});
setTimeout(()=>app.exit(2),45000).unref();
