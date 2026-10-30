'use strict';
// Native renderer/preload acceptance; engine events controlled, GPU runs separately.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-experience795-'+Date.now());fs.mkdirSync(out,{recursive:true});
app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated UI test');};require('../src/main');
let win,request;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn){for(let i=0;i<220;i++){if(await fn())return;await wait(75);}throw Error('Native UI timed out');}
async function capture(name){await run('await document.fonts.ready;document.activeElement.blur()');await wait(250);
 const data=await run(`const d=document.getElementById('dubGeneratorDialog'),f=d.querySelector('footer'),s=d.querySelector('.dub-studio-scroll'),fr=f.getBoundingClientRect(),sr=s.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1,footerVisible:fr.bottom<=innerHeight+1&&fr.top>=0,scrollAboveFooter:sr.bottom<=fr.top+1,activity:document.getElementById('dubGeneratorActivity').textContent,summary:document.getElementById('dubQualitySummary').textContent};`);
 assert(!data.overflow&&data.footerVisible&&data.scrollAboveFooter,name+' layout');rows.push({name,...data});fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;});win.showInactive();win.setMinimumSize(600,480);await run('await initialSettingsReady');
 for(const channel of ['dub:groupTakes','dub:config','dub:latest','dub:start','dub:plan','dub:pronunciations','dialog:openFile'])ipcMain.removeHandler(channel);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true,keepEngine:true,engine:'fixture',reference:'Synthetic voice.wav',transcript:'Synthetic reference.txt'}));
 let takeUrls=[];ipcMain.handle('dub:groupTakes',()=>({ok:true,choices:[{token:'current',current:true,recordedAt:Date.now(),status:'ready',text:'Current group take.',url:takeUrls[0]},{token:'previous',current:false,recordedAt:Date.now()-60000,status:'ready',text:'Previous group take.',url:takeUrls[1]},{token:'changed',current:false,compareOnly:true,recordedAt:Date.now()-120000,status:'ready',text:'Different text: comparison only.',url:takeUrls[1]}]}));
 const wav=Buffer.alloc(44+24000*4*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(Math.round(Math.sin(i/2*2*Math.PI*220/24000)*800),i);
 takeUrls=await run(`return [1,2].map(()=>URL.createObjectURL(new Blob([Uint8Array.from(atob('${wav.toString('base64')}'),c=>c.charCodeAt(0))],{type:'audio/wav'})))`);
 ipcMain.handle('dub:pronunciations',()=>({ok:true,pronunciations:[]}));ipcMain.handle('dub:latest',()=>({ok:true,output:null}));ipcMain.handle('dialog:openFile',()=> 'Synthetic scene.srt');
 ipcMain.handle('dub:start',(_,value)=>{request=value;return {ok:true,id:value.id};});
 ipcMain.handle('dub:plan',()=>({ok:true,sourceHash:'fixture',groups:[1,2,3].map(i=>({key:String(i),text:'Synthetic group '+i,seconds:4,start:(i-1)*4000,end:i*4000}))}));
 for(const [locale,theme,width,zoom] of [['tr','dark',1440,1],['en','light',900,1.25]]){
  win.setContentSize(width,950);win.webContents.setZoomFactor(zoom);request=null;
  await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');await DubGeneratorUI.prepareCurrent();document.getElementById('dubChooseSrt').click();return true`);
  await until(()=>run(`return document.getElementById('dubSrtName').textContent.includes('Synthetic')`));
  // Start without a prepared edit plan; Edit group text must prepare it on demand.
  await run(`document.getElementById('dubGeneratorStart').click();return true`);await until(()=>!!request);
  for(let group=1;group<=8;group++)win.webContents.send('dub:event',{id:request.id,type:'activity',stage:group%2?'synthesis':'verification',group,attempt:2,elapsed:35,limit:120});
  await wait(100);await capture(locale+'-active');
  const quality={groups:[{group:1,key:'1',status:'ready',text:'First group.',verification:{status:'passed'}},{group:2,key:'2',status:'review',text:'Second group.',verification:{status:'review',recognizedText:'Second.',omission_spans:[{start:0,end:4}]}},{group:3,key:'3',status:'failed',text:'Third group.',verification:{status:'unavailable'}}]};
  win.webContents.send('dub:event',{id:request.id,type:'done',name:'Controlled.wav',url:'file:///controlled.wav',quality});await until(()=>run(`return !document.getElementById('dubOpenQuality').hidden`));
  await run(`document.getElementById('dubOpenQuality').click();return true`);await capture(locale+'-results');
  assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'2');
  if(process.argv.includes('--ab800')){
   await run(`document.getElementById('dubGroupTakes').open=true;document.getElementById('dubGroupTakes').scrollIntoView({block:'center'});return true`);
   await until(()=>run(`return document.getElementById('dubTakeChoice').options.length===3`));
   assert.equal(await run(`return document.getElementById('dubTakeChoice').value`),'previous');
   await run(`document.getElementById('dubTakePlayA').click();return true`);await until(()=>run(`return !document.getElementById('dubTakeCurrent').paused`));
   await run(`document.getElementById('dubTakeCurrent').currentTime=.8;document.getElementById('dubTakePlayB').click();return true`);
   await until(()=>run(`return !document.getElementById('dubTakePreview').paused`));
   assert(await run(`return document.getElementById('dubTakeCurrent').paused&&document.getElementById('dubTakePreview').currentTime>=.75`));
   await run(`document.getElementById('dubTakeChoice').value='changed';document.getElementById('dubTakeChoice').dispatchEvent(new Event('change'));return true`);assert(await run(`return document.getElementById('dubTakeApply').disabled`));
   await run(`document.getElementById('dubTakeChoice').value='previous';document.getElementById('dubTakeChoice').dispatchEvent(new Event('change'));return true`);
   await capture(locale+'-group-ab');await run(`document.getElementById('dubGeneratorDialog').close();return true`);
   assert(await run(`return document.getElementById('dubTakeCurrent').paused&&document.getElementById('dubTakePreview').paused`));continue;
  }
  await run(`document.getElementById('dubNextFlagged').click();return true`);assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'3');
  await run(`document.getElementById('dubEditSelected').click();return true`);await until(()=>run(`return document.getElementById('dubPlanGroup').options.length===3`));assert.equal(await run(`return document.getElementById('dubPlanGroup').value`),'2');
  await run(`document.getElementById('dubNextFlagged').click();document.getElementById('dubQualityEvidence').open=true;document.getElementById('dubQualityEvidence').scrollIntoView({block:'center'});return true`);await capture(locale+'-evidence');
  await run(`document.getElementById('dubGeneratorDialog').close();return true`);
 }
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({ok:true,out,screens:rows.length}));app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),90000).unref();
