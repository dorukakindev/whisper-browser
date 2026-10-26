'use strict';
// Native Windows main/renderer/overlay; local HTTP tool model and controlled media helper.
// No live YouTube, Whisper, paid model or GPU claim.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant-captions',Date.now()+'-'+process.pid),profile=path.join(out,'profile'),source=path.join(out,'input','Türkçe kaynak.srt');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(path.dirname(source),{recursive:true});fs.mkdirSync(path.join(out,'output'),{recursive:true});
fs.writeFileSync(source,'\ufeff1\n00:00:01,000 --> 00:00:03,000\nFirst sentence.\n\n2\n00:00:06,000 --> 00:00:09,000\nSecond sentence.\n\n3\n00:00:20,000 --> 00:00:26,000\nLast sentence.\n');
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=profile;app.setAppPath(root);for(const flag of ['disable-gpu','disable-backgrounding-occluded-windows','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
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
 const parent=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
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
 await parent('state.running=false;player.job=null;return true');
 const result={ok:true,out,requests:requests.length,downloads:downloads.length,options:{target:options.translateTo,range:options.translateCueRange,forSpeech:options.translateForSpeech},compact,limits:'controlled probe/media helper/process; real shared renderer pipeline and local HTTP; no live model/GPU/YouTube'};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));for(const s of connections)s.destroy();server.close();app.exit(0);
 }).catch(async error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error.stack);try{fs.writeFileSync(path.join(out,'diagnostic.txt'),await overlay.webContents.executeJavaScript('document.body.textContent'));}catch(_){}for(const s of connections)s.destroy();server.close();app.exit(1);});
});
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout.txt'),'Native captions acceptance exceeded 60 seconds');app.exit(2);},60000).unref();
