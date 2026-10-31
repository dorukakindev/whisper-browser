'use strict';
// Real Windows main/renderer/native overlay + controlled HTTP provider. No paid API or GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-settings200',Date.now()+'-'+process.pid),requests=[],connections=new Set();
fs.mkdirSync(path.join(out,'profile'),{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const provider=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{const body=JSON.parse(raw);assert.equal(body.model,'fixture-agent');assert(!raw.includes('fixture-agent-key'));requests.push(body);const first=body.messages.at(-1).role==='user';res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:first?{tool_calls:[{index:0,id:'preferences',type:'function',function:{name:'set_app_preferences',arguments:'{"theme":"light"}'}}]}:{content:'Review the actual settings card.'},finish_reason:first?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');}catch(e){res.destroy(e);}});});
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
  await parent("await initialSettingsReady;UiLocale.set('tr',false);document.getElementById('uiTheme').value='dark';applyUiTheme('dark');await saveAppSettings();await MediaHomeUI.returnHome();return true");
  await run("document.getElementById('bubble').click();document.getElementById('text').value='Change the theme to light';document.getElementById('form').requestSubmit();return true");
  await until(()=>run("return !!document.querySelector('.tool-card')&&!document.querySelector('.message.loading')"),'actual model preferences card');
  assert.equal(requests.length,2);assert(requests[0].tools.some(x=>x.function.name==='set_app_preferences'));
  const oldId=await parent("return AssistantWorkspace.snapshot().current.messages.flatMap(m=>m.actions||[]).find(a=>a.kind==='app_action').proposalId");
  assert(await run("return document.querySelector('.tool-card').textContent.includes('Koyu')&&document.querySelector('.tool-card').textContent.includes('A\u00e7\u0131k')"));
  await parent("document.getElementById('uiTheme').value='system';document.getElementById('uiTheme').dispatchEvent(new Event('change',{bubbles:true}));await saveAppSettings();return true");
  await run("document.querySelector('[data-tool-control=apply]').click();document.getElementById('reviewConfirm').click();return true");
  await until(()=>run("return !!document.querySelector('[data-tool-control=refresh]')"),'stale card refresh');
  assert.equal(await parent("return document.getElementById('uiTheme').value"),'system');
  await parent("applyUiTheme('dark');return true");
  async function capture(name){await run('await document.fonts.ready;return true');await wait(350);const bounds=await run("const h=document.querySelector('header').getBoundingClientRect(),f=document.getElementById('form').getBoundingClientRect(),l=document.getElementById('log').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,header:h.bottom,logTop:l.top,logBottom:l.bottom,formTop:f.top,formBottom:f.bottom,messages:[...document.querySelectorAll('#log .message')].map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}))}");assert(bounds.scroll<=bounds.width+1);assert(bounds.header<=bounds.logTop+1);assert(bounds.logBottom<=bounds.formTop+1);assert(bounds.formBottom<=bounds.height+1);for(let i=1;i<bounds.messages.length;i++)assert(bounds.messages[i].top>=bounds.messages[i-1].bottom-1);fs.writeFileSync(path.join(out,name+'.png'),(await view.webContents.capturePage()).toPNG());return bounds;}
  const dark=await capture('settings-stale-tr-dark-1440');
  await run("document.querySelector('[data-tool-control=refresh]').click();return true");
  await until(()=>run("return document.querySelector('.tool-card')?.textContent.includes('Sistem')&&!document.querySelector('[data-tool-control=refresh]')&&!document.querySelector('[data-tool-control=apply]').disabled"),'new reviewed card');
  assert.equal(await parent("return document.getElementById('uiTheme').value"),'system');
  assert(await run("return document.querySelector('.tool-card').textContent.includes('Sistem')&&document.querySelector('.tool-card').textContent.includes('A\u00e7\u0131k')&&!document.querySelector('[data-tool-control=refresh]')"));
  assert.equal(await run("return document.querySelectorAll('.tool-card').length"),1);
  assert.equal(requests.length,2,'Refresh does not ask the provider to generate or apply anything');
  const replay=await parent("return api.assistantAgentApply({proposalId:"+JSON.stringify(oldId)+",owner:AssistantAppActions.snapshot()})");assert.equal(replay.ok,false);
  await run("document.querySelector('[data-tool-control=apply]').click();return true");assert.equal(await parent("return document.getElementById('uiTheme').value"),'system');
  await run("document.getElementById('reviewConfirm').click();return true");
  await until(()=>parent("return document.getElementById('uiTheme').value==='light'&&!AssistantAgentUI.busy()"),'actual preference persisted');
  const saved=JSON.parse(fs.readFileSync(path.join(out,'profile','settings.json'),'utf8'));assert.equal(saved.ui.uiTheme,'light');
  win.setMinimumSize(0,0);win.setContentSize(720,680);await parent("UiLocale.set('en',false);applyUiTheme('light');return true");
  await until(()=>run("return document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light'"),'English compact light');
  const compact=await capture('settings-applied-en-compact-light');
  assert(await run("return document.querySelector('[data-tool-control=apply]').disabled"));
  const result={ok:true,out,requests:requests.length,dark,compact,provider:'isolated controlled HTTP fixture',nativeWindows:true};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));for(const s of connections)s.destroy();provider.close();console.log(JSON.stringify(result));app.exit(0);
 }).catch(async error=>{try{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));const v=w?.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));if(v)fs.writeFileSync(path.join(out,'ui-error.json'),JSON.stringify(await v.webContents.executeJavaScript("({lang:document.documentElement.lang,buttons:[...document.querySelectorAll('.tool-card button')].map(n=>({text:n.textContent,disabled:n.disabled})),log:document.getElementById('log').textContent})")));}catch(_){}fs.writeFileSync(path.join(out,'error.txt'),error.stack);for(const socket of connections)socket.destroy();provider.close();app.exit(1);});
});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Settings refresh native smoke exceeded 75 seconds');app.exit(2);},75000).unref();
