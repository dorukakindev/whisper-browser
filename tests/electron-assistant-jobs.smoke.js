'use strict';
// Real Windows main/renderer/native overlay + controlled HTTP provider. No paid API or GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-jobs',Date.now()+'-'+process.pid),requests=[],connections=new Set();
fs.mkdirSync(path.join(out,'profile'),{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');
let retryRequests=0,ledger,stops=0,debugWindow,debugView;
const jobsModule=require('../src/assistant-jobs'),originalCreate=jobsModule.createJobs;
jobsModule.createJobs=options=>(ledger=originalCreate(options));
const provider=http.createServer((req,res)=>{
 let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
  try{
   const body=JSON.parse(raw);assert.equal(body.model,'fixture-agent');assert(!raw.includes('fixture-agent-key'));requests.push(body);
   const latest=body.messages.filter(row=>row.role==='user').at(-1).content;
   if(latest==='Retry probe'&&++retryRequests===1){res.writeHead(503);res.end('Controlled unavailable');return;}
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   const send=(delta,finish=null)=>res.write('data: '+JSON.stringify({choices:[{delta,finish_reason:finish}]})+'\n\n');
   const user=body.messages.filter(row=>row.role==='user').at(-1).content;
   if(user==='Retry probe'){send({content:'Recovered after explicit retry.'},'stop');res.end();return;}
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
  debugWindow=win;
  const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  await until(()=>parent('return !!window.AssistantAgentUI'),'agent');
  const view=win.contentView.children.find(row=>row.webContents?.getURL().includes('assistant-overlay.html'));assert(view);
  debugView=view;
  const run=code=>view.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  win.setContentSize(1440,1000);win.show();win.webContents.focus();
  await parent("await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await MediaHomeUI.returnHome();return true");
  const jobId=ledger.start({kind:'transcription',cancel:async()=>{stops++;setTimeout(()=>ledger.update(jobId,{type:'exit',cancelled:true}),10);return {ok:true};}});ledger.update(jobId,{type:'progress',percent:42});
  await parent("state.running=true;player.job={kind:'progressive',running:true,percent:42};return true");
  await run("document.getElementById('bubble').click();document.getElementById('text').value='Uygulamadaki yetenekleri değerlendir, görünüm ayarlarını açabileceğim bir öneri ver.';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return !!document.querySelector('.tool-card')&&!document.querySelector('.message.loading')"),'real model tool card');
  assert.equal(requests.length,2);assert(requests[0].tools.some(row=>row.function.name==='app_help'));
  assert(!requests[0].tools.some(row=>row.function.name==='start_whisper'),'Home does not expose a YouTube action');
  assert(await parent("return !document.getElementById('appSettingsDialog')?.open"),'Tool proposal cannot open settings by itself');
  assert(await parent("return state.running&&player.job.kind==='progressive'&&player.job.percent===42"),'Chat during media job leaves media ownership intact');
  await until(()=>run("return !document.getElementById('jobs').hidden&&document.getElementById('jobRows').textContent.includes('42%')"),'main job snapshot mirrored');
  await run("document.getElementById('jobs').open=true;return true");
  async function capture(name){await run('await document.fonts.ready;return true');await wait(500);const bounds=await run("return {width:innerWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('header').getBoundingClientRect().top,send:document.getElementById('send').getBoundingClientRect().bottom,height:innerHeight,theme:document.documentElement.dataset.theme}");assert(bounds.scroll<=bounds.width+1&&bounds.header>=0&&bounds.send<=bounds.height);fs.writeFileSync(path.join(out,name+'.png'),(await view.webContents.capturePage()).toPNG());return bounds;}
  const voiceId=ledger.start({kind:'voice',cancel:async()=>({ok:true})});
  ledger.update(voiceId,{type:'status',stage:'model_load'});
  ledger.update(voiceId,{type:'activity',stage:'synthesis',group:61,attempt:2,elapsed:30,limit:180,secret:'must-not-render'});
  await until(()=>run("return document.getElementById('jobRows').textContent.includes('Grup 61 · deneme 2 · 30 sn / 180 sn sınır')"),'voice heartbeat reaches native chat');
  assert(await run("return document.getElementById('jobRows').textContent.includes('Ses üretiliyor')&&!document.getElementById('jobRows').textContent.includes('must-not-render')"));
  await capture('agent-proposal-dark');
  await run("document.querySelector('.tool-card button').click();document.getElementById('reviewConfirm').click();return true");
  await until(()=>parent("return !!document.getElementById('appSettingsDialog')?.open"),'approved action opens actual settings');
  await parent('AppSettingsUI.close();return true');
  await until(()=>run("return document.querySelector('.tool-card button')?.textContent==='Uygulandı'"),'durable execution receipt');
  assert(await run("return document.querySelector('.tool-card button').disabled"),'Applied proposal is not replayable');
  await capture('agent-applied-dark');
  await run("document.getElementById('text').value='Yarım yanıtı sınayalım';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return document.getElementById('log').textContent.includes('Korunacak kısmi')"),'real SSE partial');
  await run("document.getElementById('cancel').click();return true");
  await until(()=>parent('return !window.AssistantAgentUI.busy()'),'real provider abort');
  assert.equal(requests.length,3,'Cancellation does not retry the partially delivered request');
  assert(await run("return document.getElementById('log').textContent.includes('Korunacak kısmi')&&document.getElementById('cancel').hidden"));
  assert.equal(stops,0,'Stopping chat did not cancel the media job');
  await run("document.getElementById('text').value='Retry probe';document.getElementById('form').requestSubmit();return true");
  await until(()=>parent('return AssistantAgentUI.canRetry()'),'failed chat can be retried explicitly');assert.equal(retryRequests,1,'No automatic retry of HTTP503');
  await until(()=>run("return !document.getElementById('retry').hidden"),'native retry control');
  await run("document.getElementById('retry').click();return true");
  await until(()=>run("return document.getElementById('log').textContent.includes('Recovered after explicit retry.')"),'explicit retry result');
  assert.equal(retryRequests,2);assert(await parent("return state.running&&player.job.kind==='progressive'"));
  win.setMinimumSize(0,0);win.setContentSize(720,680);await parent("UiLocale.set('en',false);applyUiTheme('light');return true");
  await until(()=>run("return document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light'"),'compact light');
  const compact=await capture('agent-cancelled-compact-light');
  assert(await run("return document.getElementById('jobRows').textContent.includes('Group 61 · attempt 2 · 30 s / 180 s limit')"),'Heartbeat localizes without a new engine event');
  assert(await run("return [...document.querySelectorAll('.assistant-job button')].every(n=>n.getBoundingClientRect().height>=40)"),'Job stop controls retain usable hit targets');
  ledger.update(voiceId,{type:'status',stage:'verification'});
  await until(()=>run("return !document.querySelector('.assistant-job-activity')"),'finished synthesis pulse clears');
  ledger.update(voiceId,{type:'done'});

  await until(()=>run("return [...document.querySelectorAll('.assistant-job')].some(n=>n.dataset.jobId==="+JSON.stringify(voiceId)+"&&!n.querySelector('button'))"),'completed voice no longer cancellable');
  await run("document.querySelector('[data-job-id=\""+jobId+"\"] button').click();return true");
  await until(()=>run("return document.getElementById('jobRows').textContent.includes('Stopped')"),'exact job stop receipt');assert.equal(stops,1);
  const replacement=ledger.start({kind:'voice',cancel:async()=>{stops++;return {ok:true};}});
  assert.equal((await parent('return window.api.cancelAssistantJob({id:'+JSON.stringify(jobId)+'})')).ok,false);assert.equal(stops,1,'Stale job ID never cancelled replacement');
  ledger.update(replacement,{type:'done'});await parent('state.running=false;player.job=null;return true');
  const result={ok:true,out,requests:requests.length,compact,jobStops:stops,chatDuringMedia:true,retryRequests,provider:'controlled local HTTP/SSE; no live model',nativeWindows:true};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  for(const socket of connections)socket.destroy();provider.close();console.log(JSON.stringify(result));app.exit(0);
 }).catch(async error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);try{fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify({requests:requests.length,overlay:await debugView.webContents.executeJavaScript('document.body.textContent'),parent:await debugWindow.webContents.executeJavaScript('({pending:AssistantAgentUI.busy(),preparing:!!aiChatPreparing,scope:aiSourceScope(),chat:document.getElementById("aiChatLog").textContent})')},null,2));}catch(_){}console.error(error.stack);for(const socket of connections)socket.destroy();provider.close();app.exit(1);});
});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Agent native smoke exceeded 75 seconds');app.exit(2);},75000).unref();
