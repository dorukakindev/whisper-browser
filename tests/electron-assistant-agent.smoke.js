'use strict';
// Real Windows main/renderer/native overlay + controlled HTTP provider. No paid API or GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-agent',Date.now()+'-'+process.pid),requests=[],connections=new Set();
fs.mkdirSync(path.join(out,'profile'),{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const provider=http.createServer((req,res)=>{
 let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
  try{
   const body=JSON.parse(raw);assert.equal(body.model,'fixture-agent');assert(!raw.includes('fixture-agent-key'));requests.push(body);
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   const send=(delta,finish=null)=>res.write('data: '+JSON.stringify({choices:[{delta,finish_reason:finish}]})+'\n\n');
   const user=body.messages.filter(row=>row.role==='user').at(-1).content;
   if(user.includes('Durum göstergesi')){if(body.messages.at(-1).role==='user')send({tool_calls:[{index:0,id:'prefs',type:'function',function:{name:'get_app_preferences',arguments:'{}'}}]},'tool_calls');else send({content:'The actual application preferences were read.'},'stop');res.end('data: [DONE]\n\n');return;}
   if(user.includes('Yarım yanıt')){send({content:'Korunacak kısmi yanıt'});return;}
   if(body.messages.at(-1).role==='user'){
    send({tool_calls:[{index:0,id:'help',type:'function',function:{name:'app_help',arguments:'{"domain":"all"}'}},{index:1,id:'settings',type:'function',function:{name:'open_settings',arguments:'{"section":"general"}'}}]},'tool_calls');
   }else send({content:'Uygulamanın mevcut araçlarını kontrol ettim. Görünüm ayarlarını açmak için işlem kartını kullanabilirsin. Henüz ayar değiştirilmedi.'},'stop');
   res.end('data: [DONE]\n\n');
  }catch(error){res.destroy(error);}
 });
});
provider.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+18000;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timed out: '+label);}
provider.listen(0,'127.0.0.1',()=>{
 const url='http://127.0.0.1:'+provider.address().port+'/v1';
 fs.writeFileSync(path.join(out,'profile','settings.json'),JSON.stringify({settingsVersion:3,translate:{apiKey:'fixture-agent-key',endpointPreset:'custom',customBaseUrl:url,model:'fixture-agent'},ui:{translateTo:'tr',translateEndpointPreset:'custom',translateBaseUrl:url,translateModel:'fixture-agent'}}));
 require('../src/main');
 app.whenReady().then(async()=>{
  let win;await until(()=>{win=BrowserWindow.getAllWindows().find(row=>row.webContents.getURL().includes('index.html')&&!row.webContents.isLoading());return win;},'main');
  const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  await until(()=>parent('return !!window.AssistantAgentUI'),'agent');
  const view=win.contentView.children.find(row=>row.webContents?.getURL().includes('assistant-overlay.html'));assert(view);
  const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  win.setContentSize(1440,1000);win.showInactive();
  await parent("await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await MediaHomeUI.returnHome();return true");
  await run("document.getElementById('bubble').click();document.getElementById('text').value='Uygulamadaki yetenekleri değerlendir, görünüm ayarlarını açabileceğim bir öneri ver.';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return !!document.querySelector('.tool-card')&&!document.querySelector('.message.loading')"),'real model tool card');
  assert.equal(requests.length,2);assert(requests[0].tools.some(row=>row.function.name==='app_help'));
  assert(!requests[0].tools.some(row=>row.function.name==='start_whisper'),'Home does not expose a YouTube action');
  assert(await parent("return !document.getElementById('appSettingsDialog')?.open"),'Tool proposal cannot open settings by itself');
  assert(await parent('return !state.running&&!player.job?.running'),'Agent chat does not occupy the media process');
  async function capture(name){await run('await document.fonts.ready;return true');await wait(500);const bounds=await run("return {width:innerWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('header').getBoundingClientRect().top,send:document.getElementById('send').getBoundingClientRect().bottom,height:innerHeight,theme:document.documentElement.dataset.theme}");assert(bounds.scroll<=bounds.width+1&&bounds.header>=0&&bounds.send<=bounds.height);fs.writeFileSync(path.join(out,name+'.png'),(await view.webContents.capturePage()).toPNG());return bounds;}
  await capture('agent-proposal-dark');
  await run("document.querySelector('.tool-card button').click();document.getElementById('reviewConfirm').click();return true");
  await until(()=>parent("return !!document.getElementById('appSettingsDialog')?.open"),'approved action opens actual settings');
  await parent('AppSettingsUI.close();return true');
  await until(()=>run("return document.querySelector('.tool-card button')?.textContent==='Uygulandı'"),'durable execution receipt');
  assert(await run("return document.querySelector('.tool-card button').disabled"),'Applied proposal is not replayable');
  await capture('agent-applied-dark');
  await parent("window.originalLibraryActions=AssistantLibraryActions;window.AssistantLibraryActions={...originalLibraryActions,execute:async(...args)=>{if(args[0]==='get_app_preferences')await new Promise(resolve=>window.releasePreferencesRead=resolve);return originalLibraryActions.execute(...args);}};return true");
  await run("document.getElementById('text').value='Durum göstergesi için mevcut uygulama ayarlarını oku, değiştirme.';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return document.getElementById('agentProgress').textContent.includes('Uygulama ayarları okunuyor')"),'actual tool progress');await capture('agent-reading-dark');
  win.setMinimumSize(0,0);win.setContentSize(720,680);await parent("UiLocale.set('en',false);applyUiTheme('light');return true");await until(()=>run("return document.getElementById('agentProgress').textContent.includes('Reading application settings')"),'localized progress');await capture('agent-reading-compact-light');
  await parent("releasePreferencesRead();return true");await until(()=>parent('return !AssistantAgentUI.busy()'),'preference result');await until(()=>run("return document.getElementById('agentProgress').textContent===''") ,'progress clears');
  win.setContentSize(1440,1000);await parent("UiLocale.set('tr',false);applyUiTheme('dark');return true");
  await run("document.getElementById('text').value='Yarım yanıtı sınayalım';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return document.getElementById('log').textContent.includes('Korunacak kısmi')"),'real SSE partial');
  await run("document.getElementById('cancel').click();return true");
  await until(()=>parent('return !window.AssistantAgentUI.busy()'),'real provider abort');
  assert.equal(requests.length,5,'Cancellation does not retry the partially delivered request');
  assert(await run("return document.getElementById('log').textContent.includes('Korunacak kısmi')&&document.getElementById('cancel').hidden"));
  win.setMinimumSize(0,0);win.setContentSize(720,680);await parent("UiLocale.set('en',false);applyUiTheme('light');return true");
  await until(()=>run("return document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light'"),'compact light');
  const compact=await capture('agent-cancelled-compact-light');
  const result={ok:true,out,requests:requests.length,compact,provider:'controlled local HTTP/SSE; no live model',nativeWindows:true};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  for(const socket of connections)socket.destroy();provider.close();console.log(JSON.stringify(result));app.exit(0);
 }).catch(async error=>{try{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));const v=w?.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));if(v)fs.writeFileSync(path.join(out,'ui-error.json'),JSON.stringify(await v.webContents.executeJavaScript("({lang:document.documentElement.lang,buttons:[...document.querySelectorAll('.tool-card button')].map(n=>({text:n.textContent,disabled:n.disabled})),log:document.getElementById('log').textContent})")));}catch(_){}fs.writeFileSync(path.join(out,'error.txt'),error.stack);for(const socket of connections)socket.destroy();provider.close();app.exit(1);});
});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Agent native smoke exceeded 75 seconds');app.exit(2);},75000).unref();
