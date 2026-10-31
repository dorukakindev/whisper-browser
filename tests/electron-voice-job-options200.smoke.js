"use strict";
// Native production renderer/preload with isolated data and controlled voice IPC.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','product200-settings','voice-options-'+Date.now()+'-'+process.pid),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;
for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
global.fetch=async()=>{throw Error('Synthetic native acceptance: network disabled');};
const requests=[],receipts=[];let rejectPlan=false,win;
const handle=ipcMain.handle.bind(ipcMain);
const fixtures={
 'dub:config':async()=>({ok:true,ready:true,engine:'synthetic-engine',reference:'synthetic-voice.wav',transcript:'synthetic-reference.txt',profile:'quality',grouping:'akici',verification:'detailed'}),
 'dub:references':async()=>({ok:true,activeId:'fixture',references:[{id:'fixture',name:'Synthetic voice',text:'Synthetic reference.',url:''}],folder:''}),
 'dub:latest':async()=>({ok:true,output:null}),
 'dub:plan':async()=>rejectPlan?{ok:false,error:'Synthetic preflight rejection'}:{ok:true,sourceHash:'synthetic-source',groups:[{key:'g1',text:'Synthetic acceptance sentence.',start:0,end:2000,seconds:2}]},
 'dub:start':async(_event,request)=>{requests.push(request);return {ok:true,id:request.id};}
};
// Replace these boundaries at registration so shared voice files are never read.
ipcMain.handle=(name,fn)=>handle(name,fixtures[name]||fn);
require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(60);}throw Error('Timeout: '+label);}
const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function finish(){const request=requests.at(-1);win.webContents.send('dub:event',{id:request.id,type:'done',name:'Synthetic controlled result.wav',url:'',sample:request.sample,quality:{groups:[{key:'g1',group:1,text:'Synthetic acceptance sentence.',status:'review',verification:{status:'not_checked'}}]}});await until(()=>run('return !DubGeneratorUI.assistant.state().busy'),'controlled finish');}
async function capture(name){await run("for(let node=document.getElementById('dubSampleOnly');node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;document.getElementById('dubSampleOnly').scrollIntoView({block:'center'});return true");await run('await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true');await wait(200);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(value=>!value.isDestroyed()&&value.webContents.getURL().includes('index.html')&&!value.webContents.isLoading());return win;},'isolated window');
 win.setContentSize(1360,960);win.showInactive();
 await run(`await initialSettingsReady;UiLocale.set('en',false);applyUiTheme('dark');
 window.AssistantAppActions={current:()=>true};
 window.BrowserDubAudioUI={context:()=>({mode:'browser',source:'synthetic-video',mediaKey:'synthetic-video',tabId:'fixture',generation:1,mediaId:'fixture',visible:true,hasMedia:true,subtitleRange:{start:5,end:25}})};
 player.sub2Role='translation';player.sub2Path='C:/synthetic/acceptance.srt';player.browserTracks=[{role:'translation',path:player.sub2Path}];
 await DubGeneratorUI.prepareCurrent();document.getElementById('dubSampleOnly').checked=false;return true`);
 const before=await run('return DubGeneratorUI.assistant.state()');assert.equal(before.settings.sample,false);assert.deepEqual(before.range,{start:5,end:25});
 receipts.push(await run(`return AssistantVoiceActions.execute('start_voice_generation',{sample:true},{})`));
 assert.equal(requests.length,1);assert.equal(requests[0].sample,true);assert.deepEqual(requests[0].range,{start:5,end:25});
 assert.equal(await run("return document.getElementById('dubSampleOnly').checked"),false);await capture('sample-request-retained-full-selection');await finish();
 receipts.push(await run(`return AssistantVoiceActions.execute('start_voice_generation',{}, {})`));
 assert.equal(requests.length,2);assert.equal(requests[1].sample,false);assert.deepEqual(requests[1].range,{start:5,end:25});await finish();
 await run(`await AssistantVoiceActions.execute('configure_voice_generation',{grouping:'satir'},{});return true`);rejectPlan=true;
 const failed=await run(`try{await AssistantVoiceActions.execute('start_voice_generation',{sample:true},{});return {rejected:false};}catch(error){return {rejected:true,message:error.message};}`);
 assert(failed.rejected);assert.equal(requests.length,2);assert.equal(await run("return document.getElementById('dubSampleOnly').checked"),false);
 await capture('failed-preflight-retained-full-selection');
 const result={ok:true,realWindowsRendererPreloadIPC:true,isolatedProfile:true,oneJobSampleOverride:true,nextEmptyRequestUsesRetainedSample:true,nextRequestSample:false,retainedRange:{start:5,end:25},failedPreflightPreservesSample:true,requests,receipts,failed,limits:'Synthetic source, configuration and voice job events. No engine, GPU synthesis, live provider, acoustic quality claim or personal profile access.'};
 fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,out,requests:requests.length,failedPreflight:true}));app.exit(0);
}).catch(async error=>{console.error(error.stack);fs.writeFileSync(path.join(out,'error.txt'),error.stack);if(win)try{await capture('failure');}catch{}app.exit(1);});
setTimeout(()=>app.exit(2),60000).unref();
