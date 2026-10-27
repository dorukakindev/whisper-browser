'use strict';
// Actual page scan/scheduler/ledger/preload/renderer, controlled local HTTP model.
const {app,BrowserWindow,session}=require('electron'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-page650',Date.now()+'-'+process.pid),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);app.setPath('downloads',out);app.commandLine.appendSwitch('disable-gpu');
let held=true,calls=0;const replies=[],sockets=new Set();
const fixture=http.createServer((req,res)=>{
 if(req.method!=='POST'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="en"><title>Controlled article</title><body><article><h1>A simple story</h1><p>A quiet village stands beside a green forest. People gather in the square and share stories after their daily work. This article describes their ordinary lives and the changing weather.</p><p>In the evening the streets become calm and the lights appear in the windows. Friends talk about their plans while the wind moves gently through the trees.</p></article></body></html>');return;}
 let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{try{
  const body=JSON.parse(raw),payload=JSON.parse(body.messages.at(-1).content);assert(Array.isArray(payload.targets));assert(!raw.includes('fixture-page-key'));calls++;
  const send=()=>{if(res.destroyed)return;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:payload.targets.map((t,i)=>({id:t.id,translation:i===0?'Köyde yaşam':i===1?'Sessiz köy ormanın yanında yer alır. İnsanlar günlük işlerini bitirince meydanda buluşup öyküler anlatır.':'Akşamları sokaklar sessizleşir ve pencerelerde ışıklar belirir. Dostlar gelecek planlarını konuşur.'}))})}}]}));};
  if(held)replies.push(send);else send();
 }catch(e){res.destroy(e);}});
});fixture.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+16000;while(Date.now()<end){if(await fn())return;await wait(50);}throw Error('Timeout: '+label);}
fixture.listen(0,'127.0.0.1',()=>{
 const base='http://127.0.0.1:'+fixture.address().port;
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,assistant:{endpointPreset:'inherit'},translate:{apiKey:'',endpointPreset:'custom',customBaseUrl:base+'/v1',model:'fixture-page'},ui:{translateTo:'tr',translateEndpointPreset:'custom',translateBaseUrl:base+'/v1',translateModel:'fixture-page'}}));
 const prior=global.fetch;global.fetch=(url,...args)=>{if(new URL(String(url)).hostname!=='127.0.0.1')throw Error('Outside local fixture');return prior(url,...args);};
 require('../src/main');app.whenReady().then(async()=>{
  session.defaultSession.protocol.handle('https',()=>Response.error());
  let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');win.setContentSize(1440,1000);win.showInactive();
  const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  await run(`await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');await openPlayer();setWorkspaceMode('browser',false);return true`);
  await until(()=>run(`return !!player.browserActiveTabId&&!!browserTabState()`),'initial browser tab');
  const navigation=await run(`document.getElementById('browserAddress').value=${JSON.stringify(base+'/article')};return navigateBrowserFromAddress()`);assert(navigation?.ok,JSON.stringify(navigation));
  await until(()=>run(`return player.browserPageUrl===${JSON.stringify(base+'/article')}&&AssistantAppActions.snapshot().kind==='page'`),'page context');
  await wait(250);
  const rejected=await run(`try{return await AssistantAppActions.execute('translate_page',{target_language:'tr'},AssistantAppActions.snapshot());}catch(e){return {failed:true,error:e.message};}`);
  assert.equal(rejected.failed,true);assert.equal(calls,0,'missing-key preparation must not call the provider');
  await run(`document.getElementById('translateApiKey').value='fixture-page-key';await saveAppSettings();return true`);
  const receipt=await run(`return AssistantAppActions.execute('translate_page',{target_language:'tr'},AssistantAppActions.snapshot())`);assert.equal(receipt.status,'accepted');assert(receipt.jobId);
  await until(()=>calls>0,'held translation request');
  const jobs=await run(`return api.assistantJobs()`);assert.equal(jobs.jobs.find(j=>j.id===receipt.jobId)?.state,'running');
  const running=await run(`return AssistantAppActions.execute('translate_page',{target_language:'tr'},AssistantAppActions.snapshot())`);assert.equal(running.jobId,receipt.jobId);assert.equal(running.running,true);
  const mismatch=await run(`try{return await AssistantAppActions.execute('translate_page',{target_language:'de'},AssistantAppActions.snapshot());}catch(e){return {failed:true};}`);assert(mismatch.failed);
  const view=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(view);
  await view.webContents.executeJavaScript(`document.getElementById('bubble').click();document.getElementById('jobs').open=true;true`,true);await wait(250);
  assert(await view.webContents.executeJavaScript(`const text=document.getElementById('jobRows').textContent;text.includes('Çalışıyor')&&text.includes('Çeviri')&&!text.includes('translation')`));
  await view.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);await wait(150);fs.writeFileSync(path.join(out,'registered-job.png'),(await view.webContents.capturePage()).toPNG());
  held=false;for(const send of replies.splice(0))send();
  await until(()=>run(`return AssistantJobsUI.snapshot().jobs.find(j=>j.id===${JSON.stringify(receipt.jobId)})?.state==='completed'`),'same job completed');
  await until(()=>run(`return player.browserPageTranslated>0&&!player.browserPageTranslateBusy`),'translated page state');
  const shown=await run(`return AssistantAppActions.execute('translate_page',{target_language:'tr'},AssistantAppActions.snapshot())`);assert.equal(shown.status,'completed');assert.equal(shown.jobId,undefined);
  await wait(200);const pageView=win.contentView.children.find(v=>v.webContents?.getURL()===base+'/article');assert(pageView);fs.writeFileSync(path.join(out,'translated-page.png'),(await pageView.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ok:true,out,providerCalls:calls,receipt,reused:shown.status,registeredState:'running',finalState:'completed'}));for(const s of sockets)s.destroy();fixture.close();app.exit(0);
 }).catch(async e=>{console.error(e);const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(w){console.error(await w.webContents.executeJavaScript(`JSON.stringify({url:player.browserPageUrl,tab:player.browserActiveTabId,context:AssistantAppActions.snapshot(),selection:globalAssistantContext()?.type})`));fs.writeFileSync(path.join(out,'failure.png'),(await w.webContents.capturePage()).toPNG());}for(const s of sockets)s.destroy();fixture.close();app.exit(1);});
});
