'use strict';
// Native Windows main/preload/renderer. Local fixture metadata/provider only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant653',Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
let finishReasoning,finishWriting,request=0;const bodies=[];const encoder=new TextEncoder();
const event=delta=>'data: '+JSON.stringify({choices:[{delta}]})+'\n\n';
const nativeFetch=global.fetch;
global.fetch=async(url,options={})=>{
 const address=String(url);
 if(address.startsWith('https://api.deepinfra.com/')){
  const body=JSON.parse(options.body);bodies.push(body);request++;
  assert.equal(body.model,'deepseek-ai/DeepSeek-V4.1-Flash-1017');
  if(request===1){assert(!Object.hasOwn(body,'service_tier'));return new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(event({reasoning_content:'Fixture provider signal, never displayed.'})));finishReasoning=()=>{c.enqueue(encoder.encode(event({content:'Kontrollü yanıt hazır.'})));finishWriting=()=>{c.enqueue(encoder.encode('data: [DONE]\n\n'));c.close();};};}}),{headers:{'content-type':'text/event-stream'}});}
  assert.equal(body.service_tier,'flex');if(request===3)return new Response(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'reviews',type:'function',function:{name:'load_title_reviews',arguments:JSON.stringify({item_id:'discovery:film:tt14173636',source:'automatic'})}}]},finish_reason:'tool_calls'}]}),{headers:{'content-type':'application/json'}});return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Flex yanıtı.'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
 }
 if(address.includes('cinemeta')&&address.includes('/meta/'))return new Response(JSON.stringify({meta:{id:'tt14173636',name:'The Invite',releaseInfo:'2026',description:'Controlled film metadata',genres:['Comedy']}}));
 if(address==='https://letterboxd.com/imdb/tt14173636/')return new Response('',{status:302,headers:{location:'https://letterboxd.com/film/the-invite/'}});
 if(address.startsWith('https://letterboxd.com/film/the-invite/'))return new Response('<meta property="og:title" content="The Invite (2026) • Letterboxd">'+Array.from({length:12},(_,i)=>'<article><div class="js-review-body">A complete controlled review number '+i+' about this film.</div></article>').join(''));
 // Unrelated startup requests are isolated, not live-site tests.
 throw Error('Test network isolated: '+new URL(address).hostname);
};
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timeout: '+label);}
let win,overlay;fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,translate:{endpointPreset:'https://api.openai.com/v1',model:'kept-translation-model'},ui:{uiLocale:'tr',uiTheme:'dark'}}));require('../src/main');
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1200,900);win.show();
 await run(`await initialSettingsReady;UiLocale.set('tr',false);await AppSettingsUI.open('ai');document.getElementById('assistantEndpointPreset').value=WhisperAssistantSettings.ENDPOINT;document.getElementById('assistantApiKey').value='fixture-deepinfra';document.getElementById('assistantFlex').checked=false;document.getElementById('appSettingsSave').click();return true`);
 await until(()=>run(`return document.getElementById('appSettingsStatus').textContent==='Ayarlar kaydedildi.'`),'save standard');
 assert(await run(`const s=await api.loadSettings();return s.assistant.flex===false&&s.translate.model==='kept-translation-model'`));assert.equal(request,0);
 await wait(200);fs.writeFileSync(path.join(out,'settings-standard-tr.png'),(await win.webContents.capturePage()).toPNG());
 await run(`AppSettingsUI.close();return true`);await wait(220);
 overlay=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(overlay);const panel=code=>overlay.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await panel(`document.getElementById('bubble').click();document.getElementById('text').value='Selam';document.getElementById('form').requestSubmit();return true`);
 await until(()=>panel(`return !document.getElementById('agentProgress').hidden&&document.getElementById('agentProgress').dataset.phase==='reasoning'`),'reasoning phase');await wait(250);
 assert(await panel(`return !document.body.textContent.includes('Fixture provider signal')&&document.getElementById('cancel').hidden===false`));
 fs.writeFileSync(path.join(out,'thinking-tr-dark.png'),(await overlay.webContents.capturePage()).toPNG());
 overlay.webContents.debugger.attach('1.3');await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert(await panel(`return getComputedStyle(document.querySelector('.orbit-arc')).animationName==='none'`));
 await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});overlay.webContents.debugger.detach();finishReasoning();
 await until(()=>panel(`return document.getElementById('agentProgress').dataset.phase==='writing'`),'writing phase');
 fs.writeFileSync(path.join(out,'writing-tr-dark.png'),(await overlay.webContents.capturePage()).toPNG());finishWriting();
 await until(()=>panel(`return document.getElementById('agentProgress').hidden&&document.getElementById('log').textContent.includes('Kontrollü yanıt hazır')`),'finished phase');
 // Actual service and action adapter resolve a discovery title without adding it.
 const reviews=await run(`const owner=AssistantAppActions.snapshot();return await AssistantLibraryActions.execute('load_title_reviews',{item_id:'discovery:film:tt14173636',source:'automatic'},owner)`);
 assert.equal(reviews.status,'completed');assert.equal(reviews.reviews.length,10);assert.equal((await run(`return (await api.mediaCatalog({action:'list'})).items`)).length,0);
 win.setMinimumSize(0,0);win.setContentSize(760,800);
 await run(`UiLocale.set('en',false);applyUiTheme('light');await AppSettingsUI.open('ai');document.getElementById('assistantFlex').checked=true;document.getElementById('appSettingsSave').click();return true`);
 await until(()=>run(`return document.getElementById('appSettingsStatus').textContent==='Settings saved.'`),'save flex');await wait(200);
 fs.writeFileSync(path.join(out,'settings-flex-en-light.png'),(await win.webContents.capturePage()).toPNG());await run(`AppSettingsUI.close();return true`);await wait(220);
 await panel(`document.getElementById('text').value='Hello again';document.getElementById('form').requestSubmit();return true`);
 await until(()=>bodies.length===2,'flex request');await until(()=>panel(`return document.getElementById('agentProgress').hidden&&!document.getElementById('send').disabled&&document.getElementById('log').textContent.includes('Flex yanıtı.')`),'flex finished');
 await panel(`document.getElementById('text').value='The Invite için yorumları yükle';document.getElementById('form').requestSubmit();return true`);
 await until(()=>panel(`return !!document.querySelector('.tool-card [data-tool-control="apply"]:not(:disabled)')`),'review card');
 await panel(`document.querySelector('.tool-card [data-tool-control="apply"]').click();document.getElementById('reviewConfirm').click();return true`);
 await until(()=>panel(`return document.querySelector('.tool-card')?.textContent.includes('Applied')`),'review card completed');
 assert.equal((await run(`return (await api.mediaCatalog({action:'list'})).items`)).length,0);
 fs.writeFileSync(path.join(out,'reviews-card-completed.png'),(await overlay.webContents.capturePage()).toPNG());
 assert(!fs.readFileSync(path.join(profile,'settings.json'),'utf8').includes('fixture-deepinfra'));
 console.log(JSON.stringify({ok:true,out,requests:bodies.length,standardOmittedFlex:true,flexEnabled:true,discoveryReviews:reviews.reviews.length,libraryCount:0,limits:'Controlled provider/Letterboxd/Cinemeta responses; no paid inference, personal data or live-site access.'}));app.exit(0);
}).catch(async error=>{console.error(error.stack);console.error('requests='+request);try{console.error(await overlay?.webContents.executeJavaScript('document.body.textContent'));}catch{}app.exit(1);});setTimeout(()=>app.exit(2),70000).unref();

