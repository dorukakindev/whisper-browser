'use strict';
// Real Windows Electron/main/preload, isolated synthetic library. AI output is a controlled fixture.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','media-tools',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const backup=path.join(out,'fixture.wbp');let chosen='';
dialog.showSaveDialog=async()=>({canceled:false,filePath:backup});dialog.showOpenDialog=async()=>chosen?({canceled:false,filePaths:[chosen]}):({canceled:true,filePaths:[]});
 const original=path.join(out,'Gölgelerin Arasında.mp4'),copy=path.join(out,'Gölgelerin Kopyası.mp4');
 for(const file of [original,copy]){fs.writeFileSync(file,'synthetic-media-for-hash');fs.writeFileSync(file.replace('.mp4','.tr.srt'),'\ufeff1\n00:00:00,000 --> 00:00:01,000\nÖrnek\n');}
 const seed=require('../src/media-catalog-store').createMediaCatalogStore({filePath:path.join(process.env.WHISPER_RESOURCE_SOAK_USER_DATA,'media-catalog.json')});
 const save=item=>seed.upsert(item);
 const film=save({kind:'film',title:'Gölgelerin Arasında: İstanbul’da Uzun Bir Akşam',year:2026,runtime:95,genres:['Drama','Thriller'],source:{type:'local',value:original},watchStatus:'planned'});
 save({kind:'film',title:'Kopya denetim kaydı',year:2026,runtime:92,source:{type:'local',value:copy}});
 const missing=path.join(out,'Kayıp.mp4');save({kind:'film',title:'Taşınmış kaynak',source:{type:'local',value:missing}});

require('../src/main');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await sleep(100);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'window');
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 await until(()=>run('return !!window.MediaToolsUI && !!window.MediaListening'),'new tools');await run('await initialSettingsReady;window.UiLocale.set("tr",false);applyUiTheme("dark");return true');
 win.setMinimumSize(400,500);win.setContentSize(1440,1000);win.showInactive();
 await run('window.MediaToolsUI.open("tonight");return true');await until(()=>run('if(document.querySelector(".mtx-status.mh-error"))throw Error(document.querySelector(".mtx-status").textContent);return document.querySelectorAll(".mtx-picks .mtx-section").length===3'),'tonight results');
 assert(await run('const n=document.querySelector(".mtx-field select");n.value="100";n.dispatchEvent(new Event("change"));return document.querySelectorAll(".mtx-picks .mtx-section").length===2'));
 const captures=[];
 async function capture(name){await sleep(250);await run('await document.fonts.ready;return true');const m=await run('const d=document.getElementById("mediaToolsDialog");return {w:d.clientWidth,scroll:d.scrollWidth,vh:innerHeight,height:d.getBoundingClientRect().height};');assert(await run('return document.activeElement?.closest("dialog")?.id==="mediaToolsDialog"'),'Tools must be the active modal, not hidden behind catalog');assert(m.scroll<=m.w+1,JSON.stringify(m));assert(m.height<=m.vh,JSON.stringify(m));fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());captures.push({name,...m});}
 await capture('tonight-dark');
 const progress=await run(`const r=await window.api.mediaCatalog({action:'play',id:${JSON.stringify(film.id)}});if(!r.ok)throw Error(r.error);return window.api.updateWatchItem({...r.watchItem,position:3600,duration:5700,lastWatched:Date.now()})`);assert(progress.ok,progress.error);
 await run('window.MediaToolsUI.open("tonight");return true');await until(()=>run('return !!document.querySelector(".mtx-picks")'),'progress-aware picks');
 await run('const n=document.querySelector(".mtx-body select");n.value="50";n.dispatchEvent(new Event("change"));return true');
 assert(await run('return document.querySelectorAll(".mtx-picks .mtx-section").length===1 && document.querySelector(".mtx-picks").textContent.includes("35 dk kaldı") && document.querySelector(".mtx-picks button").textContent.includes("devam")'),'50-minute budget admits 35 remaining minutes of a 95-minute film');await capture('tonight-remaining-dark');
 await run('const n=document.querySelector(".mtx-body select");n.value="100";n.dispatchEvent(new Event("change"));return true');

 await run(`await window.MediaCatalogUI.open({id:${JSON.stringify(film.id)}});[...document.querySelectorAll('.mc-detail-actions button')].find(n=>n.textContent.includes('Yorumlar')).click();return true`);await until(()=>run('return !!document.querySelector(".mtx-body textarea")'),'decision form');
 await run(`document.querySelector('.mtx-body textarea').value=${JSON.stringify(JSON.stringify([{id:'7',text:'The acting is compelling, while the pacing feels slow.'}]))};window.fixturePrompts=[];translationEndpointReady=()=>true;aiChatSend=async prompt=>{window.fixturePrompts.push(prompt);const context=globalAssistantContext();document.dispatchEvent(new CustomEvent('assistant-answer',{detail:{context,text:JSON.stringify({summary:'Acting praised; pacing criticized.',fit:'Tempo matters to the viewer; evidence is limited.',points:[{id:'7',quote:'The acting is compelling',reason:'Specific praise for acting.',kind:'praise'}]})}}));};return true`);
 await run('const areas=document.querySelectorAll(".mtx-body textarea");areas[0].dispatchEvent(new Event("input"));areas[1].value="Kaybolmaması gereken kişisel yorumum.";areas[1].dispatchEvent(new Event("input"));const url=document.querySelector(".mtx-body input[type=url]");url.value="https://letterboxd.com/film/fixture/reviews/";url.dispatchEvent(new Event("input"));const check=document.querySelector(".mtx-body input[type=checkbox]");check.checked=true;check.dispatchEvent(new Event("change"));document.querySelectorAll(".mtx-tabs button")[1].click();return true');
 await until(()=>run('return !!document.querySelector(".mtx-picks")'),'tonight return');assert.equal(await run('return document.querySelector(".mtx-body select").value'),'100','Picker filter survives navigation');
 await run('document.querySelector(".mtx-tabs button").click();return true');await until(()=>run('return document.querySelectorAll(".mtx-body textarea").length===2'),'restored review draft');
 assert(await run('return document.querySelectorAll(".mtx-body textarea")[1].value==="Kaybolmaması gereken kişisel yorumum." && document.querySelector(".mtx-body input[type=checkbox]").checked && document.querySelector(".mtx-body input[type=url]").value.includes("fixture/reviews/") && document.querySelector(".mtx-body textarea").value.includes("compelling")'),'Unsaved reviews, feedback, spoiler option and URL survive tabs');
 await run('document.querySelector("[data-review-action=preview]").click();return true');await until(()=>run('return !!document.querySelector(".mrv-sample .mh-primary")'),'preview');
 await run('document.querySelector(".mtx-preview .mh-primary").click();return true');await sleep(100);assert.equal(await run("return fixturePrompts.length"),0,"No AI request before title/year confirmation");
 await run('document.querySelector(".mtx-preview input[type=checkbox]").checked=true;document.querySelector(".mtx-preview .mh-primary").click();return true');await until(()=>run('return !![...document.querySelectorAll(".mtx-body button")].find(n=>n.textContent.includes("Alıntıları doğrula"))'),'AI controlled result');
 await run('const buttons=[...document.querySelectorAll(".mtx-body button")];buttons.find(n=>n.textContent.includes("Alıntıları doğrula")).click();return true');await until(()=>run('return !!document.querySelector(".mtx-history")'),'verified saved result');
 assert.equal(await run('return fixturePrompts.length'),1);await capture('decision-dark');
 await run('window.MediaToolsUI.open("health");document.querySelector(".mtx-body .mh-primary").click();return true');await until(()=>run('return document.querySelector(".mtx-body progress").dataset.state==="done"'),'health finished');
 assert.equal(await run('return document.querySelectorAll(".mtx-health .mtx-section").length'),3);assert(await run('return document.querySelector(".mtx-health").textContent.includes("Birebir kopya")'));await capture('health-dark');
 await run('window.MediaToolsUI.open("backup");return true');await until(()=>run('return document.querySelectorAll(".mtx-body .mtx-section").length===2'),'backup');
 await run('document.querySelector(".mtx-body .mh-primary").click();return true');await until(()=>fs.existsSync(backup),'backup written');await capture('backup-dark');
 chosen=backup;await run('document.querySelectorAll(".mtx-body .mtx-section")[0].querySelectorAll("button")[1].click();return true');
 await until(()=>run('return !!document.querySelector(".mc-package") || !![...document.querySelectorAll("#mediaCatalogDialog button")].find(n=>n.textContent.includes("Geri yüklenecek"))'),'restore screen');
 await run('document.getElementById("mediaCatalogDialog").close();window.MediaToolsUI.open("audio");return true');await until(()=>run('return document.querySelectorAll(".mtx-body select").length===3'),'audio profiles');await capture('audio-dark');
 for(const [width,theme,locale]of [[700,'dark','tr'],[940,'light','en']]){win.setContentSize(width,900);await run(`document.getElementById('mediaToolsDialog').close();window.UiLocale.set('${locale}',false);applyUiTheme('${theme}');window.MediaToolsUI.open('decision',${JSON.stringify(film)});return true`);await until(()=>run('return !!document.querySelector(".mtx-history")'),'responsive decision');await capture('decision-'+width+'-'+theme);}
 const view=win.contentView.children.find(v=>v.webContents?.getURL().includes('assistant-overlay.html'));assert(view,'real native assistant view');
 view.webContents.send('assistant:snapshot',{locale:'tr',theme:'dark',conversation:'fixture',context:'Kontrollü asistan',messages:[{role:'user',text:'Nasıl bir film izleyebilirim?'},{role:'ai',text:'Kendi arşivindeki süre ve tür eşleşmelerini inceleyebilirsin.'}],suggestions:[]});
 await sleep(150);await view.webContents.executeJavaScript('document.getElementById("bubble").click();document.querySelector(".message.ai .message-actions button:nth-child(2)").click();document.getElementById("pinned").click();true',true);
 assert.equal(await view.webContents.executeJavaScript('document.querySelectorAll(".message:not([hidden])").length'),1);
 view.webContents.send('assistant:snapshot',{locale:'tr',theme:'dark',conversation:'fixture',messages:[],suggestions:[]});await sleep(100);assert.equal(await view.webContents.executeJavaScript('document.querySelectorAll(".message[data-archived]").length'),1,'Pinned answer remains accessible after the current conversation is cleared');
 fs.writeFileSync(path.join(out,'assistant-tools.png'),(await view.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({ok:true,captures,ai:'controlled fixture; no live provider'},null,2));console.log(JSON.stringify({ok:true,out,captures}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
