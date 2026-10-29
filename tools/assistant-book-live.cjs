'use strict';
// Opt-in live model + real isolated Windows controls/approval/persistence. No personal settings mutations.
const {app,BrowserWindow,safeStorage,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Decrypt under the original OS-crypt profile in a separate process, then send only over Node IPC.
if(process.argv.includes('--credential-broker')){
 if(typeof process.send!=='function'){app.exit(2);return;}
 app.setName('whisper-browser');app.setPath('userData',path.join(app.getPath('appData'),'whisper-browser'));
 app.whenReady().then(()=>{
  const dir=app.getPath('userData'),{SafeSecretStore}=require('../src/secret-store'),settings=require('../src/assistant-settings');
  const loaded=new SafeSecretStore({safeStorage,filePath:path.join(dir,'secrets.safe.json')}).withSecrets(JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'))),config=settings.resolve(loaded.settings,{});
  if(!loaded.ok||!config.apiKey||config.model!==settings.MODEL||config.endpoint!==settings.ENDPOINT)throw Error('Secure live configuration unavailable');
  process.send({type:'credential',key:config.apiKey},()=>app.exit(0));
 }).catch(()=>{process.send({type:'error'},()=>app.exit(1))});return;
}
if(!process.argv.includes('--live-deepseek')){console.error('Explicit --live-deepseek consent required; paid standard-tier inference.');app.exit(2);return;}
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-book-live',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const nativeFetch=global.fetch;let calls=0,key='';
const keyReady=new Promise((resolve,reject)=>{
 const broker=require('node:child_process').spawn(process.execPath,[__filename,'--credential-broker'],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const timer=setTimeout(()=>{broker.kill();reject(Error('Secure broker timed out'))},20000);
 broker.on('message',message=>{if(message?.type==='credential'&&typeof message.key==='string'&&message.key){key=message.key;clearTimeout(timer);resolve();}else if(message?.type==='error'){clearTimeout(timer);reject(Error('Secure broker unavailable'))}});
 broker.on('error',()=>{clearTimeout(timer);reject(Error('Secure broker could not start'))});
 broker.on('exit',code=>{if(!key){clearTimeout(timer);reject(Error('Secure broker exited before credential handoff'))}});
});keyReady.catch(()=>{});

global.fetch=async(url,options={})=>{
 if(String(url)!=='https://api.deepinfra.com/v1/openai/chat/completions')throw Error('Native acceptance network isolated');
 await keyReady;const body=JSON.parse(options.body);assert(!Object.hasOwn(body,'service_tier'));assert.equal(body.model,'deepseek-ai/DeepSeek-V4.1-Flash-1017');if(++calls>16)throw Error('Live request budget exceeded');
 return nativeFetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+key},signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(60000)])});
};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+90000;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,assistant:{endpointPreset:'https://api.deepinfra.com/v1/openai',model:'deepseek-ai/DeepSeek-V4.1-Flash-1017',flex:false},ui:{uiLocale:'tr',uiTheme:'dark'}}));
const source=path.join(out,'Two page book.pdf');
fs.writeFileSync(source,require('../tests/helpers/pdf-fixture')([
 'The cedar chest code is ORION-412. Its ribbon is blue.',
 'The marble chest code is LYRA-709. Its ribbon is amber.'
]));
app.setPath('downloads',out);
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
const {ipcMain}=require('electron');let generationRequests=0;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,request,...args)=>{
 if(channel==='dub:start'||channel==='dub:textVoice'&&request?.action==='start'){
  generationRequests++;throw Error('Book acceptance must not generate audio');
 }
 return listener(event,request,...args);
});
require('../src/main');let win,overlay;const checks=[];
app.whenReady().then(async()=>{
 await keyReady;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');win.setContentSize(1400,980);win.showInactive();
 const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);
 await run(`await initialSettingsReady;document.getElementById('assistantApiKey').value='synthetic-native-token';await saveAppSettings();await openPlayer();await openPdfReader();return true`);
 await until(()=>run(`return !!player.pdfReader?.pages.get(1)&&!!BookAssistantUI.assistant.state()`),'first PDF page');
 overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));
 const panel=s=>overlay.webContents.executeJavaScript('(async()=>{'+s+'})()',true);
 await panel(`document.getElementById('bubble').click();return true`);await wait(300);console.log(JSON.stringify({stage:'ready',calls}));
 async function ask(text){
  await until(()=>panel(`return !document.getElementById('send').disabled`),'ready');
  await wait(250);const before=await panel(`return document.querySelectorAll('.message.user').length`);console.log(JSON.stringify({stage:'question',calls}));
  await panel(`document.getElementById('text').value=${JSON.stringify(text)};document.getElementById('form').requestSubmit();return true`);
  await until(()=>panel(`return document.querySelectorAll('.message.user').length>${before}&&!document.getElementById('send').disabled&&!document.querySelector('.message.loading')`),'response');
  console.log(JSON.stringify({stage:'response',calls}));return panel(`return [...document.querySelectorAll('.message')].filter(x=>!x.classList.contains('user')).at(-1)?._searchText||''`);
 }
 if(!process.argv.includes('--prepare-only')){const first=await ask('Bu açık PDF sayfasındaki sandık kodunu ve kurdele rengini aynen söyle. Yalnız açık sayfayı kullan; üretim başlatma.');
 checks.push({case:'page1',reply:first});assert.match(first,/ORION.?412/i);assert.match(first,/blue|mavi/i);assert.doesNotMatch(first,/LYRA/);
 }await run(`document.getElementById('pdfReaderPage').value='2';document.getElementById('pdfReaderPage').dispatchEvent(new Event('change'));return true`);
 await until(()=>run(`return player.pdfReader.currentPage===2&&!!player.pdfReader.pages.get(2)`),'second PDF page');
 if(!process.argv.includes('--prepare-only')){const second=await ask('Şimdi açık olan sayfadaki sandık kodu ve kurdele rengi ne? Yalnız güncel sayfayı kullan.');
 checks.push({case:'page2',reply:second});assert.match(second,/LYRA.?709/i);assert.match(second,/amber|kehribar/i);assert.doesNotMatch(second,/ORION/);
 }const before=await panel(`return [...document.querySelectorAll('.tool-card')].map(x=>x.dataset.proposalId)`);
 await ask('Yalnız bu açık PDF kitabının 2. sayfasını orijinal metniyle seslendirmeye hazırla. Ses üretme, sadece hazırlık ekranını aç.');
 const id=await panel(`return [...document.querySelectorAll('.tool-card')].find(x=>!${JSON.stringify(before)}.includes(x.dataset.proposalId))?.dataset.proposalId`);assert(id,'Expected a narration preparation card');
 await panel(`document.querySelector('[data-proposal-id="${id}"] [data-tool-control="apply"]').click();document.getElementById('reviewConfirm').click();return true`);
 await until(()=>run(`return !!MediaWorkflowsUI.assistant.state()`),'production preparation');
 const production=await run(`const p=MediaWorkflowsUI.assistant.state();if(!p)return null;const result=await api.mediaWorkflows({action:'book-open',id:p.id});return {total:p.total,selected:p.selected,text:result.project.chapters[0].text,busy:p.busy}`);
 assert.equal(production.total,1);assert.match(production.text,/LYRA-709/);assert.doesNotMatch(production.text,/ORION/);assert(!production.busy);
 checks.push({case:'prepare-page2',...production});await until(()=>run(`return !AssistantAgentUI.busy()`),'assistant apply terminal');await wait(300);const receipt=await panel(`return document.getElementById('workspaceError').textContent`);checks.push({case:'receipt',text:receipt});assert.equal(receipt,'','Successful preparation cannot be reported cancelled');
 await wait(250);fs.writeFileSync(path.join(out,'book-assistant-tr.png'),(await overlay.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(out,'prepared-page2-tr.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(generationRequests,0);const evidence={ok:true,standardTier:true,providerCalls:calls,checks,generationRequests,productionStarted:false,limits:'Synthetic PDF; real Windows renderer, PDF extraction, live model, approval, production preparation. No GPU/audio generation/human quality.'};
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({out,ok:true,calls}));app.exit(0);
}).catch(async e=>{console.error(String(e.stack||e).replaceAll(key||'NO_KEY','[redacted]'));console.error(JSON.stringify({calls,checks}));fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));try{fs.writeFileSync(path.join(out,'failure-panel.png'),(await overlay.webContents.capturePage()).toPNG());}catch{}app.exit(1);});setTimeout(()=>app.exit(2),240000).unref();
