// Ağ taklidi olmadan, ayrı profil ile herkese açık sayfalarda sınırlı canlı kontrol.
// electron tests/electron-browser-public-sites.smoke.js
const {app,BrowserWindow,webContents}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','public-sites-'+Date.now());
fs.mkdirSync(out,{recursive:true});
process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');
app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const result=await fn();if(result)return result;await wait(250);}return null;}
app.whenReady().then(async()=>{
 const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading()));
 if(!win)throw Error('Uygulama hazır olmadı');
 const run=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
 await run(`await initialSettingsReady;openPlayer();setWorkspaceMode('browser',false);setBrowserCaptureEnabled(true,false)`);
 await until(()=>run(`return player.browserActiveTabId&&!player.browserWorkspaceShowBusy`));
 const results=[];
 for(const url of ['https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4','https://www.youtube.com/watch?v=aqz-KE-bpKQ']){
  let timer;
  try{
   const navigation=await Promise.race([run(`document.getElementById('browserAddress').value=${JSON.stringify(url)};return await navigateBrowserFromAddress()`),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:'30 saniyede yüklenmedi'}),30000)})]);
   clearTimeout(timer);
   const page=webContents.getAllWebContents().find(w=>w.getURL().startsWith(new URL(url).origin));
   const media=page?await until(()=>page.executeJavaScript(`(()=>{const v=document.querySelector('video');return v&&v.readyState>=2?{readyState:v.readyState,duration:Number.isFinite(v.duration)?v.duration:null,width:v.videoWidth}:null})()`),8000):null;
   let playback=false,seek=false;
   if(media){
    await page.executeJavaScript(`document.querySelector('video').muted=true;document.querySelector('video').play().catch(()=>{})`);
    playback=!!await until(()=>page.executeJavaScript(`document.querySelector('video').currentTime>.3&&!document.querySelector('video').paused`),5000);
    await run(`await browserCommand('pause');await browserCommand('seek',1)`);
    seek=!!await until(()=>page.executeJavaScript(`Math.abs(document.querySelector('video').currentTime-1)<.3`),3000);
   }
   const trackCount=await run(`return player.browserTracks.length`);
   results.push({url,navigation:{ok:!!navigation?.ok,error:navigation?.error||null},media,playback,seek,trackCount});
  }catch(error){clearTimeout(timer);results.push({url,error:String(error.message).replaceAll(root,'[repo]')});}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 }
 console.log(JSON.stringify({report:path.relative(root,path.join(out,'report.json')),results},null,2));app.quit();
}).catch(error=>{console.error(error.message);app.exit(1);});
