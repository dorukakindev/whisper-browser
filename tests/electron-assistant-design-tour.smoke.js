'use strict';
// Isolated native renderer layout tour; synthetic snapshots, no account or provider.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),phase=process.argv.includes('--before')?'before':'after',out=path.join(root,'.uiprev','assistant-design-tour',Date.now()+'-'+phase);
fs.mkdirSync(path.join(out,'profile'),{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),commands=[],measurements=[];
let win;
ipcMain.on('assistant:action',(event,packet)=>{if(event.sender===win?.webContents)commands.push(packet);});
app.whenReady().then(async()=>{
 win=new BrowserWindow({width:480,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(root,'src/assistant-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await win.loadFile(path.join(root,'src/renderer/assistant-overlay.html'));win.showInactive();win.webContents.setBackgroundThrottling(false);
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
 const base={opened:true,busy:false,canCancel:false,phase:'waiting',sourceToken:'synthetic:chapter',conversation:'synthetic',context:'The river and the city · Chapter 4',model:'deepseek-ai/DeepSeek-V4.1-Flash-1017',sourcePreview:{summary:'Selected chapter · 1,280 words',detail:'Only the selected chapter and your chosen passage are available. The entire book is not supplied.'},sourceDescription:'This chapter follows the river through the old city.\nOnly the supplied passage is evidence. Your saved voice and provider settings are unchanged.',transcriptScope:false,pageContext:false,messages:[],suggestions:[{id:'summary',label:'Summarize the chapter',direct:true},{id:'explain',label:'Explain this passage',direct:true},{id:'compare',label:'Compare the arguments',direct:true}],threads:[{id:'first',title:'A closer look at this chapter'}],activeThread:'first'};
 const answer={id:'answer',role:'ai',text:'## A city shaped by the river\n\nThe passage connects the city’s changing character with the river. It contrasts the busy quays with the quiet streets, using concrete details rather than a broad historical claim.\n\n- The river carries the chapter’s movement.\n- Street sounds create a quieter counterpoint.\n\nThis interpretation concerns the selected passage.'};
 const states=[['empty',{messages:[]}],['source-details',{messages:[],openSource:true}],['conversation',{messages:[{id:'question',role:'user',text:'How does the river change the mood of this chapter?'},answer]}],['long-code',{messages:[{...answer,text:'## Controlled example\n\nThe identifier below should scroll inside the code block.\n\n```javascript\nconst source = "'+('chapter_identifier_'.repeat(65))+'";\n```\n\n'+('The earlier explanation remains readable without moving the composer. ').repeat(25)}]}],['streaming',{busy:true,canCancel:true,activity:'Reading the selected passage',phase:'reasoning',messages:[{...answer,loading:true}]}],['conversation-menu',{messages:[answer],openMenu:true}]];
 for(const [width,height,locale,theme]of [[480,720,'tr','dark'],[360,600,'en','light'],[480,720,'en','light'],[360,600,'tr','dark']]){
  win.setContentSize(width,height);
  for(const [name,values]of states){
   win.webContents.send('assistant:snapshot',{...base,locale,theme,...values});await wait(80);
   await run(`document.getElementById('sourceBox').open=${!!values.openSource};document.getElementById('conversationMenu').open=${!!values.openMenu};document.getElementById('assistantWorkspace').scrollTop=0;document.getElementById('log').scrollTop=0;await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true`);await wait(250);
   if(name==='long-code')assert(await run("const log=document.getElementById('log'),code=log.querySelector('pre');log.scrollTop+=code.getBoundingClientRect().top-log.getBoundingClientRect().top-12;return code.scrollWidth>code.clientWidth&&code.clientWidth<=log.clientWidth"),'Long code scrolls inside the code block');
   if(name==='source-details')assert(await run("const content=document.querySelector('.source-detail-content');return !content||content.scrollHeight>content.clientHeight"),'Expanded source remains readable inside a bounded detail surface');
   const measured=await run("const box=id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,scroll:n.scrollHeight,client:n.clientHeight,width:n.clientWidth,scrollWidth:n.scrollWidth}};return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,workspace:box('assistantWorkspace'),log:box('log'),source:box('sourceBox'),form:box('form'),send:box('send'),menu:box('conversationMenu'),empty:document.querySelector('.empty')?{height:document.querySelector('.empty').getBoundingClientRect().height,headingBottom:document.querySelector('.empty h2').getBoundingClientRect().bottom}:null}");
   measurements.push({name,width,height,locale,theme,...measured});
   assert(measured.documentWidth<=width+1,'No horizontal page overflow');assert(measured.form.bottom<=height+1,'Composer stays visible');assert(measured.log.height>=80,'Conversation remains usable');assert(measured.workspace.bottom<=measured.form.top+1,'Scrollable workspace stays above composer');if(values.messages?.length)assert(measured.log.bottom<=measured.form.top+1,'Conversation does not overlap composer');
   assert(await run("const n=document.getElementById('send'),r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n"),'Send is not covered by scrolling content');
   if(phase==='after'&&!values.messages?.length)assert(await run("const log=document.getElementById('log'),suggestions=document.getElementById('suggestions');return log.scrollHeight<=log.clientHeight+1&&suggestions.scrollHeight<=suggestions.clientHeight+1&&document.getElementById('latest').hidden"),'An empty greeting and starter actions use one workspace scroll area, without a false latest reply');
   fs.writeFileSync(path.join(out,`${width}-${locale}-${theme}-${name}.png`),(await win.webContents.capturePage()).toPNG());
   if(name==='streaming'){
    const continued={...base,locale,theme,...values,messages:[{...values.messages[0],text:values.messages[0].text+'\n\n'+('Later controlled text. ').repeat(30)}]};
    await run("document.getElementById('log').scrollTop=0;return true");win.webContents.send('assistant:snapshot',continued);await wait(100);
    assert(await run("return document.getElementById('log').scrollTop<2"),'Reading earlier text is preserved during a controlled stream');
   }
  }
 }
 // Keyboard access and existing command boundary remain intact.
 await run("document.getElementById('sourceBox').open=true;document.getElementById('assistantSettings').focus();document.getElementById('assistantSettings').click();return true");await wait(40);assert(commands.some(row=>row.action==='settings'));
 await run("document.getElementById('conversationMenu').open=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true");assert(await run("return !document.getElementById('conversationMenu').open&&document.activeElement.id==='conversationMenuLabel'"));
 win.webContents.send('assistant:snapshot',{...base,locale:'tr',theme:'dark',busy:true,canCancel:true,phase:'reasoning',activity:'Kontrollü kaynak incelemesi',messages:[{...answer,loading:true}]});await wait(150);
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Animation.enable');await win.webContents.debugger.sendCommand('Animation.setPlaybackRate',{playbackRate:.1});
 const motionStart=await run("return document.querySelector('.orbit-arc').getAnimations()[0]?.currentTime");await wait(300);const motionEnd=await run("return document.querySelector('.orbit-arc').getAnimations()[0]?.currentTime");assert(motionEnd>motionStart&&motionEnd-motionStart<150,'Existing activity motion inspected at ten percent playback');
 fs.writeFileSync(path.join(out,'motion-ten-percent.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert(await run("return getComputedStyle(document.querySelector('.orbit-arc')).animationName==='none'"));win.webContents.debugger.detach();
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,phase,states:measurements.length,settingsCommand:true,escapeMenu:true,motionTenPercent:true,reducedMotion:true,streamScrollPreserved:true,providerCalls:0},null,2));console.log(JSON.stringify({ok:true,phase,out,states:measurements.length,providerCalls:0}));app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error);app.exit(1);});
