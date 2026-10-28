'use strict';
// Opt-in live model + real isolated Windows controls/approval/persistence. No personal settings mutations.
const {app,BrowserWindow,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
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
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-live-native',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
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
 await keyReady;const body=JSON.parse(options.body);assert(!Object.hasOwn(body,'service_tier'));assert.equal(body.model,'deepseek-ai/DeepSeek-V4.1-Flash-1017');if(++calls>30)throw Error('Live request budget exceeded');
 return nativeFetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+key},signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(60000)])});
};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+90000;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,assistant:{endpointPreset:'https://api.deepinfra.com/v1/openai',model:'deepseek-ai/DeepSeek-V4.1-Flash-1017',flex:false},ui:{uiLocale:'tr',uiTheme:'dark'}}));require('../src/main');let win,overlay;
app.whenReady().then(async()=>{
 await keyReady;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');win.setContentSize(1200,900);win.show();const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);
 await run(`await initialSettingsReady;document.getElementById('assistantApiKey').value='synthetic-native-token';await saveAppSettings();return true`);
 overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));const panel=s=>overlay.webContents.executeJavaScript('(async()=>{'+s+'})()',true);await panel(`document.getElementById('bubble').click();return true`);await wait(180);
 async function ask(text){await until(()=>panel(`return !document.getElementById('send').disabled`),'ready');const before=await panel(`return [...document.querySelectorAll('.tool-card')].map(x=>x.dataset.proposalId)`);await panel(`document.getElementById('text').value=${JSON.stringify(text)};document.getElementById('form').requestSubmit();return true`);await until(()=>panel(`return [...document.querySelectorAll('.tool-card')].some(x=>!${JSON.stringify(before)}.includes(x.dataset.proposalId)&&!x.querySelector('[data-tool-control="apply"]').disabled)`),'new workflow card');return await panel(`return [...document.querySelectorAll('.tool-card')].find(x=>!${JSON.stringify(before)}.includes(x.dataset.proposalId)).dataset.proposalId`);}
 async function apply(id,failed=false){await panel(`document.querySelector('[data-proposal-id="${id}"] [data-tool-control="apply"]').click();document.getElementById('reviewConfirm').click();return true`);await until(()=>panel(`return document.querySelector('[data-proposal-id="${id}"] [data-tool-control="apply"]').textContent===${JSON.stringify(failed?'Başarısız':'Uygulandı')}`),'card terminal');}
 const originalTranslation=await run(`return AssistantWorkflowActions.read('translation').values`);
 await run(`document.getElementById('model').value='large-v3';document.getElementById('beamSize').value='5';await saveAppSettings();return true`);
 const first=await ask('Whisper modelini tiny ve beam 3 yap');assert(await panel(`return document.querySelector('[data-proposal-id="${first}"]').textContent.includes('tiny')`));assert(await panel(`return document.querySelector('[data-proposal-id="${first}"]').textContent.includes('5 → 3')`));fs.writeFileSync(path.join(out,'workflow-before-after.png'),(await overlay.webContents.capturePage()).toPNG());await apply(first);
 assert(await run(`const s=await api.loadSettings();return document.getElementById('model').value==='tiny'&&s.ui.model==='tiny'&&document.getElementById('beamSize').value==='3'&&!state.running`));
 const originalBatchDisabled=await run('const c=document.getElementById("batchSize"),old=c.disabled;c.disabled=true;return old');
 const transcriptionUndo=await ask('Whisper ayarını geri al');assert(await panel(`return document.querySelector('[data-proposal-id="${transcriptionUndo}"]').textContent.includes('3 → 5')`));fs.writeFileSync(path.join(out,'undo-transcription-diff.png'),(await overlay.webContents.capturePage()).toPNG());await apply(transcriptionUndo);
 assert(await run('return document.getElementById("model").value==="large-v3"&&document.getElementById("beamSize").value==="5"&&document.getElementById("batchSize").disabled'));
 await run('document.getElementById("batchSize").disabled='+JSON.stringify(originalBatchDisabled)+';return true');
 const restoreModel=await ask('Whisper modelini tiny ve beam 3 yap');await apply(restoreModel);
 const stale=await ask('Whisper beam değerini 6 yap; model ve diğer ayarlar değişmesin. Sadece kartı hazırla.');await run(`document.getElementById('model').value='base';return true`);await apply(stale,true);assert(await run(`return document.getElementById('model').value==='base'&&document.getElementById('beamSize').value==='3'&&!state.running`));
 await wait(150);fs.writeFileSync(path.join(out,'workflow-cards-tr.png'),(await overlay.webContents.capturePage()).toPNG());
 await run(`UiLocale.set('en',false);applyUiTheme('light');return true`);win.setMinimumSize(0,0);win.setContentSize(800,800);await wait(220);const english=await ask('Use tiny with beam 3');assert(await panel(`return document.getElementById('workspaceError').textContent===''`),'An accepted new question must not retain an old failed-card banner');assert(await panel(`const text=document.querySelector('[data-proposal-id="${english}"]').textContent;return text.includes('Whisper model:')&&text.includes('base → tiny')`));await panel(`document.querySelector('[data-proposal-id="${english}"]').scrollIntoView({block:'center'});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);await wait(120);fs.writeFileSync(path.join(out,'workflow-cards-en-light.png'),(await overlay.webContents.capturePage()).toPNG());
 const evidence={ok:true,standardTier:true,providerCalls:calls,appliedCards:3,staleCardRefused:true,productionStarted:false};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,out,standardTier:true,providerCalls:calls,appliedCards:3,staleCardRefused:true,productionStarted:false,limits:'Live DeepSeek standard-tier choices; actual isolated native controls/settings/approval. No Whisper/GPU/voice generation or personal settings changes.'}));app.exit(0);
}).catch(async e=>{console.error(String(e.stack||e).replaceAll(key||'NO_KEY','[redacted]'));try{fs.writeFileSync(path.join(out,'failure-panel.png'),(await overlay.webContents.capturePage()).toPNG());}catch{}app.exit(1);});setTimeout(()=>app.exit(2),300000).unref();
