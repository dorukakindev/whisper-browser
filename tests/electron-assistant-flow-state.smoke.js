'use strict';
// Native rendering of controlled job-state snapshots; no media/model process.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-flow-state',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:500,height:800,show:false,webPreferences:{preload:path.join(root,'src/assistant-overlay-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await win.loadFile(path.join(root,'src/renderer/assistant-overlay.html'));win.showInactive();const run=s=>win.webContents.executeJavaScript(s);
 const base={opened:true,locale:'tr',theme:'dark',sourceToken:'fixture',conversation:'fixture',messages:[{role:'ai',text:'Önceki adım gerçek iş kabulüyle eşleşti.',actions:[{id:'proposal',kind:'app_action',label:'Altyazıyı çevir',resultStatus:'accepted',resultText:'İş kabul edildi.'}]}]};
 const {describe}=require('../src/assistant-flow-state'),row={jobId:'exact',waiting:true,expires:Date.now()+600000};
 const composer=[];
 for(const state of ['running','completed','failed','stopped']){
  const info=describe(row,[{id:'exact',state}]);const note=state==='failed'?'Bu adım başarısız. Sonucunu İşler bölümünde incele; yalnız bu adım için yeni onay kartı iste.':state==='running'?'İlgili iş hâlâ sürüyor.':'';
  win.webContents.send('assistant:snapshot',{...base,messages:[{...base.messages[0],actions:[{...base.messages[0].actions[0],canContinue:info.ready||info.waiting||info.retryable,waiting:info.waiting,retryable:info.retryable,flowNote:note}]}]});await wait(180);
  assert.equal(await run("!!document.querySelector('.flow-continue')"),state!=='stopped');
  if(state!=='stopped')assert.equal(await run("document.querySelector('.flow-continue').disabled"),state==='running');
  if(state==='failed')assert.equal(await run("document.querySelector('.flow-continue').textContent"),'Adımı yeniden denemeyi incele');
  composer.push(await run("document.getElementById('form').getBoundingClientRect().bottom"));
  fs.writeFileSync(path.join(out,state+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 assert(Math.max(...composer)-Math.min(...composer)<1,'Running/completed/failed changes must not move the composer');
 if(process.argv.includes('--partial813')){
  const info=describe(row,[{id:'exact',state:'completed',result:{artifacts:[{role:'translation',partial:true,total:12,completed:11,failed:1}]}}]);
  assert.equal(info.state,'partial');
  for(const [locale,theme] of [['tr','dark'],['en','light']]){
   const note=locale==='tr'?'Bu iş kısmi çıktıyla bitti. Ses hazırlamadan önce eksik satırları kontrol et.':'This job finished with a partial output. Inspect the missing lines before preparing voice.';
   win.webContents.send('assistant:snapshot',{...base,locale,theme,messages:[{...base.messages[0],actions:[{...base.messages[0].actions[0],canContinue:info.ready,waiting:info.waiting,partial:info.partial,flowNote:note}]}]});await wait(150);
   const label=locale==='tr'?'Kısmi sonucu incele':'Review partial result';assert.equal(await run("document.querySelector('.flow-continue').textContent"),label);assert(await run("document.getElementById('log').textContent.includes("+JSON.stringify(note)+")"));
   fs.writeFileSync(path.join(out,'partial-'+locale+'.png'),(await win.webContents.capturePage()).toPNG());
  }
 }
 const focusSnapshot={...base,messages:[{...base.messages[0],actions:[{...base.messages[0].actions[0],canContinue:true,waiting:false}]}]};
 win.webContents.send('assistant:snapshot',focusSnapshot);await wait(100);await run("document.querySelector('.flow-continue').focus()");
 win.webContents.send('assistant:snapshot',{...focusSnapshot,messages:[{...focusSnapshot.messages[0],text:'Updated job receipt'}]});await wait(100);
 assert.equal(await run("document.activeElement.classList.contains('flow-continue')"),true,'receipt refresh preserves keyboard focus');
 win.webContents.send('assistant:snapshot',{...focusSnapshot,busy:true});await wait(100);
 assert.equal(await run("document.activeElement.classList.contains('tool-card')"),true,'disabled action returns focus to its card, never the page body');
 win.setContentSize(360,580);
 win.webContents.send('assistant:snapshot',{...base,busy:false,context:'Very long selected source title '.repeat(20),suggestions:['Summarize this source','Translate this page','Prepare voice and inspect the selected range','Read saved taste evidence','Open task controls'].map((label,id)=>({id:String(id),label,direct:true}))});await wait(180);
 await run("document.getElementById('suggestionMenu').open=true;document.querySelector('#suggestionOptions button:last-child').focus()");
 assert(await run("(()=>{const b=document.activeElement.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&b.right<=innerWidth+1&&b.left>=0&&document.activeElement.textContent==='Open task controls'})()"),'Narrow suggestions remain reachable by keyboard without page overflow');
 fs.writeFileSync(path.join(out,'narrow-long-source.png'),(await win.webContents.capturePage()).toPNG());
 const result={ok:true,out,states:4,liveProvider:false,native:true};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:false,error:e.stack},null,2));console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),20000).unref();
