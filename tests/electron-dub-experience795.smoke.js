'use strict';
// Native renderer/preload acceptance; engine events controlled, GPU runs separately.
const {app,BrowserWindow,ipcMain,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-experience795-'+Date.now());fs.mkdirSync(out,{recursive:true});
app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated UI test');};require('../src/main');
let selectedFixture;const subtitleFiles={};
if(process.argv.includes('--experience801')){for(const [key,text]of [['speech','Toplam 2 kişi geldi.'],['normal','Toplam 12 kişi geldi.'],['source','A total of 12 people arrived.']]){const file=path.join(out,key==='speech'?'Synthetic scene.srt':key+'.srt');fs.writeFileSync(file,'\ufeff1\n00:00:00,000 --> 00:00:04,000\n'+text+'\n\n2\n00:00:04,000 --> 00:00:08,000\n'+text+'\n');subtitleFiles[key]=file;}if(process.argv.includes('--compare804'))for(const [key,file]of Object.entries(subtitleFiles)){let text='';for(let i=0;i<14;i++){const start=i*4,end=start+4,time=v=>'00:'+String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')+',000';const body=key==='source'?'A total of 12 people arrived.':key==='normal'&&i===0?'Toplam 12 kişi geldi.':'Toplam 2 kişi geldi.';text+=(i+1)+'\n'+time(start)+' --> '+time(end)+'\n'+body+'\n\n';}fs.writeFileSync(file,'\ufeff'+text);}selectedFixture=subtitleFiles.speech;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selectedFixture]});}
let win,request;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn){for(let i=0;i<220;i++){if(await fn())return;await wait(75);}throw Error('Native UI timed out');}
async function capture(name){win.show();win.focus();await run('await document.fonts.ready;document.activeElement.blur();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(350);
 const data=await run(`const d=document.getElementById('dubGeneratorDialog'),f=d.querySelector('footer'),s=d.querySelector('.dub-studio-scroll'),fr=f.getBoundingClientRect(),sr=s.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1,footerVisible:fr.bottom<=innerHeight+1&&fr.top>=0,scrollAboveFooter:sr.bottom<=fr.top+1,activity:document.getElementById('dubGeneratorActivity').textContent,summary:document.getElementById('dubQualitySummary').textContent};`);
 assert(!data.overflow&&data.footerVisible&&data.scrollAboveFooter,name+' layout');rows.push({name,...data});fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;});win.showInactive();win.setMinimumSize(600,480);await run('await initialSettingsReady');
 for(const channel of ['dub:groupTakes','dub:config','dub:latest','dub:start','dub:plan','dub:pronunciations','dialog:openFile'])if(channel!=='dialog:openFile'||!process.argv.includes('--experience801'))ipcMain.removeHandler(channel);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true,keepEngine:true,pronunciations:process.argv.includes('--compare804')?[{from:'Synthetic',to:'Sentetik'}]:[],engine:'fixture',reference:'Synthetic voice.wav',transcript:'Synthetic reference.txt'}));
 let takeUrls=[];ipcMain.handle('dub:groupTakes',()=>({ok:true,choices:[{token:'current',current:true,recordedAt:Date.now(),status:'ready',text:'Current group take.',url:takeUrls[0]},{token:'previous',current:false,recordedAt:Date.now()-60000,status:'ready',text:'Previous group take.',url:takeUrls[1]},{token:'changed',current:false,compareOnly:true,recordedAt:Date.now()-120000,status:'ready',text:'Different text: comparison only.',url:takeUrls[1]}]}));
 const wav=Buffer.alloc(44+24000*4*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(Math.round(Math.sin(i/2*2*Math.PI*220/24000)*800),i);
 takeUrls=await run(`return [1,2].map(()=>URL.createObjectURL(new Blob([Uint8Array.from(atob('${wav.toString('base64')}'),c=>c.charCodeAt(0))],{type:'audio/wav'})))`);
 ipcMain.handle('dub:pronunciations',()=>({ok:true,pronunciations:[]}));ipcMain.handle('dub:latest',()=>({ok:true,output:null}));if(!process.argv.includes('--experience801'))ipcMain.handle('dialog:openFile',()=> 'Synthetic scene.srt');
 ipcMain.handle('dub:start',(_,value)=>{request=value;return {ok:true,id:value.id};});
 if(process.argv.includes('--output812')){ipcMain.removeHandler('shell:openPath');ipcMain.handle('shell:openPath',()=> 'Controlled missing file');}
 ipcMain.handle('dub:plan',()=>({ok:true,sourceHash:'fixture',sourceDecoding:process.argv.includes('--quantity808')?{encoding:'cp1254',repaired:false}:null,groups:[1,2,3].map(i=>({key:String(i),text:'Synthetic group '+i,seconds:4,start:(i-1)*4000,end:i*4000}))}));
 for(const [locale,theme,width,zoom] of [['tr','dark',1440,1],['en','light',900,1.25]]){
  win.setContentSize(width,950);win.webContents.setZoomFactor(zoom);request=null;if(process.argv.includes('--experience801'))selectedFixture=subtitleFiles.speech;
  if(process.argv.includes('--experience801'))await run(`window.fixtureSource={...BrowserDubAudioUI.context(),mode:'browser',source:'fixture-scene',tabId:'fixture-tab',generation:1,mediaId:'fixture-media',subtitleRange:null,hasMedia:true,visible:true,currentTime:6};BrowserDubAudioUI.context=()=>window.fixtureSource;return true`);
  await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');await DubGeneratorUI.prepareCurrent();document.getElementById('dubChooseSrt').click();return true`);
  await until(()=>run(`return document.getElementById('dubSrtName').textContent.includes('Synthetic')`));
  // Start without a prepared edit plan; Edit group text must prepare it on demand.
  await run(`document.getElementById('dubGeneratorStart').click();return true`);await until(()=>!!request);
  if(process.argv.includes('--review803')){const before=await run(`return JSON.stringify(DubGeneratorUI.experience().edits)`);await run(`document.getElementById('dubPlanText').value='Must not overwrite active production';document.getElementById('dubPlanApply').dispatchEvent(new Event('click'));document.getElementById('dubPlanReset').dispatchEvent(new Event('click'));return true`);assert.equal(await run(`return JSON.stringify(DubGeneratorUI.experience().edits)`),before);}
  if(process.argv.includes('--output812')){win.webContents.send('dub:event',{id:request.id,type:'progress',done:3,total:3});await wait(60);assert.equal(await run(`return document.getElementById('dubGeneratorProgress').value`),99);assert(await run(`return !document.getElementById('dubGeneratorCancel').disabled`));}
  for(let group=1;group<=8;group++)win.webContents.send('dub:event',{id:request.id,type:'activity',stage:group%2?'synthesis':'verification',group,attempt:2,elapsed:35,limit:120});
  await wait(100);await capture(locale+'-active');
  const quality={groups:[{group:1,key:'1',status:'ready',text:'First group.',verification:{status:'passed'}},{group:2,key:'2',status:'review',text:'Second group.',verification:{status:'review',recognizedText:'Second.',omission_spans:[{start:0,end:4}]}},{group:3,key:'3',status:'failed',text:'Third group.',verification:{status:'unavailable'}}]};
  if(process.argv.includes('--review803'))quality.groups[1].verification.missing_numbers=['2065'];
  if(process.argv.includes('--experience801'))for(const g of quality.groups){g.sourceStart=(g.group-1)*4;g.sourceEnd=g.group*4;g.audioStart=g.sourceStart;g.audioEnd=g.sourceEnd;g.continuity={status:'measured',levelDb:-24,wordsPerSecond:2.5,gainDb:g.group===2?2:0,warnings:g.group===2?['level-jump']:[]};}
  if(process.argv.includes('--continuity813'))quality.groups[0].continuity={status:'measured',levelDb:-20,wordsPerSecond:3.5,gainDb:0,warnings:['pace-jump']};
  win.webContents.send('dub:event',{id:request.id,type:'done',path:'controlled-missing.wav',metrics:process.argv.includes('--voice809')?{cached_groups:2,generated_groups:1}:null,settings:process.argv.includes('--voice809')?{referenceName:'Saved narrator.wav',steps:15,grouping:'akici',verification:'detailed',timingMode:'video',range:{start:5,end:65}}:null,subtitle:'Saved source.srt',name:process.argv.includes('--interface807')?'A very long controlled output name with enough detail to test truncation and access to the complete original file name.wav':'Controlled.wav',url:process.argv.includes('--continuity813')?takeUrls[0]:'file:///controlled.wav',quality});await until(()=>run(`return !document.getElementById('dubOpenQuality').hidden`));
  if(process.argv.includes('--continuity813')){
   await run(`const item=document.querySelector('.dub-continuity-row');item.closest('.dub-experience').open=true;item.closest('details').open=true;item.scrollIntoView({block:'center'});return true`);
   const result=await run(`const group=DubGeneratorUI.assistant.state({group_id:'1'}).groups[0];return {needsListening:group.needsListening,reasons:group.reviewReasons};`);assert(result.needsListening);assert(result.reasons.some(x=>/pace|hız/.test(x)));
   const target=await run(`const r=document.querySelector('.dub-continuity-row button:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,top:r.top,bottom:r.bottom,height:innerHeight};`);assert(target.top>=0&&target.bottom<=target.height);win.focus();const zoom=win.webContents.getZoomFactor(),x=Math.round(target.x*zoom),y=Math.round(target.y*zoom);win.webContents.sendInputEvent({type:'mouseMove',x,y});win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
   await until(()=>run(`return DubGeneratorUI.assistant.state().playingGroup==='1'`));
   await run(`document.querySelector('.dub-continuity-row').scrollIntoView({block:'center'});return true`);await capture(locale+'-continuity-listen');
   await run(`document.getElementById('dubQualityGroup').value='2';document.getElementById('dubQualityGroup').dispatchEvent(new Event('change'));return true`);
  }
  if(process.argv.includes('--output812')){
   assert.equal(await run(`return document.getElementById('dubGeneratorProgress').value`),100);
   await run(`document.getElementById('dubGeneratorOutput').click();return true`);await until(()=>run(`return /açılamadı|Could not open/.test(document.getElementById('dubGeneratorStatus').textContent)`));
   await capture(locale+'-output-error');await run(`document.getElementById('dubGeneratorDialog').close();return true`);continue;
  }
  if(process.argv.includes('--interface807')){
   assert(await run(`return document.getElementById('dubGeneratedName').title===document.getElementById('dubGeneratedName').textContent&&document.getElementById('dubReadySource').title===document.getElementById('dubReadySource').textContent`));
   await run(`const menu=document.querySelector('.dub-files-menu');menu.open=true;menu.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true`);
   assert(await run(`return !document.querySelector('.dub-files-menu').open&&document.activeElement===document.querySelector('.dub-files-menu>summary')`));
   await run(`document.querySelector('.dub-files-menu').open=true;document.querySelector('.dub-studio-scroll').dispatchEvent(new Event('scroll'));return true`);assert(await run(`return !document.querySelector('.dub-files-menu').open`));
   await run(`document.querySelector('.dub-files-menu').open=true;document.querySelector('.dub-studio-scroll').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return true`);assert(await run(`return !document.querySelector('.dub-files-menu').open`));
  }
  if(process.argv.includes('--voice809')){
   await run(`document.getElementById('dubSavedRecipe').open=true;document.getElementById('dubSavedRecipe').scrollIntoView({block:'center'});return true`);
   assert(await run(`return document.getElementById('dubSavedRecipe').textContent.includes('Saved narrator.wav')&&document.getElementById('dubCacheInfo').textContent.includes('2')`));
   await capture(locale+'-saved-recipe');
   await run(`document.getElementById('dubGrouping').value='satir';document.getElementById('dubGrouping').dispatchEvent(new Event('change'));return true`);
   assert(await run(`return document.getElementById('dubSavedRecipe').textContent.includes('${locale==='en'?'Flowing blocks':'Akıcı bloklar'}')`),'Saved output must not take on next-job settings');
   await run(`document.getElementById('dubGeneratorDialog').close();return true`);continue;
  }
  await run(`document.getElementById('dubOpenQuality').click();return true`);await capture(locale+'-results');
  assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'2');
  if(process.argv.includes('--review803')){
   assert(await run(`return document.getElementById('dubQualityReasons').textContent.includes('2065')`));
   for(const [kind,key]of [['review','2'],['failed','3'],['ready','1']]){await run(`document.querySelector('[data-quality-filter="${kind}"]').click();return true`);assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),key);assert.equal(await run(`return document.getElementById('dubQualityGroup').options.length`),1);}
   await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));return true`);assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'2');
   await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true}));return true`);assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'3');
   await run(`document.getElementById('dubPlanText').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));return true`);assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'3');await run(`document.getElementById('dubQualityGroup').value='2';document.getElementById('dubQualityGroup').dispatchEvent(new Event('change'));return true`);
  }
  if(process.argv.includes('--experience801')){
   assert(await run(`return !document.getElementById('voiceReferenceUse').closest('#voiceReferenceRecorder')&&!document.getElementById('voiceReferencePreview').closest('#voiceReferenceRecorder')`));
   if(process.argv.includes('--quantity808')){await run(`document.getElementById('dubPlanPrepare').click();return true`);await until(()=>run(`return !document.getElementById('dubPlanDecoding').hidden`));assert(await run(`return document.getElementById('dubPlanDecoding').textContent.includes('cp1254')`));await run(`document.getElementById('dubPlanDecoding').scrollIntoView({block:'center'});return true`);await capture(locale+'-source-decoding');}
   await run(`document.querySelector('.dub-experience').open=true;await DubExperienceUI.preflight();document.querySelector('.dub-experience').scrollIntoView({block:'start'});return true`);assert(await run(`return !document.querySelector('.dub-preflight').hidden`));await capture(locale+'-preflight');await run(`document.getElementById('voiceReferencePicker').scrollIntoView({block:'center'});return true`);assert(await run(`const r=document.getElementById('voiceReferenceUse').getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<innerHeight`));await capture(locale+'-voice-selection');
   assert(await run(`return DubGeneratorUI.editAtCurrent(6)`));assert.equal(await run(`return document.getElementById('dubQualityGroup').value`),'2');if(process.argv.includes('--compare804'))assert(await run(`return !document.getElementById('dubPlanPronunciationPreview').hidden&&document.getElementById('dubPlanPronunciationPreview').textContent.includes('Sentetik')`));
   await run(`document.getElementById('dubPlanText').value='Edited second sentence.';document.getElementById('dubPlanApply').click();return true`);
   const previousId=request.id;await run(`document.getElementById('dubRegenerateGroup').click();return true`);await until(()=>request.id!==previousId);assert.deepEqual(request.forceGroups,['2']);assert.equal(request.dubText.edits['2'],'Edited second sentence.');
   win.webContents.send('dub:event',{id:request.id,type:'done',name:'Controlled repaired.wav',url:'file:///controlled.wav',quality});await until(()=>run(`return !DubGeneratorUI.experience().busy`));
   await run(`fixtureSource.source='other-scene';return true`);assert.equal(await run(`return DubGeneratorUI.editAtCurrent(6)`),false);await run(`fixtureSource.source='fixture-scene';return true`);
   if(process.argv.includes('--interface807')){win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await run(`document.querySelector('.dub-files-menu').open=true;return true`);}
   // Three real subtitle files through the existing authorized file chooser/read IPC.
   await run(`await DubExperienceUI.comparison();return true`);await until(()=>run(`return !!document.querySelector('.speech-compare-dialog[open]')`));
   if(process.argv.includes('--interface807')){assert(await run(`return !document.querySelector('.dub-files-menu').open&&getComputedStyle(document.querySelector('.speech-compare-dialog')).animationName==='none'`));win.webContents.debugger.detach();}
   selectedFixture=subtitleFiles.source;await run(`document.querySelector('.speech-compare-controls button:first-child').click();return true`);await until(()=>run(`return document.querySelector('.speech-compare-columns section:first-child p')?.textContent.includes('people')`));
   selectedFixture=subtitleFiles.normal;await run(`document.querySelector('.speech-compare-controls .speech-file-control:nth-child(2) button').click();return true`);await until(()=>run(`return !!document.querySelector('.speech-compare-diff')`));await run(`document.querySelector('.speech-compare-diff').open=true;return true`);assert(await run(`return document.querySelector('.speech-compare-diff').textContent.includes('12')`));
   if(process.argv.includes('--compare804')){
    assert(await run(`return document.querySelector('.speech-file-control:nth-child(2) span').textContent==='normal.srt'`));
    await run(`const x=document.querySelector('.speech-compare-filters input');x.checked=true;x.dispatchEvent(new Event('change'));return true`);assert.equal(await run(`return document.querySelectorAll('.speech-compare-row').length`),1);
    await run(`const x=document.querySelector('.speech-compare-filters label:nth-child(2) input');x.checked=true;x.dispatchEvent(new Event('change'));return true`);assert.equal(await run(`return document.querySelectorAll('.speech-compare-row').length`),1);
    await run(`for(const x of document.querySelectorAll('.speech-compare-filters input')){x.checked=false;x.dispatchEvent(new Event('change'));}document.querySelector('.speech-compare-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));return true`);assert.equal(await run(`return document.querySelector('.speech-compare-pager span').textContent`),'2 / 2');
    await run(`document.querySelector('.speech-compare-filters input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true}));return true`);assert.equal(await run(`return document.querySelector('.speech-compare-pager span').textContent`),'2 / 2');await run(`document.querySelector('.speech-compare-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true}));return true`);
   }
   const compareBounds=await run(`const d=document.querySelector('.speech-compare-dialog'),b=d.querySelector('.speech-compare-body'),f=d.querySelector('.speech-compare-pager');return {overflow:d.scrollWidth>d.clientWidth+1,separate:b.getBoundingClientRect().bottom<=f.getBoundingClientRect().top+1}`);assert(!compareBounds.overflow&&compareBounds.separate);await capture(locale+'-speech-comparison');
   await run(`document.querySelector('.speech-compare-dialog').close();return true`);
   if(process.argv.includes('--compare804')){await run(`fixtureSource.subtitleRange={start:2,end:8};await DubGeneratorUI.prepareCurrent();return true`);assert(await run(`return !document.getElementById('dubRangeOrigin').hidden`));await run(`document.getElementById('dubRangeEnd').value='0:09';document.getElementById('dubRangeEnd').dispatchEvent(new Event('input'));return true`);assert(await run(`return document.getElementById('dubRangeOrigin').hidden`));}
   if(process.argv.includes('--interface807'))await run(`document.querySelector('.dub-files-menu').open=true;return true`);
   await run(`document.getElementById('dubGeneratorDialog').close();MediaExperience.openTasks();return true`);
   if(process.argv.includes('--interface807')){await wait(70);assert(await run(`return !document.querySelector('.dub-files-menu').open`),'Closed studio cannot keep a visible old file menu');}await until(()=>run(`return !!document.querySelector('#globalTaskCenter [data-filter=review]')`));
   if(process.argv.includes('--interface807')){
    win.webContents.send('dub:event',{id:'other-ready-job',type:'done',quality:{groups:[{key:'one',group:1,status:'ready'}]}});await wait(70);
    await run(`document.querySelector('#globalTaskCenter [data-filter=ready]').click();document.getElementById('globalTaskCenter').close();return true`);await wait(80);
    await run(`MediaExperience.openTasks();return true`);assert(await run(`return document.querySelector('#globalTaskCenter [data-filter=ready]').getAttribute('aria-pressed')==='true'&&!document.getElementById('globalTaskFilterHint').hidden`));
    await run(`UiLocale.set('${locale==='en'?'tr':'en'}',false);return true`);assert.equal(await run(`return document.querySelector('#globalTaskCenter h2').textContent`),locale==='en'?'İşlem merkezi':'Activity');
    await run(`UiLocale.set('${locale}',false);return true`);await capture(locale+'-retained-task-filter');
    await run(`document.querySelector('#globalTaskCenter [data-filter=all]').click();return true`);assert(await run(`return document.getElementById('globalTaskFilterHint').hidden`));
   }
   assert(await run(`return document.querySelectorAll('#globalTaskCenter .mx-task-section').length>0`));await capture(locale+'-production-center');await run(`document.getElementById('globalTaskCenter').close();return true`);continue;
  }
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
