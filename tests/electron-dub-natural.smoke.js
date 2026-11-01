'use strict';
// Native renderer/preload acceptance; engine events controlled, GPU runs separately.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','dub-natural-'+Date.now());fs.mkdirSync(out,{recursive:true});
app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated UI test');};require('../src/main');
let win,request,configMode,legacyFast;let globalPronunciations=[],sourcePronunciations=[];const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn){for(let i=0;i<220;i++){if(await fn())return;await wait(75);}throw Error('Native UI timed out');}
async function capture(name){win.show();win.focus();await run('await document.fonts.ready;'+(name.endsWith('-focus')?'':'document.activeElement.blur();')+'await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(350);
 const data=await run(`const d=document.getElementById('dubGeneratorDialog'),f=d.querySelector('footer'),s=d.querySelector('.dub-studio-scroll'),fr=f.getBoundingClientRect(),sr=s.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1,footerVisible:fr.bottom<=innerHeight+1&&fr.top>=0,scrollAboveFooter:sr.bottom<=fr.top+1,activity:document.getElementById('dubGeneratorActivity').textContent,summary:document.getElementById('dubQualitySummary').textContent,deliveryLines:(()=>{const p=document.getElementById('dubNaturalDelivery'),card=p.closest('.dub-card'),cr=card.getBoundingClientRect(),style=getComputedStyle(card),range=document.createRange();range.selectNodeContents(p);return [...range.getClientRects()].filter(r=>r.width>0).map(r=>({left:r.left,right:r.right,limit:cr.right-parseFloat(style.paddingRight),outside:r.right>cr.right-parseFloat(style.paddingRight)+1}));})()};`);
 assert(!data.overflow&&data.footerVisible&&data.scrollAboveFooter,name+' layout');assert(data.deliveryLines.every(line=>!line.outside),name+' delivery text stays within the card');rows.push({name,...data});fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;});win.showInactive();win.setMinimumSize(600,480);await run('await initialSettingsReady');
 for(const channel of ['dub:groupTakes','dub:config','dub:latest','dub:start','dub:plan','dub:pronunciations','dub:references','dialog:openFile'])ipcMain.removeHandler(channel);
 ipcMain.handle('dub:config',()=>({ok:true,ready:true,resultMode:configMode,...(legacyFast?{profile:'fast',verification:'fast',naturalSpeech:false,autoFit:false,timingMode:'clip'}:{}),keepEngine:true,pronunciations:globalPronunciations,engine:'fixture',reference:'Synthetic voice.wav',transcript:'Synthetic reference.txt'}));
 let savedVoiceRows=[];ipcMain.handle('dub:references',()=>({ok:true,references:savedVoiceRows,folder:'controlled-references',activeId:'saved-voice'}));
 let takeUrls=[];ipcMain.handle('dub:groupTakes',()=>({ok:true,choices:[{token:'current',current:true,recordedAt:Date.now(),status:'ready',text:'Current group take.',url:takeUrls[0]},{token:'previous',current:false,recordedAt:Date.now()-60000,status:'ready',text:'Previous group take.',url:takeUrls[1]},{token:'changed',current:false,compareOnly:true,recordedAt:Date.now()-120000,status:'ready',text:'Different text: comparison only.',url:takeUrls[1]}]}));
 const wav=Buffer.alloc(44+24000*4*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(Math.round(Math.sin(i/2*2*Math.PI*220/24000)*800),i);
 takeUrls=await run(`return [1,2].map(()=>URL.createObjectURL(new Blob([Uint8Array.from(atob('${wav.toString('base64')}'),c=>c.charCodeAt(0))],{type:'audio/wav'})))`);
 ipcMain.handle('dub:pronunciations',(_e,value)=>{if(Array.isArray(value)){globalPronunciations=value;return {ok:true,pronunciations:value};}if(value.action==='save')sourcePronunciations=value.entries;const merged=new Map(globalPronunciations.map(row=>[row.from,row]));for(const row of sourcePronunciations)merged.set(row.from,row);return {ok:true,entries:sourcePronunciations,pronunciations:[...merged.values()],scope:'source'};});ipcMain.handle('dub:latest',()=>({ok:true,output:null}));ipcMain.handle('dialog:openFile',()=> 'Synthetic scene.srt');
 ipcMain.handle('dub:start',(_,value)=>{request=value;return {ok:true,id:value.id};});
 ipcMain.handle('dub:plan',()=>({ok:true,sourceHash:'fixture',sourceDecoding:null,groups:[1,2,3].map(i=>({key:String(i),text:'Synthetic group '+i,seconds:4,start:(i-1)*4000,end:i*4000}))}));
 for(const [locale,width] of [['tr',1440],['tr',820],['en',640]]){
  legacyFast=width===820;configMode=width===640?'custom':undefined;win.setContentSize(width,950);win.webContents.setZoomFactor(1);request=null;
  await run(`window.fixtureSource={...BrowserDubAudioUI.context(),mode:'browser',source:'fixture-'+${width},tabId:'fixture-tab',generation:1,mediaId:'fixture-'+${width},mediaKey:'fixture-'+${width},subtitleRange:null,hasMedia:true,visible:true,currentTime:0};BrowserDubAudioUI.context=()=>window.fixtureSource;UiLocale.set('${locale}',false);applyUiTheme('dark');await DubGeneratorUI.prepareCurrent();document.getElementById('dubChooseSrt').click();return true`);
  await until(()=>run(`return document.getElementById('dubSrtName').textContent.includes('Synthetic')`));
  assert.equal(await run(`return DubGeneratorUI.assistant.state().settings.resultMode`),legacyFast?'custom':configMode||'natural');
  await until(()=>run(`return !document.getElementById('dubPronunciations').disabled`));
  if(width===1440){
   await run(`document.getElementById('dubPronunciations').value='Newton = Nyutın';document.getElementById('dubPronunciationSave').click();return true`);
   await until(()=>run(`return document.getElementById('dubPronunciationStatus').dataset.saved==='true'`));
   assert.deepEqual(sourcePronunciations,[{from:'Newton',to:'Nyutın'}]);assert.deepEqual(globalPronunciations,[]);
   await run(`document.getElementById('dubPronunciationScope').value='global';document.getElementById('dubPronunciationScope').dispatchEvent(new Event('change'));document.getElementById('dubPronunciations').value='Gaia = Gaya';document.getElementById('dubPronunciationSave').click();return true`);
   await until(()=>run(`return document.getElementById('dubPronunciationStatus').dataset.saved==='true'`));
   assert.deepEqual(globalPronunciations,[{from:'Gaia',to:'Gaya'}]);
   await run(`document.getElementById('dubPronunciationScope').value='source';document.getElementById('dubPronunciationScope').dispatchEvent(new Event('change'));return true`);
   await until(()=>run(`return !document.getElementById('dubPronunciations').disabled&&document.getElementById('dubPronunciations').value.includes('Newton')`));
   assert.equal(await run(`return document.getElementById('dubPronunciations').value.includes('Gaia')`),false);
  }

  assert(await run(`return !document.getElementById('dubManualSettings').open&&!document.getElementById('dubScopeSettings').open`));
  await run(`document.getElementById('dubQualityResults').open=false;document.querySelector('.dub-studio-scroll').scrollTop=0;return true`);assert(await run(`return document.querySelector('.dub-experience').hidden`));assert(await run(`return document.getElementById('dubCurrentVoiceName').textContent==='Synthetic voice.wav'&&document.getElementById('voiceReferenceLibrary').hidden&&document.getElementById('voiceReferenceSelect').getBoundingClientRect().height===0&&!document.getElementById('voiceReferenceFolder').closest('#voiceReferenceLibrary')&&!!document.querySelector('#dubManualSettings #dubEngineSettings')`),'Empty library keeps active voice clear and folder/production settings reachable');
  const column=await run(`const input=document.querySelector('.dub-input-column');return {width:innerWidth,children:[...input.children].map(n=>n.className),height:input.getBoundingClientRect().height,source:document.querySelector('.dub-source-card').getBoundingClientRect().height,production:document.querySelector('.dub-natural-card').getBoundingClientRect().height};`);rows.push({name:locale+'-'+width+'-input-flow',...column});
  await capture(locale+'-'+width+'-ready');
  const setupOrder=await run(`const source=document.querySelector('.dub-source-card'),voice=document.querySelector('.dub-voice-card'),production=document.querySelector('.dub-natural-card');return {voiceBeforeProduction:!!(voice.compareDocumentPosition(production)&Node.DOCUMENT_POSITION_FOLLOWING),sourceBeforeVoice:!!(source.compareDocumentPosition(voice)&Node.DOCUMENT_POSITION_FOLLOWING),sourceOnly:document.querySelector('.dub-input-column').children.length===1,productionBelowVoice:production.getBoundingClientRect().top>=voice.getBoundingClientRect().bottom-1};`);assert(setupOrder.voiceBeforeProduction&&setupOrder.sourceBeforeVoice&&setupOrder.sourceOnly&&setupOrder.productionBelowVoice,'Setup follows subtitle, voice, production document and visual order');
  await run(`applyUiTheme('light');return true`);await capture(locale+'-'+width+'-ready-light');await run(`applyUiTheme('dark');return true`);
  if(width===1440){
   await run(`document.querySelector('#voiceReferenceRecorder>summary').focus();return true`);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(50);assert(await run(`return document.activeElement===document.querySelector('#dubManualSettings>summary')`),'Keyboard moves from reference setup to production settings');
  }
  if(width===1440){
   savedVoiceRows=[{id:'saved-voice',name:'Saved narrator',path:'Synthetic voice.wav',url:takeUrls[0],text:'Synthetic reference transcript.'}];
   await run(`await VoiceReferenceUI.refresh();return true`);assert(await run(`return !document.getElementById('voiceReferenceLibrary').hidden&&!document.getElementById('voiceReferenceLibrary').open`),'Saved references appear without preparing another recording');
   await run(`document.getElementById('voiceReferenceLibrary').open=true;return true`);await capture(locale+'-'+width+'-saved-voices');
   assert(await run(`return document.getElementById('voiceReferenceUse').getBoundingClientRect().height>0&&document.getElementById('dubCurrentVoiceName').textContent==='Synthetic voice.wav'`),'Changing the disclosure does not change the active voice');
   savedVoiceRows=[];await run(`await VoiceReferenceUI.refresh();return true`);
  }

  // Legacy fast/off settings restore as custom; explicit recommendation upgrades quality only.
  await run(`document.getElementById('dubProfile').value='fast';document.getElementById('dubVerification').value='fast';document.getElementById('dubNaturalSpeech').checked=false;document.getElementById('dubAutoFit').checked=false;document.getElementById('dubTimingMode').value='clip';document.getElementById('dubConcurrency').value='8';document.getElementById('dubGrouping').value='anlatim';document.getElementById('dubProfile').dispatchEvent(new Event('change'));return true`);
  assert(await run(`return !document.getElementById('dubNaturalRecommend').hidden`));
  if(width===1440)await run(`await DubGeneratorUI.editPlanGroup('1');document.getElementById('dubPlanText').value='Authored wording stays intact.';document.getElementById('dubPlanApply').click();document.getElementById('dubTextEditor').open=false;return true`);
  const preserved=await run(`return JSON.stringify({voice:document.getElementById('dubVoiceName').textContent,srt:DubGeneratorUI.experience().srt,range:[document.getElementById('dubRangeEnabled').checked,document.getElementById('dubRangeStart').value,document.getElementById('dubRangeEnd').value],sample:document.getElementById('dubSampleOnly').checked,edits:DubGeneratorUI.experience().edits})`);
  await run(`document.getElementById('dubNaturalRecommend').click();return true`);
  assert.equal(await run(`return JSON.stringify({voice:document.getElementById('dubVoiceName').textContent,srt:DubGeneratorUI.experience().srt,range:[document.getElementById('dubRangeEnabled').checked,document.getElementById('dubRangeStart').value,document.getElementById('dubRangeEnd').value],sample:document.getElementById('dubSampleOnly').checked,edits:DubGeneratorUI.experience().edits})`),preserved);
  assert(await run(`return document.getElementById('dubProfile').value==='quality'&&document.getElementById('dubVerification').value==='detailed'&&document.getElementById('dubNaturalSpeech').checked&&document.getElementById('dubAutoFit').checked&&document.getElementById('dubTimingMode').value==='video'&&document.getElementById('dubConcurrency').value==='8'&&document.getElementById('dubGrouping').value==='anlatim'`));
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(30);
  await run(`document.getElementById('dubGeneratorStart').focus();return true`);
  assert(await run(`const b=document.activeElement,c=getComputedStyle(b),r=b.getBoundingClientRect();return b.id==='dubGeneratorStart'&&c.outlineStyle!=='none'&&r.bottom<=innerHeight&&r.top>=0`));
  await capture(locale+'-'+width+'-focus');
  await run(`document.getElementById('dubGeneratorStart').click();return true`);await until(()=>!!request);
  if(width===1440)assert.equal(request.dubText.edits['1'],'Authored wording stays intact.');assert.equal(request.resultMode,'natural');assert.equal(request.profile,'quality');assert.equal(request.verification,'detailed');assert.equal(request.naturalSpeech,true);assert.equal(request.autoFit,true);
  win.webContents.send('dub:event',{id:request.id,type:'phase',stage:'verification'});await wait(80);assert(await run(`return document.querySelector('.dub-experience').hidden`));await capture(locale+'-'+width+'-active');
  win.webContents.send('dub:event',{id:request.id,type:'group',group:{key:'1',group:1,status:'ready',text:'Controlled sentence.',verification:{status:'passed'}}});await until(()=>run(`return !document.querySelector('.dub-experience').hidden`));
  win.webContents.send('dub:event',{id:request.id,type:'done',name:'Controlled.wav',path:'controlled.wav',url:takeUrls[0],settings:{speechSourceStatus:width===820?'unavailable':'available',speechSourceGroups:width===820?0:1,deliveryAutomatic:true,deliveryApplied:1},quality:{groups:[{key:'1',group:1,status:width===640?'review':'ready',speechEditing:{natural:width===820?'source_unavailable':'source_reviewed'},text:'A natural sentence.',sourceStart:0,sourceEnd:4,audioStart:0,audioEnd:4,verification:{status:'passed',...(width===640?{missing_names:['Newton']}: {})}}]}});
  await until(()=>run(`return !document.getElementById('dubPreviewCard').hidden`));
  assert(await run(`return !document.getElementById('dubVerificationSummary').hidden&&document.getElementById('dubVerificationSummary').textContent.includes(${JSON.stringify(width===640?'listening check':locale==='en'?'Text checks passed':'metin denetiminden geçti')})`));
  if(width===820)assert.equal(await run(`return document.getElementById('dubNaturalReview').textContent`),'Kaynak metin eşleştirilemedi; mevcut Türkçe metin korundu.');
  await run(`document.getElementById('dubPreviewCard').scrollIntoView({block:'start'});return true`);assert(await run(`return !document.querySelector('.dub-experience').hidden`));await capture(locale+'-'+width+'-review');
  await run(`document.getElementById('dubNaturalReviewOpen').click();return true`);assert(await run(`return document.getElementById('dubQualityResults').open&&document.activeElement.id==='dubQualityGroup'`));
  if(width===640){
   assert(await run(`return !document.getElementById('dubEditPronunciation').hidden`));
   await run(`document.getElementById('dubEditPronunciation').click();return true`);
   await until(()=>run(`return document.activeElement.id==='dubPronunciations'&&document.getElementById('dubEngineSettings').open`));
   await capture(locale+'-'+width+'-pronunciation');
  }

  if(width===1440){
   await run(`document.getElementById('dubProfile').value='quality';document.getElementById('dubProfile').dispatchEvent(new Event('change'));return true`);
   request=null;await run(`document.getElementById('dubGeneratorStart').click();return true`);await until(()=>!!request);assert.equal(request.resultMode,'custom');
   win.webContents.send('dub:event',{id:request.id,type:'done',name:'Controlled.wav',path:'controlled.wav',url:takeUrls[0],quality:{groups:[]}});await until(()=>run(`return document.getElementById('dubGeneratorCancel').disabled`));
  }
  await run(`document.getElementById('dubGeneratorDialog').close();return true`);
 }
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({ok:true,out,screens:rows.length}));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,rows},null,2));console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),90000).unref();
