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
 const states=[['empty',{messages:[]}],['source-details',{messages:[],openSource:true}],['conversation',{messages:[{id:'question',role:'user',text:'How does the river change the mood of this chapter?'},answer]}],['long-code',{messages:[{...answer,text:'## Controlled example\n\nThe identifier below should scroll inside the code block.\n\n```javascript\nconst source = "'+('chapter_identifier_'.repeat(65))+'";\n```\n\n'+('The earlier explanation remains readable without moving the composer. ').repeat(25)}]}],['streaming',{busy:true,canCancel:true,activity:'Reading the selected passage',phase:'reasoning',messages:[{...answer,text:answer.text+'\n\n'+('Earlier controlled evidence remains available for reading. ').repeat(24),loading:true}]}],['conversation-menu',{messages:[answer],openMenu:true}],['tool-evidence',{messages:[{...answer,text:'## Proposed translation\n\nReview the supplied excerpt before applying the suggestion.',links:[{id:'chapter',label:'Selected passage',excerpt:('The river passes the old city. ').repeat(45),translation:('Seçili kaynağın kontrollü çevirisi. ').repeat(20)}],actions:[{id:'translation',kind:'preview_translation_change',excerpt:('The supplied passage is the only evidence. ').repeat(30),translation:('Kaynağa bağlı öneri. ').repeat(20),canContinue:true,flowNote:('The completed stage is preserved. Review the next stage separately. ').repeat(15)}]}]}],['long-question',{messages:[{id:'question-long',role:'user',text:('Compare the river with the changing city and explain the supplied evidence. ').repeat(12)},answer]}]];
 for(const [width,height,locale,theme]of [[480,720,'tr','dark'],[360,600,'en','light'],[480,720,'en','light'],[360,600,'tr','dark']]){
  win.setContentSize(width,height);
  for(const [name,values]of states){
   win.webContents.send('assistant:snapshot',{...base,locale,theme,...values});await wait(80);
   await run(`document.getElementById('sourceBox').open=${!!values.openSource};document.getElementById('conversationMenu').open=${!!values.openMenu};document.getElementById('assistantWorkspace').scrollTop=0;document.getElementById('log').scrollTop=0;await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true`);await wait(250);
   if(name==='long-code')assert(await run("const log=document.getElementById('log'),code=log.querySelector('pre');log.scrollTop+=code.getBoundingClientRect().top-log.getBoundingClientRect().top-12;return code.scrollWidth>code.clientWidth&&code.clientWidth<=log.clientWidth"),'Long code scrolls inside the code block');
   if(name==='tool-evidence'){
    await run("const log=document.getElementById('log'),card=document.querySelector('.tool-card');log.scrollTop+=card.getBoundingClientRect().top-log.getBoundingClientRect().top;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true");
    fs.writeFileSync(path.join(out,`${width}-${locale}-${theme}-tool-heading.png`),(await win.webContents.capturePage()).toPNG());
    await run("const log=document.getElementById('log');log.scrollTop=log.scrollHeight;return true");
    if(phase==='after')assert(await run("const card=document.querySelector('.tool-card'),p=card.querySelector('p:not(.action-receipt)'),receipt=card.querySelector('.action-receipt'),buttons=[...card.querySelectorAll('button')];return p.scrollHeight>p.clientHeight&&receipt.scrollHeight>receipt.clientHeight&&buttons.every(n=>n.getBoundingClientRect().width<=card.clientWidth)&&card.scrollWidth<=card.clientWidth&&[...document.querySelectorAll('.source-card p,.source-card small')].every(n=>n.scrollHeight>n.clientHeight)&&buttons.every(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n})"),'Tool excerpt and receipt scroll separately while decisions wrap within the card');
   }
   if(phase==='after'&&name==='conversation')assert(await run("const heading=document.querySelector('.message.ai h3'),p=heading?.parentElement.querySelector('h3 ~ p');return heading&&p&&p.getBoundingClientRect().top-heading.getBoundingClientRect().bottom<=16"),'Markdown blank lines do not double the paragraph rhythm');
   if(name==='source-details')assert(await run("const content=document.querySelector('.source-detail-content');return !content||content.scrollHeight>content.clientHeight"),'Expanded source remains readable inside a bounded detail surface');
   const measured=await run("const box=id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,scroll:n.scrollHeight,client:n.clientHeight,width:n.clientWidth,scrollWidth:n.scrollWidth}};return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,workspace:box('assistantWorkspace'),log:box('log'),source:box('sourceBox'),suggestions:box('suggestions'),form:box('form'),send:box('send'),menu:box('conversationMenu'),empty:document.querySelector('.empty')?{height:document.querySelector('.empty').getBoundingClientRect().height,headingBottom:document.querySelector('.empty h2').getBoundingClientRect().bottom}:null}");
   measurements.push({name,width,height,locale,theme,...measured});
   assert(measured.documentWidth<=width+1,'No horizontal page overflow');assert(measured.form.bottom<=height+1,'Composer stays visible');assert(measured.log.height>=80,'Conversation remains usable');assert(measured.workspace.bottom<=measured.form.top+1,'Scrollable workspace stays above composer');if(values.messages?.length)assert(measured.log.bottom<=measured.form.top+1,'Conversation does not overlap composer');
   assert(await run("const n=document.getElementById('send'),r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n"),'Send is not covered by scrolling content');
   if(phase==='after'&&!values.messages?.length)assert(await run("const log=document.getElementById('log'),suggestions=document.getElementById('suggestions');return log.scrollHeight<=log.clientHeight+1&&suggestions.scrollHeight<=suggestions.clientHeight+1&&document.getElementById('latest').hidden"),'An empty greeting and starter actions use one workspace scroll area, without a false latest reply');
   fs.writeFileSync(path.join(out,`${width}-${locale}-${theme}-${name}.png`),(await win.webContents.capturePage()).toPNG());
   if(phase==='after'&&height===600&&name==='conversation'){
    // Native disclosure keyboard access reaches every suggestion without a clipped row.
    await run("document.getElementById('suggestionMenuLabel').focus();return true");
    const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(40);};
    await key('Space');
    assert(await run("return document.getElementById('suggestionMenu').open"),'More suggestions opens with native Space');
    await key('Tab');await key('Tab');
    assert(await run("const n=document.activeElement,r=n.getBoundingClientRect(),menu=document.getElementById('suggestionOptions').getBoundingClientRect();return n.textContent==='Compare the arguments'&&r.top>=menu.top&&r.bottom<=menu.bottom"),'Third suggestion is focusable and fully visible in the disclosure');
    fs.writeFileSync(path.join(out,`${width}-${locale}-${theme}-more-suggestions.png`),(await win.webContents.capturePage()).toPNG());
    await key('Space');
    assert(commands.some(row=>row.action==='suggestion'&&row.text==='compare'&&row.sourceToken===base.sourceToken),'Suggestion keeps its command and source identity');
    assert(await run("return !document.getElementById('suggestionMenu').open&&document.activeElement.id==='suggestionMenuLabel'"),'Activating a suggestion closes the disclosure and restores focus');
   }
   if(name==='streaming'){
    if(phase==='after'&&height===600){
     assert(measured.log.height>=210,'Short busy panel gives the answer at least 210px');
     assert(await run("return document.getElementById('suggestions').hidden&&document.getElementById('suggestions').getBoundingClientRect().height===0&&document.getElementById('sourceBox').getBoundingClientRect().height<=32"),'Busy suggestions use no space; source receipt is one line');
     await run("const text=document.getElementById('text');text.value=('A preserved draft line.\\n').repeat(40);text.dispatchEvent(new Event('input',{bubbles:true}));return true");await wait(50);
     assert(await run("const n=document.getElementById('text'),r=n.getBoundingClientRect(),cancel=document.getElementById('cancel'),c=cancel.getBoundingClientRect();return r.height<=96&&r.height>48&&n.scrollHeight>n.clientHeight&&n.value.includes('preserved draft')&&c.bottom<innerHeight&&document.elementFromPoint(c.x+c.width/2,c.y+c.height/2)===cancel&&document.getElementById('log').clientHeight>=150"),'Long draft grows within its bound, scrolls, and leaves answer/cancel visible');
     fs.writeFileSync(path.join(out,`${width}-${locale}-${theme}-streaming-long-draft.png`),(await win.webContents.capturePage()).toPNG());
     await run("const n=document.getElementById('text');n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));return true");
    }
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
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,phase,states:measurements.length,settingsCommand:true,escapeMenu:true,motionTenPercent:true,reducedMotion:true,streamScrollPreserved:true,shortPanelBudget:phase==='after',nativeSuggestionKeyboard:phase==='after',boundedDraft:phase==='after',providerCalls:0},null,2));console.log(JSON.stringify({ok:true,phase,out,states:measurements.length,providerCalls:0}));app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'error.txt'),error.stack);console.error(error);app.exit(1);});
