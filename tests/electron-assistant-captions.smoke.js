'use strict';
// Native Windows main/renderer/overlay; local HTTP tool model and controlled media helper.
// No live YouTube, Whisper, paid model or GPU claim.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-captions',Date.now()+'-'+process.pid),profile=path.join(out,'profile'),source=path.join(out,'input','Türkçe kaynak.srt');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(path.join(out,'output'),{recursive:true});
fs.writeFileSync(source,'\ufeff1\n00:00:01,000 --> 00:00:03,000\nFirst sentence.\n\n2\n00:00:06,000 --> 00:00:09,000\nSecond sentence.\n\n3\n00:00:20,000 --> 00:00:26,000\nLast sentence.\n');
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
const translated=path.join(out,'output','Türkçe kaynak.de.srt');fs.writeFileSync(translated,'\ufeff1\n00:00:01,000 --> 00:00:03,000\nFirst sentence.\n\n2\n00:00:06,000 --> 00:00:09,000\nZweiter Satz.\n\n3\n00:00:20,000 --> 00:00:26,000\nLetzter Satz.\n');
const voiceStarts=[];
const realHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>realHandle(name,
 name==='dub:config'?async()=>({ok:true,ready:true,reference:'fixture.wav'}):
 name==='dub:references'?async()=>({ok:true,references:[]}):
 name==='dub:start'?async(_event,request)=>{voiceStarts.push(request);return {ok:true};}:
 name==='media:readSubtitle'?async(event,file)=>file===translated?{ok:true,text:fs.readFileSync(translated,'utf8'),mtimeMs:fs.statSync(translated).mtimeMs,size:fs.statSync(translated).size}:handler(event,file):handler);
const downloads=[],requests=[],connections=new Set();const rawSpawn=cp.spawn;
cp.spawn=(exe,args,options)=>{
 if(!args?.some(arg=>String(arg).endsWith('media.py'))||!args.includes('subs'))return rawSpawn(exe,args,options);
 downloads.push(args);const proc=new EventEmitter();proc.pid=0;proc.stdout=new PassThrough();proc.stderr=new PassThrough();
 setTimeout(()=>{proc.stdout.write(JSON.stringify({type:'subs',path:source,lang:'en',auto:false})+'\n');proc.stdout.end();proc.emit('close',0);},15);return proc;
};
const agent=require('../src/assistant-agent-service'),register=agent.register;
// The existing browser-owner contract is independently covered by the service tests.
// Synthetic source avoids navigating a personal or real YouTube session.
agent.register=options=>register({...options,validateOwner:()=>true,probeVideo:async()=>({ok:true,data:{subtitleLangs:[{code:'en',auto:false},{code:'en-orig',auto:true}]}})});
const server=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
 try{const body=JSON.parse(raw);requests.push(body);res.writeHead(200,{'Content-Type':'application/json'});
 const name=body.messages.at(-1).role==='user'?'probe_video_captions':body.messages.at(-1).content.includes('languages')?'translate_video_captions':null;
 const args=name==='probe_video_captions'?{}:{caption_id:'yt-manual:en',target_language:'de',start:5,end:25,forSpeech:true};
 const message=name?{role:'assistant',content:null,tool_calls:[{id:'call-'+requests.length,type:'function',function:{name,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'İngilizce elle yazılmış kaynak için 5–25 saniye aralığında Almanca seslendirme çevirisi önerdim. Kartı uygula.'};
 res.end(JSON.stringify({choices:[{message,finish_reason:name?'tool_calls':'stop'}]}));
 }catch(error){res.destroy(error);}
});});server.on('connection',s=>{connections.add(s);s.on('close',()=>connections.delete(s));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(70);}throw Error('Timed out: '+label);}
let win,overlay;
server.listen(0,'127.0.0.1',()=>{
 const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({settingsVersion:3,inputDir:path.dirname(source),outputDir:path.join(out,'output'),translate:{apiKey:'fixture-key',endpointPreset:'custom',customBaseUrl:endpoint,model:'fixture-captions'},ui:{translateTo:'tr',translateForSpeech:false,translateEndpointPreset:'custom',translateBaseUrl:endpoint,translateModel:'fixture-captions'}}));
 require('../src/main');
 app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
 const parent=async code=>{const result=await win.webContents.executeJavaScript('(async()=>{try{'+code+'}catch(error){return {fixtureError:String(error.stack||error)}}})()',true);if(result?.fixtureError)throw Error(result.fixtureError);return result;};
 overlay=win.contentView.children.find(view=>view.webContents?.getURL().includes('assistant-overlay.html'));assert(overlay);const run=code=>overlay.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 win.setContentSize(1440,1000);win.show();win.webContents.focus();
 await parent(`await initialSettingsReady;UiLocale.set('tr',false);applyUiTheme('dark');document.body.classList.remove('media-home-active');document.getElementById('playerLayer').classList.remove('hidden');
 player.workspaceMode='browser';player.mediaKey='browser:caption-fixture';player.generation++;player.browserActiveTabId='caption-tab';player.browserPageUrl='https://www.youtube.com/watch?v=abcdefghijk';player.browserPageTitle='Kontrollü altyazı videosu';player.browserDuration=60;player.browserTime=0;player.browserWhisperRange=null;player.browserTracks=[];player.browserTabs=[{id:'caption-tab',generation:1,url:player.browserPageUrl}];
 window.fixtureTranslationOptions=[];startTranscribeSafe=async opts=>{fixtureTranslationOptions.push(opts);return {ok:true,jobId:'fixture-translation'};};document.dispatchEvent(new Event('media-context-changed'));return true`);
 await until(()=>run("return document.getElementById('suggestions').textContent.includes('Yalnız Whisper')"),'video context');
 await run("document.getElementById('bubble').click();document.getElementById('text').value='Bu videonun kaynak altyazısını bul; 5–25 saniyeyi Almancaya seslendirmeye uygun çevir.';document.getElementById('form').requestSubmit();return true");
 await until(()=>run("return !!document.querySelector('.tool-card')&&!document.querySelector('.message.loading')"),'probe/select proposal');
 assert.equal(requests.length,3);assert.equal(downloads.length,0,'Proposal alone cannot download or translate');
 assert(requests[1].messages.some(row=>row.role==='tool'&&row.content.includes('yt-auto:en-orig')));
 await run("document.querySelector('.tool-card button').click();document.getElementById('reviewConfirm').click();return true");
 await until(()=>parent('return fixtureTranslationOptions.length===1'),'actual shared translation pipeline');
 const options=await parent('return fixtureTranslationOptions[0]');assert.equal(options.translateOnly,true);assert.equal(options.translateTo,'de');assert.equal(options.translateForSpeech,true);assert.equal(options.translateCueRange,'5:25');assert.equal(options.input,source);assert(!options.youtube);
 assert.equal(downloads.length,1);assert(downloads[0].includes('--sub-lang=en'));assert(!downloads[0].some(x=>String(x).endsWith('transcribe.py')));
 assert(await parent("return document.getElementById('translateTo').value==='tr'&&!document.getElementById('translateForSpeech').checked&&player.browserWhisperRange===null"),'Saved translation language, speech preference and range remain unchanged');
 await until(()=>run("return document.querySelector('.tool-card button')?.textContent==='Kabul edildi'"),'real launch receipt');
 async function capture(name){await run("await document.fonts.ready;document.querySelector('.tool-card').scrollIntoView({block:'end'});return true");await wait(300);const bounds=await run("return {width:innerWidth,scroll:document.documentElement.scrollWidth,send:document.getElementById('send').getBoundingClientRect().bottom,height:innerHeight}");assert(bounds.scroll<=bounds.width+1&&bounds.send<=bounds.height);fs.writeFileSync(path.join(out,name+'.png'),(await overlay.webContents.capturePage()).toPNG());return bounds;}
 await capture('caption-range-speech-dark');win.setMinimumSize(0,0);win.setContentSize(720,680);await parent("UiLocale.set('en',false);applyUiTheme('light');return true");await until(()=>run("return document.documentElement.lang==='en'"),'light locale');const compact=await capture('caption-range-speech-light');
 // Complete the controlled translation seam through the actual attachment and voice UI adapters.
 const attached=await parent(`const job=player.job;window.fixtureOutputJob=job;return attachCompletedJobSubtitles({files:[${JSON.stringify(translated)}],outputs:[{path:${JSON.stringify(translated)},role:'translation',language:'de',status:'complete',total:3,completed:3,failed:0}]},job)`);
 assert(attached.loaded,attached.reason);
 assert(await parent(`return player.sub2Path===${JSON.stringify(translated)}&&player.sub2Role==='translation'&&player.cues2.some(row=>row.text.includes('Zweiter'))`),'Actual translation track is attached without replacing the source');
 await parent(`state.running=false;player.job=null;state.activeOutputJob=null;return true`);
 const configured=await parent(`return AssistantAppActions.execute('configure_voice_generation',{profile:'fast'},AssistantAppActions.snapshot())`);assert.equal(configured.status,'completed');assert.equal(voiceStarts.length,0,'Preparation cannot start synthesis');
 const voice=await parent(`return AssistantAppActions.execute('get_voice_status',{},AssistantAppActions.snapshot())`);assert(voice.voice.subtitleReady);assert.equal(voice.voice.range?.start,5);assert.equal(voice.voice.range?.end,25,'Selected caption range automatically follows into voice');
 const started=await parent(`return AssistantAppActions.execute('start_voice_generation',{},AssistantAppActions.snapshot())`);assert.equal(started.status,'accepted');assert.equal(voiceStarts.length,1);assert.equal(voiceStarts[0].srt,translated);assert.equal(voiceStarts[0].range.start,5);assert.equal(voiceStarts[0].range.end,25);
 await parent(`window.fixtureAttachCount=0;BrowserDubAudioUI.attachGenerated=async()=>{fixtureAttachCount++;return true};return true`);
 win.webContents.send('dub:event',{type:'done',id:voiceStarts[0].id,name:'controlled.wav',qualityUnavailable:true,qualityIncomplete:true,quality:{groups:[]}});
 await until(()=>parent(`return !DubGeneratorUI.assistant.state().busy`),'synthetic dub completion');
 assert(await parent(`return fixtureAttachCount===0&&document.getElementById('dubGeneratorStatus').textContent.includes('quality')`),'Missing quality remains a warning and never auto-attaches');
 // A long exact group identity must survive the public tool schema as well as the voice UI.
 const longKey=Array.from({length:100},(_,i)=>i+1).join(',');assert(longKey.length>200);
 const second=await parent(`return AssistantAppActions.execute('start_voice_generation',{sample:true},AssistantAppActions.snapshot())`);assert.equal(second.status,'accepted');assert.equal(voiceStarts.length,2);
 win.webContents.send('dub:event',{type:'done',id:voiceStarts[1].id,name:'controlled-sample.wav',sample:true,quality:{version:1,groups:[{key:longKey,group:1,text:'Controlled metadata, not acoustic proof.',status:'review',sourceStart:0,sourceEnd:10,audioStart:0,audioEnd:12,verification:{status:'not_checked'}}]}});
 await until(()=>parent(`return !DubGeneratorUI.assistant.state().busy`),'long group receipt');
 const exactGroup=await parent(`return AssistantAppActions.execute('get_voice_status',{group_id:${JSON.stringify(longKey)}},AssistantAppActions.snapshot())`);assert.equal(exactGroup.voice.groups.length,1);assert.equal(exactGroup.voice.groups[0].id,longKey);assert.equal(exactGroup.voice.groups[0].verification,'not_checked');
 assert(await parent(`const select=document.getElementById('dubQualityGroup');for(let p=select.parentElement;p&&p!==document.getElementById('dubGeneratorDialog');p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;select.scrollIntoView({block:'center',behavior:'instant'});select.focus();const b=select.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth+1`),'Exact long group stays visible in the narrow voice panel');await wait(100);fs.writeFileSync(path.join(out,'long-group-review-en-light.png'),(await win.webContents.capturePage()).toPNG());
 const whisper=await parent(`document.getElementById('dubGeneratorDialog').close();state.running=false;player.job=null;player.browserTracks=[];player.browserWhisperRange={url:currentBrowserYoutubeUrl(),range:{start:0,end:60}};const owner=AssistantAppActions.snapshot();window.fixtureWhisperOptions=null;const original=startProgressivePlayerTranscription;startProgressivePlayerTranscription=async config=>{fixtureWhisperOptions=config;player.job={backendJobId:'controlled-whisper',kind:'subtitles',running:true};};try{const result=await AssistantAppActions.execute('start_whisper',{translate:true,start:5,end:25},owner);return {result,options:fixtureWhisperOptions,ownerValid:AssistantAppActions.current(owner),saved:currentBrowserWhisperRange()};}finally{startProgressivePlayerTranscription=original;player.job=null;}`);
 assert.equal(whisper.result.status,'accepted');assert.deepEqual(whisper.options.clipRange,{start:5,end:25});assert.equal(whisper.ownerValid,true);assert.deepEqual(whisper.saved,{start:0,end:60});
 const prepared=await parent(`return AssistantAppActions.execute('open_voice_preparation',{},AssistantAppActions.snapshot())`);assert.equal(prepared.status,'completed');assert(await parent(`return document.getElementById('dubGeneratorDialog').open`),'Voice receipt requires an actually open existing window');
 await parent(`player.browserPageUrl='https://www.youtube.com/watch?v=01234567890';player.mediaKey='browser:replacement';player.generation++;return true`);
 assert((await parent(`return DubGeneratorUI.assistant.state()`)).sourceChanged,'Old voice preparation cannot move to a different video');

 const result={ok:true,out,requests:requests.length,downloads:downloads.length,options:{target:options.translateTo,range:options.translateCueRange,forSpeech:options.translateForSpeech},compact,voiceStarts:voiceStarts.length,chain:'probe → chosen captions → speech translation → attached track → inherited range → voice acceptance → missing-quality warning → source replacement',limits:'controlled probe/download/translation completion/read grant and dub engine; actual Electron IPC and renderer adapters; no live model/GPU/YouTube/audio quality'};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));for(const s of connections)s.destroy();server.close();app.exit(0);
 }).catch(async error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error.stack);try{fs.writeFileSync(path.join(out,'diagnostic.txt'),await overlay.webContents.executeJavaScript('document.body.textContent'));}catch(_){}for(const s of connections)s.destroy();server.close();app.exit(1);});
});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Native captions acceptance exceeded 60 seconds');app.exit(2);},60000).unref();
