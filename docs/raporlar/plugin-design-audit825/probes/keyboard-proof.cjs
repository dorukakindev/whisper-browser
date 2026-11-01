const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),out=path.join(root,'.uiprev','keyboard825-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:360,height:600,useContentSize:true,show:false,webPreferences:{preload:path.join(root,'src/assistant-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(root,'src/renderer/assistant-overlay.html'));win.show();win.focus();win.webContents.focus();
 const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true),rows=[];
 const base={opened:true,locale:'en',theme:'light',sourceToken:'synthetic:keyboard825',sourcePreview:{summary:'Controlled text',attached:true},context:'Controlled keyboard audit',threads:[{id:'one',title:'Controlled review'}],activeThread:'one',conversation:'keyboard825',suggestions:[{id:'one',label:'Explain the selected text',direct:true},{id:'two',label:'Summarize the selected text',direct:true},{id:'three',label:'Compare the arguments',direct:true}]};
 const key=async k=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:k});win.webContents.sendInputEvent({type:'keyUp',keyCode:k});await wait(120)};
 for(const mode of ['busy-log','code']){
  win.webContents.send('assistant:snapshot',{...base,busy:mode==='busy-log',canCancel:mode==='busy-log',messages:[{id:'a',role:'ai',loading:mode==='busy-log',text:mode==='code'?'```javascript\nconst value = "'+('long_identifier_'.repeat(100))+'";\n```':('A long controlled response preserves the earlier passage. ').repeat(100)}]});await wait(250);
  const selector=mode==='code'?'pre':'#log';await run(`const n=document.querySelector('${selector}');n.scrollIntoView({block:'center'});n.scrollTop=0;n.scrollLeft=0;n.focus();return true`);
  const get=()=>run(`const n=document.querySelector('${selector}');return {active:document.activeElement===n,tag:document.activeElement.tagName,id:document.activeElement.id,scrollTop:n.scrollTop,scrollLeft:n.scrollLeft,clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,tabIndex:n.tabIndex}`);
  const before=await get();await key(mode==='code'?'Right':'Down');const after=await get();rows.push({mode,before,after});fs.writeFileSync(path.join(out,mode+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 fs.writeFileSync(path.join(out,'native-keys.json'),JSON.stringify(rows,null,2));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack);app.exit(1)});setTimeout(()=>app.exit(2),30000).unref();
