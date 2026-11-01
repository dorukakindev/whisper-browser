const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),out=path.join(root,'.uiprev','modal825-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated audit; external requests disabled')};require(path.join(root,'src/main'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let win;for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());if(win)break;await wait(100)}if(!win)throw Error('No main window');
 win.setMinimumSize(0,0);win.showInactive();const run=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()',true);await run('await initialSettingsReady;return true');
 const rows=[];for(const [width,height,zoom] of [[1440,1000,1],[800,900,1.25],[520,640,1]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await run("applyUiTheme('dark');UiLocale.set('tr',false);await AppSettingsUI.open('ai');return true");await wait(200);
  const measure=()=>run("return {viewport:{width:innerWidth,height:innerHeight},root:{scrollHeight:document.scrollingElement.scrollHeight,clientHeight:document.scrollingElement.clientHeight,scrollTop:document.scrollingElement.scrollTop},dialog:appSettingsDialog.getBoundingClientRect().toJSON(),content:document.querySelector('.aps-content').getBoundingClientRect().toJSON(),contentScroll:document.querySelector('.aps-content').scrollTop}");
  const before=await measure();win.webContents.sendInputEvent({type:'mouseWheel',x:4,y:Math.round(height/2),deltaX:0,deltaY:500,canScroll:true});await wait(180);const after=await measure();
  rows.push({width,height,zoom,before,after});fs.writeFileSync(path.join(out,width+'-settings.png'),(await win.webContents.capturePage()).toPNG());await run('AppSettingsUI.close();return true');
 }
 fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({out,states:rows.length}));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack);app.exit(1)});setTimeout(()=>app.exit(2),50000).unref();
